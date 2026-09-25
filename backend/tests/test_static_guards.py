"""Static guards for the product rules (no network, no database).

- No image-generation surface in any kept backend, worker or runtime source.
- The backend does not import Celery, Redis or an LLM SDK: it only stores,
  serves, and calls the agent worker; the worker alone talks to MiniMax.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / "backend"

SOURCE_ROOTS = [
    (BACKEND / "app", "*.py"),
    (BACKEND, "requirements.txt"),
    (REPO / "apps" / "agent-worker" / "src", "*.ts"),
    (REPO / "apps" / "agent-worker" / "src" / "skills", "*.md"),
    (REPO / "apps" / "agent-worker" / "scripts", "*.ts"),
    (REPO / "packages" / "agent-runtime" / "src", "*.ts"),
]

IMAGE_GENERATION = re.compile(
    r"openrouter|image_generator|gemini|/images/generations|generate_image|dall[-_ ]?e\b"
    r"|stability|midjourney|\bimagen\b|replicate\.com|fal\.ai",
    re.IGNORECASE,
)

BANNED_BACKEND_IMPORTS = {"celery", "redis", "openai", "anthropic", "tiktoken", "docling", "PIL"}


def _files() -> list[Path]:
    found: list[Path] = []
    for root, pattern in SOURCE_ROOTS:
        assert root.exists(), f"missing source root {root}"
        found.extend(p for p in root.rglob(pattern) if "node_modules" not in p.parts and "__pycache__" not in p.parts)
    return sorted(set(found))


def test_the_guard_scans_the_product_sources():
    names = {p.relative_to(REPO).as_posix() for p in _files()}
    for expected in (
        "backend/app/jobs/generate.py",
        "apps/agent-worker/src/server.ts",
        "apps/agent-worker/src/goals/manga-page.ts",
        "apps/agent-worker/src/skills/manga-page/SKILL.md",
        "packages/agent-runtime/src/goal-runtime.ts",
    ):
        assert expected in names


def test_no_image_generation_surface():
    hits = []
    for path in _files():
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if IMAGE_GENERATION.search(line):
                hits.append(f"{path.relative_to(REPO)}:{number}: {line.strip()[:120]}")
    assert not hits, "image-generation surface found:\n" + "\n".join(hits)


def test_no_image_generation_modules():
    names = {p.stem.lower() for p in _files()}
    assert not {n for n in names if "image_gen" in n or "page_art" in n or "openrouter" in n}


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    roots: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            roots.add(node.module.split(".")[0])
    return roots


def test_backend_has_no_queue_or_llm_imports():
    offenders = []
    for path in sorted((BACKEND / "app").rglob("*.py")):
        banned = _imports(path) & BANNED_BACKEND_IMPORTS
        if banned:
            offenders.append(f"{path.relative_to(REPO)}: {sorted(banned)}")
    assert not offenders, "backend imports a banned package:\n" + "\n".join(offenders)


def test_requirements_do_not_pin_banned_packages():
    pinned = {
        re.split(r"[\[=<>~ ]", line.strip(), maxsplit=1)[0].lower()
        for line in (BACKEND / "requirements.txt").read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    }
    assert not pinned & {"celery", "redis", "flower", "openai", "tiktoken", "docling", "pillow"}


def test_backend_never_holds_the_model_key():
    for path in sorted((BACKEND / "app").rglob("*.py")):
        assert "MINIMAX_API_KEY" not in path.read_text(encoding="utf-8"), path
