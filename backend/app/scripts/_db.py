"""
_db.py — Shared database connection helper for scripts.
=========================================================
DRY: every script needs MongoDB + Beanie init. This module does it once.

Usage:
    from _db import connect, Book, JobStatus, Settings
    await connect()
"""

import os
import sys

# Ensure the backend directory is on sys.path so `app.*` imports work
# regardless of where the script is invoked from.
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from app.config import Settings, get_settings  # noqa: E402,F401  (re-exported)
from app.manga_models import (  # noqa: E402,F401  (re-exported)
    MangaAssetDoc, MangaPageDoc, MangaProjectDoc, MangaSliceDoc,
)
from app.models import Book, JobStatus  # noqa: E402,F401  (re-exported)
from beanie import init_beanie  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


async def connect():
    """Initialize MongoDB + Beanie. Call once at script startup."""
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.db_name]
    await init_beanie(
        database=db,
        document_models=[
            Book, JobStatus,
            MangaProjectDoc, MangaSliceDoc, MangaPageDoc, MangaAssetDoc,
        ],
    )
    return settings
