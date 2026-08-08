"""Lane-C page-art mechanics (issue #12 verdict wired into #5/#7).

Session 5 NEW code — the deterministic half of the rendering mechanism:

- ``rendering_mode_for_page``: the per-page rendering-mode DECISION IS CODE
  (issue #12 non-goal: no LLM choosing modes). Mix per the lane-C findings:
  lane A for quiet dialogue pages, lane C (conditioned full-page inking) for
  standard pages, lane B (budgeted key panel) for splash/spread money shots.
- ``render_conditioning_skeleton``: the compiled-layout skeleton PNG that
  conditions the one lane-C image call — thick borders + large read-order
  badges per the findings' production guardrail 1 (the spike's thin-border
  skeleton lost the bottom row to a panel merge).
- ``render_panel_masks``: per-panel masks from compiled polygons (the
  polygon->mask export deferred by the Session 4 template library; feeds
  slicing + per-panel QA crops).
- ``ocr_gate``: production OCR gate with the screentone-noise filter the
  spike proved necessary (dictionary words + min confidence + min word
  count — the raw gate false-positives on tones/speedlines: "Nel", "SZ,").
- ``border_adherence``: samples the generated art along every compiled
  panel border and measures how much of the skeleton's frame survived.
  This is deliberately NOT Layout-IoU (issue #10 owns real metrics /
  Session 6); it is a cheap deterministic accept/retry signal.
- ``compose_lettered_page``: v2 composition — deterministic frame strokes +
  ALL text rendered by code (bubbles, captions, SFX) over text-free art,
  driven by the authored ``TextElement`` set (page-normalized regions, the
  ported SVG renderer's convention).

Everything here is pure PIL + subprocess-tesseract; no provider calls, no
Mongo. The durable stage driver lives in ``manga_page_art_stage.py``.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from PIL import Image, ImageDraw, ImageFont

from app.contracts.manga import CompiledPageLayout, MangaPagePlan, PageScript

logger = logging.getLogger(__name__)

PAGE_ART_VERSION = "manga-page-art.v1"

#: ADR-001 / issue #7 rule: ONE image model, no silent fallback.
PAGE_ART_MODEL = "google/gemini-2.5-flash-image"
#: Planning figure from the lane-C receipts ($0.0390/page measured);
#: receipts always carry actuals.
PAGE_ART_COST_PER_IMAGE_USD = 0.039

#: Default lane-C canvas (the spike's 2:3 832x1248 class).
SKELETON_WIDTH = 832
SKELETON_HEIGHT = 1248
SKELETON_BORDER_PX = 10
BADGE_RADIUS_PX = 34

#: OCR gate policy (findings guardrail 3).
OCR_MIN_CONFIDENCE = 60.0
OCR_MIN_WORD_LENGTH = 3
OCR_MIN_WORD_COUNT = 2

#: Border-adherence accept threshold: fraction of sampled border points that
#: are ink-dark in the generated page. The conditioned spike pages held 6/7
#: panel borders; a merged panel loses its whole shared edge, which drops
#: the page score well below this line.
BORDER_ADHERENCE_MIN = 0.55
BORDER_DARKNESS_THRESHOLD = 120
BORDER_SAMPLES_PER_EDGE = 24
BORDER_SAMPLE_WINDOW = 4

RenderingMode = Literal["A", "B", "C"]

#: Minimal built-in fallback dictionary for the OCR gate when the system
#: wordlist is unavailable. Real lettering is English prose; screentone
#: noise is not. Includes the historically observed defect words.
FALLBACK_DICTIONARY = frozenset(
    """
    a about after again all and are around away back been before big but came
    can chapter cheese come could day did down empty end even every eyes face
    find first for from get go going gone good had hand has have haw he head
    hem her here him his how i if in into is it just know last left like
    little long look made make man maze mice more mouse moved much must my
    never new no not now of off old on once one only or other our out over
    page right run said saw see she small so some station still story that
    the their them then there they think this time to too two up wall want
    was way we well went were what when where which who will with would you
    your
    """.split()
)


# ---------------------------------------------------------------------------
# rendering-mode policy (deterministic, code-owned)
# ---------------------------------------------------------------------------


def rendering_mode_for_page(page_script: PageScript) -> RenderingMode:
    """Deterministic per-page rendering mode (issue #12 default mix).

    - B: splash / spread pages — the money shots worth a high-quality
      budgeted key panel (findings: "B high-quality key panel for
      splash/page-turn money shots").
    - A: quiet dialogue pages — every panel holds (tempo=hold) and none is
      an action panel; sprites + vector scenes carry these for ~$0.
    - C: everything else — conditioned full-page inking, the default for
      standard pages per the lane-C verdict.
    """
    if page_script.page_kind != "standard":
        return "B"
    panels = page_script.panels
    if all(panel.tempo == "hold" for panel in panels) and not any(
        panel.purpose == "action" for panel in panels
    ):
        return "A"
    return "C"


# ---------------------------------------------------------------------------
# conditioning skeleton + masks
# ---------------------------------------------------------------------------


def _load_font(size: int) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    for candidate in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Comic Sans MS.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _polygon_pixels(
    panel_polygon, width: int, height: int
) -> list[tuple[float, float]]:
    return [(point.x * width, point.y * height) for point in panel_polygon]


def render_conditioning_skeleton(
    compiled: CompiledPageLayout,
    *,
    width: int = SKELETON_WIDTH,
    height: int = SKELETON_HEIGHT,
    border_px: int = SKELETON_BORDER_PX,
) -> Image.Image:
    """The lane-C conditioning input: hard black borders + big read badges."""
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    badge_font = _load_font(int(BADGE_RADIUS_PX * 1.2))
    for panel in sorted(compiled.panels, key=lambda item: item.read_rank):
        points = _polygon_pixels(panel.polygon, width, height)
        draw.polygon(points, outline="black", width=border_px)
        cx = (panel.bbox.x + panel.bbox.width / 2) * width
        cy = (panel.bbox.y + panel.bbox.height / 2) * height
        badge = str(panel.read_rank + 1)
        draw.ellipse(
            [
                cx - BADGE_RADIUS_PX,
                cy - BADGE_RADIUS_PX,
                cx + BADGE_RADIUS_PX,
                cy + BADGE_RADIUS_PX,
            ],
            fill="white",
            outline="black",
            width=6,
        )
        bbox = draw.textbbox((0, 0), badge, font=badge_font)
        draw.text(
            (cx - (bbox[2] - bbox[0]) / 2, cy - (bbox[3] - bbox[1]) / 2 - bbox[1]),
            badge,
            fill="black",
            font=badge_font,
        )
    return image


def render_panel_masks(
    compiled: CompiledPageLayout,
    *,
    width: int = SKELETON_WIDTH,
    height: int = SKELETON_HEIGHT,
) -> dict[str, Image.Image]:
    """Per-panel white-on-black masks from compiled polygons (slicing map)."""
    masks: dict[str, Image.Image] = {}
    for panel in compiled.panels:
        mask = Image.new("L", (width, height), 0)
        ImageDraw.Draw(mask).polygon(
            _polygon_pixels(panel.polygon, width, height), fill=255
        )
        masks[panel.panel_id] = mask
    return masks


def crop_panel(
    page_image: Image.Image, compiled: CompiledPageLayout, panel_id: str
) -> Image.Image:
    """Crop one panel's bbox from the generated page (per-panel QA input)."""
    panel = next(item for item in compiled.panels if item.panel_id == panel_id)
    width, height = page_image.size
    left = max(0, int(panel.bbox.x * width))
    top = max(0, int(panel.bbox.y * height))
    right = min(width, int((panel.bbox.x + panel.bbox.width) * width))
    bottom = min(height, int((panel.bbox.y + panel.bbox.height) * height))
    return page_image.crop((left, top, right, bottom))


# ---------------------------------------------------------------------------
# OCR gate (findings guardrail 3)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class OcrGateResult:
    clean: bool
    text_words: list[dict] = field(default_factory=list)
    raw_word_count: int = 0
    gate_version: str = "page-art-ocr-gate.v1"


def _load_dictionary() -> frozenset[str]:
    system_words = Path("/usr/share/dict/words")
    if system_words.is_file():
        try:
            return frozenset(
                word.strip().lower()
                for word in system_words.read_text(errors="ignore").splitlines()
                if len(word.strip()) >= OCR_MIN_WORD_LENGTH
            )
        except OSError:  # pragma: no cover - degraded host
            pass
    return FALLBACK_DICTIONARY


_DICTIONARY: frozenset[str] | None = None


def ocr_gate(
    image_path: Path,
    *,
    min_confidence: float = OCR_MIN_CONFIDENCE,
    min_word_length: int = OCR_MIN_WORD_LENGTH,
    min_word_count: int = OCR_MIN_WORD_COUNT,
    dictionary: frozenset[str] | None = None,
) -> OcrGateResult:
    """Reject pages carrying REAL text while ignoring screentone noise.

    A word only counts against the page when it (a) reaches tesseract
    confidence ``min_confidence``, (b) is at least ``min_word_length``
    alphabetic characters, and (c) is a dictionary word. The page fails the
    gate when ``min_word_count`` such words exist — single stray hits stay
    below the line, exactly the spike's screentone false-positive class.
    """
    global _DICTIONARY
    if dictionary is None:
        if _DICTIONARY is None:
            _DICTIONARY = _load_dictionary()
        dictionary = _DICTIONARY
    if shutil.which("tesseract") is None:
        raise RuntimeError("tesseract binary is required for the OCR gate")
    completed = subprocess.run(
        ["tesseract", str(image_path), "stdout", "--psm", "11", "tsv"],
        capture_output=True,
        text=True,
        check=False,
    )
    rows = completed.stdout.splitlines()
    text_words: list[dict] = []
    raw_word_count = 0
    for row in rows[1:]:
        columns = row.split("\t")
        if len(columns) < 12:
            continue
        try:
            confidence = float(columns[10])
        except ValueError:
            continue
        token = columns[11].strip()
        if not token:
            continue
        raw_word_count += 1
        cleaned = "".join(ch for ch in token if ch.isalpha())
        if (
            confidence >= min_confidence
            and len(cleaned) >= min_word_length
            and cleaned.lower() in dictionary
        ):
            text_words.append({"text": token, "confidence": confidence})
    return OcrGateResult(
        clean=len(text_words) < min_word_count,
        text_words=text_words,
        raw_word_count=raw_word_count,
    )


# ---------------------------------------------------------------------------
# border adherence (deterministic accept/retry signal — NOT Layout-IoU)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BorderAdherenceResult:
    page_score: float
    panel_scores: dict[str, float]
    passed: bool
    threshold: float
    metric_version: str = "page-art-border-adherence.v1"


def border_adherence(
    page_image: Image.Image,
    compiled: CompiledPageLayout,
    *,
    samples_per_edge: int = BORDER_SAMPLES_PER_EDGE,
    darkness_threshold: int = BORDER_DARKNESS_THRESHOLD,
    window: int = BORDER_SAMPLE_WINDOW,
    min_score: float = BORDER_ADHERENCE_MIN,
) -> BorderAdherenceResult:
    """Fraction of expected panel-border points that are ink-dark.

    Samples along every compiled polygon edge and takes the darkest pixel in
    a small window around each sample (borders may be a few pixels off).
    A merged panel loses its shared edge and drags the page score down.
    """
    gray = page_image.convert("L")
    width, height = gray.size
    pixels = gray.load()
    panel_scores: dict[str, float] = {}
    for panel in compiled.panels:
        points = _polygon_pixels(panel.polygon, width, height)
        dark = 0
        total = 0
        for start, end in zip(points, [*points[1:], points[0]]):
            for step in range(samples_per_edge):
                t = (step + 0.5) / samples_per_edge
                x = start[0] + (end[0] - start[0]) * t
                y = start[1] + (end[1] - start[1]) * t
                darkest = 255
                for dx in range(-window, window + 1):
                    for dy in range(-window, window + 1):
                        px = min(max(int(x) + dx, 0), width - 1)
                        py = min(max(int(y) + dy, 0), height - 1)
                        value = pixels[px, py]
                        if value < darkest:
                            darkest = value
                total += 1
                if darkest <= darkness_threshold:
                    dark += 1
        panel_scores[panel.panel_id] = dark / total if total else 0.0
    page_score = (
        sum(panel_scores.values()) / len(panel_scores) if panel_scores else 0.0
    )
    return BorderAdherenceResult(
        page_score=page_score,
        panel_scores=panel_scores,
        passed=page_score >= min_score,
        threshold=min_score,
    )


# ---------------------------------------------------------------------------
# v2 composition: frames + deterministic lettering over text-free art
#
# Session 6 (issue #5): the v1 reader's bubble rules are CARRIED here rather
# than reimplemented — `resolve_tail_side`/`tail_geometry` port
# `resolveBubbleTail` (frontend/components/MangaReader/dialogue_geometry.ts:
# side from the target's position relative to the bubble box, offset along
# that side toward the target, clamped 15-85%), and `nudge_region_clear`
# ports `avoidSpriteFaceZones` (same candidate ladder: top, bottom, left,
# right, top-center) with the v2 equivalents of v1's sprite face zones: the
# panel's authored `avoid_text_regions` + `focal_regions`. Bubble tails and
# per-shape bodies (oval / round_rect / jagged shout burst / scalloped
# thought cloud + shrinking-circle thought tail) are new deterministic PIL.
# ---------------------------------------------------------------------------

COMPOSITION_VERSION = "manga-composition.v2"

#: v1 rule constants (dialogue_geometry.ts): tail offset clamp along a side.
TAIL_OFFSET_MIN = 0.15
TAIL_OFFSET_MAX = 0.85
#: Tail base width as a fraction of the bubble side it sits on.
TAIL_BASE_FRACTION = 0.22

TailSide = Literal["left", "right", "top", "bottom"]


@dataclass(frozen=True)
class ResolvedTail:
    """Page-normalized tail geometry: triangle base on the bubble edge."""

    side: TailSide
    base_a: tuple[float, float]
    base_b: tuple[float, float]
    tip: tuple[float, float]


def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def resolve_tail_side(
    box: tuple[float, float, float, float], target: tuple[float, float]
) -> tuple[TailSide, float]:
    """Port of v1 ``resolveBubbleTail``: which bubble side faces the target,
    and how far along that side (0..1, clamped 0.15..0.85) the tail sits.

    ``box`` is (left, top, width, height); everything page-normalized.
    """
    left, top, width, height = box
    right = left + width
    bottom = top + height
    tx, ty = target
    if ty > bottom:
        side: TailSide = "bottom"
    elif ty < top:
        side = "top"
    elif tx < left:
        side = "left"
    elif tx > right:
        side = "right"
    else:
        side = "bottom"  # v1 fallback when the target sits inside the box
    if side in {"left", "right"}:
        raw = (ty - top) / max(height, 1e-6)
    else:
        raw = (tx - left) / max(width, 1e-6)
    return side, _clamp(raw, TAIL_OFFSET_MIN, TAIL_OFFSET_MAX)


def tail_geometry(
    box: tuple[float, float, float, float],
    target: tuple[float, float],
) -> ResolvedTail:
    """Triangle tail from the resolved side toward the target point."""
    side, offset = resolve_tail_side(box, target)
    left, top, width, height = box
    half_base = (
        max(height, 1e-6) if side in {"left", "right"} else max(width, 1e-6)
    ) * TAIL_BASE_FRACTION / 2
    if side == "bottom":
        ax = left + width * offset
        base_a = (_clamp(ax - half_base, left, left + width), top + height)
        base_b = (_clamp(ax + half_base, left, left + width), top + height)
    elif side == "top":
        ax = left + width * offset
        base_a = (_clamp(ax - half_base, left, left + width), top)
        base_b = (_clamp(ax + half_base, left, left + width), top)
    elif side == "left":
        ay = top + height * offset
        base_a = (left, _clamp(ay - half_base, top, top + height))
        base_b = (left, _clamp(ay + half_base, top, top + height))
    else:  # right
        ay = top + height * offset
        base_a = (left + width, _clamp(ay - half_base, top, top + height))
        base_b = (left + width, _clamp(ay + half_base, top, top + height))
    return ResolvedTail(side=side, base_a=base_a, base_b=base_b, tip=target)


def _boxes_overlap(
    a: tuple[float, float, float, float], b: tuple[float, float, float, float]
) -> bool:
    return (
        a[0] < b[0] + b[2]
        and a[0] + a[2] > b[0]
        and a[1] < b[1] + b[3]
        and a[1] + a[3] > b[1]
    )


def nudge_region_clear(
    box: tuple[float, float, float, float],
    obstacles: list[tuple[float, float, float, float]],
    *,
    bounds: tuple[float, float, float, float] = (0.0, 0.0, 1.0, 1.0),
) -> tuple[float, float, float, float]:
    """Port of v1 ``avoidSpriteFaceZones``: keep the box off authored
    obstacle regions by trying the same candidate ladder (top edge, bottom
    edge, left edge, right edge, top-center), first clear candidate wins,
    original box kept when nothing clears."""
    if not any(_boxes_overlap(box, obstacle) for obstacle in obstacles):
        return box
    left, top, width, height = box
    b_left, b_top, b_width, b_height = bounds
    margin_x = 0.04 * b_width
    margin_y = 0.04 * b_height
    candidates = [
        (left, b_top + margin_y, width, height),
        (left, b_top + b_height - height - margin_y, width, height),
        (b_left + margin_x, top, width, height),
        (b_left + b_width - width - margin_x, top, width, height),
        (b_left + (b_width - width) / 2, b_top + margin_y, width, height),
    ]
    for candidate in candidates:
        clamped = (
            _clamp(candidate[0], b_left, max(b_left, b_left + b_width - width)),
            _clamp(candidate[1], b_top, max(b_top, b_top + b_height - height)),
            width,
            height,
        )
        if not any(_boxes_overlap(clamped, obstacle) for obstacle in obstacles):
            return clamped
    return box


def resolve_tail_target(
    text, plan: MangaPagePlan
) -> tuple[float, float] | None:
    """Page-normalized tail target: the authored ``tail_target.point`` wins;
    otherwise the speaker's blocking anchor in the text's panel (the v1
    ``speakerTarget`` rule — anchors are page-normalized like the ported SVG
    renderer draws them)."""
    if text.tail_target is not None:
        return (text.tail_target.point.x, text.tail_target.point.y)
    if text.speaker_ref is None:
        return None
    panel = next(
        (p for p in plan.page_script.panels if p.panel_id == text.panel_id), None
    )
    if panel is None:
        return None
    block = next(
        (b for b in panel.blocking if b.subject_ref == text.speaker_ref), None
    )
    if block is None:
        return None
    return (block.anchor.x, block.anchor.y)


def _panel_obstacles(text, plan: MangaPagePlan) -> list[tuple[float, float, float, float]]:
    panel = next(
        (p for p in plan.page_script.panels if p.panel_id == text.panel_id), None
    )
    if panel is None:
        return []
    return [
        (region.x, region.y, region.width, region.height)
        for region in [*panel.avoid_text_regions, *panel.focal_regions]
    ]


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and draw.textlength(candidate, font=font) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or [text]


def _draw_tail(
    draw: ImageDraw.ImageDraw,
    tail: ResolvedTail,
    scale: tuple[int, int],
    center: tuple[float, float],
    *,
    outline_px: int = 3,
) -> None:
    """White-filled tail triangle with the two SIDE edges stroked — the base
    edge stays unstroked and is pulled toward the bubble center so the tail
    merges into the body even on curved (ellipse) shapes."""
    width, height = scale

    def _pull(point: tuple[float, float]) -> tuple[float, float]:
        px, py = point[0] * width, point[1] * height
        return (px + (center[0] - px) * 0.25, py + (center[1] - py) * 0.25)

    base_a = _pull(tail.base_a)
    base_b = _pull(tail.base_b)
    tip = (tail.tip[0] * width, tail.tip[1] * height)
    draw.polygon([base_a, base_b, tip], fill="white")
    draw.line([base_a, tip], fill="black", width=outline_px)
    draw.line([base_b, tip], fill="black", width=outline_px)


def _draw_thought_tail(
    draw: ImageDraw.ImageDraw,
    tail: ResolvedTail,
    scale: tuple[int, int],
    *,
    outline_px: int = 3,
) -> None:
    """Classic shrinking-circle thought tail from bubble edge to target."""
    width, height = scale
    base = (
        (tail.base_a[0] + tail.base_b[0]) / 2 * width,
        (tail.base_a[1] + tail.base_b[1]) / 2 * height,
    )
    tip = (tail.tip[0] * width, tail.tip[1] * height)
    for step, radius_factor in ((0.35, 0.024), (0.68, 0.015), (0.92, 0.009)):
        cx = base[0] + (tip[0] - base[0]) * step
        cy = base[1] + (tip[1] - base[1]) * step
        radius = radius_factor * min(width, height)
        draw.ellipse(
            [cx - radius, cy - radius, cx + radius, cy + radius],
            fill="white",
            outline="black",
            width=outline_px,
        )


def _draw_bubble_body(
    draw: ImageDraw.ImageDraw,
    shape: str,
    shape_box: list[float],
    *,
    outline_px: int = 3,
) -> None:
    left, top, right, bottom = shape_box
    if shape == "caption":
        draw.rectangle(shape_box, fill="white", outline="black", width=outline_px)
        return
    if shape == "round_rect":
        radius = max(6.0, min(right - left, bottom - top) * 0.18)
        draw.rounded_rectangle(
            shape_box, radius=radius, fill="white", outline="black", width=outline_px
        )
        return
    if shape == "jagged":
        # Shout burst: alternate outer/inner radius spikes around the center.
        import math

        cx = (left + right) / 2
        cy = (top + bottom) / 2
        rx = (right - left) / 2
        ry = (bottom - top) / 2
        points = []
        spikes = 12
        for index in range(spikes * 2):
            angle = math.pi * index / spikes
            factor = 1.0 if index % 2 == 0 else 0.74
            points.append(
                (cx + math.cos(angle) * rx * factor, cy + math.sin(angle) * ry * factor)
            )
        draw.polygon(points, fill="white", outline="black", width=outline_px)
        return
    if shape == "thought_cloud":
        # Scalloped cloud: ring of circles along the ellipse perimeter, then
        # a clean white interior.
        import math

        cx = (left + right) / 2
        cy = (top + bottom) / 2
        rx = max((right - left) / 2, 1.0)
        ry = max((bottom - top) / 2, 1.0)
        scallop = max(6.0, min(rx, ry) * 0.38)
        count = max(8, int((rx + ry) / scallop))
        for index in range(count):
            angle = 2 * math.pi * index / count
            px = cx + math.cos(angle) * rx
            py = cy + math.sin(angle) * ry
            draw.ellipse(
                [px - scallop, py - scallop, px + scallop, py + scallop],
                fill="white",
                outline="black",
                width=outline_px,
            )
        draw.ellipse(shape_box, fill="white")
        return
    # oval (default): plain ellipse
    draw.ellipse(shape_box, fill="white", outline="black", width=outline_px)


def compose_lettered_page(
    art: Image.Image,
    plan: MangaPagePlan,
    compiled: CompiledPageLayout,
    *,
    draw_frames: bool = True,
    frame_px: int = 5,
) -> Image.Image:
    """Deterministic v2 composition: panel frames + code-rendered lettering.

    ALL text comes from the authored ``TextElement`` set (issue #5: code owns
    every glyph; the art must arrive text-free through the OCR gate).
    ``preferred_region`` boxes are PAGE-normalized — the ported SVG
    renderer's convention. Dialogue/thought bubbles grow tails toward the
    authored ``tail_target`` (or the speaker's blocking anchor), and bubble
    boxes are nudged off the panel's authored avoid/focal regions — the v1
    reader's rules, carried (see module comment).
    """
    page = art.convert("RGB").copy()
    draw = ImageDraw.Draw(page)
    width, height = page.size

    if draw_frames:
        for panel in compiled.panels:
            draw.polygon(
                _polygon_pixels(panel.polygon, width, height),
                outline="black",
                width=frame_px,
            )

    for text in sorted(plan.page_script.text_elements, key=lambda item: item.z_index):
        region = text.preferred_region
        # v1 rule carry: keep authored regions off avoid/focal zones.
        nudged = nudge_region_clear(
            (region.x, region.y, region.width, region.height),
            _panel_obstacles(text, plan),
        )
        box_left = nudged[0] * width
        box_top = nudged[1] * height
        box_width = max(nudged[2] * width, 40.0)
        box_height = max(nudged[3] * height, 24.0)
        font_px = max(min(int(box_height * 0.28), text.typography.max_px), text.typography.min_px)
        font = _load_font(font_px)
        lines = _wrap_text(draw, text.content, font, box_width * 0.82)
        line_height = font_px + 4
        text_height = line_height * len(lines)
        needed_height = max(box_height, text_height + font_px)
        cx = box_left + box_width / 2
        cy = min(box_top + needed_height / 2, height - needed_height / 2)
        shape_box = [
            cx - box_width / 2,
            cy - needed_height / 2,
            cx + box_width / 2,
            cy + needed_height / 2,
        ]

        tail: ResolvedTail | None = None
        if text.kind in {"dialogue", "thought", "monologue"}:
            target = resolve_tail_target(text, plan)
            if target is not None:
                normalized_box = (
                    shape_box[0] / width,
                    shape_box[1] / height,
                    (shape_box[2] - shape_box[0]) / width,
                    (shape_box[3] - shape_box[1]) / height,
                )
                tail = tail_geometry(normalized_box, target)

        if text.shape == "free_sfx":
            pass  # SFX draw as bare display lettering, no container
        else:
            _draw_bubble_body(draw, text.shape, shape_box)
            if tail is not None:
                if text.kind == "thought" or text.shape == "thought_cloud":
                    _draw_thought_tail(draw, tail, (width, height))
                else:
                    _draw_tail(draw, tail, (width, height), (cx, cy))

        y = cy - text_height / 2
        for line in lines:
            line_width = draw.textlength(line, font=font)
            if text.shape == "free_sfx":
                draw.text(
                    (cx - line_width / 2, y),
                    line,
                    fill="black",
                    font=font,
                    stroke_width=3,
                    stroke_fill="white",
                )
            else:
                stroke = 1 if text.typography.emphasis == "shout" else 0
                draw.text(
                    (cx - line_width / 2, y),
                    line,
                    fill="black",
                    font=font,
                    stroke_width=stroke,
                    stroke_fill="black" if stroke else None,
                )
            y += line_height
    return page
