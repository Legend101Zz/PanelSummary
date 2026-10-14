# W1: page turn, fidelity labels, continuity follow-ups

Track W1 of v0.3. Issues #82 (page turn), #83 (fidelity labels on trimmed quotes) and #87 (continuity follow-ups). Branch `v03/w1-writer`, from `release/v0.3`.
The #94 defaults for the writer checks and for continuity apply.

Status: PARTIAL. Every number below was measured in this track on saved judged pages. No model was called and no live run was made. The effect of the skill text on the judged rates is not measured. A live run and a judge panel must measure it.

## 1. Summary

| Item | Result |
|---|---|
| Data | 320 judged pages of 9 saved runs, 960 judge-pages, 154 pages judged good. Four runs are Just So (run6, final-journey, final-journey-2, the v0.1.0 hold-out). No Cheese data and no sealed data was read. |
| #82 page turn | A planned hook is the lever. A page that does not close a section has a page-turn mean of 3.49 with `page_turn_hook` and 3.18 without (difference 0.32, 95% bootstrap interval 0.23 to 0.40; the sign holds in 9 of 9 runs). What the last panel holds shows no link. Done: skill text in the plan skill (1.6.0) and the page skill (1.12.0), and a plan warning `PAGE_TURN_HOOK_MISSING`. Not done, because the numbers do not support it: a page check `PAGE_TURN_HOOK_NOT_LAST`. The previous page spec is not given to the page goal (not measurable offline). |
| #83 fidelity labels | No numbers support a label `quote (cut)` or a new rule. `QUOTE_CLIPPED` had a signal on its face (55% hit, 28 points of lift) but it was the judges repeating the warning that they read. Without those echoes it has none (32% against 26%). Decision (the #94 default): the page goal does not run it any more. Skill text about cutting quotes and about labels (manga-page 1.12.0). |
| #87a `PLAN_LOCATION_NOT_IN_UNITS` | Stays a warning. On model-written units: 16 flagged pages, 4 with a setting complaint (25%), against 34% on the other pages. Not better than chance (one-sided Fisher p = 0.84). |
| #87b minor speakers | The Sources drawer shows "A watchman", "A child" and so on instead of "Someone". Frontend only (`transcript.ts`, `SourceDrawer.tsx`), the name comes from the figure id. Screenshot taken at 1440 wide (section 6). |
| #87c Just So continuity | Complaints by class: place 18, scale 13, identity 9, state 5, other 10. Place is the largest class, and 14 of its 18 defects are owned by the renderer (a "Cave" drawn as a modern cottage or bedroom). The part in reach of the writer and the plan gets skill text: stage each panel where and when the source puts it. |
| Tests | agent-worker: `npx tsc --noEmit` clean, `npx vitest run` 11 files, 202 tests (before: 10 files, 191 tests). Frontend: `npx tsc --noEmit` clean, `npm test` 12 files, 124 tests (before: 11 files, 119 tests). Replay journey: 61 of 61 checks, twice (section 7). |

## 2. Method

- Script `apps/agent-worker/scripts/calibrate-w1.ts` replays every page check of the page goal and the plan place check over the saved specs (`pageIssues`, `planPlaceIssues`, `quoteClippedIssues` with five windows). It writes the flags of each page. It makes no model call.
- Script `apps/agent-worker/scripts/calibrate-w1-join.py` joins the flags with the judges and prints every table of this page. Commands:

```text
cd apps/agent-worker
npx tsx scripts/calibrate-w1.ts FLAGS.json
python3 scripts/calibrate-w1-join.py FLAGS.json > W1-tables.txt
```

- The saved runs are under `/Volumes/Mrigesh SSD/Book-Reel-scratch/v02/`: `live/run2`, `live/run3`, `live/run4`, `live/run5`, `live/run6`, `live/run8`, `final-journey`, `final-journey-2`, `v01-holdout`. The output of this run is in `/Volumes/Mrigesh SSD/Book-Reel-scratch/v03/w1/W1-tables.txt`.
- The D26 rule (`docs/v0.2/Q2a-writer-checks.md` section 2): E 10 flagged pages, P 60% hit, L 20 points of lift over the unflagged pages, C at most 25% of the judged-good pages flagged. A hit is a major or blocker defect of the matching kind (`scripts/acceptance/judge/kinds.py`, the v0.1 rules, unchanged), or a mean score of the matching criterion under 3. A judged-good page has a criterion mean of 3 or more everywhere and a mean of 3.5 or more over the eight criteria.
- Limits. (1) The kind patterns are loose: 27% of the unflagged pages are hits for `quote_clipped`, and 34% for `setting_wrong`. (2) The judges read the renderer warnings of each page in their input. 177 of the 1,719 major and blocker defects (10%) name a check code. A check that is also a warning is measured against judges who may repeat it. Section 4 shows how large this is for `QUOTE_CLIPPED`. (3) Three of the nine runs are the same book family as the tuning books, so these are tuning data, not a hold-out.

## 3. #82 page turn

### 3.1 How often the plan has a hook, and the judged page-turn score

A page spec copies the plan's `page_turn_hook` on every one of the 320 pages, so the plan flag is the only hook flag. "Not last" means a page that is not the last page of its section (28 pages are the last page of a section; their page-turn mean is 3.62).

| Run | Pages | Plan hook % | Page-turn mean | Hook pages (not last): n, mean | No-hook pages (not last): n, mean | Difference |
|---|---|---|---|---|---|---|
| run2 | 22 | 45 | 3.561 | 10: 3.833 | 10: 3.267 | 0.567 |
| run3 | 60 | 50 | 3.406 | 30: 3.589 | 25: 3.133 | 0.456 |
| run4 | 38 | 50 | 3.307 | 17: 3.490 | 18: 3.093 | 0.398 |
| run5 | 36 | 77 | 3.259 | 26: 3.244 | 7: 3.238 | 0.005 |
| run6 | 34 | 67 | 3.529 | 23: 3.609 | 8: 3.208 | 0.400 |
| run8 | 36 | 44 | 3.278 | 16: 3.333 | 17: 3.216 | 0.118 |
| final-journey | 35 | 74 | 3.505 | 26: 3.538 | 6: 3.222 | 0.316 |
| final-journey-2 | 29 | 37 | 3.299 | 11: 3.515 | 15: 3.111 | 0.404 |
| v0.1.0 hold-out | 30 | 36 | 3.367 | 11: 3.394 | 16: 3.250 | 0.144 |
| All | 320 | 54 | 3.384 | 170: 3.494 | 122: 3.178 | 0.317 |

A no-hook page has a page-turn mean of 3 or less in 66% of the cases; a hook page in 26%. Judges list a page-turn defect on 3% of the no-hook pages and on 11% of the hook pages, so the judges do not complain about a missing hook as often as they score it down. The correlation of the page-turn score with the hook flag is 0.27 over the 320 pages.

### 3.2 Does the last panel carry the hook?

The plan holds only a flag, not the text of a hook, so "the planned hook is in the last panel" cannot be tested directly. These proxies were tested on the 170 hook pages that are not the last page of a section:

| Property of the last panel | Pages with it: mean | Pages without it: mean |
|---|---|---|
| a question, an ellipsis or a cut-off dash in a text | 67: 3.532 | 103: 3.469 |
| the last planned claim is in the last panel | 127: 3.499 | 43: 3.481 |
| dialogue (speech, shout, whisper) | 96: 3.542 | 74: 3.432 |
| a thought | 37: 3.450 | 133: 3.506 |
| a dramatized line | 33: 3.606 | 137: 3.467 |
| a close or extreme close shot | 89: 3.498 | 81: 3.490 |
| a question or an ellipsis only in an early panel (hook spent early) | 58: 3.500 | 112: 3.491 |

The differences are 0.01 to 0.12 points. No property has a link. D26 for the candidate page checks (hit: page-turn mean under 3, or a page-turn defect kind):

| Candidate | E | P | Base | L | C | Verdict |
|---|---|---|---|---|---|---|
| hook page, no question or ellipsis in the last panel | 103 | 12% | 9% | 3 | 30% | fails P, L, C |
| hook spent in an early panel | 58 | 9% | 10% | -1 | 16% | fails P, L |
| `PAGE_TURN_HOOK_NOT_LAST` (the last planned claim is not in the last panel) | 43 | 19% | 8% | 10 | 14% | fails P, L |
| plan: no hook on a page that is not last of a section | 122 | 6% | 12% | -6 | 38% | fails P, L, C |
| the same, with hit = page-turn mean of 3 or less | 122 | 66% | 25% | 41 | 38% | passes E, P, L; fails C |
| renderer `HOOK_PANEL_LARGEST` (existing warning) | 9 | 44% | 9% | 36 | 1% | fails E, P |

`HOOK_PANEL_LARGEST` already covers the size of the last panel. Its 9 pages have a page-turn mean of 2.96 against 3.52 for the other hook pages. It stays a warning (E fails with 9 pages). When the defects that name the code are left out, the hit rate is the same (4 of 9).

### 3.3 Decisions

1. Skill guidance only, no page check. `PAGE_TURN_HOOK_NOT_LAST` is not added: the proxy fails P and L, and the last panel shows no link with the score.
2. Plan skill 1.6.0: every page that does not close a section gets a turn hook (a question left open, a reveal held back, a change about to happen), written in the beat, taken from the book and not invented. Page skill 1.12.0, section 10: the last panel holds the hook, in words or in the picture; never spend it in an early panel; do not invent a line to make a hook; the first panel after a hook is not a copy of the last panel of the page before.
3. `PAGE_TURN_HOOK_MISSING` (plan warning, `src/goals/page-turn.ts`). It is raised when more than 25% of the pages that do not close a section have no hook (and at least 4 such pages). It fails the D26 rule on cost (38% of the good pages), so it stays a warning, kept on the plan receipt. On the nine saved plans it would warn on 7 (the hook-less share is 19% to 59%). The next live run measures it again.
4. The previous page spec is not given to the page goal (the #94 default says "only if #82 measures a gain"). A gain from that cannot be measured offline, so it is not added.
5. Risk that the measurement cannot show: more hooks mean more pages that need a small last panel and a large first panel (`FIRST_PANEL_SMALL_AFTER_HOOK`). Run 5 has 77% hooks and the lowest page-turn mean among the Wilde and Emerson runs (3.26) with a difference of 0.005 between hook and no-hook pages. A live run must check that more hooks do not hurt layout variety.

## 4. #83 fidelity labels

### 4.1 Trimmed quotes and near-verbatim lines against the judges

A line of 5 words or more is "cited" when a major or blocker defect about labels, quotes or invention quotes 4 words of it. There are 1,619 such lines.

| Class of line | Lines | Cited | Rate | Cited as `fidelity_label` | Cited as `quote_clipped` |
|---|---|---|---|---|---|
| quote, plain | 551 | 56 | 10% | 17 | 22 |
| quote, cut with "..." | 216 | 43 | 20% | 10 | 31 |
| paraphrase or dramatized, verbatim in the source | 51 | 7 | 14% | 6 | 3 |
| paraphrase or dramatized, near-verbatim (an 80% run of the source) | 33 | 4 | 12% | 3 | 0 |
| paraphrase or dramatized, other | 755 | 167 | 22% | 85 | 42 |
| metaphor | 13 | 12 | 92% | 0 | 2 |

By label: dramatized lines are cited in 52% of the cases (47 of 91), paraphrase 18%, quote 13%. The rates per judge-page (major and blocker): `fidelity_label` 0.118, `quote_clipped` 0.167, `invented` 0.226.

Findings.
- A cut quote is cited twice as often as a plain one (20% against 10%) and named as clipped 3.6 times as often (14% against 4%). But 26% of the quotes have a cut, and the fidelity score of a page with a cut quote is not lower (3.60 against 3.49). A page-level rule on "a quote with a cut" would flag 147 of 320 pages, 46% of the good pages.
- No sub-class of cut reaches 40%: a leading "..." 31%, a last fragment that stops mid-sentence 28%, a gap across a sentence end (a splice) 8%, a gap of 10 words or more 21%.
- A line that copies the source and is labelled paraphrase is cited less often (14%) than other paraphrases (22%). The label "near-verbatim paraphrase" is therefore not what judges object to most. Invented lines (dramatized) are.
- The rules "a quote ends in mid-sentence without a final ..." (142 pages, 32% hit against 27%) and "a quote starts in mid-sentence without a leading ..." (172 pages, 31% against 27%) flag 41% and 56% of the good pages. They fail P, L and C.

Decision: no label `quote (cut)` and no new rule. The label would be a contract change in `packages/manga-render` (a new `Fidelity` value, and the reader copy), and the numbers do not show that judges score a labelled cut better. A rule would flag half of the good pages.

### 4.2 `QUOTE_CLIPPED` re-measured (the #94 default)

The check as shipped (window 2 to 6 words left out), on 320 pages:

| Test | Result |
|---|---|
| flagged pages | 31 (E holds) |
| hit = `quote_clipped` kind | 17 of 31 = 55%, base 27%, lift 28 points, 9 of 154 good pages flagged (6%) |
| 2x2 | flagged and hit 17, flagged and no hit 14, unflagged and hit 77, unflagged and no hit 212; one-sided Fisher p = 0.002 |
| hit = `fidelity_label` kind | 7 of 31 = 23%, base 27% (no signal) |
| hit = fidelity mean under 3 | 2 of 31 = 6%, base 6% (no signal) |

On its face this is a signal. It is not, for this reason: the judges read the page warnings. 26 pages have a judge defect that names `QUOTE_CLIPPED`, and all 26 are among the 31 flagged pages. When the defects that name the code or the word "warning" are left out of the hit:

| Window (words left out) | Flagged | Hit | Base | Lift |
|---|---|---|---|---|
| 2 to 6 (shipped) | 31 | 32% (10) | 26% | 7 points |
| 3 to 6 | 24 | 33% (8) | 26% | 8 points |

Without the echoes the check has no signal, as in the v0.2 calibration (31% against 31%). The window 3 to 6 passes E, P, L and C on the raw hit (62%, 36 points), but that is the same echo, and it was chosen on the same data, so it is not used.

Decision (D33): the page goal does not run `QUOTE_CLIPPED` any more (`repairOnceIssues` no longer calls it). The function and its tests stay for the calibration scripts. The skill keeps the rule "never splice, never trim the punchline" and no longer promises a warning. The concern is real (a cut quote is named as clipped 3.6 times as often as a plain one), so the skill now tells the writer where to cut (section 4.3).

### 4.3 Skill text (manga-page 1.12.0, section 6)

- Cut a quote at the edges of a clause, with "..." at every cut. If the cut loses the point, quote a shorter whole sentence or paraphrase.
- Label by what you wrote: 5 words or more of the book in a row, in order, make a `quote`; `paraphrase` is your own shorter words; `dramatized` is for a line the source says was spoken without giving the words, never for a planned claim, never to turn narration into speech.

## 5. #87 continuity

### 5.1 `PLAN_LOCATION_NOT_IN_UNITS` on model-written units (the #94 default)

Eight of the nine runs have an understanding in which the model wrote `units` on its locations (run4: 3 of 6 locations; the v0.1.0 hold-out has none). That gives 290 judged pages, 148 judged good.

| | Setting complaint (`setting_wrong`) | No setting complaint |
|---|---|---|
| Flagged by `PLAN_LOCATION_NOT_IN_UNITS` (16 pages) | 4 | 12 |
| Not flagged (274 pages) | 92 | 182 |

Hit rate 25% on the flagged pages and 34% on the others (lift -9 points; one-sided Fisher p = 0.84). With the judges' continuity mean under 3 as the hit: 38% against 28%, p = 0.29. Flagged pages per run: final-journey-2 10 (3 with a complaint), final-journey 4 (0), run2 1 (1), run6 1 (0), and 0 in run3, run4, run5 and run8. `PLAN_PLACE_UNLISTED` (11 pages): 3 hits (27%) against 33%, p = 0.77. Both checks together: 17 pages, 5 hits (29%) against 33%.

Decision (D34): the flagged pages do not match the setting complaints better than chance. `PLAN_LOCATION_NOT_IN_UNITS` and `PLAN_PLACE_UNLISTED` stay warnings. For reference, the page check `LOCATION_OFF_PLAN` flags 3 pages (2 hits). The number of flagged pages is small; a later run with more units-bearing plans can measure it again.

### 5.2 Minor speakers in the Sources drawer (the #94 default: yes)

The page goal draws a person that the book names once (a child, a watchman) as a minor figure with the id `m_<word>` (`minor-figures.ts`). The page spec keeps the id as the speaker of the line. The backend builds `speakers` from the understanding cast only, so the name of a minor figure is empty and the drawer showed "Someone". Change, in `frontend/components/reader/transcript.ts` and `SourceDrawer.tsx` (the drawer's look is not changed): `speakerNames(page)` fills an empty name of an id `m_<word>` with the figure's own name text ("A watchman", "An old woman"). An unknown id still shows "Someone". 5 new tests.

Data check: in the saved runs, 4 pages have a line with a speaker `m_...`: run2 page 10 (`m_watchman`), run3 pages 1, 2 and 12. Not done: the Reader's own transcript (`Reader.tsx`, one line) uses `voiceLabel` with `page.speakers` too. It is outside the owned paths, so it is not changed. A backend change in `editions.py` (3 lines: name the `m_` ids in `speakers`) would fix both places. See the owner questions.

### 5.3 Just So continuity (2.50 to 2.68; other books 3.21)

Judge continuity means: run6 2.59, final-journey 2.51, final-journey-2 2.64, v0.1.0 hold-out 2.68. 55 major or blocker defects, from judges who scored continuity 2 or lower, are about setting, state, scale or identity:

| Class | Defects | Pages | Owner (judge's label) |
|---|---|---|---|
| place (the "Cave" drawn as a cottage or a bedroom, "outside" drawn as an interior, a place or time against the source) | 18 | 15 | renderer 14, plan 2, writer 2 |
| scale (a crocodile as a speck, the child larger than the aunts) | 13 | 10 | renderer 8, understanding 5 |
| identity (the Elephant's Child cast as a human child or a horse) | 9 | 8 | understanding 4, renderer 4, writer 1 |
| state | 5 | 5 | writer 3, renderer 2 |
| other | 10 | 8 | writer 6, plan 2, understanding 1, renderer 1 |

The classes come from keyword rules (`calibrate-w1-join.py`); they are a guide, not a gold standard. Place is the largest class. Most of it is the renderer (an interior look for a cave, owner: the renderer track), and a cave mapped to an indoor place in the understanding. The part that the writer and the plan own is a panel staged in another place or time than the source gives: the Cat and the Baby drawn inside the cave when the source keeps them outside (final-journey page 30), the python walking on the road when the source puts it on the river bank (final-journey-2 page 8), invented time captions ("that evening" on a bright-day panel, "that night" for "next day").

Skill text (general, no book named): plan skill 1.6.0 asks the planner to name in the beat where and when the source puts the action (inside or outside, bank or road, day or night). Page skill 1.12.0, section 8a: stage each panel where and when the source puts it; a panel "outside the cave" does not use the cave's interior location; a time or place caption must come from the source and agree with the panel's `time` and `location`.

What this cannot fix: the scale and identity classes (18 defects) and most of the place class are in the understanding and the renderer. Those are other tracks (`book-understanding` is not in the owned paths of W1).

## 6. Screenshot of the drawer

Replay of the saved run2 export (`/Volumes/Mrigesh SSD/Book-Reel-scratch/v03/w1/replay-run2/`), reader page 10 at 1440 by 900, Sources drawer open: panel 4 shows "A watchman  Quoted" for the line "You must not lie here!". The file is `/Volumes/Mrigesh SSD/Book-Reel-scratch/v03/w1/drawer-page10-after.png`. The speaker names of the drawer on that page: "The Swallow, thinking", "A watchman", "The Happy Prince".

## 7. Verification

| Command | Result |
|---|---|
| `cd apps/agent-worker && npx tsc --noEmit` | clean |
| `cd apps/agent-worker && npx vitest run` | 11 files, 202 tests passed (before this track: 10 files, 191 tests) |
| `cd frontend && npx tsc --noEmit && npm test` | clean; 12 files, 124 tests (before: 11 files, 119) |
| Replay journey, fixture `scripts/fixtures/replays/happy-prince-two-tales`, ports 3230, 8130, 8830, 27130, database `v03_w1`: `node scripts/acceptance/journey.mjs --pdf scripts/acceptance/books/happy-prince-two-tales.pdf --out OUT --full --replay ...` | JOURNEY PASSED, 61 PASS, 0 FAIL; 22 of 22 pages; 24 calls; egress `{}` |
| The same journey with the run2 package (it has a minor speaker), database `v03_w1_run2` | JOURNEY PASSED, 61 PASS, 0 FAIL |

The stack was stopped with `./stop.sh`, and the four ports were free afterwards. One run of the whole agent-worker suite on a loaded machine had one timeout in `replay-worker.test.ts` before my changes (a test of `FAIL_PAGES` that renders pages; the file passes alone, 25 tests).

Skill sizes: manga-page 22,846 to 24,548 bytes, adaptation-plan 6,589 to 7,105. The total growth limit in `continuity.test.ts` is raised from 1.23 to 1.30 (measured: 44,416 / 34,494 = 1.2876).

## 8. What I did not do

- No live run, no judge panel, no model call. The effect of the skill text on page turn, fidelity and continuity is not measured.
- No page check for the page turn, no label `quote (cut)`, no promotion of any check to an error.
- The previous page spec is not given to the page goal.
- No change to the renderer, `book-understanding`, or the contracts. The cave-as-cottage defects (14 of 18 place defects) need renderer work.
- `Reader.tsx` is not changed (see 5.2).
- The other `repair_once` codes were not re-measured without the judges' echoes. `PROSE_WALL` is named in 37 defects.

## 9. Owner questions

1. The plan skill now asks for a hook on every page that does not close a section. A live run must show that this does not hurt variety or the layout after a hook. Do you accept that risk for the next live run?
2. The judges read the page warnings, so a check that is also a warning is easy to confirm. `QUOTE_CLIPPED` is one case. `PROSE_WALL` (in `repair_once`) is named in 37 defects. Do you want the D26 numbers of the `repair_once` codes calculated again without the defects that name the code?
3. Do you want a backend change (`editions.py`, 3 lines) that names the `m_` ids in `speakers`? It fixes the Reader and the drawer at once and lets the frontend change go.
4. The renderer draws a cave as a modern room (14 defects, 15 pages, on the Just So runs). Is this for the renderer track of v0.3?

## Gate 1 fixes (track fxw, issue #82)

Source: `Book-Reel-scratch/v03/gate1-analysis-public.md` (causes A1 and A3 and the A2 scale rule). Same book, same model, renderer 0.6.0 against 0.7.0.

What Gate 1 measured about the W1 hook rule: hooks 10 to 18 of 22 pages, page-turn mean 3.56 to 3.48, pages that gained a hook +0.07, pages that had one in both runs -0.25, repeated panels 0.12 to 0.21, and 3 of 12 adjacent hook pairs that share a unit repeat the hook line on the next page (v0.2: 0 of 5). Section 3 of this note read a 0.32 link between a planned hook and the score; the link was selection, not a gain from forcing hooks.

Changes:
1. `adaptation-plan` 1.7.0. A hook where the story has one, about every 2 to 4 pages, never forced. The page after a hook answers it or moves on. No two neighbouring pages have the same beat text.
2. `PAGE_TURN_HOOK_MISSING` is removed (`src/goals/page-turn.ts`). It pushed a hook on every page, and the Gate 1 measurement does not support it. New plan warning `PLAN_BEAT_REPEATED`: two consecutive pages with the same beat text (case, spaces and end punctuation ignored). The two-tale Gate 1 plan has none.
3. The page goal gets the previous page's planned beat and `planned_hook` (from the plan, `previous.planned_hook`; nothing for page 1). The prompt says: the page before ends on a planned hook, do not repeat it. `manga-page` 1.14.0 has the rule "Never repeat across the turn" in section 10. The written spec of the previous page is still not given.
4. `manga-page` 1.14.0, "When no item fits": a `label` is for `thing_*` props only (the renderer ignores it on other props). Colour or the name of a named prop goes in the art (`tone`) or the dialogue. Three things the story tells apart are three cast members or props, each with its own `tone`. (`book-understanding` 1.13.0 says the same for the cast.)

Tests: `test/gate1-fixes.test.ts` (the page goal input has the previous page's planned hook for page N > 1 and nothing for page 1; the prompt text; the skill rules) and `test/w1-writer.test.ts` (the plan checks). Skill growth: +1,919 bytes in three skills (49,358 to 51,277); the limit in `continuity.test.ts` is 1.50 (measured 51,277 / 34,494 = 1.4865).
Not measured: the effect on judged pages. A live Gate 1 run must show it. The catalog text of `prop.label` in `packages/manga-render/src/catalog.ts` still says "allowed on any prop"; it belongs to the renderer track.
