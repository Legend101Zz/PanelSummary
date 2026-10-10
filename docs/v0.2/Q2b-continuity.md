# Q2b: continuity of places and minor figures, afterlife and dream scenes

Track Q2b of the v0.2 build. Issue #44. Branch `v02/q2b`. Base `915b5f5` (`release/v0.2`).
No live run was made and no model was called. Every number below was measured in this track on the saved runs under `/Volumes/Mrigesh SSD/Book-Reel-scratch/`, or comes from the tests. The predicted effect (section 7) is an estimate, not a measurement.

## 1. The problem

Continuity is the weakest judged criterion: 2.76 in the final journey, 2.94 in Gate 2 (`gate2-flash-ci`). Issue #44 names four causes:

| Cause in issue #44 | What the saved runs show |
|---|---|
| A setting drawn wrong (a throne hall for a palace door, a bench for "against the wall") | 97 of 309 judged pages (31 percent) have a major or blocker setting defect. The judges put the owner of these defects at the renderer 88, the writer 63, the plan 13, the understanding 10 (judge defects, not pages). |
| The understanding does not record every place the plan needs | The final-journey understanding names the courtyard only inside the balcony place, and has no courtyard place. Page 11 plans the balcony and the swineherd's room, and the writer put the Emperor in the swineherd's room (judges 1, 2 and 3). |
| Afterlife or dream panels trip `FIGURE_STATE_MISMATCH` unless the writer uses `flashback` | Run 8 page 13 panel p4 (Prince and Swallow in Paradise). T1 knew this false positive. |
| The page goal cannot cast a minor figure | Run 8 pages 22, 24, 25 (the child) and 42 (the workmen) are judged blockers. |

## 2. What changed

| Item | Where | Level |
|---|---|---|
| `units` on a location: the units in which the story is at that place | `src/goals/places.ts`, `book-understanding.ts`, skill `book-understanding` 1.8.0 | `PLACE_UNITS_INVALID` error. `PLACE_UNITS_MISSING`, `PLACE_UNIT_UNCOVERED` warnings |
| Location check against the plan | `places.ts` `planPlaceIssues`, `adaptation-plan.ts`, skill `adaptation-plan` 1.5.0 | `PLAN_LOCATION_NOT_IN_UNITS`, `PLAN_PLACE_UNLISTED` warnings |
| Plan prompt shows `environment` and `units` of each location | `adaptation-plan.ts` | data only |
| Panel flag `vision` (`afterlife`, `dream`, `memory`) | `packages/manga-render/src/contracts.ts` (`VISIONS`, `PanelSpec.vision`), `validate/page.ts` (key and enum check), `continuity.ts` (skip), skill `manga-page` 1.9.0 | an unknown value is an error. The renderer does not read it |
| Minor figures from the page text | `src/goals/minor-figures.ts`, `manga-page.ts` (4 lines), skill `manga-page` 1.9.0 | no new check. The figure is part of the page cast |
| Mapping rules for doors, gates and walls | skill `book-understanding` 1.8.0 | text only |

Files outside the owned paths of this track: `packages/manga-render/src/contracts.ts` and `packages/manga-render/src/validate/page.ts` (the `vision` field only: 11 and 3 lines). `docs/launch/T1-continuity.md` has a short v0.2 section.

### 2.1 Old saved understandings

`units` is optional and additive. The schema name stays `book-understanding.v1`.

- `validateUnderstanding` does not read `units` on locations, so it returns the same issues with and without the field (tested).
- An understanding without `units` gets no new issue: `planPlaceIssues` is silent when no location lists units, and `placeIssues(…, expectUnits = false)` is silent.
- The receipt records the skill version and hash (`loadSkill`). The three skills have new versions, so a receipt shows whether the model was told to write `units`.
- A saved edition that is resumed reuses its accepted understanding. Its locations have no `units`, so the location check does not run for it. This is the intended behavior: no old run gets a new warning.

### 2.2 The `vision` flag

A dead character who shows alive in paradise, or a grandmother in a dream, is correct for the story and wrong for the state check. Before, the writer had to put fx `flashback` on the panel. `flashback` means an earlier time, so the writer had to lie about what the panel shows.

Now the panel says what it is. `figureStateIssues` skips a panel with `fx` `flashback` or any `vision`. The present-day panels of the same page stay strict (tested: a dead Swallow drawn alive in a present panel is still an error, and the same figure in an `afterlife` panel is not). The plan skill asks the planner to write "afterlife", "dream" or "memory" in the beat. The page skill tells the writer to set the flag on those panels only, and never to use it to avoid an error in the present.

### 2.3 Minor figures

`minorFigures(units, sectionId, cast)` runs in `parseInput` of the page goal. It uses the speaker rules of T1 (`attribution.ts`), on the page's own source text:

1. T1's lone speakers: a person a crowd hides ("answered the child") and "one of the workmen".
2. Any singular attribution that no cast member of the section answers to ("cried the watchman").

A speaker becomes a minor figure only if its head word is a person word (a closed list in `minor-figures.ts` plus words that end in `-man` or `-woman`). Animals, objects, spirits and groups never become one. A page gets at most 3. The figure has the id `m_<word>`, `"minor": true`, a plain human look (a child gets a child look), and no state. It is added to the cast the page validators and the renderer see, so `UNKNOWN_CAST`, `SPEAKER_UNKNOWN` and `CAST_NOT_PLANNED` do not fire for it. The prompt lists it as a minor figure. It is not written into the understanding, and T1's cast errors in the understanding stay as they are (the understanding can still give a key one-line character a real look).

The reader shows a speaker that the understanding does not name as "Someone" (`voiceLabel` in `frontend/lib/words.ts`). The backend builds the speaker names from the understanding cast only (`backend/app/api/editions.py`), so a minor speaker has no name in the source drawer. That is a backend change and is not in this track.

## 3. Evidence and method

Script: `apps/agent-worker/scripts/calibrate-q2b.ts` (`npx tsx scripts/calibrate-q2b.ts --json out.json`). It makes no model call. It reads 11 saved runs that have an understanding, a plan, unit texts, accepted page specs and a judge panel: the 10 launch runs with a `judgments.json` (final-journey, gate2-flash-ci, gate2b-ci, gate2-m3u-local, gate1-flash-ci, p0-baseline, uab-flash-ci, uab-m3-local, ab-flash-old, ab-m3plan-flashpages) and acceptance run 8. Output of this run: `/Volumes/Mrigesh SSD/Book-Reel-scratch/v02/q2b/calibration.md` and `calibration.json` (table D of that file has the in-reach counts of section 7).

Page labels, as in T1 and the judge harness:

- Judged good: the mean over judges and criteria is at least 3.5 and no criterion mean is below 3. 126 of the 309 judged pages.
- Setting defect: a judge lists a major or blocker defect whose text matches the setting words in the script (setting, backdrop, location, "drawn as a throne hall", and so on). The words are broad, so the label is loose.
- Low continuity: the mean continuity of the judges is 2.5 or less.

## 4. The location check (A)

Saved understandings have no `units`. To run the check anyway, the script derives them (`deriveUnits`): a location is used in each unit whose text contains a distinctive word of the location's name. This is a **proxy**. A live understanding states the units, and the model reads the whole book to do it. The proxy is cruder.

| Measure | Value |
|---|---|
| Judged pages | 309 |
| Pages with a setting defect | 97 (31 percent) |
| Pages with low continuity | 62 (20 percent) |
| Pages flagged by the plan check (proxy) | 64 (21 percent) |
| Flagged pages that have a setting defect | 23 (36 percent) |
| Setting-defect rate on the pages not flagged | 30 percent |
| Flagged pages with low continuity | 8 (13 percent) |
| Flagged pages judged good | 18 |

Reading: the proxy flags pages with a setting defect only slightly more often than chance (36 against 30 percent), flags fewer low-continuity pages than the base rate (13 against 20 percent), and flags 18 judged-good pages. The rule of `CLAUDE.md` says a check becomes an error only if it flags defective pages and no judged-good page. This one fails both tests on the proxy. **The check stays a warning.** The proxy result does not show that a check on real `units` is bad. It shows that the saved data cannot calibrate it. The orchestrator can measure it on the first live run: count `PLAN_LOCATION_NOT_IN_UNITS` and `PLAN_PLACE_UNLISTED` in the plan receipts and compare them with the judges' setting complaints.

What the judges' owner labels say about the reach of this track: of the 174 setting defects, 88 are labelled renderer (the hall drawn as a throne room for a door, a gate, a balcony). Q1 owns that. The plan (13), the understanding (10) and part of the writer (63) are in reach of places per unit and of the mapping rules. The courtyard case (final journey page 11) is a missing place: the understanding rule "every unit where the story is somewhere needs a place" and `PLACE_UNIT_UNCOVERED` target it.

## 5. Afterlife and dream panels (B)

The saved pages have no `vision` flag. The "after" column sets it on the panels in which a word detector finds paradise, heaven, dream, vision, angel, God or grandmother (48 panels on 29 pages in 11 runs). States are death states derived from the claims (the rule of `STATE_DEATH_MISSING`), plus the T1 hand table for run 8. This is a **simulation** of a writer that follows the new skill text.

| Measure | Before | After (flag set) |
|---|---|---|
| `FIGURE_STATE_MISMATCH` inside the detected panels | 4 on 2 pages | 0 on 0 pages |
| `FIGURE_STATE_MISMATCH` on all pages of all 11 runs | 50 | 46 |

The two pages:

| Run | Page | Panel | Hits before | Hits after | Continuity (judges) |
|---|---|---|---|---|---|
| run 8 | 13 | p4 (Prince and Swallow in Paradise) | 3 | 0 | 3.00 |
| uab-m3-local | 15 | p3 to p5 | 1 | 0 | 1.67 |

The Little Match Girl (final-journey pages 17 and 18) has 0 hits before and after, because the grandmother has no state: she is dead before the tale starts, and the girl's death falls on the same page. The unit test builds the case where it would trip (a girl whose state says "dead" shown alive in her grandmother's arms on a later page): it fails without the flag and passes with `afterlife`, `dream` or `memory`. The Happy Prince test shows a dead Swallow alive in an `afterlife` panel next to a present-day panel that shows it dead: no hit. The same figure alive in a present-day panel is an error.

The remaining 46 mismatches on all pages are outside the detected panels. They are real findings of the T1 check (not part of this track).

## 6. Minor figures (C)

Over the 11 runs the page goal would add a minor figure on 19 of 349 planned pages (21 figures). The table in `calibration.md` lists them. Examples: `m_child` on run 8 page 25 (judged blocker "the little boy is not in the cast"), `m_workman` on run 8 pages 42 and 43 (judged blocker on page 42), `m_watchman` on run 8 pages 8 and 9 and gate2-flash-ci pages 10 and 11, `m_mother` and `m_man` on the first Andersen pages.

Of the 19 pages, 5 have a judge complaint that matches a missing person (the text words are in the script). The matching is loose (113 of 349 pages match it), so this is not a precision figure. The measure that matters is the child and the workmen of run 8: both are found. Two figures that need a look in a live run: `m_king` on gate2b-ci page 10 and `m_mother` ("a sensible mother"), which might be a named cast member in another form.

## 7. Predicted effect on continuity

This is an estimate from the saved judge data. It is not a measurement. The orchestrator verifies with a live run and the judge panel.

Pages where a major or blocker defect is a setting problem owned by the plan, the understanding or the writer, or a missing person, are in reach of Q2b:

| Run | Pages | Continuity mean | Pages in reach | Their continuity mean |
|---|---|---|---|---|
| final-journey | 18 | 2.76 | 10 | 2.67 |
| gate2-flash-ci (Gate 2) | 46 | 2.94 | 21 | 2.75 |

Model: Q2b fixes the in-reach problem on a share f of those pages, and a fixed page gains g points of continuity. Choose f = 0.3 (the other defects are renderer or scale problems, and places per unit helps the plan and the writer only if the model writes good `units`) and g = 0.5 (a judge moves one step on some pages). Then the gain is in-reach share × f × g:

- final journey: 10/18 × 0.3 × 0.5 = +0.08, so about 2.84 (range 2.76 to 2.93 for f from 0 to 0.6)
- Gate 2: 21/46 × 0.3 × 0.5 = +0.07, so about 3.01 (range 2.94 to 3.08)

Both are small against the judge noise between two runs of the same code, which this track did not measure. **The prediction is that continuity moves by +0.05 to +0.10, which may or may not clear 2.94 and 2.76 in one live run.** The afterlife flag fixes 2 of 349 pages in the saved data. The minor figure touches 19 pages. The larger lever is the renderer (88 of 174 setting defects). A clear gain needs Q1.

## 8. Decisions

`docs/decisions.md` has D21 (places per unit, the location check stays a warning), D22 (the `vision` flag) and D23 (minor figures from the page text).

## 9. Verification

Commands run in the worktree (exact output in the PR body):

```text
cd packages/manga-render   && npx tsc --noEmit && npx vitest run
cd apps/agent-worker       && npx tsc --noEmit && npx vitest run
cd packages/agent-runtime  && npx tsc --noEmit && npx vitest run
cd apps/agent-worker       && npx tsx scripts/calibrate-q2b.ts --json <scratch>/calibration.json
```

Before this track: agent-worker 7 test files and 123 tests; manga-render 11 files and 709 tests. After: see the PR body.

New tests: `apps/agent-worker/test/q2b-continuity.test.ts` (places, location check, `vision`, minor figures, the skill versions). `test/continuity.test.ts` changed in two lines: the three skill versions, and the size cap from 14 to 20 percent (the three skills grew by 1,939 bytes: 837, 816 and 286).

## 10. Not done, and open problems

1. **The location check is not calibrated on real `units`.** Section 4. It needs one live understanding that writes `units`.
2. **The renderer draws a door as a throne hall.** The skill now says to map a door or gate to an outdoor place with `door` or `gate`. Whether the renderer then draws a recognizable door is Q1's work and is not verified here.
3. **"Against the wall" and "a bench"** are guided by one line in the skill (`high_wall`). No renderer test.
4. **Minor speaker names in the source drawer.** `backend/app/api/editions.py` builds `speakers` from the understanding cast. It needs the minor figures of the page spec. Not changed (outside the owned paths).
5. **The `vision` word detector in the calibration is a simulation.** A live writer may flag too few or too many panels. The check on the present stays strict.
6. **A model that sets `vision` to avoid an error.** The skill forbids it. No deterministic guard exists. A warning for a `vision` panel on a page whose beat has none of the words "afterlife", "dream", "memory", "heaven", "paradise" or "vision" is possible, but it needs live data.
7. **One book family.** All saved runs are Andersen and Wilde tales.

## 11. Questions for the owner

1. Should the backend show the names of minor figures in the source drawer (a 3-line change in `editions.py`)?
2. After the first live run: promote `PLAN_LOCATION_NOT_IN_UNITS` to an error only if its flagged pages match the judges' setting complaints better than chance. Is that the right bar?

## Guard for the `vision` flag (review fix)

The `vision` flag skips FIGURE_STATE_MISMATCH for its panel, so the page goal now checks the flag (`visionIssues` in `continuity.ts`):

- VISION_OVERUSED: a page of 2 or more panels sets `vision` on more than half of its panels. It is an error only when the planned beat names none of: afterlife, dream, memory, paradise, heaven, vision (the plan never asked for a vision). When the beat names one, a page may flag every panel (a whole page can be a vision, for example the last page of the Little Match Girl) and nothing is reported. When the planned beat is not available, it is a warning.
- VISION_NOT_PLANNED (warning): a panel sets `vision`, but the planned beat of the page has none of: afterlife, dream, memory, paradise, heaven, vision. This stays a warning until it is calibrated on judged pages.
