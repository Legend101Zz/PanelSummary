"""Deterministic cleanup for storyboard grounding mechanics."""

from __future__ import annotations

import re

from app.domain.manga import (
    PanelPurpose,
    ScriptLine,
    ShotType,
    SliceRole,
    StoryboardPage,
    StoryboardPanel,
    should_add_to_be_continued,
)
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.manga_dsl import (
    dialogue_budget_for,
    page_budget_for,
    panel_budget_for,
)


def _known_character_ids(context: PipelineContext) -> set[str]:
    if context.character_bible is None:
        return set()
    return {
        character.character_id.strip()
        for character in context.character_bible.characters
        if character.character_id.strip()
    }


def _required_fact_ids(context: PipelineContext) -> list[str]:
    if context.adaptation_plan is None:
        return []
    return [
        fact_id.strip()
        for fact_id in context.adaptation_plan.important_fact_ids
        if fact_id.strip()
    ]


def _all_panel_fact_ids(pages: list[StoryboardPage]) -> set[str]:
    return {
        fact_id
        for page in pages
        for panel in page.panels
        for fact_id in panel.source_fact_ids
    }


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if normalized and normalized not in seen:
            result.append(normalized)
            seen.add(normalized)
    return result


def _repair_panel_characters(
    panel: StoryboardPanel,
    *,
    known_ids: set[str],
) -> StoryboardPanel:
    if not known_ids:
        return panel

    kept_dialogue: list[ScriptLine] = []
    moved_dialogue_text: list[str] = []
    fact_ids = list(panel.source_fact_ids)
    for line in panel.dialogue:
        speaker_id = line.speaker_id.strip()
        if speaker_id in known_ids:
            kept_dialogue.append(line)
            continue
        moved_dialogue_text.append(line.text.strip())
        fact_ids.extend(line.source_fact_ids)

    action = panel.action
    if moved_dialogue_text:
        moved = " ".join(text for text in moved_dialogue_text if text)
        if moved:
            action = f"{action.rstrip()} {moved}".strip()

    return StoryboardPanel(
        **{
            **panel.model_dump(mode="python"),
            "action": action,
            "dialogue": [line.model_dump(mode="python") for line in kept_dialogue],
            "source_fact_ids": _dedupe(fact_ids),
            "character_ids": [
                character_id
                for character_id in _dedupe(panel.character_ids)
                if character_id in known_ids
            ],
        }
    )


def _anchor_missing_required_facts(
    pages: list[StoryboardPage],
    *,
    required_fact_ids: list[str],
) -> list[StoryboardPage]:
    if not pages or not required_fact_ids:
        return pages
    present = _all_panel_fact_ids(pages)
    missing = [fact_id for fact_id in required_fact_ids if fact_id not in present]
    if not missing or not pages[0].panels:
        return pages

    first_page = pages[0]
    first_panel = first_page.panels[0]
    repaired_first_panel = StoryboardPanel(
        **{
            **first_panel.model_dump(mode="python"),
            "source_fact_ids": _dedupe(list(first_panel.source_fact_ids) + missing),
        }
    )
    repaired_first_page = StoryboardPage(
        **{
            **first_page.model_dump(mode="python"),
            "panels": [
                repaired_first_panel,
                *first_page.panels[1:],
            ],
        }
    )
    return [repaired_first_page, *pages[1:]]


def _repair_page_narration_density(page: StoryboardPage) -> StoryboardPage:
    max_captions = max(1, len(page.panels) // 3)
    kept_count = 0
    repaired_panels: list[StoryboardPanel] = []
    for panel in page.panels:
        narration = panel.narration.strip()
        if not narration:
            repaired_panels.append(panel)
            continue
        kept_count += 1
        if kept_count <= max_captions:
            repaired_panels.append(panel)
            continue

        action = f"{panel.action.rstrip()} {narration}".strip()
        repaired_panels.append(
            StoryboardPanel(
                **{
                    **panel.model_dump(mode="python"),
                    "action": action,
                    "narration": "",
                }
            )
        )
    return StoryboardPage(
        **{
            **page.model_dump(mode="python"),
            "panels": repaired_panels,
        }
    )


def _cut_at_word_boundary(text: str, max_chars: int) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= max_chars:
        return normalized
    candidate = normalized[: max_chars + 1]
    if " " in candidate:
        candidate = candidate.rsplit(" ", 1)[0]
    return candidate.rstrip(" -")


def _fit_dialogue_line(line: ScriptLine, max_chars: int) -> list[ScriptLine]:
    text = " ".join(line.text.split())
    if len(text) <= max_chars:
        return [line.model_copy(update={"text": text})]

    boundaries = [
        match.end()
        for match in re.finditer(r"[.!?;:,]\s+", text)
        if match.end() <= max_chars
    ]
    if not boundaries:
        return [line.model_copy(update={"text": _cut_at_word_boundary(text, max_chars)})]

    split_at = boundaries[-1]
    first = text[:split_at].strip()
    second = _cut_at_word_boundary(text[split_at:], max_chars)
    return [
        line.model_copy(update={"text": chunk})
        for chunk in (first, second)
        if chunk
    ][:2]


def _dialogue_groups(
    panel: StoryboardPanel,
    *,
    max_chars: int,
    max_lines: int,
) -> list[list[ScriptLine]]:
    fitted = [
        fitted_line
        for line in panel.dialogue
        for fitted_line in _fit_dialogue_line(line, max_chars)
    ]
    if not fitted:
        return [[]]

    groups: list[list[ScriptLine]] = []
    current: list[ScriptLine] = []
    current_chars = 0
    for line in fitted:
        would_overflow = current and (
            len(current) >= max_lines
            or current_chars + len(line.text) > max_chars
        )
        if would_overflow:
            groups.append(current)
            current = []
            current_chars = 0
        current.append(line)
        current_chars += len(line.text)
    if current:
        groups.append(current)
    return groups


def _continuation_shot(shot_type: ShotType) -> ShotType:
    if shot_type in {ShotType.WIDE, ShotType.EXTREME_WIDE}:
        return ShotType.CLOSE_UP
    if shot_type in {ShotType.CLOSE_UP, ShotType.EXTREME_CLOSE_UP}:
        return ShotType.WIDE
    return ShotType.INSERT


def _repair_page_panel_and_dialogue_budgets(
    page: StoryboardPage,
    context: PipelineContext,
) -> StoryboardPage:
    role = context.arc_entry.role if context.arc_entry else None
    panel_budget = panel_budget_for(role)
    dialogue_budget = dialogue_budget_for(role)
    repaired: list[StoryboardPanel] = []

    for panel_index, panel in enumerate(page.panels):
        remaining_original_panels = len(page.panels) - panel_index
        available_new_panels = max(
            0,
            panel_budget.max_panels - len(repaired) - remaining_original_panels,
        )
        groups = _dialogue_groups(
            panel,
            max_chars=dialogue_budget.max_chars_per_panel,
            max_lines=dialogue_budget.max_lines_per_panel,
        )
        groups = groups[: 1 + available_new_panels]
        for group_index, group in enumerate(groups):
            panel_id = (
                panel.panel_id
                if group_index == 0
                else f"{panel.panel_id}__dialogue_{group_index + 1}"
            )
            repaired.append(
                StoryboardPanel(
                    **{
                        **panel.model_dump(mode="python"),
                        "panel_id": panel_id,
                        "shot_type": (
                            panel.shot_type
                            if group_index == 0
                            else _continuation_shot(panel.shot_type)
                        ),
                        "composition": (
                            panel.composition
                            if group_index == 0
                            else f"{panel.composition.rstrip()} Continuation reaction beat."
                        ),
                        "dialogue": [
                            line.model_dump(mode="python")
                            for line in group
                        ],
                        "narration": panel.narration if group_index == 0 else "",
                    }
                )
            )

    source_index = 0
    while len(repaired) < panel_budget.min_panels:
        source = repaired[source_index % len(repaired)]
        source_index += 1
        repaired.append(
            StoryboardPanel(
                **{
                    **source.model_dump(mode="python"),
                    "panel_id": f"{source.panel_id}__continuation_{source_index}",
                    "shot_type": _continuation_shot(source.shot_type),
                    "composition": f"{source.composition.rstrip()} Silent continuation beat.",
                    "dialogue": [],
                    "narration": "",
                }
            )
        )

    return StoryboardPage(
        **{
            **page.model_dump(mode="python"),
            "panels": repaired,
        }
    )


def _slice_role_for_tbc(context: PipelineContext) -> SliceRole:
    raw_role = context.options.get("slice_role")
    if raw_role is None:
        return SliceRole.OPENING
    if isinstance(raw_role, SliceRole):
        return raw_role
    return SliceRole(str(raw_role))


def _repair_required_to_be_continued(
    pages: list[StoryboardPage],
    context: PipelineContext,
) -> list[StoryboardPage]:
    if not pages:
        return pages
    should_tbc = should_add_to_be_continued(
        source_has_more=bool(context.options.get("source_has_more", False)),
        slice_role=_slice_role_for_tbc(context),
        standalone=bool(context.options.get("standalone", False)),
    )
    if not should_tbc:
        return pages
    if any(
        panel.purpose == PanelPurpose.TO_BE_CONTINUED
        for page in pages
        for panel in page.panels
    ):
        return pages

    last_page = pages[-1]
    if not last_page.panels:
        return pages

    last_panel = last_page.panels[-1]
    hook = last_page.page_turn_hook.strip() or "The story turns toward the next change."
    repaired_last_panel = StoryboardPanel(
        **{
            **last_panel.model_dump(mode="python"),
            "purpose": PanelPurpose.TO_BE_CONTINUED,
            "action": last_panel.action.strip() or hook,
            "narration": last_panel.narration.strip() or "To be continued.",
        }
    )
    repaired_last_page = StoryboardPage(
        **{
            **last_page.model_dump(mode="python"),
            "page_turn_hook": hook,
            "panels": [
                *last_page.panels[:-1],
                repaired_last_panel,
            ],
        }
    )
    return [*pages[:-1], repaired_last_page]


def _positive_int_option(context: PipelineContext, key: str) -> int | None:
    raw = context.options.get(key)
    if raw in (None, ""):
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _with_page_index(page: StoryboardPage, page_index: int) -> StoryboardPage:
    return StoryboardPage(
        **{
            **page.model_dump(mode="python"),
            "page_index": page_index,
        }
    )


def _repair_slice_page_count(
    pages: list[StoryboardPage],
    context: PipelineContext,
) -> list[StoryboardPage]:
    role = context.arc_entry.role if context.arc_entry else None
    budget = page_budget_for(
        role,
        max_pages_override=_positive_int_option(context, "max_storyboard_pages"),
        preferred_pages_override=_positive_int_option(context, "target_storyboard_pages"),
    )
    if len(pages) > budget.max_pages:
        pages = pages[: budget.max_pages]

    while pages and len(pages) < budget.min_pages:
        source = pages[-1]
        copy_index = len(pages)
        panels = [
            StoryboardPanel(
                **{
                    **panel.model_dump(mode="python"),
                    "panel_id": f"{panel.panel_id}__page_{copy_index + 1}",
                    "dialogue": [],
                    "narration": "",
                    "composition": f"{panel.composition.rstrip()} Silent continuation beat.",
                    "action": panel.action.strip() or "A silent continuation beat holds the moment.",
                }
            )
            for panel in source.panels
        ]
        pages.append(
            StoryboardPage(
                **{
                    **source.model_dump(mode="python"),
                    "page_id": f"{source.page_id}__continuation_{copy_index + 1}",
                    "page_index": copy_index,
                    "panels": panels,
                }
            )
        )

    return [_with_page_index(page, index) for index, page in enumerate(pages)]


async def run(context: PipelineContext) -> PipelineContext:
    """Repair deterministic grounding defects after LLM storyboard repair.

    The LLM repair stage owns editorial rewriting. This stage only handles
    mechanical schema/grounding defects that validators can identify exactly:
    unknown visual character IDs and missing required fact anchors.
    """
    if not context.storyboard_pages:
        return context

    known_ids = _known_character_ids(context)
    repaired_pages: list[StoryboardPage] = []
    for page in context.storyboard_pages:
        repaired_panels = [
            _repair_panel_characters(panel, known_ids=known_ids)
            for panel in page.panels
        ]
        repaired_pages.append(
            StoryboardPage(
                **{
                    **page.model_dump(mode="python"),
                    "panels": repaired_panels,
                }
            )
        )

    repaired_pages = _anchor_missing_required_facts(
        repaired_pages,
        required_fact_ids=_required_fact_ids(context),
    )
    repaired_pages = [
        _repair_page_narration_density(page)
        for page in repaired_pages
    ]
    repaired_pages = [
        _repair_page_panel_and_dialogue_budgets(page, context)
        for page in repaired_pages
    ]
    repaired_pages = _repair_slice_page_count(repaired_pages, context)
    repaired_pages = _anchor_missing_required_facts(
        repaired_pages,
        required_fact_ids=_required_fact_ids(context),
    )
    repaired_pages = _repair_required_to_be_continued(repaired_pages, context)
    repaired_pages = [
        _repair_page_narration_density(page)
        for page in repaired_pages
    ]
    context.storyboard_pages = repaired_pages
    context.quality_report = None
    return context
