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

## Session 4 addendum (2026-08-08): layout lane port + live-run fixes

Extends this ADR for the Session 4 port (issues #5/#6). Same donor pin
(43300b5), same verbatim rule. Evidence: `docs/evidence/session4-bakeoff/`
and `docs/evidence/session4-svg-previews/`.

Ported verbatim: `manga_layout.py`, `manga_page_planning.py`,
`manga_validation.py`, `page_domain_tools.py`, `test_manga_layout.py`,
`test_manga_page_planning.py` (sys.path shim only, Session 1 convention).

Boundary edits and deviations:

1. `app/main.py` mounts `MangaDomainToolService` (donor dispatcher: planning
   tools + Director tools). Donor quirk kept verbatim and PINNED by test:
   `list_relevant_assets` is claimed by the planning (thumbnail) tool set
   BEFORE the Director service, so direction-stage scopes are refused that
   name (`test_prompt_injection_pages_v2.py`).
2. NEW drivers (not ports, donor logic mirrored from
   `generation_workflow.py`): `manga_page_planner.py` extends the Manga
   Director run with `manga_page_writing` / `manga_thumbnail` stages; exact
   per-instance model receipt gate (issue #3 policy: both planning purposes
   -> MiniMax-M2.7-highspeed; overrides are explicit A/B only). DEVIATION
   from donor constants after live evidence: the panel target derives from
   the accepted plan's beat count (donor fixed "4"), because the trusted
   skill demands each accepted beat map to exactly one panel.
3. **Donor bug fixed in `tool-adapter.ts`**: the pinned Pi SDK never sends
   tool-result `details` to the model ("extension-specific metadata (not
   sent to LLM)" — SDK session-manager docs), so every READ tool degraded
   to its one-line summary. First exposed by the first live page-writing
   goal: the model reported "MangaPlan content not available" blockers
   after three `get_manga_canon` calls. The bounded broker `data` payload
   now rides in the model-visible text, escaped inside `<tool_data>`;
   regression-tested. Session 3's live direction goal never noticed —
   its model only submitted.
4. Skills `manga-page-writing` 1.2.0 -> 1.3.0 and `manga-thumbnail`
   1.3.0 -> 1.4.0: the bounded sections hard-coded the legacy Phase 1
   3-panel shape; driver instructions arrive as UNTRUSTED user notes, so
   the trusted skill text was unsatisfiable for an 8-beat plan and the
   model (correctly) refused. Both sections are now goal-shape-generic,
   keyed to `constraints.target_page_count` / `target_panel_count`.
5. `AGENTIC_MANGA_PIPELINE_V1` (default OFF) wires the planning lane into
   `generate_project_slice` as a fallback-guarded SHADOW lane
   (`agentic_pipeline_bridge.py`): flag off never imports the module; any
   lane failure is logged and swallowed; requires `use_compiled_context`.
6. Layout-template library (`manga_layout_templates.py`) and craft
   validators (`manga_craft_validation.py`) are NEW repo-native code
   promoted from the `docs/research/layout-templates` spike — the donor has
   no equivalent. Templates are data in ADR-009 node types; the ported
   compiler stays the only geometry authority.

Known rough edge from the live thumbnail goal: `validate_layout_draft`
responses now reach the model in full (normalized plan + compiled layout +
preview SVG), which drove the thumbnail goal to ~158k input tokens
($0.13). Trimming the model-visible portion to issues + normalized plan is
a named Session 5 task.

## Session 5 addendum (2026-08-09): model-visible projection, craft gate, failed-run traces, ModelPolicy modes

Extends this ADR for the Session 5 carry-fixes and Goal B. Boundary edits:

1. `tool-adapter.ts` (extends the Session 4 edit): the model-visible
   `<tool_data>` text is now a per-tool PROJECTION of the broker `data`
   payload (`MODEL_VISIBLE_DATA_KEYS`). For `validate_layout_draft` the
   model sees only `passed`, `compiler_hash`, `preview_hash`, `issues`,
   and `normalized_page_plan`; `compiled_layout` and `preview_svg` stay in
   the tool-result `details` and the broker HTTP response for the control
   plane. Fix for the measured 158k-token thumbnail input (Session 4
   handoff). Tools without a projection entry are unchanged.
   Regression-tested in `test/tool-adapter.test.ts`.
2. Craft warn-vs-block gate (issue #5, live-proven defect class): the six
   Session 4 craft rules now ride the live loop with a per-rule policy
   (`CRAFT_RULE_POLICY` in `manga_craft_validation.py`, validator version
   bumped to `manga-craft-validator.v2`). Only
   `RTL_READING_FLOW_INCOHERENT` blocks (escalated to error severity); the
   other five stay warnings. Boundary edits to the PORTED
   `page_domain_tools._validate_layout_draft` (craft issues appended to the
   verdict) and `manga_page_planning.submit_thumbnail_set` (craft issues on
   the acceptance report; artifact `validation_report` issues now carry
   `severity`). Consequence: a thumbnail set like Session 4's accepted WMC
   set is now REJECTED — regression fixture frozen from the live artifact at
   `backend/tests/fixtures/wmc_session4_rtl_defect_page_plan.json`
   (`test_craft_gate_acceptance_v2.py`); the Session 4 accepted artifacts in
   Mongo remain untouched evidence. Ported donor suites unchanged and green
   (their fixture pages are vertical stacks, outside the RTL row lint).
3. Durable failed-run receipts (step 0.3 — closes the "failed runs persist
   NOTHING" gap that made Session 4's failed-run costs estimates, and the
   issue #8 traces checkbox): `pi-runtime.ts` snapshots the measured session
   stats on EVERY exit path and failures throw `AgentRuntimeRunError`
   carrying the trace; the worker registry/HTTP 422 body exposes it as
   `failure_trace`; the Python `AgentWorkerError` now parses failure bodies
   and carries state/error/trace; both drivers (`manga_director.py`,
   `manga_page_planner.py`) persist failures durably — stage row marked
   `failed` with `error_code`/`error_detail`, the measured `trace` (tokens,
   cost, latency, tool_calls, session id), and an appended
   `failure_history` receipt that survives retries. Successful runs now
   store their full trace (incl. `tool_calls`) on the stage row too. NEW
   StageRunDoc fields `trace` + `failure_history` (additive). Retry
   semantics defined: a failed stage re-arms with `attempt += 1` (receipts
   stay attributable); failed runs are re-extendable. Network-class
   failures persist with `trace=None`. Tests:
   `test_failed_run_receipts_v2.py` (5), client failure-evidence tests (2),
   worker `failure_trace` test (1).
4. ModelPolicy speed/quality modes (Goal B, issue #3, owner policy
   2026-08-08): NEW `app/services/model_policy.py` — mode `speed` =
   MiniMax-M2.7-highspeed, mode `quality` = MiniMax-M3, DEFAULT quality.
   Per-purpose defaults are CONFIG, not code (`Settings.agent_model_mode_*`,
   env-overridable): direction=quality, page-writing/thumbnail=speed (the
   Session 4 bake-off confirmation); vision (`manga_vision_qa`) is LOCKED
   to M3 in code — M3 is the only vision model, a speed override is refused
   loudly. Both drivers resolve their required model through the policy;
   the constructor `required_model` stays the explicit A/B hatch. Receipts
   PROVE the mode: `ModelReceipt` gains optional `model_mode` +
   `model_mode_source` (additive contract change; schemas + generated TS
   regenerated), and the mode is always derivable from the model id.
   Constraint documented: the worker still binds ONE model per process
   (AGENT_PROVIDER/AGENT_MODEL), so a mixed-mode pipeline needs per-mode
   worker instances — the receipt gates fail loud on any mismatch.
5. Lane-C page-art stage (Session 5 main goal; issue #12 verdict wired into
   #5/#7): NEW control-plane modules `manga_page_art.py` (pure mechanics),
   `manga_page_art_stage.py` (durable driver), `manga_vision_qa.py` (M3
   adapter). Decisions on record: (a) the per-page rendering mode is CODE —
   B for splash/spread pages, A when every panel holds and none is action,
   C otherwise (interpretation of the findings' mix; #12 non-goal honored);
   (b) the deterministic boundary gate is a BORDER-ADHERENCE score sampled
   from compiled polygons — deliberately NOT Layout-IoU, which is issue
   #10 / Session 6; (c) `page_art`, `composed_page`, and `provider_receipt`
   artifacts are ArtifactDoc rows with schema-version STRINGS
   (`page-art.v1`, `composed-page.v1`, `provider-receipt.v1`), not
   registry contract models yet — promotion to `packages/contracts` happens
   with the reader-v2 consumer (Session 6); (d) a `provider_receipt` row is
   persisted for EVERY provider call — image and vision, success and
   failure, including the text body of no-image refusals; (e) a page whose
   art fails gates or budget ships DSL-only (issue #7: never block a page
   on an image); (f) the OCR gate filters screentone noise by
   dictionary+confidence+word-count; (g) the polygon->mask export deferred
   by the Session 4 template library now exists (`render_panel_masks`,
   the page_art slicing map). The bridge runs the stage after thumbnails
   when composed with a page-art service; its image budget defaults to the
   run's `max_image_cost_usd` (0.0 on planning runs — flag-on spends zero
   image dollars unless explicitly granted).
6. Live-run gate calibration (GATE_POLICY_VERSION `page-art-gates.v2`,
   part of the stage input hash so policy changes never reuse a stage
   gated under the old policy): the first live WMC batch (2 pages x 2
   attempts, all 4 receipted, $0.156) was rejected SOLELY by the vision
   QA's `contains_text` flag while the dictionary OCR gate was clean each
   time — the flag fires on drawn scribble/pseudo-glyph texture (maze-map
   symbols, SFX-like marks). Per the issue #12 flowchart the OCR gate is
   the text authority; `contains_text` is now ADVISORY (recorded as
   `vision_text_advisory`), vision still rejects on panel-count mismatch
   and `overall_ok=false`. Rejected attempts now persist to the evidence
   dir (the first batch's rejected art was lost — fixed). Under v2 both
   pages ACCEPTED on attempt 1 ($0.078); evidence incl. accepted art in
   `docs/evidence/session5-page-art/`.

## Session 6 addendum (2026-08-09): content gate, composition/QA/eval machinery, M3 tool-frame wall

Extends this ADR for Session 6. Boundary edits and decisions:

1. **Content-quality gate, two tiers by design**
   (`manga_content_validation.py`): the ported
   `MangaPagePlanningService.submit_page_script_set` gates EVERY
   submission path (STORY_BEAT_TOO_THIN and SET_TEXT_ELEMENTS_MISSING
   block; page-level text gaps warn), while the agent seam
   (`MangaPlanningToolService._submit_page_script_set`) escalates
   PAGE_TEXT_ELEMENTS_MISSING to block. The split exists because the
   donor's verbatim phase1 fixtures (action page, zero text elements)
   must stay byte-identical-green under the ADR-010/012 port rule, while
   a sealed model must letter every page (narration needs no speaker).
   Accepted script artifacts now carry `page-script-validator.v2` reports
   with recorded content warnings.
2. **Model-visible 422 texts are class-summarized digests**
   (`_pydantic_error_digest`, `content_gate_detail`): the broker bounds
   the model-visible error to `message.slice(0, 1000)`
   (domain-tool-broker.ts), so raw multi-error pydantic dumps truncate
   into noise — live-measured: page-writing attempts saw 3 of 12 errors.
   Digests group by error class and list every offending path.
3. **M3 anthropic-lane tool-frame transport mangling is normalized at the
   submit tools** (`_unwrap_item_wrappers`): live-measured shapes —
   arrays arrive `{"item": [...]}`; single-element arrays `{"item":
   {object}}`; empty arrays `""`/`{}`. Unwrapping is mechanical and
   lossless (no contract field is named `item`); it also explains why the
   donor's live M3 direction submissions only ever landed through the
   assistant-text fallback (Session 3 observation above). A FOURTH shape
   (all top-level fields dropped, attempt 10) is unexplored — planning
   spend stopped at the pre-committed budget line; full ledger in
   `docs/evidence/session6-fresh-planning/`.
4. **Planning per-turn output budget 8k -> 24k**
   (`_planning_budget`): the donor constant truncated a reasoning-on M3
   page-writing emission at exactly 8,178 output tokens (two live
   attempts, zero parseable submissions). The Director goal already ran
   at 16k; a fully-authored two-page script is a ~10-12k-token JSON
   before reasoning overhead.
5. **Latest-succeeded stage selection** in `_accepted_planning_output`
   (planner) and `_accepted_stage_output` (page-art stage), plus explicit
   `thumbnail_artifact_id` lineage selection on `run_page_art_stage`: a
   re-planning pass stacks a second succeeded stage of the same name on
   one run; first-found would silently rebuild from the defective S4 set.
6. **Composition versioning is stage-split on purpose**: the paid
   page-art stage's input hash NEVER includes COMPOSITION_VERSION; the
   compose-only `manga_page_compose` stage re-keys on it and re-letters
   accepted art at zero image cost. `supersedes` is populated on both
   page_art and composed_page regeneration (ADR-009 lineage).
   GATE_POLICY_VERSION v3 adds the empty-balloon reject + durable
   `qa_report` rows per gated attempt.
7. **Contract promotion** (`page_art.py` registry models): shapes mirror
   the persisting code; post-S5 fields are OPTIONAL because accepted S5
   rows are immutable evidence — all live rows validate. Schema JSONs +
   generated TS + fixtures + manifest moved in ONE commit (the ported
   fixtures test asserts manifest set == registry set).
8. **Reader v2 is a read-only additive seam** (`manga_v2_reader.py`):
   latest-per-page supersedes-aware composed rows + compiled geometry;
   media serving is allowlisted to the v2 lane's REPO-ROOT storage tree
   (`<repo>/storage` — distinct from v1's `backend/storage`; two trees,
   one per lane). The frontend route is flag-gated default-OFF; legacy
   readers untouched (ADR-009 compatibility).
9. **Eval harness semantics** (`manga_eval.py`): layout-iou.v1 is a
   seeded flood-fill metric and a documented LOWER BOUND on ink-dense
   art (bracket with border adherence); judge rubrics are versioned
   (`m3-judge-rubrics.v1`) with receipts persisted per call; Magi is
   deferred pending owner review of the checkpoint download +
   `trust_remote_code` under the standing egress posture.

## Session 7 addendum (2026-08-09): the tool-frame wall falls — landing instruments, transport-empty normalization, whole-book chain

Extends this ADR for Session 7. Boundary edits and decisions:

1. **Seam raw-arguments dump** (`_dump_raw_submission`,
   `AGENT_SEAM_RAW_DUMP_DIR`, default off): every submit-seam invocation
   persists its PRE-normalization arguments verbatim before unwrap or
   validation — success and failure — and can never break the submission.
   This instrument produced every diagnosis below; `failure_history`
   carries bounded traces only and Pi sessions are in-memory, so the dump
   is the ONLY source of arrived-shape evidence.
2. **The S6 "fourth shape" is frame TRUNCATION**, not a wrapper variant:
   attempt 13's dump shows page 2 dropped entirely and panel 3 gutted to
   `{panel_id}` while sibling panels carried the model's nulls intact. A
   ~12k-token tool call can lose its tail in transit; the S6 attempt-10
   "all top-level fields dropped" was the same cut landing earlier. Not
   seam-fixable — dodged by the armed text lane (below).
3. **The assistant-text fallback lane is now ARMED in the skills**
   (manga-page-writing 1.5.x): the runtime's
   `extractAssistantJsonCandidate` lane existed since S3 but S6 attempts
   never used it — the model reported blockers instead. The skill now
   names the transport-artifact signature (missing/list_type/int_parsing/
   string_too_short on fields the model emitted) and instructs ONE bare
   JSON object as the final message after a single transport-shaped
   rejection. Live-proven in attempt 11 (the fallback frame arrived
   UNMANGLED — pages as a real list).
4. **Transport-empty normalization extends to optional scalars**
   (`_OPTIONAL_NULLABLE_FIELD_NAMES`): the frame renders intended-omitted
   optionals as `{}`/`""` (attempt 11: `speaker_ref` on narration;
   attempt 13: SourceRef `quote`/`start_offset`/`end_offset` — the model
   emitted CORRECT nulls, the frame emptied them). `""`/`{}` -> None is
   lossless for names that are `X | None` in the contracts; a dialogue
   element losing its speaker still fails the clear contract rule. The
   landing attempt (14) validated on the FIRST tool-frame submission with
   this in place.
5. **The direction seam gets the same treatment** (golden-run live
   diagnosis): `submit_manga_plan` failed with 17 `list_type` errors —
   every empty list arrived as `""` — on the one submit seam without the
   normalizer (this ADR's S3 observation that donor M3 direction only
   landed via the text fallback was the same artifact all along).
   `_LIST_FIELD_NAMES` now carries the MangaPlan list fields; the digest
   and dump ride along (lazy import breaks the module cycle).
6. **Skill wording must match the deterministic gates byte-for-byte**:
   attempt 12 failed ONLY because the S6 "non-empty quote" instruction
   contradicts the verbatim-lineage hash compare on plans whose refs
   carry null quotes — the model dutifully filled in real book quotes and
   every panel was rejected as citing source outside the plan. Offline
   replay with verbatim refs passed the ENTIRE pipeline, proving the
   wording was the last wall. The gate is donor logic and stays; the
   skill (1.5.2) now demands byte-for-byte copies with nulls preserved.
7. **Thumbnail axis orientation is stated, not assumed** (skill 1.5.0 +
   prompt v5): the first 4-panel-per-page goal exposed that nothing told
   the model `children[0]` is the LEFTMOST/TOPMOST (compiler geometry).
   It placed rows correctly but reversed the reading edges. Edges chain
   in SOURCE order; RTL lives in PLACEMENT. Landed attempt 2.
8. **PAGE_ART_VERSION v2 — spatial anchors — and the lane-C binding
   finding**: the first fully-authored regen showed the image model
   painting the RIGHT story content in the WRONG panels (briefs in RTL
   read order bound left-to-right). v2 briefs carry bbox-derived position
   phrases; the follow-up batch STILL rejected 4/4 — per-panel content
   binding in one-shot full-page generation is now a twice-measured
   limitation and the open S8 problem. The stage degraded exactly as
   designed: composed `dsl_only` pages carry the authored lettering.
9. **Eval closes the loop on the two-channel thesis**: S6 measured art
   without text (readability 4-5, fidelity 1/5); S7 measures text without
   art (fidelity STILL 1/5 at 2/37 claims, readability 2-3, the
   scorecard-diff fold reporting the regression honestly). Fidelity needs
   BOTH channels bound to the same panels; neither alone buys anything.
10. **Whole-book chain (issue #13 cut)**: deterministic ScopeChainPlanner
    (heading markers + token floor skips, whole-chapter packing under a
    token budget, unit-boundary splits) + WholeBookChainExecutor over
    injected stage runners with a HARD cost preflight, per-scope
    eval_scorecard persistence, and rolling canon via plan-derived
    MemoryDeltas guarded by the plan's compiled memory_version (merge
    exactly once; resume can never double-spend or double-merge).

## Session 8 addendum (2026-08-09): wall-4 truth, seam symmetry, the binding bake-off verdict

Extends this ADR for Session 8 (the final roadmap session). Boundary
edits and decisions:

1. **The wall-4 hypothesis was DISPROVEN by its own instrument**: every
   failing golden-chain thumbnail call was scoped to the pack that lists
   the accepted script (compiled 00:55:04.743Z, AFTER the script) — no
   compile-ordering bug exists. The dumps identified the real walls:
   omitted `page_index` (submit 1), an embedded `page_script` reaching
   the deterministic gate (submit 2, 3x TEXT_REGION_OUT_OF_PANEL), and a
   model-invented truncated artifact id (attempt 2 — the 403 was correct
   authorization behavior).
2. **The hydration seam infers a missing page_index deterministically**
   (`_infer_page_index`: page_plan_id trailing digits, then list
   position). A wrong inference cannot land silently — the hydrated plan
   fails panel-id validation loudly. `_coerce_int` rejects negatives
   (Python negative indexing would silently select from the END of the
   accepted set).
3. **Model-facing seams must accept the shape the instructions mandate**
   (resume-1 live lesson): prompt v6 demands a top-level `page_index`
   INSIDE each plan; the submit seam popped it but `validate_layout_draft`
   did not — every correctly-shaped draft failed `extra_forbidden` on all
   8 iterations. The validate seam now mirrors the submit seam (argument
   wins, in-plan is fallback, disagreement logged). Rule: when a prompt
   changes the mandated shape, EVERY seam that shape passes through is
   part of the change.
4. **The 2-panel remap in `_normalize_page_plan` is axis-aware**: the
   unconditional [later, earlier] child rebinding is only correct for
   x-splits; on a y-split it swapped top/bottom panels and pushed every
   authored text region out of its panel — manufacturing wall 2 from a
   correct submission.
5. **The golden chain's remaining blocker is CAPABILITY, not seams**:
   resume 2's 8 drafts show speed-lane schema flailing (gutter
   constraints, a forbidden `page_turn_panel_id`, one draft dropping
   `canvas`) with draft 6 one key from valid before regressing. The
   receipted owner option is `AGENT_MODEL_MODE_THUMBNAIL=quality`; no
   silent default switch was made.
6. **Failed-attempt spend decrements the chain budget** (S7 deviation 6):
   a resume-safe before/after delta over `failure_history` receipts —
   live-proven charging $0.117046 on its first execution. Prior-invocation
   failures are never re-charged (pinned by test).
7. **Skill versions in receipts are now honest**: the worker served a
   hardcoded "1.0.0" while SKILL.md frontmatter advanced; the served
   version now parses frontmatter (proven live in the resume-1 failure
   trace: `manga-thumbnail 1.6.0`).
8. **The bake-off verdict (issues #12/#7/#10)**: panel binding is solved
   by CODE, not conditioning. One-shot full-page generation failed its
   THIRD conditioning version (12 rejected attempts total across v1
   briefs / v2 spatial anchors / v3-experimental in-skeleton content
   tags; binding 0.25–0.5; guide-tag text leaked into art). Per-panel
   generation binds trivially (probe images are exactly their briefs) at
   FLAT ~$0.0389/panel (4x/page — open owner cost decision).
   `paste_panel_art` (cover-fit + polygon mask + re-inked frame) makes
   placement deterministic: candidate B (ONE money-shot panel + DSL base
   + authored lettering) scored binding 1.0/1.0 at $0.039/page and is the
   new default standard-page lane in the #12 matrix. Stage-service wiring
   of that default is deliberately NOT done here — promotion re-keys the
   paid stage and belongs after owner review.
9. **Referee prompts are versioned evidence too**: the first binding
   referee compared LETTERED DIALOGUE to brief wording and failed pages
   whose drawn scene matched exactly (its own "seen" text proved it).
   The scene-only prompt is the fix; both eval runs are receipted and the
   defective scorecard is superseded, not deleted. Measured variance:
   single-panel binding verdicts move ±1 category between runs on
   near-identical images — single-run deltas are noise, not signal.
10. **Composition v3** (issue #6 fold): a compositor-wide type floor
    (18px on the 832x1248 class, binds LAST) and OPT-IN story-beat
    captions for artless panels — an authored-content channel, not
    invented text (the S7/S8 judge's measured complaint was "three
    panels are essentially blank"). Version bump re-keys compose-only
    stages at $0 image; isolation measurement: page-0 readability 2→3,
    fidelity claims flat.
