"""Durable lane-C page-art stage (Session 5 main goal; issues #12 -> #5/#7).

Control-plane driver — NOT an agent goal. It consumes the accepted
``thumbnail_set`` lineage (page plans + compiled layouts) of a run whose
``manga_thumbnail`` stage succeeded and, per page:

1. decides the rendering mode deterministically (``rendering_mode_for_page``),
2. for lane-C pages renders the compiled-layout conditioning skeleton and
   calls the ONE allowed image model (ADR-001) with skeleton + character
   reference sheets and the text-free hard rules,
3. gates the result: production OCR gate (screentone-noise filter),
   border-adherence score (deterministic; NOT Layout-IoU — that is issue
   #10 / Session 6), and M3 vision QA (panel count + per-panel brief match +
   identity + embedded-text detection),
4. retries a failed page selectively with a hardened prompt while budget
   remains (single-page regeneration; ADR-009 lineage via supersedes),
5. composes the final page deterministically — frames + ALL text rendered
   by code over the text-free art — for EVERY page (a page without art is
   a valid DSL-only page, never a blocker; issue #7 policy),
6. persists everything as immutable artifacts: a ``provider_receipt`` row
   for EVERY provider call (image AND vision, success AND failure —
   including the text body of no-image responses), a ``page_art`` row per
   accepted art image (conditioning inputs, gates, slicing map, receipt),
   and a ``composed_page`` row per page.

Budget discipline: the caller passes ``image_budget_usd`` explicitly; the
driver refuses to start a call that could exceed it and degrades the page
to DSL-only instead. Receipts carry actuals from the provider usage field.
"""

from __future__ import annotations

import base64
import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable

import httpx
from pydantic import ValidationError

from app.contracts.manga import CompiledPageLayout, MangaPagePlan, ThumbnailSet
from app.persistence.documents import (
    ArtifactDoc,
    GenerationRunDoc,
    StageRunDoc,
    construct_document,
    utc_now,
)
from app.persistence.protocols import Repositories
from app.services.errors import ArtifactValidationError, NotFoundError
from app.services.hashing import binary_content_hash, content_hash
from app.services.manga_page_art import (
    BORDER_ADHERENCE_MIN,
    COMPOSITION_VERSION,
    PAGE_ART_COST_PER_IMAGE_USD,
    PAGE_ART_MODEL,
    PAGE_ART_VERSION,
    border_adherence,
    compose_lettered_page,
    crop_panel,
    ocr_gate,
    render_conditioning_skeleton,
    render_panel_masks,
    rendering_mode_for_page,
)
from app.services.model_policy import resolve_model_policy

from PIL import Image

logger = logging.getLogger(__name__)

STAGE_NAME = "manga_page_art"
#: Compose-only stage (Session 6): re-letters accepted page_art at ZERO
#: image cost. Its identity includes COMPOSITION_VERSION, so composition
#: improvements re-key THIS stage — never the paid page-art stage.
COMPOSE_STAGE_NAME = "manga_page_compose"
MAX_ATTEMPTS_PER_PAGE = 2

#: Gate policy provenance — part of the stage input hash so a policy change
#: never silently reuses a stage run gated under the old policy.
#: v2 (Session 5 live-run calibration): the OCR gate is the TEXT authority
#: (issue #12 flowchart); vision QA's contains_text flag is ADVISORY — the
#: first live batch showed it fires on drawn scribble/pseudo-glyph texture
#: that the dictionary OCR gate correctly ignores. Vision still rejects on
#: panel-count mismatch and overall_ok=false (intent/identity authority).
#: v3 (Session 6, issue #7): EMPTY-BALLOON detection is a reject reason —
#: lettering is code-owned, so a drawn balloon-like empty white shape
#: fights the deterministic compositor. Every gated attempt now persists a
#: durable ``qa_report`` artifact (accepted AND rejected).
GATE_POLICY_VERSION = "page-art-gates.v3"

HARD_RULES = (
    "HARD RULES:\n"
    "- Monochrome black-and-white manga ink style with screentones.\n"
    "- ABSOLUTELY NO TEXT of any kind: no letters, numbers, words, captions, "
    "speech bubbles, thought bubbles, sound-effect lettering, signs, or "
    "logos. Leave quiet empty areas near the top of panels for lettering to "
    "be added later.\n"
    "- Reproduce the attached layout skeleton's panel borders EXACTLY: same "
    "positions, same angled cuts, same gutters. Draw exactly {panel_count} "
    "panels — NEVER merge panels and NEVER add panels.\n"
    "- Characters must match the attached character reference sheets exactly "
    "(same faces, hair, outfits)."
)

RETRY_HARDENING = (
    "\n- PREVIOUS ATTEMPT FAILED validation ({reason}). Follow the skeleton "
    "borders strictly panel by panel; keep every panel separate; absolutely "
    "zero glyphs anywhere."
)

VISION_QA_SYSTEM = (
    "You are a strict manga production QA inspector. You will see a generated "
    "manga page. Judge it against the panel briefs. Respond with ONLY a JSON "
    "object: {\"panel_count\": <int, distinct panels you see>, \"panels\": "
    "[{\"index\": <1-based reading order>, \"matches_brief\": <bool>, "
    "\"identity_ok\": <bool, characters match the briefs' named characters>, "
    "\"contains_text\": <bool, any letters/words/lettering visible>, "
    "\"empty_balloon\": <bool, a drawn speech/thought-balloon-like empty "
    "white shape with an outline — NOT plain background sky/walls/tones>, "
    "\"notes\": <short string>}], \"overall_ok\": <bool>}"
)

ImageCaller = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


@dataclass
class PageArtPageResult:
    page_index: int
    mode: str
    status: str  # "art_accepted" | "dsl_only" | "budget_exhausted" | "rejected"
    attempts: int = 0
    image_cost_usd: float = 0.0
    page_art_artifact_id: str | None = None
    composed_artifact_id: str | None = None
    receipt_artifact_ids: list[str] = field(default_factory=list)
    qa_report_artifact_ids: list[str] = field(default_factory=list)
    gate_summary: dict[str, Any] = field(default_factory=dict)


@dataclass
class PageArtOutcome:
    run_id: str
    stage_run_id: str
    pages: list[PageArtPageResult]
    total_image_cost_usd: float
    total_vision_cost_usd: float
    reused: bool = False


class MangaPageArtStageService:
    def __init__(
        self,
        repositories: Repositories,
        *,
        media_root: Path = Path("storage"),
        openrouter_api_key: str | None = None,
        image_caller: ImageCaller | None = None,
        vision_qa: Callable[..., Awaitable[dict[str, Any]]] | None = None,
        character_reference_paths: list[Path] | None = None,
        max_attempts_per_page: int = MAX_ATTEMPTS_PER_PAGE,
        evidence_dir: Path | None = None,
    ) -> None:
        self._repositories = repositories
        self._media_root = media_root
        self._openrouter_api_key = openrouter_api_key
        self._image_caller = image_caller
        self._vision_qa = vision_qa
        self._character_reference_paths = character_reference_paths or []
        self._max_attempts = max_attempts_per_page
        self._evidence_dir = evidence_dir
        # Vision policy is locked: M3 always (model_policy invariant).
        self._vision_policy = resolve_model_policy("manga_vision_qa")

    # ------------------------------------------------------------------
    # public entry
    # ------------------------------------------------------------------

    async def run_page_art_stage(
        self,
        *,
        project_id: str,
        run_id: str,
        image_budget_usd: float | None = None,
        thumbnail_artifact_id: str | None = None,
    ) -> PageArtOutcome:
        run = await self._authorized_run(project_id, run_id)
        if image_budget_usd is None:
            # Shadow-lane default: the run's own image budget. Planning runs
            # carry max_image_cost_usd=0.0, so flag-on spends ZERO image
            # dollars unless a budget was explicitly granted.
            image_budget_usd = float(run.budget.get("max_image_cost_usd", 0.0))
        # Session 6: a run can carry MORE than one accepted thumbnail set
        # (the fresh Step-0 planning set landed beside the Session 4 set on
        # the same run). Regeneration must select its lineage EXPLICITLY —
        # the implicit path picks the latest succeeded thumbnail stage.
        if thumbnail_artifact_id is not None:
            thumbnail_artifact = await self._explicit_thumbnail(
                run, thumbnail_artifact_id
            )
        else:
            thumbnail_artifact = await self._accepted_stage_output(
                run, stage_name="manga_thumbnail", kind="thumbnail_set"
            )
        thumbnail_set = ThumbnailSet.model_validate(thumbnail_artifact.content)
        compiled_by_plan = await self._compiled_layouts(run, thumbnail_artifact)

        stage = await self._start_stage(
            run,
            input_artifact_ids=[thumbnail_artifact.artifact_id],
            input_hash=content_hash(
                {
                    "thumbnail_hash": thumbnail_artifact.content_hash,
                    "page_art_version": PAGE_ART_VERSION,
                    "gate_policy_version": GATE_POLICY_VERSION,
                    "image_model": PAGE_ART_MODEL,
                }
            ),
        )
        if stage.status == "succeeded" and stage.output_artifact_ids:
            return await self._reused_outcome(run, stage)

        pages: list[PageArtPageResult] = []
        total_image_cost = 0.0
        total_vision_cost = 0.0
        output_ids: list[str] = []
        for plan in thumbnail_set.page_plans:
            compiled = compiled_by_plan[plan.page_plan_id]
            result = await self._render_page(
                run,
                stage,
                thumbnail_artifact,
                plan,
                compiled,
                image_budget_usd=image_budget_usd,
                spent_so_far=total_image_cost,
            )
            total_image_cost += result.image_cost_usd
            total_vision_cost += float(result.gate_summary.get("vision_cost_usd", 0.0))
            pages.append(result)
            if result.page_art_artifact_id:
                output_ids.append(result.page_art_artifact_id)
            if result.composed_artifact_id:
                output_ids.append(result.composed_artifact_id)

        stage.trace = {
            "stage": STAGE_NAME,
            "image_model": PAGE_ART_MODEL,
            "vision_model": self._vision_policy.model,
            "total_image_cost_usd": total_image_cost,
            "total_vision_cost_usd": total_vision_cost,
            "pages": [
                {
                    "page_index": item.page_index,
                    "mode": item.mode,
                    "status": item.status,
                    "attempts": item.attempts,
                    "image_cost_usd": item.image_cost_usd,
                }
                for item in pages
            ],
        }
        await self._succeed_stage(run, stage, output_ids)
        return PageArtOutcome(
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            pages=pages,
            total_image_cost_usd=total_image_cost,
            total_vision_cost_usd=total_vision_cost,
        )

    async def recompose_pages(
        self,
        *,
        project_id: str,
        run_id: str,
        thumbnail_artifact_id: str | None = None,
    ) -> list[ArtifactDoc]:
        """Compose-only pass over the latest accepted page_art (ZERO image
        cost): re-letters every page with the CURRENT composition code and
        persists superseding ``composed_page`` rows. This is how composition
        improvements (tails, bubble shapes, avoidance) reach accepted art
        without re-keying — or re-spending — the paid page-art stage; it is
        also the lane-A composition entry (pages without art compose from
        the white DSL base)."""
        run = await self._authorized_run(project_id, run_id)
        if thumbnail_artifact_id is not None:
            thumbnail_artifact = await self._explicit_thumbnail(
                run, thumbnail_artifact_id
            )
        else:
            thumbnail_artifact = await self._accepted_stage_output(
                run, stage_name="manga_thumbnail", kind="thumbnail_set"
            )
        thumbnail_set = ThumbnailSet.model_validate(thumbnail_artifact.content)
        compiled_by_plan = await self._compiled_layouts(run, thumbnail_artifact)

        art_by_page: dict[int, ArtifactDoc] = {}
        for plan in thumbnail_set.page_plans:
            page_index = plan.page_script.page_index
            art_id = await self._latest_accepted_for_page(
                run, kind="page_art", page_index=page_index
            )
            if art_id is not None:
                artifact = await self._repositories.get_artifact(art_id)
                if artifact is not None:
                    art_by_page[page_index] = artifact

        stage = await self._start_stage(
            run,
            input_artifact_ids=[
                thumbnail_artifact.artifact_id,
                *[artifact.artifact_id for artifact in art_by_page.values()],
            ],
            input_hash=content_hash(
                {
                    "thumbnail_hash": thumbnail_artifact.content_hash,
                    "composition_version": COMPOSITION_VERSION,
                    "page_art_hashes": {
                        str(index): artifact.content_hash
                        for index, artifact in sorted(art_by_page.items())
                    },
                }
            ),
            stage_name=COMPOSE_STAGE_NAME,
        )
        if stage.status == "succeeded" and stage.output_artifact_ids:
            existing = [
                artifact
                for artifact_id in stage.output_artifact_ids
                if (artifact := await self._repositories.get_artifact(artifact_id))
                is not None
            ]
            return existing

        composed_artifacts: list[ArtifactDoc] = []
        for plan in thumbnail_set.page_plans:
            page_index = plan.page_script.page_index
            compiled = compiled_by_plan[plan.page_plan_id]
            art_artifact = art_by_page.get(page_index)
            art_image: Image.Image | None = None
            if art_artifact is not None and art_artifact.storage_ref:
                art_path = self._media_root / art_artifact.storage_ref.removeprefix(
                    "storage://"
                )
                if art_path.is_file():
                    art_image = Image.open(art_path).convert("RGB")
            composed = await self._persist_composed_page(
                run,
                stage,
                thumbnail_artifact,
                plan,
                compiled,
                art_image,
                art_artifact if art_image is not None else None,
            )
            composed_artifacts.append(composed)

        stage.trace = {
            "stage": COMPOSE_STAGE_NAME,
            "composition_version": COMPOSITION_VERSION,
            "pages": [
                {
                    "page_index": artifact.content.get("page_index"),
                    "has_art": artifact.content.get("has_art"),
                    "supersedes": artifact.supersedes_artifact_id,
                }
                for artifact in composed_artifacts
                if artifact.content is not None
            ],
        }
        await self._succeed_stage(
            run, stage, [artifact.artifact_id for artifact in composed_artifacts]
        )
        return composed_artifacts

    # ------------------------------------------------------------------
    # per-page pipeline
    # ------------------------------------------------------------------

    async def _render_page(
        self,
        run: GenerationRunDoc,
        stage: StageRunDoc,
        thumbnail_artifact: ArtifactDoc,
        plan: MangaPagePlan,
        compiled: CompiledPageLayout,
        *,
        image_budget_usd: float,
        spent_so_far: float,
    ) -> PageArtPageResult:
        mode = rendering_mode_for_page(plan.page_script)
        result = PageArtPageResult(
            page_index=plan.page_script.page_index, mode=mode, status="dsl_only"
        )
        art_image: Image.Image | None = None
        page_art_artifact: ArtifactDoc | None = None
        # Session 6 (issue #5): regenerating over an earlier ACCEPTED page_art
        # chains lineage — the new row supersedes the latest prior accepted
        # art for the same page index (ADR-009: every revision retains its
        # parent lineage).
        supersedes: str | None = await self._latest_accepted_for_page(
            run,
            kind="page_art",
            page_index=plan.page_script.page_index,
            exclude_stage_run_id=stage.stage_run_id,
        )

        if mode == "C":
            attempt = 0
            failure_reason = ""
            while attempt < self._max_attempts:
                projected = spent_so_far + result.image_cost_usd + PAGE_ART_COST_PER_IMAGE_USD
                if projected > image_budget_usd:
                    result.status = (
                        "budget_exhausted" if attempt == 0 else result.status
                    )
                    logger.warning(
                        "page %s: image budget %.4f cannot cover another call "
                        "(projected %.4f) — degrading to DSL-only",
                        plan.page_script.page_index,
                        image_budget_usd,
                        projected,
                    )
                    break
                attempt += 1
                result.attempts = attempt
                call = await self._call_image_model(
                    run,
                    stage,
                    plan,
                    compiled,
                    attempt=attempt,
                    failure_reason=failure_reason,
                )
                result.receipt_artifact_ids.append(call["receipt_artifact_id"])
                result.image_cost_usd += call["cost_usd"]
                if call.get("image") is None:
                    failure_reason = "no image returned (refusal-class response)"
                    result.status = "rejected"
                    continue
                candidate: Image.Image = call["image"]
                gates, _vision_cost, gate_receipts = await self._gate_page(
                    run, stage, plan, compiled, candidate, attempt=attempt
                )
                result.receipt_artifact_ids.extend(gate_receipts)
                # Issue #7 (Session 6): every gated attempt persists a
                # durable QA report — rejected attempts included.
                qa_report = await self._persist_qa_report(
                    run, stage, plan, gates=gates, attempt=attempt
                )
                result.qa_report_artifact_ids.append(qa_report.artifact_id)
                # `gates` already carries this attempt's vision_cost_usd;
                # accumulate across attempts without double-counting.
                previous_vision = float(result.gate_summary.get("vision_cost_usd", 0.0))
                result.gate_summary = {
                    **gates,
                    "vision_cost_usd": previous_vision
                    + float(gates.get("vision_cost_usd", 0.0)),
                }
                if self._evidence_dir is not None:
                    # Session 5 live-run lesson: rejected attempts must stay
                    # inspectable — the first batch's rejected art was lost.
                    self._evidence_dir.mkdir(parents=True, exist_ok=True)
                    verdict = "accepted" if gates["accepted"] else "rejected"
                    candidate.save(
                        self._evidence_dir
                        / f"candidate_p{plan.page_script.page_index}_a{attempt}_{verdict}.png"
                    )
                if gates["accepted"]:
                    art_image = candidate
                    page_art_artifact = await self._persist_page_art(
                        run,
                        stage,
                        thumbnail_artifact,
                        plan,
                        compiled,
                        candidate,
                        gates=gates,
                        attempt=attempt,
                        cost_usd=call["cost_usd"],
                        receipt_artifact_id=call["receipt_artifact_id"],
                        supersedes=supersedes,
                    )
                    result.page_art_artifact_id = page_art_artifact.artifact_id
                    result.status = "art_accepted"
                    break
                failure_reason = gates["reject_reason"]
                result.status = "rejected"
                logger.warning(
                    "page %s attempt %s rejected: %s",
                    plan.page_script.page_index,
                    attempt,
                    failure_reason,
                )

        composed = await self._persist_composed_page(
            run,
            stage,
            thumbnail_artifact,
            plan,
            compiled,
            art_image,
            page_art_artifact,
        )
        result.composed_artifact_id = composed.artifact_id
        if result.status in {"rejected", "budget_exhausted"}:
            # A page without accepted art still ships as a valid DSL-only
            # page (issue #7 policy) — the failure evidence stays receipted.
            result.status = f"dsl_only_after_{result.status}"
        return result

    # ------------------------------------------------------------------
    # image call + receipts
    # ------------------------------------------------------------------

    @staticmethod
    def _panel_position_phrase(panel) -> str:
        """Spatial anchor for a brief line (PAGE_ART_VERSION v2): name the
        panel's position on the page from its compiled bbox so the image
        model binds content by GEOMETRY, not by badge-reading. The S7
        regen showed right content in wrong panels — briefs in RTL read
        order bound left-to-right without this."""
        bbox = panel.bbox
        cx = bbox.x + bbox.width / 2
        cy = bbox.y + bbox.height / 2
        row = "top" if cy < 1 / 3 else "middle" if cy < 2 / 3 else "bottom"
        column = "left" if cx < 1 / 3 else "center" if cx < 2 / 3 else "right"
        if bbox.width > 0.8:
            return f"the full-width {row} panel"
        return f"the {row}-{column} panel"

    def _panel_briefs(self, plan: MangaPagePlan, compiled: CompiledPageLayout) -> str:
        script_by_id = {p.panel_id: p for p in plan.page_script.panels}
        lines = []
        for panel in sorted(compiled.panels, key=lambda item: item.read_rank):
            script = script_by_id[panel.panel_id]
            subjects = ", ".join(b.subject_ref for b in script.blocking) or "no named characters"
            lines.append(
                f"Panel {panel.read_rank + 1} (badge {panel.read_rank + 1}, "
                f"{self._panel_position_phrase(panel)}): "
                f"{script.camera.shot} shot, {script.purpose} — {script.story_beat} "
                f"[{subjects}]"
            )
        return "\n".join(lines)

    def _image_prompt(
        self,
        plan: MangaPagePlan,
        compiled: CompiledPageLayout,
        *,
        attempt: int,
        failure_reason: str,
    ) -> str:
        rules = HARD_RULES.format(panel_count=len(compiled.panels))
        if attempt > 1 and failure_reason:
            rules += RETRY_HARDENING.format(reason=failure_reason)
        return (
            "The FIRST attached image is the exact panel layout skeleton of a "
            "manga page: thick black borders are the panel frames and the "
            "numbered badges give the reading order. Reproduce its panel "
            "borders precisely and fill each panel, following the numbered "
            "reading order, with these briefs. The other attached images are "
            "character reference sheets.\n\n"
            + self._panel_briefs(plan, compiled)
            + "\n\n"
            + rules
        )

    async def _call_image_model(
        self,
        run: GenerationRunDoc,
        stage: StageRunDoc,
        plan: MangaPagePlan,
        compiled: CompiledPageLayout,
        *,
        attempt: int,
        failure_reason: str,
    ) -> dict[str, Any]:
        skeleton = render_conditioning_skeleton(compiled)
        content: list[dict[str, Any]] = [
            {
                "type": "text",
                "text": self._image_prompt(
                    plan, compiled, attempt=attempt, failure_reason=failure_reason
                ),
            },
            {"type": "image_url", "image_url": {"url": _image_data_url(skeleton)}},
        ]
        for ref in self._character_reference_paths:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": _file_data_url(ref)},
                }
            )
        payload = {
            "model": PAGE_ART_MODEL,
            "messages": [{"role": "user", "content": content}],
            "modalities": ["image", "text"],
            "image_config": {"aspect_ratio": "2:3"},
            "usage": {"include": True},
        }
        started = time.time()
        error_text: str | None = None
        body: dict[str, Any] = {}
        try:
            body = await self._execute_image_call(payload)
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
            images = message.get("images") or []
            if images:
                raw = base64.b64decode(images[0]["image_url"]["url"].split(",", 1)[1])
                import io

                image = Image.open(io.BytesIO(raw)).convert("RGB")

        receipt = await self._persist_receipt(
            run,
            stage,
            purpose="page_art_image",
            provider="openrouter",
            model=PAGE_ART_MODEL,
            payload_summary={
                "page_index": plan.page_script.page_index,
                "attempt": attempt,
                "panel_count": len(compiled.panels),
                "conditioned": True,
            },
            usage=usage,
            cost_usd=cost,
            latency_ms=latency_ms,
            error=error_text,
            # Findings guardrail 5: capture the text body of no-image
            # responses — refusal diagnostics.
            response_text=response_text if image is None else None,
            n_images=1 if image is not None else 0,
        )
        return {
            "image": image,
            "cost_usd": cost,
            "receipt_artifact_id": receipt.artifact_id,
        }

    async def _execute_image_call(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self._image_caller is not None:
            return await self._image_caller(payload)
        if not self._openrouter_api_key:
            raise ArtifactValidationError(
                "OPENROUTER_API_KEY is required for lane-C page art"
            )
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {self._openrouter_api_key}"},
                json=payload,
            )
        response.raise_for_status()
        return response.json()

    # ------------------------------------------------------------------
    # gates
    # ------------------------------------------------------------------

    async def _gate_page(
        self,
        run: GenerationRunDoc,
        stage: StageRunDoc,
        plan: MangaPagePlan,
        compiled: CompiledPageLayout,
        candidate: Image.Image,
        *,
        attempt: int = 0,
    ) -> tuple[dict[str, Any], float, list[str]]:
        receipts: list[str] = []
        scratch = self._media_root / "page-art" / "scratch"
        scratch.mkdir(parents=True, exist_ok=True)
        candidate_path = scratch / f"candidate_{stage.stage_run_id}_{plan.page_script.page_index}.png"
        candidate.save(candidate_path)

        ocr = ocr_gate(candidate_path)
        borders = border_adherence(candidate, compiled)

        vision_verdict: dict[str, Any] | None = None
        vision_cost = 0.0
        if self._vision_qa is not None:
            started = time.time()
            error_text: str | None = None
            try:
                vision_verdict = await self._vision_qa(
                    image_path=candidate_path,
                    briefs=self._panel_briefs(plan, compiled),
                    expected_panel_count=len(compiled.panels),
                    system_prompt=VISION_QA_SYSTEM,
                )
            except Exception as error:  # noqa: BLE001 — receipt then fail closed
                error_text = f"{type(error).__name__}: {error}"
            latency_ms = int((time.time() - started) * 1000)
            vision_cost = float((vision_verdict or {}).get("cost_usd") or 0.0)
            receipt = await self._persist_receipt(
                run,
                stage,
                purpose="manga_vision_qa",
                provider=self._vision_policy.provider,
                model=self._vision_policy.model,
                payload_summary={
                    "page_index": plan.page_script.page_index,
                    "attempt": attempt,
                    "expected_panel_count": len(compiled.panels),
                },
                usage=(vision_verdict or {}).get("usage"),
                cost_usd=vision_cost,
                latency_ms=latency_ms,
                error=error_text,
                response_text=json.dumps((vision_verdict or {}).get("parsed"))
                if vision_verdict
                else None,
                n_images=0,
            )
            receipts.append(receipt.artifact_id)
            if error_text is not None:
                vision_verdict = {"parsed": None, "error": error_text}

        parsed = (vision_verdict or {}).get("parsed") if vision_verdict else None
        vision_panel_count = parsed.get("panel_count") if isinstance(parsed, dict) else None
        vision_ok = bool(parsed.get("overall_ok")) if isinstance(parsed, dict) else None
        vision_text = (
            any(p.get("contains_text") for p in parsed.get("panels", []))
            if isinstance(parsed, dict)
            else None
        )
        vision_balloon = (
            any(p.get("empty_balloon") for p in parsed.get("panels", []))
            if isinstance(parsed, dict)
            else None
        )

        reject_reasons = []
        if not ocr.clean:
            reject_reasons.append(
                f"OCR gate found real text: {[w['text'] for w in ocr.text_words][:6]}"
            )
        if not borders.passed:
            reject_reasons.append(
                f"border adherence {borders.page_score:.2f} below {borders.threshold}"
            )
        if self._vision_qa is not None and isinstance(parsed, dict):
            if vision_panel_count != len(compiled.panels):
                reject_reasons.append(
                    f"vision QA counted {vision_panel_count} panels, "
                    f"expected {len(compiled.panels)}"
                )
            # GATE_POLICY_VERSION v2: the dictionary OCR gate is the text
            # authority; vision's contains_text stays ADVISORY (recorded
            # below), because it fires on drawn scribble/pseudo-glyph
            # texture (first live batch, both pages, OCR clean each time).
            if vision_ok is False:
                reject_reasons.append("vision QA overall_ok=false")
            # GATE_POLICY_VERSION v3 (issue #7): drawn empty balloon shapes
            # are a REJECT — lettering is code-owned and a generated balloon
            # fights the deterministic compositor.
            if vision_balloon:
                reject_reasons.append(
                    "vision QA found drawn empty balloon shapes "
                    "(lettering is code-owned)"
                )
        elif self._vision_qa is not None and parsed is None:
            reject_reasons.append("vision QA produced no parseable verdict")

        gates = {
            "accepted": not reject_reasons,
            "gate_policy_version": GATE_POLICY_VERSION,
            "vision_text_advisory": vision_text,
            "vision_empty_balloon": vision_balloon,
            "reject_reason": "; ".join(reject_reasons),
            "ocr": {
                "clean": ocr.clean,
                "text_words": ocr.text_words,
                "raw_word_count": ocr.raw_word_count,
                "gate_version": ocr.gate_version,
            },
            "border_adherence": {
                "page_score": borders.page_score,
                "panel_scores": borders.panel_scores,
                "passed": borders.passed,
                "threshold": borders.threshold,
                "metric_version": borders.metric_version,
            },
            "vision_qa": parsed,
            "vision_cost_usd": vision_cost,
        }
        candidate_path.unlink(missing_ok=True)
        return gates, vision_cost, receipts

    # ------------------------------------------------------------------
    # persistence
    # ------------------------------------------------------------------

    async def _persist_receipt(
        self,
        run: GenerationRunDoc,
        stage: StageRunDoc,
        *,
        purpose: str,
        provider: str,
        model: str,
        payload_summary: dict[str, Any],
        usage: dict[str, Any] | None,
        cost_usd: float,
        latency_ms: int,
        error: str | None,
        response_text: str | None,
        n_images: int,
    ) -> ArtifactDoc:
        content = {
            "schema_version": "provider-receipt.v1",
            "purpose": purpose,
            "provider": provider,
            "model": model,
            "request": payload_summary,
            "usage": usage,
            "cost_usd": cost_usd,
            "latency_ms": latency_ms,
            "error": error,
            "response_text": (response_text or "")[:8_000] or None,
            "n_images": n_images,
            "at": utc_now().isoformat(),
        }
        digest = content_hash(content)
        artifact = construct_document(
            ArtifactDoc,
            artifact_id=f"provider_receipt_{digest[:24]}",
            project_id=run.project_id,
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            kind="provider_receipt",
            schema_version="provider-receipt.v1",
            content=content,
            storage_ref=None,
            content_hash=digest,
            parent_artifact_ids=[],
            author="system",
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
        stored = await self._repositories.save_artifact(artifact)
        if self._evidence_dir is not None:
            self._evidence_dir.mkdir(parents=True, exist_ok=True)
            ledger = self._evidence_dir / "receipts.jsonl"
            with ledger.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(content) + "\n")
        return stored

    async def _persist_qa_report(
        self,
        run: GenerationRunDoc,
        stage: StageRunDoc,
        plan: MangaPagePlan,
        *,
        gates: dict[str, Any],
        attempt: int,
    ) -> ArtifactDoc:
        """Durable per-attempt QA report (issue #7): the full gate verdict —
        OCR, border adherence, vision QA, policy version — survives as its
        own artifact for accepted AND rejected attempts, instead of riding
        only accepted ``page_art`` rows."""
        content = {
            "schema_version": "qa-report.v1",
            "page_plan_id": plan.page_plan_id,
            "page_index": plan.page_script.page_index,
            "attempt": attempt,
            "gate_policy_version": GATE_POLICY_VERSION,
            "accepted": gates.get("accepted"),
            "gates": gates,
            "at": utc_now().isoformat(),
        }
        digest = content_hash(content)
        artifact = construct_document(
            ArtifactDoc,
            artifact_id=f"qa_report_{digest[:24]}",
            project_id=run.project_id,
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            kind="qa_report",
            schema_version="qa-report.v1",
            content=content,
            storage_ref=None,
            content_hash=digest,
            parent_artifact_ids=[],
            author="system",
            supersedes_artifact_id=None,
            source_refs=[],
            model_receipt=None,
            validation_status="accepted",
            validation_report={
                "passed": True,
                "issues": [],
                "validator_version": "qa-report.v1",
            },
            created_at=utc_now(),
        )
        return await self._repositories.save_artifact(artifact)

    async def _persist_page_art(
        self,
        run: GenerationRunDoc,
        stage: StageRunDoc,
        thumbnail_artifact: ArtifactDoc,
        plan: MangaPagePlan,
        compiled: CompiledPageLayout,
        image: Image.Image,
        *,
        gates: dict[str, Any],
        attempt: int,
        cost_usd: float,
        receipt_artifact_id: str,
        supersedes: str | None,
    ) -> ArtifactDoc:
        storage_ref, digest = self._store_image(image, "page-art")
        masks = render_panel_masks(compiled)
        slicing_map = {
            panel.panel_id: {
                "bbox": panel.bbox.model_dump(mode="json"),
                "clip_path": panel.clip_path,
                "read_rank": panel.read_rank,
                "mask_hash": binary_content_hash(masks[panel.panel_id].tobytes()),
            }
            for panel in compiled.panels
        }
        content = {
            "schema_version": "page-art.v1",
            "page_art_version": PAGE_ART_VERSION,
            "page_plan_id": plan.page_plan_id,
            "page_index": plan.page_script.page_index,
            "rendering_mode": "C",
            "image_model": PAGE_ART_MODEL,
            "attempt": attempt,
            "cost_usd": cost_usd,
            "conditioning": {
                "skeleton": "compiled-layout skeleton (thick borders + read badges)",
                "compiler_hash": compiled.compiler_hash,
                "character_references": [
                    str(path.name) for path in self._character_reference_paths
                ],
            },
            "gates": gates,
            "slicing_map": slicing_map,
            "receipt_artifact_id": receipt_artifact_id,
        }
        payload_hash = content_hash(content)
        artifact = construct_document(
            ArtifactDoc,
            artifact_id=f"page_art_{payload_hash[:24]}",
            project_id=run.project_id,
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            kind="page_art",
            schema_version="page-art.v1",
            content=content,
            storage_ref=storage_ref,
            content_hash=digest,
            parent_artifact_ids=[thumbnail_artifact.artifact_id, receipt_artifact_id],
            author="system",
            supersedes_artifact_id=supersedes,
            source_refs=[
                ref.model_dump(mode="json")
                for panel in plan.page_script.panels
                for ref in panel.source_refs
            ],
            model_receipt=None,
            validation_status="accepted",
            validation_report={
                "passed": True,
                "issues": [],
                "validator_version": PAGE_ART_VERSION,
            },
            created_at=utc_now(),
        )
        return await self._repositories.save_artifact(artifact)

    async def _persist_composed_page(
        self,
        run: GenerationRunDoc,
        stage: StageRunDoc,
        thumbnail_artifact: ArtifactDoc,
        plan: MangaPagePlan,
        compiled: CompiledPageLayout,
        art_image: Image.Image | None,
        page_art_artifact: ArtifactDoc | None,
    ) -> ArtifactDoc:
        if art_image is None:
            width, height = 832, 1248
            base = Image.new("RGB", (width, height), "white")
        else:
            base = art_image
        composed = compose_lettered_page(base, plan, compiled)
        storage_ref, digest = self._store_image(composed, "composed-pages")
        content = {
            "schema_version": "composed-page.v1",
            "page_plan_id": plan.page_plan_id,
            "page_index": plan.page_script.page_index,
            "has_art": art_image is not None,
            "lettering": "deterministic (code-owned, all text elements)",
            "composition_version": COMPOSITION_VERSION,
            "image_content_hash": digest,
            "text_element_count": len(plan.page_script.text_elements),
            "page_art_artifact_id": (
                page_art_artifact.artifact_id if page_art_artifact else None
            ),
        }
        supersedes = await self._latest_accepted_for_page(
            run,
            kind="composed_page",
            page_index=plan.page_script.page_index,
            exclude_stage_run_id=stage.stage_run_id,
        )
        parents = [thumbnail_artifact.artifact_id]
        if page_art_artifact is not None:
            parents.append(page_art_artifact.artifact_id)
        artifact = construct_document(
            ArtifactDoc,
            artifact_id=f"composed_page_{content_hash(content)[:24]}",
            project_id=run.project_id,
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            kind="composed_page",
            schema_version="composed-page.v1",
            content=content,
            storage_ref=storage_ref,
            content_hash=digest,
            parent_artifact_ids=parents,
            author="system",
            supersedes_artifact_id=supersedes,
            source_refs=[
                ref.model_dump(mode="json")
                for panel in plan.page_script.panels
                for ref in panel.source_refs
            ],
            model_receipt=None,
            validation_status="accepted",
            validation_report={
                "passed": True,
                "issues": [],
                "validator_version": "composed-page.v1",
            },
            created_at=utc_now(),
        )
        return await self._repositories.save_artifact(artifact)

    async def _latest_accepted_for_page(
        self,
        run: GenerationRunDoc,
        *,
        kind: str,
        page_index: int,
        exclude_stage_run_id: str | None = None,
    ) -> str | None:
        """Latest prior accepted page-scoped artifact — the supersedes link.

        Run-scoped on purpose: every v2-lane artifact for a project's pages
        lives on the project's direction run, so the lineage chain stays
        inside the run the way ADR-009 resume expects.
        """
        artifacts = await self._repositories.list_artifacts(
            run.run_id, accepted_only=True
        )
        rows = [
            artifact
            for artifact in artifacts
            if artifact.kind == kind
            and artifact.content is not None
            and artifact.content.get("page_index") == page_index
            and (
                exclude_stage_run_id is None
                or artifact.stage_run_id != exclude_stage_run_id
            )
        ]
        if not rows:
            return None
        return max(rows, key=lambda artifact: artifact.created_at).artifact_id

    def _store_image(self, image: Image.Image, folder: str) -> tuple[str, str]:
        import io

        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        data = buffer.getvalue()
        digest = binary_content_hash(data)
        relative = Path(folder) / f"{digest}.png"
        path = self._media_root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_bytes(data)
        return f"storage://{relative.as_posix()}", digest

    # ------------------------------------------------------------------
    # run/stage scaffolding (planner conventions)
    # ------------------------------------------------------------------

    async def _authorized_run(self, project_id: str, run_id: str) -> GenerationRunDoc:
        run = await self._repositories.get_run(run_id)
        if run is None:
            raise NotFoundError(f"Generation run {run_id} does not exist")
        if run.project_id != project_id:
            raise ArtifactValidationError("Run does not belong to the requested project")
        if run.status not in {"running", "succeeded", "failed"}:
            raise ArtifactValidationError(
                f"Run {run_id} is in state {run.status}; refusing to extend it"
            )
        return run

    async def _explicit_thumbnail(
        self, run: GenerationRunDoc, thumbnail_artifact_id: str
    ) -> ArtifactDoc:
        artifact = await self._repositories.get_artifact(thumbnail_artifact_id)
        if (
            artifact is None
            or artifact.run_id != run.run_id
            or artifact.project_id != run.project_id
            or artifact.kind != "thumbnail_set"
            or artifact.validation_status != "accepted"
            or artifact.content is None
        ):
            raise ArtifactValidationError(
                f"{thumbnail_artifact_id} is not an accepted thumbnail_set on "
                f"run {run.run_id}"
            )
        return artifact

    async def _accepted_stage_output(
        self, run: GenerationRunDoc, *, stage_name: str, kind: str
    ) -> ArtifactDoc:
        stages = await self._repositories.list_stages(run.run_id)
        # Latest succeeded stage wins (Session 6: a run may carry several
        # succeeded planning stages after a re-planning pass).
        candidates = sorted(
            (
                item
                for item in stages
                if item.stage_name == stage_name and item.status == "succeeded"
            ),
            key=lambda item: item.started_at,
            reverse=True,
        )
        stage = candidates[0] if candidates else None
        if stage is None or not stage.output_artifact_ids:
            raise ArtifactValidationError(
                f"Run {run.run_id} has no succeeded {stage_name} stage"
            )
        artifact = await self._repositories.get_artifact(stage.output_artifact_ids[0])
        if (
            artifact is None
            or artifact.kind != kind
            or artifact.validation_status != "accepted"
            or artifact.content is None
        ):
            raise ArtifactValidationError(
                f"Succeeded {stage_name} stage lacks an accepted {kind} artifact"
            )
        return artifact

    async def _compiled_layouts(
        self, run: GenerationRunDoc, thumbnail_artifact: ArtifactDoc
    ) -> dict[str, CompiledPageLayout]:
        artifacts = await self._repositories.list_artifacts(
            run.run_id, accepted_only=True
        )
        compiled: dict[str, CompiledPageLayout] = {}
        for artifact in artifacts:
            if artifact.kind != "compiled_layout" or artifact.content is None:
                continue
            try:
                layout = CompiledPageLayout.model_validate(artifact.content)
            except ValidationError:
                continue
            compiled[layout.page_plan_id] = layout
        thumbnail_set = ThumbnailSet.model_validate(thumbnail_artifact.content)
        missing = [
            plan.page_plan_id
            for plan in thumbnail_set.page_plans
            if plan.page_plan_id not in compiled
        ]
        if missing:
            raise ArtifactValidationError(
                f"Accepted thumbnail lineage lacks compiled layouts for {missing}"
            )
        return compiled

    async def _start_stage(
        self,
        run: GenerationRunDoc,
        *,
        input_artifact_ids: list[str],
        input_hash: str,
        stage_name: str = STAGE_NAME,
    ) -> StageRunDoc:
        identity = content_hash(
            {
                "project_id": run.project_id,
                "run_id": run.run_id,
                "stage_name": stage_name,
                "input_hash": input_hash,
            }
        )
        stage_run_id = f"stage_{stage_name}_{identity[:20]}"
        existing = await self._repositories.get_stage(stage_run_id)
        if existing is not None:
            if existing.status == "failed":
                existing.attempt += 1
                existing.status = "running"
                existing.error_code = None
                existing.error_detail = None
                existing.trace = None
                existing.output_artifact_ids = []
                existing.started_at = utc_now()
                existing.ended_at = None
                existing = await self._repositories.save_stage(existing)
            if existing.status in {"running", "validating", "repairing"}:
                run.status = "running"
                run.active_stage = stage_name
                run.updated_at = utc_now()
                await self._repositories.save_run(run)
            return existing
        now = utc_now()
        stage = construct_document(
            StageRunDoc,
            stage_run_id=stage_run_id,
            run_id=run.run_id,
            stage_name=stage_name,
            attempt=1,
            status="running",
            input_artifact_ids=input_artifact_ids,
            input_hash=input_hash,
            output_artifact_ids=[],
            idempotency_key=identity,
            agent_session_id=None,
            error_code=None,
            error_detail=None,
            started_at=now,
            ended_at=None,
        )
        run.status = "running"
        run.active_stage = stage_name
        run.updated_at = now
        await self._repositories.save_run(run)
        return await self._repositories.save_stage(stage)

    async def _succeed_stage(
        self, run: GenerationRunDoc, stage: StageRunDoc, output_ids: list[str]
    ) -> None:
        now = utc_now()
        stage.status = "succeeded"
        stage.output_artifact_ids = output_ids
        stage.error_code = None
        stage.error_detail = None
        stage.ended_at = now
        await self._repositories.save_stage(stage)
        run.status = "succeeded"
        run.active_stage = None
        run.updated_at = now
        await self._repositories.save_run(run)

    async def _reused_outcome(
        self, run: GenerationRunDoc, stage: StageRunDoc
    ) -> PageArtOutcome:
        pages: list[PageArtPageResult] = []
        trace = stage.trace or {}
        for row in trace.get("pages", []):
            pages.append(
                PageArtPageResult(
                    page_index=int(row.get("page_index", 0)),
                    mode=str(row.get("mode", "C")),
                    status=str(row.get("status", "reused")),
                    attempts=int(row.get("attempts", 0)),
                    image_cost_usd=float(row.get("image_cost_usd", 0.0)),
                )
            )
        return PageArtOutcome(
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            pages=pages,
            total_image_cost_usd=float(trace.get("total_image_cost_usd", 0.0)),
            total_vision_cost_usd=float(trace.get("total_vision_cost_usd", 0.0)),
            reused=True,
        )


def _image_data_url(image: Image.Image) -> str:
    import io

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def _file_data_url(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()
