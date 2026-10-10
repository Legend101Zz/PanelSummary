"""Seed a database with one book for every UI state (S2). For UI tracks, reviewers and gates.

    backend/.venv/bin/python scripts/fixtures/seed_states.py --db v02_s2 \
        --mongo-url mongodb://127.0.0.1:27170 --storage <dir> --web http://127.0.0.1:3270

The database name MUST start with "v02_" or "fixture_". The script refuses any other name, any
Mongo URL that is not on this computer, and it never reads backend/.env. It EMPTIES the named
database first (the seed is a fixture, not a library). No model is called and nothing is spent.

What is real. Page art is only ever a real persisted SVG from a saved run:
  - Andersen: the 18 pages of the v0.1 final journey, read from backend/samples/andersen (committed).
  - Happy Prince, two tales (22 pages) and Happy Prince, 68-page book (60 pages): the saved exports in
    <exports>/uab-m3-local/export and <exports>/gate2b-ci/live-run/export. Without --exports these two books
    use the Andersen pages instead, and the 60-page book is left out.
The panel and text geometry of the export pages is made by the renderer from the saved spec; the renderer
is used for geometry only. The stored page art is always the SAVED SVG, with the renderer version the run recorded
(journey-report.json next to the export). Saved exports come from older renderers, so today's renderer may not
reproduce them; use --verify-render to make that an error. Titles, authors,
statuses, page states, provider stops and error texts of the fixture books are fixture data. Page numbers,
claims, beats, receipts and totals come from the real runs. Fixture runs are partial copies of a real run (the
first N pages, the plan cut to N pages), so totals are the sum of the receipts that the copy holds.

No job is left for the job runner. An active state has a job with status "running" and a lease that ends in
the year 2099, so ``claim_job`` ignores it. A test proves this (backend/tests/test_samples.py).
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / "backend"
BOOKS = REPO / "scripts" / "acceptance" / "books"
SAMPLE_DIR = BACKEND / "samples" / "andersen"
TSX = REPO / "apps" / "agent-worker" / "node_modules" / ".bin" / "tsx"
RENDER_HELPER = Path(__file__).resolve().parent / "render_export_pages.ts"
DEFAULT_EXPORTS = Path("/Volumes/Mrigesh SSD/Book-Reel-scratch/launch")
ALLOWED_PREFIXES = ("v02_", "fixture_")
COLLECTIONS = ["library_books", "book_sources", "editions", "edition_artifacts", "edition_pages", "generation_jobs"]
FAR_FUTURE = datetime(2099, 1, 1, tzinfo=timezone.utc)
LEASE_OWNER = "fixture:static"  # nobody ever extends this lease; claim_job only takes expired ones

NO_SUBMISSION = {"code": "NO_SUBMISSION", "message": "finished without an accepted submission"}
CUT_OFF = {"code": "NO_SUBMISSION", "message": "output cut off at the token limit without a submission"}
LIMIT_TEXT = "Token Plan usage limit reached: Upgrade your Token Plan or purchase Credits for more usage. (2056)"
PROVIDER_STOPS = {
    "PROVIDER_LIMIT": ("rate_limit_error", 429, LIMIT_TEXT),
    "PROVIDER_AUTH": ("authentication_error", 401, "invalid api key"),
    "PROVIDER_UNAVAILABLE": ("overloaded_error", 529, "Overloaded"),
}


# --------------------------------------------------------------------------- helpers


def refuse(message: str) -> None:
    print(f"refused: {message}", file=sys.stderr)
    raise SystemExit(2)


def oid(name: str) -> str:
    """A stable 24-hex id, so the URLs survive a re-seed."""
    return hashlib.sha1(f"v02-fixture:{name}".encode()).hexdigest()[:24]


def with_oid(doc: dict) -> dict:
    """Mongo wants a real ObjectId for _id; references between documents stay strings, as the backend writes them."""
    from bson import ObjectId

    return {**doc, "_id": ObjectId(doc["_id"])}


def sha256(data: bytes | str) -> str:
    return hashlib.sha256(data.encode() if isinstance(data, str) else data).hexdigest()


def canonical_hash(value: Any) -> str:
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False))


def iso_to_dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


# --------------------------------------------------------------------------- templates (real runs)


class Template:
    """A real run that the fixture editions copy from: artifacts, pages with SVG, receipts, timing offsets."""

    def __init__(self, key: str, understanding: dict, plan: dict, pages: dict[int, dict], policy: dict, offsets: dict, pdf: Path):
        self.key = key
        self.understanding = understanding  # {schema_id, content, content_hash, receipt}
        self.plan = plan
        self.pages = pages  # n -> {spec, svg, svg_hash, renderer_version, panels, texts, warnings, receipts, attempts, section_id}
        self.policy = policy
        self.offsets = offsets  # seconds after created_at: first_page, finish (+ optional generate_started, drawing_started)
        self.pdf = pdf

    @property
    def page_count(self) -> int:
        return len(self.pages)


def load_andersen() -> Template:
    import gzip

    data = json.loads(gzip.open(SAMPLE_DIR / "sample.json.gz").read().decode("utf-8"))
    manifest = json.loads((SAMPLE_DIR / "manifest.json").read_text(encoding="utf-8"))
    artifacts = {a["kind"]: a for a in data["artifacts"]}
    created = iso_to_dt(data["edition"]["created_at"])
    timings = {k: iso_to_dt(v) for k, v in data["edition"]["timings"].items()}
    offsets = {
        "generate_started": (timings["generate_started_at"] - created).total_seconds(),
        "drawing_started": (timings["drawing_started_at"] - created).total_seconds(),
        "first_page": (timings["first_page_at"] - created).total_seconds(),
        "finish": (iso_to_dt(data["edition"]["finished_at"]) - created).total_seconds(),
    }
    pages = {}
    for page in data["pages"]:
        pages[page["page_number"]] = {k: page[k] for k in ("section_id", "spec", "svg", "svg_hash", "renderer_version", "panels", "texts", "warnings", "receipts", "attempts")}
    pick = lambda a: {k: a[k] for k in ("schema_id", "content", "content_hash", "receipt")}  # noqa: E731
    return Template("andersen", pick(artifacts["understanding"]), pick(artifacts["plan"]), pages, data["edition"]["policy"], offsets, SAMPLE_DIR / manifest["pdf"])


def saved_renderer_version(export_dir: Path) -> str:
    """The renderer version the run recorded: journey-report.json sits next to the export directory."""
    report = export_dir.parent / "journey-report.json"
    try:
        found = sorted(set(re.findall(r"manga-render/[0-9]+\.[0-9]+\.[0-9]+", report.read_text(encoding="utf-8"))))
    except OSError:
        found = []
    return found[-1] if found else "unknown-saved-export"


def load_export(key: str, export_dir: Path, pdf: Path, verify_render: bool = False) -> Template:
    understanding = json.loads((export_dir / "understanding.json").read_text(encoding="utf-8"))
    plan = json.loads((export_dir / "plan.json").read_text(encoding="utf-8"))
    edition = json.loads((export_dir / "edition.json").read_text(encoding="utf-8"))
    calls = json.loads((export_dir / "receipts.json").read_text(encoding="utf-8"))["calls"]
    cmd = [str(TSX), str(RENDER_HELPER), str(export_dir)] + (["--verify"] if verify_render else [])
    run = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO)
    if run.returncode != 0:
        refuse(f"render_export_pages.ts failed for {export_dir}: {run.stderr.strip()[-400:]}")
    rendered = json.loads(run.stdout)
    saved_version = saved_renderer_version(export_dir)
    not_reproduced = sorted(int(n) for n, g in rendered["pages"].items() if not g.get("reproduced", True))
    if not_reproduced:
        print(f"note: {key}: {len(not_reproduced)} of {len(rendered['pages'])} saved pages are not reproduced by {rendered['renderer_version']} "
              f"(saved with {saved_version}); the saved SVG is stored, the panel and text geometry comes from today's renderer", file=sys.stderr)

    def artifact(content: dict, goal: str) -> dict:
        receipts = [c for c in calls if c.get("goal_type") == goal and c.get("state") == "SUCCEEDED"]
        return {"schema_id": content["schema"], "content": content, "content_hash": canonical_hash(content), "receipt": receipts[-1]}

    pages = {}
    for n_text, geometry in rendered["pages"].items():
        n = int(n_text)
        saved = json.loads((export_dir / "judge" / f"page-{n:02d}.json").read_text(encoding="utf-8"))
        receipts = [c for c in calls if c.get("page_number") == n]
        pages[n] = {
            "section_id": saved["spec"]["section_id"],
            "spec": saved["spec"],
            "svg": (export_dir / "judge" / f"page-{n:02d}.svg").read_text(encoding="utf-8"),
            "svg_hash": geometry["svg_hash"],
            "renderer_version": saved_version,
            "panels": geometry["panels"],
            "texts": geometry["texts"],
            "warnings": geometry["warnings"],
            "receipts": receipts,
            "attempts": max(1, len(receipts)),
        }
    timings = edition.get("timings", {})
    offsets = {"first_page": timings["created_to_first_page_s"], "finish": timings["created_to_finished_s"]}
    return Template(key, artifact(understanding, "BOOK_UNDERSTANDING"), artifact(plan, "ADAPTATION_PLAN"), pages, edition["policy"], offsets, pdf)


# --------------------------------------------------------------------------- PDFs


def make_blank_pdf(path: Path) -> None:
    import fitz

    doc = fitz.open()
    doc.new_page()  # a page with no text, like a scan
    doc.save(path)
    doc.close()


def make_long_pdf(path: Path) -> None:
    """150 pages: the four real test PDFs, one after the other (68 + 22 + 34 + 26)."""
    import fitz

    out = fitz.open()
    for source in (BOOKS / "happy-prince-and-other-tales.pdf", SAMPLE_DIR / "andersen-four-tales.pdf", BOOKS / "civil-disobedience.pdf", BOOKS / "happy-prince-two-tales.pdf"):
        with fitz.open(source) as part:
            out.insert_pdf(part)
    assert out.page_count == 150, out.page_count
    out.save(path)
    out.close()


# --------------------------------------------------------------------------- the run builder


def totals_of(receipts: list[dict]) -> dict:
    t = {"calls": 0, "failed_calls": 0, "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "cache_write_tokens": 0, "cost_usd": 0.0, "model_ms": 0}
    for r in receipts:
        tokens = r.get("tokens") or {}
        t["calls"] += 1
        t["failed_calls"] += 1 if r.get("state") != "SUCCEEDED" else 0
        t["input_tokens"] += tokens.get("input", 0)
        t["output_tokens"] += tokens.get("output", 0)
        t["cache_read_tokens"] += tokens.get("cache_read", 0)
        t["cache_write_tokens"] += tokens.get("cache_write", 0)
        t["cost_usd"] += r.get("cost_usd", 0.0) or 0.0
        t["model_ms"] += r.get("latency_ms", 0) or 0
    t["cost_usd"] = round(t["cost_usd"], 6)
    return t


def coverage_of(understanding: dict, plan: dict, pages: list[dict], section_ids: list[str]) -> dict:
    """The same formula as finalize() in backend/app/jobs/generate.py."""
    accepted = [p for p in pages if p["status"] == "accepted"]
    conveyed = {c for p in accepted for c in ((p["spec"] or {}).get("claims") or [])}
    planned_claims = {c: p["page_number"] for p in pages for c in p["claims"]}
    omitted = {e["claim"]: e.get("reason", "") for e in plan.get("omitted", [])}
    claims = understanding.get("claims", [])
    return {
        "claims_total": len(claims),
        "conveyed": sorted(conveyed),
        "lost_to_failed_pages": sorted(c for c, _n in planned_claims.items() if c not in conveyed),
        "omitted_by_plan": [{"claim": c, "reason": r} for c, r in omitted.items()],
        "not_planned": sorted(c["id"] for c in claims if c["id"] not in planned_claims and c["id"] not in omitted),
        "required_not_planned": sorted(c["id"] for c in claims if c.get("importance") in ("core", "supporting") and c["id"] not in planned_claims and c["id"] not in omitted),
        "core_not_conveyed": sorted(c["id"] for c in claims if c.get("importance") == "core" and c["id"] not in conveyed and c["id"] not in omitted),
        "sections_without_claims": [s for s in section_ids if not any(c.get("section_id") == s for c in claims)],
    }


def build_run(
    key: str,
    book_id: str,
    tpl: Template,
    now: datetime,
    *,
    status: str,
    total: int,
    accepted: list[int] | range = (),
    failed: dict[int, dict] | None = None,
    drawing: list[int] | range = (),
    artifacts: str = "both",  # "none" | "understanding" | "both"
    provider_stop: tuple[str, str | None, int | None] | None = None,  # (code, stage, page)
    error: str | None = None,
    age_minutes: float = 30,
    review_plan: bool = False,
    section_ids: list[str] | None = None,
) -> dict:
    """One edition with its artifacts, pages and job, as the documents the backend would hold."""
    failed = failed or {}
    accepted = list(accepted)
    drawing = list(drawing)
    edition_id = oid(f"edition:{key}")
    job_id = oid(f"job:generate:{key}")
    created = now - timedelta(minutes=age_minutes)
    off = tpl.offsets
    plan_pages = tpl.plan["content"]["pages"][:total] if total else []
    plan = {**tpl.plan["content"], "pages": plan_pages}

    # artifacts
    art_docs = []
    if artifacts in ("understanding", "both"):
        u = tpl.understanding
        art_docs.append({"_id": oid(f"artifact:{key}:understanding"), "edition_id": edition_id, "kind": "understanding", "schema_id": u["schema_id"], "content": u["content"], "content_hash": u["content_hash"], "receipt": u["receipt"], "created_at": created + timedelta(seconds=min(60, off["first_page"] / 3))})
    if artifacts == "both":
        art_docs.append({"_id": oid(f"artifact:{key}:plan"), "edition_id": edition_id, "kind": "plan", "schema_id": tpl.plan["schema_id"], "content": plan, "content_hash": canonical_hash(plan), "receipt": tpl.plan["receipt"], "created_at": created + timedelta(seconds=min(120, off["first_page"] / 2))})

    # pages
    page_docs = []
    receipts = [a["receipt"] for a in art_docs]
    for planned in plan_pages:
        n = planned["page_number"]
        base = {
            "_id": oid(f"page:{key}:{n}"),
            "edition_id": edition_id,
            "page_number": n,
            "section_id": planned["section_id"],
            "beat": planned.get("beat", ""),
            "claims": planned.get("claims", []),
            "units": planned.get("units", []),
            "created_at": created,
            "updated_at": now - timedelta(minutes=max(0.0, age_minutes - 1 - n * 0.2)),
        }
        empty = {"spec": None, "svg": None, "svg_hash": None, "renderer_version": None, "panels": [], "texts": [], "warnings": [], "receipts": [], "error": None}
        if n in accepted:
            src = tpl.pages[n]
            doc = {**base, **empty, "status": "accepted", "attempts": src["attempts"]}
            doc.update({k: src[k] for k in ("spec", "svg", "svg_hash", "renderer_version", "panels", "texts", "warnings", "receipts")})
            receipts.extend(src["receipts"])
        elif n in failed:
            doc = {**base, **empty, "status": "failed", "attempts": 2, "error": failed[n]}
        elif n in drawing:
            doc = {**base, **empty, "status": "drawing", "attempts": 1}
        else:
            doc = {**base, **empty, "status": "pending", "attempts": 0}
        page_docs.append(doc)

    done = len(accepted)
    n_failed = len(failed)
    terminal = status in ("complete", "completed_with_failures", "failed", "cancelled")
    attempted = done + n_failed
    scale = min(1.0, attempted / max(1, tpl.page_count))
    elapsed = off["first_page"] + (off["finish"] - off["first_page"]) * scale if attempted else min(90.0, off["first_page"] / 2)
    timings: dict[str, datetime] = {}
    if status != "queued":
        if "generate_started" in off:
            timings["generate_started_at"] = created + timedelta(seconds=off["generate_started"])
        if page_docs and "drawing_started" in off and status not in ("understanding", "planning"):
            timings["drawing_started_at"] = created + timedelta(seconds=off["drawing_started"])
        if done:
            timings["first_page_at"] = created + timedelta(seconds=off["first_page"])
    finished_at = created + timedelta(seconds=elapsed) if terminal else None

    coverage: dict = {}
    if status in ("complete", "completed_with_failures"):
        coverage = coverage_of(tpl.understanding["content"], plan, page_docs, section_ids or [s["id"] for s in tpl.understanding["content"].get("sections", [])])

    stop_doc = None
    if provider_stop:
        code, stage, page = provider_stop
        kind, http, text = PROVIDER_STOPS[code]
        stop_doc = {"code": code, "type": kind, "http_status": http, "message": text, "at": (finished_at or now).isoformat(), "stage": stage or "page", "page": page}

    policy = {**tpl.policy}
    if review_plan:
        policy["review_plan"] = True

    edition = {
        "_id": edition_id,
        "book_id": book_id,
        "status": status,
        "job_id": job_id,
        "policy": policy,
        "understanding_id": next((a["_id"] for a in art_docs if a["kind"] == "understanding"), None),
        "plan_id": next((a["_id"] for a in art_docs if a["kind"] == "plan"), None),
        "page_total": len(plan_pages),
        "pages_accepted": done,
        "pages_failed": n_failed,
        "coverage": coverage,
        "totals": totals_of(receipts),
        "stage_failures": [],
        "error": error,
        "provider_stop": stop_doc,
        "timings": timings,
        "created_at": created,
        "updated_at": finished_at or now,
        "finished_at": finished_at,
    }

    # the job: finished, or "running" with a lease that never ends (the runner ignores it)
    job_status = {"complete": "succeeded", "completed_with_failures": "completed_with_failures", "failed": "failed", "cancelled": "cancelled"}.get(status)
    if status == "awaiting_plan_review":
        job_status = "succeeded"
    stage = {"queued": "queued", "understanding": "understanding", "planning": "planning", "awaiting_plan_review": "plan"}.get(status, "drawing")
    message = {
        "queued": "Waiting for the generator",
        "understanding": "Reading the book",
        "planning": "Planning the pages",
        "awaiting_plan_review": f"Plan ready to review: {len(plan_pages)} pages",
        "drawing": f"{done} of {len(plan_pages)} pages ready",
        "complete": f"{done} of {len(plan_pages)} pages accepted",
        "completed_with_failures": f"{done} of {len(plan_pages)} pages accepted; {n_failed} failed: pages {', '.join(str(n) for n in failed)}" if failed else f"{done} of {len(plan_pages)} pages accepted",
        "cancelled": "Cancelled",
        "failed": "Failed",
    }[status]
    if provider_stop:
        message = "Stopped: the model provider refused the request"
    job = {
        "_id": job_id,
        "kind": "generate",
        "book_id": book_id,
        "edition_id": edition_id,
        "status": job_status or "running",
        "stage": stage,
        "done": done,
        "total": len(plan_pages),
        "message": message,
        "error": error if status == "failed" else None,
        "cancel_requested": False,
        "lease_owner": None if job_status else LEASE_OWNER,
        "lease_expires_at": None if job_status else FAR_FUTURE,
        "attempts": 1,
        "events": [
            {"at": created, "stage": "queued", "message": "Waiting for the generator"},
            {"at": created + timedelta(seconds=1), "stage": stage, "message": message},
        ],
        "created_at": created,
        "started_at": created + timedelta(seconds=1),
        "finished_at": finished_at if job_status else None,
    }
    return {"edition": edition, "artifacts": art_docs, "pages": page_docs, "job": job}


# --------------------------------------------------------------------------- the books


def parse_job(book_id: str, status: str, message: str, now: datetime, minutes: float, error: str | None = None) -> dict:
    running = status == "running"
    return {
        "_id": oid(f"job:parse:{book_id}"),
        "kind": "parse",
        "book_id": book_id,
        "edition_id": None,
        "status": status,
        "stage": "parsing" if running else ("parsed" if status == "succeeded" else "failed"),
        "done": 0,
        "total": 0,
        "message": message,
        "error": error,
        "cancel_requested": False,
        "lease_owner": LEASE_OWNER if running else None,
        "lease_expires_at": FAR_FUTURE if running else None,
        "attempts": 1,
        "events": [{"at": now - timedelta(minutes=minutes), "stage": "parsing", "message": "Reading the PDF"}],
        "created_at": now - timedelta(minutes=minutes),
        "started_at": now - timedelta(minutes=minutes),
        "finished_at": None if running else now - timedelta(minutes=minutes),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--db", required=True, help='database name; must start with "v02_" or "fixture_"')
    parser.add_argument("--mongo-url", default=None, help="default: mongodb://127.0.0.1:$PANELSUMMARY_MONGO_PORT (local only)")
    parser.add_argument("--storage", default=os.environ.get("STORAGE_DIR") or str(REPO / "storage"), help="storage directory the API serves PDFs from")
    parser.add_argument("--web", default=None, help="web base URL for the table, for example http://127.0.0.1:3270 (never port 3000)")
    parser.add_argument("--exports", default=str(DEFAULT_EXPORTS), help='saved run exports, or "none" to use only the committed Andersen run')
    parser.add_argument("--verify-render", action="store_true", help="stop if today's renderer does not reproduce a saved export page byte for byte")
    parser.add_argument("--out", default=str(REPO / ".dev" / "fixtures"), help="directory for the state table (states.md, states.json)")
    parser.add_argument("--plan-review", choices=["auto", "yes", "no"], default="auto", help="seed the awaiting_plan_review book; auto = only if the backend knows that status")
    args = parser.parse_args()

    if not args.db.startswith(ALLOWED_PREFIXES):
        refuse(f'database name {args.db!r} does not start with "v02_" or "fixture_"')
    port = os.environ.get("PANELSUMMARY_MONGO_PORT", "27018")
    mongo_url = args.mongo_url or f"mongodb://127.0.0.1:{port}"
    host = urlparse(mongo_url).hostname
    if host not in ("127.0.0.1", "localhost") or "mongodb+srv" in mongo_url or "@" in mongo_url:
        refuse("the Mongo URL must be a local server without a password (never the Atlas URL)")
    if args.web and urlparse(args.web).port == 3000:
        refuse("port 3000 belongs to another program")

    # The backend reads these when its settings load.
    os.environ.update({"MONGODB_URL": mongo_url, "DB_NAME": args.db, "STORAGE_DIR": args.storage})
    sys.path.insert(0, str(BACKEND))
    import fitz  # noqa: F401  (fail early if the backend environment is wrong)
    from pymongo import MongoClient

    from app.documents import EditionStatus  # noqa: PLC0415
    from app.sources.pdf_source import parse_pdf  # noqa: PLC0415
    from typing import get_args

    knows_review = "awaiting_plan_review" in get_args(EditionStatus)
    with_review = args.plan_review == "yes" or (args.plan_review == "auto" and knows_review)
    if args.plan_review == "yes" and not knows_review:
        refuse("this backend does not know the status awaiting_plan_review (track S1 adds it)")

    storage = Path(args.storage)
    pdf_dir = storage / "pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    work = storage / "fixtures"
    work.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).replace(microsecond=0)

    # --- templates
    andersen = load_andersen()
    exports = None if args.exports == "none" else Path(args.exports)
    hp26 = hp60 = None
    if exports is not None:
        for key, rel in (("hp26", "uab-m3-local/export"), ("hp60", "gate2b-ci/live-run/export")):
            if not (exports / rel / "judge").is_dir():
                print(f"warning: {exports / rel} is missing, so {key} falls back", file=sys.stderr)
        if (exports / "uab-m3-local/export/judge").is_dir():
            hp26 = load_export("hp26", exports / "uab-m3-local/export", BOOKS / "happy-prince-two-tales.pdf", args.verify_render)
        if (exports / "gate2b-ci/live-run/export/judge").is_dir():
            hp60 = load_export("hp60", exports / "gate2b-ci/live-run/export", BOOKS / "happy-prince-and-other-tales.pdf", args.verify_render)
    wilde = hp26 or andersen  # the template for the Wilde two-tales books

    # --- PDFs and their parse (the real parser)
    blank = work / "scanned-no-text.pdf"
    make_blank_pdf(blank)
    long_pdf = work / "sample-long-book-150.pdf"
    make_long_pdf(long_pdf)
    parsed_cache: dict[str, Any] = {}

    def parsed(path: Path):
        if str(path) not in parsed_cache:
            parsed_cache[str(path)] = parse_pdf(path)
        return parsed_cache[str(path)]

    HP68 = BOOKS / "happy-prince-and-other-tales.pdf"
    HP26 = BOOKS / "happy-prince-two-tales.pdf"
    CD = BOOKS / "civil-disobedience.pdf"
    AND = SAMPLE_DIR / "andersen-four-tales.pdf"
    ANDERSEN_AUTHOR = "Hans Christian Andersen (Project Gutenberg eBook #1597)"

    # (key, title, author, pdf, kind, spec). kind: "failed_pdf" | "parsing" | "parsed" | "run"
    # run spec = dict(template, **build_run keyword arguments)
    S = lambda **kw: kw  # noqa: E731
    books: list[tuple[str, str, str, Path, str, dict]] = [
        ("01-pdf-not-readable", "scanned no text", "", blank, "failed_pdf", {}),
        ("02-reading-pdf", "civil disobedience", "", CD, "parsing", {}),
        ("03-not-drawn", "The Happy Prince and Other Tales", "Oscar Wilde", HP68, "parsed", {}),
        ("04-over-limit-150", "Sample: A Long Book (150 pages)", "Sample data, not a real book", long_pdf, "parsed", {}),
        ("05-queued", "On the Duty of Civil Disobedience", "Henry David Thoreau", CD, "run", S(tpl=andersen, status="queued", total=0, artifacts="none", age_minutes=0.5)),
        ("06-reading-book", "The Happy Prince and Other Tales (first two tales)", "Oscar Wilde", HP26, "run", S(tpl=wilde, status="understanding", total=0, artifacts="none", age_minutes=2)),
        ("07-planning", "The Happy Prince", "Oscar Wilde", HP26, "run", S(tpl=wilde, status="planning", total=0, artifacts="understanding", age_minutes=4)),
        ("08-drawing-6-of-16", "Andersen's Fairy Tales", ANDERSEN_AUTHOR, AND, "run", S(tpl=andersen, status="drawing", total=16, accepted=[1, 2, 3, 4, 6, 7], failed={5: NO_SUBMISSION}, drawing=[8, 9, 10], age_minutes=6)),
        ("09-complete-18", None, None, None, "sample", {}),
        ("10-failures-14-of-16", "The Nightingale and the Rose", "Oscar Wilde", HP26, "run", S(tpl=wilde, status="completed_with_failures", total=16, accepted=[n for n in range(1, 17) if n not in (6, 11)], failed={6: NO_SUBMISSION, 11: CUT_OFF}, age_minutes=40)),
        ("11-stopped-3-of-16", "The Happy Prince, Chapter by Chapter", "Oscar Wilde", HP26, "run", S(tpl=wilde, status="cancelled", total=16, accepted=[1, 2, 3], age_minutes=25)),
        ("12-stopped-before-drawing", "Civil Disobedience, Part Two", "Henry David Thoreau", CD, "run", S(tpl=andersen, status="cancelled", total=0, artifacts="none", age_minutes=15)),
        ("13-limit-5-of-16", "The Little Match Girl and Other Tales", ANDERSEN_AUTHOR, AND, "run", S(tpl=andersen, status="failed", total=16, accepted=[1, 2, 3, 4, 5], provider_stop=("PROVIDER_LIMIT", "page", 6), error="MiniMax refused the request: Token Plan usage limit reached. Nothing more was sent. Resume when the limit resets or after you add credits.", age_minutes=50)),
        ("14-limit-no-plan", "Resistance to Civil Government", "Henry David Thoreau", CD, "run", S(tpl=andersen, status="failed", total=0, artifacts="none", provider_stop=("PROVIDER_LIMIT", "understanding", None), error="MiniMax refused the request: Token Plan usage limit reached. Nothing more was sent. Resume when the limit resets or after you add credits.", age_minutes=12)),
        ("15-key-refused-4-of-16", "Fairy Tales of Oscar Wilde", "Oscar Wilde", HP26, "run", S(tpl=wilde, status="failed", total=16, accepted=[1, 2, 3, 4], provider_stop=("PROVIDER_AUTH", "page", 5), error="MiniMax did not accept the key or the plan: invalid api key. Nothing more was sent. Fix the key or the plan, then resume.", age_minutes=33)),
        ("16-not-answering-7-of-16", "The Emperor's New Clothes and Other Tales", ANDERSEN_AUTHOR, AND, "run", S(tpl=andersen, status="failed", total=16, accepted=[1, 2, 3, 4, 5, 6, 7], provider_stop=("PROVIDER_UNAVAILABLE", "page", 8), error="MiniMax was not available: Overloaded. Nothing more was sent. Resume when the service is back.", age_minutes=45)),
        ("17-failed-no-reason", "Andersen: Tales of Ice and Snow", ANDERSEN_AUTHOR, AND, "run", S(tpl=andersen, status="failed", total=16, accepted=[1, 2, 3], error=None, age_minutes=70)),
        ("18-failed-reading", "Walden and Civil Disobedience", "Henry David Thoreau", CD, "run", S(tpl=andersen, status="failed", total=0, artifacts="none", error="RuntimeError: BOOK_UNDERSTANDING finished without an accepted submission after 2 attempts", age_minutes=18)),
        ("19-failed-planning", "Stories from Andersen", ANDERSEN_AUTHOR, AND, "run", S(tpl=andersen, status="failed", total=0, artifacts="understanding", error="RuntimeError: ADAPTATION_PLAN finished without an accepted submission after 2 attempts", age_minutes=22)),
        ("20-failed-drawing-9-of-16", "The Happy Prince (second edition)", "Oscar Wilde", HP26, "run", S(tpl=wilde, status="failed", total=16, accepted=list(range(1, 10)), error="RuntimeError: the agent worker stopped answering while drawing page 10", age_minutes=55)),
        ("21-plan-review", "The Selfish Giant", "Oscar Wilde", HP26, "run", S(tpl=wilde, status="awaiting_plan_review", total=16, review_plan=True, age_minutes=3)),
        ("22-failures-16-of-16", "Selected Tales, Oscar Wilde", "Oscar Wilde", HP26, "run", S(tpl=wilde, status="completed_with_failures", total=16, accepted=range(1, 17), age_minutes=80)),
        ("23-pages-60-mixed", "The Happy Prince and Other Tales (60-page run)", "Oscar Wilde", HP68, "run", S(tpl=hp60, status="drawing", total=60, accepted=[n for n in range(1, 39) if n not in (9, 27)], failed={9: NO_SUBMISSION, 27: CUT_OFF}, drawing=range(39, 43), age_minutes=26)),
        ("24-drawing-0-of-16", "The Selfish Giant (just started)", "Oscar Wilde", HP26, "run", S(tpl=wilde, status="drawing", total=16, drawing=[1, 2, 3, 4], age_minutes=5)),
    ]
    if not with_review:
        books = [b for b in books if b[0] != "21-plan-review"]
        print("note: the backend does not know awaiting_plan_review yet, so book 21 is left out (--plan-review yes to force)", file=sys.stderr)
    if hp60 is None:
        books = [b for b in books if b[0] != "23-pages-60-mixed"]
        print("note: no export for the 60-page run, so book 23 is left out", file=sys.stderr)

    # --- write
    client = MongoClient(mongo_url, serverSelectionTimeoutMS=4000)
    db = client[args.db]
    for name in COLLECTIONS:
        db[name].drop()
    db.library_books.create_index("pdf_hash", unique=True)
    db.book_sources.create_index("book_id", unique=True)
    db.edition_pages.create_index([("edition_id", 1), ("page_number", 1)], unique=True)
    db.edition_artifacts.create_index([("edition_id", 1), ("kind", 1)], unique=True)

    table: list[dict] = []
    for index, (key, title, author, pdf, kind, spec) in enumerate(books):
        if kind == "sample":
            continue
        book_id = oid(f"book:{key}")
        file_hash = sha256(pdf.read_bytes())
        # A real hash only where the stored PDF is the real file (the 60-page run); the rest get a fixture hash.
        pdf_hash = file_hash if key == "23-pages-60-mixed" else sha256(f"fixture:{key}:{file_hash}")
        stored = pdf_dir / f"{pdf_hash}.pdf"
        stored.write_bytes(pdf.read_bytes())
        created = now - timedelta(minutes=index + 1)
        book = {
            "_id": book_id,
            "title": title,
            "author": author,
            "original_filename": pdf.name if kind != "parsing" else "civil disobedience.pdf",
            "pdf_hash": pdf_hash,
            "pdf_path": str(stored),
            "status": "uploaded",
            "error": None,
            "page_count": 0,
            "word_count": 0,
            "section_count": 0,
            "parser": "",
            "parse_job_id": None,
            "created_at": created,
            "updated_at": created,
        }
        jobs: list[dict] = []
        if kind == "failed_pdf":
            book.update(status="failed", error="The PDF has no extractable text.")
            jobs.append(parse_job(book_id, "failed", "The PDF has no extractable text.", now, index + 1, error="The PDF has no extractable text."))
        elif kind == "parsing":
            book.update(status="parsing")
            jobs.append(parse_job(book_id, "running", "Reading the PDF", now, 0.3))
        else:
            ps = parsed(pdf)
            data = ps.to_dict()
            db.book_sources.insert_one({"book_id": book_id, "parser": ps.parser, "content_hash": ps.content_hash, "title": title, "author": author, "page_count": ps.page_count, "word_count": ps.word_count, "sections": data["sections"], "units": data["units"], "created_at": created})
            book.update(status="parsed", page_count=ps.page_count, word_count=ps.word_count, section_count=len(ps.sections), parser=ps.parser)
            jobs.append(parse_job(book_id, "succeeded", f"Parsed {ps.page_count} pages into {len(ps.sections)} sections and {len(ps.units)} source units", now, index + 1))
        book["parse_job_id"] = jobs[0]["_id"]
        run = None
        if kind == "run":
            spec = dict(spec)
            tpl = spec.pop("tpl")
            run = build_run(key, book_id, tpl, now, section_ids=[s["id"] for s in data["sections"]] if kind == "run" else None, **spec)
            jobs.append(run["job"])
        db.library_books.insert_one(with_oid(book))
        db.generation_jobs.insert_many([with_oid(j) for j in jobs])
        if run:
            db.editions.insert_one(with_oid(run["edition"]))
            if run["artifacts"]:
                db.edition_artifacts.insert_many([with_oid(a) for a in run["artifacts"]])
            if run["pages"]:
                db.edition_pages.insert_many([with_oid(p) for p in run["pages"]])
        table.append({"key": key, "book_id": book_id, "edition_id": run["edition"]["_id"] if run else None, "title": title, "state": book["status"] if not run else run["edition"]["status"], "accepted": run["edition"]["pages_accepted"] if run else 0, "page_total": run["edition"]["page_total"] if run else 0, "stop": (run["edition"]["provider_stop"] or {}).get("code") if run else None, "slot": index})

    # --- the installed Andersen sample, through the real install code (09)
    asyncio.run(_install_sample_and_place(db, args.db, now, [i for i, b in enumerate(books) if b[4] == "sample"][0], table))

    # --- output
    table.sort(key=lambda row: row["key"])
    base = (args.web or "").rstrip("/")
    lines = ["| # | state | book | accepted/total | book URL | reader URL |", "|---|---|---|---|---|---|"]
    for row in table:
        reader = ""
        if row["edition_id"] and row["accepted"]:
            reader = f"{base}/books/{row['book_id']}/read?edition={row['edition_id']}&page=1"
        lines.append(f"| {row['key'].split('-')[0]} | {row['key'][3:]} ({row['state']}{', ' + row['stop'] if row['stop'] else ''}) | {row['title']} | {row['accepted']}/{row['page_total']} | {base}/books/{row['book_id']} | {reader} |")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "states.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out / "states.json").write_text(json.dumps(table, indent=2) + "\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"\n{len(table)} books in database {args.db}; table written to {out}/states.md and states.json")
    print(f"shelf: {base}/")


async def _install_sample_and_place(db, db_name: str, now: datetime, slot: int, table: list[dict]) -> None:
    from app import db as app_db
    from app.samples import install_sample
    from app.settings import get_settings

    get_settings.cache_clear()
    app_db._client = None
    client = await app_db.init_db()
    try:
        ids = await install_sample("andersen")
    finally:
        client.close()
        app_db._client = None
    created = now - timedelta(minutes=slot + 1)
    db.library_books.update_one({"_id": __import__("bson").ObjectId(ids["book_id"])}, {"$set": {"created_at": created, "updated_at": created}})
    table.append({"key": "09-complete-18", "book_id": ids["book_id"], "edition_id": ids["edition_id"], "title": "Four Tales by Hans Christian Andersen", "state": "complete", "accepted": 18, "page_total": 18, "stop": None, "slot": slot})


if __name__ == "__main__":
    main()
