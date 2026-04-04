"""
_db.py — Shared database connection helper for scripts.
=========================================================
DRY: every script needs MongoDB + Beanie init.
This module does it once.

Usage:
    from _db import connect, Book, BookSummary, LivingPanelDoc, JobStatus, Settings
    await connect()
"""

import asyncio
import sys
import os

# Add backend to path so we can import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.config import get_settings, Settings
from app.models import Book, BookSummary, LivingPanelDoc, JobStatus


async def connect():
    """Initialize MongoDB + Beanie. Call once at script startup."""
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.db_name]
    await init_beanie(
        database=db,
        document_models=[Book, BookSummary, LivingPanelDoc, JobStatus],
    )
    return settings
