# T2: renderer props, scale, places, captions and story-state looks

Track T2 of the v0.1 launch (tracker #17). Branch `t2/renderer-props`, made from `release/v0.1` at `fd5a326`.
Renderer version: `manga-render/0.4.0` (it was `0.3.0`).

This page does four things. It counts the renderer problems in acceptance run 8. It shows what this track fixed, with tests and before/after pages. It maps issue #5 to the code, so the owner can close it. It lists what remains.

## 1. Status

- Status: PARTIAL. All six blockers have a fix or a new capability. Two of the six (the moor and the Roman Candle) are fixed on the run-8 pages. Four are partly fixed: the Rose-tree needs a page spec that sets the new `bloom` field, the held rose is drawn on page 18 panel 1 only, the Giant is bigger but the trees are still taller, and the caption leaves the subject but the subject is still small. Section 3 gives the detail.
- No live model call was made. The orchestrator must run the live journey and the judge to re-score the pages. Until then, no score on this page is a measured score. The statuses below come from structural tests and from looking at the re-rendered run-8 pages.
- Of the 93 problems that the run-8 judges filed under "renderer": 22 are fixed, 17 are partly fixed, 54 are not fixed. 5 of the 93 are staging choices of the page writer (track T1), not renderer problems (kind P in section 2).

## 2. Problems in run 8, grouped by kind

Source: `judge-scores.json` of run 8 (46 pages). 93 defects have the owner "renderer". 6 of them have the severity "blocker". The judge filed the Roman Candle as a "major" problem, not as a blocker, but the owner counts it with the six.

I grouped the 93 problems by hand, one kind for each problem (no keyword guess). Each problem is in exactly one kind. The per-problem list is in section 7.

| Kind | Defects | Blockers | Fixed | Partly fixed | Not fixed |
|---|---|---|---|---|---|
| A Figure cropped or pushed out of the frame | 6 | 0 | 1 | 2 | 3 |
| B Key or held prop off the frame | 2 | 1 | 1 | 1 | 0 |
| C Prop missing from the vocabulary or not drawn | 10 | 0 | 0 | 5 | 5 |
| D Giant and relative scale | 4 | 1 | 1 | 3 | 0 |
| E Figure too small to read | 6 | 0 | 0 | 0 | 6 |
| F Place blank, wrong or missing a feature | 14 | 1 | 5 | 0 | 9 |
| G Caption or name tag over the subject, or read out of order | 9 | 1 | 5 | 1 | 3 |
| H Balloon, tail and attribution | 7 | 0 | 0 | 1 | 6 |
| I Pose or anchor not honoured | 6 | 0 | 0 | 0 | 6 |
| J Story-state looks | 6 | 2 | 1 | 2 | 3 |
| K Figure look, expression or rig | 6 | 0 | 2 | 1 | 3 |
| L Figures cover other faces | 3 | 0 | 0 | 0 | 3 |
| M Identical or wrong designs (fireworks, trees) | 5 | 0 | 4 | 0 | 1 |
| N Text format inside balloons | 3 | 0 | 1 | 1 | 1 |
| O Crowd head count | 1 | 0 | 1 | 0 | 0 |
| P Writer-side staging that the judge filed under the renderer | 5 | 0 | 0 | 0 | 5 |
| Total | 93 | 6 | 22 | 17 | 54 |

How to read "fixed": a structural test fails on the old code and passes on the new code, and the re-rendered run-8 page shows the change. "Partly fixed": the renderer can now draw it, but the run-8 page spec does not use it, or only part of the problem is gone. "Not fixed": no change in this track.

Many problems come from the closed vocabulary. The vocabulary had no moor, no ditch, no foundry, no firework, no gold leaf, no bare tree. The page writer then picked a wrong stand-in (`abstract`, `country_road`, `candle`). This track adds the missing words, and it also reads the name of a stand-in location or cast member so that old specs draw correctly.

## 3. What this track changed

Every change has a test in `packages/manga-render/test/defects.test.ts`. The tests read the run-8 specs from `packages/manga-render/test/fixtures/defects/` (a compact copy of the 46 judged pages and their cast; it is not the T4 folder). I wrote each test first and saw it fail. After the fixes, I ran 10 mutants in a private `git archive` copy under the scratch folder. Each mutant switches one fix off. The tests killed all 10.

Image folders (all on the SSD, scratch folder `/Volumes/Mrigesh SSD/Book-Reel-scratch/launch/t2-impl/render/`):

- `before/page-NN.png`: the run-8 pages, rendered with the `release/v0.1` code (version 0.3.0).
- `page-NN.png`: the same pages, rendered with this branch.
- `pairs/page-NN.png`: before (left) next to after (right). I looked at each pair named below.
- `../demo/demo-page-15-bare-red-tree.png`: page 15 with `variant: {tone: "dark", bloom: "bare"}` set by hand, to show the new field.

| Blocker | Page | Status | What changed | Evidence |
|---|---|---|---|---|
| Red Rose-tree in full bloom, no roses | 15, 17 | Partly fixed | New closed field `bloom` ("full", "buds", "single", "bare") on a plant look and on a panel variant. "bare" draws no rose and no leaf. "single" draws one rose on the top spray. The old `eyes: "dead"` still gives a bare plant. The run-8 specs do not set `bloom`, so they still draw roses. Track T1 must tell the model to use it. | Test D1. Rig `src/rig/plant.ts`. Image `demo/demo-page-15-bare-red-tree.png` (the red tree is bare in panel 4). |
| Held rose falls off the frame | 18 | Partly fixed | The renderer measures the box of each held prop. If it is outside the panel, it slides the figure sideways. If that fails, it draws the prop in front of the figure and gives the warning `HELD_PROP_OFF_FRAME`. Panel 1 now shows the rose in the hand. Panels 2 and 4 have no rose prop in the spec, so nothing can be drawn (writer problem). | Test D2 (pages 18, 19, 33, then all 46 pages). `pairs/page-18.png`. |
| Giant drawn man-sized | 21, 23, 25 | Partly fixed | Giant height factor 1.8 to 2.6. A giant counts at 68% of his height when a ground shot sets the figure height. The giant is at least 2.2 times a person beside him (heads: 1.5 times in close shots). In `pairs/page-21.png` panel 1 he is about 3 times a child, but the environment trees are still taller than he is: the tree size does not depend on the figure scale. | Test D3. `pairs/page-21.png`. |
| Moor drawn blank | 32 | Fixed | New environments `moor`, `ditch` and `forge`. A location that is `abstract`, `void`, `country_road` or `meadow`, but called a moor, a ditch or a foundry in its name or description, is drawn as that place. Pages 32, 42, 43, 44 and 13 change. | Test D4. `pairs/page-32.png`. |
| Caption over the subject | 35, 5, 4, 10, 13, 14 | Partly fixed | A caption, narration box or name tag may not cover more than 10% of a figure, and not more than 25% of a hat, a hand or a scenery figure, when any free spot exists. If no spot exists, the old placement rules apply (no new `TEXT_DOES_NOT_FIT` error). On page 35 the caption now sits beside Hans. Hans is still a small lying figure. | Test D5. `pairs/page-35.png`. |
| Roman Candle drawn as a wax candle | 38 to 40 | Fixed | New object shapes `roman_candle`, `squib` and `bengal_light`, each with its own silhouette. A cast member that has the shape `candle` or `firecracker` and a name with "Roman Candle", "Squib" or "Bengal Light" is drawn with the new shape. A shape that is not a stand-in is never renamed. | Test D6. `pairs/page-38.png`. |

Other changes in this track:

- Story-state looks for track T1: `eyes: "one_blind"` (one socket empty, one eye left), `bloom` for plants, and the existing `material` ("gold" or "stone") and `eyes` ("blind"). The new words are in `src/contracts.ts`, in the catalog, and in `apps/agent-worker/src/goals/vocabulary.ts` (the text the model reads). Test D7.
- New props: `gold_leaf`, `thorn`, `axe`, `firework`, `sign`. A beat that names them marks them as key props. Test D7.
- Speakers: a small speaker beside a much bigger figure is drawn up to 2.6 times larger than true scale, only when the zoom for a readable speaker would push the big figure out of the panel. On page 2 the Reed and the Swallow now both show. No run-8 page has a head more than 30% outside its panel (before: 2 cases). Test D8.
- Scene captions ("The city square, in frost.") are read first, at the top left, even when the writer lists them last. Test D8.
- Balloons print no quotation marks round a whole line (`unquoteSpoken`). A line with a speech tag inside it is left as it is. Test D8.
- Crowds: optional `count` (1 to 8) on a crowd look, and eyes and a mouth on back-row heads. Test D8.
- Expression: "determined" has softer brows (human and creature). Test D9.
- Backward compatibility: all new fields are optional. A test renders all 46 run-8 specs with no error. A second test verifies that the version changed.

## 4. How I measured

- Offline verification, run in this branch. Load average at the run: 8.2 (this Mac is shared).
  - `packages/manga-render`: `npx tsc --noEmit` passes. `npx vitest run`: 9 files, 691 tests, all pass, 34.8 s. Before this track: 606 tests.
  - `apps/agent-worker`: `npx tsc --noEmit` passes. `npx vitest run`: 2 files, 41 tests, all pass.
  - Re-render of the 46 run-8 pages with `scripts/rerender-acceptance.ts --pairs`: 0 pages with errors, 21.6 s at load 6.9. Before this track: 0 errors, 14.1 s at load 5.0. The warning list gains only `HELD_PROP_OFF_FRAME` (4 times).
- I did not run the backend tests or the live journey (outside my paths, and no model spend in this track).
- A test is not the live journey. The pages must go through the judge again (issue #17) before anyone says a blocker is closed.

## 5. Issue #5 mapped to the code

Issue #5 is "Manga page DSL v2: hierarchical layout, page scripts, deterministic composition and lettering". It was written before the 2026-09-25 rebuild (PR #16). Most of it was done in a new way. The old text speaks about ScrollStack, Python contracts and image generation. Decisions D1 to D4 replaced that design.

"Rebuild" below means PR #16 (`main` `7c14501`) and the code in `packages/manga-render`.

| #5 item | Verdict | Evidence or reason |
|---|---|---|
| Work: port ScrollStack ADR-009 contracts, layout compiler, golden vectors, SVG previews | Done in the rebuild | `packages/manga-render/src/contracts.ts` (`manga-page.v1`, `LayoutSpec`), `src/layout/compile.ts`, `src/layout/geometry.ts`, `src/layout/templates.ts` (25 templates), tests `test/core.test.ts`. The Python compiler is obsolete: D4 moved it to TypeScript. |
| Work: finish ScrollStack phase 2 (asset generation, composition, lettering, final render, reader, acceptance) | Done in the rebuild, except asset generation (obsolete) | Composition: `src/scene/compose.ts`. Lettering: `src/lettering/`. Final SVG: `src/render.ts`. Reader shows the stored SVG: `frontend/components/SvgPage.tsx`. Acceptance: `docs/rebuild/ACCEPTANCE.md`, runs 1 to 8. Asset generation: obsolete, D3 (no image models). |
| Work: deterministic lettering engine | Done in the rebuild | `src/lettering/` (balloons, captions, SFX, tails, fit or reject). It never truncates text. |
| Work: craft validators, each with a red fixture | Done in the rebuild | `src/validate/page.ts` and `src/catalog.ts` (warnings such as `BLOCKAGE_LAYOUT`, `FIRST_PANEL_SMALL_AFTER_HOOK`, `PROSE_WALL`). Red tests: `test/core-staging.test.ts`. |
| Work: reader v2 on compiled geometry, v1 path untouched | Done in the rebuild | The reader shows the stored SVG (D4). The v1 path is not part of v0.1. |
| Work: carry the visual-upgrade work (vector scene layer, sprites, bubble rules) | Done in the rebuild, without sprites | Procedural places, figures, props and effects: `src/env/`, `src/rig/`, `src/props/`, `src/fx/`. Sprites are obsolete, D3. This track adds places (`moor`, `ditch`, `forge`), props and looks. |
| Work: owner review gate (SVG preview before image spend) | Obsolete, with one part deferred to v0.2 | No image spend exists to protect (D3). One-page retry exists: `frontend/app/books/[id]/page.tsx`, `scripts/acceptance/ui-retry.mjs`. A preview-and-approve step before Generate is deferred to v0.2: v0.1 is judged by the one-click journey. |
| Gap 1: character breakout over the frame | Deferred to v0.2 | Not a blocker in run 8. It needs a layer above the panel borders. |
| Gap 2: balloons across panel borders | Deferred to v0.2 | An SFX may already break the border (`impact_burst`, `speed_lines`). Cross-panel balloons need a reading-order rule. |
| Gap 3: SFX as warped lettering | Done in part in the rebuild | SFX are rotated, outlined and placed by code in `src/lettering/`. Warp presets are deferred to v0.2. |
| Gap 4: tone, speed-line and emotion-mark vocabulary | Done in the rebuild | `TONES`, `FX` in `src/contracts.ts`; drawing in `src/fx/index.ts`. |
| Gap 5: layout template library | Done in the rebuild | `src/layout/templates.ts` (25 named templates with use notes) and authored split trees. |
| Gap 6: polygon-to-mask export | Obsolete | Its only user was image generation (D3). |
| Acceptance: panel count, size, camera, read order, dialogue place and page-turn hooks are authored; no heuristic layout | Done in the rebuild | `manga-page.v1` fields; run 8 gave 46 of 46 pages with no layout error. |
| Acceptance: "two stacked panels" survives to geometry | Done in the rebuild | Authored split trees and template slots compile to polygons: `test/core.test.ts`. |
| Acceptance: each craft validator has a red fixture; the report is stored for each page | Done in the rebuild | Tests in `test/core-staging.test.ts`. The job stores `svg_hash`, `renderer_version` and the warnings for each page: `backend/app/jobs/generate.py`. |
| Acceptance: one page regenerated after feedback changes only that page | Done in the rebuild | Pages are separate records, and the UI retries one page (D11, `scripts/acceptance/ui-retry.mjs`). |
| Acceptance: v1 sample projects render the same through the legacy path | Obsolete | The rebuild has one production path (D1). There is no legacy lane in v0.1. |
| The six renderer blockers in the 2026-10-09 status comment | In this track, see section 3 | Two are fixed on the run-8 pages. Four need a page spec that uses the new fields, or more work. |

Advice for the orchestrator: close #5 when the live journey and the judge show the six blockers closed. The mapping above covers every work item and every acceptance line. The only rows that are not "done" are "obsolete" or "deferred to v0.2", each with a reason.

## 6. What remains

Not fixed in this track (54 problems, see section 7):

- Statue shots without the column: the Prince stands on a box or at street level (pages 4, 9, 11, 12). The code for the column exists, but these shots do not use it.
- Figures that are too small at establishing scale (pages 1, 3, 7, 14, 26, 37).
- Pose problems: a perch on a hand is ignored, a kneel stays standing, a lying figure floats (pages 3, 6, 13, 25, 37, 43).
- Balloon tails that are too long, and balloons on heads (pages 1, 2, 15, 29, 36, 39, 45). I tried a shorter tail allowance. It caused a new `TAIL_CROSSES_TEXT` error on page 18. I reverted it. A change here needs a calibration run on judged pages, as run 6 showed.
- Other figures that cover a speaker's face (pages 43, 45, 46).
- Special tree looks (the white, yellow and marvellous trees, the spring garden), a fur coat outfit, and hair that changes with the shot size.
- Details of the beat that need a picture of their own: nail prints, birds on boughs, tulips, a notice text on the sign.

Work for other tracks, from what I saw:

- T1 (writer and continuity): use `bloom` for the Rose-tree (pages 15 and 17), `one_blind` and `material` for the Prince, `gold_leaf` for page 10, `axe` for page 23, `count` for "two boys", and the new places. Put the rose prop in the panels of page 18. The 5 problems filed as "writer-side" in section 7 are theirs.
- T4 (judge): the run-8 judge files problems by owner. Pages 15, 17 and 18 stay red until T1 uses the new fields.

## 7. Per-problem status

Kind letters are the letters in the table in section 2. The order is the order in `judge-scores.json` (by page).

| No. | Page | Severity | Kind | Status | What the judge saw (shortened) |
|---|---|---|---|---|---|
| 1 | 1 | major | H | not fixed | In p2 the two balloons sit on top of the councillor crowd. The speaking councillor's face is ... |
| 2 | 1 | minor | E | not fixed | In p1 the statue is tiny, and nothing reads as gold or jewels. An introduction shot of the ... |
| 3 | 2 | major | A | fixed | In the narrow p2 the Swallow is cropped at the left edge and the Reed (specified at ... |
| 4 | 2 | major | H | partly fixed | Both balloons have very long tails to tiny, cropped speakers. The p2 tail ends in the reeds ... |
| 5 | 2 | minor | K | fixed | The 'determined' expression draws the Swallow with angry brows (p4). This recurs through the ... |
| 6 | 3 | major | I | not fixed | In p4 the Swallow stands in mid-air beside the Prince's head instead of between his feet, so ... |
| 7 | 3 | minor | E | not fixed | At small scale in p1 the statue reads as a hooded figure with no crown, unlike the crowned ... |
| 8 | 4 | major | G | fixed | The p3 caption box sits over the statue on its column, the only subject in the panel. What ... |
| 9 | 4 | major | F | not fixed | In p1 the Prince stands on a flat grey floor, with no column or pedestal edge and no city ... |
| 10 | 5 | major | G | fixed | In p3 the caption "Her sick boy" sits right on the boy's head and bed, so the boy is ... |
| 11 | 5 | major | A | not fixed | In p2 the medium shot is framed on the Prince's robe and cuts off his head. The balloon's ... |
| 12 | 5 | minor | C | not fixed | The ruby is drawn as a colourless faceted diamond. In p1 a stray sword prop is drawn on the ... |
| 13 | 6 | major | C | not fixed | p2 is an extreme close-up of the Swallow's face beside a giant diamond. There is no table, ... |
| 14 | 6 | minor | I | not fixed | The p5 Swallow is cropped into the bottom-left corner, not on the hand as specified. |
| 15 | 7 | minor | E | not fixed | In p3 the Student is a tiny figure in the background, so the recipient barely registers. |
| 16 | 8 | major | J | fixed | EYE_STATES offers only open, closed, blind and dead, so there is no way to draw the Prince ... |
| 17 | 8 | minor | K | not fixed | In p1 the Swallow is drawn as an off-model blob with white-dot eyes on the Prince's arm. In ... |
| 18 | 9 | minor | F | not fixed | In p1 and p4 the Prince stands on a box over a roof, with no column. The p4 Swallow is an ... |
| 19 | 10 | major | C | partly fixed | In p1 the gold leaf is drawn as a faceted diamond on a window ledge, and the Swallow is ... |
| 20 | 10 | minor | F | not fixed | The p3 caption hides the column top again, and the silver streets and icicle 'crystal ... |
| 21 | 11 | major | F | not fixed | In p4 the statue stands at street level in front of a house door with no column, and the ... |
| 22 | 11 | minor | G | fixed | The scene caption "The city square, in frost." sits at the bottom of p1, so it is read after ... |
| 23 | 11 | minor | A | not fixed | In p2 the Swallow is cropped at the right edge and has heart eyes while dying. |
| 24 | 12 | major | K | fixed | Several crowd figures are drawn with blank white faceless heads (p2 right, and p4 background). |
| 25 | 12 | minor | F | not fixed | In p1 the statue stands on a block above a house roof rather than on its column. |
| 26 | 13 | major | I | not fixed | p4's perch-on-hand failed: the Swallow is drawn at the bottom border by the Prince's thigh, ... |
| 27 | 13 | minor | F | fixed | The p1 caption 'The foundry overseer' collides with the cap brim. The foundry is a blank ... |
| 28 | 14 | major | E | not fixed | In p1 the Student is a tiny dark blob on the path, and the Nightingale is never shown in the ... |
| 29 | 14 | minor | K | partly fixed | p3's 'determined' brows read as an angry glare, but the source moment is wonder and ... |
| 30 | 14 | minor | G | fixed | p2's caption 'The young Student' sits on the crown of his head, and the sweat-drop FX ... |
| 31 | 15 | blocker | J | partly fixed | The red Rose-tree is drawn covered in roses while the story says it will have no roses this ... |
| 32 | 15 | major | M | not fixed | The white and yellow trees are the same drawing (same face, shape and framing), told apart ... |
| 33 | 15 | major | A | partly fixed | The speaker Nightingale is tiny and cropped on the left border in p2-p4. In p3 only her head ... |
| 34 | 15 | minor | H | not fixed | The balloons are narrow, 4-5 lines of 1-2 words each ('Give / me a / red / rose.'). |
| 35 | 16 | major | P | not fixed | Continuity: page 15 ended at night and this page is day with no caption. The Student stands ... |
| 36 | 16 | minor | A | not fixed | The Nightingale's beak is cropped at p2's right border, and in p1 she is scaled like a large ... |
| 37 | 17 | blocker | J | partly fixed | The rose-tree is still covered in many roses, and the single marvellous rose never blooms on ... |
| 38 | 17 | major | C | partly fixed | The Nightingale is a dot in p1 and a sliver cropped at the right border in p2 and p3. The ... |
| 39 | 17 | minor | N | fixed | Quotation marks and a trailing comma are printed inside the balloons: '"Press closer, little ... |
| 40 | 18 | blocker | B | partly fixed | The red rose, the page's key prop, is never visible. In p1 the held rose falls off the left ... |
| 41 | 18 | minor | N | not fixed | The second balloon in p3 uses a visibly smaller font than the rest of the page. |
| 42 | 19 | major | F | not fixed | p5's narration says 'He returned to his room and read', but the picture is a garden bench ... |
| 43 | 19 | major | C | partly fixed | No rose is visible in his hand for 'FLING!'. p2 has no street, gutter or cart-wheel; it is ... |
| 44 | 19 | minor | P | not fixed | In p4 the Student speaks with his hand covering his mouth. |
| 45 | 20 | major | J | not fixed | The 'lovely garden' has bare, sparsely budded trees on empty white ground. It looks the same ... |
| 46 | 20 | major | C | not fixed | 'TWEET TWEET' floats over the children with no birds drawn, so it reads as the children ... |
| 47 | 21 | blocker | D | partly fixed | The Giant is drawn man-sized in p1, smaller than the trees, a scale that implies a different ... |
| 48 | 21 | major | P | not fixed | The high wall and gate already stand on page 20 and in this page's p1, before the narration ... |
| 49 | 21 | major | C | partly fixed | 'Trespassers Will Be Prosecuted' is set as a caption box, and the notice-board prop in p3 is ... |
| 50 | 22 | major | P | not fixed | p3 puts the Giant in the garden, towering over crying children. In the source he watches ... |
| 51 | 23 | major | C | partly fixed | After 'CRASH' the wall stands intact in p4 and p5, and no axe is drawn. |
| 52 | 23 | major | N | partly fixed | p5's balloon prints the speech tag and quote marks: '"I have many beautiful flowers," he ... |
| 53 | 23 | major | D | partly fixed | In p1 the Giant is human-sized again and the children are a tiny blob. In p5 the Giant is ... |
| 54 | 24 | major | J | not fixed | The marvellous tree (white blossoms, golden branches, silver fruit) is the same generic twig ... |
| 55 | 24 | major | F | not fixed | p1 staging contradicts the source, which has him at his window, old and feeble, beside his ... |
| 56 | 25 | major | C | not fixed | The nail prints on the child's palms and feet, the whole visual of the beat, are never ... |
| 57 | 25 | major | I | not fixed | The 'lie' pose draws a rotated standing sprite that floats above the path in p4, with ... |
| 58 | 25 | major | D | fixed | The Giant is drawn at child scale (p3 and p4 heads are the same size as the children's), ... |
| 59 | 26 | minor | E | not fixed | The Linnet in p1 is a speck of a few pixels in the right-hand willow, and is effectively ... |
| 60 | 26 | minor | G | not fixed | In p4 the 'The Green Linnet' label box sits between the balloon tail and the bird, so the ... |
| 61 | 27 | minor | K | not fixed | Hans's hair changes between shot sizes: dark and curly in the wide and full shots, light ... |
| 62 | 29 | minor | H | not fixed | In p2 the Miller's tail tip ends in the gap above both heads, so the attribution needs a ... |
| 63 | 32 | blocker | F | fixed | The l_moor location renders as blank white or grey. In p2-p4 there is no mountain, road or ... |
| 64 | 33 | major | B | fixed | The spec gives the Miller holding: lamp in p2 and p4, but the lantern is not drawn in either ... |
| 65 | 34 | major | F | not fixed | The p4 'pool' is an amorphous light-grey blob. Hans lies on a dry ground shadow rather than ... |
| 66 | 34 | minor | J | not fixed | Hans is still in his apron: the fur coat and scarlet cap from the previous beat never appear. |
| 67 | 35 | blocker | G | partly fixed | In p1 the 'Hans's funeral' caption box sits directly on top of Hans's body, the panel's key ... |
| 68 | 36 | minor | H | not fixed | The 'Pooh!' balloon sits high in empty sky, with a tail of about 650px down to a small rat. ... |
| 69 | 37 | major | I | not fixed | The spec gives p3 the pose 'kneel', but the Prince is drawn standing, at the Princess's eye ... |
| 70 | 37 | minor | K | not fixed | In p1 the Prince is a tiny dark-robed figure whose hair reads as dark; in p3 he has long ... |
| 71 | 37 | minor | E | not fixed | The King's face in p5 cannot be read at that size (the beard merges into the face). The ... |
| 72 | 38 | major | M | fixed | The Roman Candle is drawn as a wax candle with dripping wax. It does not read as a firework, ... |
| 73 | 38 | minor | D | partly fixed | The scale is inverted. The 'little Squib' fills a full-height panel and dwarfs the 'big ... |
| 74 | 38 | minor | C | not fixed | The yellow tulips the Squib admires are not drawn; only round blobs sit cropped at the ... |
| 75 | 39 | major | M | fixed | In p1 and p4 the Roman Candle is a burning wax candle on a saucer. That puts a lit firework ... |
| 76 | 39 | major | M | fixed | The Squib (page 38), the Cracker (p2) and the Bengal Light (p5) share one design, a cylinder ... |
| 77 | 39 | major | H | not fixed | In p5 the Bengal Light's balloon sits under the Rocket's open mouth, with a stub tail that ... |
| 78 | 39 | minor | F | not fixed | The p1 establishing shot draws no stand, only a grass verge, and the figures are tiny. |
| 79 | 40 | major | M | fixed | The Roman Candle is again a lit wax candle, and the Cracker and the Bengal Light are ... |
| 80 | 40 | minor | G | fixed | The p1 location caption sits bottom-right, so the scene-setting is read after the dialogue. |
| 81 | 41 | minor | P | not fixed | p1 shows only the Rocket on the garden path. The other fireworks, which are about to go off, ... |
| 82 | 41 | minor | G | not fixed | The p4 narration box overlaps the tip of the Rocket's cone, and the tears are drawn as sweat ... |
| 83 | 42 | major | F | fixed | l_ditch renders as a dry country road with a fence and perspective lines. SPLASH lands on ... |
| 84 | 43 | major | L | not fixed | In p4 the lying Rocket's cone overlaps the speaking Frog's face. The Frog's arm is drawn as ... |
| 85 | 43 | major | F | fixed | The ditch is again a dry road. 'Nothing like mud' is said with no mud in sight, the Frog ... |
| 86 | 43 | minor | I | not fixed | The Rocket lies down in p1 and p4 but stands upright in the p3 close-up. |
| 87 | 44 | major | A | partly fixed | The Dragon-fly is tiny, sits at ground level and is cut by the panel edge in p1. In p2 it ... |
| 88 | 44 | minor | G | not fixed | In p3 the speech tail ends on the 'The White Duck' caption, which sits between the Rocket ... |
| 89 | 44 | minor | F | fixed | The Rocket stands upright on a dry road verge instead of sinking into the mud, and the Duck ... |
| 90 | 45 | major | O | fixed | The crowd figure c_boys_s5 renders three children (one with a ponytail, two with blank ... |
| 91 | 45 | major | L | not fixed | In p3 the Rocket's cone overlaps the speaking boy's face, and an impact burst sits behind ... |
| 92 | 45 | minor | H | not fixed | In p2 the tail of 'Look at this old stick!' ends against the Rocket's cone instead of the ... |
| 93 | 46 | major | L | not fixed | In p3 the Rocket's cone overlaps the bird's face. |
