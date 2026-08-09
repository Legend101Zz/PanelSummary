"""Two-scope, fresh-process continuity proof on the WMC benchmark (issue #4).

Blueprint Phase 1 exit: scope A then scope B in a FRESH process, where the
second compilation contains the first run's accepted memory purely from Mongo.
Everything here is deterministic — no LLM, no paid calls.

Run from backend/ as two SEPARATE processes:

    uv run python scripts/continuity_proof_wmc.py phase-a
    uv run python scripts/continuity_proof_wmc.py phase-b

phase-a:
  1. verifies the flag-on bridge path live: compiles a ContextPack for the
     real v1 arc-slice page range and byte-compares the derived source text
     against ``build_source_text_for_slice`` (the no-output-change guarantee);
  2. ensures the genesis memory snapshot (v0) and materializes the pointer;
  3. freezes scope A (story chapters), compiles pack A, persists the accepted
     context_pack artifact + run ledger row;
  4. merges a deterministic MemoryDelta (grounded facts derived from scope A
     units + previous_slice_ending + coverage) -> snapshot v1;
  5. compiles pack B (scope B chapters) at memory v1 and records its
     content_hash for the fresh-process determinism check.

phase-b (fresh process; reads ONLY Mongo + phase-a's evidence JSON):
  1. recompiles pack B and asserts the content hash matches phase-a's record;
  2. asserts pack B carries phase-a's facts, previous_slice_ending, and that
     the active snapshot's coverage marks scope A's units;
  3. proves required facts survive a token-budget reduction (and that the
     budget floor fails loud);
  4. proves a stale MemoryDelta (base_memory_version=0) is rejected with no
     data loss (snapshot count + hashes + active pointer unchanged);
  5. proves scope/run idempotency (same selection -> same scope id; same run
     request -> attached, not duplicated).

Evidence lands in docs/evidence/session2-continuity-proof/ (repo root).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.contracts.context import (  # noqa: E402
    ContinuityUpdate,
    GroundedFact,
    MemoryDelta,
    SourceCoverage,
)
from app.contracts.source import PageRange, SourceRef  # noqa: E402
from app.domain.manga import SourceRange, SourceSlice, SourceSliceMode  # noqa: E402
from app.models import Book  # noqa: E402
from app.persistence.documents import ArtifactDoc, construct_document  # noqa: E402
from app.persistence.v1_bridge import (  # noqa: E402
    V1BridgedRepositories,
    ensure_genesis_snapshot,
)
from app.scripts._db import connect  # noqa: E402
from app.services.book_normalization import source_text_from_units  # noqa: E402
from app.services.compiled_context_bridge import CompiledContextBridge  # noqa: E402
from app.services.context_compiler import ContextCompiler  # noqa: E402
from app.services.errors import ContextBudgetError, StaleMemoryDeltaError  # noqa: E402
from app.services.generation_runs import (  # noqa: E402
    GenerationRunService,
    StartGenerationRun,
)
from app.services.manga.generation_service import (  # noqa: E402
    build_source_text_for_slice,
)
from app.services.memory import MemoryMergeService  # noqa: E402
from app.services.scopes import ScopeService  # noqa: E402
from app.contracts.runs import GenerationBudget  # noqa: E402
from app.contracts.context import GenerationConstraints  # noqa: E402
from bson import ObjectId  # noqa: E402

BOOK_ID = "6a0b5a11201a8d03f1d82501"
PROJECT_ID = "6a0b5a5b201a8d03f1d82503"
SCOPE_A_CHAPTERS = {4, 5, 6, 7, 8}   # Parts of All of Us .. The Story
SCOPE_B_CHAPTERS = {9, 10}           # story continuation + A Discussion
V1_SLICE_PAGES = (1, 14)             # the real arc slice the benchmark ran
CREATED_BY = "continuity-proof"
EVIDENCE_DIR = (
    Path(__file__).resolve().parent.parent.parent
    / "docs"
    / "evidence"
    / "session2-continuity-proof"
)

CONSTRAINTS = GenerationConstraints(
    image_mode="budgeted",
    max_pages=100,
    max_panels_per_page=7,
    max_sprites=8,
    max_key_panels=3,
    reading_direction="rtl",
    narration_enabled=False,
)
FULL_BUDGET = 120_000

PROOF_RUN_BUDGET = GenerationBudget(
    max_text_cost_usd=0.0,
    max_image_cost_usd=0.0,
    max_render_minutes=0.0,
    max_agent_steps=1,
    max_repair_attempts=0,
    max_sprites=0,
    max_key_panels=0,
    max_reels=0,
)


class _ChapterFilteredUnits:
    def __init__(self, repositories, chapter_indexes):
        self._repositories = repositories
        self._chapters = chapter_indexes

    async def list_source_units(self, book_id):
        units = await self._repositories.list_source_units(book_id)
        return [unit for unit in units if unit.chapter_index in self._chapters]

    async def get_source_unit(self, book_id, source_unit_id):
        return await self._repositories.get_source_unit(book_id, source_unit_id)


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _check(results: list[dict], name: str, ok: bool, detail: str = "") -> None:
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


async def _chapter_scope(repositories, *, chapters, label):
    """Freeze a chapter selection exactly like the scopes API does."""

    filtered = _ChapterFilteredUnits(repositories, chapters)
    units = await filtered.list_source_units(BOOK_ID)
    if not units:
        raise SystemExit(f"no source units for chapters {sorted(chapters)}; normalize first")
    span = PageRange(
        page_start=min(unit.page_start for unit in units),
        page_end=max(unit.page_end for unit in units),
    )
    service = ScopeService(filtered, repositories, memory=repositories)
    scope = await service.create(
        project_id=PROJECT_ID,
        book_id=BOOK_ID,
        page_ranges=[span],
        selection_label=label,
        created_by=CREATED_BY,
    )
    scope_doc = await repositories.get_scope(scope.scope_id)
    return scope_doc, units


async def _compile(repositories, scope_doc, units, *, memory_version=None,
                   max_tokens=FULL_BUDGET, required_fact_ids=None):
    project = await repositories.get_project(PROJECT_ID)
    version = project.active_memory_version if memory_version is None else memory_version
    memory = await repositories.get_memory_snapshot(PROJECT_ID, version)
    if memory is None:
        raise SystemExit(f"memory snapshot {PROJECT_ID}@{version} missing")
    return ContextCompiler().compile(
        project_id=PROJECT_ID,
        scope=scope_doc,
        memory=memory,
        source_units=units,
        purpose="manga_direction",
        constraints=CONSTRAINTS,
        max_input_tokens=max_tokens,
        required_fact_ids=required_fact_ids,
    )


async def _persist_pack_artifact(repositories, pack, run_id):
    artifact = construct_document(
        ArtifactDoc,
        artifact_id=f"artifact_{pack.content_hash[:24]}",
        project_id=PROJECT_ID,
        run_id=run_id,
        stage_run_id=None,
        kind="context_pack",
        schema_version="context-pack.v1",
        content=pack.model_dump(mode="json"),
        storage_ref=None,
        content_hash=pack.content_hash,
        parent_artifact_ids=[],
        author="system",
        supersedes_artifact_id=None,
        source_refs=[e.source_ref.model_dump(mode="json") for e in pack.source_units],
        model_receipt=None,
        validation_status="accepted",
        validation_report={
            "validator": pack.compilation.compiler_version,
            "deterministic": True,
            "estimated_tokens": pack.compilation.estimated_tokens,
        },
    )
    stored = await repositories.save_artifact(artifact)
    return stored.artifact_id


def _facts_from_units(units) -> list[GroundedFact]:
    """Three deterministic, source-grounded facts from the scope's units."""

    facts = []
    for unit in units[:3]:
        heading = " / ".join(unit.heading_path) or unit.source_unit_id
        snippet = " ".join((unit.text or "")[:160].split())
        facts.append(
            GroundedFact(
                fact_id=f"proof-{unit.source_unit_id}",
                claim=f"Section {heading!r} opens: {snippet}",
                source_refs=[
                    SourceRef(
                        book_id=unit.book_id,
                        source_unit_id=unit.source_unit_id,
                        page_start=unit.page_start,
                        page_end=unit.page_end,
                        quote=(unit.text or "")[:500].strip() or heading,
                        text_hash=unit.text_hash,
                    )
                ],
                confidence=1.0,
            )
        )
    return facts


async def phase_a() -> int:
    await connect()
    repositories = V1BridgedRepositories()
    results: list[dict] = []
    print(f"phase-a pid={os.getpid()} at {_now()}")

    book = await Book.get(ObjectId(BOOK_ID))
    if book is None:
        raise SystemExit("WMC book not found")
    all_units = await repositories.list_source_units(BOOK_ID)
    if not all_units:
        raise SystemExit("no source units; run app/scripts/normalize_source_units.py first")

    # 1. Live flag-on bridge equality on the real v1 slice parameters.
    genesis = await ensure_genesis_snapshot(repositories, PROJECT_ID)
    bridge = CompiledContextBridge(repositories, max_input_tokens=FULL_BUDGET)
    v1_slice = SourceSlice(
        slice_id="proof-v1-mirror",
        book_id=BOOK_ID,
        mode=SourceSliceMode.PAGES,
        source_range=SourceRange(page_start=V1_SLICE_PAGES[0], page_end=V1_SLICE_PAGES[1]),
    )
    compiled = await bridge.compile_slice_context(
        book=book, project_id=PROJECT_ID, source_slice=v1_slice
    )
    legacy_text = build_source_text_for_slice(book.chapters, v1_slice)
    _check(
        results,
        "flag-on bridge text byte-equals v1 builder (live, real slice range)",
        compiled.source_text == legacy_text,
        f"{len(legacy_text)} chars, pack {compiled.pack.context_pack_id}, "
        f"run {compiled.run_id}, artifact {compiled.artifact_id}",
    )

    # 2/3. Scope A -> pack A -> accepted artifact.
    scope_a, units_a = await _chapter_scope(
        repositories, chapters=SCOPE_A_CHAPTERS, label="proof scope A (story chapters)"
    )
    pack_a = await _compile(repositories, scope_a, units_a)
    runs = GenerationRunService(
        runs=repositories, scopes=repositories, memory=repositories, artifacts=repositories
    )
    run_a, run_a_created = await runs.start(
        PROJECT_ID,
        StartGenerationRun(
            scope_id=scope_a.scope_id,
            requested_outputs=["manga"],
            pipeline_version="manga-pipeline.v1",
            budget=PROOF_RUN_BUDGET,
            created_by=CREATED_BY,
        ),
    )
    artifact_a = await _persist_pack_artifact(repositories, pack_a, run_a.run_id)
    _check(results, "scope A frozen + pack A compiled + artifact accepted",
           True, f"scope {scope_a.scope_id}, memory_v{pack_a.memory_version}, {artifact_a}")

    # 4. Deterministic memory delta -> snapshot v1.
    facts = _facts_from_units(units_a)
    ending = " ".join((units_a[-1].text or "")[-240:].split())
    delta = MemoryDelta(
        schema_version="memory-delta.v1",
        project_id=PROJECT_ID,
        base_memory_version=genesis.memory_version,
        new_facts=facts,
        continuity_updates=[
            ContinuityUpdate(key="previous_slice_ending", value=ending),
        ],
        coverage_additions=[
            SourceCoverage(
                source_unit_id=unit.source_unit_id,
                beat_ids=["proof-beat-001"],
                coverage_status="covered",
            )
            for unit in units_a
        ],
        source_artifact_ids=[artifact_a],
    )
    merge = MemoryMergeService(memory=repositories, sources=repositories, artifacts=repositories)
    snapshot = await merge.merge(delta)
    project = await repositories.get_project(PROJECT_ID)
    _check(
        results,
        "memory delta merged; active pointer advanced 0 -> 1 on live v1 doc",
        snapshot.memory_version == 1 and project.active_memory_version == 1,
        f"snapshot v{snapshot.memory_version} hash {snapshot.content_hash[:16]}…",
    )

    # 5. Pack B compiled at memory v1; hash recorded for the fresh process.
    scope_b, units_b = await _chapter_scope(
        repositories, chapters=SCOPE_B_CHAPTERS, label="proof scope B (continuation)"
    )
    pack_b = await _compile(repositories, scope_b, units_b)
    _check(results, "pack B compiled at memory v1 (phase-a reference)",
           pack_b.memory_version == 1, f"content_hash {pack_b.content_hash[:16]}…")

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    evidence = {
        "phase": "a",
        "pid": os.getpid(),
        "at": _now(),
        "book_id": BOOK_ID,
        "project_id": PROJECT_ID,
        "v1_mirror": {
            "pages": V1_SLICE_PAGES,
            "scope_id": compiled.scope_id,
            "run_id": compiled.run_id,
            "artifact_id": compiled.artifact_id,
            "pack_id": compiled.pack.context_pack_id,
            "pack_hash": compiled.pack.content_hash,
            "source_text_chars": len(legacy_text),
        },
        "scope_a": {
            "scope_id": scope_a.scope_id,
            "scope_hash": scope_a.scope_hash,
            "chapters": sorted(SCOPE_A_CHAPTERS),
            "unit_ids": [u.source_unit_id for u in units_a],
            "run_id": run_a.run_id,
            "run_created": run_a_created,
            "artifact_id": artifact_a,
            "pack_a_hash": pack_a.content_hash,
        },
        "delta": {
            "fact_ids": [fact.fact_id for fact in facts],
            "previous_slice_ending": ending,
            "coverage_unit_ids": [u.source_unit_id for u in units_a],
            "snapshot_v1_hash": snapshot.content_hash,
        },
        "scope_b": {
            "scope_id": scope_b.scope_id,
            "scope_hash": scope_b.scope_hash,
            "chapters": sorted(SCOPE_B_CHAPTERS),
            "unit_ids": [u.source_unit_id for u in units_b],
            "pack_b_hash": pack_b.content_hash,
            "pack_b_id": pack_b.context_pack_id,
        },
        "checks": results,
    }
    out = EVIDENCE_DIR / "phase_a.json"
    out.write_text(json.dumps(evidence, indent=1))
    print(f"evidence: {out}")
    return 0 if all(item["ok"] for item in results) else 1


async def phase_b() -> int:
    await connect()
    repositories = V1BridgedRepositories()
    results: list[dict] = []
    print(f"phase-b pid={os.getpid()} at {_now()} (fresh process)")

    reference = json.loads((EVIDENCE_DIR / "phase_a.json").read_text())
    if reference.get("pid") == os.getpid():
        raise SystemExit("phase-b must run in a fresh process")

    # 1. Fresh-process recompilation of pack B is byte-identical.
    scope_b, units_b = await _chapter_scope(
        repositories, chapters=SCOPE_B_CHAPTERS, label="proof scope B (continuation)"
    )
    _check(
        results,
        "scope B idempotent across processes (same scope id + hash)",
        scope_b.scope_id == reference["scope_b"]["scope_id"]
        and scope_b.scope_hash == reference["scope_b"]["scope_hash"],
        scope_b.scope_id,
    )
    pack_b = await _compile(repositories, scope_b, units_b)
    _check(
        results,
        "fresh-process pack B content hash equals phase-a compilation",
        pack_b.content_hash == reference["scope_b"]["pack_b_hash"],
        f"{pack_b.content_hash[:16]}…",
    )

    # 2. Pack B carries phase-a's accepted memory, rebuilt purely from Mongo.
    fact_ids = {fact.fact_id for fact in pack_b.book_canon.facts}
    wanted = set(reference["delta"]["fact_ids"])
    _check(
        results,
        "pack B contains scope A's accepted facts",
        wanted <= fact_ids,
        f"{sorted(wanted)}",
    )
    _check(
        results,
        "pack B continuity carries scope A's previous_slice_ending",
        pack_b.continuity.previous_slice_ending == reference["delta"]["previous_slice_ending"],
        (pack_b.continuity.previous_slice_ending or "")[:80] + "…",
    )
    project = await repositories.get_project(PROJECT_ID)
    snapshot = await repositories.get_memory_snapshot(
        PROJECT_ID, project.active_memory_version
    )
    covered = set(snapshot.coverage)
    _check(
        results,
        "active snapshot coverage marks scope A's units",
        set(reference["delta"]["coverage_unit_ids"]) <= covered,
        f"{len(covered)} covered units at memory v{snapshot.memory_version}",
    )

    # 3. Required facts survive token-budget reduction; floor fails loud.
    # Find the mandatory floor from the compiler's own refusal, then walk
    # upward to the first budget that compiles: it necessarily omits optional
    # sections (it sits far below the everything-included estimate).
    import re as _re

    required = wanted
    full = await _compile(
        repositories, scope_b, units_b, required_fact_ids=required
    )
    try:
        await _compile(repositories, scope_b, units_b, max_tokens=1,
                       required_fact_ids=required)
        raise SystemExit("budget=1 unexpectedly compiled")
    except ContextBudgetError as error:
        match = _re.search(r"at least (\d+) estimated tokens", str(error))
        mandatory_floor = int(match.group(1)) if match else None
    squeezed = None
    squeezed_budget = None
    if mandatory_floor is not None:
        budget = mandatory_floor
        while budget < full.compilation.estimated_tokens:
            try:
                squeezed = await _compile(
                    repositories, scope_b, units_b,
                    max_tokens=budget, required_fact_ids=required,
                )
                squeezed_budget = budget
                break
            except ContextBudgetError:
                budget += 10
    _check(
        results,
        "token-budget reduction dropped optional sections but kept required facts",
        squeezed is not None
        and required <= {fact.fact_id for fact in squeezed.book_canon.facts}
        and len(squeezed.compilation.omitted_optional_sections) > 0
        and all(excerpt.source_ref.source_unit_id in
                {u.source_unit_id for u in units_b}
                for excerpt in squeezed.source_units),
        (
            f"floor {mandatory_floor}, squeezed at {squeezed_budget} "
            f"(full ~{full.compilation.estimated_tokens}): "
            f"omitted={squeezed.compilation.omitted_optional_sections}; "
            f"facts kept={sorted(f.fact_id for f in squeezed.book_canon.facts)}"
            if squeezed is not None
            else f"floor {mandatory_floor}: no compiling budget found below full"
        ),
    )
    try:
        await _compile(repositories, scope_b, units_b, max_tokens=2_000,
                       required_fact_ids=required)
        floor_failed_loud = False
    except ContextBudgetError as error:
        floor_failed_loud = True
        floor_detail = str(error)[:120]
    _check(
        results,
        "budget below mandatory evidence fails loud (never silently drops source)",
        floor_failed_loud,
        floor_detail if floor_failed_loud else "compiled unexpectedly",
    )

    # 4. Stale MemoryDelta rejected with zero data loss.
    before_v0 = await repositories.get_memory_snapshot(PROJECT_ID, 0)
    before_v1 = await repositories.get_memory_snapshot(PROJECT_ID, 1)
    stale = MemoryDelta(
        schema_version="memory-delta.v1",
        project_id=PROJECT_ID,
        base_memory_version=0,
        continuity_updates=[
            ContinuityUpdate(key="previous_slice_ending", value="stale overwrite attempt")
        ],
        source_artifact_ids=[reference["scope_a"]["artifact_id"]],
    )
    merge = MemoryMergeService(memory=repositories, sources=repositories, artifacts=repositories)
    try:
        await merge.merge(stale)
        stale_rejected = False
    except StaleMemoryDeltaError as error:
        stale_rejected = True
        stale_detail = str(error)[:120]
    project_after = await repositories.get_project(PROJECT_ID)
    after_v0 = await repositories.get_memory_snapshot(PROJECT_ID, 0)
    after_v1 = await repositories.get_memory_snapshot(PROJECT_ID, 1)
    _check(
        results,
        "stale delta (base v0 against active v1) rejected",
        stale_rejected,
        stale_detail if stale_rejected else "merge unexpectedly succeeded",
    )
    _check(
        results,
        "no data loss after stale rejection (pointer + snapshot hashes unchanged)",
        project_after.active_memory_version == 1
        and after_v0.content_hash == before_v0.content_hash
        and after_v1.content_hash == before_v1.content_hash,
        f"active v{project_after.active_memory_version}",
    )

    # 5. Run idempotency: the key includes the ACTIVE memory version (a run
    # against new memory is new work — phase-a's run was keyed at v0), so the
    # invariant to prove is same-request-attaches at the same version.
    runs = GenerationRunService(
        runs=repositories, scopes=repositories, memory=repositories, artifacts=repositories
    )
    scope_a_doc = await repositories.get_scope(reference["scope_a"]["scope_id"])
    request = StartGenerationRun(
        scope_id=scope_a_doc.scope_id,
        requested_outputs=["manga"],
        pipeline_version="manga-pipeline.v1",
        budget=PROOF_RUN_BUDGET,
        created_by=CREATED_BY,
    )
    run_first, _ = await runs.start(PROJECT_ID, request)
    run_second, second_created = await runs.start(PROJECT_ID, request)
    phase_a_run = await repositories.get_run(reference["scope_a"]["run_id"])
    _check(
        results,
        "same run request attaches to the existing run (idempotency key)",
        (not second_created)
        and run_second.run_id == run_first.run_id
        and run_first.run_id != reference["scope_a"]["run_id"]
        and phase_a_run is not None,
        f"memory-v1 run {run_first.run_id}; phase-a v0 run intact: "
        f"{reference['scope_a']['run_id']}",
    )

    evidence = {
        "phase": "b",
        "pid": os.getpid(),
        "at": _now(),
        "reference_phase_a_pid": reference["pid"],
        "book_id": BOOK_ID,
        "project_id": PROJECT_ID,
        "pack_b_hash": pack_b.content_hash,
        "active_memory_version": project_after.active_memory_version,
        "checks": results,
    }
    out = EVIDENCE_DIR / "phase_b.json"
    out.write_text(json.dumps(evidence, indent=1))
    print(f"evidence: {out}")
    ok = all(item["ok"] for item in results)
    print(f"phase-b: {'ALL CHECKS PASS' if ok else 'FAILURES PRESENT'}")
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["phase-a", "phase-b"])
    args = parser.parse_args()
    if args.phase == "phase-a":
        return asyncio.run(phase_a())
    return asyncio.run(phase_b())


if __name__ == "__main__":
    sys.exit(main())
