"""Mongo + Beanie initialisation shared by the API and the job runner."""

from __future__ import annotations

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.documents import DOCUMENTS
from app.settings import get_settings

_client: AsyncIOMotorClient | None = None


async def init_db() -> AsyncIOMotorClient:
    global _client
    settings = get_settings()
    if _client is None:
        _client = AsyncIOMotorClient(settings.mongodb_url, tz_aware=True)
        await init_beanie(database=_client[settings.db_name], document_models=DOCUMENTS)
    return _client


def close_db() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
