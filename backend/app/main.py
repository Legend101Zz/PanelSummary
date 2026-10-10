"""PanelSummary API.

Upload a PDF, press Generate, read the manga. Generation runs in the job
runner (``python -m app.runner``) through the agent worker (MiniMax via the
sealed Pi harness); this process only stores and serves.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.editions import router as editions_router
from app.api.library import router as library_router
from app.api.status import router as status_router
from app.api.samples import router as samples_router
from app.db import close_db, init_db
from app.settings import get_settings

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    get_settings().pdf_dir.mkdir(parents=True, exist_ok=True)
    yield
    close_db()


app = FastAPI(title="PanelSummary API", version="3.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins_list,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.include_router(library_router)
app.include_router(editions_router)
app.include_router(status_router)
app.include_router(samples_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "at": datetime.now(timezone.utc).isoformat()}
