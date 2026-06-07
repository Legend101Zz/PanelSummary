# Next Prompt: Move From Heuristic Fallback To Explicit Manga Layout

You are working in:

`/Volumes/Mrigesh SSD/Book-Reel`

Active reader route:

`http://localhost:3000/books/6a0b5a11201a8d03f1d82501/manga/v2?project=6a0b5a5b201a8d03f1d82503`

Read first:

- `AGENTS.md`
- `NEXT_SESSION.md`
- `docs/renderer-analysis/findings.md`
- `docs/renderer-analysis/sample-dsl.json`
- `docs/renderer-analysis/experiments/README.md`

## Current State

The 2026-06-07 fallback composition pass is implemented.

The reader now has a frontend panel presentation helper:

- `frontend/components/MangaReader/panel_presentation.ts`

It classifies fallback panels into:

- `dialogue-over-scene`
- `caption-strip`
- `text-card`
- `scene-only`

It is threaded through:

- `frontend/components/MangaReader/MangaPanelRenderer.tsx`
- `frontend/components/MangaReader/chrome/SceneSprites.tsx`
- `frontend/components/MangaReader/panels/DialoguePanel.tsx`
- `frontend/components/MangaReader/panels/ConceptPanel.tsx`
- `frontend/components/MangaReader/panels/NarrationPanel.tsx`

The door-like missing-character fallback is gone. Missing synthesized sprites are omitted. Reference-sheet assets are not rendered as scene sprites. Dense dialogue and many-character visual-direction panels now route into caption/text-card treatments.

Final evidence from this pass:

- `docs/renderer-analysis/experiments/2026-06-07-reader-followup-after-pass2-1280.png`
- `docs/renderer-analysis/experiments/2026-06-07-reader-followup-after-pass2-mobile-390.png`

Verification already run:

```bash
cd frontend
npx tsc --noEmit --pretty false
npm run build
```

Both passed.

Browser metrics were clean on page 1 and page 11:

- `horizontalOverflow: false`
- no placeholder labels
- no measured leaf-text overflow

## Important Operational Note

Do not run `npx tsc --noEmit` in parallel with `npm run build`; `next build` regenerates `.next/types` and can cause transient `TS6053` missing-file errors.

Running `npm run build` while the dev server is active can leave port 3000 serving:

`missing required error components, refreshing...`

If that happens:

```bash
lsof -tiTCP:3000 -sTCP:LISTEN | xargs -r kill
cd frontend
npm run dev
```

Do not use port 3001 for final reader verification unless backend origin/CORS is fixed; the route showed `Network Error` there.

## Recommended Next Work

The remaining renderer quality gap is no longer the old sprite fallback. It is that stored pages still lack explicit compositor-authored layout.

Implement the next pass at the `RenderedPage` contract boundary:

1. Add or refine a backend layout/compositor stage that authors explicit:
   - panel placements,
   - row heights,
   - sprite layers,
   - bubble/caption placements,
   - text zones,
   - z-order.
2. Update backend Pydantic models and frontend TypeScript mirrors together if the wire contract changes.
3. Keep the frontend heuristic fallback for legacy `gutter_grid` pages.
4. Verify page 1, page 4, page 8, and page 11 after each meaningful change.
5. Capture desktop and mobile screenshots under `docs/renderer-analysis/experiments/`.

Hard constraints:

- Keep content generation out of renderer fixes.
- Do not change image prompts unless the explicit layout contract requires asset metadata changes.
- Treat `RenderedPage` as the contract boundary.
- Keep `/docs` and `NEXT_SESSION.md` synchronized with implementation reality.
