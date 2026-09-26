# Decision: one harness-driven production path (2026-09-25)

Evidence: `docs/rebuild/phase1/{backend-path,harness,frontend-rendering,hygiene}.md`.

## What is true today

- Generate → `POST /manga-projects/{id}/build` → Celery → the v1 Python pipeline
  (8 book stages + 26 slice stages). It calls MiniMax over direct HTTP, not the harness.
  Image models are on by default. A deterministic "repair" stage fakes passing quality.
  Status flips to `complete` after every slice. Book understanding reads about 25% of the
  text. The main reader ignores authored geometry, splits dialogue into fake second
  speakers, and draws no characters without image-model sprites.
- The Pi harness (`packages/agent-runtime` + `apps/agent-worker`) works against MiniMax
  today (live runs accepted on M3). Four blockers keep it out of the product: the model
  never sees rejection reasons (error-shape mismatch), nothing in the app calls it, the
  v2 reader collapses scopes, and page art calls an image model.

## Options compared

| | A. Keep agentic lane shape | B. Staged narrow goals, local tools (chosen) | C. One long whole-book pass |
|---|---|---|---|
| Shape | direction → page writing → thumbnail per 2-page scope, Python broker, layout goal | understanding (1/book) → plan (1/book) → page goal (1/page, parallel) with local validate/preview tools | one session writes every page |
| Reliability | history of walls (tool-frame mangling, schema flailing, blind repair) | small payloads, JSON-string submit, visible errors, retries per page | one failure loses the book; output caps truncate |
| First readable page | ~5 min per 2 pages after direction | understanding + plan + 1 page (measure in Phase 3) | only when the whole pass ends |
| Whole-book throughput | 3 sessions per 2 pages, serial | pages in parallel (bounded) | bounded by one stream |
| Recovery | stage keys exist but no product entry | page-level idempotency; resume skips accepted pages | restart from zero |
| Fidelity | claims density limited by 2-page scopes | plan assigns claims to pages with an explicit coverage ledger | model self-reports |
| Visual quality | image-model raster | deterministic SVG renderer, same code for preview and reader | same renderer, less review |
| Complexity | Python broker + auth + 3 goals + layout goal + page art | worker-local tools; backend only persists | simplest code, weakest control |
| Cost | ~3 sessions / 2 pages | ~1 session / page + 2 per book | lowest calls, highest waste on failure |

Option B is the production shape. Phase 3 experiments test B against a C-like variant
(one session writes a whole section) and M3 against M2.7-highspeed before the page goal
is locked.

## The chosen architecture

```text
PDF ─► parse (PyMuPDF, headings, page-true source units)          [backend runner]
    ─► BOOK_UNDERSTANDING goal: cast + looks, locations, claims    [worker, MiniMax]
    ─► ADAPTATION_PLAN goal: pages, beats, claim→page ledger       [worker, MiniMax]
    ─► MANGA_PAGE goal per page (parallel, idempotent):            [worker, MiniMax]
         tools: get_source · validate_page · render_preview(PNG→M3) · submit_page
         submit = validate + deterministic render (packages/manga-render)
    ─► persist accepted page spec + SVG + geometry + receipts      [backend runner]
    ─► reader shows the persisted SVG, panel zoom from geometry    [frontend]
```

1. **Harness.** Keep the sealed Pi session (pinned `@earendil-works/pi-coding-agent`
   0.80.10), no builtin tools, untrusted-data tagging, step/cost/tool-call limits, abort.
   Replace the donor goal/broker layer with generic goals whose domain tools run inside
   the worker against the goal's bounded input. No broker round trip, no stage
   authorization graph, no service-token pair for tools. Submit tools take one
   `candidate_json` string (the audit showed strings survive the anthropic tool frame).
   Tool errors are returned to the model verbatim. `thinkingLevel` is explicit and
   recorded. One worker process serves every allowed model (M3, M2.7-highspeed);
   the request names the model; the receipt records it.
2. **Renderer.** New TypeScript package `packages/manga-render`: layout compiler
   (templates + authored split trees), scene composer, character rig, environments,
   props, FX and screentone, lettering engine with bundled OFL fonts (measure, fit, or
   reject; never truncate), validator, SVG writer, and PNG raster (`@resvg/resvg-js`).
   The worker uses it for validation, previews, and the final render. The reader shows
   the persisted SVG, so the reader shows the exact accepted artifact.
3. **Backend.** FastAPI keeps upload, books and PDF page images. Celery and Redis are
   replaced by a Mongo-leased job runner process (`python -m app.runner`): parse jobs
   and generate jobs, stage records, heartbeats, resume after a crash, cancel that
   reaches the worker. New collections: `book_sources`, `editions`, `edition_artifacts`,
   `edition_pages` (unique `edition_id + page_number`), `generation_jobs`.
4. **Visible failure.** A page that fails validation after its retry budget is stored as
   `failed` with the reasons and shown as a failed page in the reader. A job with failed
   pages ends `completed_with_failures`, never `complete`. Omitted claims are listed with
   the planner's reason. No silent template filler, no fake fact stamping.
5. **No image models.** No image-generation code is on the path. The worker records
   every outbound host it calls; the acceptance check asserts only
   `api.minimax.io` was called and that no image-generation module exists.
6. **Reading direction.** Left-to-right by default for English books (the test books and
   the audience). The layout compiler supports mirrored RTL pages as an option.

## What gets removed (after the new path is proven)

The v1 pipeline (`backend/app/manga_pipeline/`, `services/manga/*`, Celery tasks), the
image-generation cluster, the old agentic lane (Python broker tools, director/planner
drivers, whole-book chain, page-art stage), donor goals and skills, the `/v2` and
`/v2lane` readers and their components, reel code, stale docs and handoffs, unused
dependencies. Preserved decisions move into the README and `docs/decisions.md`.
