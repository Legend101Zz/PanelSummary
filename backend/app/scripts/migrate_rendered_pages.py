#!/usr/bin/env python3
"""One-shot rebuild for pages whose rendered_page payload is empty.

The migration is intentionally boring:

* default mode is DRY-RUN;
* only pages with an empty/missing rendered_page are candidates;
* storyboard snapshots are read from the owning MangaSliceDoc;
* no image generation, no LLM calls, no filesystem reads;
* every rebuilt page goes through the RenderedPage domain validator.

Run from ``backend/``:

    uv run python -m app.scripts.migrate_rendered_pages
    uv run python -m app.scripts.migrate_rendered_pages --apply
    uv run python -m app.scripts.migrate_rendered_pages --project-id <id>

Why no composition restore? The current MangaSliceDoc schema persists
``storyboard_pages`` but not ``slice_composition``. Rebuilding with
``composition=None`` preserves the canonical page contract and lets the
reader use its deterministic fallback layout instead of inventing data.
"""

from __future__ import annotations

import argparse
import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Iterable

from app.domain.manga import StoryboardPage, empty_rendered_page


@dataclass
class PageRenderedPageUpdate:
    """Prepared rendered_page replacement for one MangaPageDoc."""

    page_doc: Any
    rendered_page: dict[str, Any]


@dataclass
class SliceMigrationPlan:
    """Dry-run/apply plan for one MangaSliceDoc."""

    slice_id: str
    updates: list[PageRenderedPageUpdate] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


@dataclass
class MigrationSummary:
    """Human-readable aggregate counts for the migration run."""

    total_pages: int = 0
    candidate_pages: int = 0
    planned_updates: int = 0
    applied_updates: int = 0
    skipped_pages: int = 0


def page_needs_rendered_page(page_doc: Any) -> bool:
    """Return True when a persisted page needs the canonical payload rebuilt."""
    return not bool(getattr(page_doc, "rendered_page", None))


def build_rendered_page_dump(storyboard_payload: dict[str, Any]) -> dict[str, Any]:
    """Validate a storyboard snapshot and convert it to RenderedPage JSON."""
    storyboard_page = StoryboardPage.model_validate(storyboard_payload)
    rendered = empty_rendered_page(storyboard_page=storyboard_page, composition=None)
    return rendered.model_dump(mode="json")


def plan_rendered_page_rebuilds(
    *,
    slice_doc: Any,
    page_docs: Iterable[Any],
) -> SliceMigrationPlan:
    """Build the dry-run plan for one slice without touching the database.

    Page documents store a project-global ``page_index`` while storyboard
    snapshots store slice-local page indices. Matching by position within
    the slice is therefore the least surprising rule and mirrors the live
    persistence loop that wrote pages by enumerating ``context.rendered_pages``.
    """
    slice_id = str(getattr(slice_doc, "id", ""))
    plan = SliceMigrationPlan(slice_id=slice_id)
    storyboard_payloads = list(getattr(slice_doc, "storyboard_pages", None) or [])
    ordered_pages = sorted(page_docs, key=lambda page: int(getattr(page, "page_index", 0)))

    if not storyboard_payloads:
        for page in ordered_pages:
            if page_needs_rendered_page(page):
                plan.skipped.append(_skip_message(page, "slice has no storyboard_pages snapshot"))
        return plan

    for local_index, page in enumerate(ordered_pages):
        if not page_needs_rendered_page(page):
            continue
        if local_index >= len(storyboard_payloads):
            plan.skipped.append(
                _skip_message(page, f"no storyboard page at local index {local_index}")
            )
            continue
        try:
            rendered_page = build_rendered_page_dump(storyboard_payloads[local_index])
        except Exception as exc:  # noqa: BLE001 - migration report must keep walking
            plan.skipped.append(_skip_message(page, f"invalid storyboard snapshot: {exc}"))
            continue
        plan.updates.append(PageRenderedPageUpdate(page_doc=page, rendered_page=rendered_page))

    return plan


def _skip_message(page_doc: Any, reason: str) -> str:
    page_id = getattr(page_doc, "id", "<unknown>")
    page_index = getattr(page_doc, "page_index", "?")
    return f"page={page_id} page_index={page_index}: {reason}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write rebuilt rendered_page payloads. Omit for dry-run.",
    )
    parser.add_argument(
        "--project-id",
        default="",
        help="Restrict the migration to one MangaProjectDoc id.",
    )
    return parser.parse_args()


def _candidate_query(project_id: str = "") -> dict[str, Any]:
    empty_payload = {"$or": [{"rendered_page": {}}, {"rendered_page": {"$exists": False}}]}
    if not project_id:
        return empty_payload
    return {"$and": [{"project_id": project_id}, empty_payload]}


def _project_query(project_id: str = "") -> dict[str, Any]:
    return {"project_id": project_id} if project_id else {}


async def collect_plans(project_id: str = "") -> tuple[MigrationSummary, list[SliceMigrationPlan]]:
    """Read candidate docs and produce per-slice dry-run plans."""
    from app.scripts._db import MangaPageDoc, MangaSliceDoc, connect

    await connect()
    total_pages = await MangaPageDoc.find(_project_query(project_id)).count()
    candidates = await MangaPageDoc.find(_candidate_query(project_id)).to_list()
    candidates.sort(key=lambda page: (str(page.slice_id), int(page.page_index)))

    pages_by_slice: dict[str, list[Any]] = defaultdict(list)
    for page in candidates:
        pages_by_slice[str(page.slice_id)].append(page)

    plans: list[SliceMigrationPlan] = []
    for slice_id in sorted(pages_by_slice):
        slice_doc = await MangaSliceDoc.get(slice_id)
        if slice_doc is None:
            plan = SliceMigrationPlan(slice_id=slice_id)
            for page in pages_by_slice[slice_id]:
                plan.skipped.append(_skip_message(page, "owning slice document was not found"))
            plans.append(plan)
            continue

        all_slice_pages = await MangaPageDoc.find(MangaPageDoc.slice_id == slice_id).to_list()
        plans.append(plan_rendered_page_rebuilds(slice_doc=slice_doc, page_docs=all_slice_pages))

    summary = MigrationSummary(
        total_pages=total_pages,
        candidate_pages=len(candidates),
        planned_updates=sum(len(plan.updates) for plan in plans),
        skipped_pages=sum(len(plan.skipped) for plan in plans),
    )
    return summary, plans


async def apply_plans(plans: list[SliceMigrationPlan]) -> int:
    """Persist prepared rendered_page payloads. Caller decides dry-run/apply."""
    applied = 0
    for plan in plans:
        for update in plan.updates:
            update.page_doc.rendered_page = update.rendered_page
            await update.page_doc.save()
            applied += 1
    return applied


def print_report(*, summary: MigrationSummary, plans: list[SliceMigrationPlan], dry_run: bool) -> None:
    mode = "DRY-RUN" if dry_run else "APPLY"
    print(f"\nRenderedPage migration ({mode})")
    print("=" * 34)
    print(f"Total manga_pages:      {summary.total_pages}")
    print(f"Empty rendered_page:    {summary.candidate_pages}")
    print(f"Planned rebuilds:       {summary.planned_updates}")
    print(f"Skipped candidates:     {summary.skipped_pages}")
    if not dry_run:
        print(f"Applied rebuilds:       {summary.applied_updates}")

    skipped = [message for plan in plans for message in plan.skipped]
    if skipped:
        print("\nSkipped:")
        for message in skipped[:20]:
            print(f"  - {message}")
        if len(skipped) > 20:
            print(f"  ... {len(skipped) - 20} more")

    if dry_run and summary.planned_updates:
        print("\nNo writes were made. Re-run with --apply after reviewing this output.")
    print()


async def main() -> None:
    args = parse_args()
    summary, plans = await collect_plans(project_id=args.project_id)
    if args.apply:
        summary.applied_updates = await apply_plans(plans)
    print_report(summary=summary, plans=plans, dry_run=not args.apply)


if __name__ == "__main__":
    asyncio.run(main())
