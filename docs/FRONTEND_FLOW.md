# Frontend Flow

The frontend is a Next.js app that talks to the FastAPI backend through a single
API helper module. Its job is to upload books, show parsing/generation progress,
start manga project work, manage character assets, and render persisted manga
pages.

---

## Directory map

```text
frontend/
  app/
    page.tsx                         landing/library entry
    upload/page.tsx                  PDF upload
    books/[id]/page.tsx              book dashboard + Manga V2 Lab
    books/[id]/read/page.tsx         parsed-book reader
    books/[id]/manga/v2/page.tsx     manga reader
    books/[id]/manga/v2/characters/  character library
  components/
    MangaV2ProjectPanel.tsx          project controls/status
    BookSpine.tsx                    book-level manga spine summary
    CharacterLibrary/AssetCard.tsx   asset card + QA state
    MangaReader/                     persisted page renderer
  lib/
    api.ts                           all HTTP calls
    types.ts                         backend DTOs + reader types
```

The frontend does not contain a second generation engine. It renders what the
backend persisted. If data is missing, show an honest empty state instead of
inventing a client-side fossil restoration project. YAGNI, but make it manga.

---

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | FastAPI base URL |
| `NEXT_TELEMETRY_DISABLED` | optional | disables Next telemetry |

Local `./start.sh` and Docker Compose both set the API URL for the normal local
stack.

---

## API layer

`frontend/lib/api.ts` owns every backend call. Components do not construct URLs
or parse Axios errors directly.

Major groups:

- book upload/list/read/update,
- manga project create/list/load,
- manga slices/pages/assets,
- book-understanding start,
- slice-generation start,
- job polling,
- image URL helpers,
- model/credit helpers,
- job cancellation.

`frontend/lib/types.ts` is the DTO mirror. The page DTO carries `rendered_page`
as the reader payload.

---

## Routes

### `/`

Landing/library page. Checks backend health and points users toward upload or
existing books.

### `/upload`

PDF upload flow:

1. user selects a PDF,
2. `uploadPdf(file)` posts multipart data,
3. page receives `book_id` + `task_id`,
4. status is polled until parse success/failure,
5. user navigates to the book page.

Large PDF warnings and progress UI live here.

### `/books/[id]`

Book dashboard. It shows parsed book metadata and the Manga V2 Lab controls.
Key child components:

- `MangaV2ProjectPanel` for project creation/generation controls,
- `PipelineTracker` for job phase/progress,
- `GenerationFacts` for source-grounding context,
- `BookSpine` for persisted book-level understanding.

This page is the main operator console for creating a manga project, running
book understanding, generating slices, and opening the reader/library.

### `/books/[id]/read`

Parsed-book reader for checking the source material structure. This is useful
when debugging bad manga output because the problem may be bad PDF parsing, not
bad panel generation. Annoying, but true.

### `/books/[id]/manga/v2`

The manga reader.

Flow:

```text
load project id from query or first project for the book
  → fetch project, pages, slices, assets in parallel
  → choose current page
  → narrow currentPage.rendered_page
  → map MangaAssetDoc to MangaCharacterAsset
  → render MangaPageRenderer or empty state
```

Keyboard navigation uses ArrowLeft/ArrowRight. The side rail shows book spine,
character assets, and generated slices.

### `/books/[id]/manga/v2/characters`

Character library page.

Flow:

```text
load project + assets
  → show missing expression coverage
  → show each asset with QA metadata
  → allow materialize, regenerate, pin/unpin
```

Asset operations go through dedicated API functions so cards stay dumb-ish.
That is SOLID enough without building a tiny enterprise bureaucracy.

---

## MangaReader component flow

`frontend/components/MangaReader/` is the current reader stack.

```text
MangaPageRenderer
  → page_layout.ts decides grid/rows
  → MangaPanelRenderer chooses panel component
  → panel component renders semantic content
  → chrome components render bubbles/SFX/backdrop
```

Important files:

| File | Responsibility |
|---|---|
| `MangaPageRenderer.tsx` | top-level page layout |
| `page_layout.ts` | composition rows and fallback grid |
| `MangaPanelRenderer.tsx` | panel type switch and chrome composition |
| `panels/DialoguePanel.tsx` | dialogue-heavy panels |
| `panels/NarrationPanel.tsx` | narration panels |
| `panels/ConceptPanel.tsx` | abstract/explanatory panels |
| `panels/TransitionPanel.tsx` | time/location/transition panels |
| `chrome/SpeechBubble.tsx` | bubble rendering |
| `chrome/SfxLayer.tsx` | SFX rendering |
| `chrome/PaintedPanelBackdrop.tsx` | fallback painted backdrop |
| `asset_lookup.ts` | maps character assets for rendering |
| `derived_visuals.ts` | deterministic fallback visuals |

The renderer treats the backend contract as authoritative. It can derive visual
fallbacks, but it does not generate story structure.

---

## Reader empty-state rule

The v2 reader narrows `rendered_page` before rendering. It returns `null` when:

- payload is missing,
- payload is not an object,
- `storyboard_page` is missing,
- panels are missing or empty.

That is intentional. Old pages should be migrated or regenerated; the frontend
should not carry compatibility branches forever. Compatibility branches are
where deleted code goes to become undead.

---

## Character library UI

`CharacterLibrary/AssetCard.tsx` displays:

- image or prompt-only placeholder,
- character/expression/asset type,
- status,
- pinned state,
- regeneration count,
- silhouette/outfit scores,
- QA checks.

Actions:

- materialize missing character sheets,
- regenerate one asset,
- pin/unpin one asset.

The page also renders missing expression gaps returned by the assets endpoint.

---

## Styling and accessibility

The project uses Tailwind plus explicit inline color tokens in some manga UI
surfaces. Walmart colors should be preferred for new general-product UI:

- primary blue: `#0053e2`,
- accent spark: `#ffc220`,
- error red: `#ea1100`,
- success green: `#2a8703`.

Reader pages intentionally use manga-paper dark chrome, but interactive controls
still need accessible labels, keyboard support, and visible focus states.
Target WCAG 2.2 AA for new frontend work.

---

## Frontend checks

From `frontend/`:

```bash
npx tsc --noEmit
npm run build
```

`npm run build` is heavier than typecheck and catches route/build failures. It
still cannot tell whether a manga page looks good. For that, do the manual smoke
in [`NEXT_STEPS.md`](NEXT_STEPS.md). Tests have many talents; taste is not one
of them.
