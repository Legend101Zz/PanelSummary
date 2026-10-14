# D1a: renderer stand-ins (issue #81, renderer part)

Track D1a. Renderer `manga-render/0.7.0`; 0.7.1 adds the Gate 1 fixes (section "Gate 1 fixes"). Decision D29 in `docs/decisions.md`.
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
| `quad_medium` | `animal` | 60 | a QUAD row: a plain medium four-legged animal (stands about 53 tall, about 70 long) |
| `quad_large` | `animal` | 170 | a QUAD row: a neutral heavy body, a big plain four-legged animal (stands about 125 tall at the back line, about 190 long) |
| `long_low` | `animal` | 40 | the lizard drawing at 4 times its size: long and low, about 160 long |
| `swimmer` | `animal` | 45 | the fish drawing at 2.25 times its size |
| `bird_tall` | `bird` | 112 | the bird rig: long legs (44), long neck, thin beak, round tail |

- One flat tone (the look's `tone`). No mane, horn, trunk, hoof, whiskers or stripes.
  Each quadruped body plan reads as no one species:
  `quad_small` is a small rodent-like body (plain pointed ears, a plain tail).
  `quad_medium` is a plain medium four-legged animal (the shared outline of a goat, a deer and a dog): a level body
  about 1.4 times the shoulder height, legs about 53% of the shoulder height, slim straight legs, a medium neck that
  goes up and forward, an oval head longer than tall with a modest tapered muzzle, small flat-oval ears at the back
  of the head, a short hanging tail.
  `quad_large` is a plain heavy herbivore (the shared outline of a cow, a hippo and a rhino): a long, nearly horizontal
  barrel (about 1.6 times the shoulder height long, a straight back), short legs (about 40% of the shoulder height) that
  are straight pillars of one width with wide flat feet (no paw, no claw, no bend), a short thick neck that goes
  forward, a boxy head longer than tall with a broad flat blunt muzzle held below the back line, small flat-oval
  ears at the back of the head (never on top of the skull), and a short thin hanging tail.
  `sit` (and `lie`) of `quad_medium` and `quad_large` is a belly-down rest: the body low on the ground, the legs folded
  under, the head up and forward, no raised paw (never an upright sit). Many large animals in stories are heavy and
  blunt-headed, so a pointed snout (wolf), a round face with round ears (bear) or an upright back (ape) would name a wrong species with confidence.
  Front view of `quad_large`: a wide low boxy head in front of a wide barrel, four short pillar legs all visible (the
  fore pair in front, the hind pair at the outer sides behind), the head level with or below the top of the body.
  Front view of `quad_medium`: a narrow oval face on a short neck in front of a narrow body on four slim legs.
  In the front and back view a `quad_*` body always stands on four legs, with the head in front of the body, whatever
  the pose (no sitting upright, no raised paw: that read as a lucky cat). The `talk` pose shows in the face only. `long_low` keeps the small back spots of the lizard drawing.
- The usual face and all 18 expressions. Poses: the quadruped rig (13 poses), the lizard rig (7), the fish rig (7),
  the bird rig (16).
- Why six and not seven: the diagnosis names no need for a seventh body plan. `scale` gives the size.
- `ARCHETYPE_SPECIES` in `contracts.ts` lists the six.

### `look.scale`

- Optional number on every look kind. Range 0.05 to 4.0. A person who is an adult is 1.0 (100 figure units).
  Since 0.7.1 the renderer applies it only to a stand-in species and to a person under 1.0; see "Gate 1 fixes".
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
`final-journey`, `final-journey-2`, `v01-holdout`) were rendered with `release/v0.3` at `9312d14` (renderer 0.6.1, with
the D2 camera push) and with this branch (0.7.0). The SVG of each page was compared byte for byte, and the issues
(errors and warnings) of each page were compared.

| Result | Pages |
|---|---|
| Identical | 307 of 341 |
| Changed | 34 |
| Changed by "small by nominal height" (horse, bear) | 29 (all Just So pages with a horse or a bear) |
| Changed by the rodent sit | 4 (run 3 pages 38, 39, 49; run 6 page 29) |
| Changed by the sword words | 1 (run 6 page 23: the blade-bone beat no longer names a sword) |
| Abstract features | 0 pages (no judged page has an abstract place with features) |

Pages with at least one error: 25 before, 24 after.

One guard of track D2 changed: `test/push-bounds.test.ts` asks for a body share of 0.15 for every planned figure. Two
horse examples (final-journey-2 page 1 panel 2, run 6 page 7 panel 1) now show 0.10, because the horse is no
longer small and its close-up fills the panel with the head. The body-share bound is now 0.08. The head checks of
the test (95 percent of the head circle inside, no `FIGURE_CLIPPED`) are unchanged and pass.

- Five pages gain an error, all from the horse change: `live/run6` page 1 `BALLOON_TALL`; `final-journey` page 2
  `FACE_COVERED`, page 26 `TEXT_DOES_NOT_FIT`; `final-journey-2` pages 3 and 9 `BALLOON_TALL`. A small creature that
  speaks beside a horse now gets less room for its balloon. In a live run the writer gets the error and repairs
  the page.
- Six pages lose an error, also from the horse change: `SPEAKER_TOO_SMALL` on `live/run6` pages 5 and 7,
  `final-journey-2` pages 3, 4 and 8, and `v01-holdout` page 1 (also `TAIL_CROSSES_TEXT`). The horse is no longer
  treated as a small creature, so the speaker beside it is no longer shrunk.
- No new `FIGURE_*`, `SPEAKER_*` or `HERO_TOO_SMALL` error appears. One warning is new: `FIGURE_CLIPPED` on
  `live/run6` page 2.
- Against 0.6.0 (before D2) the same change gave 6 pages with errors before and 13 after (seven pages gained
  an error). D2's push already removes some of them. The owner can ask to keep the old rule for animals of 45 or
  more by changing `SMALL_NOMINAL` in `scene/compose.ts`.

A page with none of the new values and none of these four causes is byte for byte as in 0.6.1. The gold test
`test/gold-0.7.0.test.ts` pins the 52 pages of the Happy Prince fixture and of run 8 against the 0.6.1 hashes
(`test/fixtures/gold-0.6.1.json`): 51 are identical, 1 changes on purpose (run 8 page 26: the Water-rat talks).
`structural-metrics --fixtures` gives the same numbers as the base (46 pages, 204 panels, text over head 29, text
overlaps 13, order breaks 5).

## Verification

```sh
cd packages/manga-render && npx tsc --noEmit && npx vitest run     # 17 files, 938 tests pass
cd apps/agent-worker && npx tsc --noEmit && npx vitest run          # 12 files, 221 tests pass
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
4. `4-tuning-*`: two pages of *Just So Stories* (final-journey-2 pages 4 and 21) unedited and edited (both with the 0.7.0 renderer), with an
   edited copy of the spec: the Elephant's Child as `quad_large` at scale 1.7, the Crocodile and the Python as
   `long_low`, the cave as `generic_rough` with the blade-bone as a labelled `thing_long`.

## Gate 1 fixes (renderer 0.7.1, track fxr, issues #81 and #90)

Gate 1 on the two-tale book scored 3.53 (v0.2: 3.60). Two causes were on the renderer side
(`gate1-analysis-public.md`: A2 and A3). Both fixes are general: they use the kind and the species of a look and
the prop id, never a book.

### A2: `look.scale` sizes a stand-in only

The understanding had set a real-world `scale` on almost every cast member (Swallow 0.08, Nightingale 0.07,
Butterfly 0.06, Lizard 0.1, Prince 2.0). The named species have sizes that read in a panel, so these values made specks.

| Look | What the renderer does with `scale` |
|---|---|
| `quad_small`, `quad_medium`, `quad_large`, `long_low`, `swimmer`, `bird_tall` | applied (it sets the stand-in size) |
| `human`, scale from 0.12 up to but not including 1.0 | applied (a person the size of a mouse) |
| `human`, scale 1.0 or more | ignored, warning `LOOK_SCALE_IGNORED`; use `height: giant` |
| any other look (named animal, bird, insect, object, plant, spirit, crowd, emblem) | ignored, warning `LOOK_SCALE_IGNORED` |
| applied scale under 0.12 | drawn at 0.12, warning `LOOK_SCALE_FLOOR` |

`LOOK_SCALE_RANGE` (0.05 to 4.0) is unchanged and still an error. The code is `resolveLookScale` in `rig/index.ts`;
`nominalHeight`, `draw`, the "small figure" test of the camera (`isSmallFigure`) and the capabilities all use it.
The warnings are added once for each cast member that is drawn on the page (`renderPageDetailed`).

### A3: a label only on a neutral prop

`PropSpec.label` is drawn only on `thing_long`, `thing_round`, `thing_block`, `thing_flat` and `thing_heap`. On any other
prop the label is ignored and the warning `PROP_LABEL_IGNORED` is added. It is a warning, so a page is not sent for repair.
The catalog text of `prop.label` says so.

### Measurement

Method: the page specs of the Gate 1 export (`export/judge/page-NN.json`, status accepted) are rendered with
`export/understanding.json` (cast and locations) by the renderer 0.7.0 (`git archive` of this branch before the change)
and by 0.7.1. No planned page is given. Script: `Book-Reel-scratch/v03/fxr/measure.mts`. All numbers below were measured in this run.

Two-tale book, 22 pages, 117 panels:

| Measure | 0.7.0 | 0.7.1 |
|---|---|---|
| `HERO_TOO_SMALL` | 2 | 0 |
| `SPEAKER_TOO_SMALL` (error) | 0 | 1 (page 5) |
| `FIGURE_CLIPPED` | 1 | 1 |
| other `FIGURE_*` | 0 | 0 |
| Panels with a figure under 10% of the panel height | 5 (5 pages) | 4 (4 pages) |
| Panels with a figure of cast scale 0.1 or less (the 6 birds, insect and lizard): count | 65 on 18 pages | 65 on 18 pages |
| the same figures, share of the panel height: lowest, median | 0.020, 0.278 | 0.049, 0.348 |
| the same figures under 10% / under 15% of the panel height | 4 / 9 | 3 / 7 |
| Pages with an error | 0 | 2 (page 5 `SPEAKER_TOO_SMALL`, page 18 `KEY_PROP_COVERED`) |
| `LOOK_SCALE_IGNORED` | 0 | 32 |
| `PROP_LABEL_IGNORED` | 0 | 8 (pages 7, 16, 17 x4, 22 x2) |

Pages whose SVG changes: 20 of 22 (all except 14 and 21). Reasons: every changed page except 22 draws a cast member whose scale is ignored: the
Prince (2.0 becomes the usual tall person), the Swallow, the Nightingale, the Butterfly, the Lizard or the Sparrows. Page 22 changes only because a label
is dropped from a named prop; pages 7, 16 and 17 have both (labels on rose x6, gem, book). The warning count above is the list: page
by page it is in `out/two-tale-new/summary.json`.

Two pages gain an error that the old render hid. Both are existing rules, not new checks:
- Page 5, panel 6 (wide): the Prince speaks and now has the usual person size (before: 200 units). His head radius is 13 units (the floor is 22), so `SPEAKER_TOO_SMALL` (D31 keeps it as an error: the writer repairs it with a closer shot).
- Page 18, panel 6: the Nightingale is 64 units high (before 34), takes more room and the speech balloon now covers the thorn (`KEY_PROP_COVERED`).
Page 20 loses both `HERO_TOO_SMALL` warnings and gains `SFX_OVER_SUBJECT` (warning). Page 2 gains `FACE_COVERED` (warning). In a live run these are repair rounds, not failures. The cost is in Gate 2.

Viewed as pictures (before and after): page 4 (the Swallow at the Prince's feet is readable, the column and the sky are in
the frame), page 5 (the Swallow in the last panel is a bird, not a speck; the Prince is smaller in the wide panel), page 20 (the Nightingale is a
bird on the tree and in the last panel it is close to the rose-tree). Pictures: `Book-Reel-scratch/v03/fxr/out/two-tale-base/` and `two-tale-new/`.

Just So Stories (partial run, 18 pages with a spec, 88 panels): 12 cast members have a scale. 8 of 12 are archetype species
(`quad_large` 0.5, 1.5, 2 and 1.3, `bird_tall` 1.3, `quad_medium` 0.9, `long_low` 0.6 and 1.1). Every page that draws one of
them and no named animal with a scale (pages 1, 3 to 8 and 10) is byte for byte the same as in 0.7.0: the stand-ins are
still drawn at their scaled size. Pages 2 and 11 change because a named bird with a scale (the Kolokolo, a sparrow at 0.15)
now keeps its usual size (the mouse, the bat and the horse are in no spec of the partial run); pages 13, 16, 18 and 19 change because
a label on a named prop is dropped (5 warnings). `HERO_TOO_SMALL` 0 and 0, `SPEAKER_TOO_SMALL` 0 and 0, `FIGURE_CLIPPED` 2 and 2,
panels with a figure under 10%: 7 and 7. Warnings added: `LOOK_SCALE_IGNORED` 2, `PROP_LABEL_IGNORED` 5.

Gold test: `test/gold-0.7.0.test.ts` still passes unchanged. The 52 pages of the Happy Prince fixture and of run 8 have no
scale and no label on a named prop, so they render as in 0.7.0.

Not measured: the effect on the judge scores. That needs a live run with the judge panel (the orchestrator starts it).

## What the renderer does not do

- It does not choose a stand-in. The understanding (D1b) must choose it and say what it stands for.
- A stand-in can still read as an animal. The label is the answer. Whether the judges score a labelled stand-in
  better than a wrong match is not measured here: no live run was made (no MiniMax spend).
- The Maze needs corridors that turn. `generic_passage` is straight.
- The reader shows no list of stand-ins. That is D1b and the frontend.
