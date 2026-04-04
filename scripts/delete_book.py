#!/usr/bin/env python3
"""
delete_book.py — Nuclear option: delete a book and ALL related data.
=====================================================================
Deletes:
  • Book document
  • All BookSummary documents for this book
  • All LivingPanelDoc documents for those summaries
  • All JobStatus docs linked to the book or its summaries
  • Local filesystem images (cover, page renders, generated images)

Usage:
    python scripts/delete_book.py <book_id>
    python scripts/delete_book.py <book_id> --force   # skip confirmation
"""

import asyncio
import os
import shutil
import sys


def red(s: str) -> str:
    return f"\033[91m{s}\033[0m"


def green(s: str) -> str:
    return f"\033[92m{s}\033[0m"


def yellow(s: str) -> str:
    return f"\033[93m{s}\033[0m"


def dim(s: str) -> str:
    return f"\033[2m{s}\033[0m"


async def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        sys.exit(1)

    book_id = sys.argv[1]
    force = "--force" in sys.argv

    from _db import connect, Book, BookSummary, LivingPanelDoc, JobStatus
    settings = await connect()

    # --- Fetch the book ---
    book = await Book.get(book_id)
    if not book:
        print(red(f"\n  ✘ Book '{book_id}' not found.\n"))
        sys.exit(1)

    # --- Collect related data ---
    summaries = await BookSummary.find(BookSummary.book_id == book_id).to_list()
    summary_ids = [str(s.id) for s in summaries]

    panel_count = 0
    for sid in summary_ids:
        panel_count += await LivingPanelDoc.find(
            LivingPanelDoc.summary_id == sid
        ).count()

    # Job statuses linked to book or summaries
    celery_ids = set()
    if book.celery_task_id:
        celery_ids.add(book.celery_task_id)
    for s in summaries:
        if s.celery_task_id:
            celery_ids.add(s.celery_task_id)

    job_count = 0
    if celery_ids:
        for cid in celery_ids:
            job_count += await JobStatus.find(
                JobStatus.celery_task_id == cid
            ).count()

    # Check for local images
    image_dir = os.path.join(settings.image_dir, book_id)
    has_images = os.path.isdir(image_dir)
    image_files = []
    if has_images:
        for root, _, files in os.walk(image_dir):
            image_files.extend(files)

    # --- Show what will be deleted ---
    print()
    print(f"  {yellow('BOOK')}:            {book.title} {dim(f'({book_id})')}") 
    print(f"  {yellow('Chapters')}:        {book.total_chapters}")
    print(f"  {yellow('Pages')}:           {book.total_pages}")
    print(f"  {yellow('Summaries')}:       {len(summaries)}")
    print(f"  {yellow('Living Panels')}:   {panel_count}")
    print(f"  {yellow('Job Statuses')}:    {job_count}")
    print(f"  {yellow('Image Files')}:     {len(image_files)} {dim(f'in {image_dir}') if has_images else ''}")
    print()

    if not force:
        answer = input(f"  {red('Delete ALL of the above?')} [y/N] ").strip().lower()
        if answer != "y":
            print(dim("  Aborted."))
            sys.exit(0)

    # --- Delete in correct order (leaves before roots) ---
    deleted = {"panels": 0, "summaries": 0, "jobs": 0, "images": 0}

    # 1. Living panels
    for sid in summary_ids:
        result = await LivingPanelDoc.find(
            LivingPanelDoc.summary_id == sid
        ).delete()
        deleted["panels"] += getattr(result, "deleted_count", 0)

    # 2. Summaries
    for s in summaries:
        await s.delete()
        deleted["summaries"] += 1

    # 3. Job statuses
    for cid in celery_ids:
        result = await JobStatus.find(
            JobStatus.celery_task_id == cid
        ).delete()
        deleted["jobs"] += getattr(result, "deleted_count", 0)

    # 4. Local images
    if has_images:
        shutil.rmtree(image_dir, ignore_errors=True)
        deleted["images"] = len(image_files)

    # 5. The book itself
    await book.delete()

    # --- Report ---
    print(f"  {green('✔')} Book deleted")
    print(f"  {green('✔')} {deleted['summaries']} summaries removed")
    print(f"  {green('✔')} {deleted['panels']} living panels removed")
    print(f"  {green('✔')} {deleted['jobs']} job statuses removed")
    print(f"  {green('✔')} {deleted['images']} image files removed")
    print()


if __name__ == "__main__":
    asyncio.run(main())
