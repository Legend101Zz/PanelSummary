#!/usr/bin/env python3
"""
job_monitor.py — Interactive TUI for monitoring running jobs.
==============================================================
Shows all current/recent jobs with live status, progress bars,
cost tracking, and the ability to cancel running jobs.

Features:
  • Live-refreshing dashboard (every 2s)
  • Arrow keys to navigate between jobs
  • Enter to expand job details
  • 'c' to cancel a running job
  • 'r' to refresh immediately
  • 'a' to toggle showing all jobs vs active only
  • 'q' to quit

Usage:
    python scripts/job_monitor.py
    python scripts/job_monitor.py --all        # show completed/failed too
    python scripts/job_monitor.py --watch      # auto-refresh mode
"""

import asyncio
import os
import signal
import sys
import time
from datetime import datetime, timedelta

# Add backend/ to sys.path so `app.*` imports work when running as a script
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))


# ── ANSI helpers ──────────────────────────────────────────────

def clear_screen():
    print("\033[2J\033[H", end="")


def move_cursor(row: int, col: int):
    print(f"\033[{row};{col}H", end="")


def red(s: str) -> str:
    return f"\033[91m{s}\033[0m"


def green(s: str) -> str:
    return f"\033[92m{s}\033[0m"


def yellow(s: str) -> str:
    return f"\033[93m{s}\033[0m"


def cyan(s: str) -> str:
    return f"\033[96m{s}\033[0m"


def dim(s: str) -> str:
    return f"\033[2m{s}\033[0m"


def bold(s: str) -> str:
    return f"\033[1m{s}\033[0m"


def bg_blue(s: str) -> str:
    return f"\033[44m\033[97m{s}\033[0m"


# ── Progress bar ──────────────────────────────────────────────

def progress_bar(pct: int, width: int = 30) -> str:
    filled = int(width * pct / 100)
    bar = "█" * filled + "░" * (width - filled)
    if pct >= 100:
        return green(f"[{bar}] {pct}%")
    elif pct > 0:
        return cyan(f"[{bar}] {pct}%")
    else:
        return dim(f"[{bar}] {pct}%")


# ── Status badge ──────────────────────────────────────────────

def status_badge(status: str) -> str:
    badges = {
        "pending": yellow("○ PENDING "),
        "progress": cyan("● RUNNING "),
        "success": green("✔ SUCCESS "),
        "failure": red("✘ FAILED  "),
    }
    return badges.get(status, dim(f"? {status:8s}"))


# ── Phase label ───────────────────────────────────────────────

def phase_label(phase: str | None) -> str:
    labels = {
        "credits": "💳 Credits check",
        "analysis": "🔍 Analyzing chapters",
        "planning": "📝 Planning panels",
        "generating": "🎨 Generating DSL",
        "assembling": "📦 Assembling manga",
        "images": "🖼️  Generating images",
        "complete": "✅ Complete",
    }
    return labels.get(phase or "", dim(phase or "unknown"))


# ── Time ago ──────────────────────────────────────────────────

def time_ago(dt: datetime) -> str:
    if not dt:
        return "?"
    delta = datetime.utcnow() - dt
    if delta < timedelta(seconds=60):
        return f"{int(delta.total_seconds())}s ago"
    if delta < timedelta(hours=1):
        return f"{int(delta.total_seconds() / 60)}m ago"
    if delta < timedelta(days=1):
        return f"{int(delta.total_seconds() / 3600)}h ago"
    return f"{delta.days}d ago"


# ── Fetch all jobs ────────────────────────────────────────────

async def fetch_jobs(show_all: bool = False):
    from app.scripts._db import Book, JobStatus, MangaProjectDoc, MangaSliceDoc

    if show_all:
        jobs = await JobStatus.find().sort("-updated_at").limit(50).to_list()
    else:
        jobs = await JobStatus.find(
            {"status": {"$in": ["pending", "progress"]}}
        ).sort("-updated_at").to_list()
        # Also show recent failures (last hour)
        recent_cutoff = datetime.utcnow() - timedelta(hours=1)
        recent_fails = await JobStatus.find(
            {"status": "failure", "updated_at": {"$gte": recent_cutoff}}
        ).sort("-updated_at").to_list()
        jobs.extend(recent_fails)

    # Enrich with book/summary info
    enriched = []
    for job in jobs:
        info = {
            "id": str(job.id),
            "celery_id": job.celery_task_id,
            "type": job.job_type,
            "status": job.status,
            "progress": job.progress,
            "message": job.message,
            "result_id": job.result_id,
            "error": job.error,
            "phase": job.phase,
            "panels_done": job.panels_done,
            "panels_total": job.panels_total,
            "cost_so_far": job.cost_so_far,
            "estimated_total_cost": job.estimated_total_cost,
            "created_at": job.created_at,
            "updated_at": job.updated_at,
            "book_title": None,
            "summary_style": None,
            "model": None,
        }

        # Try to resolve book title
        if job.result_id:
            if job.job_type == "parse_pdf":
                book = await Book.get(job.result_id)
                if book:
                    info["book_title"] = book.title
            elif job.job_type in ("manga_book_understanding", "manga_slice"):
                # v2 manga jobs: result_id is a MangaProjectDoc id (for the
                # understanding pass) or a MangaSliceDoc id (for slices). We
                # try project first, fall through to slice on miss.
                project = await MangaProjectDoc.get(job.result_id)
                if not project:
                    sl = await MangaSliceDoc.get(job.result_id)
                    if sl:
                        project = await MangaProjectDoc.get(sl.project_id)
                if project:
                    info["summary_style"] = project.style
                    book = await Book.get(project.book_id)
                    if book:
                        info["book_title"] = book.title

        enriched.append(info)

    return enriched


# ── Cancel a job ──────────────────────────────────────────────

async def cancel_job(job: dict) -> str:
    """Attempt to cancel/revoke a celery job."""
    from app.scripts._db import JobStatus

    celery_id = job["celery_id"]

    # Update job status in DB
    job_doc = await JobStatus.find_one(
        JobStatus.celery_task_id == celery_id
    )
    if not job_doc:
        return red("Job not found in DB")

    if job_doc.status in ("success", "failure"):
        return yellow("Job already finished — nothing to cancel")

    # Try to revoke via Celery
    try:
        from app.celery_worker import celery_app
        celery_app.control.revoke(celery_id, terminate=True, signal="SIGTERM")
    except Exception as e:
        # Celery might not be reachable, still mark as failed in DB
        pass

    # Mark as failed in DB
    job_doc.status = "failure"
    job_doc.error = "Cancelled by user via job_monitor.py"
    job_doc.message = "Cancelled"
    job_doc.updated_at = datetime.utcnow()
    await job_doc.save()

    return green("Job cancelled")


# ── Render dashboard ──────────────────────────────────────────

def render_dashboard(
    jobs: list[dict],
    selected: int,
    expanded: bool,
    show_all: bool,
    last_action: str = "",
):
    clear_screen()
    lines = []

    # Header
    mode = "ALL JOBS" if show_all else "ACTIVE JOBS"
    lines.append(f"  {bold(cyan('═' * 50))}")
    lines.append(f"  {bold('📊 PanelSummary Job Monitor')}  {dim(f'[{mode}]')}")
    lines.append(f"  {bold(cyan('═' * 50))}")
    lines.append("")

    if not jobs:
        lines.append(f"  {dim('No jobs found.')}") 
        lines.append(f"  {dim('Press [a] to toggle showing all jobs.')}")
        lines.append("")
    else:
        # Job list
        for i, job in enumerate(jobs):
            prefix = bg_blue(" ▶ ") if i == selected else "   "
            badge = status_badge(job["status"])
            title = job["book_title"] or dim("untitled")
            jtype = dim(f"[{job['type']}]")
            age = dim(time_ago(job["updated_at"]))

            line = f"  {prefix} {badge}  {title:30s} {jtype} {age}"
            lines.append(line)

            # Progress bar for active jobs
            if job["status"] in ("progress", "pending"):
                pbar = progress_bar(job["progress"])
                phase = phase_label(job["phase"])
                lines.append(f"        {pbar}  {phase}")
                if job["panels_total"] > 0:
                    panels_str = dim(
                        f"Panels: {job['panels_done']}/{job['panels_total']}"
                    )
                    cost_str = dim(f"Cost: ${job['cost_so_far']:.3f}")
                    lines.append(f"        {panels_str}  {cost_str}")
            lines.append("")

        # Expanded detail view
        if expanded and 0 <= selected < len(jobs):
            job = jobs[selected]
            lines.append(f"  {cyan('─' * 50)}")
            lines.append(f"  {bold('Job Detail')}")
            lines.append(f"  {cyan('─' * 50)}")
            lines.append(f"    Celery ID:  {dim(job['celery_id'])}")
            lines.append(f"    Type:       {job['type']}")
            lines.append(f"    Status:     {status_badge(job['status'])}")
            lines.append(f"    Progress:   {job['progress']}%")
            lines.append(f"    Phase:      {phase_label(job['phase'])}")
            lines.append(f"    Message:    {job['message'][:80]}")

            if job["model"]:
                lines.append(f"    Model:      {job['model']}")
            if job["summary_style"]:
                lines.append(f"    Style:      {job['summary_style']}")
            if job["result_id"]:
                lines.append(f"    Result ID:  {dim(job['result_id'])}")

            lines.append(f"    Panels:     {job['panels_done']} / {job['panels_total']}")
            lines.append(f"    Cost:       ${job['cost_so_far']:.4f}")
            if job["estimated_total_cost"]:
                lines.append(f"    Est. Total: ${job['estimated_total_cost']:.4f}")

            lines.append(f"    Created:    {job['created_at']}")
            lines.append(f"    Updated:    {job['updated_at']}  ({time_ago(job['updated_at'])})")

            if job["error"]:
                lines.append(f"    {red('Error')}:      {job['error'][:120]}")
                # Show full error if it's long
                if len(job["error"]) > 120:
                    for chunk_start in range(120, len(job["error"]), 100):
                        lines.append(
                            f"                {red(job['error'][chunk_start:chunk_start+100])}"
                        )
            lines.append("")

    # Action feedback
    if last_action:
        lines.append(f"  {last_action}")
        lines.append("")

    # Footer
    lines.append(f"  {dim('─' * 50)}")
    lines.append(
        f"  {dim('[↑↓] navigate  [Enter] expand  [c] cancel  '
        f'[r] refresh  [a] toggle all  [q] quit')}"
    )

    print("\n".join(lines))


# ── Non-blocking key reader ───────────────────────────────────

def setup_terminal():
    """Put terminal in raw mode for single-keypress reading."""
    import termios
    import tty
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    tty.setcbreak(fd)
    return old_settings


def restore_terminal(old_settings):
    import termios
    fd = sys.stdin.fileno()
    termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)


def read_key(timeout: float = 0.1) -> str | None:
    """Read a single keypress with timeout. Returns None if no key."""
    import select
    fd = sys.stdin.fileno()
    rlist, _, _ = select.select([fd], [], [], timeout)
    if not rlist:
        return None
    ch = os.read(fd, 3).decode("utf-8", errors="ignore")
    # Arrow key sequences
    if ch == "\x1b[A":
        return "UP"
    if ch == "\x1b[B":
        return "DOWN"
    if ch == "\r" or ch == "\n":
        return "ENTER"
    return ch


# ── Main loop ─────────────────────────────────────────────────

async def run_monitor(show_all_initial: bool = False, watch: bool = False):
    from app.scripts._db import connect
    await connect()

    selected = 0
    expanded = False
    show_all = show_all_initial
    last_action = ""
    last_refresh = 0.0
    refresh_interval = 3.0 if watch else 999999.0  # manual refresh by default

    old_settings = setup_terminal()
    try:
        # Initial fetch
        jobs = await fetch_jobs(show_all)
        render_dashboard(jobs, selected, expanded, show_all, last_action)

        while True:
            key = read_key(timeout=0.2)

            # Auto-refresh
            now = time.time()
            if now - last_refresh > refresh_interval:
                jobs = await fetch_jobs(show_all)
                last_refresh = now
                last_action = dim(f"Auto-refreshed at {datetime.now().strftime('%H:%M:%S')}")
                render_dashboard(jobs, selected, expanded, show_all, last_action)

            if key is None:
                continue

            if key in ("q", "Q", "\x03"):  # q or Ctrl+C
                break

            elif key == "UP":
                selected = max(0, selected - 1)
                expanded = False

            elif key == "DOWN":
                selected = min(len(jobs) - 1, selected + 1) if jobs else 0
                expanded = False

            elif key == "ENTER":
                expanded = not expanded

            elif key in ("r", "R"):
                jobs = await fetch_jobs(show_all)
                last_refresh = now
                last_action = green("Refreshed")

            elif key in ("a", "A"):
                show_all = not show_all
                jobs = await fetch_jobs(show_all)
                selected = 0
                expanded = False
                last_action = f"Showing {'all' if show_all else 'active'} jobs"

            elif key in ("w", "W"):
                if refresh_interval > 10:
                    refresh_interval = 3.0
                    last_action = green("Watch mode ON (3s refresh)")
                else:
                    refresh_interval = 999999.0
                    last_action = yellow("Watch mode OFF")

            elif key in ("c", "C"):
                if jobs and 0 <= selected < len(jobs):
                    job = jobs[selected]
                    if job["status"] in ("pending", "progress"):
                        result = await cancel_job(job)
                        last_action = result
                        jobs = await fetch_jobs(show_all)
                    else:
                        last_action = yellow(
                            "Can only cancel pending/running jobs"
                        )

            render_dashboard(jobs, selected, expanded, show_all, last_action)

    finally:
        restore_terminal(old_settings)
        clear_screen()
        print(dim("  Job monitor closed.\n"))


def main():
    if "--help" in sys.argv or "-h" in sys.argv:
        print(__doc__)
        sys.exit(0)

    show_all = "--all" in sys.argv
    watch = "--watch" in sys.argv

    # Graceful Ctrl+C
    signal.signal(signal.SIGINT, lambda *_: sys.exit(0))

    asyncio.run(run_monitor(show_all_initial=show_all, watch=watch))


if __name__ == "__main__":
    main()
