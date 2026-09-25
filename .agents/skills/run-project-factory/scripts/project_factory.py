#!/usr/bin/env python3
"""Project-local state and read-only HTML views for run-project-factory."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import sys
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    import fcntl
except ImportError:  # pragma: no cover - Windows fallback
    fcntl = None


SCHEMA_VERSION = 1
STAGES = ("understand", "decide", "execute", "prove", "activate")
EVENT_TYPES = (
    "observation",
    "assumption",
    "decision",
    "work",
    "evidence",
    "falsification",
    "gate",
    "risk",
    "invalidation",
    "system",
)
STATUSES = (
    "proposed",
    "active",
    "verified",
    "invalidated",
    "superseded",
    "blocked",
    "complete",
    "inconclusive",
    "skipped",
    "failed",
)
CONFIDENCE = ("low", "medium", "high", "unknown")
ACTORS = ("human", "agent", "verifier", "system")

REQUIRED_PROGRAM_SECTIONS = (
    "User Outcome",
    "Non-goals",
    "Current Authority and Desired Authority",
    "Options and Chosen Direction",
    "System Architecture",
    "Program Design",
    "Uncertainty Analysis",
    "Route Decisions",
    "Proof Obligations",
    "Bounded Slices",
    "Activation, Rollback, and Legacy Retirement",
    "Human Gates",
    "Open Questions",
    "Evidence Index",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not slug:
        raise ValueError("A slug must contain at least one letter or number.")
    return slug[:64]


def paths(root: Path) -> dict[str, Path]:
    state = root / ".project-factory"
    brain = state / "brain"
    return {
        "root": root,
        "state": state,
        "brain": brain,
        "programs": brain / "programs",
        "memory": state / "memory",
        "events": state / "memory" / "events.jsonl",
        "current": state / "memory" / "current.json",
        "evidence": state / "evidence",
        "views": state / "views",
        "view_assets": state / "views" / "assets",
        "exploration": state / "views" / "exploration",
        "now": brain / "NOW.md",
        "journeys": brain / "JOURNEYS.md",
        "decisions": brain / "DECISIONS.md",
    }


def skill_root() -> Path:
    return Path(__file__).resolve().parent.parent


def atomic_write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.tmp-{os.getpid()}-{uuid.uuid4().hex[:8]}")
    with temp.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(value)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp, path)


def create_from_template(path: Path, template_name: str, replacements: dict[str, str]) -> bool:
    if path.exists():
        return False
    template = (skill_root() / "assets" / template_name).read_text(encoding="utf-8")
    for key, value in replacements.items():
        template = template.replace("{{" + key + "}}", value)
    atomic_write_text(path, template)
    return True


def ensure_state(root: Path) -> dict[str, Path]:
    p = paths(root)
    if not p["state"].is_dir():
        raise FileNotFoundError(
            f"{p['state']} does not exist. Run the init command before using this project."
        )
    return p


def append_jsonl(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n"
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            handle.write(line)
            handle.flush()
            os.fsync(handle.fileno())
        finally:
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def make_event(
    *,
    stage: str,
    event_type: str,
    status: str,
    summary: str,
    subject_id: str = "",
    program: str = "",
    sources: Iterable[str] = (),
    evidence: Iterable[str] = (),
    confidence: str = "unknown",
    repo_sha: str = "",
    config_identity: str = "",
    actor: str = "agent",
    reason: str = "",
    supersedes: str = "",
) -> dict[str, Any]:
    event_id = f"evt-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    return {
        "schema_version": SCHEMA_VERSION,
        "id": event_id,
        "timestamp": utc_now(),
        "stage": stage,
        "type": event_type,
        "status": status,
        "summary": summary.strip(),
        "subject_id": subject_id.strip(),
        "program": program.strip(),
        "sources": [item for item in sources if item],
        "evidence": [item for item in evidence if item],
        "confidence": confidence,
        "repo_sha": repo_sha.strip(),
        "config_identity": config_identity.strip(),
        "actor": actor,
        "reason": reason.strip(),
        "supersedes": supersedes.strip(),
    }


def load_events(event_path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    events: list[dict[str, Any]] = []
    errors: list[str] = []
    if not event_path.exists():
        return events, errors
    for line_number, raw in enumerate(event_path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw.strip():
            continue
        try:
            value = json.loads(raw)
        except json.JSONDecodeError as exc:
            errors.append(f"events.jsonl:{line_number}: invalid JSON: {exc.msg}")
            continue
        if not isinstance(value, dict):
            errors.append(f"events.jsonl:{line_number}: event must be an object")
            continue
        events.append(value)
    return events, errors


def latest_subject_events(events: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for event in events:
        subject = str(event.get("subject_id") or "").strip()
        if subject:
            latest[subject] = event
    return latest


def tracked_assumption_events(events: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    tracked = {
        str(event.get("subject_id") or "").strip()
        for event in events
        if event.get("type") in {"assumption", "risk", "invalidation"}
        and str(event.get("subject_id") or "").strip()
    }
    latest = latest_subject_events(events)
    return {subject: latest[subject] for subject in tracked if subject in latest}


def parse_project_name(now_path: Path, fallback: str) -> str:
    if now_path.exists():
        first = now_path.read_text(encoding="utf-8").splitlines()[:1]
        if first:
            match = re.match(r"#\s+(.+?):\s+Current Reality\s*$", first[0])
            if match:
                return match.group(1).strip()
    return fallback


def program_status(text: str) -> str:
    match = re.search(r"^- Status:\s*(.+?)\s*$", text, flags=re.MULTILINE | re.IGNORECASE)
    return match.group(1).strip().lower() if match else "unknown"


def active_program(program_dir: Path) -> Path | None:
    if not program_dir.exists():
        return None
    candidates: list[Path] = []
    fallback: list[Path] = []
    for candidate in program_dir.glob("*/PROGRAM.md"):
        fallback.append(candidate)
        status = program_status(candidate.read_text(encoding="utf-8"))
        if status not in {"complete", "completed", "cancelled", "retired", "rejected"}:
            candidates.append(candidate)
    selected = candidates or fallback
    return max(selected, key=lambda item: item.stat().st_mtime) if selected else None


def extract_heading_value(markdown: str, heading: str) -> str:
    pattern = re.compile(
        rf"^##\s+{re.escape(heading)}\s*$\n(?P<body>.*?)(?=^##\s+|\Z)",
        flags=re.MULTILINE | re.DOTALL | re.IGNORECASE,
    )
    match = pattern.search(markdown)
    if not match:
        return ""
    body = match.group("body").strip()
    for line in body.splitlines():
        clean = re.sub(r"^[>*\-\s]+", "", line).strip()
        if clean and not clean.startswith("|") and not clean.startswith("```"):
            return clean
    return ""


def select_sections(markdown: str, title: str, wanted: set[str]) -> str:
    lines = markdown.splitlines()
    selected: list[str] = [f"# {title}", ""]
    current: list[str] = []
    keep = False

    def flush() -> None:
        nonlocal current
        if keep and current:
            selected.extend(current)
            selected.append("")
        current = []

    for line in lines:
        if line.startswith("## "):
            flush()
            label = line[3:].strip().lower()
            keep = label in wanted
            current = [line]
        elif current:
            current.append(line)
    flush()
    if len(selected) <= 2:
        return markdown
    return "\n".join(selected).strip() + "\n"


def safe_href(raw: str) -> str:
    value = html.unescape(raw).strip()
    if value.startswith(("http://", "https://", "#", "./", "../")):
        return html.escape(value, quote=True)
    if re.match(r"^[A-Za-z0-9_./-]+(?:\.html|\.md)?(?:#[A-Za-z0-9_-]+)?$", value):
        return html.escape(value, quote=True)
    return "#"


def inline_markdown(value: str) -> str:
    escaped = html.escape(value, quote=False)
    escaped = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda match: f'<a href="{safe_href(match.group(2))}">{match.group(1)}</a>',
        escaped,
    )
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", escaped)
    return escaped


def table_cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def markdown_to_html(markdown: str) -> str:
    lines = markdown.splitlines()
    output: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped:
            index += 1
            continue

        if stripped.startswith("```"):
            language = stripped[3:].strip().lower()
            index += 1
            code: list[str] = []
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code.append(lines[index])
                index += 1
            index += 1
            escaped = html.escape("\n".join(code))
            if language == "mermaid":
                output.append(f'<pre class="mermaid">{escaped}</pre>')
            else:
                class_name = f' class="language-{html.escape(language)}"' if language else ""
                output.append(f"<pre><code{class_name}>{escaped}</code></pre>")
            continue

        heading = re.match(r"^(#{1,4})\s+(.+)$", stripped)
        if heading:
            level = len(heading.group(1))
            label = heading.group(2).strip()
            try:
                anchor = slugify(re.sub(r"[`*]", "", label))
            except ValueError:
                anchor = f"section-{index + 1}"
            output.append(f'<h{level} id="{anchor}">{inline_markdown(label)}</h{level}>')
            index += 1
            continue

        if (
            stripped.startswith("|")
            and index + 1 < len(lines)
            and re.match(r"^\s*\|?\s*:?-{3,}", lines[index + 1])
        ):
            headers = table_cells(line)
            index += 2
            rows: list[list[str]] = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                rows.append(table_cells(lines[index]))
                index += 1
            table = ['<div class="table-wrap"><table><thead><tr>']
            table.extend(f"<th>{inline_markdown(cell)}</th>" for cell in headers)
            table.append("</tr></thead><tbody>")
            for row in rows:
                table.append("<tr>")
                padded = row + [""] * max(0, len(headers) - len(row))
                table.extend(f"<td>{inline_markdown(cell)}</td>" for cell in padded[: len(headers)])
                table.append("</tr>")
            table.append("</tbody></table></div>")
            output.append("".join(table))
            continue

        unordered = re.match(r"^[-*]\s+(.+)$", stripped)
        ordered = re.match(r"^\d+[.)]\s+(.+)$", stripped)
        if unordered or ordered:
            tag = "ul" if unordered else "ol"
            items: list[str] = []
            while index < len(lines):
                current = lines[index].strip()
                match = re.match(r"^[-*]\s+(.+)$", current) if tag == "ul" else re.match(r"^\d+[.)]\s+(.+)$", current)
                if not match:
                    break
                items.append(match.group(1))
                index += 1
            output.append(f"<{tag}>" + "".join(f"<li>{inline_markdown(item)}</li>" for item in items) + f"</{tag}>")
            continue

        if stripped.startswith(">"):
            quotes: list[str] = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                quotes.append(lines[index].strip().lstrip(">").strip())
                index += 1
            output.append(f"<blockquote>{inline_markdown(' '.join(quotes))}</blockquote>")
            continue

        if re.match(r"^[-*_]{3,}$", stripped):
            output.append("<hr>")
            index += 1
            continue

        paragraph = [stripped]
        index += 1
        while index < len(lines):
            next_line = lines[index].strip()
            if not next_line:
                break
            if (
                next_line.startswith(("#", "```", ">", "|"))
                or re.match(r"^[-*]\s+", next_line)
                or re.match(r"^\d+[.)]\s+", next_line)
            ):
                break
            paragraph.append(next_line)
            index += 1
        output.append(f"<p>{inline_markdown(' '.join(paragraph))}</p>")
    return "\n".join(output)


def navigation(current: str) -> str:
    items = (
        ("index", "index.html", "Control room"),
        ("architecture", "architecture.html", "Architecture"),
        ("program", "program-design.html", "Program design"),
        ("assumptions", "assumptions.html", "Assumptions"),
        ("proof", "proof.html", "Proof"),
    )
    links = []
    for key, href, label in items:
        marker = ' aria-current="page"' if key == current else ""
        links.append(f'<a href="{href}"{marker}>{label}</a>')
    return "".join(links)


def page_document(*, project: str, page_title: str, current: str, body: str, generated: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>{html.escape(page_title)} | {html.escape(project)}</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="assets/control-room.css">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js" defer></script>
  <script src="assets/control-room.js" defer></script>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand"><strong>{html.escape(project)}</strong><span>PROJECT FACTORY</span></div>
      <nav aria-label="Project factory views">{navigation(current)}</nav>
    </header>
    <div class="offline-note" role="status">Mermaid could not load. Diagram source remains visible.</div>
    {body}
    <footer class="footer">Generated {html.escape(generated)} from canonical Markdown and append-only events. This HTML is read-only.</footer>
  </div>
</body>
</html>
"""


def event_card(event: dict[str, Any]) -> str:
    status = html.escape(str(event.get("status", "unknown")))
    kind = html.escape(str(event.get("type", "event")))
    summary = inline_markdown(str(event.get("summary", "")))
    timestamp = html.escape(str(event.get("timestamp", "unknown")))
    program = str(event.get("program") or "")
    confidence = str(event.get("confidence") or "unknown")
    meta = " | ".join(part for part in (timestamp, program, f"confidence:{confidence}") if part)
    sources = event.get("sources") or []
    source_html = ""
    if sources:
        source_html = f"<small>source: {inline_markdown(str(sources[0]))}</small>"
    return (
        '<article class="card">'
        f'<div class="card-top"><span class="badge {status}">{status}</span><span class="badge">{kind}</span></div>'
        f"<p>{summary}</p><small>{html.escape(meta)}</small>{source_html}</article>"
    )


def render_home(project: str, events: list[dict[str, Any]], now_text: str, program: Path | None, generated: str) -> str:
    by_stage: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        stage = str(event.get("stage") or "understand")
        if stage in STAGES:
            by_stage[stage].append(event)

    latest_subjects = tracked_assumption_events(events)
    open_assumptions = sum(
        1
        for event in latest_subjects.values()
        if event.get("status") not in {"verified", "invalidated", "superseded", "complete"}
    )
    proof_events = sum(1 for event in events if event.get("type") in {"evidence", "falsification"})
    gate_events = [event for event in events if event.get("type") == "gate"]
    pending_gate = next(
        (event for event in reversed(gate_events) if event.get("status") in {"proposed", "blocked", "inconclusive"}),
        None,
    )
    decision = (
        str(pending_gate.get("summary"))
        if pending_gate
        else extract_heading_value(now_text, "Next Human Decision") or "No human decision has been recorded."
    )
    active_label = program.parent.name if program else "none"

    hero = f"""
    <section class="hero">
      <div>
        <h1>Understand what is true. Prove what changed.</h1>
        <p>One project brain for current reality, approved intent, bounded work, and evidence. Activities run only when their question is still material.</p>
      </div>
      <aside class="decision"><strong>Next human decision</strong>{inline_markdown(decision)}</aside>
    </section>
    <section class="stats" aria-label="Project summary">
      <div class="stat"><b>{len(events)}</b><span>recorded events</span></div>
      <div class="stat"><b>{open_assumptions}</b><span>open assumptions or risks</span></div>
      <div class="stat"><b>{proof_events}</b><span>evidence or falsification events</span></div>
      <div class="stat"><b>{html.escape(active_label)}</b><span>active program</span></div>
    </section>
    """

    columns: list[str] = []
    for stage in STAGES:
        stage_events = list(reversed(by_stage.get(stage, [])))[:10]
        cards = "".join(event_card(event) for event in stage_events)
        if not cards:
            cards = '<div class="empty">No recorded state.</div>'
        columns.append(
            f'<section class="column"><div class="column-head"><h2>{stage.upper()}</h2>'
            f'<span class="count">{len(by_stage.get(stage, []))}</span></div>{cards}</section>'
        )
    body = hero + f'<main class="board" aria-label="Project work by stage">{"".join(columns)}</main>'
    return page_document(
        project=project,
        page_title="Control room",
        current="index",
        body=body,
        generated=generated,
    )


def render_markdown_page(project: str, title: str, current: str, markdown: str, generated: str) -> str:
    body = f'<main class="content">{markdown_to_html(markdown)}</main>'
    return page_document(
        project=project,
        page_title=title,
        current=current,
        body=body,
        generated=generated,
    )


def render_assumptions(project: str, events: list[dict[str, Any]], generated: str) -> str:
    latest = tracked_assumption_events(events)
    selected = list(latest.values())
    selected.sort(key=lambda event: str(event.get("timestamp", "")), reverse=True)
    if selected:
        rows = []
        for event in selected:
            subject = html.escape(str(event.get("subject_id") or event.get("id") or "unknown"))
            summary = inline_markdown(str(event.get("summary") or ""))
            status = html.escape(str(event.get("status") or "unknown"))
            confidence = html.escape(str(event.get("confidence") or "unknown"))
            source = (event.get("sources") or ["no source recorded"])[0]
            rows.append(
                '<article class="assumption">'
                f'<div><span class="badge {status}">{status}</span><small class="mono">{subject}</small></div>'
                f'<div><p>{summary}</p><small class="mono">source: {inline_markdown(str(source))}</small></div>'
                f'<div class="mono">confidence: {confidence}</div></article>'
            )
        content = "".join(rows)
    else:
        content = '<div class="empty">No assumptions or risks have been recorded.</div>'
    body = (
        '<main class="content"><h1>Assumptions and risks</h1>'
        '<p>The latest event for each stable subject is shown. Prior states remain in events.jsonl.</p>'
        f'<section class="assumption-list">{content}</section></main>'
    )
    return page_document(
        project=project,
        page_title="Assumptions",
        current="assumptions",
        body=body,
        generated=generated,
    )


def render_proof(project: str, events: list[dict[str, Any]], program_markdown: str, generated: str) -> str:
    proof_events = [
        event
        for event in events
        if event.get("stage") in {"prove", "activate"}
        or event.get("type") in {"evidence", "falsification"}
    ]
    event_section = "".join(event_card(event) for event in reversed(proof_events))
    if not event_section:
        event_section = '<div class="empty">No proof or activation evidence has been recorded.</div>'
    proof_markdown = select_sections(
        program_markdown,
        "Proof and activation contract",
        {
            "proof obligations",
            "activation, rollback, and legacy retirement",
            "human gates",
            "evidence index",
        },
    )
    body = (
        '<main class="content"><h1>Proof and activation</h1>'
        '<p>Evidence is scoped to its recorded SHA, configuration, environment, and journey.</p>'
        f'<section>{event_section}</section>{markdown_to_html(proof_markdown)}</main>'
    )
    return page_document(
        project=project,
        page_title="Proof",
        current="proof",
        body=body,
        generated=generated,
    )


def write_projection(p: dict[str, Path], project: str, events: list[dict[str, Any]], program: Path | None, generated: str) -> None:
    latest = tracked_assumption_events(events)
    projection = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated,
        "project": project,
        "active_program": program.parent.name if program else None,
        "event_count": len(events),
        "stage_counts": dict(Counter(str(event.get("stage") or "unknown") for event in events)),
        "status_counts": dict(Counter(str(event.get("status") or "unknown") for event in events)),
        "latest_subjects": latest,
        "last_event": events[-1] if events else None,
    }
    atomic_write_text(p["current"], json.dumps(projection, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def render(root: Path) -> list[Path]:
    p = ensure_state(root)
    events, errors = load_events(p["events"])
    if errors:
        raise ValueError("Cannot render invalid event log:\n" + "\n".join(errors))

    generated = utc_now()
    project = parse_project_name(p["now"], root.name)
    now_text = p["now"].read_text(encoding="utf-8") if p["now"].exists() else "# Current Reality\n\nUnknown.\n"
    program = active_program(p["programs"])
    program_text = (
        program.read_text(encoding="utf-8")
        if program
        else "# No active program\n\nCreate a program after the human chooses a direction.\n"
    )

    p["views"].mkdir(parents=True, exist_ok=True)
    p["view_assets"].mkdir(parents=True, exist_ok=True)
    p["exploration"].mkdir(parents=True, exist_ok=True)
    shutil.copy2(skill_root() / "assets" / "control-room.css", p["view_assets"] / "control-room.css")
    shutil.copy2(skill_root() / "assets" / "control-room.js", p["view_assets"] / "control-room.js")

    architecture_md = select_sections(
        program_text,
        "System architecture",
        {
            "current authority and desired authority",
            "options and chosen direction",
            "system architecture",
            "open questions",
        },
    )
    program_md = select_sections(
        program_text,
        "Program design",
        {
            "user outcome",
            "non-goals",
            "program design",
            "uncertainty analysis",
            "route decisions",
            "bounded slices",
            "human gates",
            "open questions",
        },
    )

    documents = {
        p["views"] / "index.html": render_home(project, events, now_text, program, generated),
        p["views"] / "architecture.html": render_markdown_page(
            project, "Architecture", "architecture", architecture_md, generated
        ),
        p["views"] / "program-design.html": render_markdown_page(
            project, "Program design", "program", program_md, generated
        ),
        p["views"] / "assumptions.html": render_assumptions(project, events, generated),
        p["views"] / "proof.html": render_proof(project, events, program_text, generated),
    }
    for path, document in documents.items():
        atomic_write_text(path, document)
    write_projection(p, project, events, program, generated)
    return list(documents)


def init_project(args: argparse.Namespace) -> int:
    root = Path(args.root).expanduser().resolve()
    p = paths(root)
    project = args.project_name or root.name
    timestamp = utc_now()
    for directory in (p["programs"], p["memory"], p["evidence"], p["views"], p["exploration"]):
        directory.mkdir(parents=True, exist_ok=True)

    replacements = {"PROJECT_NAME": project, "TIMESTAMP": timestamp}
    created = [
        path
        for path, template in (
            (p["now"], "now-template.md"),
            (p["journeys"], "journeys-template.md"),
            (p["decisions"], "decisions-template.md"),
        )
        if create_from_template(path, template, replacements)
    ]

    if not p["events"].exists() or not p["events"].read_text(encoding="utf-8").strip():
        append_jsonl(
            p["events"],
            make_event(
                stage="understand",
                event_type="system",
                status="active",
                summary="Project Factory initialized; current reality has not yet been recovered.",
                subject_id="project-factory-state",
                confidence="high",
                actor="system",
            ),
        )
    rendered = render(root)
    print(f"Initialized: {p['state']}")
    print(f"Created canonical files: {len(created)}")
    print(f"Rendered views: {len(rendered)}")
    return 0


def add_event(args: argparse.Namespace) -> int:
    root = Path(args.root).expanduser().resolve()
    p = ensure_state(root)
    event = make_event(
        stage=args.stage,
        event_type=args.type,
        status=args.status,
        summary=args.summary,
        subject_id=args.subject_id or "",
        program=args.program or "",
        sources=args.source or [],
        evidence=args.evidence or [],
        confidence=args.confidence,
        repo_sha=args.repo_sha or "",
        config_identity=args.config_identity or "",
        actor=args.actor,
        reason=args.reason or "",
        supersedes=args.supersedes or "",
    )
    append_jsonl(p["events"], event)
    render(root)
    print(json.dumps(event, ensure_ascii=False, indent=2))
    return 0


def add_decision(args: argparse.Namespace) -> int:
    root = Path(args.root).expanduser().resolve()
    p = ensure_state(root)
    timestamp = utc_now()
    alternatives = args.alternative or ["None recorded."]
    evidence = args.evidence or ["None recorded."]
    lines = [
        "",
        f"### {timestamp}: {args.title}",
        "",
        f"- Status: {args.status}",
        f"- Choice: {args.choice}",
        f"- Why: {args.reason}",
        "- Alternatives rejected:",
        *[f"  - {item}" for item in alternatives],
        "- Evidence considered:",
        *[f"  - {item}" for item in evidence],
        f"- Assumptions accepted: {args.assumptions or 'None recorded.'}",
        f"- Revisit trigger: {args.revisit_trigger or 'Not defined.'}",
        f"- Supersedes: {args.supersedes or 'None.'}",
        "",
    ]
    with p["decisions"].open("a", encoding="utf-8", newline="\n") as handle:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            handle.write("\n".join(lines))
            handle.flush()
            os.fsync(handle.fileno())
        finally:
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    event = make_event(
        stage="decide",
        event_type="decision",
        status="complete" if args.status == "accepted" else "proposed",
        summary=f"{args.title}: {args.choice}",
        subject_id=args.subject_id or slugify(args.title),
        program=args.program or "",
        sources=evidence,
        confidence="high" if args.status == "accepted" else "medium",
        actor="human" if args.status == "accepted" else args.actor,
        reason=args.reason,
        supersedes=args.supersedes or "",
    )
    append_jsonl(p["events"], event)
    render(root)
    print(f"Appended decision: {args.title}")
    return 0


def new_program(args: argparse.Namespace) -> int:
    root = Path(args.root).expanduser().resolve()
    p = ensure_state(root)
    slug = slugify(args.slug)
    program_path = p["programs"] / slug / "PROGRAM.md"
    replacements = {
        "PROGRAM_TITLE": args.title,
        "PROGRAM_SLUG": slug,
        "ENTRY_MODE": args.entry_mode,
        "TIMESTAMP": utc_now(),
    }
    if not create_from_template(program_path, "program-template.md", replacements):
        print(f"Program already exists; preserved without overwrite: {program_path}", file=sys.stderr)
        return 2
    event = make_event(
        stage="decide",
        event_type="work",
        status="proposed",
        summary=f"Program created for human review: {args.title}",
        subject_id=f"program-{slug}",
        program=slug,
        sources=[str(program_path.relative_to(root))],
        confidence="high",
        actor="agent",
    )
    append_jsonl(p["events"], event)
    render(root)
    print(program_path)
    return 0


def validate_event(event: dict[str, Any], index: int) -> list[str]:
    errors: list[str] = []
    prefix = f"event {index}"
    required = ("schema_version", "id", "timestamp", "stage", "type", "status", "summary", "actor")
    for key in required:
        if key not in event or event[key] in (None, ""):
            errors.append(f"{prefix}: missing {key}")
    if event.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"{prefix}: unsupported schema_version {event.get('schema_version')}")
    if event.get("stage") not in STAGES:
        errors.append(f"{prefix}: invalid stage {event.get('stage')}")
    if event.get("type") not in EVENT_TYPES:
        errors.append(f"{prefix}: invalid type {event.get('type')}")
    if event.get("status") not in STATUSES:
        errors.append(f"{prefix}: invalid status {event.get('status')}")
    if event.get("confidence", "unknown") not in CONFIDENCE:
        errors.append(f"{prefix}: invalid confidence {event.get('confidence')}")
    if event.get("actor") not in ACTORS:
        errors.append(f"{prefix}: invalid actor {event.get('actor')}")
    for key in ("sources", "evidence"):
        if key in event and not isinstance(event[key], list):
            errors.append(f"{prefix}: {key} must be an array")
    return errors


def validate(args: argparse.Namespace) -> int:
    root = Path(args.root).expanduser().resolve()
    try:
        p = ensure_state(root)
    except FileNotFoundError as exc:
        print(f"FAIL: {exc}")
        return 1
    errors: list[str] = []
    warnings: list[str] = []
    for key in ("now", "journeys", "decisions", "events", "current"):
        if not p[key].is_file():
            errors.append(f"missing {p[key].relative_to(root)}")
    for name in ("index.html", "architecture.html", "program-design.html", "assumptions.html", "proof.html"):
        if not (p["views"] / name).is_file():
            errors.append(f"missing {(p['views'] / name).relative_to(root)}")

    events, event_errors = load_events(p["events"])
    errors.extend(event_errors)
    for index, event in enumerate(events, start=1):
        errors.extend(validate_event(event, index))

    if p["current"].exists():
        try:
            current = json.loads(p["current"].read_text(encoding="utf-8"))
            if current.get("schema_version") != SCHEMA_VERSION:
                errors.append("current.json has an unsupported schema_version")
        except json.JSONDecodeError as exc:
            errors.append(f"current.json is invalid JSON: {exc.msg}")

    for markdown_path in (p["now"], p["journeys"], p["decisions"]):
        if markdown_path.exists() and re.search(r"{{[A-Z0-9_]+}}", markdown_path.read_text(encoding="utf-8")):
            errors.append(f"unresolved template placeholder in {markdown_path.relative_to(root)}")

    programs = list(p["programs"].glob("*/PROGRAM.md")) if p["programs"].exists() else []
    if not programs:
        warnings.append("no program exists; this is valid before a direction is chosen")
    for program in programs:
        text = program.read_text(encoding="utf-8")
        if re.search(r"{{[A-Z0-9_]+}}", text):
            errors.append(f"unresolved template placeholder in {program.relative_to(root)}")
        for section in REQUIRED_PROGRAM_SECTIONS:
            if not re.search(rf"^##\s+{re.escape(section)}\s*$", text, flags=re.MULTILINE):
                errors.append(f"{program.relative_to(root)}: missing section {section}")

    active = [program for program in programs if program_status(program.read_text(encoding="utf-8")) not in {"complete", "completed", "cancelled", "retired", "rejected"}]
    if len(active) > 1:
        warnings.append(f"{len(active)} active programs found; record human-approved WIP boundaries")

    for warning in warnings:
        print(f"WARN: {warning}")
    for error in errors:
        print(f"FAIL: {error}")
    if errors:
        print(f"Validation failed with {len(errors)} error(s).")
        return 1
    print(f"PASS: Project Factory state is structurally valid ({len(events)} events, {len(programs)} programs).")
    return 0


def show_status(args: argparse.Namespace) -> int:
    root = Path(args.root).expanduser().resolve()
    p = ensure_state(root)
    events, errors = load_events(p["events"])
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    latest = tracked_assumption_events(events)
    program = active_program(p["programs"])
    payload = {
        "project": parse_project_name(p["now"], root.name),
        "state_dir": str(p["state"]),
        "active_program": program.parent.name if program else None,
        "events": len(events),
        "stage_counts": dict(Counter(str(event.get("stage") or "unknown") for event in events)),
        "open_assumptions": sum(
            1
            for event in latest.values()
            if event.get("status") not in {"verified", "invalidated", "superseded", "complete"}
        ),
        "last_event": events[-1] if events else None,
        "control_room": str(p["views"] / "index.html"),
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(f"Project: {payload['project']}")
        print(f"State: {payload['state_dir']}")
        print(f"Active program: {payload['active_program'] or 'none'}")
        print(f"Events: {payload['events']}")
        print(f"Open assumptions: {payload['open_assumptions']}")
        print(f"Control room: {payload['control_room']}")
    return 0


def render_command(args: argparse.Namespace) -> int:
    root = Path(args.root).expanduser().resolve()
    rendered = render(root)
    for path in rendered:
        print(path)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Initialize, record, validate, and render project-local Project Factory state."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    init = subparsers.add_parser("init", help="Create project-local canonical state without overwriting existing files.")
    init.add_argument("--root", default=".", help="Project root. Defaults to the current directory.")
    init.add_argument("--project-name", help="Human-facing project name. Defaults to the root directory name.")
    init.set_defaults(func=init_project)

    event = subparsers.add_parser("event", help="Append one material memory event and regenerate views.")
    event.add_argument("--root", default=".")
    event.add_argument("--stage", required=True, choices=STAGES)
    event.add_argument("--type", required=True, choices=EVENT_TYPES)
    event.add_argument("--status", required=True, choices=STATUSES)
    event.add_argument("--summary", required=True)
    event.add_argument("--subject-id")
    event.add_argument("--program")
    event.add_argument("--source", action="append", help="Repeat for multiple source pointers.")
    event.add_argument("--evidence", action="append", help="Repeat for multiple evidence pointers.")
    event.add_argument("--confidence", choices=CONFIDENCE, default="unknown")
    event.add_argument("--repo-sha")
    event.add_argument("--config-identity")
    event.add_argument("--actor", choices=ACTORS, default="agent")
    event.add_argument("--reason")
    event.add_argument("--supersedes")
    event.set_defaults(func=add_event)

    decision = subparsers.add_parser("decision", help="Append a decision to DECISIONS.md and the event log.")
    decision.add_argument("--root", default=".")
    decision.add_argument("--title", required=True)
    decision.add_argument("--choice", required=True)
    decision.add_argument("--reason", required=True)
    decision.add_argument("--status", choices=("proposed", "accepted", "rejected", "superseded"), default="accepted")
    decision.add_argument("--alternative", action="append")
    decision.add_argument("--evidence", action="append")
    decision.add_argument("--assumptions")
    decision.add_argument("--revisit-trigger")
    decision.add_argument("--supersedes")
    decision.add_argument("--subject-id")
    decision.add_argument("--program")
    decision.add_argument("--actor", choices=ACTORS, default="agent")
    decision.set_defaults(func=add_decision)

    program = subparsers.add_parser("new-program", help="Create a non-overwriting PROGRAM.md scaffold.")
    program.add_argument("--root", default=".")
    program.add_argument("--slug", required=True)
    program.add_argument("--title", required=True)
    program.add_argument(
        "--entry-mode",
        choices=("defined-outcome", "exploration", "small-local-change", "recovery-only"),
        default="defined-outcome",
    )
    program.set_defaults(func=new_program)

    render_parser = subparsers.add_parser("render", help="Regenerate current.json and read-only HTML views.")
    render_parser.add_argument("--root", default=".")
    render_parser.set_defaults(func=render_command)

    validate_parser = subparsers.add_parser("validate", help="Validate canonical files, events, programs, and views.")
    validate_parser.add_argument("--root", default=".")
    validate_parser.set_defaults(func=validate)

    status = subparsers.add_parser("status", help="Show a compact project-state summary.")
    status.add_argument("--root", default=".")
    status.add_argument("--json", action="store_true")
    status.set_defaults(func=show_status)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return int(args.func(args))
    except (FileNotFoundError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
