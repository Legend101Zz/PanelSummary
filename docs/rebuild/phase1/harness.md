# Phase 1: the Pi-based MiniMax harness (agentic lane)

Auditor scope: `packages/agent-runtime`, `apps/agent-worker` (plus its skills), `packages/contracts`, `packages/fixtures`, and the backend code that drives the harness. That backend code is the broker router and tools, the director, page-writing and thumbnail drivers, `whole_book.py`, the layout compiler and validators, the page-art stage, `model_policy.py`, the receipts, the scopes API and `manga_v2_reader.py`. I also read `start.sh` and `check.sh`.

Branch `product/harness-manga` (HEAD `a5e4fbc`, based on `47ea74d`). The tree was clean before and after the audit. No tracked file was changed.

Evidence labels:
- **[Code]**: resolved by reading the code.
- **[Run]**: I ran it in this audit.
- **[Doc]**: a claim in a doc or handoff that I did not verify.
- **[Inf]**: my inference.

Scratch evidence is in `/private/tmp/claude-501/-Users-comreton-Desktop/3b1640fe-8ce0-4ed7-b544-0b35ca3ba64d/scratchpad/phase1/harness/`. That folder holds the smoke scripts, `live_result_*.json`, the raw seam dumps and the worker logs.

---

## 0. Verdict

**Yes. The harness can be the single production generation path. It works against MiniMax today.** [Run]

I ran real goals through the whole chain: the Python driver, the HTTP worker, a Pi session, MiniMax-M3, the HTTP broker (real router and service), the validators and the acceptance step with receipts. On a 3-unit fixture book, `MANGA_DIRECTION`, `MANGA_PAGE_WRITING` and `MANGA_THUMBNAIL` were each accepted on the first submission. The full chain took about 292 s of model time and cost about $0.047 at catalog prices.

**It is not a product yet.** Four blockers stand between it and "click Generate, read the book":

1. **The model never sees why a submission was rejected.** [Code+Run]
   - The broker returns `{"detail":{"code","message"}}` (`backend/app/api/routes/internal_tools.py:83-86`).
   - The worker's broker client only parses `{"error":{...}}` (`apps/agent-worker/src/tools/domain-tool-broker.ts:57-73`).
   - So every 422 or 403 reaches the model as the bare text `Domain tool submit_page_script_set failed with HTTP 422`. I observed this by feeding the router's real 422 body through the real client.
   - All of the careful error digests (`_pydantic_error_digest`, `content_gate_detail`) are therefore invisible to the model.
   - [Inf] This most likely explains the 10/10 failed page-writing attempts in the Session 6 ledger (submit, fail, submit, fail, report blocker) and the "speed model resubmits an identical payload" behaviour. The handoff describes that behaviour as happening "with full error visibility". The code contradicts that.
2. **Nothing in the product calls the harness.** [Code]
   - The only callers are CLI scripts (`backend/scripts/whole_book_wmc_s8.py`, `live_*.py`) and a shadow lane in v1 that is off by default (`generation_service.py:653-667` → `agentic_pipeline_bridge.py`).
   - That shadow lane is wired to one worker URL, defaulting to `:8788`, the speed/M2.7 worker (`agentic_pipeline_bridge.py:53-56`). The director's default receipt gate requires M3 (`manga_director.py:595-599`), so the default composition cannot succeed.
   - No HTTP route starts, polls or cancels a harness run. The frontend only reads `/v2/pages` (`frontend/lib/manga-v2-lane.ts:84`).
3. **The reader cannot show a whole book.** [Code+Run]
   - Every scope is its own `run_dir_*` run with `page_index` 0..1.
   - `latest_accepted_per_page` merges every run of the project by `page_index` and keeps the newest (`manga_v2_reader.py:50-57, 99-111`).
   - I ran it on 3 scope runs × 2 pages: it served 2 pages, both from the last scope.
4. **The page-art stage calls an image model.** [Code]
   - It uses `google/gemini-2.5-flash-image` via OpenRouter (`manga_page_art.py:56`, `manga_page_art_stage.py:573-690`). That violates the owner's no-image-model rule.
   - The deterministic fallback (DSL-only compose) produces PIL raster pages, not a planned SVG system.

**Minimal path forward.** Keep the sealed Pi runtime, the worker, the broker authorization, the ContextPack, the contracts and the deterministic validators and layout compiler. Then make these changes:
- Fix the error-shape mismatch (one line) and add a cross-language contract test.
- Collapse to one model (M3) and one worker.
- Collapse the three agent sessions per two pages into one page-production goal with the narrow tools listed in §11.
- Add a `render_preview` tool that returns a PNG for M3 to critique. I proved this works (§9).
- Add a Generate job with status and cancel, give pages book-level ordering, and delete the image lane plus the dead goals and skills.

---

## 1. What I ran

| Command | Result |
|---|---|
| `pnpm test` in `packages/agent-runtime` (vitest 4.0.16) | **5 files, 22 tests passed** [Run] |
| `pnpm test` in `apps/agent-worker` | **4 files, 16 tests passed** [Run] |
| `pnpm test` in `packages/contracts` (vitest 3.2.4) | **1 file, 47 tests passed** [Run] |
| `npx tsc --noEmit` in agent-runtime / agent-worker; `tsc -p packages/contracts --noEmit` | **exit 0 / 0 / 0** [Run] |
| `node packages/contracts/scripts/generate.mjs --check` | "Generated TypeScript contracts are current (35 contracts)", exit 0 [Run] |
| 17 harness-related backend pytest files (see the list in §13), with `MONGODB_URL` pointed at the disposable :27018 | **167 passed**, 65 deprecation warnings, 7.3 s [Run] |
| Router 422 body → the worker's `HttpDomainToolBroker` | Model-visible text is `Domain tool submit_page_script_set failed with HTTP 422`, with no code or message [Run] |
| Live Pi single-call smokes (M3 and M2.7-hs; thinking default vs off; vision blocked vs unblocked; image returned by a tool; tool-argument frame shapes) | See §8 and §9 [Run] |
| Live end-to-end runs (worker on 127.0.0.1:18789, real broker on :18010, in-memory repositories, no Mongo) | 3 runs; all goals accepted; about $0.10 total at catalog prices for every live call in this audit [Run] |

Nothing needed reinstalling; `node_modules` was already present.

Two tests passing does not mean the two sides agree:
- The backend test asserts `response.json()["detail"]["code"]` (`backend/tests/test_agent_worker_client_v2.py:227`).
- The worker test feeds `{"error":{...}}` (`apps/agent-worker/test/domain-tool-broker.test.ts:12-19`).

Both are green, and together they show the mismatch.

---

## 2. The protocol, end to end [Code, confirmed live]

### 2.1 The driver (Python control plane)

`MangaDirectorService.run_direction_goal` (`backend/app/services/manga_director.py:149-293`):
1. Loads the frozen `ScopeManifestDoc`.
2. Compiles a purpose-scoped `ContextPack` with `ContextCompiler` (80k input-token budget, `:105, :184-192`).
3. Creates or reuses `GenerationRunDoc run_dir_<hash>` and `StageRunDoc` (`:299-382`), and persists the pack as an accepted `context_pack` artifact (`:445-479`).
4. Builds an `AgentGoal` (`:481-528`) with an allowlist and budget:
   - steps 8;
   - tool calls = max(4, steps×2) = 16;
   - max_input_tokens 80k;
   - max_output_tokens 16k;
   - repair 1;
   - $0.50 (`:94-106`).

The page-writing and thumbnail drivers (`manga_page_planner.py`) work the same way:
- They extend the same run.
- `TARGET_PAGE_COUNT = 2` (`:122`).
- The tool lists are `PAGE_WRITING_TOOLS` and `THUMBNAIL_TOOLS` (`:127-136`).
- The budget is steps ≤8, tool calls ≤10, output 24k, repair 1 (`:1084-1098`).

### 2.2 Backend → worker HTTP

`HttpAgentWorkerClient.run` (`backend/app/services/agent_worker.py:74-131`):
- Request: `POST {AGENT_WORKER_URL}/internal/v1/agent-runs`, headers `authorization: Bearer $AGENT_WORKER_TOKEN` and `x-correlation-id: goal_id`, body `{goal, context, instructions?}`.
- Timeout 900 s. Response cap 2 MB.
- It requires HTTP 200, `state == "SUCCEEDED"`, a dict `result.candidate` and a dict `result.trace`.
- Otherwise it raises `AgentWorkerError` carrying `failure_trace` (`:134-164`).
- The call is synchronous only. The client has no async or cancel method.

### 2.3 The worker (Fastify 5.8.5)

`apps/agent-worker/src/server.ts:45-155`:
- **Auth hook** (`security/auth.ts:50-95`): accepts either the static bearer token (constant-time compare) or an HMAC token `v1.<ts>.<nonce>.<sig>`.
- **Order of checks:** body schema (`goal`, `context`, `instructions ≤ 20k chars`), then Ajv `isAgentGoal`/`isContextPack` from `@scrollstack/contracts`, then `RunRegistry.start`.
  - The registry uses `run_id = goal_id` and is idempotent for RUNNING or SUCCEEDED runs (`run-registry.ts:72-74`).
  - The concurrency cap is `AGENT_MAX_CONCURRENCY=2` and returns 429 when reached.
- **Response:** 200 on success or 422 on failure, with `error` and `failure_trace`. `Prefer: respond-async` returns 202 instead.
- **Other routes:** `GET /internal/v1/agent-runs/:id`, `POST …/:id/cancel`, `/healthz`, `/readyz`. `/readyz` is 503 unless the model resolves and `process.env[AGENT_MODEL_API_KEY_ENV]` is set (`index.ts:25`).

### 2.4 The Pi session

`PiAgentRuntime.run` (`packages/agent-runtime/src/pi-runtime.ts:128-303`):
1. `assertGoalPolicy` (`policies.ts:98-135`):
   - the goal type must be one of the 6 approved types;
   - requested tools must be a subset of the policy's tools;
   - the required submit tool must be present;
   - the budget must be within bounds (repair ≤ 2).
2. The skill bundle must match the policy's skill name.
3. Settings: `SettingsManager.inMemory` with `blockImages: true`, `retry.maxRetries: 2`, and no thinking level set, so Pi's default `"medium"` applies (`:141-148`; Pi `core/defaults.js`).
4. A sealed `DefaultResourceLoader`: no extensions, skills, prompt templates, themes or context files. The system prompt is `BASE_SYSTEM_PROMPT` plus `<trusted_production_skill>` (`:29-38, :92-108, :149-151`).
5. `createAgentSession` (`:176-194`):
   - `noTools:"builtin"`, `tools = goal.allowed_tools`, and the builtins bash/read/write/edit/grep/find/ls excluded;
   - custom tools come from the adapter;
   - `SessionManager.inMemory()`, so no transcript is persisted anywhere;
   - `model.maxTokens = min(catalog maxTokens, goal.max_output_tokens)`.
6. The user prompt is `<typed_agent_goal>` + `<untrusted_context_pack>` (the whole ContextPack JSON) + `<untrusted_user_notes>`, with `<` escaped (`:85-90`).
7. Budget hooks (`:213-229`):
   - `turn_start` counts steps and aborts when `> max_steps`;
   - `turn_end` aborts when catalog cost exceeds `max_cost_usd`;
   - an abort signal cancels the session.
8. After the session goes idle with no accepted candidate, the "text lane" fallback runs (`:253-279`, `candidate-fallback.ts:32-53`). It takes the last assistant JSON object (with `<think>` stripped) and submits it through the same broker.
9. The trace is snapshotted into `AgentRunTrace` (`types.ts:75-97`). On failure, `AgentRuntimeRunError` carries the trace (`:291-298`).

### 2.5 Tools

`createBrokeredTools` (`tool-adapter.ts:188-258`):
- Each allowed name gets `defineTool` with a TypeBox schema. Submit payloads are loose `Record<string, Unknown>` (`:11-95`).
- Execution is sequential.
- A global `maxToolCalls` counter applies, plus a per-submit-tool limit of `maxRepairAttempts+1`. When exceeded, the adapter throws; the model sees the error text.
- The model-visible result is `content + <tool_data>{projected JSON}</tool_data>`.
  - Only `validate_layout_draft` is projected. It keeps `passed`, `compiler_hash`, `preview_hash`, `issues` and `normalized_page_plan` (`:137-158`); this is the fix for the 158k-token geometry echo.
  - `details` keeps the full payload, but Pi never sends `details` to the model.

### 2.6 Worker → broker HTTP

`HttpDomainToolBroker` (`domain-tool-broker.ts:24-85`):
- Request: `POST {DOMAIN_TOOL_BROKER_URL}/internal/v1/agent-tools/{name}`, `Bearer $DOMAIN_TOOL_BROKER_TOKEN`, body `{arguments, scope:{correlation_id, goal_id, run_id, stage_run_id, context_pack_id, project_id}}`.
- Timeout `AGENT_WORKER_TOOL_TIMEOUT_MS` = 20 s. Response cap 256 KB.
- **Defect:** it parses errors only as `error.code/message`.

### 2.7 The broker

- `internal_tools_router` (`internal_tools.py:43-88`) checks the token with `hmac.compare_digest` and maps errors: AuthorizationError → 403, NotFoundError → 404, anything else → 422, all as `HTTPException(detail={code,message})`.
- `MangaDomainToolService` (`page_domain_tools.py:880-905`) dispatches to the director tools (`domain_tools.py:48-423`) or the planning tools (`page_domain_tools.py:272-877`).
- **Every call re-authorizes the scope:**
  - the run exists and belongs to the project;
  - the run is `running` and its `active_stage` matches;
  - the stage is active;
  - the ContextPack is an input of the stage, is accepted, and belongs to this run;
  - the pack's purpose matches;
  - parent artifacts are accepted and their hashes match (`domain_tools.py:80-112`, `page_domain_tools.py:335-389`).

### 2.8 Acceptance and persistence (driver)

The driver:
1. Re-validates the candidate against the canonical Pydantic model.
2. Requires that the broker already stored a candidate artifact with the same content hash.
3. Requires a receipt whose provider and model match `ModelPolicy`.
4. Writes the accepted artifact with a `ModelReceipt`, and `stage.trace = trace` (`manga_director.py:221-293`, `manga_page_planner.py:356-420, 517-…`).

Artifacts one scope produced in the live run [Run]:
- 3 × `context_pack`;
- `manga_plan` (candidate "valid" + accepted);
- `page_script_set` (broker + accepted);
- `thumbnail_set` (broker + accepted);
- `page_layout` ×2, `compiled_layout` ×2, `thumbnail_preview` ×2 (SVG files under `storage/manga-previews/`);
- 1 `validation_report`.

Page art and composition (`manga_page_art_stage.py`) is a separate driver, not an agent goal.

### 2.9 Model and provider config (pinned Pi `@earendil-works/pi-coding-agent@0.80.10`, `pi-ai@0.80.10`)

`resolvePinnedModel` (`pi-runtime.ts:60-71`) uses `ModelRuntime.create({authPath:"/tmp/scrollstack-agent-no-stored-auth.json", modelsPath:null, allowModelNetwork:false})` and reads only the bundled catalog (`pi-ai/dist/providers/minimax.models.js`):

| Model | API | baseUrl | Input | Context | maxTokens | Catalog $ in/out per 1M |
|---|---|---|---|---|---|---|
| MiniMax-M3 | anthropic-messages | https://api.minimax.io/anthropic | text, **image** | 1,000,000 | 128,000 | 0.3 / 1.2 |
| MiniMax-M2.7-highspeed | anthropic-messages | same | text | 204,800 | 131,072 | 0.6 / 2.4 |

- **Auth:** `envApiKeyAuth(["MINIMAX_API_KEY"])` (`pi-ai/dist/providers/minimax.js`).
- **Lanes:** the harness has only the anthropic lane; the pinned provider exposes no OpenAI lane. The OpenAI-compatible lane (`https://api.minimax.io/v1` with `extra_body {reasoning_split, thinking: disabled}`) exists only in v1 `backend/app/llm_client.py:96-145`.
- **Thinking:**
  - Pi sends `thinking:{type:"enabled", budget_tokens}` for the default level "medium" (8,192-token budget).
  - **That budget sits inside `max_tokens`** (`pi-ai/dist/api/simple-options.js adjustMaxTokensForThinking`). The 16k/24k output caps therefore leave only about 8k/16k for the visible JSON. This is a truncation risk [Code].
  - `thinkingLevel:"off"` makes Pi send `thinking:{type:"disabled"}` (`anthropic-messages.js:746-770`).
  - **MiniMax honours it** [Run]: M3 returned no thinking block and no reasoning tokens.
  - The doc claim that disabled thinking is "unreachable through the pinned SDK" (`NEXT_SESSION.md:1087-1091`) is **false** for the SDK. The runtime just never sets `thinkingLevel`.
- **Tool-argument coercion (Pi):** `validateToolArguments` runs TypeBox `Value.Convert` (`pi-ai/dist/utils/validation.js:241-268`). With a typed `Union[String,Null]` schema, `null` arrived as `""` and `Union[Integer,Null]` as `0` [Run §8]. Typed schemas are therefore **not** a safe fix for the payload problem.

---

## 3. Goals

| Goal (worker policy `policies.ts:26-93`) | Backend driver | Tools the goal allows (driver subset) | Output contract | Validators | Budget | Known failure modes, and status today |
|---|---|---|---|---|---|---|
| **MANGA_DIRECTION** (skill `manga-direction` 1.1.0 + 3 references) | `manga_director.py` | `get_source_excerpt`, `get_canon_entity`, `list_relevant_assets`, `submit_manga_plan`, `report_source_conflict`. The worker policy also allows `submit_asset_requests`, which has **no backend implementation**. | `manga-plan.v1` | Seam unwrap, then `MangaPlan` Pydantic, identity == ContextPack, page budget, beats ≤ pages×7, each source_ref's hash and page range inside a pack unit, **all pack units cited**, fact IDs ⊆ canon (`domain_tools.py:215-384`); driver re-validation plus receipt gate | steps 8, tools 16, output 16k, repair 1, $0.50 | **Transport mangling seen live**: `beats` and all nested lists arrived as `{"item":…}`, empty lists as `""`, and `target_page_count`/`memory_version` as strings. The seam normalizer repaired it and the plan was accepted [Run]. Book-specific branches remain for `manga-demo-deterministic.v1` (exactly 5 pages/10 beats) and `manga-edition.v1` (exactly 20 beats) (`domain_tools.py:283-331`). |
| **MANGA_PAGE_WRITING** (skill 1.6.0) | `manga_page_planner.run_page_writing_goal` | `get_manga_canon`, `submit_page_script_set`, `report_page_script_blocker` (policy also allows `get_book_context`) | `page-script-set.v1`, exactly 2 pages and panels = beat count | Unwrap, then `PageScriptSet` Pydantic, **agent content gate** (`AGENT_CONTENT_RULE_POLICY`: real story_beat sentences and ≥1 text element per page), planning-service identity, page and beat counts, **byte-exact source_ref lineage against the plan** (`manga_page_planning.py:63-147, 348-370`), craft rules | steps 8, tools ≤10, output 24k, repair 1 | Empty lists arrived as `""` (18 fields) and were normalized; accepted first try on M3 [Run]. History [Doc]: 8,178-token truncation at the old 8k cap, the M2.7-hs "identical resubmission" pathology, a fourth mangling shape with all top-level fields dropped. The skill hardcodes the `char_kai` narrator (SKILL.md:200-224) and says story_beat is "the image model's brief" (SKILL.md:34). |
| **MANGA_THUMBNAIL** (skill 1.6.0) | `run_thumbnail_goal` | `get_page_script_set`, `validate_layout_draft`, `submit_thumbnail_set`, `report_thumbnail_blocker` | `thumbnail-set.v1` holding `manga-page-plan.v1` layouts | Hydrates `page_script` from the accepted set by `page_index` (inferred from the id or list position when missing), then `MangaPagePlan`, `compile_page_layout`, `validate_page_plan`, craft validation, SVG preview (`page_domain_tools.py:564-756`), persists compiled layout, preview and report | same as page writing | The 158k-token geometry echo is **fixed**: this run used 9.5k input plus 31k cache-read over 2 validate calls [Run]. **The broker overwrites the model's layout for 2-panel pages**: it reassigns panel IDs to split children, rewrites reading edges and forces `reading_direction:"rtl"` (`page_domain_tools.py:782-862`), so layout "authorship" is partly fake. History [Doc]: invented artifact IDs, missing page_index, RTL axis confusion. |
| BOOK_CANON, MANGA_COMPOSITION, REEL_DIRECTION | **none** | `submit_book_canon`, `submit_manga_composition`, `submit_reel_specs`, `get_manga_manifest`, … all fall through to `MangaDirectorToolService` and fail (`domain_tools.py:61-78`) | n/a | n/a | n/a | **Dead** [Code] |
| ARTIFACT_REPAIR | none | n/a | n/a | n/a | n/a | Enum value only (`backend/app/contracts/context.py:22`; excluded by `types.ts:6`) |

Whole-book orchestration (`whole_book.py`):
- `ScopeChainPlanner` is deterministic: it skips front/back matter, applies a 200-token floor and a 10k-token scope budget (`:79-104, :185-…`).
- `WholeBookChainExecutor` runs direction → page writing → thumbnail → page art → eval → memory merge **sequentially per scope**, with a hard cost preflight (`:521-560`).
- Every scope is capped at 2 pages (`SCOPE_TARGET_PAGE_COUNT = 2`, `:77`), so a 30-page book needs about 15 scopes × 3 agent sessions.
- The only live golden chain on record (Session 8) stopped at the scope-0 thumbnail with `Agent worker returned HTTP 422` after $0.094 (`docs/evidence/session8-golden-run/chain_outcome.json`) [Doc].

---

## 4. Credentials (names only)

- **Key source.** `MINIMAX_API_KEY` comes from `backend/.env`, extracted by `start.sh:180` with grep/cut and exported only into the two worker processes' environments (`start.sh:227-236`).
  - The worker requires `AGENT_MODEL_API_KEY_ENV=MINIMAX_API_KEY` when `AGENT_PROVIDER=minimax` (`config.ts:56-58`); the default name is `OPENAI_API_KEY` (`config.ts:52`, README drift).
  - Pi reads the env var itself (`envApiKeyAuth`).
  - No keychain is used. `ModelRuntime`'s `authPath` is a stub file (`/tmp/scrollstack-agent-no-stored-auth.json`, 2 bytes `{}`, 0 key occurrences) [Run].
- **Service tokens.** `AGENT_WORKER_TOKEN` and `DOMAIN_TOOL_BROKER_TOKEN` must each be at least 32 characters and must differ (`config.ts:27-33, 60-64`). `start.sh:166-178` generates them into `.dev/agent-tokens.env`.
- **Default token on the main backend.** The `:8000` backend is started **without** `DOMAIN_TOOL_BROKER_TOKEN` (`start.sh:187`), so its internal tool router falls back to the literal `local-domain-tool-token-change-me` (`main.py:91-93`) and listens on `0.0.0.0`. The run/stage/pack authorization still applies, but the token is a known default reachable from the LAN [Code].
- **Frontend.** No reference to `MINIMAX_API_KEY` or `OPENROUTER_API_KEY` [Code, grep].
  - v1 still accepts a client-sent `options` dict that `strict_json_routing.py:12-15` reads as `minimax_api_key`. That is outside the harness but is a key-injection surface.
- **Logs.** Across 3 live runs: 0 key occurrences in the worker log, driver log and results; 0 in the existing `.dev/logs/*.log` files [Run, counted without printing].
  - Fastify logs request lines and errors, not bodies or headers.
  - Pi sessions are in memory; nothing is written to disk except the opt-in backend raw dumps (`AGENT_SEAM_RAW_DUMP_DIR`), which contain model arguments but no credentials.

---

## 5. Cancellation, limits, receipts

**Limits enforced** [Code]:
- max_steps (turn counter, then abort), `pi-runtime.ts:214-219`.
- max_cost_usd (catalog-priced estimate, checked at turn_end and again at the end), `:220-223, :284-287`.
- max_tool_calls and per-submit repair limits (the adapter throws), `tool-adapter.ts:199-212`.
- Per-request `max_tokens` = min(catalog, max_output_tokens) **including** the thinking budget.
- Worker run timeout 15 min (`config.ts:77`, `run-registry.ts:96-100`); tool timeout 20 s; backend HTTP timeout 900 s; concurrency 2 per worker; request 2 MB; broker response 256 KB; worker response 2 MB.

**Limits not enforced:**
- `max_input_tokens` is never checked at runtime. Only its lower bound is validated (`policies.ts:125`); the only real control is the ContextCompiler budget.
- Nothing bounds the total conversation growth apart from Pi auto-compaction, which is counted but not controlled.

**Cancellation** [Code]:
- The worker supports it: `POST /internal/v1/agent-runs/:id/cancel` → `AbortController` → `session.abort()` (`run-registry.ts:148-157`, `pi-runtime.ts:337-339`).
- **The backend never calls it.** There is no cancel method, no async mode, and a dropped backend request does not abort the worker run. Spend continues until the step, cost or 15-minute limit.

**Receipts:**
- `ModelReceipt` (`backend/app/contracts/artifacts.py:61-79`) records provider, model, model_mode and source, purpose, prompt_version, skill_hashes, input artifact IDs, input/output tokens, **cost_usd (Pi catalog estimate, not billed)**, latency_ms and attempt. It is embedded in the accepted artifact.
- `stage.trace` holds the full `AgentRunTrace`: tool_calls with states, tokens including cache, cost, latency, session_id and compaction count.
- Failed runs append `{attempt, error_code, trace}` to `stage.failure_history` (`manga_director.py:384-425`). `WholeBookChainExecutor` charges that failed spend back to the budget (`whole_book.py:588-593, 636-657`).
- `ProviderReceipt` (`contracts/page_art.py:67-83`) covers only the image and vision calls in page art.

**Receipt gaps:**
1. **Driver-side acceptance failures are not recorded.** If the worker succeeds but `_validate_candidate`, the broker-candidate check or `_build_receipt` raises `ArtifactValidationError`, `_fail_stage` is **not** called; it runs only for `AgentWorkerError` (`manga_director.py:217-239`, `manga_page_planner.py:351-356, 512-517`). The stage stays `running`, no receipt or trace is saved (the spend is lost), and a rerun reuses the same `goal_id`, so the worker's idempotent registry replays the same bad result.
2. The catalog cost is wrong for M2.7-hs: MiniMax reports its input as `cacheWrite` (my smoke: `input:0, cacheWrite:58`) [Run].
3. v1 vision receipts price M3 at gpt-4o-mini rates (`llm_client.py:123-131`).
4. No transcript is persisted, so what the model actually saw cannot be audited afterwards.

---

## 6. Useful vs over-engineered vs dead (for the single production path)

**Keep: the core is sound.**
- Sealed Pi session construction (`pi-runtime.ts:92-194`): pinned catalog, no builtins, no ambient files or skills, the untrusted-data tagging.
- The broker authorization model (active run and stage, pack lineage).
- The ContextCompiler and ContextPack.
- The candidate→accepted artifact pattern with content hashes.
- `failure_trace` receipts.
- The contracts package (35 schemas, fixtures and a generation check).
- The deterministic layout compiler, `validate_page_plan`, the content and craft gates, and `render_thumbnail_svg`.
- `ScopeChainPlanner`'s skip heuristics.
- The idempotent resume by stage key.

**Narrow domain tools the new path needs, and where they come from:**

| Needed tool | Source today | State |
|---|---|---|
| Source retrieval | `get_source_excerpt` (bounded, scope-authorized, `domain_tools.py:114-156`); `get_book_context` | Ready. The whole ContextPack is also already inlined in the prompt. |
| Submit candidate | `submit_manga_plan`, `submit_page_script_set` | Ready once the error visibility is fixed. Prefer a JSON-string argument (§8). |
| Validate (dry run) | `validate_layout_draft` pattern (compile + validators + preview, no provider) | Generalize it to a `validate_page_draft` that covers script, layout and lettering fit. |
| Render preview | `render_thumbnail_svg` exists; there is no PNG rasterizer | **New.** SVG→PNG, returned as an image in the tool result. Reaching M3 this way is proven (§9). |
| Critique | Only the v1 Python vision QA of generated art (`manga_vision_qa.py`) | **New, inside the harness.** `render_preview` plus M3 vision, or a deterministic critique report. |
| Revise | The repair loop through rejected submits (max 2) | Works only after defect H-1 is fixed. |

**Over-engineered:**
- The speed/quality dual-worker ModelPolicy. There is one model per process, two ports, receipt gates that fail on any mismatch, and the speed lane has the worst failure history. Use M3 only.
- Three agent sessions and three ContextPacks per 2 pages. Measured about 292 s of model time per 2-page toy scope; S3-S8 real scopes were about $0.07 + $0.16 + $0.26 [Doc]. At 2 pages per scope, a whole book is long and costly.
- The `_unwrap_item_wrappers` and `_OPTIONAL_NULLABLE_FIELD_NAMES` normalizer, which guesses field names (`page_domain_tools.py:44-148`). Needed today, but it is a symptom; see the transport fix.
- The 2-panel layout override heuristics (`page_domain_tools.py:804-861`).
- The HMAC signed-token path. The backend only ever sends the static bearer.
- Session-numbered comments and instructions everywhere; prompt versions v5 and v6 are layered patches.

**Dead or removable [Code]:**
- Goal types BOOK_CANON, MANGA_COMPOSITION, REEL_DIRECTION: their policies (`policies.ts:27-31, 69-92`), skills (`skills/book-canon`, `skills/manga-composition`, `skills/reel-direction` + references), loader entries (`skills/load.ts:8, 17-28`) and 12 tool schemas (`tool-adapter.ts`). ARTIFACT_REPAIR.
- `submit_asset_requests` (no backend).
- `PiAgentRuntime.resume` (no route; `sessionsByRef` exists only to serve it).
- `productionSessionPolicy` (used only by tests).
- `agentic_pipeline_bridge.py` shadow lane (flag off, broken composition, coupled to v1).
- The image lane in `manga_page_art_stage.py` and `manga_page_art.py`: gemini calls, conditioning skeleton, OCR and border gates, and vision QA of generated art. The compose/lettering half can be reused in principle, but it is PIL raster.
- `smoke-structured-json.ts`, which writes into tracked `docs/evidence/`.
- `Dockerfile`, which copies a non-existent `packages/design-tokens`, so the image cannot build.
- Book-specific skill and validator branches: `manga-plan-v1.md:85-101` ("Opening through Saying Yes", "hell-yes commitment"), page-writing SKILL.md `char_kai` (`:200-224`), and `domain_tools.py:283-331`.

---

## 7. Defects (ranked)

| ID | Severity | Where | What |
|---|---|---|---|
| H-1 | blocker | `internal_tools.py:83-86` ↔ `domain-tool-broker.ts:57-73` | 422/403 bodies are `{"detail":{…}}` but the client reads `error.*`, so the model sees only "failed with HTTP 422". The repair loop runs blind. [Code+Run] |
| H-2 | blocker | the absent entry point; `agentic_pipeline_bridge.py:53-56` | Generate never invokes the harness. The only in-app hook is a shadow lane that is off by default and uses a single worker URL, while the director requires M3 and page writing/thumbnail default to M2.7-hs. [Code] |
| H-3 | blocker | `manga_v2_reader.py:50-57, 99-111` | Pages from multiple scope runs collapse by per-run `page_index`: 3 scopes × 2 pages served as 2 pages. [Code+Run] |
| H-4 | blocker | `manga_page_art.py:56`, `manga_page_art_stage.py:573-690` | Page art calls an image model (OpenRouter gemini-2.5-flash-image). The owner forbids image models. [Code] |
| H-5 | major | `manga_director.py:211-239`; `manga_page_planner.py:351-356, 512-517` | Post-worker acceptance failures leave the stage `running` with no receipt; reruns replay the same result. [Code] |
| H-6 | major | `pi-runtime.ts:210` (`sessionsByRef` never deleted); `run-registry.ts:93` (`runs` never evicted) | A long-lived worker holds every AgentSession and message history forever: an unbounded memory leak. [Code] |
| H-7 | major | `agent_worker.py` (no cancel or async); `run-registry.ts` | The product cannot cancel a run; a dropped request keeps spending up to 15 min per goal. [Code] |
| H-8 | major | `manga_page_planner.py:122`, `whole_book.py:77` | Hard 2 pages per goal with 3 sessions per scope. Measured latency: direction 49-98 s, page writing 81-199 s, thumbnail 31 s on a 3-sentence fixture. [Run] |
| H-9 | major | `pi-runtime.ts:141-148, 186-192` + Pi `simple-options.js` | Default "medium" thinking takes up to 8,192 tokens of `max_output_tokens`, a truncation risk for large JSON. `thinkingLevel` is available but unused. With thinking off, M3 skipped a required tool call (n=1). [Code+Run] |
| H-10 | major | skills and `domain_tools.py:283-331` | Book-specific rules for WMC and "Hell Yeah or No": `char_kai`, "Saying Yes", fixed 20/10 beat counts. They will mislead the model on other books. [Code] |
| H-11 | major | `.gitignore:12` (dist), `start.sh:155-161`, `Dockerfile` | `packages/contracts/dist` is gitignored and nothing builds it, so a fresh clone breaks the worker's `@scrollstack/contracts` import. The Dockerfile references a missing package. [Code] |
| H-12 | major | `main.py:91-93`, `start.sh:187` | The broker router on the :8000 backend (0.0.0.0) uses the known default token. [Code] |
| H-13 | minor | `start.sh:82, 208` | start.sh claims and binds :3000, which collides with the owner's Hermes bridge. `claim_app_ports` fails if :3000 is busy. [Code] |
| H-14 | minor | `server.ts:63-69` | Auth is a `preHandler`, so body schema validation runs first; an unauthenticated request got 400, not 401. [Run] |
| H-15 | minor | `pi-runtime.ts` | `budget.max_input_tokens` is not enforced. [Code] |
| H-16 | minor | receipts | Cost is a Pi catalog estimate. M2.7-hs usage puts input into cacheWrite. v1 vision uses gpt-4o-mini prices. [Run/Code] |
| H-17 | minor | `page_domain_tools.py:782-862` | The broker silently rewrites agent layouts for 2-panel pages and forces RTL. [Code] |
| H-18 | minor | `apps/agent-worker/README.md` | Says tokens need ≥16 characters (the code requires 32) and describes cancel "by run_id" (it is keyed by goal_id). [Code] |

---

## 8. Live smoke results [Run]

Single calls go through the same sealed Pi construction as `PiAgentRuntime`, running in a scrubbed environment (`env -i` with only PATH, HOME and the key). Scripts: `harness/pi_smoke.mts`, `pi_tool_image_smoke.mts`, `pi_frame_smoke.mts`, `pi_frame_big_smoke.mts`.

| Probe | Response model / API | Latency | Usage (in / out / cacheRead; reasoning) | Result |
|---|---|---|---|---|
| M3, default (medium) thinking, JSON echo | MiniMax-M3 / anthropic-messages | 1,697 ms | 86 / 44 / 128; reasoning 25 | exact JSON; thinking block present |
| M3, `thinkingLevel:"off"` | MiniMax-M3 | 1,266 ms | 73 / 17 / 128; no reasoning | exact JSON; **no thinking block** |
| M2.7-highspeed, default | MiniMax-M2.7-highspeed | 2,795 ms | input 0 / 47 / cacheWrite 58; reasoning 30 | exact JSON |
| Tool-argument frame, small nested payload | M3 | 1.8-34 s | about 1.3-2k total | loose `Record`: intact. **Typed schema: `null`→`""` and `null`→`0` (Pi `Value.Convert`)**. JSON-string argument: intact. |
| Tool-argument frame, real 5.7 KB MangaPlan copied verbatim | M3 | 6.4-11.7 s | about 7.2-7.7k total | loose `Record`: intact; JSON-string: intact |

The mangling seen in the real goals, where the model **authors** the payload, is intermittent. It is not size-deterministic.
- [Inf] A `candidate_json: string` argument is the structurally safer transport: strings cannot be split into XML item elements.
- It is proven to round-trip, but it has not yet been tried in a real authored goal.

**End-to-end chain** (`harness/live_director.py` + `run_live_director.sh`). This is the real `MangaDirectorService`/`MangaPagePlannerService`, `HttpAgentWorkerClient`, the worker (`tsx src/index.ts`, `AGENT_MODEL=MiniMax-M3`), the real `internal_tools_router` + `MangaDomainToolService` on uvicorn, and `InMemoryRepositories`. There was no Mongo, so the owner's Atlas database was never touched.

| Run | Goal | Result | Receipt (in / out tokens, catalog $, latency) | Tool calls |
|---|---|---|---|---|
| 1 | direction | accepted on the 1st submit | 11,287 / 7,465, $0.01257, 98.4 s | submit ×1 (payload was item-wrapped and string-typed; normalized) |
| 2 | direction | accepted | 5,907 / 8,723, $0.01288, 49.6 s | submit ×1 |
| 2 | page writing (M3 by explicit override) | accepted, 2 pages / 3 panels / 6 text elements | 18,432 / 12,465, $0.02123, 80.6 s | get_manga_canon, submit ×1 (18 `""` empty lists normalized) |
| 3 | direction | accepted | 5,396 / 7,632, $0.01138, 61.4 s | submit ×1 |
| 3 | page writing | accepted | 21,179 / 15,003, $0.02505, 199.4 s | get_manga_canon, submit ×1 |
| 3 | thumbnail | accepted; 2 compiled layouts + 2 SVG previews | 9,541 / 4,681 (cacheRead 31,232), $0.01035, 31.5 s | get_page_script_set, validate ×2, submit ×1 |

- Content was grounded. Story beats were concrete ("Haw chalks 'Move with the cheese' on the Station C wall…") and the narration came from the source.
- Hygiene: every worker was killed and ports 18789/18010 were free afterwards; the key count in all logs and results was 0.
- An unauthenticated `POST /internal/v1/agent-runs` returned **400**, not 401 (H-14).
- Total audit spend at catalog prices: about **$0.10**.

Caveats: the fixture was tiny (3 sentences), n=1 per goal, and M3 only. Nothing here speaks to M2.7-hs goal behaviour or to real chapter-sized scopes.

---

## 9. Vision through the pinned harness [Run]

- **Catalog:** M3 has `input: ["text","image"]`; M2.7-hs is text only.
- **Current harness:** `images.blockImages: true` (`pi-runtime.ts:146`). Pi replaces every image in user and toolResult messages with "Image reading is disabled." (`pi-coding-agent/dist/core/sdk.js`, `convertToLlmWithBlockImages`). With that setting, M3 answered `{"image_visible": false}`.
- **Image in the prompt, `blockImages:false`:** M3 answered `{"shape":"circle","color":"red","digit":"7"}`, which is correct (307 input tokens, 1.6 s).
- **Image returned by a tool** (`render_preview` returns `[{text},{image/png}]`, `blockImages:false`, medium thinking): M3 called the tool once and answered `{"shape":"circle","color":"red","digit":7}`, correct (1,239 total tokens, 1.3 s). Pi converts tool-result images into Anthropic base64 blocks (`anthropic-messages.js:75-107, 934-950`), and MiniMax's anthropic endpoint accepts them.
  - With thinking off, M3 **did not call the tool** (answered with no image; n=1).
- **Conclusion:** a render → screenshot → M3 critique loop is reachable inside the harness. It needs `blockImages:false` and a tool that returns image content. No image-generation model is involved.

---

## 10. Recommended minimal changes (for the Phase 2 plan)

**Fix now (tiny, high leverage):**
1. H-1: in `domain-tool-broker.ts`, also read `detail.code/message`, or have the router return `{"error":…}`. Add one contract test that runs the real router body through the real client.
2. H-5: in `except` for `ArtifactValidationError` after `agent_worker.run`, persist the trace (the "succeeded but rejected" case) and fail the stage.
3. H-6: delete sessions in `finally` (drop `resume`) and evict finished runs after a TTL.
4. Set `thinkingLevel` explicitly. Use "low", or keep "medium" and raise `max_output_tokens` so the JSON has room. Record the level in the receipt.

**Simplify:**
- One model (M3) and one worker, and drop the ModelPolicy modes.
- Delete the dead goals, skills and tools and the book-specific rules.
- Change submit tools to `candidate_json: string` so the item-unwrap heuristics can be retired after a live comparison.
- Drop the 2-panel layout overrides.

**Extend (the production path):**
- **One goal per chunk of pages** (for example `MANGA_PAGES`) with these tools:
  - `get_source_excerpt`;
  - `validate_page_draft` (script + deterministic layout-template choice + lettering fit);
  - `render_preview` (SVG→PNG image result);
  - `submit_pages`;
  - `report_blocker`.
- Let a deterministic layout-template library handle geometry instead of an LLM thumbnail goal.
- Add a backend Generate job (Celery or async) that runs `ScopeChainPlanner` → per-chunk goals, persists run status and progress, exposes cancel (wiring the worker cancel route) and gives pages a book-level `sequence`.
- The reader should read one edition or manifest artifact, not merge runs by `page_index`.

**Replace:**
- The page-art stage, with a deterministic SVG/CSS page renderer driven by the compiled layout and page script. Seed it from `render_thumbnail_svg` and the lettering geometry in `compose_lettered_page`.
- The vision QA of generated art, with M3 critique of the rendered SVG through the harness.

**Ops:**
- Build `packages/contracts` in `start.sh`/`check.sh`.
- Fix the Dockerfile.
- Stop start.sh from claiming :3000.
- Pass the broker token to every backend process, or unmount the internal router from the public app.
- Persist sealed transcripts (redacted) for audit.

---

## 11. Open questions for the owner

1. Is **M3-only** acceptable for production, dropping M2.7-hs entirely? The live runs here were M3 only.
2. Should thinking be off or low for structured stages (cheaper and faster), given that off made M3 skip a required tool call once?
3. What is the target output shape: how many pages per book, and how many pages per goal? That sets the scope and chunk size and the time and cost budget. Today it is about 1.5-5 min of model time per 2 pages.
4. May the 3-stage split (plan → script → layout) collapse into one page-production goal with deterministic layout templates?
5. Should reading direction stay forced RTL, or depend on the book's language (the broker forces `rtl`)?
6. Can the unimplemented goals (BOOK_CANON, MANGA_COMPOSITION, REEL_DIRECTION) and the reel skills be deleted now?

---

## 12. Evidence-label summary of prior claims

| Claim (source) | Status |
|---|---|
| "Model repaired 422s with full error visibility" (`NEXT_SESSION.md:1076-1078, 1480-1482`) | **Contradicted by the code**: the model sees only the HTTP status [Code+Run] |
| "Disabled thinking unreachable through the pinned SDK" (`NEXT_SESSION.md:1089-1091`) | **False**: `thinkingLevel:"off"` works, and MiniMax honours it [Run] |
| "158k-token geometry echo fixed by projection" (`tool-adapter.ts:125-158`) | **Confirmed**: 9.5k input for a thumbnail goal [Run] |
| "Anthropic-lane M3 tool frame mangles arrays/empties/scalars" (`page_domain_tools.py:103-148`) | **Confirmed live** on authored submissions; not reproduced on verbatim copies [Run] |
| "Direction ≈ $0.07 / 5 min per goal" (S3, WMC scope) | Not re-measured on a real scope. The toy fixture came in at $0.011-0.013 and 50-98 s [Run] |
| "Whole-book golden chain" (S7/S8) | Stopped at the thumbnail with HTTP 422 per `chain_outcome.json` [Doc] |

## 13. Backend pytest set run

`test_agent_seam_raw_dump_v2`, `test_agent_worker_client_v2`, `test_agentic_pipeline_bridge_v2`, `test_domain_tools_v2`, `test_failed_run_receipts_v2`, `test_manga_director_v2`, `test_manga_page_planner_v2`, `test_manga_v2_reader_route_v2`, `test_model_policy_v2`, `test_scopes_api_v2`, `test_thumbnail_hydration_s8_v2`, `test_whole_book_v2`, `test_manga_content_validation_v2`, `test_manga_page_art_v2`, `test_manga_page_planning`, `test_manga_layout`, `test_manga_craft_validation_v2`: **167 passed**.
