# ADR-011: Wiring the ported durable-context layer into v1 (beanie 1.27 + bridge)

- Status: Accepted
- Date: 2026-08-07
- Tracked by: [#4](https://github.com/Legend101Zz/PanelSummary/issues/4) (part of epic #11)
- Extends: ADR-010 (port inventory + deferred wiring decision), ADR-002 (Mongo durable authority)

## Context

ADR-010 ported ScrollStack's persistence layer and durable-context services
verbatim but left them inert: the donor `persistence/mongo.py` targets
beanie 2.x semantics (`pymongo.AsyncMongoClient` passed to `init_beanie`)
while this repo runs beanie 1.27 + motor, and two donor Documents collide
with live v1 collections. This ADR records the wiring decisions executed in
Session 2.

## Decision 1: stay on beanie 1.27 + motor; bridge at the boundary

No dependency upgrade. v1 behavior must stay bit-identical (blueprint Phase 1),
and the donor repository code was verified live against Atlas under
beanie 1.27 + motor before wiring (smoke evidence, 2026-08-07):

- `model_construct`-built documents round-trip byte-exact text;
- `find().sort(+A, +B).to_list()` behaves as the donor expects;
- `find_one(...).update({"$set": ...})` returns a pymongo `UpdateResult`
  with `modified_count` (1 on match, 0 on miss) — the exact semantics
  `advance_memory`'s optimistic compare-and-set relies on;
- unique indexes raise `DuplicateKeyError` as the donor recovery paths expect.

`app/persistence/mongo.py` stays byte-identical to the donor and REMAINS
UNCALLED (it is the beanie-2 target for a future upgrade). The live wiring
surface is the new boundary module `app/persistence/v1_bridge.py`, whose
`init_wired_documents` is the motor adaptation of the donor
`initialize_mongo` — including the donor's `tz_aware=True`, via a SECOND
motor client used only by the seven wired collections. Discovered live: the
ported contracts require `AwareDatetime`, and a naive client (v1's) returns
naive datetimes on re-read, which broke `ScopeService`'s duplicate-scope
path in the fresh-process proof. v1's own client must stay naive so v1 API
response shapes do not change; beanie 1.27 supports per-model databases
across `init_beanie` calls, so the two lanes coexist.

## Decision 2: collision resolution — v1 documents stay canonical

**Deviation from the session instruction** ("register the ported Docs in all
three init_beanie lists"): only 7 of the 9 donor Docs are registered. Donor
`BookDoc` (collection `books`) and donor `MangaProjectDoc` (collection
`manga_projects`) are NOT registered anywhere, because the live v1 documents
(`app.models.Book`, `app.manga_models.MangaProjectDoc`) own those collections
with different schemas. Registering the donor classes would have created the
donor's unique indexes (`book_id`, `(owner_id, pdf_hash)`, `project_id`) on
collections whose documents lack those fields — every existing row indexes as
null, the second null violates uniqueness, and the guard the index implements
is corrupted. This is exactly the reconciliation ADR-010's name-mapping table
deferred to the wiring phase, and blueprint §7.2 prescribes the resolution:
*"Keep `MangaProjectDoc` as the active project root"* and put the
`active_memory_version` pointer on it.

Mechanics (`app/persistence/v1_bridge.py`):

- `WIRED_DOCUMENT_MODELS` — the seven collision-free donor Docs
  (`SourceUnitDoc`, `ScopeManifestDoc`, `ProjectMemorySnapshotDoc`,
  `ArtifactDoc`, `GenerationRunDoc`, `StageRunDoc`, `SeriesProgressDoc`) —
  registered at all three v1 `init_beanie` sites (`app/main.py`,
  `app/celery_worker.py`, `app/scripts/_db.py`).
- `V1BridgedRepositories(BeanieRepositories)` reroutes book/project methods
  to the live v1 documents and returns donor-shaped records via
  `construct_document`, so every ported service (ScopeService,
  ContextCompiler, MemoryMergeService, GenerationRunService) runs unchanged.
  Book/project WRITE methods raise `NotImplementedError` — the v2 lane never
  writes v1-owned collections except the one pointer below.
- v1 `MangaProjectDoc` gains `active_memory_version: int = 0` (additive,
  default; no v1 code reads it). Because raw `$eq` queries do not match
  documents missing the field, `ensure_genesis_snapshot` materializes it with
  `$set: {active_memory_version: 0}` when creating snapshot v0 — without this
  the first optimistic advance can never match.
- Identifier mapping: v1 uses Mongo `_id` as the public id, so bridge-side
  `book_id` / `project_id` are `str(ObjectId)`.

## Decision 3: structure-aware source units; pages stored as parsed

The WMC benchmark parse has **degenerate page provenance**: all 17 chapters
and their sections report pages 1-1 of a 39-page PDF (the v1 Docling path
dropped page ranges; the arc outline's "pages 1-14" is model-authored, not
parse truth). Consequences:

- Source units follow STRUCTURE (chapter/section headings), not pages:
  `app/services/book_normalization.py` emits one `kind="section"` unit per
  non-empty section, `heading_path=[chapter, section]`, real
  `chapter_index`, and the page numbers **exactly as parsed** — degenerate
  values are stored honestly, never fabricated.
- Long sections are split into byte-exact parts of ≤19 000 chars (the
  `SourceUnitExcerpt` contract caps excerpts at 20 000; WMC's story chapter
  is ~24.5k). Unit id `section_{ch:04d}_{sec:03d}_{part:02d}_{hash12}`;
  concatenating parts in id order reproduces `section.content` exactly.
- Donor `ParsedChapter`/`normalize_pages` are NOT reused for this path:
  their `str_strip_whitespace=True` would strip section-boundary whitespace
  and break byte equality with the v1 source-text builder. Units are built
  with `construct_document` (no coercion); the donor repository
  (`save_source_units` upsert) does the persistence.
- Scope selection supports `chapter_indexes` in addition to donor
  `page_ranges` (`POST /books/{id}/scopes`), because page overlap cannot
  discriminate on a degenerate-parse book. Chapter selection filters the
  unit spine and then reuses the ported `ScopeService.create` verbatim
  through a read-only filtered repository view — scope hashing and
  idempotency semantics stay donor-identical.
- Front matter is DERIVED, not stored (`classify_front_matter`): empty
  content or apparatus headings (contents/copyright/dedication/…​). Surfaced
  in `GET /books/{id}/scopes/coverage`; chapter selections skip front matter
  unless `include_front_matter=true`. Back-matter ad pages (WMC ch. 11-16)
  are NOT yet flagged — recorded as future work. A re-parse with different
  text produces new-id units under a new `parse_version` and leaves old
  units in place; garbage collection of superseded parse generations is
  deferred.

## Decision 4: Phase 1 consumption is byte-guarded and flag-gated

`Settings.use_compiled_context` (default **False**). When on,
`generate_project_slice` calls `CompiledContextBridge`
(`app/services/compiled_context_bridge.py`), which is deterministic end to
end: genesis snapshot → idempotent scope freeze for the slice's page range →
`ContextCompiler` pack at the ACTIVE memory version → accepted
`context_pack` artifact under an idempotent `GenerationRunDoc` ledger row →
slice text rebuilt from the durable units (`source_text_from_units`, which
walks `book.chapters` with exactly the v1 overlap/format rules and takes
every content byte from hash-verified units). The pipeline then byte-compares
that text with the legacy builder's output and **raises on any mismatch** —
flag-on cannot silently change generated output. After a successful slice the
bridge merges a deterministic `MemoryDelta` (scope coverage + the same
recap/hook strings v1 wrote to its own ledger, citing the pack artifact)
through the ported `MemoryMergeService`, advancing the memory pointer.

The v1 continuity ledger keeps operating unchanged; Phase 1 adds the durable
layer beside it. Migrating stages off the ledger is Phase 2+ work.

## Evidence (2026-08-07 session)

- Beanie 1.27 live semantics smoke: 4/4 PASS (see Decision 1).
- WMC normalized: 16 section units from 17 sections (3 empty front-matter
  sections -> 0 units; the 24.5k-char story chapter split into 2 parts);
  byte-equality PASS over the full page span (70,580 chars); second run
  created 0 new units (idempotent).
- Two-scope fresh-process continuity proof: phase-a 4/4 PASS, phase-b 10/10
  PASS (`backend/scripts/continuity_proof_wmc.py`; evidence JSON + curl
  transcript in `docs/evidence/session2-continuity-proof/`). Includes: live
  byte-equality of the flag-on bridge on the real v1 slice range; fresh-
  process pack recompilation hash-identical; required facts survive a
  squeeze to 10,799 tokens (optional continuity section dropped); stale
  delta rejected with pointer + snapshot hashes unchanged.
- Full backend suite: 563 passed (516 baseline preserved + 47 new tests),
  zero regressions.

## Consequences

- A future beanie 2.x upgrade replaces `V1BridgedRepositories`' base wiring
  and finally calls the donor `initialize_mongo`; the bridge overrides stay
  until v1 books/projects migrate to donor schemas (ADR-010 mapping table).
- The flag-on path fails loud (`CompiledContextError` / equality
  `RuntimeError`) rather than falling back silently; operators must
  normalize a book before enabling the flag for it.
- Live WMC benchmark writes performed by this wiring: additive
  `active_memory_version` field on the project document, plus rows in the
  seven new collections. Backup: `/tmp/bookreel-s2-before-wiring.json`.
