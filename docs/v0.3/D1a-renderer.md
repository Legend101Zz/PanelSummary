# D1a: renderer stand-ins (issue #81, renderer part)

Track D1a. Renderer `manga-render/0.7.0`. Decision D29 in `docs/decisions.md`.
The understanding and page-writer side is track D1b. It uses the exact names in this note.

## Problem

On a book outside the closed vocabulary, the app drew a confident wrong match: an elephant as a horse or a boy,
a crocodile as a fish, a cave as a modern bedroom, the Maze as a blank void, a bone as a sword. The diagnosis
(`docs/v0.3/D1-diagnosis.md`) found that 85 percent of these have no item in the vocabulary (class V).

## What was added

Nothing is for one book. Each new value is a body plan, a size, a kind of place or a shape.

### Archetype figures

| Value | Kind | Nominal height | Drawn with |
|---|---|---|---|
| `quad_small` | `animal` | 25 | a row of the QUAD table (`rig/creature/quad.ts`): small, like a hare or a rodent |
| `quad_medium` | `animal` | 60 | a QUAD row: medium, like a dog or a deer |
| `quad_large` | `animal` | 170 | a QUAD row: large, like a cow or bigger (stands about 156 tall, 225 long) |
| `long_low` | `animal` | 40 | the lizard drawing at 4 times its size: long and low, about 160 long |
| `swimmer` | `animal` | 45 | the fish drawing at 2.25 times its size |
| `bird_tall` | `bird` | 112 | the bird rig: long legs (44), long neck, thin beak, round tail |

- One flat tone (the look's `tone`). Plain round ears and a plain tail on the quadrupeds. No mane, horn, trunk, hoof,
  whiskers or stripes. `long_low` keeps the small back spots of the lizard drawing.
- The usual face and all 18 expressions. Poses: the quadruped rig (13 poses), the lizard rig (7), the fish rig (7),
  the bird rig (16).
- Why six and not seven: the diagnosis names no need for a seventh body plan. `scale` gives the size.
- `ARCHETYPE_SPECIES` in `contracts.ts` lists the six.

### `look.scale`

- Optional number on every look kind. Range 0.05 to 4.0. A person who is an adult is 1.0 (100 figure units).
- Absent: the look keeps its exact size and its exact drawing. Present: `nominalHeight` is 100 x scale.
  The rig draws the look at its own size and the dispatcher (`rig/index.ts`) scales the group. The line width is
  divided by the factor, so the outline keeps its weight on the page. A scale that equals the usual size
  (for example `quad_large` at 1.7) changes nothing, byte for byte.
- A value outside the range, or not a number: error `LOOK_SCALE_RANGE` (`validate/look.ts`).
- Known limits: a pattern tone inside a scaled figure scales with it (the dots grow). Use flat tones for a
  large scaled figure. The speaker rules of the camera (`SPEAKER_MIN_HEAD_RADIUS`) still enlarge a tiny speaker
  in a wide shot, so the ratio is exact only in shots with no speaker.

### Generic backdrops (`env/scenes-generic.ts`)

| Value | What it draws |
|---|---|
| `generic_room` | floor boards, plain walls with a dado rail, one window. No furniture. |
| `generic_hall` | wider (11) and higher (5.2) than the room, flagged floor, two tall arched windows. No chandelier. |
| `generic_passage` | narrow (3) and long (14 deep) in perspective, stone walls, joints across the floor. |
| `generic_rough` | stone-toned walls, dark ceiling with hanging teeth, bare earth, a few rocks. |
| `generic_outdoor` | ground line, horizon, sky, a few stones and bushes. No fence, no building. |

They draw the features of the location (`door`, `window`, `high_wall`, `trees`, and so on) through `drawFeatures`.
`generic_room` and `generic_hall` draw their window themselves, so the feature `window` adds none. `room_poor`,
`room_rich` and `cottage` are not changed.

### Neutral props

`thing_long` (a bone, a spear, a stick, a tool), `thing_round` (a fruit, a ball, a stone, a wheel), `thing_block`
(a loaf, a box, a crate, a wedge), `thing_flat` (a sheet, a board, bark, a tablet), `thing_heap` (a pile of anything).
Plain shapes, toned by `tone`. `thing_heap` is too big to hold. `scene/props.ts` has words for each shape, so a
beat that says "bone" or "pile" makes the prop a key prop (lettering keeps off it).

## Labels

1. A stand-in figure. A cast member of an archetype species gets its cast `name` as a name tag in the first panel
   of each page where it is drawn (a head that is in frame). The writer's own tag wins: a caption with `about` for the
   figure, or a caption that is exactly the name, on any panel of the page. The tag uses the lettering code of the
   name tags (the same caption box, font and placement rules, `NAME_TAG_AMBIGUOUS` included). It is not source text,
   so it is not in `result.texts`. A tag that has no free place is dropped with the warning
   `ARCHETYPE_LABEL_DROPPED`. A name is cut to 40 characters.
2. A neutral prop. `PropSpec.label`: plain text, at most 24 characters. Errors: `PROP_LABEL_TOO_LONG`,
   `PROP_LABEL_MARKUP` (`<`, `>`, `&`, control characters), `PROP_LABEL_EMPTY`, `FIELD_TYPE`. The renderer draws a
   small caption box (`scene/prop-label.ts`) beside the prop: below, above, right, left, then the corners, inside the
   panel, never over a head and never over the prop. It may lean on a body. Lettering keeps off it (it is an obstacle).
   If no place is free the tag is dropped with the warning `PROP_LABEL_DROPPED`. A prop that a figure takes
   from the panel's `props` (a carrying pose) keeps its label.
3. `NEUTRAL_PROP_UNLABELLED` is a warning (rule D26). It also fires for `holding: thing_*` with no labelled prop
   of that id in the panel (a held prop has no label field).

## General fixes

- `abstract` draws the features of its location. With no features the output is unchanged. A plain ground is drawn
  under them. `void` is unchanged.
- "Small" for the camera: nominal height under 45 figure units (and the kind is bird, insect or animal, or the look
  has `scale`). A horse (160), a bear (120), `quad_medium` and `quad_large` are not small. The function is `isSmallFigure` in `scene/compose.ts`.
- A rat or a mouse that sits, talks, points, waves, thinks or holds sits hunched on its haunches with a shorter
  spine and its tail out. The bear and the rabbit keep the upright sit.
- `PROP_WORDS.sword` no longer has "blade". The file does not split hyphenated words, so "blade-bone" stays whole
  (its "bone" is a `thing_long`). D1b fixes the same trigger in the worker (`repair-once.ts`).

## What changed on existing pages (measured)

Method: 341 judged pages of ten saved runs (`Book-Reel-scratch/v02/live/run1..run8` where a judge folder exists,
`final-journey`, `final-journey-2`, `v01-holdout`) were rendered with 0.6.0 (the base of this branch) and with 0.7.0. The SVG
of each page was compared byte for byte.

| Result | Pages |
|---|---|
| Identical | 307 of 341 |
| Changed | 34 |
| Changed by "small by nominal height" (horse, bear) | 29 (all Just So pages with a horse or a bear) |
| Changed by the rodent sit | 4 (run 3 pages 38, 39, 49; run 6 page 29) |
| Changed by the sword words | 1 (run 6 page 23: the blade-bone beat no longer names a sword) |
| Abstract features | 0 pages (no judged page has an abstract place with features) |

Error counts on the 341 pages (page has at least one error): 6 before, 13 after. No error was removed.
Seven pages gain an error, all from the horse change:
`live/run6` page 1 `BALLOON_TALL`, page 10 `TEXT_DOES_NOT_FIT`; `final-journey` page 2 `FACE_COVERED`, page 26
`TEXT_DOES_NOT_FIT`; `final-journey-2` pages 3, 7 and 9 `BALLOON_TALL`. No `FIGURE_*`, `SPEAKER_*` or
`HERO_TOO_SMALL` error appears. Warnings change on 7 pages: `FIGURE_CLIPPED` is new on run 6 page 2, and
`FIGURE_HEAD_CLIPPED` or `FIGURE_CLIPPED` is gone on 6 pages. These seven pages were accepted with the old
renderer. In a live run the writer gets the error and repairs the page. This is the price of the horse no longer
being boosted: a small creature that speaks beside a horse now gets less room. The owner can ask to keep the old rule
for animals of 45 or more by changing `SMALL_NOMINAL` in `scene/compose.ts`.

A page with none of the new values and none of these four causes is byte for byte as in 0.6.0. The gold test
`test/gold-0.7.0.test.ts` pins the 52 pages of the Happy Prince fixture and of run 8 against the 0.6.0 hashes
(`test/fixtures/gold-0.6.0.json`): 51 are identical, 1 changes on purpose (run 8 page 26: the Water-rat talks).
`structural-metrics --fixtures` gives the same numbers as 0.6.0 (46 pages, 204 panels, text over head 28, text
overlaps 13, order breaks 5).

## Verification

```sh
cd packages/manga-render && npx tsc --noEmit && npx vitest run     # 15 files, 919 tests pass
cd apps/agent-worker && npx tsc --noEmit && npx vitest run          # 10 files, 191 tests pass
cd packages/manga-render && npx tsx scripts/structural-metrics.ts --fixtures
```

The replay journey passes 62 of 62 checks on the ports 3210, 8110, 8810 and 27110, with the replay worker
`scripts/fixtures/replays/happy-prince-two-tales`, `--full --replay --check-hosts`. The replay packages store no SVG
hash, so none was refreshed.

## Contact sheets

In `Book-Reel-scratch/v03/d1r/contact/`:

1. `1-archetypes-3-poses.png`: the six archetypes in three poses beside an adult.
2. `2-generic-environments.png`: the five generic backdrops and `abstract`, without and with features.
3. `3-neutral-props-labels.png`: the five `thing_*` props with labels, one page.
4. `4-tuning-*`: two pages of *Just So Stories* (final-journey-2 pages 4 and 21) before (0.6.0) and after, with an
   edited copy of the spec: the Elephant's Child as `quad_large` at scale 1.7, the Crocodile and the Python as
   `long_low`, the cave as `generic_rough` with the blade-bone as a labelled `thing_long`.

## What the renderer does not do

- It does not choose a stand-in. The understanding (D1b) must choose it and say what it stands for.
- A stand-in can still read as an animal. The label is the answer. Whether the judges score a labelled stand-in
  better than a wrong match is not measured here: no live run was made (no MiniMax spend).
- The Maze needs corridors that turn. `generic_passage` is straight.
- The reader shows no list of stand-ins. That is D1b and the frontend.
