# PanelSummary — Shortcomings Analysis & Visual Upgrade Plan

Date: 2026-07-05
Scope: analysis only. No code was changed in this session.
Evidence project: book `6a0b5a11201a8d03f1d82501`, project `6a0b5a5b201a8d03f1d82503`
("Who Moved My Cheese?", 11 pages, 1 slice, 8 character assets, `image_mode: sprites_only`).

This document supersedes nothing; it *extends* `docs/renderer-analysis/findings.md`
(2026-05-23) with a post-"reader-polish" (2026-06-07) re-diagnosis, manga-craft
benchmarks, and a concrete upgrade strategy. The paste-ready implementation prompt
lives at `docs/next-prompt.md`.

---

## 1. Executive verdict

The 2026-05-23 diagnosis ("content is good, renderer is the blocker") is now only
half true. After the renderer contract expansion and the June polish pass, the
system has a *capable skeleton* — expanded `PageComposition` (panel boxes, sprite
layers, bubble placements, row heights, bleed, z-order), budgeted image modes, an
idempotent sprite library, kishōtenketsu arc budgets — but the *page a reader sees
is still a slide deck, not a manga*. Three failures compound:

1. **Text is doing the art's job.** The pipeline writes and displays 2–3× more
   text than manga craft allows, and the renderer demotes what it can't fit into
   literal text boxes.
2. **The sprite bank exists but almost never reaches the page.** Most generated
   assets are `reference_sheet`s the renderer refuses to draw; the rest are pasted
   as white-background rectangles.
3. **Nothing draws the scene.** When there is no painted panel and no usable
   sprite, the panel is an empty beige void with a caption strip — there is no
   synthetic/vector art layer to carry composition, mood, or motion.

Evidence: `docs/analysis/2026-07-05-live-reader-page1.png` (live reader, page
1/11) — five empty panels, every dialogue line rendered as a `speaker: text`
caption strip, zero bubbles, zero sprites, two stray `S01` dev badges.

---

## 2. Manga-craft benchmarks (research, 2026-07-05)

From letterer/publisher rules of thumb (Dark Horse script guide, working
letterers) and direct inspection of One Piece ch. 1187 (TCB scan):

| Metric | Real manga | PanelSummary today |
|---|---|---|
| Words per bubble | ≤ 8–10, often 2–3 | up to ~11 visible, then truncated with `...` |
| Words per panel | ≤ 25 hard, ≤ 12 ideal | DSL allows 160 chars (~30 words) + unlimited narration |
| Words per page | ~60 total | sample slice: 664 dialogue+narration words / 11 pages ≈ 60/page **but** concentrated in 3–4 panels/page as caption blocks |
| Narration | rare, atmospheric, 1 caption per few panels | narration is the *primary* channel (453 narration vs 211 dialogue words) |
| SFX | huge hand-lettered art elements, cross panel borders | thin decorative layer, rarely visible |
| Art per panel | 100% — establishing wides, close-up stacks, speedlines, tones | empty gradient + faint diagonal lines |
| Bubbles | organic shapes, tails to speakers, overlap panel borders | boxy rounded rects when they render at all; on the live page, none render |
| Page turn | bottom-left cliffhanger panel, visually heaviest | field exists (`page_turn_panel_id`), no visual weight; known narrow-cell warnings |

One Piece observations worth encoding as rules: an action page can carry **4
words total**; a dialogue page ~30; every panel still reads without its text;
SFX and bubbles are *drawn objects inside the scene*, not UI chrome on top of it.

Story-structure note: the kishōtenketsu structure the pipeline already models
(KI/SHO/TEN/KETSU arc roles in `manga_dsl.py`) matches the craft literature
(goteenwriters "Manga Toolbelt"). The structural layer is not the problem.

---

## 3. Shortcoming catalog (ranked, with code anchors)

### A. Text density & formatting (the "too much text" complaint)

- **A1 — Speaker-id leak.** `frontend/components/MangaReader/panels/DialoguePanel.tsx:241`
  renders demoted dialogue as `` `${line.speaker_id}: ${line.text}` `` in a caption
  box. Readers see `nathan: We're all trying to cope...`. Raw IDs are also used as
  visible speaker tags elsewhere (lowercase ids, not display names).
- **A2 — Dialogue demotion to captions/text-cards.** `shouldUseCaption()`
  (`DialoguePanel.tsx:110`) demotes any line > `maxBubbleChars` (34–44) to a
  caption; `panel_presentation.ts:104` turns the whole panel into a `text-card`
  when the longest line > 58 chars or total > 96 or > 2 lines. Result: on the
  live page, *every* panel is caption-only. Manga never demotes speech to
  captions — it splits text across bubbles/panels or cuts words.
- **A3 — Silent truncation.** `clampVisibleText(line.text, 54)`
  (`DialoguePanel.tsx:162`, `panel_presentation.ts:82`) cuts displayed dialogue at
  ~54 chars with `...`. Source-grounded content is silently lost at render time.
- **A4 — Budgets 2–3× too generous, and no narration budget.**
  `manga_dsl.py` `DialogueBudget` = 3 lines / 160 chars per panel, 10 lines/page.
  There is *no* cap on narration length or on captions per page; the script stage
  prompt says "use narration sparingly" but nothing enforces it. Sample slice:
  narration words outnumber dialogue 2:1 — backwards for manga.
- **A5 — No show-don't-tell conversion.** Nothing turns "The group chats, then
  falls into contemplative silence" (narration) into *panel direction* (silent
  panel, wide shot, motes in sunlight). `composition`/`action` fields carry good
  visual intent (672 words in the sample) that the renderer never visualizes.

### B. Visual & sprite failures (the "not a manga" complaint)

- **B1 — Reference sheets never render.**
  `frontend/components/MangaReader/chrome/SceneSprites.tsx:145` returns `null`
  for `asset_type === "reference_sheet"`. Sample project: 5 of 8 assets are
  reference sheets; characters with only a reference sheet (michael, haw) can
  never appear on any page. The asset planner buys images the renderer refuses
  to use.
- **B2 — White-box sprites.** Sprite prompts ask for "clean white background";
  PNGs ship with opaque white boxes and are `object-fit: contain`-pasted mid-panel
  (June screenshot, bottom panel). No transparency request, no matting step.
- **B3 — Compositor is blind to the asset library.**
  `page_composition_stage.py` prompts the LLM to author `sprite_layers`
  referencing "existing character_id/expression" but its payload contains **no
  asset manifest**. Missing combos are silently omitted by the renderer
  (`missingSpriteFallback: "omit"` in every presentation branch) → empty panels.
- **B4 — No synthetic scene layer.** Without painted art or sprites a panel shows
  a beige gradient + faint diagonal stripes (`MangaPanelRenderer.tsx:178-188`).
  There is no vector/SVG background system (interiors, horizons, silhouettes,
  speedline bursts, radial focus, screentone fills) despite the DSL carrying
  per-panel `composition` framing notes that describe exactly what to draw.
- **B5 — Dev chrome leaks.** `S01` scene badges (`DialoguePanel.tsx:300`),
  character-id tags (`ConceptPanel.tsx:48`, `NarrationPanel.tsx` tag), monogram
  placeholders in older builds. Real manga pages carry no UI.
- **B6 — Uniform panel treatment.** Same border, same background, near-equal
  emphasis regardless of `shot_type`/`purpose`; SFX layer thin; screentone only
  behind an `effects` flag; no bleeds in stored data; page-turn panel gets no
  visual weight (and upstream sometimes puts it in a 20–30% cell —
  `DSL_RTL_PAGE_TURN_NARROW` ×10 in the sample quality report).
- **B7 — Formulaic fallback layout.** Synthetic sprites are evenly spaced and
  alternately mirrored (`SceneSprites.tsx:53`), bubbles cycle 3 hardcoded slots
  (`DialoguePanel.tsx:57`) — no relationship to the authored composition text.
- **B8 — Stored pages predate the expanded contract.** The 11 sample pages have
  only `gutter_grid`; regeneration (or a migration compositor pass) is required
  before the new renderer paths can even be judged.

### C. Orchestration, providers, cost

- **C1 — One-shot stages, no visual feedback loop.** Every stage is a single
  structured LLM call with schema retries. Nothing ever *looks at* a rendered
  page. The scaffolding exists (`vision_client.py`, Playwright-style screenshots
  used manually in `docs/renderer-analysis/experiments/`) but no
  screenshot → critique → repair loop runs in the pipeline.
- **C2 — `page_composition` starved.** One call, `max_tokens=4000`, must author
  geometry for 5–8 pages including sprite/bubble boxes. Truncation → validation
  failure → silent empty fallback (legacy layout). The most important visual
  stage has the smallest budget.
- **C3 — Resolved 2026-07-10: MiniMax text lane is mandatory.** All text,
  structured-output, repair, and vision LLM calls are hard-routed through the
  server-owned `MINIMAX_API_KEY`; OpenRouter is image-generation only. This
  removes OpenRouter text spend, but MiniMax reliability still needs monitoring.
- **C4 — Image API underuses OpenRouter capabilities.** `image_generator.py`
  predates OpenRouter's unified image API: no `background: transparent`
  (normalized across providers; PNG/WebP), no `openai/gpt-image-1`
  (native transparency + strong text rendering + up to 16 reference images), and
  reference conditioning is restricted to Gemini models by a hard guard.
- **C5 — Doc drift.** `CLAUDE.md`/`AGENTS.md`/`ARCHITECTURE.md` reference
  `docs/next-prompt.md` and `NEXT_SESSION.md`, both deleted from the working
  tree. (Fixed on 2026-07-05: next-prompt recreated, agent guides updated.)

---

## 4. What already works — do not break

- Staged pipeline with typed Pydantic contracts, schema-retry, graceful
  composition fallback; book-level understanding artifacts; fact grounding +
  continuity ledger; script review/repair loop.
- Kishōtenketsu arc roles with panel/page budgets; RTL + page-turn validation.
- Image cost control: `none | sprites_only | budgeted | full_panel_art` with
  sprite budget (8) and key-panel budgets (3/slice) — the philosophy the product
  wants (DSL renders the manga; images are accents) is already implemented.
- Idempotent asset library (stable asset IDs, retries never re-buy), sprite
  quality gate incl. silhouette scores, pinning.
- Expanded `PageComposition`/`RenderedPage` contract and a frontend that honors
  explicit boxes/sprites/bubbles when present, with legacy fallback.
- `RenderedPage` as the single contract boundary; backend models mirrored in
  `frontend/lib/types.ts`.

---

## 5. Upgrade strategy

Ordering principle: **fix what the reader sees with zero image spend first**
(text discipline + vector art), then make paid sprites actually land, then wire
the feedback loop and providers. Each phase is shippable alone; all changes are
additive to the DSL with legacy fallback.

### Phase V — Visual-first rendering, no image spend

1. **Text discipline end-to-end.**
   - Tighten `DialogueBudget`: ≤ 2 lines/panel, ≤ ~90 chars/panel (≈ 15 words);
     add per-page word budget (~60) and a narration budget (≤ 1 caption per 3
     panels, ≤ 15 words each) as *errors*, with the quality-repair stage
     rewriting overflow (split beats into more panels, cut words) — never the
     renderer truncating.
   - Script stage: explicit numeric rules + "convert narration into silent
     panels / action / SFX whenever possible" + display names for speakers.
   - Renderer: dialogue is *always* bubbles (split across bubbles, autofit font
     within limits); delete caption demotion (A2), speaker-prefix captions (A1),
     truncation (A3), scene badges and id tags (B5). Narration renders as small
     rectangular caption boxes at panel corners, manga-style.
2. **Synthetic vector scene layer (the big visual win).** New optional DSL field
   per panel (e.g. `vector_scene`): a constrained set of primitives (bg fill /
   gradient / screentone dots / hatching, horizon or interior line-work,
   character silhouettes, speedline bursts, radial focus, vignette, SFX
   lettering with stroke/rotation) authored by a new **visual direction stage**
   from `composition`/`action`/`shot_type` — or direct sanitized SVG authored by
   the LLM (sanitize: whitelist tags/attrs, strip scripts/foreignObject/href).
   Render behind sprites/bubbles. This is what makes empty panels feel drawn.
   Optional libs: rough.js for hand-drawn stroke feel; comical-js as reference
   for organic bubble shapes.
3. **Manga typography & chrome.** Lettering fonts (Komika family / Comic Neue;
   Bangers or similar for SFX), irregular bubble outlines, bubbles allowed to
   overlap panel borders, page-turn panel gets heaviest ink (thicker border,
   bleed allowed, tone contrast). Panel borders vary by `purpose` (flashback =
   wavy/dashed is a classic convention).
4. **Regenerate the sample slice** so stored pages carry the expanded
   composition fields; keep the old slice for before/after.

### Phase S — Make the limited image budget count

1. **Transparent sprite bank.** Switch sprite generation to OpenRouter unified
   image API with `background: transparent` (gpt-image-1 natively; Gemini
   image + local `rembg` matting as fallback). Post-validate alpha coverage.
   Regenerate the 8-asset bank for the sample project once.
2. **Poses over portraits.** Planner default: per important character 1
   full-body neutral + 1–2 expression/pose crops, all transparent, silhouette
   scored. Reference sheets remain library-only artifacts (for conditioning),
   and the renderer gets a *derived crop* so B1 characters still appear.
3. **Feed the compositor the asset manifest** (ids × expressions × asset types +
   image aspect) so `sprite_layers` only references what exists; add a
   validation pass that rejects unknown refs.
4. **Key panels stay budgeted** (1–3/slice) and are conditioned on the sprite
   bank via multi-reference models (gpt-image-1 up to 16 refs / nano-banana
   identity preservation) for character consistency.

### Phase O — Orchestration & providers

1. **MiniMax text lane (implemented 2026-07-10).** All text, structured-output,
   review, repair, and vision stages use the MiniMax-M3 lane; M3's documented
   disabled-thinking mode preserves the output budget for contract payloads;
   there is no OpenRouter/OpenAI text quality fallback. Raise
   `page_composition` max_tokens only after validating MiniMax reliability;
   consider per-page composition calls.
2. **Visual QA loop.** After rendering, screenshot pages headlessly (Chrome
   headless worked in this analysis; Playwright is the robust choice) and run
   `VisionLLMClient` critique against a rubric (text fits, bubbles point at
   speakers, sprites grounded, page-turn weight, chrome-free); feed structured
   defects to a repair pass. This converts the existing one-shot pipeline into
   generate → look → fix, which is the actual difference between "LLM output"
   and "a page someone composed".
3. **Harness-driven generation (the user's idea) — worth building as a mode,
   not a replacement.** Expose the pipeline as tools (MCP server or thin CLI):
   `get_slice_context`, `validate_dsl`, `persist_rendered_page`,
   `render_screenshot`, `critique_page`… Then any agent harness (Claude Code
   etc.) can *be* the orchestrator — iterating with vision, judgment, and
   retries that a single API call can't match — while the backend stays the
   source of truth for contracts, validation, persistence, and the classic API
   path keeps working for users without a harness. Recommendation: design the
   tool surface in the next session, implement after Phases V/S prove the
   contract.

---

## 6. Open-source tools & services shortlist

| Tool | License | Use |
|---|---|---|
| OpenRouter unified image API | n/a | `background: transparent`, `input_references`; gpt-image-1, gemini-3.1-flash-image, nano-banana-pro |
| MiniMax API | n/a | cheap fast text lane (M2.x/M3), OpenAI/Anthropic SDK compatible |
| rembg | MIT | local sprite background removal / alpha cleanup |
| comical-js | MIT | comic balloon SVG reference/adoption |
| rough.js | MIT | hand-drawn SVG primitives for vector scene layer |
| Playwright | Apache-2 | screenshot loop for visual QA + renderer regression tests |
| satori | MPL-2 | optional server-side HTML→SVG/PNG export path |
| Komika / Comic Neue / Bangers | free / OFL | manga lettering + SFX typography (verify per-font license; Blambot $0 tier is nonprofit-only) |

## 7. Sources

- Dark Horse script format guide — https://images.darkhorse.com/darkhorse08/company/submissions/scriptguide.pdf
- Buzz Dixon, rough rules of thumb for comics writing — https://buzzdixon.com/home/writing-2/a-few-rough-rules-of-thumb-for-writing-comics-graphic-novels
- Speech bubble tips (letterer) — https://techmomma.tumblr.com/post/182656654445/speech-bubbleword-balloon-tips
- Go Teen Writers, "The Manga Toolbelt" — https://goteenwriters.com/2024/01/31/the-manga-toolbelt-for-fiction-writers/
- One Piece ch. 1187 (TCB) — https://tcbonepiecechapters.com/chapters/7991/one-piece-chapter-1187
- OpenRouter image docs — https://openrouter.ai/docs/guides/overview/multimodal/image-generation and https://openrouter.ai/blog/announcements/image-api/
- MiniMax API docs — https://platform.minimax.io/docs/api-reference/api-overview
- comical-js — https://github.com/BloomBooks/comical-js
