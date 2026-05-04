"""Continuity helpers for incremental manga generation."""

from __future__ import annotations

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