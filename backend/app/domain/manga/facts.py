"""Fact registry helpers for source-grounded manga adaptation."""

from __future__ import annotations

import re

from app.domain.manga.types import FactImportance, SourceFact, SourceSlice

_WORD_RE = re.compile(r"[^a-z0-9]+")


def normalize_fact_text(text: str) -> str:
    """Normalize fact text for conservative deduping.

    This is intentionally simple. Semantic dedupe belongs in an LLM-assisted
    stage later; this helper only catches exact-ish repeats without getting
    clever and eating important nuance. Clever dedupe is how facts go missing.
    """
    lowered = text.casefold().strip()
    normalized = _WORD_RE.sub(" ", lowered)
    return " ".join(normalized.split())


def _next_fact_id(existing: list[SourceFact], offset: int = 1) -> str:
    max_seen = 0
    for fact in existing:
        if fact.fact_id.startswith("f") and fact.fact_id[1:].isdigit():
            max_seen = max(max_seen, int(fact.fact_id[1:]))
    return f"f{max_seen + offset:03d}"


def _coerce_fact(raw: SourceFact | dict, source_slice: SourceSlice, fact_id: str) -> SourceFact:
    if isinstance(raw, SourceFact):
        data = raw.model_dump()
    else:
        data = dict(raw)

    data.setdefault("fact_id", fact_id)
    data.setdefault("source_slice_id", source_slice.slice_id)
    data.setdefault("importance", FactImportance.IMPORTANT)
    if "text" not in data and "fact" in data:
        data["text"] = data.pop("fact")
    return SourceFact(**data)


def merge_fact_registry(
    existing: list[SourceFact],
    incoming: list[SourceFact | dict],
    source_slice: SourceSlice,
) -> tuple[list[SourceFact], list[str]]:
    """Merge incoming facts into a stable registry.

    Returns `(merged_registry, new_fact_ids)`. Existing fact IDs are never
    rewritten. Incoming duplicates are ignored. If incoming facts already carry
    IDs that collide with existing facts, new stable IDs are assigned instead.
    """
    merged = list(existing)
    new_fact_ids: list[str] = []
    normalized_to_id = {normalize_fact_text(fact.text): fact.fact_id for fact in merged}
    used_ids = {fact.fact_id for fact in merged}

    for raw_fact in incoming:
        candidate_id = _next_fact_id(merged)
        fact = _coerce_fact(raw_fact, source_slice, candidate_id)
        norm = normalize_fact_text(fact.text)
        if norm in normalized_to_id:
            continue

        if fact.fact_id in used_ids:
            fact.fact_id = _next_fact_id(merged)

        merged.append(fact)
        used_ids.add(fact.fact_id)
        normalized_to_id[norm] = fact.fact_id
        new_fact_ids.append(fact.fact_id)

    return merged, new_fact_ids
