#!/usr/bin/env python3
"""
delete_summaries.py — Delete all summaries + living panels for a book.
======================================================================
Keeps the book document intact (parsed chapters, PDF data).
Deletes:
  • All BookSummary documents for this book
  • All LivingPanelDoc documents for those summaries
  • Related JobStatus documents (summarize jobs only)

Usage:
    python scripts/delete_summaries.py <book_id>
    python scripts/delete_summaries.py <book_id> --force
    python scripts/delete_summaries.py <book_id> --summary <summary_id>  # delete just one
"""

import asyncio
import os
import sys

# Add backend/ to sys.path so `app.*` imports work when running as a script
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

def red(s: str) -> str:
    return f"\033[91m{s}\033[0m"


def green(s: str) -> str:
    return f"\033[92m{s}\033[0m"


def yellow(s: str) -> str:
    return f"\033[93m{s}\033[0m"


def dim(s: str) -> str:
    return f"\033[2m{s}\033[0m"


def cyan(s: str) -> str:
    return f"\033[96m{s}\033[0m"


async def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        sys.exit(1)

    book_id = sys.argv[1]
    force = "--force" in sys.argv
    single_summary_id = None
    if "--summary" in sys.argv:
        idx = sys.argv.index("--summary")
        if idx + 1 < len(sys.argv):
            single_summary_id = sys.argv[idx + 1]

    from app.scripts._db import (Book, BookSummary, JobStatus, LivingPanelDoc,
                                 connect)
    await connect()

    # --- Verify the book exists ---
    book = await Book.get(book_id)
    if not book:
        print(red(f"\n  ✘ Book '{book_id}' not found.\n"))
        sys.exit(1)

    # --- Fetch summaries ---
    if single_summary_id:
        summary = await BookSummary.get(single_summary_id)
        if not summary or summary.book_id != book_id:
            print(red(f"\n  ✘ Summary '{single_summary_id}' not found for this book.\n"))
            sys.exit(1)
        summaries = [summary]
    else:
        summaries = await BookSummary.find(
            BookSummary.book_id == book_id
        ).to_list()

    if not summaries:
        print(yellow(f"\n  No summaries found for book '{book.title}'.\n"))
        sys.exit(0)

    # --- Show what will be deleted ---
    print(f"\n  {cyan('Book')}: {book.title} {dim(f'({book_id})')}")
    print(f"  {dim('Book will be KEPT — only summaries are deleted.')}")
    print()

    total_panels = 0
    for s in summaries:
        sid = str(s.id)
        panels = await LivingPanelDoc.find(
            LivingPanelDoc.summary_id == sid
        ).count()
        total_panels += panels

        status_icon = {
            "complete": green("✔"),
            "failed": red("✘"),
            "pending": yellow("○"),
        }.get(s.status.value if hasattr(s.status, 'value') else s.status, yellow("?"))

        model_str = dim(s.model or "unknown model")
        cost_str = dim(f"${s.estimated_cost_usd:.3f}")
        print(
            f"    {status_icon} {sid}  "
            f"{s.style.value:10s}  "
            f"{s.status.value if hasattr(s.status, 'value') else s.status:12s}  "
            f"{panels:3d} panels  "
            f"{model_str}  {cost_str}"
        )

    print(f"\n  {yellow('Total')}: {len(summaries)} summaries, {total_panels} panels")
    print()

    if not force:
        answer = input(f"  {red('Delete these summaries?')} [y/N] ").strip().lower()
        if answer != "y":
            print(dim("  Aborted."))
            sys.exit(0)

    # --- Delete ---
    deleted = {"panels": 0, "summaries": 0, "jobs": 0}

    for s in summaries:
        sid = str(s.id)

        # Panels
        result = await LivingPanelDoc.find(
            LivingPanelDoc.summary_id == sid
        ).delete()
        deleted["panels"] += getattr(result, "deleted_count", 0)

        # Job status
        if s.celery_task_id:
            result = await JobStatus.find(
                JobStatus.celery_task_id == s.celery_task_id
            ).delete()
            deleted["jobs"] += getattr(result, "deleted_count", 0)

        # Summary
        await s.delete()
        deleted["summaries"] += 1

    # --- Report ---
    print(f"  {green('✔')} {deleted['summaries']} summaries removed")
    print(f"  {green('✔')} {deleted['panels']} living panels removed")
    print(f"  {green('✔')} {deleted['jobs']} job statuses removed")
    print(f"  {dim('Book preserved — ready for re-summarization.')}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
