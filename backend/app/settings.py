"""Runtime configuration for the PanelSummary backend (API + job runner).

Values come from the process environment first, then ``backend/.env``.
The backend never holds the MiniMax key: only the agent worker process does.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- storage ---
    mongodb_url: str = "mongodb://127.0.0.1:27017"
    db_name: str = "panelsummary"
    storage_dir: str = str(REPO_ROOT / "storage")
    max_pdf_size_mb: int = 60

    # --- HTTP ---
    cors_origins: str = "http://localhost:3100"

    # --- agent worker (the MiniMax harness) ---
    agent_worker_url: str = "http://127.0.0.1:8788"
    agent_worker_token: str = ""
    agent_call_timeout_seconds: float = 1500.0

    # --- generation policy (recorded on every edition) ---
    understanding_model: str = "MiniMax-M3"
    understanding_thinking: str = "off"
    plan_model: str = "MiniMax-M3"
    plan_thinking: str = "off"
    page_model: str = "MiniMax-M3"
    page_thinking: str = "off"
    page_vision: bool = True
    page_concurrency: int = 4
    page_attempts: int = 2
    # A retry escalates the thinking level (measured: "off" is 3-5x faster with
    # equal quality; "low" is the safer fallback when an attempt fails).
    retry_thinking: str = "low"

    # --- job runner ---
    job_lease_seconds: int = 90
    job_poll_seconds: float = 1.5

    @property
    def pdf_dir(self) -> Path:
        return Path(self.storage_dir) / "pdfs"

    @property
    def cache_dir(self) -> Path:
        return Path(self.storage_dir) / "cache"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
