# Next-Session Prompt — "Finish Task 5C/5D visual proof"

Paste everything below this line into the next implementation session.

## Current handoff (2026-07-10)

The implementation and DB acceptance work is complete on branch
`visual-upgrade-phase-v`, but the final visual screenshot gate is still open.
Do not regenerate the database unless the persisted state is lost: project
`6a0b5a5b201a8d03f1d82503` currently has 1 slice, exactly 13 validated pages,
8 preserved assets, and all 13 pages pass the sprite/bubble placement rubric.

The remaining task is to start the app on backend `:8001` (never touch the
unrelated process on `:8000`), point the frontend at `http://127.0.0.1:8001`,
and capture all 13 reader screenshots for book
`6a0b5a11201a8d03f1d82501` / project `6a0b5a5b201a8d03f1d82503`. Save them under
`docs/renderer-analysis/experiments/` with date-stamped Task 5 names and record
the page-level visual rubric in `NEXT_SESSION.md`. Only then is Task 5 fully
closed.

The last attempt could not capture screenshots because the in-app browser
surface exposed no browser sessions. Retry the required browser workflow when
that surface is available; do not substitute an unapproved browser tool.

Verification already passing: backend `pytest tests -q` (462 passed), frontend
`npm exec tsc -- --noEmit && npm run build`, MiniMax-M3 structured smoke, and
the DB rubric (13/13 pages). The hard policy remains MiniMax-M3/server-owned
`MINIMAX_API_KEY` for every text/structured/review/repair/vision call;
OpenRouter is image-generation-only. Do not use OpenRouter text fallback.

---

You are working on PanelSummary (Book-Reel) at `/Volumes/Mrigesh SSD/Book-Reel`.
Read these first, in order:

1. `AGENTS.md` (conventions, contract boundaries, gotchas — `CLAUDE.md` is an identical copy; keep both in sync if you edit them)
2. `docs/analysis/SHORTCOMINGS_AND_VISUAL_UPGRADE.md` (current diagnosis — the
   shortcoming IDs A1–A5, B1–B8, C1–C5 below refer to that doc)
3. `docs/ARCHITECTURE.md`, `docs/MANGA_BUILD_FLOW_AND_IMAGE_COST_PLAN.md`

**Mission:** the generated manga currently reads as text cards in empty panels
(see `docs/analysis/2026-07-05-live-reader-page1.png`). Make a generated slice
*read like an actual manga page* — art-first, ≤ ~60 words per page, dialogue in
bubbles, sprites visible and grounded, SFX as drawn lettering — while spending
zero or near-zero image budget beyond the existing sprite/key-panel caps.

**Hard constraints:**

- `RenderedPage` stays the contract boundary. All DSL changes are additive with
  legacy fallback; existing persisted pages must still render. Update backend
  Pydantic models and `frontend/lib/types.ts` mirrors together.
- Do not touch the book-understanding stages' outputs (facts/bible/arc are good).
- **Hard provider policy:** every text, structured-output, review, repair, and
  vision LLM call uses the server-owned `MINIMAX_API_KEY` and a MiniMax model.
  Do not add an OpenRouter/OpenAI quality fallback or ask the browser for a text
  API key. This applies to every pipeline stage, not only drafting.
- OpenRouter is image-generation only. Keep
  `google/gemini-2.5-flash-image` as the sole default low-cost image model and
  never escalate automatically to a more expensive model.
- Keep image budgets as-is (`budgeted`: 8 sprites, ≤3 key panels/slice).
- Every visual change needs before/after screenshots of the same project
  (book `6a0b5a11201a8d03f1d82501`, project `6a0b5a5b201a8d03f1d82503`).
  Headless Chrome works:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless
  --no-sandbox --window-size=1280,1600 --virtual-time-budget=25000
  --screenshot=out.png "http://localhost:3000/books/<book>/manga/v2?project=<project>"`
- Log to `NEXT_SESSION.md` (recreate it) as you work: files changed,
  screenshots, commands run, blockers, next step.

**Task order (stop at any clean boundary; each block is shippable):**

1. **Kill the text-wall (A1–A4).**
   - Renderer: dialogue always renders as bubbles — split long lines across
     2–3 bubbles with autofit type instead of demoting to captions; delete the
     `speaker_id:` caption path (`DialoguePanel.tsx` CaptionBox), the
     `text-card` demotion (`panel_presentation.ts`), `clampVisibleText`
     truncation, and the `S01`/character-id chrome badges.
   - Backend: tighten `manga_dsl.py` budgets — ≤2 dialogue lines/panel,
     ≤ ~90 chars/panel, page total ≤ ~60 words, narration ≤1 caption per 3
     panels and ≤15 words each, as *errors*; teach `quality_repair_stage` to
     fix overflow by splitting beats into more panels or cutting words. Script
     stage prompt: numeric budgets + "convert narration to silent panels,
     action, or SFX" + use display names, never ids.
2. **Vector scene layer (B4, the big win).** Add an optional per-panel
   `vector_scene` to the DSL: constrained primitives (background fill/gradient,
   screentone dots, hatching, horizon/interior line-work, character
   silhouettes, speedline burst, radial focus, vignette, SFX lettering with
   rotation/stroke). Author it in a new visual-direction stage (MiniMax lane)
   from `composition`/`action`/`shot_type`/`purpose`. Render it in the frontend
   behind sprites/bubbles (inline SVG; sanitize if you allow raw SVG). Empty
   beige panels must disappear: every panel gets at least tone + line-work that
   matches its shot type.
3. **Manga typography & page drama (B5–B7).** Lettering fonts (Komika/Comic
   Neue body, display font for SFX), irregular bubble outlines with real tails,
   bubbles may overlap panel borders, heaviest visual weight on
   `page_turn_panel_id` (border weight/bleed/tone contrast), border style
   varies by purpose.
4. **Sprites that land (B1–B3).**
   - Feed the composition stage an asset manifest (character_id × expression ×
     asset_type × aspect); raise its `max_tokens` (C2) or go per-page; validate
     `sprite_layers` refs against the manifest.
   - Renderer: characters with only a `reference_sheet` get a derived crop
     rendered (never `null`); sprites grounded to panel bottom, scaled by
     shot_type, layered under bubbles.
   - Regenerate the sample project's sprite bank transparent (`background:
     "transparent"`); verify alpha; then regenerate the slice end-to-end.
5. **Verify like a mangaka.** Regenerate the sample slice, screenshot all
   pages, and check against the rubric: ≤60 words/page; every dialogue in a
   bubble with a tail near its speaker; no `speaker:` prefixes; no dev chrome;
   no empty beige panels; sprites visible for michael/hem/haw; page-turn panel
   visually dominant; at least 3 distinct shot types visible per page spread.
   Put before/after screenshots in `docs/renderer-analysis/experiments/` with
   date-stamped names and update `docs/analysis/SHORTCOMINGS_AND_VISUAL_UPGRADE.md`
   status notes + `CLAUDE.md` if contracts changed.

**Explicitly out of scope this session** (design notes welcome, no code): the
MCP/harness-driven orchestration mode (C1/O3 in the analysis doc) and the
vision-critique auto-loop (O2) — sketch the tool surface in `NEXT_SESSION.md`
if time remains.

**Run notes:** backend on :8000 (FastAPI + Celery + Redis + Mongo — see
`start.sh` / `docker-compose.yml`; Celery log at `/tmp/panelsummary-celery.log`).
Frontend: `cd frontend && npm run dev` (:3000). Live pages API:
`GET http://localhost:8000/manga-projects/<project>/pages`.
