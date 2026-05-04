#!/usr/bin/env python3
"""
delete_book.py — Nuclear option: delete a book and ALL related data.
=====================================================================
Deletes:
  • Book document
  • All MangaProjectDoc / MangaSliceDoc / MangaPageDoc / MangaAssetDoc for it
  • All JobStatus docs linked to the book or its manga projects
  • Local filesystem images (cover, page renders, generated assets)

Usage:
    python scripts/delete_book.py <book_id>
    python scripts/delete_book.py <book_id> --force   # skip confirmation
"""

import asyncio
import os
import shutil
import sys

# Add backend/ to sys.path so `app.*` imports work when running as a script
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))


def red(s: str) -> str:    return f"\033[91m{s}\033[0m"
def green(s: str) -> str:  return f"\033[92m{s}\033[0m"
def yellow(s: str) -> str: return f"\033[93m{s}\033[0m"
def dim(s: str) -> str:    return f"\033[2m{s}\033[0m"


async def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        sys.exit(1)

    book_id = sys.argv[1]
    force = "--force" in sys.argv

    from app.scripts._db import (
        Book, JobStatus, MangaAssetDoc, MangaPageDoc,
        MangaProjectDoc, MangaSliceDoc, connect,
    )
    settings = await connect()

    # --- Fetch the book ---
    book = await Book.get(book_id)
    if not book:
        print(red(f"\n  ✘ Book '{book_id}' not found.\n"))
        sys.exit(1)

    # --- Collect related v2 manga data ---
    projects = await MangaProjectDoc.find(MangaProjectDoc.book_id == book_id).to_list()
    project_ids = [str(p.id) for p in projects]

    slice_count = 0
    page_count = 0
    asset_count = 0
    for pid in project_ids:
        slice_count += await MangaSliceDoc.find(MangaSliceDoc.project_id == pid).count()
        page_count += await MangaPageDoc.find(MangaPageDoc.project_id == pid).count()
        asset_count += await MangaAssetDoc.find(MangaAssetDoc.project_id == pid).count()

    # Job statuses linked to book or projects
    celery_ids: set[str] = set()
    if book.celery_task_id:
        celery_ids.add(book.celery_task_id)
    for p in projects:
        for sl in await MangaSliceDoc.find(MangaSliceDoc.project_id == str(p.id)).to_list():
            tid = getattr(sl, "celery_task_id", None)
            if tid:
                celery_ids.add(tid)

    job_count = 0
    for cid in celery_ids:
        job_count += await JobStatus.find(JobStatus.celery_task_id == cid).count()

    # Check for local images (book parse renders + generated character assets)
    image_dir = os.path.join(settings.image_dir, book_id)
    has_images = os.path.isdir(image_dir)
    image_files: list[str] = []
    if has_images:
        for root, _, files in os.walk(image_dir):
            image_files.extend(files)

    # --- Show what will be deleted ---
    print()
    print(f"  {yellow('BOOK')}:            {book.title} {dim(f'({book_id})')}")
    print(f"  {yellow('Chapters')}:        {book.total_chapters}")
    print(f"  {yellow('Pages')}:           {book.total_pages}")
    print(f"  {yellow('Manga Projects')}:  {len(projects)}")
    print(f"  {yellow('Manga Slices')}:    {slice_count}")
    print(f"  {yellow('Manga Pages')}:     {page_count}")
    print(f"  {yellow('Manga Assets')}:    {asset_count}")
    print(f"  {yellow('Job Statuses')}:    {job_count}")
    print(f"  {yellow('Image Files')}:     {len(image_files)} {dim(f'in {image_dir}') if has_images else ''}")
    print()

    if not force:
        answer = input(f"  {red('Delete ALL of the above?')} [y/N] ").strip().lower()
        if answer != "y":
            print(dim("  Aborted."))
            sys.exit(0)

    # --- Delete in dependency order (leaves before roots) ---
    deleted = {"assets": 0, "pages": 0, "slices": 0, "projects": 0, "jobs": 0, "images": 0}

    for pid in project_ids:
        r = await MangaAssetDoc.find(MangaAssetDoc.project_id == pid).delete()
        deleted["assets"] += getattr(r, "deleted_count", 0)
        r = await MangaPageDoc.find(MangaPageDoc.project_id == pid).delete()
        deleted["pages"] += getattr(r, "deleted_count", 0)
        r = await MangaSliceDoc.find(MangaSliceDoc.project_id == pid).delete()
        deleted["slices"] += getattr(r, "deleted_count", 0)

    for p in projects:
        await p.delete()
        deleted["projects"] += 1

    for cid in celery_ids:
        r = await JobStatus.find(JobStatus.celery_task_id == cid).delete()
        deleted["jobs"] += getattr(r, "deleted_count", 0)

    if has_images:
        shutil.rmtree(image_dir, ignore_errors=True)
        deleted["images"] = len(image_files)

    await book.delete()

    print(f"  {green('✔')} Book deleted")
    print(f"  {green('✔')} {deleted['projects']} manga projects removed")
    print(f"  {green('✔')} {deleted['slices']} slices removed")
    print(f"  {green('✔')} {deleted['pages']} pages removed")
    print(f"  {green('✔')} {deleted['assets']} assets removed")
    print(f"  {green('✔')} {deleted['jobs']} job statuses removed")
    print(f"  {green('✔')} {deleted['images']} image files removed")
    print()


if __name__ == "__main__":
    asyncio.run(main())
