"""
orchestrator.py — Manga Generation Orchestrator
=================================================
The conductor of the entire manga generation pipeline.
Coordinates all agents and manages the flow:

1. UNDERSTAND — Receive full text context from upstream stages
2. PLAN — Create manga structure (planner agent)
3. ESTIMATE — Pre-flight cost estimation before burning tokens
4. GENERATE — Create Living Panel DSLs (TRUE parallel, all panels)
5. VALIDATE — Check all DSLs, fix issues
6. ASSEMBLE — Combine into final manga structure

Key features:
- TRUE parallel DSL generation (all panels at once, semaphore for rate limit)
- Pre-flight cost estimation before any DSL generation
- Adjacent panel context for pacing/continuity awareness
- Credit tracking with cancel support
- Granular real-time status updates
- Graceful degradation (fallback DSLs if LLM fails)
"""

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Callable, Optional

from app.llm_client import LLMClient
from app.models import SummaryStyle
from app.agents.planner import MangaPlan, PanelAssignment, plan_manga
from app.agents.dsl_generator import generate_panel_dsl
from app.agents.credit_tracker import CreditTracker

logger = logging.getLogger(__name__)

# Max concurrent LLM calls (avoid rate limits)
MAX_CONCURRENT_DSL_AGENTS = 4

# Avg tokens per DSL generation call (system + user + output)
AVG_TOKENS_PER_DSL_CALL = 2500


@dataclass
class OrchestratorResult:
    """Final output of the orchestrator."""
    living_panels: list[dict]          # All DSLs in chapter/page/panel order
    manga_plan: Optional[MangaPlan]
    cost_snapshot: dict
    total_time_s: float
    panels_generated: int
    panels_failed: int
    cancelled: bool
    image_panel_ids: list[str]         # Panel IDs that should get AI images


class MangaOrchestrator:
    """
    Orchestrates the full manga generation pipeline.

    Usage:
        orchestrator = MangaOrchestrator(llm_client, style, ...)
        result = await orchestrator.run(
            canonical_chapters=chapters,
            book_synopsis=synopsis,
            manga_bible=bible,
        )
    """

    def __init__(
        self,
        llm_client: LLMClient,
        style: SummaryStyle,
        credit_tracker: Optional[CreditTracker] = None,
        progress_callback: Optional[Callable] = None,
        cancel_check: Optional[Callable] = None,
        image_budget: int = 5,
        max_concurrent: int = MAX_CONCURRENT_DSL_AGENTS,
    ):
        self.llm = llm_client
        self.style = style
        self.tracker = credit_tracker
        self.progress_cb = progress_callback
        self.cancel_check = cancel_check
        self.image_budget = image_budget
        self.max_concurrent = max_concurrent
        self._semaphore = asyncio.Semaphore(max_concurrent)
        # Cancel flag — checked once, cached to avoid repeated DB hits
        self._cancel_cache_time: float = 0
        self._cancel_cached: bool = False

    def _report(self, pct: int, msg: str, stage: str = "", detail: dict = None):
        """Send progress update."""
        if self.progress_cb:
            update = {"progress": pct, "message": msg, "stage": stage}
            if detail:
                update["detail"] = detail
            if self.tracker:
                update["cost"] = self.tracker.snapshot.to_dict()
            self.progress_cb(pct, msg, update)

    def _is_cancelled(self) -> bool:
        """Check cancellation with 5-second cache to avoid DB thrashing."""
        now = time.time()
        if now - self._cancel_cache_time < 5.0:
            return self._cancel_cached

        self._cancel_cache_time = now
        if self.cancel_check and self.cancel_check():
            self._cancel_cached = True
            return True
        if self.tracker and self.tracker.should_cancel():
            self._cancel_cached = True
            return True
        self._cancel_cached = False
        return False

    async def run(
        self,
        canonical_chapters: list[dict],
        book_synopsis: dict,
        manga_bible: dict,
    ) -> OrchestratorResult:
        """Execute the full manga generation pipeline."""
        start_time = time.time()
        empty_result = lambda cancelled=True: OrchestratorResult(
            living_panels=[], manga_plan=None,
            cost_snapshot=self.tracker.snapshot.to_dict() if self.tracker else {},
            total_time_s=time.time() - start_time,
            panels_generated=0, panels_failed=0,
            cancelled=cancelled, image_panel_ids=[],
        )

        # ── PHASE 0: Credit check ──
        if self.tracker:
            self._report(0, "Checking credits...", "credit_check")
            await self.tracker.fetch_credits()
            remaining = self.tracker.snapshot.remaining_credits
            if remaining <= 0:
                self._report(0, f"No credits remaining (${remaining:.4f})", "error")
                return empty_result()
            self._report(2, f"Credits: ${remaining:.4f} remaining", "credit_check")

        # ── PHASE 1: Planning (style-aware) ──
        self._report(5, "Planning manga structure...", "planning")

        try:
            manga_plan = await plan_manga(
                canonical_chapters=canonical_chapters,
                book_synopsis=book_synopsis,
                manga_bible=manga_bible,
                llm_client=self.llm,
                image_budget=self.image_budget,
                style=self.style,
            )
            logger.info(
                f"Manga plan: {manga_plan.total_panels} panels, "
                f"{manga_plan.total_pages} pages, "
                f"{manga_plan.total_chapters} chapters"
            )
        except Exception as e:
            logger.error(f"Planning failed: {e}")
            from app.agents.planner import _generate_fallback_plan
            manga_plan = _generate_fallback_plan(canonical_chapters, manga_bible)

        if self._is_cancelled():
            return self._cancelled_result(manga_plan, start_time)

        self._report(
            10,
            f"Plan ready: {manga_plan.total_panels} panels across "
            f"{manga_plan.total_pages} pages",
            "planning",
            {"total_panels": manga_plan.total_panels, "total_pages": manga_plan.total_pages},
        )

        # ── PHASE 2: Pre-flight cost estimation ──
        if self.tracker:
            # 1 planner call already done + N DSL calls to go
            est = self.tracker.estimate_remaining_cost(
                remaining_calls=manga_plan.total_panels,
                avg_tokens=AVG_TOKENS_PER_DSL_CALL,
            )
            total_est = self.tracker.snapshot.run_cost + est
            remaining = self.tracker.snapshot.remaining_credits
            if remaining > 0 and total_est > remaining * 0.9:
                logger.warning(
                    f"Estimated cost ${total_est:.4f} may exceed "
                    f"remaining ${remaining:.4f}"
                )
                self._report(
                    11,
                    f"Warning: estimated cost ~${total_est:.4f} "
                    f"(${remaining:.4f} remaining)",
                    "cost_warning",
                )

        # ── PHASE 3: TRUE Parallel DSL Generation ──
        # ALL panels fire at once. Semaphore limits concurrency.
        # No artificial chapter-by-chapter serialization.
        self._report(12, "Generating Living Panel DSLs...", "generating")

        ch_summaries = {
            ch.get("chapter_index", i): ch
            for i, ch in enumerate(canonical_chapters)
        }

        # Build adjacent panel context for pacing awareness
        panel_neighbors = self._build_neighbor_context(manga_plan.panels)

        # Fire ALL panels in parallel (semaphore controls concurrency)
        tasks = [
            self._generate_with_semaphore(
                assignment=p,
                manga_bible=manga_bible,
                chapter_summary=ch_summaries.get(p.chapter_index),
                neighbor_context=panel_neighbors.get(p.panel_id, ""),
            )
            for p in manga_plan.panels
        ]

        all_panel_results = await asyncio.gather(*tasks, return_exceptions=True)

        # Map results back to panel_ids
        all_results = {}
        for i, (assignment, result) in enumerate(
            zip(manga_plan.panels, all_panel_results)
        ):
            if isinstance(result, Exception):
                logger.error(f"Panel {assignment.panel_id} exception: {result}")
                all_results[assignment.panel_id] = {
                    "dsl": None, "success": False, "error": str(result)
                }
            else:
                all_results[assignment.panel_id] = result

            done_count = i + 1
            pct = 12 + int((done_count / manga_plan.total_panels) * 78)
            self._report(
                pct,
                f"Panel {done_count}/{manga_plan.total_panels}: "
                f"{assignment.panel_id}",
                "generating",
                {
                    "panel_id": assignment.panel_id,
                    "done": done_count,
                    "total": manga_plan.total_panels,
                },
            )

        # ── PHASE 4: Assemble ──
        self._report(92, "Assembling manga...", "assembling")

        living_panels = []
        panels_ok = 0
        panels_fail = 0
        image_panel_ids = []

        for assignment in manga_plan.panels:
            result = all_results.get(assignment.panel_id, {})
            dsl = result.get("dsl")

            if dsl:
                living_panels.append(dsl)
                if result.get("success"):
                    panels_ok += 1
                else:
                    panels_fail += 1
            else:
                from app.generate_living_panels import generate_fallback_living_panel
                fallback = generate_fallback_living_panel({
                    "content_type": assignment.content_type,
                    "text": assignment.text_content,
                    "dialogue": assignment.dialogue,
                    "character": assignment.character,
                    "expression": assignment.expression,
                    "visual_mood": assignment.visual_mood,
                    "position": "main",
                })
                living_panels.append(fallback)
                panels_fail += 1

            # Collect panels that should get AI images
            if assignment.image_budget:
                image_panel_ids.append(assignment.panel_id)

        elapsed = time.time() - start_time

        self._report(
            100,
            f"Done! {panels_ok} panels generated, {panels_fail} fallbacks. "
            f"{elapsed:.1f}s total.",
            "complete",
            {
                "panels_ok": panels_ok,
                "panels_fail": panels_fail,
                "time_s": round(elapsed, 1),
                "image_panels": len(image_panel_ids),
            },
        )

        return OrchestratorResult(
            living_panels=living_panels,
            manga_plan=manga_plan,
            cost_snapshot=self.tracker.snapshot.to_dict() if self.tracker else {},
            total_time_s=elapsed,
            panels_generated=panels_ok,
            panels_failed=panels_fail,
            cancelled=False,
            image_panel_ids=image_panel_ids,
        )

    def _build_neighbor_context(self, panels: list[PanelAssignment]) -> dict[str, str]:
        """
        Build a short context string for each panel describing its neighbors.
        This gives DSL agents awareness of pacing and visual continuity.
        """
        neighbors = {}
        for i, p in enumerate(panels):
            parts = []
            if i > 0:
                prev = panels[i - 1]
                parts.append(
                    f"PREVIOUS panel: {prev.content_type} / {prev.visual_mood} "
                    f"/ layout={prev.layout_hint}"
                )
            if i < len(panels) - 1:
                nxt = panels[i + 1]
                parts.append(
                    f"NEXT panel: {nxt.content_type} / {nxt.visual_mood} "
                    f"/ layout={nxt.layout_hint}"
                )
            if parts:
                parts.insert(0, "\n=== ADJACENT PANELS (for pacing) ===")
                parts.append(
                    "Vary your pacing/layout from neighbors. "
                    "Don't repeat the same mood or layout as adjacent panels."
                )
            neighbors[p.panel_id] = "\n".join(parts)
        return neighbors

    async def _generate_with_semaphore(
        self,
        assignment: PanelAssignment,
        manga_bible: Optional[dict],
        chapter_summary: Optional[dict],
        neighbor_context: str = "",
    ) -> dict:
        """Generate DSL with concurrency limiting."""
        async with self._semaphore:
            if self._is_cancelled():
                return {"dsl": None, "success": False, "error": "Cancelled"}

            result = await generate_panel_dsl(
                assignment=assignment,
                llm_client=self.llm,
                manga_bible=manga_bible,
                chapter_summary=chapter_summary,
                neighbor_context=neighbor_context,
            )

            # Track cost
            if self.tracker and result.get("tokens"):
                self.tracker.record_call(
                    result["tokens"].get("input", 0),
                    result["tokens"].get("output", 0),
                )

            return result

    def _cancelled_result(
        self, plan: Optional[MangaPlan], start_time: float
    ) -> OrchestratorResult:
        reason = ""
        if self.tracker:
            reason = self.tracker.snapshot.cancel_reason
        self._report(0, f"Cancelled: {reason}", "cancelled")
        return OrchestratorResult(
            living_panels=[], manga_plan=plan,
            cost_snapshot=self.tracker.snapshot.to_dict() if self.tracker else {},
            total_time_s=time.time() - start_time,
            panels_generated=0, panels_failed=0,
            cancelled=True, image_panel_ids=[],
        )
