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
- Statement: Every model call goes through `apps/agent-worker` to `api.minimax.io`. The allowed models are `MiniMax-M3`, `MiniMax-M2.7-highspeed` and `MiniMax-M2.7`. Only M3 gets images.
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
- Why: A loud failure is better than a quiet wrong result in a paid pipeline. The old path faked passing quality.
- Status: accepted.

### D12. Idempotency and receipts (2026-09-25)
- Statement: The worker is idempotent by `run_id`. A repeated request returns the first result and does not run the model again.
- Statement: Resume and redraw skip accepted pages. Every goal stores a receipt: model, thinking level, tokens, cost estimate, latency, skill version and hash.
- Why: A retry must not charge twice. A cost figure without a persisted receipt is not evidence.
- Status: accepted.

### D13. Generation policy (2026-09-25, measured; revised 2026-09-26)
- Statement: All three goals use M3. Book understanding runs with thinking `low` and fixes
  rejections with `revise_understanding` patches. Plan and pages run with thinking `off`; a
  retry uses `low`. A page gets two attempts (4 previews, 6 submits each).
- Statement: Four pages run in parallel. The page goal gets a PNG preview (vision). No separate review pass runs.
- Why: See `docs/rebuild/EXPERIMENTS.md` §4-6 and `docs/rebuild/ACCEPTANCE.md`. Thinking off was
  3-5x faster at equal page quality. For the understanding it was fast but unreliable: acceptance
  run 2 cast the Happy Prince statue as a gold "rocket", and a later run reworded a description to
  evade the guard. Low was correct in every run; the patch tool cut its time from 11 to ~4.5 min.
  M2.7-highspeed miscast characters. The review pass did not pay for itself.
- Status: accepted. The configuration is in `backend/app/settings.py` and is recorded on each edition.

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
- Why: The whole book goes into one understanding call. That call wrote 36,000 to 78,700 output tokens and took 259 to 1,166 s on the measured runs, at 31 to 167 output tokens/s. The goal times out at 25 minutes. The largest book that finished end to end has 68 PDF pages and 16,159 words, so each limit is that figure plus 8 % (words) or 10 % (pages). A scope cannot be chosen safely without a table of contents the user can pick from, a persisted understanding per scope and a rule for characters that cross scopes. None of these exists, and a wrong cut would break the source grounding. See `docs/launch/T3-scope.md`.
- Status: accepted. The limits are not a promise that every book under them finishes. A slow provider hour can still time out the understanding, and the edition then fails with a visible reason.

### D20. Honest latency (2026-10-09)
- Statement: The edition stores `timings.generate_started_at`, `timings.drawing_started_at` and `timings.first_page_at` in the database. The first value stays after a resume.
- Statement: Pages start in reading order. No scheduling change is made in v0.1.
- Why: The measured critical path is understanding, then plan, then the first page. The plan waits for the whole understanding, and a page waits for the plan. No step can start earlier without a quality or honesty cost. The long tail of a run is a page that fails twice, not an idle gap. See `docs/launch/T3-scope.md`.
- Status: accepted. Estimates are ranges fitted to measured runs, and the basis text says so.

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
