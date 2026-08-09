# ADR-010: Repository strategy — PanelSummary canonical, ScrollStack donor

- Status: Accepted
- Date: 2026-08-07
- Tracked by: [#2](https://github.com/Legend101Zz/PanelSummary/issues/2) (part of epic #11)

## Decision

PanelSummary (this repo) is the canonical v2 codebase. ScrollStack remains the
archived hackathon submission and acts as the code donor. This is Option A of
issue #2: port ScrollStack's control-plane architecture (typed contracts,
durable-context services, persistence layer, ADRs) back into PanelSummary,
keeping PanelSummary's mature manga-quality lane (v1) as the working fallback.

Where the repos implement the same concept differently, the ScrollStack
version wins for control-plane/contract code and the PanelSummary version wins
for manga-quality/renderer code, unless a test proves otherwise.

Port rule: port = move the code AND its tests AND its ADRs; adapt names only
at documented boundaries; never re-implement from memory.

Donor provenance: ScrollStack local `main` @ `43300b5` (2 commits ahead of
`origin/main` at port time; the delta is reel/artifact evidence outside the
port set; owner may push at leisure).

## Port inventory (executed 2026-08-07, first tranche)

Ported verbatim (byte-identical to donor, verified by `diff -r`):

| Donor (ScrollStack) | Target (PanelSummary) |
|---|---|
| `backend/app/contracts/` — all 10 modules (base, source, artifacts, context, runs, manga, reel, reel_delivery, registry, `__init__`), 30 registered contract models | `backend/app/contracts/` |
| `backend/app/persistence/{__init__,documents,mongo,protocols,repositories}.py` — all 9 Doc models, 10 repository protocols, InMemory + Beanie implementations | `backend/app/persistence/` |
| `backend/app/services/{hashing,errors,source_units,scopes,context_compiler,memory,generation_runs}.py` | same paths |
| `backend/scripts/export_contracts.py` | `backend/scripts/export_contracts.py` |
| `packages/fixtures/` — manifest + 32 canonical + 6 invalid fixtures | `packages/fixtures/` |
| `docs/adr/001–009` + README | `docs/adr/` (adopted as-is, ScrollStack numbering kept) |
| `backend/tests/{test_durable_context,test_contracts}.py` (54 collected tests) | `backend/tests/` (shim edit only, see below) |
| `packages/contracts/schema/` — 30 JSON Schemas | `packages/contracts/schema/` (19 regenerated, see below) |

The contracts directory ports wholesale, including reel/reel_delivery models:
`test_fixture_manifest_matches_registry` asserts exact parity between the
30-model registry and the fixture manifest, so trimming breaks the suite.

## Boundary edits (complete list)

1. `test_durable_context.py`, `test_contracts.py`: prepended this repo's
   standard `sys.path.insert(0, …parent.parent)` shim (the donor used
   pyproject `pythonpath=["."]`; this repo has no pytest config and 55/59
   existing tests use the shim).
2. `packages/contracts/schema/`: 19 of 30 schema files regenerated with the
   ported exporter under this repo's pydantic 2.10.3 (donor files were
   generated under 2.11.7; JSON Schema output differs between pydantic minor
   versions). `python scripts/export_contracts.py --check` is clean here.
   Regenerate again whenever pydantic is upgraded.
3. `backend/requirements.txt`: added `pytest==9.1.1` (was only ad-hoc in
   `.venv`; the test gate was otherwise unreproducible in fresh environments).
4. Exporter invocation in this repo needs `PYTHONPATH=.` from `backend/`
   (no pyproject to supply pythonpath). No code change.

Nothing else differs from the donor.

## Compatibility evidence

The donor suites were executed against this repo's exact dependency set
(beanie 1.27.0 / motor 3.7.0 / pymongo 4.10.1 / pydantic 2.10.3) before
porting: 53/54 passed; the single failure was the schema drift fixed by
boundary edit 2. After porting: 54/54 pass here, and the full backend suite
went 462 → 516 with zero regressions. No dependency upgrades were needed;
`pymongo.AsyncMongoClient` imports cleanly on 4.10.1.

## Not wired (deliberately inert)

The ported Docs are registered in none of the three `init_beanie`
document-model lists (`app/main.py`, `app/celery_worker.py`,
`app/scripts/_db.py`), and no v1 module imports `app.contracts` or
`app.persistence` (verified by grep). Wiring the v1 pipeline to consume
compiled context is the second half of issue #4.

`persistence/mongo.py` is ported verbatim but must not be called until the
wiring phase: it targets beanie 2.x semantics (`pymongo.AsyncMongoClient`
passed to `init_beanie`), while this repo runs beanie 1.27 + motor. The
wiring phase decides: upgrade to beanie 2.x (donor semantics) or adapt
`initialize_mongo` to motor. That decision is out of scope here because v1
behavior must be preserved bit-for-bit this session.

## Name-mapping table

| ScrollStack (donor) | PanelSummary (target v1) | Resolution |
|---|---|---|
| `persistence.MangaProjectDoc` (collection `manga_projects`) | `manga_models.MangaProjectDoc` (live v1) | Same name and collection concept, different schemas. Coexist unwired; reconcile at wiring phase. Donor Docs stay out of init_beanie until then. |
| `persistence.BookDoc` (collection `books`) | `models.Book` | Same as above. |
| `contracts.manga.RenderedPage` / `RenderedPageV2` | `domain/manga/render_view.py` RenderedPage (v1) | Donor = v2 contract; target = live v1 renderer model. v1 wins for renderer code until stage-by-stage migration. |
| `contracts.MangaPlan` (`manga-plan.v1`) | v1 adaptation plan + beat-sheet stage models | v2 contract adopted for the new lane; v1 stages keep their models behind the fallback flag. |
| ScrollStack `MangaEdition` / editions | PanelSummary slice/pages (`MangaSliceDoc`, `MangaPageDoc`) | Vocabulary mapping only; no code bridges the two this session. |
| `services/generation_runs.py` (run/stage ledger) | `services/manga/generation_service.py` (v1 stage orchestration) | Different responsibilities; both kept. |
| `services/source_units.py` (source spine) | `services/manga/source_slice_service.py` (v1 slices) | Adjacent concepts; v1 slices stay; source units are the v2 spine. |
| `contracts.SeriesProgress` / `SeriesProgressDoc` | (none) | New capability, inert until wired. |

## Deferred (recorded, not ported)

- `services/generation_workflow.py` (1792 lines): imports seven modules
  outside the port set (agent_worker, image_generation, hackathon_manga,
  manga_page_planning, manga_production, domain_tools,
  deterministic_manga_demo — ScrollStack's manga pipeline, which this ADR
  rejects in favor of the v1 lane). Its only test coverage is
  `test_vertical_slice.py`, which imports the entire donor app. Porting it
  honestly means porting ScrollStack wholesale. Decision on orchestration
  lands with the agent-worker phase; the durable run/stage ledger it needs is
  already here in `generation_runs.py`.
- TypeScript contracts side (`packages/contracts/src`, `generate.mjs`, Ajv
  validators, vitest fixtures test): lands with the pnpm workspace phase
  (blueprint §6, §11).
- ScrollStack `apps/agent-worker` + `packages/agent-runtime`, layout compiler
  adoption, design tokens: later tranches per epic #11.

## Consequences

- Every child issue in epic #11 names which repo's implementation it starts
  from; the default is: contracts/control-plane from ScrollStack, manga
  quality/renderer from PanelSummary.
- `docs/` is ignored by `.gitignore:39`; curated docs (including these ADRs)
  are committed with `git add -f`.
- The fixture manifest and `contracts/registry.py` must stay in lockstep;
  schema changes regenerate both JSON Schemas and (later) the TS package.
