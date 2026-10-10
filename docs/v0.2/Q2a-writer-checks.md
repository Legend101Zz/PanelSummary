# Q2a: writer checks, re-measured

Track Q2a of v0.2. Issues #43 (caption walls and repeated panels) and #45 (re-measure the writer checks).
Branch `v02/q2a`, from `release/v0.2`. Skill `manga-page` 1.10.0 (was 1.9.0 on release/v0.2 after Q2b; Q2a first made 1.9.0 from 1.8.0). The renderer is not changed.

Status: PARTIAL. All numbers below come from offline replays of saved judged pages. No model call was made and no live run was started. The effect on the judged rates is a prediction. The orchestrator must verify it with a live run and a judge panel.

## 1. Summary

| Item | Result |
|---|---|
| Pages measured | 319 judged pages from 12 saved runs (134 judged good). The W2 calibration had 95 pages. |
| `PROSE_WALL` | Promoted to `repair_once`. 68 pages flagged, 75% specific hit, 12 of 134 good pages flagged. The threshold is not changed. |
| `SAME_SHOT_TWICE` (new) | Warning. 8 pages flagged (5 hit). Too few pages to promote. |
| `QUOTE_CLIPPED` (new) | Warning. 49 pages flagged, hit rate 31% (the base rate is 31%), specific hit 6%. No signal. Drop candidate. |
| `DUPLICATE_CAPTION`, `SPEAKER_OFF_PANEL_LIMIT` | Demoted from `repair_once` to plain warning. They have 2 and 1 flagged pages. |
| `KEY_PROP_NOT_DRAWN` | Stays in `repair_once` after one tuning step (the trigger word "leaf" is removed). Without it the specific hit was 59.5%, under the bar. |
| `DIALOGUE_ORDER` | Stays a warning: 8 pages flagged, 7 hit, but fewer than 10 pages. |
| `CLAIM_ORDER` | Stays a warning, kept with a reason: it flagged 0 of 319 pages. |
| Tests | `npx tsc --noEmit` clean. `npx vitest run`: 7 files, 132 tests passed (115 before). |

## 2. The calibration rule

The repository states the rule only in words: "A new deterministic page validation is calibrated on judged pages before it becomes an error. Until then it is a warning" (`CLAUDE.md`, `docs/launch/EVAL.md`). W2-writer added a bar: precision of 60% or more, and at most 25% of the judged-good pages flagged. No page count was set. That is why seven codes rested on 1 to 5 pages (issue #45).

This track writes the rule as numbers. I wrote it before I chose any class. The numbers are mine, so the owner can change them.

A code is in `repair_once` when all four tests hold:

1. **Evidence (E).** At least 10 judged pages are flagged. Exception: a code that is already in `repair_once` and has 3 to 9 flagged pages may stay ("thin evidence"). A code with fewer than 3 flagged pages is a warning. A new code with fewer than 10 flagged pages is a warning.
2. **Precision (P).** At least 60% of the flagged pages are hits. A hit is a page where a judge listed a major or blocker defect of the matching kind, or where the mean score of the matching criterion is under 3. Where the check names words (a claim id, a prop), the hit must also mention one of them (the "specific hit").
3. **Lift (L).** The hit rate of the flagged pages is at least 20 points above the hit rate of the unflagged pages. The kind patterns are loose (they hit 20 to 76% of the unflagged pages), so precision alone proves little. L is not applied to a specific hit, because the unflagged pages have no words to match.
4. **Cost (C).** The check flags at most 25% of the judged-good pages. A flag on a good page costs one extra round (a retry of the page). It never fails a page.

A code that fails a test is a warning. A shipped code with E met and a hit rate under 40% is a drop candidate. A new code starts as a warning and is dropped or kept after one more measurement on live pages. Nothing becomes a hard error in this track.

A judged-good page: the mean of each criterion over the judges is 3 or more, and the mean of the eight criterion means is 3.5 or more. This is the W2 definition.

## 3. Data and method

Script: `apps/agent-worker/scripts/calibrate-checks.ts`. It replays every page check over the saved page specs: the structural and render warnings, every writer check of the page goal (`pageIssues` in `manga-page.ts`), the candidate checks and their variants. It joins each flag with the judges' defects and scores of the page. It needs no model.

Command: `cd apps/agent-worker && npx tsx scripts/calibrate-checks.ts OUT.json > OUT.md`. Without arguments it reads the 12 sets listed in the script (the launch scratch directory on the SSD).

| Group | Sets | Pages |
|---|---|---|
| old (the W2 calibration) | p0 (15), ci (13), run8 (46), ab-flash-old (21) | 95 |
| new | gate1-flash (22), uab-flash (22), uab-m3 (22), ab-m3plan (16), gate2 (46), gate2b (60), gate2-m3u (18), final (18) | 224 |

Limits of the data. Read the numbers with these in mind:

- 301 of the 319 pages are from one book (the Happy Prince tales). 18 are from another (the Andersen tales, final journey). The checks are not tested on a third book.
- The "new" sets were written with the W2 `repair_once` active, for the codes that were in it then. A flag that is still on such a page is one the writer did not fix after the warning. So the "new" numbers of an old code show the residue. The "old" group has no such bias. This is why I show both.
- The kind patterns are the launch cluster patterns (`clusters/kinds2.py`). They are loose. For example "cropped", "fused" and "merged" count as `quote_clipped`. A kind hit is weak evidence.
- Only major and blocker defects count. Judges list their defects as free text per page, not per panel.
- A page is counted once per set. No two saved specs are equal (verified by hash), but pages of one book share source text.
- The script reproduces the W2 numbers on the old group: `CLAIM_TEXT_THIN` 21 flagged, 18 specific hits, 7 good pages; `KEY_PROP_NOT_DRAWN` 28 flagged and 18 specific hits (before the tuning of section 5).
- The base rates of the judged rates agree with the reports. Gate 2 (46 pages, 138 judge-pages): label clutter 0.196 (report: 0.20), repeated panels 0.167 (0.17). Final journey: beat-without-prose-wall mean 3.17 (aggregate: 3.17).

## 4. Calibration table, every `repair_once` code and the candidates

"N" is flagged pages (all / old / new). "Hit" is the hit rate on the flagged pages (specific hit for `CLAIM_TEXT_THIN` and `KEY_PROP_NOT_DRAWN`). "Base" is the hit rate on the unflagged pages. "Recall" is the share of the pages with a kind hit that the check flags. "Good" is the judged-good pages flagged (of 134).

| Code | Class before | N | Hit | Base | Recall | Good | Rule | Class now |
|---|---|---|---|---|---|---|---|---|
| `CLAIM_TEXT_THIN` | repair_once | 38 / 21 / 17 | 76% (29/38) | not measurable | 15% | 12 (9%) | E, P, C hold | repair_once |
| `KEY_PROP_NOT_DRAWN` | repair_once | 39 / 25 / 14 | 67% (26/39) | not measurable | 14% | 13 (10%) | E, P, C hold (after tuning) | repair_once |
| `SPEECH_IN_NARRATION` | repair_once | 9 / 3 / 6 | 100% (9/9) | 20% | 13% | 1 | thin evidence; P, L, C hold | repair_once |
| `REPEAT_NAME_TAG` | repair_once | 8 / 5 / 3 | 75% (6/8) | 32% | 6% | 2 | thin evidence; P, L, C hold | repair_once |
| `LOCATION_OFF_PLAN` | repair_once | 12 / 4 / 8 | 75% (9/12) | 33% | 8% | 3 | E, P, L, C hold | repair_once |
| `HERO_TOO_SMALL` | repair_once | 5 / 3 / 2 | 100% (5/5) | 69% | 2% | 1 | thin evidence; P, L, C hold | repair_once |
| `STATUE_LOCATION_SWAPPED` | repair_once | 3 / 3 / 0 | 67% (2/3) | 10% | 6% | 1 | thin evidence (3 pages, all old); P, L, C hold | repair_once |
| `DUPLICATE_CAPTION` | repair_once | 2 / 1 / 1 | 100% (2/2) | 33% | 2% | 1 | fewer than 3 flagged pages | warning |
| `SPEAKER_OFF_PANEL_LIMIT` | repair_once | 1 / 1 / 0 | 100% (1/1) | 38% | 1% | 0 | fewer than 3 flagged pages | warning |
| `PROSE_WALL` | warning | 68 / 12 / 56 | 75% (51/68) | 23% | 48% | 12 (9%) | E, P, L, C hold | **repair_once** |
| `DIALOGUE_ORDER` | warning | 8 / 2 / 6 | 88% (7/8) | 12% | 16% | 1 | fewer than 10 pages | warning |
| `SAME_SHOT_TWICE` | new | 8 / 3 / 5 | 63% (5/8) | 19% | 8% | 3 | fewer than 10 pages (new code) | warning |
| `QUOTE_CLIPPED` | new | 49 / 8 / 41 | 31% (specific 6%) | 31% | 15% | 20 (15%) | fails P and L | warning, drop candidate |
| `CLAIM_ORDER` | warning | 0 | none | none | none | 0 | no flag on 319 pages | warning, kept |

Other warnings that have data (no class change):

| Code | N | Hit | Base | Good | Note |
|---|---|---|---|---|---|
| `LOCATION_NOT_PLANNED` (renderer) | 15 | 80% | 33% | 4 | Same fact as `LOCATION_OFF_PLAN`, but it also flags flashbacks. It would pass E, P, L and C. It is not added: `LOCATION_OFF_PLAN` is the same signal and is in the class. |
| `CAST_NOT_PLANNED` (renderer) | 14 | 57% | 30% | 6 | Fails P (57%) and L (27 points but under 60%). Stays a warning. |
| `BLOCKAGE_LAYOUT` (renderer) | 2 | 100% | 13% | 0 | Fewer than 3 pages. |

The full table of all codes (the 35 codes that fire on these pages, with old and new scopes) is in `/Volumes/Mrigesh SSD/Book-Reel-scratch/v02/q2a/cal7.md` and `cal7.json` (per page: flags, details, judge kinds, means).

## 5. Decisions

### 5.1 `PROSE_WALL`: promoted to `repair_once` (issue #43)

The renderer warns when a page has more than 40 words and more than 60% of them are in captions or narration. I measured nine variants of this threshold and four variants that count the narration words alone, before I chose.

| Variant | Flagged | Hit | Base | Recall | Good flagged |
|---|---|---|---|---|---|
| share over 0.5, words over 30 | 119 | 59% | 20% | 64% | 34 |
| share over 0.5, words over 40 | 92 | 66% | 22% | 56% | 24 |
| share over 0.5, words over 50 | 68 | 71% | 25% | 44% | 15 |
| share over 0.6, words over 30 | 90 | 66% | 22% | 53% | 22 |
| **share over 0.6, words over 40 (the renderer, kept)** | **68** | **76%** | **23%** | **48%** | **12** |
| share over 0.6, words over 50 | 48 | 81% | 26% | 36% | 7 |
| share over 0.7, words over 30 | 42 | 69% | 29% | 26% | 10 |
| share over 0.7, words over 40 | 30 | 87% | 29% | 24% | 6 |
| share over 0.7, words over 50 | 17 | 94% | 31% | 15% | 2 |
| 25 or more narration words | 140 | 55% | 18% | 70% | 41 |
| 30 or more narration words | 94 | 70% | 20% | 61% | 23 |
| 35 or more narration words | 69 | 77% | 23% | 49% | 15 |
| 40 or more narration words | 49 | 80% | 26% | 36% | 9 |

The current threshold passes E, P, L and C, so I did not tune it. The looser rows (0.5 and 40; 0.6 and 30) also pass P, L and C. They flag 92 and 90 pages (29% and 28% of all pages) for 5 to 8 more points of recall and 10 points less precision. The tighter rows lose recall. I keep the current threshold: it needs no renderer change, and it flags the fewest pages among the rows that find about half of the pages with a clutter defect. A tighter row (0.7 and 40) has the best precision among the rows with more than 20 pages, but it finds a quarter of the pages. The threshold lives in `packages/manga-render/src/validate/page.ts`, which this track does not own, so a different threshold would need a change there.

Cost. `PROSE_WALL` flags 68 of 319 pages (21%) and 9 of the 18 pages of the final journey. Each flagged page gets one extra round at most (the W2 mechanism). The union of all `repair_once` codes flags 136 of 319 pages (43%) now. It flagged 87 (27%) before. On the 134 good pages the union flags 36 now (27%) and flagged 26 before (19%). This is the main cost of this change. The owner can choose the stricter row (0.7 and 40: 30 pages) if the extra rounds are too many.

`PROSE_WALL` is an old renderer warning. The class (`REPAIR_ONCE_CODES` in `repair-once.ts`) takes the code as it is. No renderer output changes, so `RENDERER_VERSION` stays.

### 5.2 `SAME_SHOT_TWICE` (new): warning (issue #43)

New check `sameShotTwiceIssues` in `repair-once.ts`. Two panels of one page have the same signature: shot size, camera angle, place, time, weather, and the same figures in the same poses (for an insert panel: the same props). The warning names the first panel and says what to change.

Levels measured on the 319 pages:

| Level or rule | Flagged | Hit | Base | Good flagged |
|---|---|---|---|---|
| strict (also slot, facing, expression) | 0 | none | none | 0 |
| **standard (the goal uses this)** | **8** | **63% (5/8)** | **19%** | **3** |
| loose (shot, place, same cast, any pose) | 83 | 28% | 18% | 35 |
| same place and cast on 3 or more panels | 85 | 29% | 17% | 36 |
| same place and cast on 4 or more panels | 22 | 27% | 20% | 11 |
| same shot, angle, place and cast on 2 or more panels | 40 | 38% | 18% | 19 |
| same shot, poses and place on 2 or more panels | 20 | 45% | 19% | 7 |
| last panel of page n = first panel of page n+1 (standard) | 1 | 0% | 20% | 1 |
| last panel of page n = first panel of page n+1 (loose) | 9 | 22% | 20% | 4 |

Decision. The standard level is the only one with a hit rate above 60% and a lift above 20 points. It flags 8 pages, so it fails E (fewer than 10 pages). It is a warning. Promote it when a later measurement has 10 or more flagged pages and the rule holds.

The standard level is precise but blunt. Gate 2 has 23 repeated-panel defects in 138 judge-pages. Only 2 of them are on the 8 flagged pages (section 7). The repeats that the judges see are mostly not two equal pictures: they are many panels with one place and one cast, with other shots and poses (the page 15 type). The looser rules find these pages, but with a precision of 27 to 45%, which is no better than chance. So this check cannot be the main cure for issue #43.

Across a page turn. The data allows the test (the saved specs of page n and page n+1). Only 1 page (standard) and 9 pages (loose) match, with no useful precision. The page goal receives the previous page as a text description, not as a spec, so it cannot run the test. I did not add it. The skill tells the writer to open a page with a picture that differs from the last panel of the previous page.

### 5.3 `QUOTE_CLIPPED` (new): warning, drop candidate (issue #45)

New check `quoteClippedIssues` in `repair-once.ts`. For each line labelled `quote`, it finds the last fragment (4 or more words, after any "...") once in the source. It looks at the source sentence or quoted span that holds the fragment. The line is clipped when 2 to 6 words of that sentence follow the quote (the punchline), and the sentence has not ended. A closing quote mark ends the sentence. The warning shows the words that were left out.

| Window (words left out) | Flagged | Hit | Specific hit | Base | Good flagged |
|---|---|---|---|---|---|
| 2 to 99 | 139 | 32% | 6% | 31% | 55 |
| 4 to 99 | 130 | 32% | 6% | 30% | 50 |
| 4 to 12 | 100 | 32% | 7% | 31% | 33 |
| 3 to 8 | 71 | 31% | 6% | 31% | 27 |
| **2 to 6 (the goal uses this)** | **49** | **31%** | **6%** | **31%** | **20** |
| 3 to 6 | 45 | 31% | 7% | 31% | 17 |
| 2 to 4 | 23 | 35% | 4% | 31% | 10 |
| 1 to 3 | 17 | 35% | 6% | 31% | 7 |

The specific hit means that the judge's text names the last words of the quote or the first words of what was left out.

Result. At every window the hit rate equals the base rate (31 to 35%), and the specific hit is 4 to 7%. The check has no measured signal on these pages. The rule says: fails P and L, so it is a warning, and with 49 flagged pages it is a drop candidate. I kept it as a warning for one more measurement, because it cannot block a page and it is the requested check. I chose the window 2 to 6 because it covers the example in the skill ("as beautiful as a weathercock... only not quite so useful", 5 words left out).

Why it may find nothing. The writers trim long sentences on purpose (most flagged quotes drop a tail clause such as "and soared into the air"). The judges' `quote_clipped` defects are mostly about splices (two spans in one balloon) and about the start of a quote, which this check does not test. A better check would need a model-free definition of "punchline". I found none in the data.

Owner question 1 asks whether to remove it.

### 5.4 `KEY_PROP_NOT_DRAWN`: tuned, stays in `repair_once` (issue #45)

With the W2 trigger list the check flagged 42 of 319 pages and the specific hit was 25 of 42 (59.5%). That is under the 60% bar. I broke the hits down by trigger word (16 words). One word has no hit at all: "leaf" (4 flagged pages, 0 hits). "Leaf" is also not one clear object: it is the gold leaf of the Prince or a leaf of a tree. I removed the trigger. Result: 39 flagged, specific hit 26 of 39 (67%), 13 of 134 good pages flagged.

This is tuning on the data that I measure on. The change is small (one word, chosen by meaning as well as by count). Measure it again after the next judged run. The other low words are "jewels" (2 hits of 6 pages) and "blossom" (0 of 2). I did not touch them: two or six pages are too few to remove a word.

In the "new" group the specific hit is 8 of 14 (57%). These pages had the W2 chance, so they show only what the writer did not fix.

### 5.5 `DUPLICATE_CAPTION` and `SPEAKER_OFF_PANEL_LIMIT`: demoted to warning

They flag 2 and 1 pages of 319. Both flags are hits, but 1 or 2 pages is no evidence (E). Both stay as warnings, so the writer still sees them in a preview and on record. `SPEAKER_OFF_PANEL_LIMIT` is a renderer warning that was calibrated in `W2-renderer.md`. Here it only leaves the class.

### 5.6 Codes that stay

`CLAIM_TEXT_THIN` (38 pages), `LOCATION_OFF_PLAN` (12 pages): E, P, L, C hold. `SPEECH_IN_NARRATION` (9), `REPEAT_NAME_TAG` (8), `HERO_TOO_SMALL` (5), `STATUE_LOCATION_SWAPPED` (3): thin evidence. Each passes P, L and C, and each flags at most 2 good pages, so I keep them and mark them for the next measurement. `STATUE_LOCATION_SWAPPED` has 3 flagged pages, all in the old group, and only one book has a statue.

`CLAIM_TEXT_THIN` ratio. The sweep on 319 pages: ratio 0.2: 25 pages, 64% specific, 10 good pages. Ratio 0.3 (kept): 38 pages, 76%, 12. Ratio 0.4: 70 pages, 67%, 32 good pages (24%, at the limit of C). The W2 choice of 0.3 stands.

### 5.7 `DIALOGUE_ORDER`: stays a warning

8 pages flagged, 7 hits (88%), base 12%, 1 good page. Precision and lift are the best of any code. It fails E (8 pages, not 10). It was 2 pages in the W2 data. Promote it when a later measurement has 10 pages. Of the 8 pages, 6 are in the new group, so the writer still made this error after the skill rule "ask before answer".

### 5.8 `CLAIM_ORDER`: kept, with the reason

It flagged 0 of 319 pages (and 0 in the three T1 runs). Zero flags means no evidence in either direction. I keep it: it costs nothing when it does not fire, it is a warning, and removing it would change `claim-shown.ts`, `continuity.test.ts` and `T1-continuity.md`, which track Q2b also edits. T1 notes that it is blind to layout order and to order inside one panel (run 8, pages 9 and 25). The `order` defects that the judges list are found by `DIALOGUE_ORDER` (7 hits) and `BLOCKAGE_LAYOUT` (2 hits), not by `CLAIM_ORDER`. If a later measurement still has 0 flags, remove it.

## 6. Skill changes (`manga-page` 1.9.0 to 1.10.0)

Size: 20,970 to 21,944 bytes (+974, +4.6%). Three rules and one change of a list:

- Section 3, "Never repeat a picture": no two panels with the same shot, angle, place and figures in the same poses (`SAME_SHOT_TWICE`). Change the shot, the angle, the action or the object; show the reaction; or merge the panels. Open a page with a picture that differs from the last panel of the previous page.
- Section 5, "Turn narration into speech or drawn action": draw the event and give the spoken part to the character. On a page of more than 40 words, captions and narration together stay at 60% of the words or fewer, aim for half (`PROSE_WALL`, FIX BEFORE SUBMIT). The number is the threshold of the check.
- Section 5, captions: a caption is a label, not a sentence. A sentence goes in a balloon or in one narration box.
- Section 6 (quotes): a quote that stops 2 to 6 words before the end of its source sentence gets a `QUOTE_CLIPPED` warning.
- Process step 6: the `FIX BEFORE SUBMIT` list is now the new `REPAIR_ONCE_CODES`: it adds `PROSE_WALL` and removes `DUPLICATE_CAPTION` and `SPEAKER_OFF_PANEL_LIMIT`. A test (`repair-once.test.ts`) fails if the skill list and the constant differ.

Receipt. The receipt of each call records the skill name, version and content hash (`packages/agent-runtime/src/goal-runtime.ts`, `skill: { name, version, hash: contentHash }`). I verified with `loadSkill("manga-page")`: version 1.8.0 with hash `af116404...6055` before, version 1.9.0 with hash `590fd025...fc50` now (SHA-256 of the skill text with its references). The test `repair-once.test.ts` checks the version and that the hash is a 64-character hex string. After the rebase onto Q2b and S1 (merged skill, version 1.10.0) the hash is `b55672ae...a8227`.

Side effect outside my paths: `apps/agent-worker/test/continuity.test.ts` pins the skill versions and a total growth limit. After the rebase onto Q2b (manga-page 1.9.0) the merged skill is `manga-page` 1.10.0, and I set the limit from 1.20 to 1.22. I measured the merged files: 42011 bytes against the T1 baseline of 34494 bytes is 1.2179 (release/v0.2 alone was 41037, 1.1897). Decision number: this track's entry in `docs/decisions.md` is D26 (it was D21 before the rebase; Q2b has D21 to D23 and S1 has D24 and D25). After the rebase I ran the calibration script again on the merged code: the output is identical to `cal7.md`, so no number in this document changed.

## 7. Predicted effect on the judged rates

The three rates have a baseline that I reproduced from the saved judgments (section 3). The prediction assumes the writer fixes the flagged page when it gets the one chance. That is an assumption: W2 saw 3 live previews with the label and 3 fixes, which is a small sample. I show two cases: "half" (half of the defects on the flagged pages go away) and "all" (all go away, an upper bound).

| Rate | Target | Baseline | Prediction |
|---|---|---|---|
| Label clutter, blockers and majors per judge-page | under 0.20 | Gate 2: 0.196 (27 defects in 138). Final journey: 0.185 (10 in 54). | `PROSE_WALL` flags the pages that carry 20 of the 27 Gate 2 defects and 6 of the 10 final-journey defects. Gate 2: 0.123 (half), 0.051 (all). Final journey: 0.130 (half), 0.074 (all). |
| Repeated near-identical panels, per judge-page | under 0.17 | Gate 2: 0.167 (23 in 138). Final journey: 0.093. | `SAME_SHOT_TWICE` is a warning and flags pages with 2 of the 23 defects. Best case 0.152. I predict no measurable change from the code. Any change comes from the skill rule, and I cannot measure that offline. |
| Beat-without-prose-wall, mean of the judges | above 3.17 | Final journey: 3.17. Gate 2: 3.45. | Final journey: 9 of 18 pages are flagged (mean 2.78; the 9 others have 3.56). If the flagged pages reach the mean of the others: 3.56. Half way: 3.36. Gate 2: 8 of 46 flagged (2.46 against 3.66): 3.66 or 3.55. |

Read this with care.

- The label-clutter defects on a flagged page are not all caption walls. Some are name tags or restating captions. The "all" case is an upper bound.
- The repeated-panel target is not likely to be met by this track alone. The renderer, the plan (layout choice) and the writer share the cause (kind 7 report: writer 25, plan 17). A check cannot find the page 15 type (many panels, one place, one cast) at a useful precision.
- The extra rounds cost time and money. The union of the `repair_once` codes flags 43% of the 319 pages (27% before), and 9 of 18 on the final-journey book.

## 8. What I did not do

- No live run, no model call, no judge panel. The effect is a prediction.
- No change to the renderer (so no `RENDERER_VERSION` change), to `book-understanding.ts`, `continuity.ts`, `adaptation-plan.ts` or the vocabulary lists.
- No test on a second book with a statue, or on a book that is not a tale. The final-journey book (18 pages) is the only other book.
- No cross-page check in the goal. The goal does not receive the previous page spec.
- No new error. Every promoted code uses the W2 mechanism: one chance, then a warning.
- I did not measure a "fix rate" (how often the writer repairs a flagged page). That needs a live run.

## 9. Owner questions

1. `QUOTE_CLIPPED` has no signal (31% hit against a 31% base rate). Do you want it removed now, or kept as a warning for one more measurement?
2. `PROSE_WALL` flags 21% of all pages and half of the final-journey pages. Do you accept this cost, or do you want the stricter threshold (share over 0.7, words over 40: 30 pages, 87% hit, 24% recall)? That needs a change in the renderer package.
3. Do you accept the rule of section 2 (E: 10 pages, P: 60%, L: 20 points, C: 25%) as the written calibration rule? It replaces the unwritten page count of W2.
4. The previous page spec is not in the goal input. Do you want it (a backend change) so that the writer can see a repeat across a page turn? The offline data does not show a gain.

## 10. Files

| File | Use |
|---|---|
| `apps/agent-worker/scripts/calibrate-checks.ts` | The calibration script (no model). |
| `apps/agent-worker/src/goals/repair-once.ts` | `REPAIR_ONCE_CODES`, `sameShotTwiceIssues`, `quoteClippedIssues`, the `KEY_PROP_NOT_DRAWN` trigger list. |
| `apps/agent-worker/src/goals/manga-page.ts` | New exported `pageIssues` (the list of checks), used by the goal and the script. No change in behavior. |
| `apps/agent-worker/src/skills/manga-page/SKILL.md` | Skill 1.10.0. |
| `apps/agent-worker/test/repair-once.test.ts` | 17 new tests. |
| `/Volumes/Mrigesh SSD/Book-Reel-scratch/v02/q2a/` | `cal7.json` and `cal7.md` (final run), `cal1` to `cal6` (earlier runs), `effect.py` (predicted rates), `union.py` (the union of the class). |
