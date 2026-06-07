# NEXT SESSION: Book-Reel Manga Reader

Last updated: 2026-06-07

## Current Status

The 2026-06-07 manga reader polish pass is implemented.

Active route:

`http://localhost:3000/books/6a0b5a11201a8d03f1d82501/manga/v2?project=6a0b5a5b201a8d03f1d82503`

The current product path is still:

```text
upload PDF
  -> parse book
  -> create manga project
  -> run book understanding
  -> generate source slice
  -> persist RenderedPage docs
  -> read in frontend manga reader
```

Do not treat the old reader-polish prompt as pending. The previous issues around the right-side Book Spine, cramped speech bubbles, raw narration over sprites/images, stale scroll position after page navigation, and mobile horizontal overflow have been addressed in the frontend renderer.

## What Changed In The Reader Polish Pass

Files changed:

- `frontend/app/books/[id]/manga/v2/page.tsx`
- `frontend/components/MangaReader/MangaPageRenderer.tsx`
- `frontend/components/MangaReader/MangaPanelRenderer.tsx`
- `frontend/components/MangaReader/chrome/SpeechBubble.tsx`
- `frontend/components/MangaReader/panels/ConceptPanel.tsx`
- `frontend/components/MangaReader/panels/DialoguePanel.tsx`
- `frontend/components/MangaReader/panels/NarrationPanel.tsx`
- `NEXT_SESSION.md`

Implemented behavior:

- The manga route is now reader-first instead of a reader plus right sidebar split.
- `BookSpine` is moved to the end of the page, after manga page navigation, character assets, and generated slice metadata.
- Page jump links (`Page 1` through `Page N`) update the current rendered page and scroll the reader back into view.
- Previous/next navigation scrolls back to the reader instead of preserving a stale lower scroll position.
- Manga sheet sizing is constrained by viewport and stage padding, so mobile no longer horizontally overflows.
- Composition row rendering neutralizes stale per-row `gridRow` placement inside row subgrids so panels fill their rows.
- `MangaPanelRenderer` no longer uses fixed `minHeight` values that fight the fixed manga page grid on mobile.
- Speech bubbles have safer fallback boxes, clipped inner lettering, optional speaker tags in cramped bubbles, and dynamic font sizing.
- Long/generated explanatory dialogue routes into caption boxes instead of being forced into tiny speech bubbles.
- Concept/setup/narration panels use readable paper caption boxes instead of raw centered text over sprites/images.

## Evidence

Baseline screenshots captured before the polish pass:

- `docs/renderer-analysis/experiments/2026-06-07-reader-polish-baseline-desktop.png`
- `docs/renderer-analysis/experiments/2026-06-07-reader-polish-baseline-1280.png`
- `docs/renderer-analysis/experiments/2026-06-07-reader-polish-baseline-page2-1280.png`
- `docs/renderer-analysis/experiments/2026-06-07-reader-polish-baseline-page2-top2-1280.png`

Intermediate screenshot:

- `docs/renderer-analysis/experiments/2026-06-07-reader-polish-after-pass1-1280.png`

Final screenshots:

- `docs/renderer-analysis/experiments/2026-06-07-reader-polish-after-final-1280.png`
- `docs/renderer-analysis/experiments/2026-06-07-reader-polish-after-final-mobile-390.png`

Browser metrics checked at 1280x900 and 390x844:

- `horizontalOverflow: false`
- `overflowItems: []`

Tooling note: the in-app Browser was used for route inspection, DOM snapshots, baseline screenshot capture, and layout metrics. After the page became image-heavy, the in-app screenshot command began timing out. Final screenshot files were captured with:

```bash
npx playwright screenshot --channel=chrome
```

## Verification Already Run

From `frontend`:

```bash
npx tsc --noEmit
npm run build
```

Both passed.

From repo root:

```bash
git diff --check
```

Passed.

## Current Blockers

None for the completed reader polish pass.

## Open Risks

- The reader still relies on heuristic fallback layout for stored pages that lack explicit `row_heights_pct`, `panel_placements`, or compositor-authored bubble placements.
- Caption routing is presentation-only. A future compositor/content pass should ideally author shorter dialogue and explicit caption boxes at the DSL level.
- The final polish was visually verified on the active sample route and page 1/page 2 evidence. More stored pages, especially pages with 6-7 panels and long narration, should be reviewed before calling the whole renderer fully polished.

## Recommended Next Work

1. Review final screenshots and live pages across all 11 stored pages.
2. Focus especially on pages with many panels, long narration, and mixed sprite/text panels.
3. If similar spacing issues appear, add compositor-side rules for explicit row heights, panel placements, and bubble/caption placements.
4. Keep renderer fixes scoped to the `RenderedPage` contract boundary. Do not change story/content generation unless the renderer contract requires it.

## 2026-06-07 Follow-Up Analysis: Remaining Reader Defects

The reader is better than before, but the current live page still has visible quality problems.

Fresh current screenshot:

- `docs/renderer-analysis/experiments/2026-06-07-reader-followup-page1-current-1280.png`

Specific user-observed issue:

> The group chats, then falls into a contemplative silence. Sunlight streams through windows.

That page 1 setup panel technically has a readable caption, but it still looks wrong because the text box is competing with synthesized character placeholders. The placeholders look like tall rounded doors rather than people, and the panel does not feel intentionally composed.

Current diagnosis:

- `frontend/components/MangaReader/chrome/SceneSprites.tsx` synthesizes sprite layers from `panel.character_ids` when no explicit `sprite_layers` exist.
- When no matching asset is found, `SpriteFallback` renders a tall rounded white placeholder with a two-letter label.
- This creates the door-like shapes visible in the current page.
- `ConceptPanel`, `NarrationPanel`, and `DialoguePanel` place text independently of those fallback sprites, so text boxes can still collide visually with image/sprite regions.
- Stored pages for this project are `sprites_only` and have no full-panel `panel_artifacts.*.image_path`, so the reader must make sprite-only pages look intentional without fake body placeholders.

Remaining problems to solve:

- Text can still feel cramped in bubbles/caption boxes even when DOM overflow checks pass.
- Text boxes can still sit over or near image/sprite regions in visually messy ways.
- Missing sprite fallbacks look like bad door SVG/person shapes.
- Action prose such as the group-chat sentence is being rendered as visible caption text even when it is really a visual direction.
- Fallback layout lacks a panel-level rule for reserved image zones vs. reserved text zones.

Recommended next implementation pass:

1. Stop rendering door-like `SpriteFallback` bodies.
   - If an asset is missing, either omit the sprite or use a small unobtrusive label/marker.
   - For many-character panels, prefer a group/environment visual treatment instead of five fake figures.
2. Add a panel presentation classifier/helper.
   - Inputs: purpose, shot type, dialogue length, narration/action length, character count, available assets, explicit placements.
   - Outputs: whether synthetic sprites render, whether missing sprite fallback is allowed, text-zone strategy, and whether dialogue should be bubble or caption.
3. Separate image zones from text zones.
   - Captions should reserve top/bottom strips.
   - Bubbles should be used only for short emotional dialogue.
   - Dense explanatory/action text should use narrator/caption treatment or be hidden when it only describes the visual.
4. Verify on page 1 plus at least pages with long narration/many panels.
5. Use `$browser:control-in-app-browser` for live inspection and `$superpowers:brainstorming` before designing changes.
6. Use sub-agents as needed with disjoint ownership:
   - renderer diagnostics,
   - frontend renderer,
   - layout/data contract,
   - verification/docs.

Paste-ready next prompt is now in:

- `docs/next-prompt.md`

## Important Context To Preserve

Read these before deeper renderer work:

- `docs/renderer-analysis/findings.md`
- `docs/renderer-analysis/sample-dsl.json`
- `docs/renderer-analysis/experiments/README.md`

Trust the core diagnosis from `docs/renderer-analysis/findings.md`: the content/image pipeline is not the blocker. The renderer contract and frontend presentation are the blocker.

For frontend renderer work, keep backend Pydantic models and frontend TypeScript mirrors synchronized when contract fields change. Preserve legacy fallback behavior for existing pages that only have `gutter_grid`.

## 2026-06-07 Follow-Up Implementation: Fallback Composition Pass

Status: implemented and verified on the active sample route after restarting the dev server on port 3000.

Files changed in this pass:

- `frontend/components/MangaReader/panel_presentation.ts`
- `frontend/components/MangaReader/panel_presentation.test.ts`
- `frontend/components/MangaReader/MangaPanelRenderer.tsx`
- `frontend/components/MangaReader/chrome/SceneSprites.tsx`
- `frontend/components/MangaReader/panels/ConceptPanel.tsx`
- `frontend/components/MangaReader/panels/DialoguePanel.tsx`
- `frontend/components/MangaReader/panels/NarrationPanel.tsx`
- `NEXT_SESSION.md`
- `docs/next-prompt.md`

Implemented behavior:

- Added a panel presentation helper that classifies fallback panels as `dialogue-over-scene`, `caption-strip`, `text-card`, or `scene-only`.
- `MangaPanelRenderer` now computes one presentation plan per panel and passes it to sprite, dialogue, concept, and narration renderers.
- `SceneSprites` no longer renders the tall body-shaped missing-character fallback.
- Synthesized sprites render only when a real scene-suitable asset exists.
- `reference_sheet` assets are excluded from scene-sprite rendering so whole asset sheets are not pasted into panels.
- Many-character panels and visual-direction-only panels prefer caption-strip/text-card treatment instead of synthesized placeholder bodies.
- Dense dialogue is routed into caption/text-card lettering.
- Speech bubbles are reserved for truly short dialogue, and inline speaker tags inside bubbles were removed to prevent narrow-panel overflow.
- Concept and narration panels use the shared caption-zone plan and clamp visible text before rendering.

Evidence captured:

- Baseline for this pass:
  - `docs/renderer-analysis/experiments/2026-06-07-reader-followup-before-pass2-1280.png`
- Final screenshots:
  - `docs/renderer-analysis/experiments/2026-06-07-reader-followup-after-pass2-1280.png`
  - `docs/renderer-analysis/experiments/2026-06-07-reader-followup-after-pass2-mobile-390.png`

Verification run:

```bash
cd frontend
npx tsc --noEmit --pretty false
npm run build
```

Both passed. Note: do not run `tsc` in parallel with `next build` in this repo; the build regenerates `.next/types` and can create transient `TS6053` missing-file errors.

Browser/visual verification:

- Active route verified on `http://localhost:3000/books/6a0b5a11201a8d03f1d82501/manga/v2?project=6a0b5a5b201a8d03f1d82503`.
- Page 1 final metrics:
  - loaded: true
  - panelCount: 5
  - horizontalOverflow: false
  - placeholderLike: []
  - overflowText: []
- Page 11 final metrics after keyboard navigation:
  - loaded: true
  - panelCount: 7
  - horizontalOverflow: false
  - placeholderLike: []
  - overflowText: []
- Additional pages 4 and 8 were inspected during the pass; no placeholder labels or text overflow were observed there before the final speaker-tag cleanup.

Operational note:

- Running `npm run build` while the dev server is active can leave the Next dev server on port 3000 serving `missing required error components, refreshing...`.
- If that happens, kill the port 3000 listener and restart `npm run dev` from `frontend`.
- A temporary dev server on port 3001 was not useful because backend API calls failed with `Network Error`, likely due origin/CORS expectations.

Remaining risks:

- The renderer is still using heuristic fallback presentation for stored pages without explicit compositor-authored `panel_placements`, `sprite_layers`, and `bubble_placements`.
- Page 1 is now cleaner but image-light because only reference-sheet assets were available for some characters and those are intentionally not rendered as scene sprites.
- The next quality jump should come from compositor-authored explicit text/sprite zones and better scene-suitable sprite assets, not more ad hoc frontend fallback rules.
