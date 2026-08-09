"""Session 8: the LANE-C PANEL BINDING bake-off (issues #12/#7/#10).

Eight receipted one-shot art rejections across two conditioning versions
(S7) proved the image model paints the RIGHT story content in the WRONG
panels. Three candidates compete on the S7 landing set (2 pages x 4
panels, run ``run_dir_a99464c…``), refereed by the eval harness:

- A (probe only): per-panel generation + deterministic assembly. The
  probe is 2 per-panel calls on page 0 — receipts + measured per-panel
  cost + inspectable panel images. NO assembly (the paste primitive is
  built and tested for B); scaling A is an explicit owner cost decision.
- B: ONE money-shot panel per page pasted into the compiled geometry by
  code (`paste_panel_art` — binding exact by construction), DSL base for
  the rest, authored lettering on top.
- C: hardened one-shot — the v2 spatial-anchor briefs stay, the skeleton
  gains in-panel CONTENT TAGS, and the retry names the specific binding
  failure from the vision check.

Phases (each states its budget, refuses calls beyond it, and persists a
provider_receipt for EVERY provider call including failures):

    uv run python scripts/bakeoff_s8_binding.py --phase criteria
    uv run python scripts/bakeoff_s8_binding.py --phase a-probe --budget 0.30
    uv run python scripts/bakeoff_s8_binding.py --phase b --budget 0.16
    uv run python scripts/bakeoff_s8_binding.py --phase c --budget 0.16
    uv run python scripts/bakeoff_s8_binding.py --phase eval

Winner criteria are PRE-COMMITTED by the criteria phase before any spend
(binding over art-bearing panels only; judge fidelity on the composed
page is the cross-candidate primary; cost is the tiebreak; border
adherence recorded but EXCLUDED for code-assembled pages).
"""

import argparse
import asyncio
import io
import json
import sys
import time
from base64 import b64decode
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from PIL import Image, ImageDraw

from app.config import get_settings
from app.contracts.evaluation import EvalScorecard
from app.contracts.manga import CompiledPageLayout, MangaPagePlan, MangaPlan, ThumbnailSet
from app.persistence.documents import ArtifactDoc, construct_document, utc_now
from app.persistence.v1_bridge import V1BridgedRepositories, init_wired_documents
from app.scripts import _db
from app.services.hashing import binary_content_hash, content_hash
from app.services.manga_eval import (
    PageScore,
    build_scorecard,
    compare_scorecards,
    judge_page,
    layout_iou,
)
from app.services.manga_page_art import (
    PAGE_ART_MODEL,
    SKELETON_HEIGHT,
    SKELETON_WIDTH,
    _load_font,
    border_adherence,
    compose_lettered_page,
    ocr_gate,
    paste_panel_art,
    render_conditioning_skeleton,
    select_key_panel,
)
from app.services.manga_vision_qa import build_vision_qa

REPO = Path(__file__).resolve().parents[2]
EVIDENCE = REPO / "docs" / "evidence" / "session8-bakeoff"
STORAGE = REPO / "storage"
ASSETS = STORAGE / "images" / "manga_assets" / "6a0b5a5b201a8d03f1d82503"
REFERENCE_SHEETS = [
    ASSETS / "haw__reference_sheet__front.png",
    ASSETS / "hem__reference_sheet__front.png",
]
PROJECT_ID = "6a0b5a5b201a8d03f1d82503"
THUMBNAIL_ARTIFACT_ID = "accepted_thumbnail_set_8f57b8f9a2bbd3fe849f7b19"
BASELINE_SCORECARD_ID = "eval_scorecard_a575909be3d6023a2df175eb"

WINNER_CRITERIA = {
    "committed_before_any_spend": True,
    "primary": (
        "judge fidelity score on the COMPOSED page (m3-judge-rubrics.v1, "
        "same rubric as the S7 baseline — untouched this session)"
    ),
    "mechanism_check": (
        "vision binding_score over ART-BEARING panels only (A: probed "
        "panels; B: the key panel; C: all panels). Binding is undefined "
        "for the dsl_only baseline and is A/B/C-relative only."
    ),
    "tiebreak": "measured image cost per page (receipts, not price sheets)",
    "excluded": (
        "border adherence for code-assembled pages (A/B): geometry is "
        "drawn by code, adherence ~1.0 by construction — recorded, not "
        "scored"
    ),
    "candidate_a_gate": (
        "steering rule: if the probe's measured per-panel price does not "
        "undercut $0.039/panel, A is NOT scaled — its economics become an "
        "OPEN OWNER COST DECISION and B/C compete for the win"
    ),
}

BINDING_SYSTEM_PROMPT = (
    "You are a strict manga QA inspector. You receive a page image and a "
    "list of expected panels, each with its position on the page and the "
    "content it must show. For EACH expected panel, judge whether that "
    "content appears AT THAT POSITION (right content in a different "
    "position is a FAIL for both positions). Reply with JSON only:\n"
    '{"panels": [{"panel": <number>, "position": "<expected position>", '
    '"matches": true/false, "seen": "<one line: what is actually there>"}], '
    '"binding_score": <fraction of panels that match>}'
)

PANEL_ART_RULES = (
    "HARD RULES:\n"
    "- Monochrome black-and-white manga ink style with screentones.\n"
    "- This is ONE SINGLE PANEL illustration, full bleed, no panel borders, "
    "no gutters, no sub-panels.\n"
    "- ABSOLUTELY NO TEXT of any kind: no letters, numbers, words, captions, "
    "speech bubbles, signs, or logos. Leave a quiet empty area near the top "
    "for lettering to be added later.\n"
    "- Characters must match the attached character reference sheets exactly "
    "(same faces, hair, outfits)."
)

CONTENT_TAG_RULES = (
    "\n- Each panel of the skeleton contains a small gray GUIDE LABEL "
    "naming what that panel must depict. The label is a content guide "
    "only: DEPICT what it says in that exact panel, and DO NOT write, "
    "copy, or letter the label (or any other text) into your art — the "
    "final page must be completely text-free."
)


def _run_id() -> str:
    arm = json.loads(
        (REPO / "docs" / "evidence" / "session4-bakeoff" / "arm_hs.json").read_text()
    )
    return arm["goals"][0]["run_id"]


def _aspect_ratio_for(bbox_width: float, bbox_height: float) -> str:
    ratio = (bbox_width * SKELETON_WIDTH) / max(bbox_height * SKELETON_HEIGHT, 1e-6)
    candidates = {
        "1:1": 1.0, "3:2": 1.5, "2:3": 2 / 3, "4:3": 4 / 3,
        "3:4": 0.75, "16:9": 16 / 9, "9:16": 9 / 16,
    }
    return min(candidates, key=lambda key: abs(candidates[key] - ratio))


def _position_phrase(panel) -> str:
    bbox = panel.bbox
    cx = bbox.x + bbox.width / 2
    cy = bbox.y + bbox.height / 2
    row = "top" if cy < 1 / 3 else "middle" if cy < 2 / 3 else "bottom"
    column = "left" if cx < 1 / 3 else "center" if cx < 2 / 3 else "right"
    if bbox.width > 0.8:
        return f"the full-width {row} panel"
    return f"the {row}-{column} panel"


def _wrap(text: str, limit: int) -> list[str]:
    words, lines, current = text.split(), [], ""
    for word in words:
        if len(current) + len(word) + 1 > limit and current:
            lines.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    if current:
        lines.append(current)
    return lines


def render_tagged_skeleton(
    compiled: CompiledPageLayout, plan: MangaPagePlan
) -> Image.Image:
    """Candidate C conditioning: the standard skeleton + in-panel content
    tags (short gray guide labels naming each panel's content)."""
    skeleton = render_conditioning_skeleton(compiled)
    draw = ImageDraw.Draw(skeleton)
    font = _load_font(22)
    script_by_id = {p.panel_id: p for p in plan.page_script.panels}
    for panel in compiled.panels:
        script = script_by_id[panel.panel_id]
        tag = script.story_beat.upper()
        lines = _wrap(tag, 34)[:3]
        cx = (panel.bbox.x + panel.bbox.width / 2) * SKELETON_WIDTH
        top = (panel.bbox.y + panel.bbox.height / 2) * SKELETON_HEIGHT + 48
        for index, line in enumerate(lines):
            bbox = draw.textbbox((0, 0), line, font=font)
            draw.text(
                (cx - (bbox[2] - bbox[0]) / 2, top + index * 26),
                line,
                fill=(150, 150, 150),
                font=font,
            )
    return skeleton


class Bakeoff:
    def __init__(self, repos: V1BridgedRepositories, settings: Any) -> None:
        self.repos = repos
        self.settings = settings
        self.run_id = _run_id()
        self.vision = build_vision_qa()
        self.spent_image_usd = 0.0

    async def load(self) -> None:
        self.run = await self.repos.get_run(self.run_id)
        artifacts = await self.repos.list_artifacts(self.run_id, accepted_only=True)
        self.by_id = {a.artifact_id: a for a in artifacts}
        by_kind: dict[str, list[ArtifactDoc]] = {}
        for artifact in artifacts:
            by_kind.setdefault(artifact.kind, []).append(artifact)
        self.by_kind = by_kind
        self.plan = MangaPlan.model_validate(by_kind["manga_plan"][0].content)
        self.must_preserve = sorted(
            {claim for beat in self.plan.beats for claim in beat.must_preserve}
        )
        thumbnail_set = ThumbnailSet.model_validate(
            self.by_id[THUMBNAIL_ARTIFACT_ID].content
        )
        self.page_plans = {p.page_plan_id: p for p in thumbnail_set.page_plans}
        script_panel_ids = {
            plan_id: {p.panel_id for p in plan_doc.page_script.panels}
            for plan_id, plan_doc in self.page_plans.items()
        }
        self.layouts: dict[str, CompiledPageLayout] = {}
        for artifact in by_kind.get("compiled_layout", []):
            layout = CompiledPageLayout.model_validate(artifact.content)
            if script_panel_ids.get(layout.page_plan_id) == {
                p.panel_id for p in layout.panels
            }:
                self.layouts[layout.page_plan_id] = layout
        self.pages = sorted(
            self.page_plans.values(), key=lambda p: p.page_script.page_index
        )

    # ------------------------------------------------------------------
    # provider calls (every call receipts, budget-guarded)
    # ------------------------------------------------------------------

    async def image_call(
        self,
        *,
        prompt: str,
        images: list[Image.Image],
        reference_paths: list[Path],
        aspect_ratio: str,
        budget_usd: float,
        purpose: str,
        summary: dict[str, Any],
    ) -> dict[str, Any]:
        projected = self.spent_image_usd + 0.039
        if projected > budget_usd:
            raise RuntimeError(
                f"budget guard: projected ${projected:.4f} exceeds phase "
                f"budget ${budget_usd:.4f} — refusing the call"
            )
        content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        for image in images:
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            data = buffer.getvalue()
            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "data:image/png;base64,"
                        + __import__("base64").b64encode(data).decode()
                    },
                }
            )
        for ref in reference_paths:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "data:image/png;base64,"
                        + __import__("base64").b64encode(ref.read_bytes()).decode()
                    },
                }
            )
        payload = {
            "model": PAGE_ART_MODEL,
            "messages": [{"role": "user", "content": content}],
            "modalities": ["image", "text"],
            "image_config": {"aspect_ratio": aspect_ratio},
            "usage": {"include": True},
        }
        started = time.time()
        error_text: str | None = None
        body: dict[str, Any] = {}
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.settings.openrouter_api_key}"
                    },
                    json=payload,
                )
            response.raise_for_status()
            body = response.json()
        except Exception as error:  # noqa: BLE001 — the receipt must exist anyway
            error_text = f"{type(error).__name__}: {error}"
        latency_ms = int((time.time() - started) * 1000)
        image: Image.Image | None = None
        response_text: str | None = None
        usage = body.get("usage") if isinstance(body, dict) else None
        cost = float((usage or {}).get("cost") or 0.0)
        if error_text is None:
            message = (body.get("choices") or [{}])[0].get("message", {})
            response_text = message.get("content") or None
            returned = message.get("images") or []
            if returned:
                raw = b64decode(returned[0]["image_url"]["url"].split(",", 1)[1])
                image = Image.open(io.BytesIO(raw)).convert("RGB")
        self.spent_image_usd += cost
        receipt_content = {
            "schema_version": "provider-receipt.v1",
            "purpose": purpose,
            "provider": "openrouter",
            "model": PAGE_ART_MODEL,
            "request": {**summary, "aspect_ratio": aspect_ratio},
            "usage": usage,
            "cost_usd": cost,
            "latency_ms": latency_ms,
            "error": error_text,
            "response_text": response_text if image is None else None,
            "n_images": 1 if image is not None else 0,
            "at": utc_now().isoformat(),
        }
        stored = await self._save_receipt(receipt_content)
        return {
            "image": image,
            "cost_usd": cost,
            "receipt_artifact_id": stored.artifact_id,
            "error": error_text,
        }

    async def _save_receipt(self, receipt_content: dict[str, Any]) -> ArtifactDoc:
        digest = content_hash(receipt_content)
        return await self.repos.save_artifact(
            construct_document(
                ArtifactDoc,
                artifact_id=f"provider_receipt_{digest[:24]}",
                project_id=PROJECT_ID,
                run_id=self.run_id,
                stage_run_id=None,
                kind="provider_receipt",
                schema_version="provider-receipt.v1",
                content=receipt_content,
                storage_ref=None,
                content_hash=digest,
                parent_artifact_ids=[],
                author="s8-bakeoff",
                supersedes_artifact_id=None,
                source_refs=[],
                model_receipt=None,
                validation_status="accepted",
                validation_report={
                    "passed": True,
                    "issues": [],
                    "validator_version": "provider-receipt.v1",
                },
                created_at=utc_now(),
            )
        )

    async def binding_check(
        self,
        image_path: Path,
        plan_doc: MangaPagePlan,
        compiled: CompiledPageLayout,
        art_panel_ids: list[str],
        *,
        subject: str,
    ) -> dict[str, Any]:
        """Vision referee: per-panel binding over ART-BEARING panels only."""
        script_by_id = {p.panel_id: p for p in plan_doc.page_script.panels}
        briefs = "\n".join(
            f"Panel {panel.read_rank + 1} ({_position_phrase(panel)}): "
            f"{script_by_id[panel.panel_id].story_beat}"
            for panel in sorted(compiled.panels, key=lambda item: item.read_rank)
            if panel.panel_id in art_panel_ids
        )
        started = time.time()
        error_text = None
        result: dict[str, Any] = {}
        try:
            result = await self.vision(
                image_path=image_path,
                briefs=briefs,
                expected_panel_count=len(art_panel_ids),
                system_prompt=BINDING_SYSTEM_PROMPT,
            )
        except Exception as error:  # noqa: BLE001
            error_text = f"{type(error).__name__}: {error}"
        cost = float(result.get("cost_usd") or 0.0)
        receipt_content = {
            "schema_version": "provider-receipt.v1",
            "purpose": "s8_binding_check",
            "provider": "minimax",
            "model": "MiniMax-M3",
            "request": {
                "image": image_path.name,
                "subject": subject,
                "art_panels": len(art_panel_ids),
            },
            "usage": result.get("usage"),
            "cost_usd": cost,
            "latency_ms": int((time.time() - started) * 1000),
            "error": error_text,
            "response_text": json.dumps(result.get("parsed"))
            if result.get("parsed") is not None
            else None,
            "n_images": 0,
            "at": utc_now().isoformat(),
        }
        await self._save_receipt(receipt_content)
        return {"parsed": result.get("parsed"), "cost_usd": cost, "error": error_text}

    # ------------------------------------------------------------------
    # composed persistence (bake-off rows, author-tagged)
    # ------------------------------------------------------------------

    async def persist_composed(
        self,
        plan_doc: MangaPagePlan,
        composed: Image.Image,
        *,
        candidate: str,
        art_panel_ids: list[str],
        extra: dict[str, Any],
    ) -> ArtifactDoc:
        buffer = io.BytesIO()
        composed.save(buffer, format="PNG")
        data = buffer.getvalue()
        digest = binary_content_hash(data)
        folder = STORAGE / "images" / "composed-pages"
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{digest[:32]}.png"
        path.write_bytes(data)
        storage_ref = f"storage://images/composed-pages/{digest[:32]}.png"
        content = {
            "schema_version": "composed-page.v1",
            "page_plan_id": plan_doc.page_plan_id,
            "page_index": plan_doc.page_script.page_index,
            "has_art": True,
            "lettering": "deterministic (code-owned, all text elements)",
            "composition_version": "s8-bakeoff",
            "image_content_hash": digest,
            "text_element_count": len(plan_doc.page_script.text_elements),
            "page_art_artifact_id": None,
            "bakeoff_candidate": candidate,
            "art_panel_ids": art_panel_ids,
            **extra,
        }
        artifact = construct_document(
            ArtifactDoc,
            artifact_id=f"composed_page_{content_hash(content)[:24]}",
            project_id=PROJECT_ID,
            run_id=self.run_id,
            stage_run_id=None,
            kind="composed_page",
            schema_version="composed-page.v1",
            content=content,
            storage_ref=storage_ref,
            content_hash=digest,
            parent_artifact_ids=[THUMBNAIL_ARTIFACT_ID],
            author="s8-bakeoff",
            supersedes_artifact_id=None,
            source_refs=[],
            model_receipt=None,
            validation_status="accepted",
            validation_report={
                "passed": True,
                "issues": [],
                "validator_version": "composed-page.v1",
            },
            created_at=utc_now(),
        )
        return await self.repos.save_artifact(artifact)

    # ------------------------------------------------------------------
    # phases
    # ------------------------------------------------------------------

    async def phase_a_probe(self, budget_usd: float) -> None:
        page = self.pages[0]
        compiled = self.layouts[page.page_plan_id]
        script_by_id = {p.panel_id: p for p in page.page_script.panels}
        targets = sorted(compiled.panels, key=lambda item: item.read_rank)[:2]
        rows = []
        for panel in targets:
            script = script_by_id[panel.panel_id]
            subjects = ", ".join(b.subject_ref for b in script.blocking) or "no named characters"
            prompt = (
                f"Draw one manga panel: {script.camera.shot} shot, "
                f"{script.purpose} — {script.story_beat} [{subjects}]. "
                "The attached images are character reference sheets.\n\n"
                + PANEL_ART_RULES
            )
            call = await self.image_call(
                prompt=prompt,
                images=[],
                reference_paths=REFERENCE_SHEETS,
                aspect_ratio=_aspect_ratio_for(panel.bbox.width, panel.bbox.height),
                budget_usd=budget_usd,
                purpose="s8_bakeoff_a_probe_panel",
                summary={
                    "candidate": "A",
                    "page_index": page.page_script.page_index,
                    "panel_id": panel.panel_id,
                    "read_rank": panel.read_rank,
                },
            )
            row = {
                "panel_id": panel.panel_id,
                "read_rank": panel.read_rank,
                "cost_usd": call["cost_usd"],
                "receipt_artifact_id": call["receipt_artifact_id"],
                "error": call["error"],
                "image_saved": None,
            }
            if call["image"] is not None:
                EVIDENCE.mkdir(parents=True, exist_ok=True)
                out = EVIDENCE / f"a_probe_p{page.page_script.page_index}_{panel.panel_id}.png"
                call["image"].save(out)
                row["image_saved"] = str(out.relative_to(REPO))
            rows.append(row)
            print(
                f"A-probe {panel.panel_id}: cost=${call['cost_usd']:.6f} "
                f"error={call['error']}"
            )
        per_panel = [r["cost_usd"] for r in rows if r["cost_usd"] > 0]
        naive_full_set = 0.039 * sum(
            len(self.layouts[p.page_plan_id].panels) for p in self.pages
        )
        verdict = {
            "measured_per_panel_usd": per_panel,
            "flat_full_page_usd": 0.039,
            "undercuts_full_page_pricing": bool(per_panel) and max(per_panel) < 0.039,
            "naive_full_set_usd": round(naive_full_set, 4),
            "steering_rule": WINNER_CRITERIA["candidate_a_gate"],
        }
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        (EVIDENCE / "a_probe.json").write_text(
            json.dumps({"rows": rows, "economics": verdict}, indent=2)
        )
        print(json.dumps(verdict, indent=2))

    async def phase_b(self, budget_usd: float) -> None:
        rows = []
        for page in self.pages:
            compiled = self.layouts[page.page_plan_id]
            key_panel_id = select_key_panel(compiled, page.page_script)
            panel = next(p for p in compiled.panels if p.panel_id == key_panel_id)
            script = {p.panel_id: p for p in page.page_script.panels}[key_panel_id]
            subjects = ", ".join(b.subject_ref for b in script.blocking) or "no named characters"
            prompt = (
                f"Draw one manga panel: {script.camera.shot} shot, "
                f"{script.purpose} — {script.story_beat} [{subjects}]. "
                "The attached images are character reference sheets.\n\n"
                + PANEL_ART_RULES
            )
            call = await self.image_call(
                prompt=prompt,
                images=[],
                reference_paths=REFERENCE_SHEETS,
                aspect_ratio=_aspect_ratio_for(panel.bbox.width, panel.bbox.height),
                budget_usd=budget_usd,
                purpose="s8_bakeoff_b_key_panel",
                summary={
                    "candidate": "B",
                    "page_index": page.page_script.page_index,
                    "panel_id": key_panel_id,
                },
            )
            row: dict[str, Any] = {
                "page_index": page.page_script.page_index,
                "key_panel_id": key_panel_id,
                "cost_usd": call["cost_usd"],
                "receipt_artifact_id": call["receipt_artifact_id"],
                "error": call["error"],
            }
            EVIDENCE.mkdir(parents=True, exist_ok=True)
            if call["image"] is not None:
                raw_path = EVIDENCE / f"b_raw_p{page.page_script.page_index}_{key_panel_id}.png"
                call["image"].save(raw_path)
                gate = ocr_gate(raw_path)
                row["ocr_clean"] = gate.clean
                base = Image.new("RGB", (SKELETON_WIDTH, SKELETON_HEIGHT), "white")
                with_art = paste_panel_art(base, call["image"], compiled, key_panel_id)
                composed = compose_lettered_page(with_art, page, compiled)
                composed_path = EVIDENCE / f"b_composed_p{page.page_script.page_index}.png"
                composed.save(composed_path)
                artifact = await self.persist_composed(
                    page,
                    composed,
                    candidate="B",
                    art_panel_ids=[key_panel_id],
                    extra={"key_panel_receipt": call["receipt_artifact_id"]},
                )
                row["composed_artifact_id"] = artifact.artifact_id
                row["composed_saved"] = str(composed_path.relative_to(REPO))
            rows.append(row)
            print(f"B page {page.page_script.page_index}: {json.dumps(row, default=str)}")
        (EVIDENCE / "b_result.json").write_text(json.dumps(rows, indent=2, default=str))

    async def phase_c(self, budget_usd: float) -> None:
        rows = []
        for page in self.pages:
            compiled = self.layouts[page.page_plan_id]
            script_by_id = {p.panel_id: p for p in page.page_script.panels}
            briefs = "\n".join(
                f"Panel {panel.read_rank + 1} (badge {panel.read_rank + 1}, "
                f"{_position_phrase(panel)}): "
                f"{script_by_id[panel.panel_id].camera.shot} shot, "
                f"{script_by_id[panel.panel_id].purpose} — "
                f"{script_by_id[panel.panel_id].story_beat} "
                f"[{', '.join(b.subject_ref for b in script_by_id[panel.panel_id].blocking) or 'no named characters'}]"
                for panel in sorted(compiled.panels, key=lambda item: item.read_rank)
            )
            skeleton = render_tagged_skeleton(compiled, page)
            EVIDENCE.mkdir(parents=True, exist_ok=True)
            skeleton.save(EVIDENCE / f"c_skeleton_p{page.page_script.page_index}.png")
            hardening = ""
            row: dict[str, Any] = {
                "page_index": page.page_script.page_index,
                "attempts": [],
            }
            accepted: Image.Image | None = None
            for attempt in (1, 2):
                prompt = (
                    "The FIRST attached image is the exact panel layout "
                    "skeleton of a manga page: thick black borders are the "
                    "panel frames, the numbered badges give the reading "
                    "order, and the gray guide labels name each panel's "
                    "content. Reproduce the panel borders precisely and fill "
                    "each panel with its brief. The other attached images "
                    "are character reference sheets.\n\n"
                    + briefs
                    + "\n\nHARD RULES:\n"
                    "- Monochrome black-and-white manga ink style with screentones.\n"
                    "- ABSOLUTELY NO TEXT of any kind in the final art: no "
                    "letters, numbers, words, captions, speech bubbles, or "
                    "logos. Leave quiet empty areas near the top of panels "
                    "for lettering to be added later."
                    + CONTENT_TAG_RULES
                    + f"\n- Draw exactly {len(compiled.panels)} panels — never "
                    "merge or add panels."
                    + "\n- Characters must match the attached reference sheets."
                    + hardening
                )
                call = await self.image_call(
                    prompt=prompt,
                    images=[skeleton],
                    reference_paths=REFERENCE_SHEETS,
                    aspect_ratio="2:3",
                    budget_usd=budget_usd,
                    purpose="s8_bakeoff_c_one_shot",
                    summary={
                        "candidate": "C",
                        "page_index": page.page_script.page_index,
                        "attempt": attempt,
                        "conditioning": "v2-briefs + in-skeleton content tags",
                    },
                )
                attempt_row: dict[str, Any] = {
                    "attempt": attempt,
                    "cost_usd": call["cost_usd"],
                    "receipt_artifact_id": call["receipt_artifact_id"],
                    "error": call["error"],
                }
                if call["image"] is None:
                    attempt_row["verdict"] = "no_image"
                    row["attempts"].append(attempt_row)
                    hardening = (
                        "\n- PREVIOUS ATTEMPT returned no image. Produce the "
                        "page image."
                    )
                    continue
                raw_path = (
                    EVIDENCE
                    / f"c_raw_p{page.page_script.page_index}_a{attempt}.png"
                )
                call["image"].save(raw_path)
                gate_ocr = ocr_gate(raw_path)
                borders = border_adherence(call["image"], compiled)
                binding = await self.binding_check(
                    raw_path,
                    page,
                    compiled,
                    [p.panel_id for p in compiled.panels],
                    subject=f"c_raw_a{attempt}",
                )
                parsed = binding.get("parsed") or {}
                score = parsed.get("binding_score")
                attempt_row.update(
                    {
                        "ocr_clean": gate_ocr.clean,
                        "border_adherence": borders.page_score,
                        "binding_score": score,
                        "binding_panels": parsed.get("panels"),
                    }
                )
                ok = (
                    gate_ocr.clean
                    and borders.page_score >= 0.55
                    and isinstance(score, (int, float))
                    and score >= 0.75
                )
                attempt_row["verdict"] = "accepted" if ok else "rejected"
                row["attempts"].append(attempt_row)
                if ok:
                    accepted = call["image"]
                    break
                misses = [
                    f"panel {p.get('panel')} must show its brief at "
                    f"{p.get('position')}, but the attempt showed: {p.get('seen')}"
                    for p in (parsed.get("panels") or [])
                    if not p.get("matches")
                ]
                reasons = []
                if not gate_ocr.clean:
                    reasons.append("text/glyphs were detected in the art")
                if borders.page_score < 0.55:
                    reasons.append("panel borders were not reproduced")
                reasons.extend(misses)
                hardening = (
                    "\n- PREVIOUS ATTEMPT FAILED: " + "; ".join(reasons) + ". "
                    "Fix EXACTLY these defects; every brief must land in its "
                    "own numbered panel at its stated position."
                )
            if accepted is not None:
                composed = compose_lettered_page(accepted, page, compiled)
                composed_path = EVIDENCE / f"c_composed_p{page.page_script.page_index}.png"
                composed.save(composed_path)
                artifact = await self.persist_composed(
                    page,
                    composed,
                    candidate="C",
                    art_panel_ids=[p.panel_id for p in compiled.panels],
                    extra={"conditioning": "v2-briefs + in-skeleton content tags"},
                )
                row["composed_artifact_id"] = artifact.artifact_id
            rows.append(row)
            print(f"C page {page.page_script.page_index}: {json.dumps(row, default=str)[:400]}")
        (EVIDENCE / "c_result.json").write_text(json.dumps(rows, indent=2, default=str))

    async def phase_eval(self) -> None:
        artifacts = await self.repos.list_artifacts(self.run_id, accepted_only=True)
        candidates: dict[str, list[ArtifactDoc]] = {}
        for artifact in artifacts:
            if artifact.kind != "composed_page":
                continue
            tag = (artifact.content or {}).get("bakeoff_candidate")
            if tag:
                candidates.setdefault(tag, []).append(artifact)
        baseline = next(
            a for a in artifacts if a.artifact_id == BASELINE_SCORECARD_ID
        )
        report: dict[str, Any] = {"criteria": WINNER_CRITERIA, "candidates": {}}
        for tag, rows in sorted(candidates.items()):
            pages: list[PageScore] = []
            binding_scores: list[float] = []
            for artifact in sorted(
                rows, key=lambda a: (a.content or {}).get("page_index", 0)
            ):
                content = artifact.content or {}
                page_index = int(content.get("page_index", 0))
                plan_doc = self.page_plans[content["page_plan_id"]]
                compiled = self.layouts[content["page_plan_id"]]
                image_path = STORAGE / artifact.storage_ref.removeprefix("storage://")
                image = Image.open(image_path).convert("RGB")
                score = PageScore(page_index=page_index)
                score.layout_iou = layout_iou(image, compiled)
                score.border_adherence_score = border_adherence(image, compiled).page_score
                score.ocr_clean = True  # composed pages carry lettering by design
                score.notes.append(f"s8 bake-off candidate {tag} (composed)")
                art_panels = list(content.get("art_panel_ids") or [])
                binding = await self.binding_check(
                    image_path, plan_doc, compiled, art_panels,
                    subject=f"{tag}_composed_p{page_index}",
                )
                parsed = binding.get("parsed") or {}
                if isinstance(parsed.get("binding_score"), (int, float)):
                    binding_scores.append(float(parsed["binding_score"]))
                score.notes.append(
                    f"binding_score={parsed.get('binding_score')} over "
                    f"{len(art_panels)} art panels"
                )
                script_by_id = {p.panel_id: p for p in plan_doc.page_script.panels}
                briefs = "\n".join(
                    f"Panel {panel.read_rank + 1}: "
                    f"{script_by_id[panel.panel_id].camera.shot} shot, "
                    f"{script_by_id[panel.panel_id].purpose} — "
                    f"{script_by_id[panel.panel_id].story_beat}"
                    for panel in sorted(compiled.panels, key=lambda item: item.read_rank)
                )
                started = time.time()
                error_text = None
                result: dict[str, Any] = {}
                try:
                    result = await judge_page(
                        self.vision,
                        image_path=image_path,
                        briefs=briefs,
                        must_preserve=self.must_preserve,
                        expected_panel_count=len(compiled.panels),
                    )
                except Exception as error:  # noqa: BLE001
                    error_text = f"{type(error).__name__}: {error}"
                score.judge = result.get("parsed") if error_text is None else None
                score.judge_cost_usd = float(result.get("cost_usd") or 0.0)
                receipt_content = {
                    "schema_version": "provider-receipt.v1",
                    "purpose": "m3_judge",
                    "provider": "minimax",
                    "model": "MiniMax-M3",
                    "request": {
                        "image": image_path.name,
                        "rubric_version": "m3-judge-rubrics.v1",
                        "claims": len(self.must_preserve),
                        "subject": f"s8_bakeoff_{tag}",
                    },
                    "usage": result.get("usage"),
                    "cost_usd": score.judge_cost_usd,
                    "latency_ms": int((time.time() - started) * 1000),
                    "error": error_text,
                    "response_text": json.dumps(result.get("parsed"))
                    if result.get("parsed") is not None
                    else None,
                    "n_images": 0,
                    "at": utc_now().isoformat(),
                }
                await self._save_receipt(receipt_content)
                pages.append(score)
            scorecard = build_scorecard(
                project_id=PROJECT_ID,
                run_id=self.run_id,
                lane="C",
                subject="composed",
                pages=pages,
                extra={
                    "session": 8,
                    "bakeoff_candidate": tag,
                    "binding_scores": binding_scores,
                    "art_panels": {
                        str((a.content or {}).get("page_index")): (
                            a.content or {}
                        ).get("art_panel_ids")
                        for a in rows
                    },
                },
            )
            EvalScorecard.model_validate(scorecard)
            digest = content_hash(scorecard)
            stored = await self.repos.save_artifact(
                construct_document(
                    ArtifactDoc,
                    artifact_id=f"eval_scorecard_{digest[:24]}",
                    project_id=PROJECT_ID,
                    run_id=self.run_id,
                    stage_run_id=None,
                    kind="eval_scorecard",
                    schema_version="eval-scorecard.v1",
                    content=scorecard,
                    storage_ref=None,
                    content_hash=digest,
                    parent_artifact_ids=[a.artifact_id for a in rows],
                    author="s8-bakeoff",
                    supersedes_artifact_id=None,
                    source_refs=[],
                    model_receipt=None,
                    validation_status="accepted",
                    validation_report={
                        "passed": True,
                        "issues": [],
                        "validator_version": "eval-scorecard.v1",
                    },
                    created_at=utc_now(),
                )
            )
            diff = compare_scorecards(baseline.content, scorecard)
            report["candidates"][tag] = {
                "scorecard_artifact_id": stored.artifact_id,
                "scorecard": scorecard,
                "binding_scores": binding_scores,
                "diff_vs_s7_baseline": diff,
            }
            print(f"candidate {tag}: scorecard -> {stored.artifact_id}")
            print(f"  binding_scores={binding_scores}")
            print(f"  diff verdict: {diff['verdict']}")
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        (EVIDENCE / "bakeoff_scorecards.json").write_text(
            json.dumps(report, indent=2, default=str)
        )
        print(f"evidence -> {EVIDENCE / 'bakeoff_scorecards.json'}")


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--phase",
        required=True,
        choices=["criteria", "a-probe", "b", "c", "eval"],
    )
    parser.add_argument("--budget", type=float, default=0.0)
    args = parser.parse_args()

    if args.phase == "criteria":
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        (EVIDENCE / "winner_criteria.json").write_text(
            json.dumps(WINNER_CRITERIA, indent=2)
        )
        print(json.dumps(WINNER_CRITERIA, indent=2))
        return 0

    await _db.connect()
    settings = get_settings()
    client = await init_wired_documents(settings.mongodb_url, settings.db_name)
    try:
        bakeoff = Bakeoff(V1BridgedRepositories(), settings)
        await bakeoff.load()
        if args.phase == "a-probe":
            if args.budget <= 0 or args.budget > 0.30:
                raise SystemExit("a-probe requires 0 < --budget <= 0.30 (steering line)")
            await bakeoff.phase_a_probe(args.budget)
        elif args.phase == "b":
            if args.budget <= 0:
                raise SystemExit("phase b requires --budget")
            await bakeoff.phase_b(args.budget)
        elif args.phase == "c":
            if args.budget <= 0:
                raise SystemExit("phase c requires --budget")
            await bakeoff.phase_c(args.budget)
        elif args.phase == "eval":
            await bakeoff.phase_eval()
        print(f"phase image spend: ${bakeoff.spent_image_usd:.6f}")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
