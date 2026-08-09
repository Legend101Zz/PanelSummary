"""
config.py — Environment Variables & Settings
============================================
This file reads configuration from environment variables (your .env file).
WHY: We never hardcode secrets in code. If the code is shared, secrets stay safe.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache
import os, pathlib

def _default_storage() -> str:
    # Walk up from this file to find the repo root (contains storage/)
    here = pathlib.Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "storage"
        if candidate.exists():
            return str(candidate)
    # Fallback: create next to backend/
    fallback = here.parent.parent.parent / "storage"
    fallback.mkdir(parents=True, exist_ok=True)
    (fallback / "pdfs").mkdir(exist_ok=True)
    (fallback / "images").mkdir(exist_ok=True)
    return str(fallback)


class Settings(BaseSettings):
    # --- Database ---
    mongodb_url: str = "mongodb://localhost:27017"
    db_name: str = "panelsummary"

    # --- Redis (job queue) ---
    redis_url: str = "redis://localhost:6379"

    # --- Security ---
    secret_key: str = "dev-secret-change-in-production"

    # --- CORS (which frontend URLs can call our API) ---
    cors_origins: str = "http://localhost:3000"

    # --- File Storage (local filesystem — no GridFS) ---
    upload_dir: str = "/tmp/uploads"
    storage_dir: str = ""          # set at runtime if blank
    max_pdf_size_mb: int = 50

    @property
    def pdf_dir(self) -> str:
        base = self.storage_dir or _default_storage()
        return f"{base}/pdfs"

    @property
    def image_dir(self) -> str:
        base = self.storage_dir or _default_storage()
        return f"{base}/images"

    # --- LLM Defaults ---
    default_model: str = "MiniMax-M3"
    max_tokens_per_chapter: int = 4000   # Cap to control costs
    llm_request_timeout_seconds: float = 1800.0  # Hard wall-clock cap per text LLM call
    llm_slow_warning_seconds: float = 300.0      # Log slow provider calls for diagnosis

    # --- OpenRouter (server-side key for model list proxy only) ---
    openrouter_api_key: str = ""

    # --- MiniMax (server-side drafting lane) ---
    minimax_api_key: str = ""

    # --- Large PDF budget ---
    max_pages_per_job: int = 100   # Warn user beyond this; ~65k tokens

    # --- Manga pipeline ---
    # Always "legacy" today — the v2 pipeline is the only one shipped.
    # The flag is preserved so we can stage future pipeline rewrites
    # without touching consumers, and so existing tests keep passing.
    manga_pipeline_version: str = "legacy"

    # --- Durable context (issue #4 / blueprint Phase 1) ---
    # When True, generate_project_slice sources its slice text from a
    # compiled ContextPack (built from SourceUnitDocs + the active memory
    # snapshot) instead of reading Book.chapters directly. The derived text
    # is byte-compared against the legacy builder and any mismatch raises,
    # so flag-on can never silently change generated output (ADR-011).
    use_compiled_context: bool = False
    # Token budget handed to the ContextCompiler on the v1 bridge path.
    # Generous by design: Phase 1 must never drop mandatory source evidence.
    compiled_context_max_input_tokens: int = 120_000

    # --- ModelPolicy speed/quality modes (issue #3, owner policy 2026-08-08,
    # Session 5 Goal B) ---
    # mode "speed"   = MiniMax-M2.7-highspeed
    # mode "quality" = MiniMax-M3 (the DEFAULT mode)
    # Per-purpose defaults are CONFIG, not code (env-overridable:
    # AGENT_MODEL_MODE_DIRECTION, AGENT_MODEL_MODE_PAGE_WRITING,
    # AGENT_MODEL_MODE_THUMBNAIL). The Session 4 bake-off confirmed the fast
    # lane for the planning purposes; direction stays on quality. Vision is
    # NOT configurable — M3 is the only vision model (locked in
    # model_policy.py). Never change these silently: receipts record the
    # resolved mode and its provenance.
    agent_model_mode_direction: str = "quality"
    agent_model_mode_page_writing: str = "speed"
    agent_model_mode_thumbnail: str = "speed"

    # --- Agentic manga pipeline (issues #5/#6 / blueprint §12.3) ---
    # When True, a SUCCESSFUL v1 slice additionally runs the agentic
    # planning lane (Manga Director -> page scripts -> thumbnails) as a
    # fallback-guarded SHADOW lane against the slice's frozen scope: it
    # writes only v2-lane rows and any failure is logged and swallowed, so
    # v1 output is returned unchanged either way. Requires
    # use_compiled_context (the lane needs the frozen scope). Default OFF:
    # v1 behavior is byte-identical and the module is never even imported.
    agentic_manga_pipeline_v1: bool = False

    # --- Agent seam raw-arguments dump (Session 7 step 0) ---
    # When set to a directory path, EVERY submit-tool invocation at the
    # sealed agent seam (submit_page_script_set / submit_thumbnail_set)
    # dumps its PRE-normalization arguments verbatim to one JSON file
    # (tool + stage_run_id + UTC stamp) BEFORE any unwrap or validation
    # runs. Purpose: the Session 6 M3 tool-frame mangling left a FOURTH,
    # unexplained shape (attempt 10: every top-level field dropped) that
    # the bounded 422 digests cannot reconstruct — the next paid attempt
    # must show exactly what arrived at the seam. Empty string = off (the
    # default; zero dump I/O on any path). Env: AGENT_SEAM_RAW_DUMP_DIR.
    agent_seam_raw_dump_dir: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]


# lru_cache means this function only runs ONCE and caches the result
# WHY: We don't want to re-read the .env file on every request
@lru_cache()
def get_settings() -> Settings:
    return Settings()
