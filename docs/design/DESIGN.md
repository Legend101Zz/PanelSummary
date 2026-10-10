---
name: PanelSummary
description: Black-and-white manga pages in a flat, outlined app frame; a cool print room in light, a graphite reading room in dark.
colors:
  app-bg: "#F4F5F0"
  app-bg-dark: "#26272A"
  app-surface: "#FFFFFF"
  app-surface-dark: "#2E2F33"
  app-surface-2: "#ECEEE7"
  app-surface-2-dark: "#383A3F"
  app-text: "#121212"
  app-text-dark: "#ECEBE6"
  app-text-2: "#4A4D52"
  app-text-2-dark: "#B4B5B8"
  app-line: "#121212"
  app-line-dark: "#82858B"
  app-line-strong: "#121212"
  app-line-strong-dark: "#ECEBE6"
  app-action: "#2F43D9"
  app-action-dark: "#9AA4FF"
  app-action-hover: "#2536B8"
  app-action-hover-dark: "#B8BEFF"
  app-action-pressed: "#1C2B99"
  app-action-pressed-dark: "#CDD1FF"
  app-on-action: "#FFFFFF"
  app-on-action-dark: "#17181A"
  app-action-wash: "#E5E8FB"
  app-action-wash-dark: "#363C60"
  app-action-wash-2: "#DCE0F7"
  app-action-wash-2-dark: "#3D4470"
  app-on-fill: "#121212"
  app-on-fill-dark: "#17181A"
  app-track: "#868A90"
  app-track-dark: "#7A7D83"
  app-done: "#5CC6A0"
  app-done-dark: "#4FB591"
  app-needs-you: "#EE6A45"
  app-needs-you-dark: "#E8704C"
  app-moment: "#F7DD5A"
  app-moment-dark: "#E2C752"
  app-tone: "#121212"
  app-tone-dark: "#ECEBE6"
  app-note: "#121212"
  app-note-dark: "#383A3F"
  app-on-note: "#FFFFFF"
  app-on-note-dark: "#ECEBE6"
  app-page-edge: "#121212"
  app-page-edge-dark: "#00000000"
  app-blank: "#FFFFFF"
  app-blank-dark: "#383A3F"
  app-skeleton: "#EAECE5"
  app-skeleton-dark: "#2F3034"
  app-scrim: "#12121280"
  app-scrim-dark: "#17181A99"
  app-focus: "#2F43D9"
  app-focus-on-moment: "#121212"
typography:
  display:
    fontFamily: Bricolage Grotesque
    fontSize: 54px
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: -0.02em
  headline:
    fontFamily: Bricolage Grotesque
    fontSize: 46px
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: -0.02em
  title:
    fontFamily: Bricolage Grotesque
    fontSize: 30px
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: -0.02em
  body:
    fontFamily: Bricolage Grotesque
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
    fontFeature: "'tnum' 1"
  label:
    fontFamily: Bricolage Grotesque
    fontSize: 17px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0em
    fontFeature: "'tnum' 1"
  page-art-lettering:
    fontFamily: 'PS Comic'
  page-art-sfx:
    fontFamily: 'PS Bangers'
rounded:
  mark: 2px
  range: 3px
  sm: 6px
  input: 10px
  cover: 12px
  control: 14px
  card: 22px
  full: 9999px
spacing:
  space-1: 4px
  space-2: 8px
  space-3: 12px
  space-4: 16px
  space-5: 20px
  space-6: 24px
  space-7: 28px
  space-8: 32px
  space-10: 40px
  space-12: 48px
  space-14: 56px
  space-16: 64px
  space-18: 72px
  space-24: 96px
  gutter: 40px
  gutter-narrow: 16px
  content-max: 1240px
  target: 44px
components:
  button-primary:
    backgroundColor: "{colors.app-action}"
    textColor: "{colors.app-on-action}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 20px
    height: 48px
  button-primary-hover:
    backgroundColor: "{colors.app-action-hover}"
    textColor: "{colors.app-on-action}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 20px
    height: 48px
  button-primary-pressed:
    backgroundColor: "{colors.app-action-pressed}"
    textColor: "{colors.app-on-action}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 20px
    height: 48px
  button-primary-disabled:
    backgroundColor: "{colors.app-surface}"
    textColor: "{colors.app-text-2}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 20px
    height: 48px
  button-primary-loading:
    backgroundColor: "{colors.app-surface}"
    textColor: "{colors.app-text-2}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 20px
    height: 48px
  button-secondary:
    backgroundColor: "{colors.app-surface}"
    textColor: "{colors.app-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 20px
    height: 48px
  button-secondary-hover:
    backgroundColor: "{colors.app-action-wash}"
    textColor: "{colors.app-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 20px
    height: 48px
  button-secondary-pressed:
    backgroundColor: "{colors.app-action-wash-2}"
    textColor: "{colors.app-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 20px
    height: 48px
  button-secondary-disabled:
    backgroundColor: "{colors.app-surface}"
    textColor: "{colors.app-text-2}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 20px
    height: 48px
  button-quiet:
    textColor: "{colors.app-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 6px
    height: 48px
  button-quiet-hover:
    backgroundColor: "{colors.app-action-wash}"
    textColor: "{colors.app-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 6px
    height: 48px
  button-quiet-pressed:
    backgroundColor: "{colors.app-action-wash-2}"
    textColor: "{colors.app-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 6px
    height: 48px
  button-danger:
    backgroundColor: "{colors.app-needs-you}"
    textColor: "{colors.app-on-fill}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 20px
    height: 48px
  button-danger-hover:
    backgroundColor: "{colors.app-needs-you}"
    textColor: "{colors.app-on-fill}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 20px
    height: 48px
  button-danger-disabled:
    backgroundColor: "{colors.app-surface}"
    textColor: "{colors.app-text-2}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 20px
    height: 48px
  button-size-large:
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 26px
    height: 52px
  button-size-small:
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 16px
    height: 44px
  icon-button:
    backgroundColor: "{colors.app-surface}"
    textColor: "{colors.app-text}"
    rounded: "{rounded.control}"
    size: 44px
  icon-button-hover:
    backgroundColor: "{colors.app-action-wash}"
    textColor: "{colors.app-text}"
    rounded: "{rounded.control}"
    size: 44px
  icon-button-pressed:
    backgroundColor: "{colors.app-action}"
    textColor: "{colors.app-on-action}"
    rounded: "{rounded.control}"
    size: 44px
  icon-button-disabled:
    backgroundColor: "{colors.app-surface}"
    textColor: "{colors.app-text-2}"
    rounded: "{rounded.control}"
    size: 44px
  link:
    textColor: "{colors.app-text}"
    typography: "{typography.label}"
    height: 44px
  link-hover:
    textColor: "{colors.app-text}"
    typography: "{typography.label}"
    height: 44px
  link-pressed:
    backgroundColor: "{colors.app-action-wash-2}"
    textColor: "{colors.app-text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: 44px
  link-secondary:
    textColor: "{colors.app-text-2}"
    typography: "{typography.label}"
    height: 44px
  checkbox:
    backgroundColor: "{colors.app-surface}"
    rounded: "{rounded.sm}"
    size: 24px
  checkbox-hover:
    backgroundColor: "{colors.app-action-wash}"
    rounded: "{rounded.sm}"
    size: 24px
  checkbox-checked:
    backgroundColor: "{colors.app-action}"
    textColor: "{colors.app-on-action}"
    rounded: "{rounded.sm}"
    size: 24px
  checkbox-checked-hover:
    backgroundColor: "{colors.app-action-hover}"
    textColor: "{colors.app-on-action}"
    rounded: "{rounded.sm}"
    size: 24px
  checkbox-disabled:
    backgroundColor: "{colors.app-surface-2}"
    textColor: "{colors.app-text-2}"
    rounded: "{rounded.sm}"
    size: 24px
  switch-track:
    backgroundColor: "{colors.app-surface}"
    rounded: "{rounded.control}"
    height: 28px
    width: 46px
  switch-track-on:
    backgroundColor: "{colors.app-action}"
    rounded: "{rounded.control}"
    height: 28px
    width: 46px
  switch-knob:
    backgroundColor: "{colors.app-text}"
    rounded: "{rounded.full}"
    size: 18px
  switch-knob-on:
    backgroundColor: "{colors.app-on-action}"
    rounded: "{rounded.full}"
    size: 18px
  segmented-option:
    backgroundColor: "{colors.app-surface}"
    textColor: "{colors.app-text}"
    typography: "{typography.body}"
    padding: 6px 16px
    height: 52px
  segmented-option-hover:
    backgroundColor: "{colors.app-action-wash}"
    textColor: "{colors.app-text}"
    typography: "{typography.body}"
    padding: 6px 16px
    height: 52px
  segmented-option-selected:
    backgroundColor: "{colors.app-action}"
    textColor: "{colors.app-on-action}"
    typography: "{typography.label}"
    padding: 6px 16px
    height: 52px
  segmented-option-off:
    backgroundColor: "{colors.app-surface-2}"
    textColor: "{colors.app-text-2}"
    typography: "{typography.body}"
    padding: 6px 16px
    height: 52px
  number-field:
    backgroundColor: "{colors.app-surface}"
    textColor: "{colors.app-text}"
    typography: "{typography.label}"
    rounded: "{rounded.input}"
    padding: 0 12px
    height: 48px
    width: 88px
  number-field-error:
    backgroundColor: "{colors.app-surface}"
    textColor: "{colors.app-text}"
    typography: "{typography.label}"
    rounded: "{rounded.input}"
    padding: 0 12px
    height: 48px
    width: 88px
  number-field-disabled:
    backgroundColor: "{colors.app-surface-2}"
    textColor: "{colors.app-text-2}"
    typography: "{typography.label}"
    rounded: "{rounded.input}"
    padding: 0 12px
    height: 48px
    width: 88px
  card:
    backgroundColor: "{colors.app-surface}"
    textColor: "{colors.app-text}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: 28px 32px
  card-narrow:
    backgroundColor: "{colors.app-surface}"
    textColor: "{colors.app-text}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: 18px
  notice-needs-you:
    backgroundColor: "{colors.app-needs-you}"
    textColor: "{colors.app-on-fill}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: 14px 18px
  notice-note:
    backgroundColor: "{colors.app-note}"
    textColor: "{colors.app-on-note}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: 14px 18px
  notice-info:
    backgroundColor: "{colors.app-surface-2}"
    textColor: "{colors.app-text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: 14px 18px
  moment-band:
    backgroundColor: "{colors.app-moment}"
    textColor: "{colors.app-on-fill}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 22px 32px 18px
  status-band-done:
    backgroundColor: "{colors.app-done}"
    textColor: "{colors.app-on-fill}"
    rounded: "{rounded.sm}"
    width: 160px
  status-band-needs-you:
    backgroundColor: "{colors.app-needs-you}"
    textColor: "{colors.app-on-fill}"
    rounded: "{rounded.sm}"
    width: 160px
  status-band-progress:
    backgroundColor: "{colors.app-surface}"
    textColor: "{colors.app-text}"
    rounded: "{rounded.sm}"
    width: 160px
  segment-drawn:
    backgroundColor: "{colors.app-text}"
    rounded: "{rounded.mark}"
    height: 28px
  segment-drawing:
    backgroundColor: "{colors.app-surface}"
    rounded: "{rounded.mark}"
    height: 28px
  segment-waiting:
    backgroundColor: "{colors.app-surface}"
    rounded: "{rounded.mark}"
    height: 28px
  segment-failed:
    backgroundColor: "{colors.app-needs-you}"
    rounded: "{rounded.mark}"
    height: 28px
  meter-track:
    backgroundColor: "{colors.app-track}"
    rounded: "{rounded.full}"
    height: 14px
  meter-fill:
    backgroundColor: "{colors.app-text}"
    rounded: "{rounded.full}"
    height: 14px
  meter-over:
    backgroundColor: "{colors.app-needs-you}"
    height: 14px
  progress-track:
    backgroundColor: "{colors.app-track}"
    rounded: "{rounded.full}"
    height: 8px
  range-bar:
    backgroundColor: "{colors.app-track}"
    rounded: "{rounded.range}"
    height: 14px
  range-mark:
    backgroundColor: "{colors.app-text}"
    rounded: "{rounded.mark}"
    height: 26px
    width: 4px
  drop-zone:
    backgroundColor: "{colors.app-surface}"
    textColor: "{colors.app-text}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: 36px 28px
  drop-zone-dragover:
    backgroundColor: "{colors.app-action-wash}"
    textColor: "{colors.app-text}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: 36px 28px
  cover-blank:
    backgroundColor: "{colors.app-blank}"
    rounded: "{rounded.range}"
  skeleton:
    backgroundColor: "{colors.app-skeleton}"
    rounded: "{rounded.cover}"
  tooltip:
    backgroundColor: "{colors.app-note}"
    textColor: "{colors.app-on-note}"
    typography: "{typography.label}"
    rounded: "{rounded.input}"
    padding: 8px 12px
  skip-link:
    backgroundColor: "{colors.app-action}"
    textColor: "{colors.app-on-action}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 0 20px
    height: 48px
  offline-banner:
    backgroundColor: "{colors.app-needs-you}"
    textColor: "{colors.app-on-fill}"
    typography: "{typography.body}"
    padding: 10px 40px
  menu-scrim:
    backgroundColor: "{colors.app-scrim}"
---
# Design System: PanelSummary

## Overview

**Creative North Star: "The Reading Room."** The app is a quiet frame around black-and-white manga pages. Nothing in the frame competes with the page art: the frame is flat, outlined in ink, and uses colour only to say what happens next. In light it is a cool print room: an off-white ground, white cards, ink outlines. In dark it is a reading room: the graphite of the reader itself, warm off-white text instead of pure white, and no pure black, so the pages feel like paper under a lamp and the eyes stay rested. Only the manga pages are paper-bright.

**Key Characteristics**
- Flat: no shadows, no gradients. Depth comes from three surface steps and ink outlines.
- One action colour (the blue of `app-action`), one "needs you" colour (the coral of `app-needs-you`), one moment colour (the yellow of `app-moment`). Each has one job.
- Screentone dots appear only where the page art is still being made: the progress strip and the waiting and drawing tiles.
- One typeface for the whole frame, Bricolage Grotesque, heavy and tight in headings, with tabular figures for every number.
- Every state is shown by a word or a shape as well as by colour.
- One authored motion in the whole frame: the page 1 moment.

## Colors

The light theme is the default. The dark theme swaps each token for its `-dark` twin (`app-bg` → `app-bg-dark`, and so on for every role). No app role keeps its light value in dark. The focus ring follows the action colour in each theme, and the focus ring inside the moment band follows the on-fill colour.

### Primary
The action colour and its states. It marks the main button, checked and chosen controls, the focus ring, the frame of the segment or tile that is drawing now, and the small mark beside the wordmark. Nothing else is blue.
- `app-action` #2F43D9 → `app-action-dark` #9AA4FF
- `app-action-hover` #2536B8 → `app-action-hover-dark` #B8BEFF
- `app-action-pressed` #1C2B99 → `app-action-pressed-dark` #CDD1FF
- `app-on-action` #FFFFFF → `app-on-action-dark` #17181A: text and icons on the action colour.
- `app-action-wash` #E5E8FB → `app-action-wash-dark` #363C60: hover fill for secondary and quiet controls, and the drop place while a file is over it.
- `app-action-wash-2` #DCE0F7 → `app-action-wash-2-dark` #3D4470: pressed fill for secondary and quiet controls.

### Secondary
State fills. Text on them is always `app-on-fill`, never white: white on #EE6A45 is only 3.10:1.
- `app-needs-you` #EE6A45 → `app-needs-you-dark` #E8704C: coral means "needs you". Fill only.
- `app-done` #5CC6A0 → `app-done-dark` #4FB591: the complete band.
- `app-on-fill` #121212 → `app-on-fill-dark` #17181A: text, icons and marks on every fill.

### Tertiary
- `app-moment` #F7DD5A → `app-moment-dark` #E2C752: the yellow of the page 1 moment, and nothing else.
- `app-tone` #121212 → `app-tone-dark` #ECEBE6: screentone dots.

### Neutral
- `app-bg` #F4F5F0 → `app-bg-dark` #26272A: the page ground. In dark it is the reader's graphite on purpose, so the app and the reader are one room.
- `app-surface` #FFFFFF → `app-surface-dark` #2E2F33: cards, inputs and controls.
- `app-surface-2` #ECEEE7 → `app-surface-2-dark` #383A3F: raised blocks and an option that is off.
- `app-text` #121212 → `app-text-dark` #ECEBE6: text, headings, drawn segments.
- `app-text-2` #4A4D52 → `app-text-2-dark` #B4B5B8: secondary text, disabled edges.
- `app-line` #121212 → `app-line-dark` #82858B: card edges and rules.
- `app-line-strong` #121212 → `app-line-strong-dark` #ECEBE6: control outlines and segment edges.
- `app-track` #868A90 → `app-track-dark` #7A7D83: the empty part of a progress bar or meter, and the estimate range bar.
- `app-note` #121212 → `app-note-dark` #383A3F with `app-on-note` #FFFFFF → `app-on-note-dark` #ECEBE6: the note block and the tooltip.
- `app-page-edge` #121212 → `app-page-edge-dark` #00000000: the edge of a manga page; transparent on graphite.
- `app-blank` #FFFFFF → `app-blank-dark` #383A3F: a cover with no art yet (a plain sheet with a solid edge, no text).
- `app-skeleton` #EAECE5 → `app-skeleton-dark` #2F3034: loading placeholders.
- `app-scrim` #12121280 → `app-scrim-dark` #17181A99: behind the phone menu.

### Tokens, the reader and the build
- `docs/design/tokens.css` is the normative token file. The UI foundation imports it. The new app tokens are only `--app-*`.
- The reader tokens stay in `frontend/app/globals.css` with their names and values: `--graphite*`, `--on-graphite*`, `--pencil*`, `--redpen`, `--sheet`, `--ink*`, `--rule`, `--board`, `--font-title`, `--font-ui`, `--ease`, `--page-ratio`, and the classes `.btn`, `.btn-ink`, `.btn-redpen`. The table at the top of `tokens.css` shows which v0.1 token each `--app-*` token replaces, and which v0.1 app-only rules it replaces (shelf, upload, book page).
- Put `.app-root` on the app layout, never on the reader layout. The PDF viewer uses `.app-reading-room`.
- `tokens.css` expects the font file at `/fonts/BricolageGrotesque-VF.woff2`.
- Theme setting: Light, Dark or "Use the system setting". The default is the system setting.

### Fixed parts (the same in both themes)
- Manga paper #FBFAF6: the page art itself. Page art only.
- The reader's graphite room: #26272A ground, #333438 and #45474C raised surfaces, #ECEBE6 text, #A9ABAF secondary text. The reader and the PDF viewer keep these in both themes. `app-bg-dark` is the same graphite #26272A, and `app-text-dark` is the same #ECEBE6, on purpose.
- The lettering faces 'PS Comic' and 'PS Bangers'. Page art only.

## Typography

One family for the whole frame: Bricolage Grotesque, a self-hosted variable font with three axes: optical size (opsz 12 to 96, set automatically from the font size), weight (wght 200 to 800) and width (wdth 75 to 100, held at 100).

- **Display** (54px, 800, line height 1.05, −0.02em): opening phrases and error titles.
- **Headline** (46px, 800, line height 1.1, −0.02em): page titles.
- **Title** (30px, 800, line height 1.15, −0.02em): headings inside cards.
- **Body** (17px, 400, line height 1.5): running text; 700 for emphasis.
- **Label** (17px, 700, line height 1.2): buttons, links, field values.

Body and label use tabular figures (`tnum`), so every time, cost, count and page number lines up and does not jump as it changes. Headings are always 800 with tight tracking; body text never goes below 400. In the dark theme, body text gets more air: line height 1.6 and +0.01em tracking.

The page art uses its own faces, which the frame never sets: **page-art-lettering** ('PS Comic') for balloons and captions, and **page-art-sfx** ('PS Bangers') for sound effects. Page art only.

## Layout

A 4px spacing base: 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 72 and 96px. Content is at most 1240px wide, with a 40px gutter (16px on narrow screens). The frame is designed at 1440px and 390px wide and never scrolls sideways at 390px. Every target is at least 44px in both directions.

Cards hold one task each and sit on the ground with 28px by 32px of inner padding (18px on narrow screens). Lists are rows with 1px rules between them, not tiles. Manga pages always keep their 2:3 shape; covers and thumbnails are the pages at a small size.

## Elevation & Depth

The frame is flat: no shadows and no gradients anywhere. Depth comes from three surface steps (`app-bg` under `app-surface` under `app-surface-2`) and from outlines.

**Outlines**
- Cards: 2px `app-line`.
- Controls (buttons, inputs, checkboxes, segmented controls, the switch track): 2px `app-line-strong`.
- Rules between rows: 1px `app-line`, or 1px `app-surface-2` for light rows inside a card.
- Progress segments and tiles: 1.5px `app-line-strong`; the one drawing now: 3px `app-action`.
- An invalid number field: 2.5px `app-needs-you`.
- The over-limit part of a meter: a 2px `app-on-fill` edge between the fill and the coral.
- A manga page on the light ground: 1px `app-page-edge`. On graphite, no edge.
- Drop places only: 2.5px dashed `app-line-strong`; while a file is over them, 3px dashed `app-action` on `app-action-wash`. No other edge is dashed.

**Focus ring**: 2px solid `app-focus`, 2px outside the element, in both themes. Inside the yellow moment band the ring is `app-focus-on-moment`.

**Scrim**: `app-scrim` dims the page behind the open phone menu.

**Motion**: one authored motion only, the page 1 moment. The yellow fill of the moment band grows from the left once, `transform: scaleX(0)` to `scaleX(1)` with `transform-origin: left`, over 400ms with `cubic-bezier(0.16, 1, 0.3, 1)`. With `prefers-reduced-motion: reduce` there is no transition: the band appears filled. Nothing else moves: no hover or focus transitions, no spinners, no skeleton shimmer, no page or scroll effects.

## Shapes

Rounded rectangles in a short scale: 2px for progress segments and marks, 3px for the range bar and manga page frames, 6px for checkboxes, skeleton lines and status bands, 10px for number fields, tooltips and code blocks, 12px for the skeleton cover, 14px for buttons, segmented controls, notices and the moment band, 22px for cards and every drop place (the "Add a book" tile on the shelf too, which was 12px in some frames), and full (9999px) for meter tracks and the switch knob.

Icons are line drawings on a 20 by 20 grid with round caps and joins, no fills (only the pressed moon icon fills), in the current text colour, and always a 2.2px line on screen: the stroke in the grid is 2.2 × 20 ÷ the drawn size. The loading dots are the one exception, with a wider stroke so they read as dots. Screentone is a pattern of round dots in `app-tone`: fine dots for a waiting tile or segment, denser dots for the one drawing now.

## Components

**Buttons** are 48px high (52px large, 44px small), 14px corners, a 2px `app-line-strong` edge, label type. Primary: `app-action` with `app-on-action` text; hover `app-action-hover`, pressed `app-action-pressed`. Secondary: `app-surface`; hover `app-action-wash`, pressed `app-action-wash-2`. Quiet: no fill and an underlined label; hover `app-action-wash`, pressed `app-action-wash-2`. Danger: `app-needs-you` with `app-on-fill` text; hover adds a 2px inner `app-line-strong` edge, pressed a 3px one. Disabled and loading: no fill of their own (the surface shows through), a 1.5px `app-text-2` edge, `app-text-2` text, and the reason in words beside the button; loading shows three still dots and a verb. Errors are never shown on the button; they appear in a notice beside it. Only one primary button per view.

**Links** are underlined label text in `app-text` (1.5px underline, 3px offset); hover thickens the underline to 3px; pressed adds an `app-action-wash-2` fill. Navigation links show the current page with a 2px underline and 700 weight. Back links lead with the back arrow.

**Icon buttons** are 44px squares with a 2px `app-line-strong` edge; hover `app-action-wash`; pressed (a toggle that is on) `app-action` with `app-on-action`.

**Checkboxes** are 24px with 6px corners and a 2px `app-line-strong` edge; checked fills `app-action` with an `app-on-action` check. **Switches** are a 46 by 28px track with an 18px knob; on fills `app-action`. **Segmented controls** are one 2px `app-line-strong` outline around 52px options; the chosen option fills `app-action` with a check; an option that cannot be chosen is `app-surface-2` with its reason as a second line.

**Number fields** are 88 by 48px, 10px corners, 2px `app-line-strong`; hover changes the edge to `app-action`; invalid uses a 2.5px `app-needs-you` edge and a written hint below; disabled is `app-surface-2` with a 1.5px `app-text-2` edge.

**Cards** are `app-surface` with a 2px `app-line` edge and 22px corners. A notice inside a card runs edge to edge with square corners.

**Notices**: needs-you (coral with a problem icon), note (`app-note`), info and wait (`app-surface-2` with an icon), and the moment (yellow, page 1 only). 14px corners outside cards.

**Progress strip**: one segment per page. Drawn: solid `app-text`. Drawing now: dense screentone inside a 3px `app-action` frame. Waiting: fine screentone inside a 1.5px edge. Could not be drawn: `app-needs-you` with an `app-on-fill` diagonal. A legend names every state in words. In the dark theme the strip keeps the same rules: drawn is solid `app-text` (paper #ECEBE6), and waiting is fine screentone inside an edge. Two questions are open for the owner and are not decided: whether drawn segments in dark should be grey #B4B5B8 instead of paper, and whether waiting segments in dark should be outline-only with no dots (a drawing segment next to a waiting one is under 3:1 by colour alone). See "Open owner questions" in `docs/design/README.md`.

**Meters and progress bars**: an `app-text` fill on an `app-track` track with full rounding; the part over a limit is `app-needs-you` behind a 2px `app-on-fill` edge, and the value is written in words beside the bar.

**Status band** under a cover, 160px wide: done (`app-done` with a check), in progress (an outlined line filled to the fraction), needs you (`app-needs-you` with a problem icon), not started or stopped (outlined, no fill).

**Moment band**: `app-moment` with `app-on-fill` text, 14px corners; the only motion described under Elevation & Depth. On a phone (390px) the band does not sit outside the run card. Its place is the fixed bottom bar: the bar carries "Page 1 comes first…", then turns yellow with "Start reading" when page 1 is drawn (Round 2b; this changes the Choice 1 KEEP item "the yellow band outside the run card" on phones, and the owner accepted it).

**Bottom bar at 390px**: the one "Generate manga" button stays in the fixed bottom bar while sections are being chosen, so it is on the first screen (Round 3c broke this rule; the fix is in `docs/design/SCREENS-AND-STATES.md`).

**Drop place**: `app-surface`, 22px corners, dashed edge as described under Elevation & Depth; its error state adds a `app-needs-you` block at the top.

**Skeleton**: `app-skeleton` blocks with no edge and no text (this is the Choice 2, item 5 rule: a cover with no art never carries text on the sheet); a cover with no art is a plain sheet in `app-blank` with a solid 1px `app-line` edge, no text and no screentone. The title and author are set once, under the sheet, as for any cover. The skeleton has no edge and no text, so the two never look alike.

**Tooltip**: `app-note` with `app-on-note` text, 10px corners, shown on hover and focus of a control that is off.

## Do's and Don'ts

**Do**
- Keep the frame flat: surfaces and outlines only.
- Use `app-action` for the action, chosen controls, the focus ring, the drawing-now frame and the wordmark's mark, and for nothing else.
- Put `app-on-fill` text on every coral, mint and yellow fill.
- Pair every colour state with a word, an icon or a shape.
- Keep screentone to the progress strip and the waiting and drawing tiles.
- Keep tabular figures on every number.
- Let the manga pages be the only paper-bright things in the dark theme.

**Don't**
- Don't use shadows or gradients.
- Don't put white text on coral.
- Don't use yellow for anything but the page 1 moment.
- Don't dash an edge unless it is a drop place.
- Don't use near-black or pure white in the dark theme, and don't add paper-coloured blocks to it.
- Don't add stat tiles or a cream ground.
- Don't animate anything but the page 1 moment.
- Don't restyle the reader or its graphite room; don't set the page-art faces in the frame.
