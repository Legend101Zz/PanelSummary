"""Continuity helpers for incremental manga generation."""

from __future__ import annotations

from app.domain.manga.artifacts import MangaScript, StoryboardPage
from app.domain.manga.types import ContinuityLedger, SliceRole, SourceFact, SourceSlice


def should_add_to_be_continued(
    *,
    source_has_more: bool,
    slice_role: SliceRole,
    standalone: bool = False,
) -> bool:
    """Decide whether a generated slice should end with a continuation card."""
    if standalone:
        return False
    if slice_role in {SliceRole.FINALE, SliceRole.STANDALONE}:
        return False
    return source_has_more


def build_continuation_prompt_context(
    *,
    title: str,
    logline: str,
    ledger: ContinuityLedger,
    facts: list[SourceFact],
    source_slice: SourceSlice,
    max_facts: int = 10,
) -> str:
    """Build compact continuity context for the next LLM stage.

    This is deliberately compact. Feeding previous raw pages back into every
    continuation would be expensive and noisy. Feed state, not soup.
    """
    known_fact_set = set(ledger.known_fact_ids)
    known_facts = [fact for fact in facts if fact.fact_id in known_fact_set]
    important_facts = sorted(known_facts, key=lambda fact: int(fact.importance), reverse=True)[:max_facts]

    lines = [
        "MANGA CONTINUITY SO FAR:",
        f"Title: {title or 'Untitled manga adaptation'}",
        f"Logline: {logline or 'Not established yet'}",
        f"Covered source: {ledger.source_coverage_label()}",
        f"Next source slice: {source_slice.label()}",
    ]

    story_lines = ledger.current_story_state.compact_lines()
    if story_lines:
        lines.append("Current story state:")
        lines.extend(f"- {line}" for line in story_lines)

    if ledger.character_state:
        lines.append("Character continuity:")
        for character in ledger.character_state.values():
            details = character.arc_position or "state not specified"
            lines.append(f"- {character.character_id}: {details}")

    if important_facts:
        lines.append("Reader already knows:")
        lines.extend(f"- {fact.fact_id}: {fact.text}" for fact in important_facts)

    if ledger.open_threads:
        lines.append("Open threads to preserve or resolve:")
        lines.extend(f"- {thread.thread_id}: {thread.question}" for thread in ledger.open_threads)

    if ledger.recap_for_next_slice:
        lines.append(f"Recap seed: {ledger.recap_for_next_slice}")
    if ledger.last_page_hook:
        lines.append(f"Last manga moment: {ledger.last_page_hook}")

    lines.append("Do not repeat previous exposition except as a tiny recap if needed.")
    lines.append("Continue the same story, character voices, motifs, and emotional journey.")
    return "\n".join(lines)


def update_ledger_after_slice(
    *,
    ledger: ContinuityLedger,
    source_slice: SourceSlice,
    new_fact_ids: list[str],
    recap_for_next_slice: str,
    last_page_hook: str,
) -> ContinuityLedger:
    """Apply the deterministic continuity updates after a slice completes."""
    ledger.add_covered_range(source_slice.source_range)
    ledger.mark_facts_known(new_fact_ids)
    ledger.recap_for_next_slice = recap_for_next_slice.strip()
    ledger.last_page_hook = last_page_hook.strip()
    ledger.version += 1
    return ledger


# ---------------------------------------------------------------------------
# Phase 2.2 — deterministic recap seed.
#
# The previous code path stuffed `manga_script.scenes[-1].action` (a stage
# direction, e.g. "Kai turns away from the chalkboard, pen still in hand.")
# into the next slice's `recap_for_next_slice`. That isn't a recap — it's a
# camera note. Swapping it for a tiny pure helper means:
#   * the next slice's beat sheet sees "WHAT JUST HAPPENED" instead of
#     "WHERE THE CAMERA POINTED",
#   * the helper is testable in isolation (pure inputs in, plain string out),
#   * we never re-enter the LLM just to author a one-liner the storyboard
#     and script already contain.
# ---------------------------------------------------------------------------

_RECAP_MAX_LEN = 240


def build_recap_seed(
    *,
    manga_script: MangaScript | None,
    storyboard_pages: list[StoryboardPage] | None,
) -> str:
    """Compose the next-slice recap from the closing scene + the page-turn hook.

    Strategy (kept dumb on purpose):
        1. Take the LAST scene's ``scene_goal`` if present — that is the
           writer's own one-line summary of what the scene was for.
        2. Append the LAST storyboard page's ``page_turn_hook`` — that is
           where the slice *left* the reader emotionally.
        3. Trim to ``_RECAP_MAX_LEN`` so the next slice's prompt budget
           is not silently inflated.

    When either input is missing the helper degrades quietly to whatever it
    has, so a renderer-only smoke test still gets a usable seed.
    """
    parts: list[str] = []
    if manga_script is not None and manga_script.scenes:
        last_scene = manga_script.scenes[-1]
        # scene_goal is a one-line writer summary; action is stage direction.
        # Prefer the goal so the recap reads as "what we resolved" not
        # "where the camera was pointed".
        seed = last_scene.scene_goal.strip() or last_scene.action.strip()
        if seed:
            parts.append(seed)
    if storyboard_pages:
        hook = storyboard_pages[-1].page_turn_hook.strip()
        if hook:
            parts.append(f"Cliffhanger: {hook}")
    recap = " \u2014 ".join(parts).strip()
    if len(recap) > _RECAP_MAX_LEN:
        # Hard cap rather than sentence-aware truncation: callers do not
        # render this verbatim, they feed it to the next prompt as context.
        recap = recap[: _RECAP_MAX_LEN - 1].rstrip() + "\u2026"
    return recap