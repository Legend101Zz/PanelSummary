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
- Statement: While it waits, the edition view adds `draw_estimate_usd {low, high}` (the page term of the cost model times `page_total`; since v0.3 (issue #88, `docs/v0.3/O1-ops.md`) it uses the measured page-receipt cost per page, `DRAW_COST_PER_PAGE_LOW` and `DRAW_COST_PER_PAGE_HIGH`, not `COST_PER_PAGE` with the factors) and `plan_omitted [{claim, reason}]`. `book.claims` gives the claim text. The money spent so far is `totals.cost_usd`.
- Why: The plan is the cheapest point to catch a wrong cut. The owner decided to build it as a setting that is off by default.
- Status: accepted. D12 and D13 hold: every call before and after the review has its receipt and the recorded policy.

### D25. Server status endpoint (2026-10-10)
- Statement: `GET /status` returns `api`, `version`, `runner {running, last_seen}`, `worker {reachable, key_set, replay}` (`replay` is true for the replay worker; `key_set` is then false), `models [{step, model, thinking}]`, `limits` and `plan_review_default`. It is read only, spends nothing and makes no model call.
- Statement: The runner writes one heartbeat document on every poll. The runner counts as running when the beat is younger than three polls plus 5 s. The job lease is not used: it is empty when the runner is idle. The worker is asked at its free `/readyz` with a 2 s timeout. `ready` there means that a key is set; the answer cannot say that MiniMax accepts the key. The response never holds a key, a token or a database URL. A test checks the field names and values, and a static guard checks that the route does not read those settings.
- Why: The first-run and Settings screens must say "no key" or "the drawing service is down" before the user presses Generate.
- Status: accepted.

### D26. Writer-check calibration rule and classes (2026-10-10, v0.2 track Q2a, issues #43 and #45)
- Statement: A page check is in `repair_once` only when four tests hold on the judged pages: at least 10 flagged pages (a code already in the class may stay with 3 to 9), a hit rate of 60% or more (the specific hit where the check names words), a hit rate at least 20 points above the unflagged pages (not applied to a specific hit), and at most 25% of the judged-good pages flagged. A code with fewer than 3 flagged pages, and a new code with fewer than 10, is a warning. Nothing becomes a hard error without a separate calibration.
- Statement: `PROSE_WALL` is promoted to `repair_once`, with the renderer threshold unchanged (more than 40 words, more than 60% in captions or narration). On 319 judged pages it flags 68, 75% specific hit, 12 of 134 good pages.
- Statement: `DUPLICATE_CAPTION` (2 flagged pages) and `SPEAKER_OFF_PANEL_LIMIT` (1) leave `repair_once` and are plain warnings. `KEY_PROP_NOT_DRAWN` stays after its trigger "leaf" is removed (specific hit 67%, was 59.5%). `CLAIM_TEXT_THIN`, `SPEECH_IN_NARRATION`, `REPEAT_NAME_TAG`, `LOCATION_OFF_PLAN`, `HERO_TOO_SMALL` and `STATUE_LOCATION_SWAPPED` stay (the last four on thin evidence).
- Statement: `SAME_SHOT_TWICE` (8 flagged pages, 63% hit) and `QUOTE_CLIPPED` (49 pages, 31% hit against a 31% base rate) are new plain warnings. `DIALOGUE_ORDER` (8 pages, 88% hit) stays a warning. `CLAIM_ORDER` (0 flags on 319 pages) stays a warning and is removed if the next measurement also has 0.
- Why: Seven of the nine W2 codes rested on 1 to 5 flagged pages. The 319 pages of 12 saved runs, joined with the judges' defects, give the numbers. The tables and the limits of the data (one book supplies 301 pages; the kind patterns are loose) are in `docs/v0.2/Q2a-writer-checks.md`.
- Status: accepted for the next live run. `manga-page` skill 1.10.0 records the new class list. The effect on the judged rates is a prediction until the orchestrator verifies it with a live run and a judge panel.

### D27. Built-in sample edition (2026-10-10)
- Statement: The repository ships one finished edition as a sample: "Four Tales by Hans Christian Andersen", 18 manga pages, in `backend/samples/andersen/`. `GET /samples` lists it. `POST /samples/andersen` installs it into the database (safe to repeat) and returns `{book_id, edition_id}`. The book view and the shelf carry `is_sample`.
- Statement: The sample is the real v0.1 final-journey run, exported unchanged except for the machine path of the PDF. Its numbers (20 model calls, $0.460227, 54 key points, the timings, the policy) are the measured values of that run. It is not drawn again, and installing it calls no worker and spends nothing.
- Why: A first-time user can read a finished manga before they spend anything, and every screen of the book page and the reader can be shown with real data. The text is public domain (Project Gutenberg eBook #1597).
- Status: accepted (owner decision, 2026-10-10). The sample keeps the v0.1 policy and the v0.1 renderer output (`manga-render/0.5.0`). It does not follow later model or renderer changes.

### D28. Renderer 0.6.0: story vocabulary and camera push-in (2026-10-10, issues #41 and #42, track Q1)
- D4 stays (deterministic SVG). The renderer is `manga-render/0.6.0`. Old stored pages keep their SVG.
- The closed vocabulary grows by name: outfits `underclothes` and `undressed` (also as a per-panel `variant.outfit`), props `pot`, `stove`, `roast_goose`, `heart`, `angel`, `loom`, `sledge`, environments `foundry`, `dustheap`, `paradise`. The worker reads the lists from the renderer contracts, so they cannot differ.
- Camera push-in (replaces "the hero floor only enlarges the figure"): the hero and every speaker fill at least 30 percent of the panel in their tighter dimension (15 percent in an establishing shot). A smaller one is brought up by moving the camera toward it, as far as every subject, speaker and name-tagged head stays in the panel. A speaking statue keeps its head in the panel.
- Tail rule changed: a tail still stops about halfway to the mouth, except when that tip would end between two faces. Then it runs on to just outside its own speaker's head circle.
- `HERO_TOO_SMALL` (warning) now uses the same measure: under 25 percent of the panel after the push. Calibration: `docs/v0.2/Q1-renderer.md`.
- Status: accepted for the next live run. Skills: `manga-page` 1.11.0 and `book-understanding` 1.9.0.

### D29. Neutral stand-ins by body plan, kind of place and shape; labels; renderer 0.7.0, 0.7.1 (2026-10-14, issue #81, tracks D1a and fxr)
- D4 stays (deterministic SVG), and D3 stays (no image model). The renderer is `manga-render/0.7.1` (0.7.0 at first). Old stored pages keep their SVG.
- Statement: When no named item fits, the renderer draws a neutral stand-in and labels it, instead of a confident wrong match. A stand-in is a body plan, a size, a kind of place or a shape, never one species or one book. `animal` species `quad_small`, `quad_medium`, `quad_large`, `long_low`, `swimmer` and `bird` species `bird_tall` draw one flat tone, plain ears and tail, no species marks, the usual faces and every pose of their rig. Environments `generic_room`, `generic_hall`, `generic_passage`, `generic_rough` and `generic_outdoor` have no furniture and draw the features of their location. Props `thing_long`, `thing_round`, `thing_block`, `thing_flat` and `thing_heap` are plain shapes toned by `tone`.
- Statement: Every look kind takes an optional `scale` (0.05 to 4.0, adult person = 1.0). Absent, a look keeps its exact size. A value outside the range is the error `LOOK_SCALE_RANGE`.
- Statement (0.7.1, Gate 1 fix A2): `scale` is the size of a stand-in, not a real-world size. The renderer applies it only to the six archetype species (`quad_small`, `quad_medium`, `quad_large`, `long_low`, `swimmer`, `bird_tall`) and to a `human` look when it makes the person smaller (0.12 up to, not including, 1.0). On every other look (a named animal, bird or insect, an object, a plant, a spirit, a crowd, an emblem) and for a person of 1.0 or more, the renderer ignores the scale: the figure keeps its readable size, and the warning `LOOK_SCALE_IGNORED` names the cast id. A bigger person uses `height: giant`. An applied scale under 0.12 is drawn at 0.12 (warning `LOOK_SCALE_FLOOR`), so a stand-in is never a speck. Both are warnings, never errors: there is no repair round. The range check `LOOK_SCALE_RANGE` is unchanged.
- Why (0.7.1): Gate 1 on the two-tale book: the understanding set a real-world `scale` on 7 cast members (Swallow 0.08, Nightingale 0.07, Butterfly 0.06, Prince 2.0). The named species already have sizes chosen to read in a panel, so these scales made specks (65 panels on 18 pages) and a 25 to 1 ratio next to the Prince. Measured numbers: `docs/v0.3/D1a-renderer.md`, "Gate 1 fixes".
- Statement: Labels. An archetype figure gets its cast name as a name tag in the first panel of each page where it is drawn, unless the writer already named it on that page. A neutral prop takes `PropSpec.label` (at most 24 characters, plain text), drawn as a name tag beside the prop. A `thing_*` prop without a label is the warning `NEUTRAL_PROP_UNLABELLED` (D26: a new check is a warning until it is calibrated on judged pages). A tag that has no free place is dropped with a warning (`ARCHETYPE_LABEL_DROPPED`, `PROP_LABEL_DROPPED`), never an error. Since 0.7.1 (Gate 1 fix A3) a label is drawn ONLY on the five neutral props. On any other prop the renderer ignores the label and adds the warning `PROP_LABEL_IGNORED` (not an error, so no repair round). A colour or a name is shown with `tone` or with a cast member of its own, never with a label on a named prop (the writer had put labels such as "white roses" on named props, which made label clutter on page 17).
- Statement: Four general fixes ship with it. `abstract` draws the features its location lists (`void` stays blank). "Small" for the camera follows the nominal height (under 45 figure units, or any look with `scale` under that), not the kind, so a horse or a bear is not boosted as a small creature. A rat or a mouse that sits, talks, points or waves sits hunched with its tail out, not upright like a bear. The word "blade" no longer makes a beat mention a sword.
- Why: `docs/v0.3/D1-diagnosis.md` found that 85 percent of the wrong cast, places and props have no item in the closed vocabulary (class V), so the model had to choose the nearest item and nothing marked it as a stand-in. Adding one item for each new book does not stop the next book. A neutral body plan, kind of place and shape does.
- Status: accepted for the next live run. The measured effect on judged pages is in `docs/v0.3/D1a-renderer.md`. Whether the labelled stand-ins score better than the wrong matches is a prediction until the orchestrator verifies it on a live run with a judge panel.

### D30. The understanding reports stand-ins (2026-10-14, issue #81, track D1b)
- D4 stays (deterministic SVG) and the vocabulary stays closed. When no item fits a thing of the book, the understanding chooses a neutral stand-in (D1a draws it) and says so. It never picks a near item silently, and it never draws an animal as a person or a person as an animal.
- Additive and optional fields (the schema stays `book-understanding.v1`): `cast[].fit` and `locations[].fit` (`exact`, `near`, `none`), `wanted` (the thing in the book's words, at most 40 characters), and a top-level `unmapped` list of `{type: cast|place|prop, ref?, wanted, used}`.
- Checks: `fit` near or none without `wanted` is an error (`FIT_WANTED_MISSING`). A neutral archetype or generic environment without `fit` near or none is a warning (`ARCHETYPE_WITHOUT_FIT`). A look error shows `wanted`, kind and species together.
- No word list for one book: no word test for a kind of animal or place. Whether a look suits a description is reported by the model and shown to the reader (book page, "Drawn as stand-ins"), not guessed by code. `CROWD_NOT_PEOPLE` gets no new words.
- `KEY_PROP_NOT_DRAWN`: "blade" is no longer a trigger for `sword`, and a hyphenated word is one word in this check. The repair hint asks for a neutral `thing_*` prop with a `label`, never the nearest named prop. A labelled neutral prop counts as drawing the object it names.
- Receipts: the note of a rejected understanding submission names the first rejected field and value (plain text, 40 characters at most).
- Gate 1 fixes (track fxw, issue #81; skill `book-understanding` 1.13.0): (1) `look.scale` is left out by default. The renderer uses it only on a neutral archetype species and on a human below 1.0, so a `scale` anywhere else is the warning `SCALE_NOT_USED` on the receipt (Gate 1: the model set a real-world size on 7 of 31 cast members, a swallow 0.08, a prince 2.0, and the birds were drawn as specks). A big person uses `height: giant`. (2) A `crowd` with `fit` near or none is the error `CROWD_STAND_IN`: a crowd draws people only, so it is always a wrong match for a group of animals (found live in M1 part 1: an animal family cast as a human crowd). No word list. It does not judge the cast of an earlier part of a continuation, which is copied unchanged. (3) An `unmapped` prop whose `wanted` has a prop item (the renderer's `PROP_WORDS`) is the warning `UNMAPPED_HAS_ITEM` (Gate 1: ruby, sapphire and heart were listed as stand-ins and the reader would have shown three false entries). Neutral shape words (`thing_*`) are not matched.
- Status: accepted. Skills: `manga-page` 1.12.0 and `book-understanding` 1.10.0 (Gate 1 fixes: 1.14.0 and 1.13.0). Notes: `docs/v0.3/D1b-understanding.md`.

### D31. A camera push keeps every planned figure in the panel (2026-10-14, issue #90, track D2)
- Statement: Both camera pushes (the speaker readability push and the #42 size-floor push) use one bounded search. A push is as large as it can be while the head of every planned figure of the panel stays inside the panel (2.5 percent margin). If no factor works, the camera does not push. A planned figure is never "cropped on purpose" by a push; only a crowd, an extra or the statue top may be.
- Statement: Before a speaker push, figures that stand too far apart are moved closer together horizontally (same order, same facing). A speaker who still cannot reach the size floor keeps `SPEAKER_TOO_SMALL` (an error): the writer repairs it with a closer shot of the speaker or fewer figures in the panel.
- Statement: New warning `FIGURE_HEAD_PARTLY_CLIPPED` (under 60 percent of a planned head circle inside the panel; not for extreme_close). It is a warning until it is calibrated (D26). `FIGURE_HEAD_CLIPPED` is unchanged.
- Why: On 290 judged pages the old speaker push lost or cut 19 of 21 figures (hero, speaker and other planned figures), and a prototype showed the trade-off: bounded pushes leave small-headed speakers small. Measured numbers: `docs/v0.3/D2-push.md`.
- Status: accepted (2026-10-14, the orchestrator). The residual `SPEAKER_TOO_SMALL` (13 of 290 judged v0.2 pages) stays an error: the page writer sees it in its preview and repairs it with a closer shot of the speaker or fewer figures. The alternative before this change was a hero cropped out of the panel. Gate 1 and Gate 2 measure the cost (failed pages, repair rounds). Renderer 0.6.1, then 0.7.0 with D29.

### D32. Page turn: guidance and a plan warning, no page check (2026-10-14, issue #82, track W1)
- Statement: The plan skill (1.6.0) asks for a turn hook on every page that does not close a section. The page skill (1.12.0) puts the hook in the last panel, never in an early one, and never invented. The plan goal adds the warning `PAGE_TURN_HOOK_MISSING` (more than 25% of such pages without a hook, at least 4 such pages). It is a warning because it fails the D26 cost test (38% of the judged-good pages).
- Statement: No page check for the last panel is added. The page goal does not receive the previous page spec.
- Why: On 320 judged pages of 9 runs, a page that does not close a section has a page-turn mean of 3.49 with a planned hook and 3.18 without (95% interval of the difference 0.23 to 0.40, the sign holds in 9 of 9 runs). Properties of the last panel (a question, the last planned claim, dialogue, a close shot, a hook spent early) show differences of 0.01 to 0.12 and fail P and L. A gain from the previous page spec cannot be measured offline.
- Gate 1 fixes (track fxw, issue #82; skills `adaptation-plan` 1.7.0 and `manga-page` 1.14.0) REPLACE the first two statements. Measured on the two-tale Gate 1 run (22 pages): hooks rose from 10 to 18 of 22, the page-turn mean fell from 3.56 to 3.48, pages that gained a hook gained 0.07 (hook pages 3.83 to 3.43), and the next page repeated the hook line on 3 of 12 adjacent pairs that share a unit (v0.2: 0 of 5). The 3.49 against 3.18 link was selection: the planner put hooks where the book has one. So: (1) the plan skill asks for a hook where the story has one, about every 2 to 4 pages, never forced; the page after a hook answers it or moves on. (2) `PAGE_TURN_HOOK_MISSING` is REMOVED (it pushed a hook on every page; the measurement no longer supports it). The plan goal now warns `PLAN_BEAT_REPEATED` when two consecutive pages have the same beat text. (3) The page goal receives the previous page's PLANNED beat and `page_turn_hook` from the plan (data; none for page 1) and the skill says: the first panel never repeats the previous page's hook line or last picture. The previous page's written spec is still not given (pages are written in parallel).
- Status: accepted for the next live run (the first two statements as amended above). The effect is not measured; Gate 1 on the next run must show repeated panels and page-turn defects back near v0.2 (0.12, 0 to 1). Tables: `docs/v0.3/W1-writer.md` section 3 and 'Gate 1 fixes'.

### D33. Fidelity labels: no new label, `QUOTE_CLIPPED` is not run (2026-10-14, issue #83, track W1)
- Statement: There is no label `quote (cut)` and no new rule for trimmed quotes or near-verbatim paraphrases. The page goal no longer runs `QUOTE_CLIPPED` (the function stays for the calibration scripts). The skill keeps "never splice, never trim the punchline" and adds where to cut and how to label.
- Statement: A calibration hit leaves out the judge defects that name the check code. The judges read the page warnings, and 10% of the major and blocker defects name a code.
- Why: `QUOTE_CLIPPED` hit 55% against a 27% base on its face. All 26 pages whose defects name the code are among its 31 flagged pages. Without those defects: 32% against 26% (window 2 to 6) and 33% against 26% (window 3 to 6), no signal, as in v0.2. A cut quote is cited twice as often as a plain one (20% against 10%), but 26% of the quotes have a cut, a page-level rule flags 46% of the good pages, and pages with a cut quote do not score lower on fidelity (3.60 against 3.49). A label would be a contract change in `packages/manga-render`.
- Status: accepted. The #94 default (remove it if there is again no signal) is applied. Tables: `docs/v0.3/W1-writer.md` section 4.

### D34. Continuity follow-ups: the location check stays a warning, minor speakers get names (2026-10-14, issue #87, track W1)
- Statement: `PLAN_LOCATION_NOT_IN_UNITS` and `PLAN_PLACE_UNLISTED` stay warnings. The Sources drawer shows the name of a minor speaker ("A watchman") from the figure id instead of "Someone". The plan and page skills tell the writer to stage each panel where and when the source puts it.
- Why: On 290 judged pages with model-written units, `PLAN_LOCATION_NOT_IN_UNITS` flags 16 pages, 4 with a setting complaint (25%) against 34% on the others (one-sided Fisher p = 0.84): not better than chance, so no promotion (the #94 rule). On the Just So runs the largest class of continuity complaints is place (18 of 55; 14 owned by the renderer), then scale (13) and identity (9).
- Status: accepted. The drawer change is frontend only. A backend change that names the `m_` ids in `speakers` would also fix the Reader. Tables: `docs/v0.3/W1-writer.md` section 5.

### D35. No wall-clock limit for a failing page attempt (2026-10-14, issue #84, track O1)
- Statement: PanelSummary adds no new limit on the duration of one page attempt. The existing limit stays (`PAGE_LIMITS.timeoutMs`, 720 s, and the submit limit of 8). `settings.py` gets no new value.
- Why: The measurement of 11 v0.2 runs (388 page attempts, all Flash) found a longest attempt of 126 s (385 accepted: median 34 s, P90 60 s; 3 failed: 93 to 126 s, all stopped by the submit limit). A limit of 180 s or more changes no attempt and saves 0 s in every run. A limit of 120 s would cut one accepted page (126 s, score 3.75) to save 6 s. The earlier tail (failed attempts of 199 to 611 s) was in M3 runs before the F1 fix and did not come back. Data: `docs/v0.3/O1-ops.md` section 2.
- Status: accepted. Re-open if a measured run has a page attempt above 300 s that then fails.

### D36. No second host in v0.3: the plan headroom endpoint is not called (2026-10-14, issue #85, track O1)
- Statement: The worker talks only to `api.minimax.io` (D2). It does not call `GET https://www.minimax.io/v1/token_plan/remains`, and the preflight shows no plan headroom. The claim "the app talks only to api.minimax.io" stays.
- Why: The endpoint is on a second host (`www.minimax.io`). The owner did not approve a second host for v0.3. MiniMax still publishes no price for MiniMax-M3.1-Flash-Preview (checked 2026-10-14 on the pay-as-you-go page, the rate-limit page and the M Plan pages), so costs stay estimates at M3 rates (the recorded cost equals the M3 Standard rates to the cent). Data: `docs/v0.3/O1-ops.md` section 3.
- For v0.4 the owner decides: (1) whether a second host is acceptable, with the egress claim changed to name it and say it is read-only for the plan endpoint; (2) if yes, the call goes in the worker only, uses the existing key handling, never logs the key or headers, and its host appears in `/internal/v2/egress`; (3) if no, the preflight stays an estimate.
- Status: accepted for v0.3.

### D37. The reader opens at the read size at 1440x900 (2026-10-14, issue #93, track U1)
- Statement: The reader opens a page at the read size (0.7 px per page unit on a wide screen) and shows the top of the page. It does not fit the page height on open. The "Whole page" chip floats beside the page only when the graphite beside the page is 176 px wide or more; on a narrower stage it is in the bottom bar. It never covers the art.
- Why: Measured at 1440x900 on a 22-page replay run: the smallest balloon or caption text is 15.4 px at the read size and 10.68 px when the page height is fitted. The rule was to fit the page only if the smallest text stays at 14 px or more.
- Evidence: `docs/v0.3/U1-ui.md` (measurements, screenshots). The reader tokens and the page SVG did not change.
- Status: accepted for v0.3.

### D38. Continue with the next section: a versioned understanding, a prior input, a deterministic merge (2026-10-14, issue #80, track M1)
- Statement: Each accepted understanding is stored with its book in `book_understandings {book_id, version, understanding, edition_id, scope, prior_version}`. The version counts from 1 for each book. There is one row for each edition. An edition records `understanding_version` (the prior version it used, or none) and `understanding_version_produced`.
- Statement: `POST /books/{id}/editions` accepts `continue_from` (a finished edition of the same book) with a scope. The worker request of the understanding then has a `prior` input: the understanding that the earlier edition produced. The prior is data from an earlier model output. It is in its own escaped block (`<prior_understanding>`), never in the instructions.
- Statement: The goal keeps the prior cast and locations by a deterministic merge in the worker, not by a check that rejects a change. Prior members are copied unchanged into the candidate before every check. Only new members come from the model. A listed prior cast member can only gain `sections` and `states`. A listed prior location can only gain `units` (its prior units plus the units of the new scope that the model gives for that id). Other fields it carries are dropped, with the warning `PRIOR_CAST_KEPT` or `PRIOR_LOCATION_KEPT`. The place check accepts the prior units of a prior location (they are units of earlier parts and valid by construction) and checks every other unit, and every unit of a new location, against the new scope. A new member with the name of a prior member is the error `PRIOR_CAST_DUPLICATE`, with a repair message.
- Why: A rejection would make the model repeat a long prior and could loop on a look it cannot see. A merge makes the guarantee (same ids, names, looks, `fit`, `wanted`) true for every output, and the warning keeps the change visible (D11). The model stays free to add cast, places and states for the new text.
- Statement: The scope of a continuation must not repeat a drawn scope. The check is on source units over the whole chain of parts, not only the last one. The answer is 422 with a plain reason. There is no override in v0.3. The D19 limits apply to the new scope. Without `continue_from` nothing changes.
- Status: accepted. The first live run (Just So tuning book, part 2) found a fault in the place check and in a look read; both are fixed (`docs/v0.3/M1-continue.md`, "Live finding"). Part 2 is not yet measured on a live run after the fix. Tables and the API text: `docs/v0.3/M1-continue.md`.

### D39. Page numbers of a series are on the book page only (2026-10-14, issue #80, track M1)
- Statement: An edition records `continues_edition_id` and `first_page_number` (the first page number of the earlier part plus its page count). The reader is frozen (v0.3 plan section 4.3), so it keeps numbering each edition from 1. The book page shows the parts as one series ("Part 2 · pages 23–40") with a link to the reader of each part, and a control "Continue with the next section" that never has the words "Generate manga".
- Why: One reader over several editions would change the reader and its URLs, which are test hooks. This differs from the issue text, which asks for continuing numbers in the reader.
- Status: accepted. The owner can ask for series numbers in the reader later.

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
