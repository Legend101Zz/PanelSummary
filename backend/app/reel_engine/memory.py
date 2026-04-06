"""
memory.py — BookReelMemory CRUD
=================================
Tracks which content has been used in reels for each book.
Prevents repeat content across reel generations.
"""

import logging
from datetime import datetime
from typing import Optional

from app.models import BookReelMemory

logger = logging.getLogger(__name__)


async def get_or_create_memory(book_id: str, summary_id: str) -> BookReelMemory:
    """Get existing memory or create a fresh one."""
    memory = await BookReelMemory.find_one(BookReelMemory.book_id == book_id)
    if memory:
        return memory

    memory = BookReelMemory(
        book_id=book_id,
        summary_id=summary_id,
        used_content_ids=[],
        total_reels_generated=0,
        exhausted=False,
    )
    await memory.insert()
    logger.info(f"Created reel memory for book {book_id}")
    return memory


async def mark_content_used(
    book_id: str,
    content_ids: list[str],
) -> None:
    """Mark content IDs as used after a reel is generated."""
    memory = await BookReelMemory.find_one(BookReelMemory.book_id == book_id)
    if not memory:
        logger.warning(f"No memory found for book {book_id}")
        return

    for cid in content_ids:
        if cid not in memory.used_content_ids:
            memory.used_content_ids.append(cid)

    memory.total_reels_generated += 1
    memory.updated_at = datetime.utcnow()
    await memory.save()


async def check_exhaustion(
    book_id: str,
    total_available: int,
) -> bool:
    """Check if all content has been exhausted for a book."""
    memory = await BookReelMemory.find_one(BookReelMemory.book_id == book_id)
    if not memory:
        return False

    exhausted = len(memory.used_content_ids) >= total_available
    if exhausted and not memory.exhausted:
        memory.exhausted = True
        memory.updated_at = datetime.utcnow()
        await memory.save()

    return exhausted
