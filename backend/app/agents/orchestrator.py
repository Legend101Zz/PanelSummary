"""
orchestrator.py — Manga Generation Orchestrator
=================================================
The conductor of the entire manga generation pipeline.

Phases:
  0. Credit check
  1. Book analysis (synopsis + bible) — parallel
  2. Planning (structure + cost estimate)
  3. Parallel DSL generation — PER-PAGE, not per-panel
  4. Assembly + validation

Key design decisions:
  - Per-page generation: panels on the same page are generated
    together so the LLM can compose them as a visual unit.
    This cuts API calls from ~25 to ~8 and produces coordinated panels.
  - Previous chapter ending context for cross-chapter continuity.
  - Semaphore-limited concurrency for rate limit protection.
  - Graceful fallback: if a page fails, each panel gets individual fallback.
"""

import asyncio
import logging
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Callable, Optional

from app.llm_client import LLMClient
from app.models import SummaryStyle
from app.agents.planner import MangaPlan, PanelAssignment, plan_manga
from app.agents.dsl_generator import generate_page_dsls, generate_panel_dsl
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
    book_synopsis: dict = None         # Generated or passed-through synopsis
    manga_bible: dict = None           # Generated or passed-through bible
    bible_used: bool = True            # False if bible generation failed
    synopsis_used: bool = True         # False if synopsis generation failed


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
        book_synopsis: dict | None = None,
        manga_bible: dict | None = None,
        llm_client: Optional["LLMClient"] = None,
    ) -> OrchestratorResult:
        """Execute the full manga generation pipeline."""
        start_time = time.time()
        empty_result = lambda cancelled=True: OrchestratorResult(
            living_panels=[], manga_plan=None,
            cost_snapshot=self.tracker.snapshot.to_dict() if self.tracker else {},
            total_time_s=time.time() - start_time,
            panels_generated=0, panels_failed=0,
            cancelled=cancelled, image_panel_ids=[],
            book_synopsis=book_synopsis or {},
            manga_bible=manga_bible or {},
            bible_used=bible_ok,
            synopsis_used=synopsis_ok,
        )

        # ── PHASE 0: Credit check ──
        if self.tracker:
            self._report(0, "Checking credits...", "credits")
            await self.tracker.fetch_credits()
            remaining = self.tracker.snapshot.remaining_credits
            if remaining <= 0:
                self._report(0, f"No credits remaining (${remaining:.4f})", "error")
                return empty_result()
            self._report(2, f"Credits: ${remaining:.4f} remaining", "credits")

        # ── PHASE 1: Book Analysis (synopsis + bible IN PARALLEL) ──
        need_synopsis = not book_synopsis
        need_bible = not manga_bible
        bible_ok = True
        synopsis_ok = True

        if need_synopsis or need_bible:
            self._report(3, "Analyzing book world and narrative arc...", "analysis")

            async def _gen_synopsis():
                try:
                    from app.stage_book_synopsis import generate_book_synopsis
                    result = await generate_book_synopsis(
                        canonical_chapters=canonical_chapters,
                        llm_client=self.llm,
                    )
                    logger.info(f"Synopsis: {result.get('book_thesis', '')[:80]}")
                    return result
                except Exception as e:
                    logger.warning(f"Synopsis failed (non-fatal): {e}")
                    return {}

            async def _gen_bible():
                try:
                    from app.stage_manga_planner import generate_manga_bible
                    result = await generate_manga_bible(
                        book_synopsis=book_synopsis or {},
                        canonical_chapters=canonical_chapters,
                        style=self.style,
                        llm_client=self.llm,
                    )
                    n = len(result.get("characters", []))
                    logger.info(f"Bible: {n} characters")
                    return result
                except Exception as e:
                    logger.warning(f"Bible failed (non-fatal): {e}")
                    return {}

            tasks = []
            if need_synopsis:
                tasks.append(_gen_synopsis())
            if need_bible:
                tasks.append(_gen_bible())

            results = await asyncio.gather(*tasks)

            idx = 0
            if need_synopsis:
                book_synopsis = results[idx]
                idx += 1
            if need_bible:
                manga_bible = results[idx]

            # Track quality flags (issue 3.2: surface silent failures)
            bible_ok = bool(manga_bible and manga_bible.get("characters"))
            synopsis_ok = bool(book_synopsis and book_synopsis.get("book_thesis"))
            if not bible_ok:
                logger.warning("Bible generation failed or returned empty — quality will be degraded")
            if not synopsis_ok:
                logger.warning("Synopsis generation failed or returned empty — quality will be degraded")

            n_chars = len(manga_bible.get("characters", [])) if manga_bible else 0
            self._report(
                8, f"Analysis complete: {n_chars} characters mapped", "analysis",
                {
                    "characters": n_chars,
                    "has_synopsis": synopsis_ok,
                    "has_bible": bible_ok,
                },
            )

        if self._is_cancelled():
            return empty_result()

        # ── PHASE 2: Planning + Cost Estimate ──
        self._report(10, "Planning manga structure...", "planning")

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
                f"Plan: {manga_plan.total_panels} panels, "
                f"{manga_plan.total_pages} pages"
            )
        except Exception as e:
            logger.error(f"Planning failed: {e}")
            from app.agents.planner import _generate_fallback_plan
            manga_plan = _generate_fallback_plan(canonical_chapters, manga_bible)

        if self._is_cancelled():
            return self._cancelled_result(
                manga_plan, start_time, book_synopsis, manga_bible
            )

        # Cost estimation
        est_cost = None
        n_pages = len(self._group_panels_by_page(manga_plan.panels))
        if self.tracker:
            est = self.tracker.estimate_remaining_cost(
                remaining_calls=n_pages,  # per-page, not per-panel!
                avg_tokens=AVG_TOKENS_PER_DSL_CALL * 3,  # pages are bigger calls
            )
            est_cost = round(self.tracker.snapshot.run_cost + est, 4)
            remaining = self.tracker.snapshot.remaining_credits
            if remaining > 0 and est_cost > remaining * 0.9:
                logger.warning(
                    f"Est. cost ${est_cost} may exceed remaining ${remaining:.4f}"
                )

        self._report(
            15,
            f"Plan: {manga_plan.total_panels} panels across {n_pages} pages"
            + (f" (~${est_cost})" if est_cost else ""),
            "planning",
            {
                "total_panels": manga_plan.total_panels,
                "total_pages": n_pages,
                "estimated_cost": est_cost,
            },
        )

        # ── PHASE 3: Per-PAGE DSL Generation (parallel across pages) ──
        self._report(18, "Generating Living Panel DSLs...", "generating")

        ch_summaries = {
            ch.get("chapter_index", i): ch
            for i, ch in enumerate(canonical_chapters)
        }

        # Group panels by page for batch generation
        page_groups = self._group_panels_by_page(manga_plan.panels)
        total_panels = manga_plan.total_panels
        self._panels_completed = 0

        # Build chapter ending context for cross-chapter continuity (issue 2.6)
        chapter_endings = self._extract_chapter_endings(canonical_chapters)

        # Fire all pages in parallel (semaphore controls concurrency)
        page_tasks = [
            self._generate_page_with_semaphore(
                page_panels=panels,
                manga_bible=manga_bible,
                chapter_summary=ch_summaries.get(panels[0].chapter_index),
                total_panels=total_panels,
                prev_chapter_ending=chapter_endings.get(
                    panels[0].chapter_index - 1
                ) if panels[0].panel_index == 0 else None,
            )
            for _page_key, panels in sorted(page_groups.items())
        ]

        all_page_results = await asyncio.gather(
            *page_tasks, return_exceptions=True
        )

        # ── PHASE 4: Assemble ──
        self._report(90, "Assembling manga...", "assembling")

        living_panels = []
        panels_ok = 0
        panels_fail = 0
        image_panel_ids = []
        page_keys = sorted(page_groups.keys())

        for page_idx, page_result in enumerate(all_page_results):
            page_panels = page_groups[page_keys[page_idx]]

            if isinstance(page_result, Exception):
                logger.error(f"Page {page_keys[page_idx]} exception: {page_result}")
                # Full page failure — fallback for each panel
                for assignment in page_panels:
                    from app.generate_living_panels import (
                        generate_fallback_living_panel,
                    )
                    fb = generate_fallback_living_panel({
                        "content_type": assignment.content_type,
                        "text": assignment.text_content,
                        "dialogue": assignment.dialogue,
                        "character": assignment.character,
                        "expression": assignment.expression,
                        "visual_mood": assignment.visual_mood,
                        "position": "main",
                    })
                    living_panels.append(fb)
                    panels_fail += 1
                continue

            # page_result is a list of {dsl, tokens, success} dicts
            for i, panel_result in enumerate(page_result):
                assignment = page_panels[i] if i < len(page_panels) else None
                dsl = panel_result.get("dsl")

                if dsl:
                    living_panels.append(dsl)
                    if panel_result.get("success"):
                        panels_ok += 1
                    else:
                        panels_fail += 1
                else:
                    from app.generate_living_panels import (
                        generate_fallback_living_panel,
                    )
                    fb = generate_fallback_living_panel({
                        "content_type": assignment.content_type if assignment else "narration",
                        "text": assignment.text_content if assignment else "",
                        "dialogue": assignment.dialogue if assignment else [],
                        "character": assignment.character if assignment else None,
                        "expression": assignment.expression if assignment else "neutral",
                        "visual_mood": assignment.visual_mood if assignment else "dramatic-dark",
                        "position": "main",
                    })
                    living_panels.append(fb)
                    panels_fail += 1

                # Collect image-eligible panels
                if assignment and assignment.image_budget:
                    image_panel_ids.append(assignment.panel_id)

        elapsed = time.time() - start_time

        self._report(
            100,
            f"Done! {panels_ok} panels generated, {panels_fail} fallbacks. "
            f"{n_pages} pages, {elapsed:.1f}s total.",
            "complete",
            {
                "panels_ok": panels_ok,
                "panels_fail": panels_fail,
                "time_s": round(elapsed, 1),
                "image_panels": len(image_panel_ids),
                "pages": n_pages,
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
            book_synopsis=book_synopsis or {},
            manga_bible=manga_bible or {},
            bible_used=bible_ok,
            synopsis_used=synopsis_ok,
        )

    # ── Helpers ───────────────────────────────────────────────

    @staticmethod
    def _group_panels_by_page(
        panels: list[PanelAssignment],
    ) -> dict[tuple[int, int], list[PanelAssignment]]:
        """Group panels by (chapter_index, page_index) for per-page generation."""
        groups: dict[tuple[int, int], list[PanelAssignment]] = defaultdict(list)
        for p in panels:
            groups[(p.chapter_index, p.page_index)].append(p)
        # Sort panels within each page by panel_index
        for key in groups:
            groups[key].sort(key=lambda p: p.panel_index)
        return dict(groups)

    @staticmethod
    def _extract_chapter_endings(
        canonical_chapters: list[dict],
    ) -> dict[int, str]:
        """Extract the last narrative beat of each chapter for continuity."""
        endings = {}
        for ch in canonical_chapters:
            idx = ch.get("chapter_index", 0)
            # Use the one-liner as a compact chapter ending summary
            one_liner = ch.get("one_liner", "")
            if one_liner:
                endings[idx] = one_liner
        return endings

    async def _generate_page_with_semaphore(
        self,
        page_panels: list[PanelAssignment],
        manga_bible: Optional[dict],
        chapter_summary: Optional[dict],
        total_panels: int = 1,
        prev_chapter_ending: Optional[str] = None,
    ) -> list[dict]:
        """Generate DSLs for one page with concurrency limiting."""
        async with self._semaphore:
            if self._is_cancelled():
                return [
                    {"dsl": None, "success": False, "error": "Cancelled"}
                    for _ in page_panels
                ]

            results = await generate_page_dsls(
                page_panels=page_panels,
                llm_client=self.llm,
                style=self.style,
                manga_bible=manga_bible,
                chapter_summary=chapter_summary,
                prev_chapter_ending=prev_chapter_ending,
            )

            # Track cost
            if self.tracker:
                total_in = sum(r.get("tokens", {}).get("input", 0) for r in results)
                total_out = sum(r.get("tokens", {}).get("output", 0) for r in results)
                if total_in or total_out:
                    self.tracker.record_call(total_in, total_out)

            # Report per-panel progress
            self._panels_completed += len(page_panels)
            done = self._panels_completed
            pct = 18 + int((done / total_panels) * 70)  # 18% to 88%
            page_key = f"ch{page_panels[0].chapter_index}-pg{page_panels[0].page_index}"
            self._report(
                pct,
                f"Page {page_key}: {len(page_panels)} panels ({done}/{total_panels} total)",
                "generating",
                {"panels_ok": done, "total_panels": total_panels},
            )

            return results

    def _cancelled_result(
        self, plan: Optional[MangaPlan], start_time: float,
        book_synopsis: dict = None, manga_bible: dict = None,
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
            book_synopsis=book_synopsis or {},
            manga_bible=manga_bible or {},
        )
