# Shared UI components (v0.2)

This file is the contract for the app screens. The screen tracks (shelf, Add a book, book page, landing, Settings) build only from this file and `docs/design/`. Import from `@/components/ui`.

Look at every component in both themes at `/dev/components`. That page is only for development: a production build answers 404.

## Rules for every screen

- Use only `--app-*` tokens (from `app/tokens.css`). Do not write a colour in a component. Do not change a reader token.
- One primary button for each view. The primary button is the one thing you want the person to do next.
- Never show an error on a button. Show it in a `Notice` next to the button.
- Yellow (`MomentBand`) is only for the page 1 moment.
- A dashed edge is only for a place where a file can drop (`DropZone` and the "Add a book" tile).
- The reason for an off control is written in words beside it. A tooltip may repeat the reason. It is never the only place.
- Say every state with a word or a shape as well as with colour.
- Every number, time, cost and page count uses tabular figures. `.app-root` sets them. Use the functions in `format.ts` for the words.
- Nothing moves except the `MomentBand`. Do not add hover or focus transitions, spinners or shimmer.
- Do not restyle the page art. `PageFrame` only puts a frame around it.
- Test hooks are fixed (`docs/design/SCREENS-AND-STATES.md` section 0). Use `Button` with `accessibleName` for the busy names.

## The app frame

`app/(app)/layout.tsx` draws the frame. A screen does not draw a header or a footer.

| Part | What it is |
|---|---|
| `SkipLink` | "Skip to content". It moves focus to `<main id="main">`. Each screen has its own `<main id="main">`. |
| `Header` | Wordmark with its mark (links to `/`), the links Shelf and Settings (the current page has a 2 px underline and 700 weight), "Add a book" (the only header button), and a 44 x 44 theme button. Below 768 px: wordmark, theme button and a menu button. The menu dims the page and makes it inert. Escape closes it. |
| `Footer` | "PanelSummary v0.2", a "Settings / About" link and the line "PanelSummary runs on your computer. Only MiniMax gets the book text and page previews." |
| `ThemeButton` | Switches Light and Dark. `aria-pressed` is true when dark is on. |

The reader and the PDF viewer are in `app/(reader)/`. They do not get this frame. The reader layout keeps the v0.1 skip link.

`components/SiteHeader.tsx` renders nothing now. The layout draws the header, so a v0.1 screen that still calls `SiteHeader` shows one header. A screen track removes the call when it rewrites its screen.

### Theme

Light, Dark or "Use the system setting" (the default). The choice is in `localStorage` under `ps-theme` and in `data-theme` on `<html>` (no attribute = system). A blocking script in `<head>` sets the attribute before the first paint. Use `useTheme()` from `@/lib/useTheme` for a Settings control: it returns `pref`, `resolved`, `setPref` and `toggle`. The pure parts are in `@/lib/theme`.

## Components

Each entry names the design board it comes from. Boards are in `Book-Reel-scratch/design-v02/from-claude-design/round-4b/round-4b/`.

### Button
Board: `10-design-system/DS-components` (Button), `2-components/Comp-Parts`.
- Props: `variant` (`primary`, `secondary`, `quiet`, `danger`), `size` (`lg` 52, `md` 48, `sm` 44), `children` (the visible label), `accessibleName`, `href` (renders a link that looks like the button), `iconStart`, `iconEnd`, `loading`, `disabled`, `why`, `fullWidth`, and all normal button attributes.
- States: default, hover, pressed, focus, off, busy.
- Off: set `disabled` and `why` (the reason, in words, beside the button).
- Busy: set `loading`. The button shows three still dots and the label. The label is a verb ("Starting"). Set `accessibleName` to "Generate manga: starting" so the hook name stays.
- Labels never wrap.

### TextLink
Board: DS-components (TextLink), `4-round-2a/Shell`.
- Props: `href`, `kind` (`inline`, `nav`, `back`, `secondary`), `current` (nav only), `menuRow` (nav only, 56 px row).
- `back` starts with the back arrow. `nav` shows the current page with a 2 px underline and 700 weight and sets `aria-current="page"`.

### IconButton
- Props: `label` (the accessible name, required), `icon`, `pressed` (a toggle), `expanded` (a menu button), and button attributes.
- 44 x 44 px. Pressed fills with the action colour.

### Notice
Board: DS-components (Notice), `2-components/Comp-RunCard`.
- Props: `tone` (`needs`, `note`, `info`, `wait`), `title` (bold first line), `children` (what to do), `detail` (shown behind a "Technical detail" disclosure), `inCard`, `role`.
- `needs` has the problem icon. Use it for every error. Text on coral is always `--app-on-fill`.
- Inside a card, use `inCard` and the `RunCard` `notice` slot: the notice runs edge to edge with square corners.

### Disclosure
- Props: `label`, `children`, `defaultOpen`. A button that shows or hides a block. Closed by default.

### MomentBand
Board: Comp-RunCard (page 1 moment).
- Props: `children` (the line), `actions`, `animate`.
- The only motion of the app: the yellow fill grows from the left (`scaleX(0)` to 1, 400 ms, `cubic-bezier(0.16, 1, 0.3, 1)`). With `prefers-reduced-motion` it is full at once. It is a polite live region. The focus ring inside it is `--app-focus-on-moment`.
- Use it once, when page 1 is drawn. On a phone the book page puts this message in the `BottomBar`.

### Checkbox, Switch
- `Checkbox` props: `label`, `extra` (small value at the right), and input attributes. 24 px box. The whole row is the 44 px target.
- `Switch` props: `label` and input attributes. A real checkbox input with `role="switch"`.

### SegmentedControl
Board: Comp-Parts (Theme setting).
- Props: `name`, `legend`, `options` (`value`, `label`, `disabledReason`), `value`, `onChange`.
- Real radio inputs: arrow keys work. The chosen option has a check as well as the fill. An option with `disabledReason` cannot be chosen and shows the reason as a second line.

### NumberField
- Props: `label`, `hint`, `invalid`, `suffix`, and input attributes.
- Invalid: 2.5 px coral edge and a written hint. Disabled: raised ground and a 1.5 px edge.

### Meter
Board: DS-components (StepList, Meter, ResultLine).
- Props: `label`, `valueText` (always shown), `value` and `limit` (a limit meter), or `fraction` (a progress bar), `note`.
- The part over a limit is coral behind a 2 px edge. Say the value and the excess in words.

### Tooltip
- Props: `text`, `children` (one control). Shows on hover and on keyboard focus. Escape hides it. The control gets `aria-describedby`.

### Skeleton
Board: DS-components (PageFrame and Skeleton).
- Props: `shape` (`cover`, `line`, `block`), `width`, `height`.
- No edge, no text, no motion. It must never look like a blank cover.

### StatusBand
Board: DS-components (StatusBand at exactly 160 px).
- Props: `family` (`drawn`, `progress`, `needs`, `outline`), `text`, `fraction` (progress only; leave it out for the dashed "before the plan" line).
- `drawn`: solid band with a check. `progress`: text and a thin outlined line. `needs`: coral with the problem icon. `outline`: outline band (not started, or stopped by you).
- 13 px text. Fits a 160 px cover on two lines. The icon goes before the number group.
- Logic is in `statusBandLogic.ts`: `familyForTone` (maps `shelfStatus()` tones of `lib/words.ts`), `shelfBandExamples()` (the 15 states of section 4), `drawnFraction`.

### PageFrame
Board: DS-components (PageFrame), Comp-Parts (Page tile).
- Props: `state` (`drawn`, `drawing`, `waiting`, `failed`, `blank`), `variant` (`cover`, `thumbnail`), `children` (the art, for `drawn`), `label`.
- Always 2:3. The frame is as wide as its container.
- `drawn`: the art with a 1 px `--app-page-edge` (none on graphite). `drawing`: dense screentone in a 3 px action frame. `waiting`: fine screentone in a 1.5 px edge. `failed`: coral with an on-fill diagonal and the problem icon. `blank`: a plain sheet with a solid 1 px edge. No text and no screentone.
- Put the status band, the page number and any label outside the frame, never over the art.

### ToneStrip
Board: `2-components/Comp-RunStrip`.
- Props: `segments` (one state per planned page), `indeterminate`, `legend`, `showSummary`, `label`.
- Segment states: `drawn` (solid), `drawing` (dense tone in a 3 px action frame), `waiting` (fine tone in an edge), `failed` (coral with a diagonal). Before the plan exists: `indeterminate`.
- It is a picture with a text alternative (`describeSegments`). The Pages grid holds the links.
- Rows of 20 below 640 px of width, up to 40 above. At 60 pages the segments get a 1 px edge, and the drawing and failed segments keep their frame and diagonal.
- Logic is in `toneStripLogic.ts`: `segmentsFromPages(pages, total)`, `describeSegments`, `summaryLine`, `formatPageList`.

### StepList
- Props: `steps` (`label`, `detail`), `current` (index; use `steps.length` when all are done), `numbered`.
- Each step says `done`, `now` or `next` in words and with an icon. The current step is bold.

### ResultLine
Board: Comp-RunStrip (range strip).
- Props: `title`, `actual`, `low`, `high` (numbers in one unit), `actualLabel`, `lowLabel`, `highLabel`, `note`.
- A grey range bar with a mark for the actual value. The label of the actual value leans by position: under 20% it starts at the mark, over 80% it ends at the mark, between it is centred.

### EstimatePanel
Board: Comp-RunCard (A).
- Props: `rows` (`label`, `value`), `basis` (one short line), `detail` (behind a disclosure), `detailLabel`.
- The labels can change. A description list.

### Card and RunCard
Board: Comp-RunCard.
- `Card` props: `as`, `narrow`. Surface ground, 2 px line, 22 px corners, 28 x 32 px padding (18 px below 768 px).
- `RunCard` is a layout shell. It holds no logic. Slots: `eyebrow`, `headline` (a polite live region), `notice`, `steps`, `strip`, `children`, `time`, `actions`, `notes`.

### BottomBar
- Props: `children` (one primary action), `narrowOnly` (default true: hidden from 768 px), `reserveSpace` (default true: adds a spacer so the bar covers no content).
- Fixed to the bottom, with the safe-area padding of a phone.

### DropZone
Board: Comp-Parts (Drop zone).
- Props: `onFile(file, { extra })`, `error`, `disabled`, `title`, `buttonLabel`, `hint`, `accept`.
- A real `<input type="file" accept="application/pdf">` is inside (visually hidden). A drop, a click on "Choose a PDF" and a test script all use it. The screen opens `/books/{id}` when the upload is done.
- Drag over: 3 px dashed action edge, action wash and "Drop to add". More than one file: the first is used and the zone says so.
- `error` shows a coral block at the top. The text and the chooser stay below it.

### OfflineBanner and StatusLine
- `OfflineBanner` shows "Can't reach the PanelSummary server. Check that it is running (./start.sh)." in a full-width coral band. Props: `children` (to replace the text).
- `StatusLine` props: `children`, `tone` (`default`, `wait`, `needs`), `live`. One line of status in words.

### Icons (`icons.tsx`)
Line icons on a 20 x 20 grid with round caps and joins. The line is 2.2 px on screen at any size: the `size` prop changes the stroke in the grid. `DotsIcon` (the loading dots) has a wider line. Only `MoonFilledIcon` has a fill. Do not use `components/Icons.tsx`: the reader owns it.

## Pure logic (with tests)

| File | What it holds |
|---|---|
| `format.ts` | `formatDuration`, `formatDurationRange`, `formatUsd`, `formatUsdRange`, `formatCount`, `pluralize`, `formatPercent`, `rangePosition`, `meterParts`. |
| `toneStripLogic.ts` | Segment states from page lists, the text alternative, the summary line, columns. |
| `statusBandLogic.ts` | The four families, the tone mapping, the 15 shelf states. |
| `steps.ts` | Step states. |
| `lib/theme.ts`, `lib/useTheme.ts` | Theme choice, storage, the blocking script, the hook. |

## Known limits

- The status band "MiniMax refused the key, {a} of {t} drawn" is the longest shelf copy. It fits two lines in 160 px with the narrower width of the font (`font-stretch: 90%`). Verify a longer copy change at 160 px.
- Contrast pairs that are below 3:1 as a pair of colours, and that carry no meaning alone: the coral fill on the page ground (2.83:1), the done band on white (2.09:1), and a drawn segment beside a drawing segment (the dots and the frame say the state). See the pull request for the full list.
