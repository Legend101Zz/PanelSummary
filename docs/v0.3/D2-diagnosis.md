# D2 diagnosis: issue #90, a camera push-in can crop a figure out of a panel

Date: 2026-10-14. Code read: release/v0.3 at 185526a (renderer manga-render/0.6.0), read only.
All measuring was done in a private copy (`src/` in this directory). The worktree was not changed.
No model call, no app stack, no MiniMax spend.

## 0. Short answer

1. The issue names the wrong push-in for its own worked examples. Renderer 0.6.0 has TWO camera pushes.
   - Push A, "speaker readability" (`scene/compose.ts` lines 1352-1362). It is old (0.3.0 / 0.5.0), not new in 0.6.0. It pushes in on the smallest speaker by a factor up to 3.5. It has no bound on the other figures.
   - Push B, "subject size floor" (#42, `scene/compose.ts` lines 1374-1530). It is new in 0.6.0. It has a bound (subject, speaker and name-tagged heads stay in the panel).
2. On the pages of #90 (final-journey-2 page 7 panels 2 and 3, page 1 panel 2) push B did not run. Push A ran (factor 3.03, 2.88 and 2.50). With push A switched off, all three panels have no FIGURE_CLIPPED and no FIGURE_HEAD_CLIPPED.
3. On the 290 judged pages, 11 of the 15 flagged panels are caused by a push (9 by push A, 2 by push B). 4 flagged panels have no push at all (wide and establishing shots).
4. The structural check (the two issue codes) misses cut figures: a head that is only partly outside the panel is not flagged, and a pushed figure that the code marks "cropped on purpose" is not flagged by one of the three branches. 11 of 21 figures lost or cut by a push have no flag.
5. A prototype bound on push A cuts the flags from 16 to 6, but it makes 19 SPEAKER_TOO_SMALL errors (the speaker stays small). A design decision is needed (section 6).

## 1. How the push-in chooses its frame (code)

File: `packages/manga-render/src/scene/compose.ts` (line numbers are for 185526a).

### 1.1 Order of steps in `composePanel`

1. Place every figure in its slot, scale by shot (ground shots) or by close-range rules.
2. Line 1298: close-range block. It runs for shots that are not ground shots (not establishing, wide, full) and not insert. So it runs for medium, close and extreme_close.
   - Line 1351: `fitHeads(visibleFigs, [], true)`. Every head goes in the panel. If the heads do not fit, the group is made smaller about its centre (zoomOut = true).
   - Lines 1352-1362: PUSH A. Described in 1.2.
   - Lines 1363-1367: any figure whose head circle is fully outside the panel is added to `headCropped`.
3. Lines 1374-1530: PUSH B (#42). Described in 1.3.
4. Lines 1825-1840: the checks that make FIGURE_CLIPPED and FIGURE_HEAD_CLIPPED (warnings).

### 1.2 Push A, speaker readability (lines 1352-1362)

```
const talking = visibleFigs.filter((f) => speakers.has(f.cast.id));
const smallest = talking.reduce(... smaller head radius ...);
if (r < SPEAKER_MIN_HEAD_RADIUS + 0.5) {                      // SPEAKER_MIN_HEAD_RADIUS = 22 (line 196)
  const k = Math.min(3.5, (SPEAKER_MIN_HEAD_RADIUS + 0.5) / Math.max(0.5, r));   // line 1358
  const c = headOf(smallest).head;
  for (const [key, fr] of framings) framings.set(key, zoomAbout(fr, c, k));      // line 1360
  fitHeads(talking, visibleFigs.filter((f) => !talking.includes(f)), false);     // line 1361
}
```

- The frame: the whole scene is scaled by k about the head of the smallest speaker. The factor k comes from the head radius only. Nothing checks that the other figures stay in the panel.
- After the scale, `fitHeads(talking, others, false)` only moves (translates) the group. The speaker heads are `must`. All other figures are `nice` (moved in only if no speaker head is lost).
- `zoomOut` is false, so the group is never made smaller to fit. When the speaker heads cannot fit, the translation window is empty (`dxHi < dxLo`) and `clamp` (line 326-328) returns the middle of the window: `hi < lo ? (lo + hi) / 2`. The result is a centred group with heads out on both sides.
- Protects: the head of the smallest speaker only, and other speakers only if they fit in the same window.
- Does not protect: any figure that does not speak (the protagonist in a beat that does not name it, a planned figure, a figure a caption names), and a second speaker far from the first.

### 1.3 Push B, subject size floor (#42, lines 1374-1530)

- Subjects: the hero (named in the beat; if no figure is named, the only figure) and every speaker. `heroIndexes` (line 279-283).
- Trigger: the smallest subject fills less than `SUBJECT_MIN_SIZE` 0.30 of the panel (establishing 0.15). Shots insert and extreme_close do not push.
- Frame: scale about a point F in the smallest subject body (line 1396-1397), `want = min(0.30 / size, 3)` (establishing 2.4). A search goes down from `want` in steps of 0.04 to 1.03 (`bestPush`, line 1451-1457).
- Bound in `tryPush` (lines 1401-1450):
  - `keep` heads must fit in the panel with a 2.5 percent margin (lines 1406-1421).
  - A small creature that is a subject is kept whole (lines 1423-1436).
  - The ground line stays in the panel (line 1438).
  - Every other figure in `live` must keep at least half of its body inside, or what it had before (line 1446).
- Two searches: `all` (every live head in `keep`) and `mine` (only `must`: hero, speakers, figures named by `text.about`; line 1384). `all` is used if its k is at least min(want, 1.35), else `mine` (line 1461).
- After the push, a figure whose head circle is fully outside is added to `headCropped` "on purpose" (lines 1522-1526). The third branch of the check (line 1836) is switched off for such a pushed non-subject figure.
- Protects: hero, speakers, labelled figures (heads, always), others (half of the body).
- Does not protect:
  - A figure that is not hero, speaker or labelled keeps only half of its body. Its head may be outside (a FIGURE_HEAD_CLIPPED warning only, or no flag if the head is partly inside).
  - `live` (line 1382) leaves out every figure already in `headCropped`. A figure that push A (or an earlier step) cropped is not protected, and is not looked at by push B.
  - The balloon tail target is the speaker. Speakers are protected by push B, but a tail that goes to a head cropped by push A points to empty ground (the "tail to empty ground" in page 1).

## 2. Method

Script: `measure.mts` (render each judged page spec with `renderPageDetailed`, the public API; same call as `scripts/structural-metrics.ts` and `scripts/calibrate-q1.ts`). Output: `measure.json`. Analysis scripts: `analyze2.py`, `analyze3.py`, `analyze5.py`.

- Each page is rendered 4 times in a private copy with two switches added to a copy of `compose.ts` (`NO_PUSH`=push B off, `NO_SPK`=push A off): full, no push B, no push A, none. The worktree was not changed.
- Check of the method: for all 290 judged pages with a spec, the FIGURE_CLIPPED and FIGURE_HEAD_CLIPPED warnings stored in each `judge/page-NN.json` are identical to the warnings of my full render (290 of 290 pages). So every run was made with renderer 0.6.0 and my render is the render the judges saw.
- "Judged page": a page that has a judge entry in `judgments.json` and a spec. run3 page 42 failed and has no spec: 290 pages, 1396 panels (the judgments list has 291 pages).
- "Panel with push": push B ran (factor k stored) or push A ran. Both counts are given.
- The structural check is the renderer's own FIGURE_CLIPPED / FIGURE_HEAD_CLIPPED issues (lines 1825-1840), not `structural-metrics.ts` (that script has no figure-clipped count; it has `figures_head_outside_panel`).

## 3. Counts on the judged pages (structural metric)

Per run. "Flag panels" = panels with FIGURE_CLIPPED or FIGURE_HEAD_CLIPPED in the full render.

| Run | Pages | Panels | Panels push B | Panels push A | Pages with a push | Flag panels | CLIPPED pages (panels) | HEAD_CLIPPED pages (panels) | Flag caused by push A | Flag caused by push B | Flag with no push |
|---|---|---|---|---|---|---|---|---|---|---|---|
| run2 (Gate 1) | 22 | 120 | 18 | 8 | 16 | 1 | 1 (1) | 0 (0) | 0 | 1 | 0 |
| run3 (Gate 2, 68-page book) | 60 | 277 | 17 | 9 | 16 | 2 | 2 (2) | 0 (0) | 1 | 1 | 0 |
| run4 | 38 | 183 | 1 | 4 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| run5 | 36 | 171 | 4 | 7 | 7 | 0 | 0 | 0 | 0 | 0 | 0 |
| run6 | 34 | 169 | 10 | 7 | 12 | 5 | 2 (2) | 2 (3) | 3 | 0 | 2 |
| run8 | 36 | 162 | 3 | 5 | 7 | 0 | 0 | 0 | 0 | 0 | 0 |
| final-journey | 35 | 177 | 13 | 14 | 15 | 0 | 0 | 0 | 0 | 0 | 0 |
| final-journey-2 | 29 | 137 | 9 | 12 | 15 | 7 | 3 (4) | 4 (4) | 5 | 0 | 2 |
| Total | 290 | 1396 | 75 (62 pages) | 66 (47 pages) | 91 | 15 (12 pages) | 8 pages (9 panels) | 6 pages (7 panels) | 9 | 2 | 4 |

Notes:
- Panels counted as "caused" are flagged in the full render and not flagged with both pushes off. 11 of 15 flag panels are caused by a push. The 4 others are wide or establishing shots (run6 p19 p2 and p24 p1, final-journey-2 p15 p3 and p4); no push is involved.
- One panel got fewer flags from the pushes: run3 page 20 panel 1 (establishing; 1 flag without push, 0 with push B).
- Renderer 0.5.0 (parent of the 0.6.0 commit, 4adfd39) on the same pages (3 pages crash on a missing backdrop and are left out): 19 flags; 0.6.0: 16. Flags only in 0.5.0: 5. Flags only in 0.6.0: 2 (run2 page 17 panel 4, run3 page 26 panel 4: both push B, the speaker is the Rose-tree, half of its body is outside, head inside). The 11 flags of push A were there in 0.5.0 too. So the rise "2 to 6" in Q1's calibration is not the same thing as the cause of the bad pages.
- Figure level, in panels where any push ran (287 planned figures drawn, 111 hero, 98 speaker, 72 other, 6 labelled), compared with the same panel with both pushes off. "Lost" = body inside the panel under 2 percent. "Head out" = head circle under 2 percent inside. "Head cut" = head circle under 90 percent inside (it was 90 percent or more before).

| Result of the push | Count | Hero | Speaker | Other planned figure | Flagged by the renderer | Not flagged |
|---|---|---|---|---|---|---|
| Figure lost (body outside) | 4 | 1 | 1 | 2 | 4 | 0 |
| Head out (body partly in) | 7 | 1 | 1 | 5 | 6 | 1 |
| Head partly cut | 10 | 2 | 0 | 8 | 0 | 10 |
| Total | 21 | 4 | 2 | 15 | 10 | 11 |

By push: 19 figures by push A, 2 by push B (run2 page 7 panel 1, the Prince, head out; final-journey page 29 panel 2, the Woman, head partly cut). "Hero" and "other" use the beat-name test of `calibrate-q1.ts` (the renderer uses `beatNames`; the two tests can differ for a few figures). 5 planned figures are not drawn at all (before or after a push; not a push effect).

## 4. The judges, and the cross-tab

Judge defects: 1523 blocker or major defects in 290 judged pages (3 judges each; run3 has 61 pages in its judgments list).

Figure-visibility defect (regex in `analyze5.py`): the text has FIGURE_CLIPPED or FIGURE_HEAD_CLIPPED, or "cut off", "head cut/cropped/clipped", "cropped/clipped at the edge of the panel", "out of frame", "outside the frame", "off-panel", "missing from the panel", "empty ground", "tail ... nothing/empty/no one", "no visible speaker", "not visible at all". The regex is too wide: from a read of the 77 renderer-owned hits, about 10 to 15 are not about a cut figure (balloon tails that cross, prop not visible, tiny figure). The numbers are an upper bound. A stricter test with cast names found fewer pages but the same shape.

| Run | Pages | Blocker+major defects | Figure-visibility defects (renderer owner) | (any owner) | Pages with 1 or more judges | Pages with 2 or more judges |
|---|---|---|---|---|---|---|
| run2 | 22 | 109 | 8 | 10 | 5 | 4 |
| run3 | 60 | 283 | 13 | 19 | 12 | 4 |
| run4 | 38 | 169 | 12 | 14 | 12 | 2 |
| run5 | 36 | 162 | 0 | 1 | 1 | 0 |
| run6 | 34 | 212 | 12 | 16 | 10 | 4 |
| run8 | 36 | 155 | 4 | 4 | 4 | 0 |
| final-journey | 35 | 253 | 12 | 16 | 13 | 2 |
| final-journey-2 | 29 | 180 | 16 | 17 | 8 | 6 |
| Total | 290 | 1523 | 77 | 97 | 65 | 22 |

Cross-tab, page level (structural flag on the page x figure-visibility complaint on the page):

| | Complaint (1 or more judges, any owner) | No complaint | Total |
|---|---|---|---|
| Structural flag | 11 | 1 | 12 |
| No structural flag | 54 | 224 | 278 |
| Total | 65 | 225 | 290 |

- The structural check catches 11 of 65 complaint pages (17 percent). With the renderer-owned complaints only: 11 of 56 (20 percent). With 2 or more judges: 9 of 22 (41 percent).
- 1 of 12 flagged pages has no complaint: run6 page 24 (establishing shot, no push).
- All 11 complaints that the check catches name the code (judges see the warning text). Judge text without the code name: only 4 of 58 pages carry a flag. So the code catches almost none of the figure complaints that the judges write in their own words.
- Panel level, complaints that name a panel number: 126 panels are named; 14 of the 15 flagged panels are named; 112 named panels are not flagged. Of the 126 named panels, 37 had a push (push A or B) and 26 of those 37 have no flag.
- Complaint pages with any push: 30 of 65. With a push and a flag: 9. With a push and no flag: 21. With no push and no flag: 33. With no push and a flag: 2.
- Unflagged complaints that fit the head-cut gap (section 5.3): final-journey-2 page 4 (the Child is "offscreen"; head 5 percent inside) and page 6 (the nose is "cut off at top"; head 6 percent inside), final-journey page 7 and 8 (the python "cropped at the panel edge").
- Most unflagged complaints are not caused by a push (a tiny figure, a wrong species, a wrong prop). They are outside this issue.

## 5. Worked examples (final-journey-2, renderer 0.6.0, judged 2026-10-10)

Values: share of the body box inside the panel / share of the head circle inside the panel.

### 5.1 Page 7, panels 2 and 3 (medium shots, "the protagonist is not visible at all")

Spec: `c_elephant_child` pose hold, slot left, depth mid; `c_python` pose talk, slot right, depth mid. Only the python speaks. The beat names neither figure ("A fly stings his shoulder...", "He plucks...").

| Panel | Push A factor | Child, push A on | Child, push A off | Python, push A on | Python, push A off | Flags, push A on | Flags, push A off |
|---|---|---|---|---|---|---|---|
| p2 | 3.03 | 0.003 / 0 | 0.324 / 1 | 0.113 / 0.975 | 0.361 / 1 | FIGURE_CLIPPED | none |
| p3 | 2.88 | 0 / 0 | 0.284 / 1 | 0.113 / 0.975 | 0.346 / 1 | FIGURE_CLIPPED | none |

Push B did not run (its factor is empty; the result is the same with push B off). Cause: the python head radius is under 22.5, so push A scales by 3.03 about its head (line 1358, 1360). The child is not a speaker and not a hero, so it is only a `nice` figure for `fitHeads` (line 1361): it is dropped to keep the python head. The python body is 11 percent inside too. The flag fired, as a warning, and the page was accepted. Judges: 3 of 3 wrote a blocker or major defect that names FIGURE_CLIPPED in p2 and p3 (the code, not a new finding).

### 5.2 Page 1, panel 2 (medium shot, the Ostrich is not visible, the Child's head is cut, the tail points to empty ground)

Spec: `c_elephant_child` pose talk, slot left, mid; `c_ostrich` pose reach, slot right, depth fore. Both speak.

| Figure | Push A on (factor 2.50) | Push A off |
|---|---|---|
| Child | 0.081 / 0 (head out) | 0.35 / 1 |
| Ostrich | 0 / 0 (body out) | 0.667 / 1 |

Flags with push A on: FIGURE_HEAD_CLIPPED (Child), FIGURE_CLIPPED (Ostrich). With push A off: none. The two tails are both `offPanel` and the two speaker heads are `headCropped`. Cause: two speakers, one scale about the smaller head. After the scale the two heads need more width than the panel. `fitHeads(..., false)` cannot zoom out and `clamp` returns the middle of an empty window, so both heads spill out. Here even the speakers are lost, so the "speakers are protected" statement of Q1 does not hold for push A. Judges: 3 of 3 blockers or majors that name the two codes.

### 5.3 Other examples

- run3 page 23 panel 4: the hero (the Student) is lost by push A (factor 2.39) when the Nightingale speaks. Flag FIGURE_CLIPPED; judge: "the Student she addresses is clipped out".
- run6 page 9 panels 3 and 5, page 7 panel 1: the Elephant's Child head is out (push A factors 2.83, 1.98, 1.96); flags FIGURE_HEAD_CLIPPED.
- final-journey-2 pages 4, 5 and 6 panel 2: the Child head is only partly inside (head 5, 68 and 6 percent inside). No flag. Judges: "the Child is offscreen" (page 4), "the nose is cut off at top" (page 6).
- run2 page 17 panel 4 and run3 page 26 panel 4 (push B): the Rose-tree speaker is 50 and 69 percent inside, head in. The third branch (line 1836) flags it because the tree is a speaker. These two are the only new flags that push B adds on these pages.
- run2 page 7 panel 1 (push B, establishing): the Prince, a planned figure that is not a subject, loses its head (head 0 percent inside, body 59 percent). No flag, because the head is "cropped on purpose" (line 1522-1526). The judges wrote "crops the Prince's head off at the top edge" (two of three judges).

## 6. Root cause, the cases the current bound misses

The bound on push B exists and works for the 2 cases above that are worth a check. The loss comes from the other push and from the checks.

| # | Gap | Code | Effect on the judged pages |
|---|---|---|---|
| G1 | Push A has no bound. The factor comes from one head radius; the translation cannot make room; `clamp` of an empty window gives the middle (`(lo + hi) / 2`); `zoomOut` is false. | `compose.ts:1358` (factor), `:1360` (scale), `:1361` (`fitHeads(..., false)`), `:1337-1343` and `:326-328` (window and clamp) | 19 of the 21 lost or cut figures, 9 of the 11 push-caused flag panels, including both worked examples |
| G2 | Non-speaker figures are `nice`, not `must`, in push A. A planned figure that is not a speaker, not the beat-named hero and not labelled has no protection in either push. | `:1361` (`nice` list), `:1384` (`must` of push B) | page 7 (the protagonist is not named in the beat and does not speak) |
| G3 | The figure that push A or an earlier step already cropped (`headCropped`) is left out of `live`, so push B never looks at it and later steps treat it as "cropped on purpose". | `:1363-1367`, `:1382`, `:1522-1526`, `:1796`, `:1815`, `:1843` | Silent loss. A lost speaker also disables `SPEAKER_TOO_SMALL` (line 1815) |
| G4 | `FIGURE_HEAD_CLIPPED` fires only when the head circle is fully outside the panel. A head 5 percent inside is not flagged. | `:1830-1831` (`headOut`) | 10 of 21 cut figures are partly cut and unflagged; final-journey-2 pages 4 and 6 |
| G5 | Push B alone can drop the head of a non-subject planned figure: `mine` only keeps half of the body (`:1446`), and a pushed non-subject is exempt from the 70 percent branch (`:1836`). | `:1384`, `:1446`, `:1461`, `:1836` | 2 figures (run2 page 7 p1, final-journey page 29 p2); small compared with push A |
| G6 | The tail target is the speaker, but the speaker head may be cropped by push A, so the tail goes off the panel. | `headCropped` use at `:1744`; tails use `offPanel` | page 1 "tail to empty ground" |

The sentence in the issue "the push is already bounded for the subject and speakers - find the case it misses" is true for push B (lines 1401-1450). The case it misses is that push A (lines 1352-1362) is a second push with no bound, and it runs first.

Other facts for the fix design:
- The existing test "no speaker's head is deliberately cropped out" (`test/q1-reframe.test.ts`) uses the 46 run-8 pages only (36 judged). It passes, because run8 has no push A case. It does not cover the 290 pages here.
- The check at line 1836 hides one branch for pushed non-subjects, but the two other branches still fire; so the warning count is a lower bound for loss, not a measure of it.

## 7. Proposed fix

Aim: a push (A or B) keeps every planned figure and every speaker with its head in the panel; when this cannot be done at a useful factor, the camera does not push (or pushes less).

### 7.1 Code

1. Make push A search like push B. Replace line 1358-1361 with a search down from `k0 = min(3.5, 22.5 / r)` in steps of 0.05 to 1.03. For each k, scale all heads of `visibleFigs` (not only speakers) about the head `c`; accept the first k at which every head box (x: 0.95 radius, y: 1.05 up and 1.1 down, the margins of line 1409-1412) fits in the panel width and height (about 0.96 of each), then translate. If no k works, do not push (leave the group as `fitHeads(visibleFigs, [], true)` placed it). Reuse the `tryPush` code of push B (one helper for both pushes).
2. Make `fitHeads(talking, others, false)` fail loudly: if the window is empty (`dxHi < dxLo` or `dyHi < dyLo`) return false and the caller restores the framings (do not use the middle of the window for a must head). This is the line 326-328 `clamp` case.
3. Add every planned figure that is drawn in a medium or close panel (not only hero, speaker, labelled) to `must` in push B (line 1384), or at least its head. Keep the half-body rule for props and extras (a crowd or a back-row figure may still be cropped on purpose: then mark them `extra` in the spec/compose, and keep `headCropped` only for these).
4. Do not add a figure to `headCropped` (lines 1363-1367 and 1522-1526) if it is a planned figure of the spec. Only crowd, extras and a statue top (line 999) may be cropped on purpose.
5. Flag partial head cuts: change `headOut` (line 1830) to "less than 60 percent of the head circle is inside the panel" for a planned figure (shot not extreme_close). This is a new warning count; calibrate before any error (the issue says "calibrate before any new error"). On these pages it would add 10 flags.
6. Keep `SPEAKER_TOO_SMALL` as it is (an error for a speaker head radius under 22). See 7.3.

### 7.2 Tests (renderer package, `test/q1-reframe.test.ts` or a new `test/push-bounds.test.ts`)

All with the real specs (copy the 6 panels below as fixtures in `test/fixtures/`; the cheese PDF is not needed).

1. Page 7 p2 and p3 of final-journey-2: both figures have `body inside` of at least 0.2 and the head fully in the panel; no FIGURE_CLIPPED.
2. Page 1 p2 of final-journey-2: both speaker heads in the panel; both tails not `offPanel`; no FIGURE_HEAD_CLIPPED, no FIGURE_CLIPPED.
3. run3 page 23 p4 (hero lost by push A) and run6 pages 7 p1, 9 p3, 9 p5 (Child head out): head in the panel for every planned figure.
4. A property test over the 290 judged page specs (copy a fixture of 40 pages: all that have a push and the 12 flagged pages): for every planned figure that is not a crowd extra, `headInside >= 0.9` after render when it was `>= 0.9` with both pushes off (this is the "push never removes a head" law). It fails on 0.6.0 for 21 figures; it must pass after the fix.
5. A unit test for the empty window: two speakers placed far apart; the push factor must be at most the factor at which both heads fit, or 1.
6. A test for the head-cut check: a figure with 30 percent of the head circle inside gets FIGURE_HEAD_CLIPPED (new threshold), and a figure with 100 percent inside does not. Plus the calibration run: the count of new warnings on the 290 pages must be written in `docs/v0.3` before it is accepted.
7. Regression: the existing floor tests (`SMALL` list in `q1-reframe.test.ts`: page 7 p3, 44 p1, 17 p2, 8 p1) must still reach their floors (factors 1.0 / 1.4 / 1.35 / 1.35). If one fails, the bound is too tight.
8. Determinism: render twice, the same SVG (the existing test).

### 7.3 Measured trade-off of the fix (prototype in the private copy, not in the worktree)

I made a prototype of step 1 only (search for the largest k at which all visible heads fit; no push if none), `PROTO=1`, and ran the 290 judged pages:

| Version | FIGURE_CLIPPED | FIGURE_HEAD_CLIPPED | SPEAKER_TOO_SMALL (error) |
|---|---|---|---|
| 0.6.0 as it is | 9 | 7 | 0 |
| Prototype, all heads must fit | 5 | 1 | 19 |
| Prototype, only speakers and beat-named heroes must fit (`PROTO=2`) | 7 | 5 | 5 |

- The prototype cuts the 16 flags of 0.6.0 to 6 (5 FIGURE_CLIPPED, 1 FIGURE_HEAD_CLIPPED). The 4 no-push panels stay (wide and establishing shots, not a push effect); 2 more remain that I did not look into. All three worked examples are clean.
- It makes 19 `SPEAKER_TOO_SMALL` errors (19 panels) on 290 pages: the speaker stays small because the camera cannot come in without losing another figure. An error means the page is rejected and repaired. This is a design decision for the owner, not a bug of the prototype. Options: (a) accept the errors and rely on the repair step (a wider or closer shot, or fewer figures); (b) change the severity to a warning for this case; (c) re-slot the figures nearer to each other before the push (the layout step), then push; (d) split the panel into a close shot per speaker. I did not test (c) or (d).
- The `PROTO=2` row shows why "speakers and heroes only" is not enough: the Child of page 3 p2 and 8 p2 and run6 page 9 are neither.

## 8. What I did not do, and limits

- I did not look at the rendered images. All numbers come from the geometry of `renderPageDetailed` (body and head boxes) and from the judge text. I did not re-render PNG or SVG to see the frames with and without a push. The numbers show the effect; a visual check of 6 panels (section 7.2 list) is advised before the fix is designed.
- The judge regex is wide (section 4). The cross-tab percentages move by a few points with a stricter regex; the shape (the check catches about 1 in 5 complaint pages; most flags come from push A) does not.
- The "hero" and "other" roles in section 3 use a regex test on the beat, not the renderer's `beatNames`.
- The 0.5.0 comparison leaves out 3 pages that crash on 0.5.0 (a backdrop that 0.5.0 does not have).
- The runs run2 to run8 were judged with renderer 0.6.0 (stored warnings equal my render for all 290 pages), not an older one.
- Not done: the proposed code. The worktree is unchanged. Helper files and logs are in this directory: `measure.mts`, `measure.json`, `analyze*.py`, `analyze5.out`, `judge-hits3.json`, `figure-cases.json`, `measure050.mts`, `measureproto.mts`. The private copy with the two switches and the prototype is `src/packages/manga-render/src/scene/compose.ts` (differs from 185526a in 3 places: `NO_PUSH`, `NO_SPK`, `PROTO`).
