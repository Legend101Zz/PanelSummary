"""
orchestrator.py — Manga Generation Orchestrator
=================================================
The conductor of the entire manga generation pipeline.

Architecture (v3 — "Understand → Graph → Arc → Compose → Render"):
  0. Credit check
  1. Deep Document Understanding — build a Knowledge Document
  2. Knowledge Graph — extract entities + relationships as a graph
  3. Narrative Arc — map graph to 3-act structure with beats
  4. Manga Story Design — LLM designs characters, world, scenes
  5. Planning — map scenes to panel assignments with budgets
  6. Scene Composition — enrich panels with illustration directions
  7. Parallel DSL generation — PER-PAGE, with illustration data
  8. Assembly + validation
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
from app.v4_dsl_generator import generate_v4_page
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
    engine: str = "v2"                 # Which engine was used
    v4_pages: list[dict] = None        # V4 page data (layout + panels grouped)


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
        engine: str = "v2",   # "v2" | "v4" | "auto" (per-page routing)
        # Optional sprite generation params — safe defaults = disabled
        book_id: str = "",
        image_dir: str = "",
        image_api_key: str = "",
    ):
        self.llm = llm_client
        self.style = style
        self.tracker = credit_tracker
        self.progress_cb = progress_callback
        self.cancel_check = cancel_check
        self.image_budget = image_budget
        self.max_concurrent = max_concurrent
        self.engine = engine
        self.book_id = book_id
        self.image_dir = image_dir
        self.image_api_key = image_api_key
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
        book_synopsis = book_synopsis or {}
        manga_bible = manga_bible or {}
        bible_ok = False
        synopsis_ok = False

        def empty_result(cancelled=True):
            return OrchestratorResult(
                living_panels=[], manga_plan=None,
                cost_snapshot=self.tracker.snapshot.to_dict() if self.tracker else {},
                total_time_s=time.time() - start_time,
                panels_generated=0, panels_failed=0,
                cancelled=cancelled, image_panel_ids=[],
                book_synopsis=book_synopsis,
                manga_bible=manga_bible,
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

        # ── PHASE 1: Deep Document Understanding ──
        bible_ok = True
        synopsis_ok = True
        manga_blueprint = None

        self._report(3, "Deeply analyzing document content...", "understanding")

        try:
            from app.stage_document_understanding import generate_document_understanding
            knowledge_doc = await generate_document_understanding(
                canonical_chapters=canonical_chapters,
                llm_client=self.llm,
            )
            n_entities = len(knowledge_doc.get("key_entities", []))
            n_data = len(knowledge_doc.get("data_points", []))
            self._report(
                8, f"Understanding complete: {n_entities} entities, {n_data} data points",
                "understanding",
            )
        except Exception as e:
            logger.warning(f"Document understanding failed (non-fatal): {e}")
            knowledge_doc = {}

        if self._is_cancelled():
            return empty_result()

        # ── PHASE 1b: Knowledge Graph (rule-based, no LLM) ──
        knowledge_graph = None
        narrative_arc = None
        narrative_arc_dict = None

        try:
            from app.knowledge_graph import build_knowledge_graph
            knowledge_graph = build_knowledge_graph(knowledge_doc)
            kg_stats = knowledge_graph.to_dict().get("stats", {})
            self._report(
                9, f"Knowledge graph: {kg_stats.get('entity_count', 0)} entities, "
                   f"{kg_stats.get('edge_count', 0)} relationships",
                "knowledge_graph",
            )
        except Exception as e:
            logger.warning(f"Knowledge graph construction failed (non-fatal): {e}")

        # ── PHASE 1c: Narrative Arc (rule-based, no LLM) ──
        if knowledge_graph:
            try:
                from app.narrative_arc import build_narrative_arc
                narrative_arc = build_narrative_arc(
                    graph=knowledge_graph,
                    knowledge_doc=knowledge_doc,
                    canonical_chapters=canonical_chapters,
                )
                narrative_arc_dict = narrative_arc.to_dict()
                self._report(
                    10, f"Narrative arc: {narrative_arc.total_beats} beats across 3 acts",
                    "narrative_arc",
                )
            except Exception as e:
                logger.warning(f"Narrative arc construction failed (non-fatal): {e}")

        if self._is_cancelled():
            return empty_result()

        # ── PHASE 2: Manga Story Design (replaces old synopsis + bible) ──
        self._report(12, "Designing manga story architecture...", "story_design")

        try:
            from app.stage_manga_story_design import (
                generate_manga_story_design,
                blueprint_to_synopsis,
                blueprint_to_bible,
            )
            manga_blueprint = await generate_manga_story_design(
                knowledge_doc=knowledge_doc,
                canonical_chapters=canonical_chapters,
                style=self.style,
                llm_client=self.llm,
            )

            # Convert blueprint to synopsis/bible for backward compatibility
            # with planner and DSL generator
            book_synopsis = blueprint_to_synopsis(manga_blueprint)
            manga_bible = blueprint_to_bible(manga_blueprint, canonical_chapters)

            synopsis_ok = bool(book_synopsis.get("book_thesis"))
            bible_ok = bool(manga_bible.get("characters"))

            n_scenes = len(manga_blueprint.get("scenes", []))
            n_chars = len(manga_blueprint.get("characters", []))
            self._report(
                15,
                f"Story designed: {n_scenes} scenes, {n_chars} characters",
                "story_design",
                {
                    "scenes": n_scenes,
                    "characters": n_chars,
                    "has_synopsis": synopsis_ok,
                    "has_bible": bible_ok,
                },
            )
        except Exception as e:
            logger.error(f"Story design failed: {e}", exc_info=True)
            # Fall back to old-style synopsis + bible
            book_synopsis = book_synopsis or {}
            manga_bible = manga_bible or {}
            synopsis_ok = False
            bible_ok = False
            self._report(15, "Story design failed — using fallback", "story_design")

        if self._is_cancelled():
            return empty_result()

        # ── PHASE 2b: Character Sprite Generation (optional) ──
        # Generates 1 portrait image per main character (max 4 calls).
        # Results are injected post-hoc into every DSL that references that character —
        # giving the manga consistent character visuals without changing LLM prompts.
        character_sprites: dict[str, str] = {}   # char_name → relative image path
        if self.image_api_key and self.book_id and self.image_dir and manga_blueprint:
            try:
                import os
                import re
                from app.image_generator import generate_character_sprite, MAX_SPRITES_PER_BOOK
                characters = manga_blueprint.get("characters", [])
                max_sprites = min(MAX_SPRITES_PER_BOOK, len(characters))
                self._report(16, f"Generating {max_sprites} character sprites...", "sprites")
                for char in characters[:max_sprites]:
                    name = char.get("name", "")
                    if not name:
                        continue
                    safe_name = re.sub(r"[^a-z0-9]", "_", name.lower())
                    fname = f"sprites/char_{safe_name}.png"
                    out_path = os.path.join(self.image_dir, self.book_id, fname)
                    os.makedirs(os.path.dirname(out_path), exist_ok=True)
                    ok = await generate_character_sprite(
                        character=char,
                        style=self.style.value if hasattr(self.style, "value") else str(self.style),
                        api_key=self.image_api_key,
                        output_path=out_path,
                    )
                    if ok:
                        character_sprites[name] = f"{self.book_id}/{fname}"
                        logger.info(f"Sprite generated for '{name}' → {fname}")
                    else:
                        logger.warning(f"Sprite generation failed for '{name}'")

                # Propagate sprite_url into bible characters for downstream DSL context
                if character_sprites:
                    for char in manga_bible.get("characters", []):
                        name = char.get("name", "")
                        if name in character_sprites:
                            char["sprite_url"] = character_sprites[name]
                    self._report(
                        17,
                        f"Sprites: {len(character_sprites)}/{max_sprites} generated",
                        "sprites",
                        {"sprites_generated": len(character_sprites)},
                    )
            except Exception as e:
                logger.warning(f"Character sprite generation failed (non-fatal): {e}")

        if self._is_cancelled():
            return empty_result()

        # ── PHASE 3: Planning + Cost Estimate ──
        self._report(18, "Planning manga panel structure...", "planning")

        try:
            # Pass min_scenes from blueprint so planner doesn't undershoot
            n_scenes = len(manga_blueprint.get("scenes", [])) if manga_blueprint else 0

            # Build narrative arc context for the planner
            arc_context = ""
            if narrative_arc:
                arc_context = narrative_arc.to_planner_context()

            manga_plan = await plan_manga(
                canonical_chapters=canonical_chapters,
                book_synopsis=book_synopsis,
                manga_bible=manga_bible,
                llm_client=self.llm,
                image_budget=self.image_budget,
                style=self.style,
                min_scenes=n_scenes,
                narrative_arc_context=arc_context,
            )
            logger.info(
                f"Plan: {manga_plan.total_panels} panels, "
                f"{manga_plan.total_pages} pages"
            )
        except Exception as e:
            logger.error(f"Planning failed: {e}")
            from app.agents.planner import _generate_fallback_plan, consolidate_short_chapters
            # Consolidate chapters before fallback (1C) and respect budget (1B)
            consolidated = consolidate_short_chapters(canonical_chapters)
            total_words = sum(
                len(ch.get("narrative_summary", "").split())
                for ch in consolidated
            )
            n_ch = len(consolidated)
            max_panels = max(12, min(total_words // 50, n_ch * 8))
            if total_words < 1000:
                max_panels = max(max_panels, n_ch * 3)
                max_panels = min(max_panels, max(12, n_ch * 5))
            manga_plan = _generate_fallback_plan(
                consolidated, manga_bible, max_panels=max_panels,
            )

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
            22,
            f"Plan: {manga_plan.total_panels} panels across {n_pages} pages"
            + (f" (~${est_cost})" if est_cost else ""),
            "planning",
            {
                "total_panels": manga_plan.total_panels,
                "total_pages": n_pages,
                "estimated_cost": est_cost,
            },
        )

        # ── PHASE 3b: Scene Composition (rule-based enrichment) ──
        try:
            from app.scene_composer import compose_scene_directions
            # Convert PanelAssignment dataclasses to dicts for enrichment
            panel_dicts = [
                {
                    "panel_id": p.panel_id,
                    "chapter_index": p.chapter_index,
                    "content_type": p.content_type,
                    "visual_mood": p.visual_mood,
                    "scene_description": p.scene_description,
                    "creative_direction": p.creative_direction,
                    "character": p.character,
                }
                for p in manga_plan.panels
            ]
            enriched = compose_scene_directions(
                panel_dicts, manga_bible, narrative_arc_dict,
            )
            # Attach illustration data back to panel assignments
            for panel, enrichment in zip(manga_plan.panels, enriched):
                panel.creative_direction = (
                    panel.creative_direction
                    + f"\nILLUSTRATION: scene={enrichment['illustration']['scene']}, "
                    f"style={enrichment['illustration']['style']}, "
                    f"accent={enrichment['illustration']['accentColor']}"
                )
                if enrichment.get("suggested_pose"):
                    panel.creative_direction += f"\nCHARACTER POSE: {enrichment['suggested_pose']}"
                if enrichment.get("suggested_aura"):
                    panel.creative_direction += f", AURA: {enrichment['suggested_aura']}"
            logger.info("Scene composition complete")
        except Exception as e:
            logger.warning(f"Scene composition failed (non-fatal): {e}")

        # ── PHASE 4: Per-PAGE DSL Generation (parallel across pages) ──
        self._report(25, "Generating Living Panel DSLs...", "generating")

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

        # Pre-compute visual continuity hints (read-only, safe for parallel use)
        visual_context_map = self._build_visual_context_map(
            manga_plan, canonical_chapters, manga_blueprint
        )

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
                visual_context=visual_context_map.get(panels[0].chapter_index),
            )
            for _page_key, panels in sorted(page_groups.items())
        ]

        all_page_results = await asyncio.gather(
            *page_tasks, return_exceptions=True
        )

        # ── PHASE 5: Assemble ──
        self._report(90, "Assembling manga...", "assembling")

        living_panels = []
        panels_ok = 0
        panels_fail = 0
        image_panel_ids = []
        v4_pages = []  # Collect V4 page data for page-level rendering
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
            # Collect V4 page data (first result has the full page)
            if page_result and isinstance(page_result, list) and page_result[0].get("v4_page"):
                v4_pages.append(page_result[0]["v4_page"])

            for i, panel_result in enumerate(page_result):
                assignment = page_panels[i] if i < len(page_panels) else None
                dsl = panel_result.get("dsl")
                # Inject character sprite URLs post-hoc (no-op if no sprites generated)
                if dsl and character_sprites:
                    self._inject_sprite_urls(dsl, character_sprites)

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
            engine=self.engine,
            v4_pages=v4_pages if v4_pages else None,
        )

    # ── Helpers ───────────────────────────────────────────────

    # Panel types that justify the verbose V2 DSL (animation-heavy, character-rich)
    _V2_PANEL_TYPES = frozenset({"splash", "dialogue", "montage"})

    @staticmethod
    def _inject_sprite_urls(dsl: dict, sprite_map: dict[str, str]) -> dict:
        """Post-hoc injection of sprite_url into sprite layers.

        Walks the V2 DSL and inserts sprite_url into any sprite layer whose
        character name has a generated portrait. This runs AFTER the LLM
        generates the DSL — never changes what the LLM sees.

        Safe to call with an empty sprite_map (no-op).
        """
        if not sprite_map or not isinstance(dsl, dict):
            return dsl

        def _inject_layers(layers: list) -> None:
            for layer in layers:
                if not isinstance(layer, dict):
                    continue
                if layer.get("type") == "sprite":
                    char_name = (layer.get("props") or {}).get("character", "")
                    if char_name in sprite_map:
                        layer.setdefault("props", {})
                        layer["props"]["sprite_url"] = f"/images/{sprite_map[char_name]}"

        for act in dsl.get("acts", []):
            if not isinstance(act, dict):
                continue
            _inject_layers(act.get("layers", []))
            for cell in act.get("cells", []):
                if isinstance(cell, dict):
                    _inject_layers(cell.get("layers", []))

    @staticmethod
    def _build_visual_context_map(
        manga_plan: "MangaPlan",
        canonical_chapters: list[dict],
        manga_blueprint: Optional[dict],
    ) -> dict[int, str]:
        """Pre-compute a read-only visual continuity hint per chapter.

        This is computed BEFORE parallel DSL generation fires so every page task
        can access it without locks or shared mutable state.

        Each hint tells the DSL generator:
        - Where this chapter sits in the 3-act arc
        - What mood the chapter should carry
        - Whether to shift tone from the previous chapter
        - Whether pacing weight is imbalanced (too many heavy or too many light panels)
        """
        from collections import Counter, defaultdict

        n = len(canonical_chapters)
        if n == 0:
            return {}

        context_map: dict[int, str] = {}

        # Extract per-chapter mood from blueprint scenes (first scene per chapter)
        chapter_moods: dict[int, str] = {}
        if manga_blueprint:
            for scene in manga_blueprint.get("scenes", []):
                idx = scene.get("chapter_source", 0)
                if idx not in chapter_moods and scene.get("mood"):
                    chapter_moods[idx] = scene["mood"]

        # Count panel type distribution per chapter (from the plan)
        type_counts: dict[int, Counter] = defaultdict(Counter)
        for p in manga_plan.panels:
            type_counts[p.chapter_index][p.content_type] += 1

        for i, ch in enumerate(canonical_chapters):
            idx = ch.get("chapter_index", i)
            arc_pos = i / max(n - 1, 1)  # 0.0 = opening, 1.0 = final chapter

            # 3-act position label
            if arc_pos < 0.33:
                act = "act-one (setup/introduction)"
            elif arc_pos < 0.67:
                act = "act-two (confrontation/complexity)"
            else:
                act = "act-three (resolution/payoff)"

            # Mood contrast hint — nudge away from repeating the same tone
            prev_mood = chapter_moods.get(idx - 1, "")
            curr_mood = chapter_moods.get(idx, "")
            contrast_hint = ""
            if prev_mood and curr_mood and prev_mood == curr_mood:
                contrast_hint = (
                    f"Previous chapter was also '{prev_mood}' — "
                    f"find a subtle tonal shift to avoid repetition."
                )
            elif prev_mood and curr_mood:
                contrast_hint = (
                    f"Previous chapter was '{prev_mood}', this is '{curr_mood}' — "
                    f"lean into the contrast."
                )

            # Pacing balance hint
            counts = type_counts.get(idx, Counter())
            heavy = counts.get("splash", 0) + counts.get("montage", 0)
            light = (counts.get("narration", 0) + counts.get("data", 0)
                     + counts.get("transition", 0))
            balance_hint = ""
            if heavy > 2 and light == 0:
                balance_hint = (
                    "Many heavy panels, no light ones — ensure at least one "
                    "quiet/atmospheric moment for pacing contrast."
                )
            elif light > heavy + 2:
                balance_hint = (
                    "Many light panels — keep energy up with at least one "
                    "high-impact visual moment."
                )

            parts = [f"NARRATIVE ARC: {act} (position {arc_pos:.1f}/1.0)"]
            if curr_mood:
                parts.append(f"Chapter mood: {curr_mood}")
            if contrast_hint:
                parts.append(contrast_hint)
            if balance_hint:
                parts.append(balance_hint)

            context_map[idx] = "\n".join(parts)

        return context_map

    def _choose_engine_for_page(self, page_panels: list[PanelAssignment]) -> str:
        """Per-page engine routing for 'auto' mode.

        V2 (verbose DSL) is used when a page contains any expressive panel type
        that benefits from fine-grained animation control (splash, dialogue, montage).
        V4 (semantic intent) is used for simpler pages (narration, data, transition,
        concept) where the reduced token cost and higher LLM compliance matter more.

        Explicit 'v2' or 'v4' engine settings bypass this entirely.
        """
        if self.engine != "auto":
            return self.engine
        page_types = {p.content_type for p in page_panels}
        return "v2" if page_types & self._V2_PANEL_TYPES else "v4"

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
        visual_context: Optional[str] = None,
    ) -> list[dict]:
        """Generate DSLs for one page with concurrency limiting."""
        async with self._semaphore:
            if self._is_cancelled():
                return [
                    {"dsl": None, "success": False, "error": "Cancelled"}
                    for _ in page_panels
                ]

            effective_engine = self._choose_engine_for_page(page_panels)

            if effective_engine == "v4":
                result = await generate_v4_page(
                    page_panels=page_panels,
                    llm_client=self.llm,
                    style=self.style,
                    manga_bible=manga_bible,
                    chapter_summary=chapter_summary,
                    prev_chapter_ending=prev_chapter_ending,
                    visual_context=visual_context,
                )
                # V4 returns a single page dict; wrap each panel as a result
                page_data = result.get("page", {})
                tokens = result.get("tokens", {})
                success = result.get("success", False)
                results = []
                for panel_dict in page_data.get("panels", []):
                    results.append({
                        "dsl": panel_dict,
                        "tokens": tokens,
                        "success": success,
                        "engine": "v4",
                        "v4_page": page_data,
                    })
                # Fill missing panels with empty results
                while len(results) < len(page_panels):
                    results.append({"dsl": None, "success": False, "engine": "v4"})
            else:
                results = await generate_page_dsls(
                    page_panels=page_panels,
                    llm_client=self.llm,
                    style=self.style,
                    manga_bible=manga_bible,
                    chapter_summary=chapter_summary,
                    prev_chapter_ending=prev_chapter_ending,
                    visual_context=visual_context,
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
            pct = 25 + int((done / total_panels) * 63)  # 25% to 88%
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
