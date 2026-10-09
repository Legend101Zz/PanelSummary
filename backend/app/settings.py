"""Runtime configuration for the PanelSummary backend (API + job runner).

Values come from the process environment first, then ``backend/.env``.
The backend never holds the MiniMax key: only the agent worker process does.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]

# Models the worker accepts (D2). The per-goal defaults below are the measured policy (D13,
# 2026-10-09): Flash for plan and pages, M3 for the book understanding. M3 stays the fallback.
ALLOWED_MODELS = ("MiniMax-M3", "MiniMax-M3.1-Flash-Preview", "MiniMax-M2.7-highspeed", "MiniMax-M2.7")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- storage ---
    mongodb_url: str = "mongodb://127.0.0.1:27017"
    db_name: str = "panelsummary"
    storage_dir: str = str(REPO_ROOT / "storage")
    max_pdf_size_mb: int = 60

    # --- v0.1 size limits (D19). Generate refuses a book above either limit; upload stays open.
    # Evidence: the largest book run end to end has 68 PDF pages and 16,159 words.
    # Each limit is that figure plus 8 % (words) or 10 % (pages). See docs/launch/T3-scope.md.
    # Override with MAX_PDF_PAGES and MAX_SOURCE_WORDS.
    max_pdf_pages: int = 75
    max_source_words: int = 17500

    # --- HTTP ---
    cors_origins: str = "http://localhost:3100"

    # --- agent worker (the MiniMax harness) ---
    agent_worker_url: str = "http://127.0.0.1:8788"
    agent_worker_token: str = ""
    agent_call_timeout_seconds: float = 1800.0  # above the longest goal timeout (understanding: 25 min)

    # --- generation policy (recorded on every edition) ---
    understanding_model: str = "MiniMax-M3.1-Flash-Preview"
    understanding_thinking: str = "low"
    plan_model: str = "MiniMax-M3.1-Flash-Preview"
    plan_thinking: str = "off"  # Flash cannot turn thinking off: the harness sends adaptive effort low
    page_model: str = "MiniMax-M3.1-Flash-Preview"
    page_thinking: str = "off"  # same; with M3 pages, "off" is also the right retry level (see below)
    page_vision: bool = True
    page_concurrency: int = 4
    page_attempts: int = 2
    # A retry escalates the thinking level, per goal (D13). Understanding keeps "low" (it never
    # runs below low). Plan and pages retry at "medium" on Flash. If a page goal is switched back
    # to MiniMax-M3, set PAGE_RETRY_THINKING=off: a retry at "low" was cut off by runaway thinking
    # in 6 of 7 recorded M3 runs (F1).
    # RETRY_THINKING (the old single setting) stays as a fallback for the plan and page goals
    # when their own variable is not set. It does not change the understanding retry.
    understanding_retry_thinking: str = "medium"
    plan_retry_thinking: str | None = None
    page_retry_thinking: str | None = None
    retry_thinking: str | None = None

    # --- job runner ---
    job_lease_seconds: int = 90
    job_poll_seconds: float = 1.5

    @field_validator("understanding_model", "plan_model", "page_model")
    @classmethod
    def _model_is_allowed(cls, value: str) -> str:
        if value not in ALLOWED_MODELS:
            raise ValueError(f"model {value!r} is not allowed; use one of {', '.join(ALLOWED_MODELS)}")
        return value

    @model_validator(mode="after")
    def _resolve_retry_thinking(self) -> "Settings":
        fallback = self.retry_thinking or "medium"
        if self.plan_retry_thinking is None:
            self.plan_retry_thinking = fallback
        if self.page_retry_thinking is None:
            self.page_retry_thinking = fallback
        return self

    def policy_fields(self) -> dict:
        """Per-goal model, thinking and retry thinking, as recorded on an edition (D13)."""
        return {
            "understanding_model": self.understanding_model,
            "understanding_thinking": self.understanding_thinking,
            "understanding_retry_thinking": self.understanding_retry_thinking,
            "plan_model": self.plan_model,
            "plan_thinking": self.plan_thinking,
            "plan_retry_thinking": self.plan_retry_thinking,
            "page_model": self.page_model,
            "page_thinking": self.page_thinking,
            "page_retry_thinking": self.page_retry_thinking,
            "page_vision": self.page_vision,
            "page_attempts": self.page_attempts,
            # kept for readers of older editions: the page goal's retry level
            "retry_thinking": self.page_retry_thinking,
        }

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
