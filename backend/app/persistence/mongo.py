"""Mongo lifecycle helpers used by the API and Celery processes."""

from __future__ import annotations

from typing import Any

from beanie import init_beanie
from pymongo import AsyncMongoClient

from .documents import DOCUMENT_MODELS


async def initialize_mongo(mongo_uri: str, database_name: str) -> AsyncMongoClient[dict[str, Any]]:
    client: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(
        mongo_uri,
        tz_aware=True,
    )
    await init_beanie(database=client[database_name], document_models=list(DOCUMENT_MODELS))
    return client
