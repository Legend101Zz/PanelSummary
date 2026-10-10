# PanelSummary decisions

This page is the current decision log. It replaces `docs/adr/` and `.project-factory/brain/DECISIONS.md`.
Those files are in git history: `git show ca40d45:docs/adr/<file>`.
The evidence for the 2026-09-25 rebuild is in `docs/rebuild/`.
To change a decision, edit its entry in the same change as the code, and give the new date.

## Accepted

### D1. One production path (2026-09-25)
- Statement: PDF → parse → `BOOK_UNDERSTANDING` → `ADAPTATION_PLAN` → one `MANGA_PAGE` goal for each page → persisted page → reader. No other generation path exists.
- Why: The old app had two lanes, and the default lane was not the harness. One path makes one set of proofs enough. See `docs/rebuild/DECISION-architecture.md`.
- Status: accepted, built.

### D2. MiniMax only, through the worker harness (2026-08-08, confirmed 2026-09-25)
- Statement: Every model call goes through `apps/agent-worker` to `api.minimax.io`. The allowed models are `MiniMax-M3`, `MiniMax-M3.1-Flash-Preview`, `MiniMax-M2.7-highspeed` and `MiniMax-M2.7`. Only M3 and Flash get images.
- Statement: Flash is not in the pinned Pi 0.80.10 catalog. The harness registers it as a custom model through the SDK (`ModelRuntime.registerProvider`, no network). Flash cannot turn thinking off (the API refuses `disabled`), so the harness sends adaptive thinking with an explicit effort. See `docs/launch/T0-model.md`.
- Statement: `MINIMAX_API_KEY` is a server credential. Only the worker process holds it. The backend and the browser never see it.
- Why: One provider keeps cost and receipts clear. A key in one process limits the blast radius.
- Status: accepted. `packages/agent-runtime` refuses other models.

### D3. No image-generation models (2026-09-25)
- Statement: No image-generation code, route, key or model is on any path. The art is deterministic SVG (D4).
- Why: The owner brief forbids it. Image lanes cost money, put content in the wrong panels, and faked quality.
- Status: accepted. The worker records every outbound host (`/internal/v2/egress`). `backend/tests/test_static_guards.py` fails on an image-generation surface.

### D4. Deterministic SVG renderer (2026-07-21, moved to TypeScript 2026-09-25)
- Statement: `packages/manga-render` validates a page spec, compiles the layout and writes SVG. The same code runs for the preview, the final render and the stored page.
- Statement: The model selects and adapts layout templates and staging from closed vocabularies. It does not invent geometry.
- Statement: The reader shows the persisted SVG, so the reader shows the exact accepted artifact.
- Why: A deterministic renderer gives the same page for the same spec. Previews then tell the truth, and resume is exact.
- Status: accepted. A renderer change that alters output needs a new `RENDERER_VERSION`.

### D5. Sealed Pi harness behind one package (2026-07-19, ADR-003/012)
- Statement: Only `packages/agent-runtime` imports the Pi SDK. The version is pinned (`@earendil-works/pi-coding-agent` 0.80.10).
- Statement: A session has no builtin tools, no ambient skills, extensions or context files. It has only the tools of its goal.
- Statement: A session has turn, tool-call, submit, output-token, cost and time limits. The caller can cancel it.
- Why: An agent must not reach the shell, the files or the network. An SDK upgrade is a separate reviewed change with tests.
- Status: accepted.

### D6. Agents get tools, not database handles (2026-07-19, simplified 2026-09-25)
- Statement: Goal tools (validate, preview, submit) run inside the worker against the bounded input of the goal. The worker has no Mongo access.
- Statement: The backend stores and serves. The job runner calls the worker with a service token, and the worker returns the accepted artifact.
- Why: This keeps the blast radius of a bad model output small. The old broker round trip added failure modes and no safety.
- Status: accepted. The domain-tool broker of ADR-012 is removed.

### D7. Source text is untrusted data (2026-07-19, ADR-004)
- Statement: Book text, earlier artifacts and tool results reach the model as data, never as instructions.
- Statement: Source text goes inside `<untrusted_source_text>`, and the worker replaces `<` and `>` in it. The system prompt tells the model to ignore instructions in data.
- Why: A PDF can contain text that looks like an instruction.
- Status: accepted. `apps/agent-worker/test/goals.test.ts` verifies the escape.

### D8. Submit contract for the model (2026-08-09 to 2026-09-25, harness lessons)
- Statement: Each submit or preview tool takes one `candidate_json` string. The tool returns every validator error to the model word for word.
- Statement: If the model ends with a JSON object instead of a submit call, the runtime sends that object through the same submit tool.
- Why: MiniMax tool frames truncated large arguments and turned empty values into `""` or `{}`. A string survives the frame. Visible errors let the model repair.
- Status: accepted.

### D9. MongoDB is the durable authority (2026-07-19, ADR-002)
- Statement: Mongo holds books, sources, editions, artifacts, pages and jobs. Pi sessions are working memory only.
- Statement: Resume rebuilds work from persisted artifacts, never from a live session. `edition_pages` has a unique `edition_id + page_number`.
- Statement: Local development uses a local Mongo. The Atlas URL in `backend/.env` is the owner's database. The stack never uses it unless `PANELSUMMARY_MONGODB_URL` is set.
- Why: A crash or a stopped worker must not lose accepted, paid work.
- Status: accepted.

### D10. A Mongo-leased job runner replaces Celery and Redis (2026-09-25)
- Statement: `python -m app.runner` claims parse and generate jobs with a lease. A heartbeat extends the lease. An expired lease lets another runner resume the job.
- Statement: A cancel request reaches the worker, and the worker aborts the session.
- Why: A whole book takes longer than the old 600 s Celery limit. One fewer service to run.
- Status: accepted, built.

### D11. Failure is visible (2026-08-07 principle, 2026-09-25 rule)
- Statement: A page that fails after its attempts is stored as `failed` with the reasons, and the reader shows it as failed.
- Statement: An edition with a failed page ends `completed_with_failures`, never complete. The plan lists omitted claims with a reason.
- Statement (2026-10-09, provider refusals): When the model provider refuses a call, the job shows that fact and stops. The worker returns `PROVIDER_LIMIT` (HTTP 429, `rate_limit_error`, usage limit, credits), `PROVIDER_AUTH` (401, 403) or `PROVIDER_UNAVAILABLE` (5xx, overloaded, no connection). The trace has `stop_reason: provider_error` and the provider's error type and message (no key, no headers). A refusal is never reported as `NO_SUBMISSION`.
- Statement: The backend has a circuit breaker. `PROVIDER_LIMIT` and `PROVIDER_AUTH` stop the job at once. `PROVIDER_UNAVAILABLE` stops it when the normal attempts are used up. After the stop, no new call is sent. Accepted pages stay accepted. Pages never tried stay `pending`, not `failed`. The page that met the refusal goes back to `pending` and its attempt is given back, because the model did not fail. The same rule holds for the understanding and the plan: no second attempt against a dead quota.
- Statement: The edition ends with status `failed`, not a new `paused` status. Reason: `failed` already means "stopped with an error, can be resumed" in the API, the job runner and the screens, and every poller already treats it as final. A new status would be unknown to the old pollers. The edition has `error` (the plain sentence) and `provider_stop` (code, type, HTTP status, message, stage, page). `error` reads for example: "MiniMax refused the request: Token Plan usage limit reached ... Nothing more was sent. Resume when the limit resets or after you add credits."
- Statement: Resume continues the pending pages and skips accepted ones. It clears `error` and `provider_stop`.
- Why: A loud failure is better than a quiet wrong result in a paid pipeline. The old path faked passing quality. On 2026-10-09 a plan limit made 32 of 50 pages fail (count from the track brief) as "no submission", each after about 20 to 25 s, and those pages could not be told from model failures.
- Status: accepted.

### D12. Idempotency and receipts (2026-09-25)
- Statement: The worker is idempotent by `run_id`. A repeated request returns the first result and does not run the model again.
- Statement: Resume and redraw skip accepted pages. Every goal stores a receipt: model, thinking level, tokens, cost estimate, latency, skill version and hash.
- Statement (2026-10-09): A refused call keeps its receipt like every other call: `error.code` is the `PROVIDER_*` code, `stop_reason` is `provider_error`, and `provider_error` holds the type, HTTP status and message. A call that is sent again after a refusal (resume) gets a new run id with the suffix `-r<n>`, so no two receipts share an id.
- Why: A retry must not charge twice. A cost figure without a persisted receipt is not evidence.
- Status: accepted.

### D13. Generation policy (2026-09-25, measured; revised 2026-09-26; revised 2026-10-09 twice)
- Statement: The policy is set per goal. All three goals use `MiniMax-M3.1-Flash-Preview` (Flash). Book understanding runs with thinking `low`; plan and pages with thinking `off`. A retry uses `medium` for every goal. Flash cannot turn thinking off, so the harness sends adaptive effort `low` for "off" and "low" (see D2). Pages get a PNG preview (vision).
- Statement: The owner direction of 2026-10-09 is: prefer Flash where it holds quality, use M3 less, and measure and record every switch. The rule used: Flash becomes the default for a goal where it is at least as good as M3 on judged quality and on validation. M3 stays where Flash measurably loses.
- Statement: The settings are `UNDERSTANDING_MODEL`, `UNDERSTANDING_THINKING`, `UNDERSTANDING_RETRY_THINKING`, `PLAN_MODEL`, `PLAN_THINKING`, `PLAN_RETRY_THINKING`, `PAGE_MODEL`, `PAGE_THINKING` and `PAGE_RETRY_THINKING`. The old `RETRY_THINKING` is a fallback for the plan and page retries only. Every edition records all of them (`policy`). Every receipt records the model, the thinking level asked for, the thinking sent and the cost basis.
- Statement: `MiniMax-M3` is the fallback for every goal. To put a goal back on M3, set its model variable to `MiniMax-M3`. For M3 pages also set `PAGE_RETRY_THINKING=off`: a retry at `low` on M3 pages was cut off by runaway thinking in 6 of 7 recorded runs (F1). For an M3 understanding, set `UNDERSTANDING_RETRY_THINKING=low`.
- Statement: A page gets two attempts (4 previews and 8 submits each, F1). Four pages run in parallel. No separate review pass runs.
- Why, plan and pages (first A/B, 26-page book): Flash planned in 34 to 198 s where M3 took 79 to 235 s, at the same judged quality. Flash pages had no failed page in 3 runs (59 pages); each M3 run had one failed page. See `docs/launch/MODEL-AB.md`.
- Why, understanding (second A/B, after the statue-guard fix #33): T0's 3 of 3 Flash failures were caused by the guard, not by Flash: it flagged the Swallow as a statue. After #33, Flash passed the understanding in its first goal attempt in 3 of 3 runs (the F3 replay, the understanding A/B and Gate 2). On the same code (26-page book, Flash plan and pages), the M3 understanding gave 6 of 22 pages at the ship bar and a mean of 3.53; the Flash understanding gave 4 of 22 and 3.49, and Flash was a little lower on every headline criterion (continuity 2.94 against 3.05, beat 3.35 against 3.55). These differences are inside the run-to-run spread: two M3 runs of one configuration, judged by the same panel, gave 3.31 and 3.20. On the 68-page book (Gate 2) the Flash understanding gave tale 1 a mean of 3.53 (15 pages) and the M3 understanding 3.40 (11 pages), but these are not matched page sets (the M3 run drew only 18 of 50 pages before the plan limit). Flash was much faster: page 1 at 427 s against 945 s, and the understanding in 132 s against 801 s (26 pages), 221 s against 545 s (68 pages). Rule result: Flash does not measurably lose, and the owner's rule keeps M3 only where Flash measurably loses, so the understanding moves to Flash.
- Gate 2 (68-page book, all Flash, `release/v0.1` `d1a2286`): 46 of 56 pages drawn before the MiniMax plan limit stopped the run (tales 1 to 4 and 2 pages of tale 5). On those pages, 7 of 46 at the ship bar, mean 3.52, continuity 2.94, fidelity 3.57. Run 8 judged by the same panel: 7 of 46, 3.47, 2.88, 3.34 (tales 1 to 4 only: 4 of 36, 3.44).
- Caveat: One or two runs per arm. Per-page legibility with Flash pages was about 0.2 lower in the first A/B; in Gate 2 it was 3.43 against 3.48 for run 8 on the same panel. If a later judged run shows Flash below M3 on a goal, that goal goes back to M3 by the settings above.
- Judge panel: The older single-judge scores are not comparable with the panel. The run 8 pages, judged again by the same 3-judge panel, scored 7 of 46 at the ship bar and a mean of 3.47, against 5 of 46 and 3.38 from the single judge. The panel report is `docs/rebuild/baselines/run8-panel.md` (data in `run8-panel.json`).
- Earlier reasons that still hold: See `docs/rebuild/EXPERIMENTS.md` §4-6 and `docs/rebuild/ACCEPTANCE.md`. Thinking off was 3-5x faster than low at equal page quality. For the understanding, thinking off was fast but unreliable: acceptance run 2 cast the Happy Prince statue as a gold "rocket". The patch tool cut the understanding time. M2.7-highspeed miscast characters. The review pass did not pay for itself.
- Status: accepted. The configuration is in `backend/app/settings.py` and is recorded on each edition. The cost and time preflight (D19) is fitted to the runs of all three policies (`backend/app/preflight.py`).

### D14. PDF parsing with PyMuPDF only (2026-09-25)
- Statement: `backend/app/sources/pdf_source.py` makes sections and bounded source units with real PDF page numbers.
- Statement: A PDF without extractable text raises `NoTextError`. It never becomes an empty book.
- Why: The test books are born-digital. Docling pulled in torch and OCR models for no gain.
- Status: accepted. Scanned books are not supported.

### D15. Reading direction (2026-09-25)
- Statement: Pages read left to right by default. The layout compiler can mirror a page for right-to-left.
- Why: The test books and the audience are English.
- Status: accepted.

### D16. Repository and names (2026-08-07, ADR-010; renamed 2026-09-25)
- Statement: This repository is the product repository. The ScrollStack agent plane was ported into it. The packages now use the `@panelsummary/*` scope.
- Status: accepted.

### D17. Documentation language (2026-08-10)
- Statement: Project documentation uses Simplified Technical English, pragmatic mode. See the "Language" section of `CLAUDE.md`.
- Status: accepted.

### D18. Acceptance gates (2026-08-10, from issue #15 and the journeys)
- Statement: A release needs these proofs. The old path is not reachable. A browser journey (upload → Generate → read) passes on the harness path. Every cost figure has a receipt. A human judges the pages side by side.
- Status: accepted. The offline guard is `backend/tests/test_generate_journey.py`.

### D19. v0.1 scope for large books (2026-10-09, issues #4 and #13)
- Statement: v0.1 has a size limit and a cost and time preflight. The limits are `max_pdf_pages` 75 and `max_source_words` 17,500. Both are configuration (`MAX_PDF_PAGES`, `MAX_SOURCE_WORDS`).
- Statement: Upload accepts any parsed PDF, and the reader shows the source. `POST /books/{id}/editions` refuses a book over a limit with HTTP 422 and a plain reason. It creates no edition and no job, and it spends nothing.
- Statement: `GET /books/{id}/preflight` shows the size, the limits, and low and high estimates of pages, cost and time. It answers 409 for a book that is not parsed.
- Statement: Chapter-scoped generation, resumable project memory and chunked continuation are not in v0.1. They move to v0.2.
- Amended 2026-10-10 (v0.2, issue #40): the limits apply to the chosen scope, not to the whole book. The values do not change: 75 PDF pages and 17,500 words. `POST /books/{id}/editions` and `GET /books/{id}/preflight` accept a scope (sections, or a PDF page range). A 150-page book can draw one section inside the limits. With no scope the whole book is checked, as in v0.1. A scope that is empty, unknown or out of range gives 422 with plain reasons. A scope over a limit gives 422 with the limit reasons. The edition stores `scope` (null = the whole book). Project memory and "Continue with the next section" are not part of this amendment.
- Why: The whole book goes into one understanding call. That call wrote 36,000 to 78,700 output tokens and took 259 to 1,166 s on the measured runs, at 31 to 167 output tokens/s. The goal times out at 25 minutes. The largest book that finished end to end has 68 PDF pages and 16,159 words, so each limit is that figure plus 8 % (words) or 10 % (pages). A scope cannot be chosen safely without a table of contents the user can pick from, a persisted understanding per scope and a rule for characters that cross scopes. None of these exists, and a wrong cut would break the source grounding. See `docs/launch/T3-scope.md`.
- Status: accepted. The limits are not a promise that every book under them finishes. A slow provider hour can still time out the understanding, and the edition then fails with a visible reason.

### D20. Honest latency (2026-10-09)
- Statement: The edition stores `timings.generate_started_at`, `timings.drawing_started_at` and `timings.first_page_at` in the database. The first value stays after a resume.
- Amended 2026-10-10 (v0.2): the edition also stores `timings.page_1_at` (page 1 accepted; the first value stays) and `active_seconds` (the sum of the run times of its jobs, so the pause before a resume does not count). `first_page_at` stays the first accepted page of any number.
- Statement: Pages start in reading order. No scheduling change is made in v0.1.
- Why: The measured critical path is understanding, then plan, then the first page. The plan waits for the whole understanding, and a page waits for the plan. No step can start earlier without a quality or honesty cost. The long tail of a run is a page that fails twice, not an idle gap. See `docs/launch/T3-scope.md`.
- Status: accepted. Estimates are ranges fitted to measured runs, and the basis text says so.

### D21. Places per source unit; the location check is a warning (2026-10-10, issue #44, track Q2b)
- Statement: A location of the book understanding may carry `units`: the ids of the source units in which the story is at that place. The field is optional and additive. The schema name stays `book-understanding.v1`. An understanding saved before this change (no `units`) loads, validates and plans as before, and none of the new checks speaks on it. The book-understanding skill (1.8.0) and the receipt's skill hash record that the model was told to write the field.
- Statement: `PLACE_UNITS_INVALID` (an unknown unit id or a malformed list) is an error. `PLACE_UNITS_MISSING`, `PLACE_UNIT_UNCOVERED`, `PLAN_LOCATION_NOT_IN_UNITS` and `PLAN_PLACE_UNLISTED` are warnings.
- Why: The new plan checks cannot be calibrated on the saved runs, because no saved understanding has `units`. The proxy that derives places from location names flags 64 of 309 judged pages, and 36 percent of them have a setting defect against 30 percent of the others (`docs/v0.2/Q2b-continuity.md`). That is no evidence. The rule of `CLAUDE.md` holds: a new deterministic validation stays a warning until judged pages from a live run calibrate it.
- Status: accepted. Promote a plan check only with live understandings that carry `units`.

### D22. A panel flag for the afterlife, dreams and memories (2026-10-10, issue #44, track Q2b)
- Statement: A panel may set `"vision": "afterlife" | "dream" | "memory"` (`VISIONS` in `packages/manga-render/src/contracts.ts`). `FIGURE_STATE_MISMATCH` skips a panel that has the flag, like a panel with fx `flashback`. The renderer does not read the field, so the SVG does not change and `RENDERER_VERSION` stays.
- Why: A dead character shown alive in paradise, or a grandmother in a dream, failed the check unless the writer used `flashback`, which also means a different time. `FIGURE_STATE_SEVERITY` stays `"error"`: the flag removes the known false positive (run 8 page 13) and the present-day check stays strict.
- Statement: `VISION_OVERUSED` (more than half of the panels of a page of 2 or more panels set `vision`) is an error only when the planned beat names none of: afterlife, dream, memory, paradise, heaven, vision. When the beat names one, a page may flag every panel and nothing is reported. When the planned beat is not available, it is a warning. `VISION_NOT_PLANNED` stays a warning.
- Status: accepted. The page and plan skills tell when to use it.

### D23. Minor figures come from the page's own text (2026-10-10, issue #44, track Q2b)
- Statement: The page goal adds a generic cast member (`id` `m_<word>`, `"minor": true`, a plain human look) for a speaker the page's source text names, who is a person, and whom no cast member of the section answers to. It uses the T1 speaker rules (a person hidden in a crowd, "one of the workmen", a singular attribution with no cast member). At most 3 per page. The figure is part of the page's cast for validation and rendering and is listed in the prompt. It is not written into the understanding.
- Why: The understanding adds one-line characters only when the model remembers (T1 allows 3 errors per book), and a page could not draw anyone outside the cast. Animals, objects and groups are never guessed.
- Status: accepted. The reader shows a speaker without a name in the understanding as "Someone". Naming minor speakers in the source drawer needs a backend change that is not in this track.

### D24. Plan review before drawing (2026-10-10, issue #49)
- Statement: An edition can stop after the plan and wait. `POST /books/{id}/editions` takes `review_plan` (true or false). When it is missing, the setting `PLAN_REVIEW_DEFAULT` decides (default false, so the v0.1 flow and `journey.mjs` do not change). The choice is recorded in `policy.review_plan`.
- Statement: When the edition waits, the understanding and the plan are stored, the page rows and beats exist, and the status is `awaiting_plan_review`. The job ends `succeeded`. No page call is made. The status is not an active status for the runner, but `POST /books/{id}/editions` returns the waiting edition (`already_running`) and does not start a second one.
- Statement: `POST /editions/{id}/approve-plan` records `policy.plan_approved` and queues a resume job. It reuses the understanding and the plan, so only the pages are paid for. It gives 409 when the edition does not wait. `POST /editions/{id}/cancel` on a waiting edition sets `cancelled`. `resume` and page redraw give 409 while the plan waits.
- Statement: While it waits, the edition view adds `draw_estimate_usd {low, high}` (the page term of the cost model, `COST_PER_PAGE` with the low and high factors, times `page_total`) and `plan_omitted [{claim, reason}]`. `book.claims` gives the claim text. The money spent so far is `totals.cost_usd`.
- Why: The plan is the cheapest point to catch a wrong cut. The owner decided to build it as a setting that is off by default.
- Status: accepted. D12 and D13 hold: every call before and after the review has its receipt and the recorded policy.

### D25. Server status endpoint (2026-10-10)
- Statement: `GET /status` returns `api`, `version`, `runner {running, last_seen}`, `worker {reachable, key_set}`, `models [{step, model, thinking}]`, `limits` and `plan_review_default`. It is read only, spends nothing and makes no model call.
- Statement: The runner writes one heartbeat document on every poll. The runner counts as running when the beat is younger than three polls plus 5 s. The job lease is not used: it is empty when the runner is idle. The worker is asked at its free `/readyz` with a 2 s timeout. `ready` there means that a key is set; the answer cannot say that MiniMax accepts the key. The response never holds a key, a token or a database URL. A test checks the field names and values, and a static guard checks that the route does not read those settings.
- Why: The first-run and Settings screens must say "no key" or "the drawing service is down" before the user presses Generate.
- Status: accepted.

## Superseded (history only)

- ADR-001: an OpenAI model for the agent path, and OpenRouter as an image-only credential. Replaced by D2 and D3.
- ADR-005: `RenderedPage`, `MangaManifest` and `ReelSpec` as seams. Replaced by the `manga-page.v1` spec and the persisted SVG (D4).
- ADR-006: Remotion reel rendering. The reel lane and `reel-renderer/` are removed.
- ADR-007: Pydantic-led JSON Schema in `packages/contracts`. Removed. The renderer contracts (`packages/manga-render/src/contracts.ts`) are the source now.
- ADR-008: separate Celery and reel-render workers. Removed. Its agent-worker rule stays in D2 and D6.
- ADR-009: Python as the layout compiler. The compiler is TypeScript now. Its principles stay in D4 and D9.
- ADR-011: the byte-compare guard for compiled context in the v1 pipeline. Removed with v1. Its principle stays in D11.
- ADR-012: the domain-tool broker, goal policies and the service-token pair for tools. Replaced by D6.
- Per-purpose model modes (`direction`, `page_writing`, `thumbnail` on speed or quality). Replaced by D13.
- Session 8 lane B (paste one generated panel into compiled geometry). Replaced by D3 and D4. Lesson kept: placement by code bound content to the right panel; one-shot page images did not.
- Image budgets (`none | sprites_only | budgeted | full_panel_art`). Removed with D3.
- The v1 deprecation plan of issue #15. The rebuild removed v1 directly on 2026-09-25.
- The owner-requested database wipe (2026-08-09). History only.
