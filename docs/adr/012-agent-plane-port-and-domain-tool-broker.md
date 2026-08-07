# ADR-012: Agent-plane port (pnpm workspace, Pi runtime, domain-tool broker)

- Status: Accepted
- Date: 2026-08-07 (Session 3)
- Tracked by: [#8](https://github.com/Legend101Zz/PanelSummary/issues/8) and
  the first half of [#3](https://github.com/Legend101Zz/PanelSummary/issues/3)
  (part of epic #11)
- Extends: ADR-003 (Pi behind an adapter), ADR-004 (tool allowlists),
  ADR-010 (port rule + donor pin), ADR-011 (v1 bridge)

## Decision

Port ScrollStack's agent plane verbatim from local `main` @ `43300b5` (same
donor pin and same port rule as ADR-010: code + tests + docs byte-identical,
every boundary edit enumerated here) and wire its Python control-plane side
into this repo through the ADR-011 bridge. Blueprint Phase 0's remaining exit
(cross-language fixture validation) and all of Phase 2 (integrate Pi safely)
are closed by this ADR; the evidence is in
`docs/evidence/session3-live-director/`.

## Port inventory (all @ 43300b5)

TypeScript / workspace:

- Workspace root: `package.json`, `pnpm-workspace.yaml`,
  `tsconfig.base.json`; fresh `pnpm-lock.yaml` (safe: every donor dependency
  is an exact pin; the donor lock covers a different workspace set).
- `packages/contracts` TS side (the piece ADR-010 deferred):
  `scripts/generate.mjs`, `src/index.ts`, `src/schemas.ts`,
  `src/validators.ts`, `test/fixtures.test.ts`, `tsconfig.json`,
  `package.json`, `README.md`. The `schema/` JSONs and
  `packages/fixtures/` were already ported in Session 1.
- `packages/agent-runtime` — the ONLY package importing the Pi SDK
  (ADR-003), pinned exactly: `@earendil-works/pi-coding-agent 0.80.10`.
  The pin was re-evaluated at port time per issue #8 and kept: it is the
  donor-proven version with live MiniMax receipts; an upgrade is a separate
  reviewed change with golden contract tests.
- `apps/agent-worker` — authenticated Fastify service + repo-owned
  production skills + `HttpDomainToolBroker` (incl. `Dockerfile`, README,
  all skill markdown).

Python (backend):

- `app/services/domain_tools.py` (`MangaDirectorToolService`) — verbatim.
- `app/services/agent_worker.py` (`HttpAgentWorkerClient`) — verbatim.

New code (NOT ports; mirrors donor logic that lives inside ScrollStack's
unported 1792-line `generation_workflow.py`):

- `app/services/manga_director.py` — the typed MANGA_DIRECTION goal driver
  (goal construction, broker-validated acceptance, ModelReceipt rules copied
  from the donor's `_execute_manga_direction`).
- `app/api/routes/internal_tools.py` — adapted donor router (below).
- `backend/scripts/live_manga_director.py` — live-run harness.

## Boundary edits — the complete list

Everything else is byte-identical to the donor (verified against
`git show 43300b5:<path>` at copy time).

1. `pnpm-workspace.yaml`: packages list reduced to `apps/*` + `packages/*`.
   The donor also listed `frontend` and `reel-renderer`; this repo's v1
   frontend and reel-renderer are npm-managed and stay outside the
   workspace so v1 behavior is untouched.
2. Root `package.json`: dropped the `frontend:build` script (its filter
   target is not in the workspace). Root/package names keep the
   `scrollstack` / `@scrollstack/*` scope: the port rule's value is
   diff-provable fidelity, and renaming would touch every import in every
   file. Rename to a repo-native scope is deferred to a dedicated commit.
3. `packages/contracts/package.json`: `generate:schemas` / `check:generated`
   adapted to this repo's uv non-project mode
   (`cd ../../backend && PYTHONPATH=. uv run python scripts/export_contracts.py`);
   the donor used `uv run --project ../../backend`, which requires a
   pyproject this backend does not have.
4. `packages/contracts/src/generated/*` regenerated from THIS repo's
   pydantic-2.10.3 schemas (same rationale as ADR-010 boundary edit 2:
   schema JSON output differs across pydantic minors).
   `node scripts/generate.mjs --check` is clean.
5. `app/api/routes/internal_tools.py` adapted from the donor's
   `app/api/internal_tools.py`: this repo has no `app.container`
   composition root and no global `ControlPlaneError` exception handler, so
   the router factory takes the tool service directly and applies the
   donor `create_app` handler's exact error→status mapping locally
   (AuthorizationError→403, NotFoundError→404, else→422). The bearer check
   is byte-equivalent. Added after the first live run: a WARNING log line
   when a tool call is rejected — the sealed agent sees only bounded error
   text, so rejections were invisible to the operator debugging the run.
6. `app/main.py`: mounts the internal-tools router over
   `V1BridgedRepositories` with `DOMAIN_TOOL_BROKER_TOKEN` (donor default
   string retained for local dev).
7. Python tests are NEW, not ported (deviation from the verbatim-test
   rule): the donor's only coverage of the broker/client lives in its
   whole-app `test_vertical_slice.py`, which imports the rejected
   `generation_workflow`. New suites: `test_domain_tools_v2.py` (15),
   `test_agent_worker_client_v2.py` (9), `test_manga_director_v2.py` (6),
   `test_prompt_injection_v2.py` (16); plus a new TS suite
   `packages/agent-runtime/test/injection.test.ts` (7) alongside the four
   ported TS test files.
8. Injection fixtures live in `packages/fixtures/injection/` — deliberately
   OUTSIDE `manifest.json`, because the ported fixtures test asserts the
   manifest's schema set equals the schema registry exactly.

## Deferred (recorded, not forgotten)

- `page_domain_tools.py` (page-writing/thumbnail tools named by issue #8's
  broker checkbox) imports `manga_layout`, `manga_page_planning`, and
  `manga_validation` — Session 4's layout-compiler scope. Deferred with the
  checkbox left unticked.
- `ARTIFACT_REPAIR` has no goal policy in the runtime (donor state); the
  repair path is submission-retry within a session, not a separate goal.
- Restricted egress for the worker process (issue #8 security checkbox) is
  an infra concern not addressed by this session; the worker holds no
  Mongo/storage/image credentials, but nothing yet firewalls its outbound
  network.
- Durable persistence of the full per-call tool trace (issue #8 traces
  checkbox): the accepted artifact carries the receipt fields and the stage
  run carries the Pi session id, but the `tool_calls` list is not yet
  stored.

## Deviation: M3 thinking controls are not reachable through pinned Pi

The session brief asked for the disabled-thinking + `reasoning_split`
controls (NEXT_SESSION 2026-07-10 notes). Those controls belong to
MiniMax's OpenAI-compatible lane; Pi 0.80.10's bundled catalog routes
`minimax/MiniMax-M3` through `https://api.minimax.io/anthropic`
(`api: "anthropic-messages"`, `reasoning: true`), and the sealed runtime
exposes no extra-body hook. We did NOT patch `pi-runtime.ts` — the donor's
live M3 receipts and the `<think>`-stripping candidate fallback prove the
path works as shipped. Consequence, now measured: reasoning stays on, so
the live direction call produced 43,940 output tokens, $0.0679, 291 s —
above the $0.02–0.04 per-stage estimate from the v1 OpenAI-compatible lane.
Session 4+ budgeting should use these actuals; revisiting the lane choice
(or a Pi upgrade with an extra-body hook) is a separate reviewed change.

## Observation from the live run (donor behavior, kept)

The accepted plan was the model's third submission. The first two arrived
as tool-call frames and were rejected 422 by the deterministic validators
(12, then 39 pydantic errors). The third arrived as assistant-text JSON and
was routed through `extractAssistantJsonCandidate` → the SAME authenticated
broker and validators, then accepted. Note the adapter's per-tool
submission counter does not see fallback submissions; the bound that held
was the broker's own validation plus the run's budget caps. Donor behavior,
recorded here rather than patched mid-session.

## Consequences

- Celery/v1 remains the only workflow owner; the worker never schedules
  work (ADR-003). The v1 pipeline is untouched — 563 baseline tests still
  pass and `use_compiled_context` remains default OFF.
- The model's entire capability surface is the per-goal allowlist brokered
  back into FastAPI; prompt-injection containment is enforced by tests on
  both sides of the language boundary.
- Every future agent goal type follows the same shape: policy in
  `GOAL_POLICIES`, tool service on the Python side, skill under
  `apps/agent-worker/src/skills/`, receipts on accepted artifacts.
