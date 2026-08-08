"""Eval harness core (issue #10, Session 6): real Layout-IoU + M3 judges.

Replaces the Session 5 border-adherence STAND-IN with the real structural
metric while keeping both (border adherence stays the cheap in-stage
accept/retry signal; Layout-IoU is the scored metric):

- ``layout_iou``: seeded region extraction — flood-fill from each compiled
  panel's interior on a binarized barrier map of the art, then IoU of the
  detected region vs the authored polygon mask. Seeded on purpose: the
  compiled geometry is trusted input (blind panel detection is Magi's job,
  deferred — see module notes), and a border GAP shows up as fill leakage
  → low IoU, exactly the defect class the metric must catch.
- ``judge_page``: one M3 vision call per page scoring the issue #10
  rubrics (readability, fidelity to must_preserve claims, craft) with a
  VERSIONED prompt; the caller persists the provider receipt.
- ``build_scorecard``: assembles the per-page metric rows + totals into a
  diffable scorecard payload (eval-scorecard.v1 schema string; registry
  promotion follows the first cross-language consumer, the S5 pattern).

Magi (the independent parses-as-manga critic) is DEFERRED with reasons:
torch+transformers are already in the venv, but the checkpoint is a
multi-GB download and requires trust_remote_code — an owner-reviewed
security decision under the standing worker-egress posture, not a
mid-session default.

The harness never mutates scored artifacts (issue #10 non-goal); it only
APPENDS receipts and scorecards.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable

from PIL import Image, ImageDraw

from app.contracts.manga import CompiledPageLayout
from app.services.manga_page_art import render_panel_masks

EVAL_HARNESS_VERSION = "manga-eval-harness.v1"
LAYOUT_IOU_VERSION = "layout-iou.v1"
JUDGE_RUBRIC_VERSION = "m3-judge-rubrics.v1"

#: Ink threshold for the barrier map (matches border-adherence darkness).
IOU_BARRIER_THRESHOLD = 120
#: Flood-fill paint value on the L-mode canvas (distinct from 0/255).
IOU_FILL_VALUE = 128
#: Interior seed offsets (fractions of the panel bbox) tried in order until
#: one lands off-ink — panels can carry dark art at their exact centroid.
IOU_SEED_OFFSETS = ((0.5, 0.5), (0.35, 0.35), (0.65, 0.35), (0.35, 0.65), (0.65, 0.65), (0.5, 0.25))

JUDGE_SYSTEM_PROMPT = (
    "You are a strict manga editorial judge. You will see one composed "
    "manga page plus the story beats and the claims the page must "
    "preserve. Score honestly; a beautiful page that drops the source's "
    "claims fails fidelity. Respond with ONLY a JSON object: "
    '{"readability": <1-5, does the page communicate its story in reading '
    'order?>, "fidelity": {"score": <1-5>, "claims_conveyed": <int, how '
    "many of the listed must-preserve claims a reader would actually take "
    'away>, "claims_total": <int>}, "craft": {"page_turn_hook": <1-5>, '
    '"shot_variety": <1-5>, "text_density_comfort": <1-5>}, '
    '"notes": <short string>}'
)


@dataclass(frozen=True)
class LayoutIouResult:
    page_iou: float
    panel_ious: dict[str, float]
    seeded_panels: int
    metric_version: str = LAYOUT_IOU_VERSION


@dataclass
class PageScore:
    page_index: int
    layout_iou: LayoutIouResult | None = None
    border_adherence_score: float | None = None
    ocr_clean: bool | None = None
    judge: dict[str, Any] | None = None
    judge_cost_usd: float = 0.0
    notes: list[str] = field(default_factory=list)


def _binary_barrier(image: Image.Image) -> Image.Image:
    """L-mode canvas: ink (dark) pixels are 0 walls, everything else 255."""
    gray = image.convert("L")
    return gray.point(lambda value: 0 if value < IOU_BARRIER_THRESHOLD else 255)


def _seed_point(
    barrier: Image.Image, compiled_panel, width: int, height: int
) -> tuple[int, int] | None:
    pixels = barrier.load()
    bbox = compiled_panel.bbox
    for fx, fy in IOU_SEED_OFFSETS:
        x = int((bbox.x + bbox.width * fx) * width)
        y = int((bbox.y + bbox.height * fy) * height)
        x = min(max(x, 0), width - 1)
        y = min(max(y, 0), height - 1)
        if pixels[x, y] == 255:
            return (x, y)
    return None


def layout_iou(
    page_image: Image.Image, compiled: CompiledPageLayout
) -> LayoutIouResult:
    """Real Layout-IoU: detected drawn-panel region vs authored polygon.

    Per panel: flood-fill the barrier map from an interior seed; the
    painted region is the panel the ART actually encloses. IoU against
    the authored polygon mask. A merged/missing border lets the fill leak
    into the neighbour → union explodes → IoU drops. A perfectly drawn
    border scores near 1.0 (gutter widths cost a few percent).
    """
    width, height = page_image.size
    masks = render_panel_masks(compiled, width=width, height=height)
    panel_ious: dict[str, float] = {}
    seeded = 0
    for panel in compiled.panels:
        canvas = _binary_barrier(page_image)
        seed = _seed_point(canvas, panel, width, height)
        if seed is None:
            panel_ious[panel.panel_id] = 0.0
            continue
        seeded += 1
        ImageDraw.floodfill(canvas, seed, IOU_FILL_VALUE)
        detected = canvas.point(lambda value: 255 if value == IOU_FILL_VALUE else 0)
        authored = masks[panel.panel_id]
        detected_data = detected.getdata()
        authored_data = authored.getdata()
        intersection = 0
        union = 0
        for d_value, a_value in zip(detected_data, authored_data):
            d_on = d_value != 0
            a_on = a_value != 0
            if d_on and a_on:
                intersection += 1
            if d_on or a_on:
                union += 1
        panel_ious[panel.panel_id] = intersection / union if union else 0.0
    page = sum(panel_ious.values()) / len(panel_ious) if panel_ious else 0.0
    return LayoutIouResult(page_iou=page, panel_ious=panel_ious, seeded_panels=seeded)


async def judge_page(
    vision: Callable[..., Awaitable[dict[str, Any]]],
    *,
    image_path: Path,
    briefs: str,
    must_preserve: list[str],
    expected_panel_count: int,
) -> dict[str, Any]:
    """One M3 judge call (rubrics versioned); returns the raw vision result
    (parsed + usage + cost) for the caller to receipt and score."""
    claims = "\n".join(f"- {claim}" for claim in must_preserve) or "- (none listed)"
    return await vision(
        image_path=image_path,
        briefs=(
            f"STORY BEATS (reading order):\n{briefs}\n\n"
            f"MUST-PRESERVE CLAIMS:\n{claims}\n\n"
            f"Rubric version: {JUDGE_RUBRIC_VERSION}"
        ),
        expected_panel_count=expected_panel_count,
        system_prompt=JUDGE_SYSTEM_PROMPT,
    )


def build_scorecard(
    *,
    project_id: str,
    run_id: str,
    lane: str,
    subject: str,
    pages: list[PageScore],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    scored_iou = [p.layout_iou.page_iou for p in pages if p.layout_iou is not None]
    judges = [p.judge for p in pages if p.judge]
    payload: dict[str, Any] = {
        "schema_version": "eval-scorecard.v1",
        "harness_version": EVAL_HARNESS_VERSION,
        "layout_iou_version": LAYOUT_IOU_VERSION,
        "judge_rubric_version": JUDGE_RUBRIC_VERSION,
        "project_id": project_id,
        "run_id": run_id,
        "lane": lane,
        "subject": subject,
        "pages": [
            {
                "page_index": page.page_index,
                "layout_iou": (
                    {
                        "page_iou": page.layout_iou.page_iou,
                        "panel_ious": page.layout_iou.panel_ious,
                        "seeded_panels": page.layout_iou.seeded_panels,
                        "metric_version": page.layout_iou.metric_version,
                    }
                    if page.layout_iou
                    else None
                ),
                "border_adherence_score": page.border_adherence_score,
                "ocr_clean": page.ocr_clean,
                "judge": page.judge,
                "judge_cost_usd": page.judge_cost_usd,
                "notes": page.notes,
            }
            for page in pages
        ],
        "totals": {
            "mean_layout_iou": (
                sum(scored_iou) / len(scored_iou) if scored_iou else None
            ),
            "judged_pages": len(judges),
            "judge_cost_usd": sum(page.judge_cost_usd for page in pages),
        },
    }
    if extra:
        payload["extra"] = extra
    return payload
