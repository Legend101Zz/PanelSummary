# Phase 1 — Frontend journey and rendering system (truth audit)

Scope: `frontend/app`, `frontend/components` (MangaReader, upload, generate/progress UI),
`frontend/lib`, and the donor tree `/Volumes/Mrigesh SSD/ScrollStack-manga`.
Branch `product/harness-manga` at `a5e4fbc` (base `v2-architecture` @ `47ea74d`).
Audit date 2026-09-25. Read-only: no tracked file changed (`git status --short` is empty
after all runs).

Evidence labels:

- **[Code]** Code-resolved: read in the current source, cited `file:line`.
- **[Run]** Runtime-observed: this audit ran it. Scripts and screenshots are in the
  session scratchpad
  `/private/tmp/claude-501/-Users-comreton-Desktop/3b1640fe-8ce0-4ed7-b544-0b35ca3ba64d/scratchpad/phase1/`
  (`probe.ts`, `mock-api.mjs`, `shots.cjs`, `resume.cjs`, `shot-*.png`). That folder is
  temporary.
- **[Doc]** Doc-claim, not verified.
- **[Inf]** Inference.

How the runtime evidence was made: the real components were rendered to static HTML with
`react-dom/server` through `tsx` (`probe.ts`). Then a copy of `frontend/` (in the scratchpad,
`node_modules` symlinked) was built with `next build`, served by `next start` on
`127.0.0.1:3107`, and pointed at a disposable Node mock API on `127.0.0.1:8766` that returns
fixture `RenderedPage` docs shaped like `backend/app/domain/manga/render_view.py`.
`playwright-core` drove a headless Chromium at 1280px and 390px. No Mongo, Redis, Atlas,
MiniMax, or OpenRouter was touched. Port 3000 was never bound. Both servers were stopped.

---

## 1. Verdict in one screen

1. **The Generate button does not reach the harness.** It calls
   `POST /manga-projects/{id}/build`, which queues the Celery task
   `build_manga_project_task`. That task runs the v1 Python pipeline
   (`generate_book_understanding` + `generate_project_slice`), not `apps/agent-worker`.
   The frontend has zero references to the agent worker. [Code]
2. **With default settings, Generate fails before any request.** Image mode defaults to
   `budgeted`, so the button demands an OpenRouter image key and shows "Add an OpenRouter
   key only when generating images." No `/build` call is made. [Run]
3. **The main reader (`/books/[id]/manga/v2`) draws no characters without image-model
   sprites.** The only deterministic figure is one generic grey silhouette. Panels without
   sprites are beige dot-tone cards with a few thin lines. [Run] [Code]
4. **Authored geometry is not honoured.** Explicit panel boxes are forced to
   `position: relative` (panels fall off the page). Authored bubble boxes are dropped
   when a line is longer than 44 characters, and one line becomes two bubbles that read as
   two speakers. [Run]
5. **Developer chrome is all over the reader** (QA verdicts, fact counts, slice roles, raw
   character IDs, the book-understanding spine, a "Generate another slice" link). [Code] [Run]
6. **The v2-lane reader** (`/v2lane`) consumes compiled polygons, but only as a focus
   outline over a raster page that comes from image-model `page_art`. It is flag-gated and
   linked from nowhere. Under the no-image-model rule it has no content source. [Code]
7. `npx tsc --noEmit` passes. `next build` passes in 18.4 s. The 7 reader assertion tests
   pass. None of them covers the defects above. [Run]
8. **Donor verdict:** ScrollStack-manga has no deterministic art system. Its reader art is
   5 hard-coded CSS gradients, and its "deterministic demo" is hard-coded to one book. Its
   valuable parts (the layout compiler, the `MangaPagePlan`/`PageScript`/`TextElement`
   contracts, the manga skills) are **already in Book-Reel, byte-identical**. Take only its
   reader-shell UX ideas. [Code] [Run]
9. **Recommendation:** keep the contracts, the layout compiler, and the app shell. Rewrite
   the page renderer as one deterministic SVG renderer package with a reusable asset
   vocabulary (character rigs, environments, props, tones, FX, a lettering engine). It takes
   semantic IDs from MiniMax and never takes model-authored coordinates for art. See §9.

---

## 2. The real user journey today

| Step | Route / file | What happens | Label |
|---|---|---|---|
| Home | `app/page.tsx:97-104` | Marketing page (AttentionGame, MangaPivotSection, MangaShelf, Colophon). Calls `GET /health`, `GET /books`. Shelf links to `/books/{id}` (`components/HomePage/MangaShelf.tsx:63`). CTA goes to `/upload` (`app/page.tsx:267`). | [Code] |
| Upload | `app/upload/page.tsx:114-140` | `uploadPdf` = `POST /upload` multipart, 60 s timeout (`lib/api.ts:64-72`). Then `pollUntilComplete(task_id)` = `GET /status/{task_id}` every 2 s, 10 min cap (`lib/api.ts:313-335`). Redirects to `/books/{id}`. | [Code] |
| Upload (fake UI) | `app/upload/page.tsx:26-33, 106-112, 312-328` | Shows **fabricated chapter names** ("Introduction", "The Core Framework", …) as "CHAPTERS DETECTED" while parsing, keyed only to progress %. Also claims "Processed locally — Nothing sent to cloud until you summarize" (`:213`). | [Code] |
| Book page | `app/books/[id]/page.tsx:145-153` | Book header, chapter list, and `MangaV2ProjectPanel` (only when `book.status === "parsed"`). | [Code] |
| Panel load | `components/MangaV2ProjectPanel.tsx:383-451` | `GET /books/{id}/manga-projects`; for the first project: `GET /manga-projects/{pid}`, `POST .../next-source-slice {page_window}`, `GET .../pages`, `GET .../slices`, `GET .../assets`; plus `GET /image-models`. | [Code] [Run] |
| **Generate button** | `MangaV2ProjectPanel.tsx:847-855` → `handleGenerate` `:520-567` | 1) If image mode is not `none` and no OpenRouter key: error, stop (`:522-527`). 2) `ensureProject`: `POST /books/{id}/manga-projects` `{style, engine:"v4", title, project_options:{manga_pipeline:"v2", generate_images, image_mode, image_model, page_window, sprite_budget_total, key_panel_budget_per_slice}}` (`:498-518`, `lib/api.ts:110-126`). 3) `POST /manga-projects/{pid}/build` (`lib/api.ts:266-302`). | [Code] |
| Build payload | `MangaV2ProjectPanel.tsx:534-547` | `{api_key: <browser OpenRouter key>, provider:"minimax", model:"MiniMax-M3" (free-text input), mode:"next_chunk"|"full_book", page_window:10, generate_images, image_model, image_mode:"budgeted", sprite_budget_total:8, key_panel_budget_per_slice:3, key_panel_budget_full_book:8, options:{style}}`. The field named `api_key` carries the **OpenRouter image key** while `provider` says `minimax`. | [Code] |
| Backend side | `backend/app/api/routes/manga_projects.py:672-755`, `backend/app/celery_manga_tasks.py:44, 79-82` | Route queues `build_manga_project_task.delay(...)`. The task imports `generate_book_understanding` and `generate_project_slice` (v1 Python pipeline). **Not the Pi harness.** | [Code] |
| Progress | `MangaV2ProjectPanel.tsx:550-558, 857-880` | Polls `GET /status/{task_id}` every 1.5 s, 60 min cap. Shows a % bar, a phase label (`friendlyPhase` `:138-148`) and a 6-row stage list. No cancel button (`cancelJob` in `lib/api.ts:356` has no caller). | [Code] |
| Reader entry | `MangaV2ProjectPanel.tsx:890-899` | "Open manga reader (N)" → `/books/{id}/manga/v2?project={pid}`. Shown when at least one page has storyboard panels (`hasRenderedPage` `:108-113`). | [Code] [Run] |
| Main reader | `app/books/[id]/manga/v2/page.tsx:90-125` | Loads project, pages, slices, assets once (no polling). Renders `MangaPageRenderer` for one page in a 2:3 frame (`:241-251`). | [Code] [Run] |
| Character library | `app/books/[id]/manga/v2/characters/page.tsx:183-188` | Image-model sprite sheets: `POST .../character-sheets`, regenerate, pin. Needs the browser key. | [Code] |
| v2-lane reader | `app/books/[id]/manga/v2lane/page.tsx:33, 75-82` | Needs `NEXT_PUBLIC_MANGA_V2_LANE_READER=1`. Reads `GET /manga-projects/{pid}/v2/pages` (`lib/manga-v2-lane.ts:80-91`). **No link to it anywhere in the app** (grep `v2lane` finds only the route itself). | [Code] |
| PDF reader | `app/books/[id]/read/page.tsx` | PDF page PNGs, `?page=N` deep link, arrow keys. Not linked from the manga reader. | [Code] |

### 2.1 Flags

| Flag | Where | Effect |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `lib/api.ts:32`, `lib/manga-v2-lane.ts:12`, `app/books/[id]/read/page.tsx:28`, inlined at build time by `next.config.ts` `env` | API base, default `http://localhost:8000`. `frontend/.env.local` (untracked) sets only this key. |
| `NEXT_PUBLIC_MANGA_V2_LANE_READER` | `lib/manga-v2-lane.ts:76-78` | `"1"` enables `/v2lane`. Default off. Not set in `.env.local` or `start.sh`. |

There are no other `NEXT_PUBLIC_*` flags. [Code]

### 2.2 Provider and dev controls in the default flow [Code] [Run]

Visible on the book page without any toggle (screenshot `shot-book-after-generate.png`):

- "MiniMax text lane" box with a provider button, an **OpenRouter key input**, a free-text
  **text model** input, Save / Clear key (`MangaV2ProjectPanel.tsx:636-726`). It opens by
  itself on the key error (`:523`).
- "Image mode" with 3 cards, default **"Sprites + key panels"** (`:354`, `:728-799`),
  an **image model select**, "Sprite budget", "Key panels per chunk".
- "How much should we generate?" Next chunk / Full book + "Chunk size in source PDF pages"
  (`:801-845`).
- The 6-row pipeline stage list (`:876-880`) and the raw status message (`:882`).
- Dead branches: `OpenAIModelPicker` (`:150-280`) and `ModelSelector` (OpenRouter text
  models) are reachable only when `providerDraft` is `openai`/`openrouter` (`:690-701`), but
  the only provider button is `minimax` (`:658`). The defaults table still lists
  `gpt-4.1-mini` and `google/gemini-2.5-flash` (`:50-54`).

---

## 3. Recorded defects, rechecked

| # | Defect | Verdict | Evidence |
|---|---|---|---|
| a | Explicit panel positioning | **Still present** | [Run] + [Code] below |
| b | Generic composition fallback, default 2×2 grid | **Still present** | [Run] + [Code] |
| c | One line split into two bubbles that read as two speakers | **Still present** (reduced from 3 to 2 chunks) | [Run] + [Code] |
| d | Speaker attribution, tails to the correct speaker | **Still present** (works only with explicit sprite layers that have image assets) | [Code] [Run] |
| e | Raw character IDs, look-alike cast, no introductions | **Still present** | [Code] [Run] |
| f | Developer badges / debug chrome for readers | **Still present** | [Code] [Run] |
| g | Chopped/overflowing text, blank beige panels | **Still present** | [Run] + [Code] |
| h | v2lane reader consumes compiled geometry | **Partly**: consumes polygons and read ranks for a focus outline only; the page is an image-model raster | [Code] |
| i | Reader page chips do not switch pages | **Fixed** | [Run] |

### (a) Explicit panel boxes are overridden — still present

- `page_layout.ts:153-161` detects explicit placements; `placementToStyle` (`:163-196`)
  returns `position: "absolute"` + `left/top/width/height` in %.
- `MangaPageRenderer.tsx:161-168` spreads `cell.style` and then **overwrites** it with
  `position: "relative"` and `zIndex: cell.isPageTurn ? 4 : 1`. The container is
  `display: block; overflow: hidden` (`page_layout.ts:269-274`).
- [Run] `probe.ts`: layout computes `position:absolute`, rendered wrappers are
  `position:relative;left:50%;top:42%;…;z-index:1`.
- [Run] Browser, page 1 of the fixture (3 authored boxes, page height 824 px at 1280 wide):
  panel b renders at `y=643, h=494`, panel c at `y=1137` — **2 of 3 panels are outside the
  page and clipped**. Same at 390 px (`y=381`, `y=675` on a 489 px page).
  Screenshot `shot-desktop-page1.png`.
- `CLAUDE.md:39-42` says explicit boxes "are honored when present" — **false** [Doc].
  No test renders `MangaPageRenderer`.

### (b) Generic fallback and 2×2 grid — still present

- `layoutForPanelCount` (`page_layout.ts:107-112`): 1 → full, 2 → vertical, 3 → asymmetric,
  **4 or more → `grid-4` (2×2)**.
- [Run] 5 panels, no composition: 4 panels at 266×397 px and the **5th panel collapses to
  6 px high** (`shot-desktop-page2.png`).
- `compositionIsRenderable` requires every row to sum to exactly `100`
  (`page_layout.ts:236-237`). [Run] rows `[33.3, 33.3, 33.3]` fall back to the legacy grid.
- `rowHeightTracks` also uses exact `=== 100` (`:139-142`).
- Row tracks are `%` plus a px `gap` (`MangaPageRenderer.tsx:101-105`), so rows overflow by
  the gap. [Run] page 3: the second-row left panel starts at `x=0`, inside the 6 px padding.

### (c) Dialogue split reads as two speakers — still present

- `DialoguePanel.tsx:250-261` splits every line longer than 44 characters into up to 2
  chunks (`dialogue_lettering.ts:48-58`, split at the punctuation nearest the middle).
- Each chunk is a separate bubble with a separate tail. The **authored placement is used
  only when `chunkCount === 1`** (`DialoguePanel.tsx:266-267`). Split chunks get fallback
  boxes from a fixed 3-slot table indexed by chunk count on the panel (`:59-96`), including
  `y_pct: -3` and `x_pct: -5` (outside the panel).
- [Run] "Angela said it best, we either adapt to the maze or we starve in it." →
  `["Angela said it best,", "we either adapt to the maze or we starve in it."]`, placed at
  `34%,-3%` and `-5%,50%`. The authored box `10%,5%` is not used.
- [Run] Worse: the fallback box of chunk 1 (`z-index 42`) **covers the second speaker's
  authored bubble** (`z-index` default 40, `dialogue_geometry.ts:33`). "Then we move
  tonight." is hidden under it (`shot-desktop-page3.png`, `shot-mobile-page3.png`).
- Commit `96fce1f` changed the limit from 3 to 2 bubbles; the test
  `dialogue_lettering.test.ts` asserts the split (it pins the defect).

### (d) Speaker attribution and tails — still present

- `resolveBubbleTail` (`dialogue_geometry.ts:108-153`) aims the tail only if
  `spriteLayers` has a layer with the same `character_id` (`:37-48`).
- `MangaPanelRenderer.tsx:113-120` passes only the **composition's explicit**
  `sprite_layers`. Synthetic sprites from `SceneSprites.synthesizeSpriteLayers`
  (`chrome/SceneSprites.tsx:95-118`) are never passed to the bubbles. Vector silhouettes
  (`VectorSceneLayer.tsx:140-161`) carry no character ID.
- So without image assets plus explicit layers, every tail uses the fallback side/offset.
  The tail is a short triangle (10–14 units, `SpeechBubble.tsx:99-117`); it cannot reach a
  distant speaker.
- Bubble border colour is chosen by emotion (`DialoguePanel.tsx:43-52`, e.g. blue for
  "determined"), not by speaker. No speaker name is shown. [Run] tails point to empty
  background (`shot-desktop-page3.png`).

### (e) Character identity — still present

- Raw IDs to readers: reader asset grid `app/books/[id]/manga/v2/page.tsx:346, 352`;
  `CharacterLibrary/AssetCard.tsx:135, 169`; panel `aria-label`
  "`char_michael_02 says: …`" (`MangaPanelRenderer.tsx:199-208`, [Run]).
  `MissingSpriteMarker` shows raw IDs (`SceneSprites.tsx:154-180`) but is unreachable now,
  because every plan returns `missingSpriteFallback: "omit"`
  (`panel_presentation.ts:123, 137, 151, 165, 178`).
- Look-alike cast: the only deterministic figure is one shape (ellipse head, one body path,
  two stick legs) varied only by position, scale and a −6° lean for "run"
  (`VectorSceneLayer.tsx:140-161`). [Run] `shot-desktop-page4.png` shows two identical grey
  pins. The image-model sprites in `docs/renderer-analysis/experiments/2026-07-05-task4-after-page1-1280.png`
  show near-identical men [Doc, historical].
- Characters are never introduced: no cast page, no first-appearance name caption, no
  speaker labels. `grep` for `name`/`introduc` in `components/MangaReader` finds nothing.
  The bible's `name` field reaches only `BookSpine` below the reader.

### (f) Developer chrome — still present

Main reader (`app/books/[id]/manga/v2/page.tsx`):

- Header: "Source pages X–Y · Passed deterministic QA / Failed QA with N issue(s) · N facts"
  (`:215-217`, helpers `:34-58`).
- Nav: "Generate another slice" link inside the reader (`:271-273`).
- "Character assets" grid with raw IDs, "Prompt only" tiles, and "Enable character asset
  generation in Advanced slice options" (`:319-359`).
- "Generated slices": `slice_role`, QA summary, "x/y critical facts covered" (`:361-377`).
- `BookSpine` (synopsis, adaptation plan, Ki-Sho-Ten-Ketsu arc, voice cards) (`:380-382`).

v2-lane reader: "composed-page.v1 · art / DSL-only · N text element(s)"
(`V2LaneReader.tsx:91-101`). Upload page: fake chapter cards (§2). The page-turn QA highlight
is off by default (`MangaPageRenderer.tsx:57`) — good.

### (g) Chopped text and blank beige panels — still present

- `clampVisibleText` cuts mid-word and appends `...` (`panel_presentation.ts:82-87`),
  used by `NarrationPanel.tsx:34-37`, `ConceptPanel.tsx:31-34`, `DialoguePanel.tsx:202`.
  Caps: 90 bubble / 116–220 caption chars (`panel_presentation.ts:117-183`).
  [Run] a 273-character narration shows as "…across every s...".
- Bubble text sits in an `overflow: hidden` box (`DialoguePanel.tsx:156`,
  `SpeechBubble.tsx:242`). The SVG `viewBox="-20 -20 140 140"` with
  `preserveAspectRatio="none"` (`SpeechBubble.tsx:202-213`) draws the body in the middle
  ~63% of the box, while the text box uses the full height → text can sit outside the ink
  outline. [Inf]
- Lettering sizes are in `vw` (`DialoguePanel.tsx:98-102`), not tied to the page.
  [Run] computed bubble text 8.2–12.8 px at 1280 px and **7.4–9.9 px at 390 px**.
- Blank panels: when no `vector_scene` is authored, `fallbackVectorSceneForPanel`
  (`VectorSceneLayer.tsx:39-87`) gives a beige gradient, a dot tone and 3–5 thin lines.
  [Run] `shot-desktop-page1.png`, `shot-desktop-page3.png`.
- Stage directions and art notes leak to readers:
  `ConceptPanel.tsx:30-33` shows `panel.action`, else **`panel.composition`** (the
  storyboard's art direction). [Run] "ART NOTE e: low-angle medium shot, office window
  behind" is lettered in the panel. `NarrationPanel.tsx:35` and `TransitionPanel.tsx:26`
  show `panel.action` as quoted narration.

### (h) v2-lane reader and compiled geometry — partly

- It sorts `compiled_layout.panels` by `read_rank` (`lib/manga-v2-lane.ts:100-105`) and
  outlines the active polygon over the image (`V2LaneReader.tsx:123-147`). Panel stepping
  with ←/→ in RTL sense (`:38-64`).
- The page itself is a raster: `composed.image_url`, else raw `page_art.image_url`
  (`V2LaneReader.tsx:76-80`). `page_art.v1` carries `image_model`
  (`packages/contracts/src/generated/page_art.v1.ts:85`). Lettering is baked into the
  raster, so dialogue is not selectable text.
- Flag default off, no inbound link. Keyboard direction is the reverse of `/v2`
  (there ← is "previous", `app/books/[id]/manga/v2/page.tsx:161-168`).

### (i) Page chips — fixed

- `app/books/[id]/manga/v2/page.tsx:296-315`: `preventDefault()` then `goToPage(index)`.
- [Run] Clicking chips 2, 3, 4 moved the header counter `1/4 → 2/4 → 3/4 → 4/4` at 1280
  and 390 px. ArrowLeft from page 4 went to `3/4`.
- Small leftover: the chip list includes pages with no renderable `rendered_page`; those
  show "No pages generated yet" (`:127-138, 252-257`). Page index is not in the URL; a
  reload goes back to page 1 (`:117`).

---

## 4. Other problems found

| Severity | Problem | Evidence |
|---|---|---|
| blocker | Default Generate needs an OpenRouter image key; nothing is sent without it | [Run] `after_click_error`, `mock_api_calls_build: []`; `MangaV2ProjectPanel.tsx:354, 358, 522-527` |
| blocker | Generate goes to the v1 Celery pipeline, not the harness | [Code] §2 |
| major | Coming back to a running build freezes the UI at the first % and "Generating..." forever | [Run] `resume.cjs`: status polled to `success` in 4 calls, UI stayed `10%` / "Generating..." for 12 s. Cause: the effect at `MangaV2ProjectPanel.tsx:453-483` has `busy` in its deps and sets `busy=true`, so its own cleanup sets `cancelled=true`; progress callbacks and `setBusy(false)` are then skipped |
| major | `stop.sh` kills **any** non-docker listener on port 3000 (`kill`, then `kill -9`) | [Code] `stop.sh:51-77, 94`. That is the owner's Hermes WhatsApp bridge. `start.sh:203-210` also puts Next on 3000 |
| major | `preserveAspectRatio="none"` stretches tones, SFX text and bubble strokes | [Code] `VectorSceneLayer.tsx:285-291`, `SpeechBubble.tsx:202-205`; [Run] oval dots and stretched "DOKUN" in `shot-desktop-page4.png` |
| major | SFX layer is dead: derivable effects are only `impact`, `page_turn`, `zoom`; none is in the SFX vocabulary | [Run] `probe.ts` `sfx_tokens_from_derivable: []`; `derived_visuals.ts:120-126`, `SfxLayer.tsx:31-65` |
| minor | `NarrationPanel` `vignette` / `ink_wash` branches never fire | [Code] `NarrationPanel.tsx:42, 77` vs `derived_visuals.ts:120-126` |
| minor | Tone pattern `speed` is declared but draws dots | [Code] `manga-render-types.ts:36-42` vs `VectorSceneLayer.tsx:239-250` |
| minor | Fonts load at runtime from Google Fonts `@import` | [Code] `app/globals.css:18`. Text fitting cannot be deterministic before fonts load |
| minor | Upload page shows fabricated chapter names | [Code] `app/upload/page.tsx:26-33` |
| minor | Unused components and API functions | [Code] §8 "Remove" |

---

## 5. Deterministic visual primitives today

| Primitive | Where | What it does | Quality (0–10) |
|---|---|---|---|
| Speech bubble path | `chrome/SpeechBubble.tsx:58-120, 176-250` (commit `24aa9d6`) | Seeded "hand-inked" rounded-rect body, triangle tail at side+offset, thought puffs; variants speech/thought/shout | **5** — seeded wobble is a good idea; distorted by `preserveAspectRatio="none"`; "shout" is only a smaller radius and thicker stroke (no burst); tail cannot aim at a point; no linked bubbles |
| Bubble geometry | `dialogue_geometry.ts:23-153` | Box clamp (allows −10% bleed), face-zone avoidance, tail side/offset toward a sprite box | **4** — logic reusable; needs real speaker anchors |
| Line splitting | `dialogue_lettering.ts` | Split at punctuation near the middle | **2** — the cause of defect (c) |
| Vector scene layer | `chrome/VectorSceneLayer.tsx` (commit `cc30266`) | Gradient background; tone pattern (dots, hatching, crosshatch, grain); straight lines; generic silhouettes; radial speed-line burst; radial focus; vignette; SVG SFX text | **2** — placeholder grade: no characters, no environments, no props; the LLM authors raw line coordinates (`backend/app/manga_pipeline/stages/vector_scene_stage.py:31-60`) |
| Fallback scene | `VectorSceneLayer.tsx:39-87`, backend `vector_scene_stage.py:108` | Shot-based lines and tone | **1** — reads as blank beige |
| SFX overlay (DOM) | `chrome/SfxLayer.tsx` | Token → styled text | **0** — never fires |
| Panel chrome | `panel_chrome.ts:10-90` | CSS border style per purpose (solid/double/dashed/dotted) + offset drop shadows | **3** — dotted/dashed frames and drop shadows are not manga grammar |
| Lettering fonts | `lettering_fonts.ts`, `globals.css:18, 57-58` | Comic Neue body, Bangers SFX | **3** — runtime web fonts, `vw` sizes |
| Page layout | `page_layout.ts` | CSS grid rows; explicit boxes (broken); legacy count grids | **2** |
| Compiled layout (backend) | `backend/app/services/manga_layout.py:195-387` | Split tree (x/y, ratios, gutters, slant angle), freeform polygons, overlay insets, read-rank chain, adjacency, min-size checks, clip paths, content hash | **8** — the best deterministic asset in the repo; the frontend `/v2` reader does not use it |
| Thumbnail SVG (backend) | `manga_layout.py:390-481` | Name/thumbnail preview with reading arrows and stick blocking | QA tool, not art |

The 2026-07-05 "after" screenshots under `docs/renderer-analysis/experiments/` show the
same look: beige panels, a 2×2 grid, one line split over three bubbles, image-model men
[Doc, historical].

### 5.1 What depends on image-model output (must not be required)

| Dependency | Where | Effect without images |
|---|---|---|
| Character sprites (`MangaAssetDoc.image_path`) | `app/books/[id]/manga/v2/page.tsx:139-144`, `chrome/SceneSprites.tsx:182-233`, `panel_presentation.ts:64-72, 110-115` | **No character is drawn** (`missingSpriteFallback: "omit"`) |
| Painted key panels (`panel_artifacts.image_path`) | `chrome/PaintedPanelBackdrop.tsx`, `MangaPanelRenderer.tsx:98, 160-173` | Beige vector fallback |
| Tail aiming | `dialogue_geometry.ts:37-48` via explicit sprite layers | Tails aim at nothing |
| Character library | `app/books/[id]/manga/v2/characters/page.tsx:183-188`, `AssetCard.tsx:97-105` | "Prompt only" tiles |
| v2-lane page raster | `V2LaneReader.tsx:76-80` | No page |
| Generate defaults | `MangaV2ProjectPanel.tsx:354-358, 522-527, 728-799` | Generate is blocked |

---

## 6. Reader capabilities today (`/books/[id]/manga/v2`)

| Capability | State | Evidence |
|---|---|---|
| Page navigation | Prev/Next buttons, page chips (work), ←/→ keys (← = previous) | [Run]; `page.tsx:154-168, 261-315` |
| Panel navigation | None (only in `/v2lane`) | [Code] |
| Zoom / pinch | None. `@use-gesture/react` is a dependency with no import | [Code] grep |
| Touch / swipe | None | [Code] grep |
| RTL | Panel order in rows is RTL (`MangaPageRenderer.tsx:108`); keys and buttons are LTR | [Code] |
| Vertical / webtoon mode | None | [Code] |
| Mobile | Page is 326×489 px at 390 wide; lettering 7.4–9.9 px | [Run] `shot-mobile-page*.png` |
| Reduced motion | Not handled: every panel and bubble animates with stagger; no `useReducedMotion`, `MotionConfig` or `prefers-reduced-motion` | [Code] grep |
| Source references | One slice-level "Source pages X–Y" in the header; no per-panel source, no link to `/books/[id]/read?page=N` | [Code] `page.tsx:27-32, 215-217` |
| Deep link to a page | None; reload resets to page 1 | [Code] `page.tsx:117` |
| Accessibility | Panel `role="img"` + `aria-label` with raw speaker IDs; bubble `role="figure"` inside `role="img"` | [Code] |
| Live update | None; loads once | [Code] |

---

## 7. Commands run

| Command | Result |
|---|---|
| `cd frontend && npx tsc --noEmit` | exit 0, 2.8 s (incremental) |
| `npx tsc --noEmit --incremental false` | exit 0, 1.9 s wall, TypeScript 5.9.3 |
| `node <tsx 4.21.0> components/MangaReader/*.test.ts` (7 files) | 7/7 exit 0, no output |
| `next build` with `NEXT_PUBLIC_API_URL=http://localhost:8000`, in a scratch copy | exit 0, 18.4 s; 8 routes; `/books/[id]/manga/v2` 16.2 kB / 187 kB first load |
| `next build` against the mock API (`:8766`) + `next start -p 3107` | exit 0; used for screenshots; stopped after |
| `tsx probe.ts` (static render of real components) | explicit boxes `relative`; 5-panel 2×2; split bubbles; art-note leak; SFX empty |
| `node shots.cjs` (Chromium 1280 and 390) | numbers quoted in §3 |
| `node resume.cjs` | resume-polling freeze, §4 |
| `diff` donor vs Book-Reel `manga_layout.py` | identical |
| `diff -rq` donor vs Book-Reel `apps/agent-worker/src/skills` | only `load.ts`, `manga-page-writing`, `manga-thumbnail` differ |

The build ran in a copy so that Next could not rewrite the tracked `next-env.d.ts` /
`tsconfig.json`. The only in-repo write was `frontend/tsconfig.tsbuildinfo` from the first
`tsc` (git-ignored).

---

## 8. Donor assessment (`/Volumes/Mrigesh SSD/ScrollStack-manga`)

| Donor part | What it is | Better base? |
|---|---|---|
| `backend/app/services/deterministic_manga_demo.py` | Hard-coded demo: fixed source pages `(4,…,15)` and phrases (`:31-46`), fixed SFX words (`:48`), fixed speaker `char_kai` (`:303-310`), fixed boxes. "Deterministic" means no LLM, not a visual system | **No.** Keep only the `TextElement` idea: region + tail target + typography range + overflow policy |
| `manga_production.py` | Requires ≥1 image-model key panel (`:100-115`), OpenRouter prompt (`:725-740`), full-width vertical stack composition (`:784-811`) | **No** — image-model bound |
| `manga_reader.py` | Accepted-only reader projection with hash-verified assets | Pattern only (accepted-only serving) |
| `manga_layout.py` | Layout compiler | **Already in Book-Reel, identical** |
| `hackathon_manga.py:890-993` | Server SVG composite of image-model panels + ellipse bubbles (no tails), char-count wrap, pymupdf raster | **No** |
| Skills `manga-composition`, `manga-direction` | Short rule sets (rhythm, bubbles, asset reuse, grammar) | **Already in Book-Reel, identical** |
| `packages/design-tokens` | 17 colours, radius, spacing, motion, layers | Small; optional for app chrome |
| `packages/reel-components/src/primitives` | Remotion (video) CSS primitives; bubble shows `speakerId` | **No** |
| Frontend `components/MangaReader/*` | `MangaPanelArt.tsx` = 5 CSS gradient presets; bubbles are CSS spans at 4 corners, no tails (`MangaPanel.tsx:62-75`); 6-column grid | **No** for art. **Yes** for shell ideas: RTL page mode vs vertical mode chosen by viewport, tap to hide chrome, `useReducedMotion`, page transitions (`MangaReader.tsx:12-110`, `store/useReaderStore.ts`) |

Conclusion: the donor is **not** a better base for a deterministic SVG/CSS manga system.
Book-Reel's `VectorSceneLayer` and `SpeechBubble` are further along than anything in the
donor, and both are still placeholder grade.

---

## 9. Verdict: keep, rewrite, remove

### Keep

- `backend/app/services/manga_layout.py` (`compile_page_layout`) and the contracts
  `MangaPagePlan`, `PageScript`, `PageScriptPanel`, `SubjectBlocking`, `TextElement`,
  `CompiledPageLayout`, `RenderedPageV2` (`backend/app/contracts/manga.py:294-420, 431-650,
  712-742`). They are the right semantic vocabulary: camera (shot/angle/movement), blocking
  (subject, pose, expression, anchor, facing, depth), environment and prop refs, focal and
  avoid-text regions, text kind/shape/speaker/tail target/typography range/overflow policy.
- App shell, upload flow, book page frame, `lib/api.ts` client and `pollUntilComplete`
  (after the resume fix).
- `lib/manga-v2-lane.ts:100-111` (`panelsInReadingOrder`, `polygonPoints`) as the
  compiled-geometry consumer seam.
- Ideas, not code: seeded bubble wobble (`SpeechBubble.tsx:58-62`), face-zone avoidance
  (`dialogue_geometry.ts:81-106`), tone `<pattern>` defs (`VectorSceneLayer.tsx:239-250`),
  the reader-assertion test style (`*.test.ts` run with `tsx`).

### Rewrite

- `MangaPageRenderer`, `page_layout.ts`, `MangaPanelRenderer`, all `panels/*`,
  `chrome/*`, `panel_presentation.ts`, `derived_visuals.ts`, `panel_chrome.ts`,
  `dialogue_lettering.ts` → one deterministic SVG renderer (below).
- `MangaV2ProjectPanel` → one Generate button, harness-backed, no provider, key, image
  or budget controls in the default view; resumable progress; cancel.
- The reader page → a reader with no dev chrome; debug view on a separate route.
- `stop.sh` / `start.sh` port handling (never kill a port the stack did not start; frontend
  off 3000).

### Remove (evidence)

- No importers: `components/ApiKeyModal.tsx`, `GenerationFacts.tsx`,
  `LargePdfWarning.tsx`, `LogFeed.tsx`, `PipelineTracker.tsx`, `StyleSelector.tsx`
  (grep of `app/`, `components/`, `lib/`).
- Unreachable: `OpenAIModelPicker` (`MangaV2ProjectPanel.tsx:150-280`),
  `ModelSelector.tsx` (only via the dead provider branch), `MissingSpriteMarker`.
- Unused API functions: `checkCredits`, `generateMangaProjectSlice`,
  `startBookUnderstanding` (`lib/api.ts`); `fetchOpenAIModels` / `fetchOpenRouterModels`
  only feed dead pickers.
- Image-model surfaces under the no-image rule: `IMAGE_MODE_LABELS`, `ImageModelPicker`,
  sprite/key-panel budgets, `PaintedPanelBackdrop`, the image branch of `SceneSprites`,
  `characters/` library page and `CharacterLibrary/AssetCard.tsx`, `getImageModels`,
  `materializeCharacterSheets`, `regenerateMangaAsset`, `setMangaAssetPin`.
- `/v2lane` route + `V2LaneReader.tsx` (raster from image-model `page_art`), after the new
  reader takes its polygon logic.
- `SfxLayer.tsx` (dead), legacy `grid-2`/`grid-3` styles (`page_layout.ts:72-84`, never
  chosen), `EMPHASIS_WEIGHTS` flex weights (no flex container on composition paths).
- Upload fake chapters (`app/upload/page.tsx:26-33, 106-112, 312-328`).

---

## 10. Recommended rendering architecture

**One renderer, one contract, no model-authored coordinates for art.**

```text
MiniMax (harness)  ── semantic plan only ──►  PageScript + cast + environment/prop IDs
                                                   │
deterministic      compile_page_layout ──────────► CompiledPageLayout (polygons, read ranks)
                   lettering engine    ──────────► fitted text boxes, tail curves (or reject)
                   asset vocabulary    ──────────► SVG page (fixed viewBox 1000×1500)
                                                   │
persist            accepted RenderedPage v3 = plan + layout + resolved lettering
                   + renderer_version + content hash (+ optional SVG snapshot)
                                                   │
reader             renders exactly that artifact with the same package (hash shown in debug)
```

1. **Package.** A pure TypeScript package (for example `packages/manga-render`) with no
   React dependency in its core: `renderPage(plan, layout, cast, opts) → SVG tree/string`.
   The frontend wraps it in React. The server uses the same code for thumbnails, QA and
   PNG export (for example resvg), so the reader and the QA gates see the same pixels.
   One fixed page coordinate system (`viewBox 0 0 1000 1500`); no
   `preserveAspectRatio="none"` anywhere.
2. **Layers per panel**, each clipped to the compiled polygon: environment → props →
   characters (depth-sorted by `SubjectBlocking.depth`) → FX (screentone, speed/focus lines,
   impact burst, vignette) → panel border. Then a page-level lettering layer (bubbles may
   cross gutters; tails end in the speaker's panel) and SFX.
3. **Character rig vocabulary** (seeded, deterministic):
   - `CharacterSpec` = body archetype (height, build), head shape, hair style from a fixed
     set, hair tone (black / white / screentone), top/bottom/outerwear from a clothing set
     with tone fills, accessories (glasses, hat, tie, bag), one distinguishing mark.
   - Pose library (about 16: stand, walk, run, sit, point, arms crossed, hands on head,
     reach, fall, kneel, lean, think, …) as joint angles; limbs drawn as tapered ink strokes.
   - Expression library (neutral, happy, sad, angry, shocked, determined, thinking, smirk,
     afraid, crying) as eye/brow/mouth part swaps.
   - Facing left/right/front/away; shot framing (full, waist, bust, face) crops the rig.
   - A cast-level distinctness gate: pairwise feature distance must pass a minimum before
     the cast is accepted, so the cast never looks alike. Names come from the cast list.
4. **Environments and props**: parameterized SVG scenes (room interior, office, street,
   classroom, garden, forest, sky, water, abstract) that take camera shot/angle for the
   horizon and perspective grid, plus a prop set (desk, chair, door, window, book, phone,
   cup, …). MiniMax picks IDs from the list; unknown IDs fail validation, not render.
5. **Ink and tone**: screentone patterns in page units (not panel units) so dots stay round;
   hatching and crosshatch; speed lines and focus lines generated from panel geometry and
   `PanelMotion`; impact bursts; SFX lettering as outlined paths from a bundled font.
6. **Lettering engine**: bundle the fonts (self-hosted WOFF2, and the same files on the
   server); measure text; balanced line breaks inside the bubble shape; shrink between
   `typography.min_px` and `max_px`; if it still does not fit, **reject** so the harness
   rewrites the line (never truncate). One `TextElement` = one bubble; a second bubble for
   the same speaker is an explicit linked bubble with a connector. Tails are curves to the
   speaker's head anchor from the rig. Place bubbles in reading order (top-right first) and
   away from faces. The first appearance of a speaker gets a name caption.
7. **Render-time QA** (stored with the artifact): all panels inside the page, every text fits,
   no bubble overlap, every tail ends on its speaker, every speaker is introduced, reading
   order matches `read_rank`, no art-direction text lettered. The reader shows only accepted
   pages.
8. **Reader**: one route (`/books/[id]/manga`). RTL page mode and vertical mode (chosen by
   viewport, as in the donor), panel-by-panel zoom from compiled polygons (the useful part of
   `V2LaneReader`), swipe with `@use-gesture/react`, one keyboard convention, reduced motion
   honoured, page in the URL, a per-panel "source" drawer that links to
   `/books/[id]/read?page=N`. QA, facts, slices and spine move to a debug route.

---

## 11. Open questions

1. Should the persisted artifact be the plan (render on the client with a pinned renderer
   version) or the SVG snapshot, or both? The "reader shows the exact accepted artifact"
   rule favours storing the SVG hash at least.
2. Is `compile_page_layout` kept in Python (layout computed by the backend or harness and
   persisted) or ported to TypeScript so the renderer package owns it?
3. How many cast members per book must the rig vocabulary support before distinctness fails
   (fiction test book: 5 tales, many characters)?
4. Is RTL (Japanese) reading order a product requirement for English books, or should the
   default be LTR with RTL as an option?
5. Should the legacy `/v2` reader keep working for old stored pages during the rebuild, or can
   old pages be regenerated?
