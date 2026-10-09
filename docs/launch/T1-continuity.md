# T1: state continuity, one-line characters, claims fully shown, craft grammar

Track T1 of the v0.1 launch. Branch `t1/continuity-cast`. Base `fd5a326`.
No live model call was made. All numbers below come from offline replays of saved acceptance runs and from unit tests.

Measured on a shared Mac. Load average (`uptime`) when the final checks ran: 10.8 to 15.5 (1, 5 and 15 minute values 10.84, 7.43, 5.32 at the last check). Replay runtimes were a few seconds each and are not a benchmark.

## 1. What run 8 got wrong, and what T1 changes

| Run 8 blocker | Cause found | Change |
|---|---|---|
| The Prince's sapphire eyes return a page after he gave them away. The stripped statue is still gold. | Nothing records WHEN a character changes. The page writer copies the look from the cast and from memory. No check compares look variants across pages. | A: `states` on cast members. The expected look of each cast member on each page is computed in code and handed to the page goal as data. The page check flags a contradicting figure. |
| The little boy of "The Selfish Giant" and the workmen of "The Remarkable Rocket" are not in the cast. | The boy speaks once as "the child". The crowd "The Children" matches that word, so SPEAKER_NOT_IN_CAST sees nobody missing. A workman speaks once as "one of them". Both are below the 5-line error threshold. | B: two new understanding checks for a lone speaker that the cast hides in a group or never names. |
| A death is implied, not said. A sack is never carried. A climax comes before its set-up. | The claim-evidence check counts a `dead` eye state as evidence of death. No check looks at the order of claims. | C: one page check for key events, one page check and one plan check for order. All are warnings. |

## 2. Design

### 2.1 A. State continuity

**Data.** A cast member may carry `states`. It is a list, in source order:

```json
{ "id": "c_prince", "...": "...",
  "states": [
    { "at": "s1u5", "claim": "k14", "set": { "eyes": "one_empty" }, "note": "gives one sapphire to the student" },
    { "at": "s1u6", "claim": "k16", "set": { "eyes": "blind" } },
    { "at": "s1u7", "claim": "k19", "set": { "material": "stone" }, "note": "stripped of gold" } ] }
```

- `at` is the unit where the change happens (the source position). It must be a known unit id.
- `claim` is optional. It is the claim that tells the change. With it, the plan tells code on which PAGE the change happens, which is more exact than a unit. Without it, code uses the units of the page.
- `set` is a **look patch over the base look**: a field name and a string value. The field names are not listed in T1 code. A new renderer field (T2: eyes jewel or empty, gilded or stripped, plant bloom or bare) works with no code change. Each page figure already has a `variant` with the same shape.

**Expected look of one page** (`expectedLooks`, `src/goals/continuity.ts`). Code compares each state with the page:

| The change is... | Meaning | Rule for the figure |
|---|---|---|
| on an earlier page (claim) or before the page's first unit | in force | the variant must equal the patch, in every panel |
| on this page (claim) or inside the page's units | happens on this page | the old or the new value is allowed; the page may not go back after it shows the new value |
| later | not yet | the new value must not show |

If a page has several changes of one field (page 8 of run 8: first eye, then second eye), the allowed values are the old value and each new value in order.

**Hand-over.** `parseInput` of the page goal computes `expected_looks`. The prompt gets a trusted block `<expected_looks>` only when something applies. A book with no `states` gets no extra prompt text (tested).

**Page check.** `FIGURE_STATE_MISMATCH` (`figureStateIssues`). It looks only at fields that the member ever changes. A panel with fx `flashback` is skipped. Its message gives the expected variant, so one repair turn is enough.

**Understanding check** (`stateIssues`):

| Code | Level | Meaning |
|---|---|---|
| STATE_INVALID | error | `at` is not a known unit, `set` is empty or not strings, `states` is not a list |
| STATE_NOT_DRAWABLE | warning | the renderer catalog has no such field or value on that look kind today. Read from `catalog().variants`, so T2 changes are picked up |
| STATE_ORDER | warning | states not in source order (code sorts them) |
| STATE_CLAIM_UNKNOWN | warning | `claim` is not a claim id |
| STATE_DEATH_MISSING | warning | a claim says a person or animal dies, but no state has `eyes: "dead"` |

The understanding prompt gets `trusted_state_fields` (295 bytes: the variant fields per look kind and the eye states) so the model writes only fields the renderer knows.

### 2.2 B. One-line characters

Options studied against run 8:

| Option | Result on run 8 | Decision |
|---|---|---|
| Put ALL named speakers in the precomputed list | Adds 11 one-line speakers: "a sensible mother", "all the courtiers", "a Daisy". None is the child or a workman. The cast limit is 40 and run 8 already has 46 members. | Rejected: noise, and it pushes the cast over the limit. |
| Warning-level SPEAKER_NOT_IN_CAST for one-line speakers | The child is not found at all (the crowd matches). The workman is not found (a pronoun). | Rejected: finds neither. |
| Let the page goal cast a minor figure | Needs a change of the page schema and validator in `packages/manga-render`. | Not done: outside T1 paths. See open problems. |
| Two targeted checks (`loneSpeakers`, `src/goals/attribution.ts`) | Finds exactly the child and the workmen in run 8. 2 hits in run 4, 2 in run 6. | **Chosen.** |

The two checks:

- `SPEAKER_HIDDEN_IN_CROWD`: the book attributes a line to a singular speaker ("answered the child") and every cast member in that section that fits the word is a crowd.
- `SPEAKER_ONE_OF_GROUP`: a line follows "one of them" or "one of the Xs" and no cast member of the section is an X. For "one of them" code takes the last plural noun group in the 700 characters before.

At most **3** hits per book are errors. All others are warnings. This keeps the repair work small (run 5 timed out when every speaker was an error). Errors are cheap to fix: `revise_understanding` with one new cast member. The precomputable half (`one_of_group`) is also given to the model in the first prompt (`lone_speakers_in_source`), so the model usually adds the person at once. Run 8 would get 2 errors; both fall on judged blocker defects (section 4.3).

### 2.3 C. Claims fully shown

| Code | Where | Level | Rule |
|---|---|---|---|
| PLAN_ORDER | plan | warning | A page of a section carries a claim from earlier text than a page before it, and the beat does not say "flashback". |
| CLAIM_ORDER | page | warning | In `claim_map`, the panels of a later claim all come before the first panel of an earlier claim (different units). |
| CLAIM_EVENT_UNSTATED | page | warning | A core or supporting `event` claim is a death or a marriage, and no caption or line says so. A `dead` eye state does not count. |

Not done: a "sack never carried" check. A carried object is a pose or a `holding`, which the existing claim-evidence check counts. No reliable rule was found; see open problems.

### 2.4 D. Craft grammar in the skills (#6)

See section 5 (audit table) and section 6 (size).

## 3. Errors and warnings, and why

| Check | Level | Why |
|---|---|---|
| FIGURE_STATE_MISMATCH | **error** | Calibration (4.1): it flags 4 pages that the judges scored defective (continuity at most 2; pages 8, 9, 10 and 25) and no judged-good page. Two more flagged pages (12 and 13) have continuity 3. The expected look is given in the prompt, so a first draft is usually right. One more guard: flashback panels are skipped. |
| STATE_INVALID | error | Local shape error with a one-line fix. |
| SPEAKER_HIDDEN_IN_CROWD, SPEAKER_ONE_OF_GROUP | error, at most 3 per book | Cheap fix, and the cause of two blocker defects in run 8. |
| CLAIM_EVENT_UNSTATED | warning | Calibration (4.2): it flags page 34 of run 8, which is judged good by scores (mean at least 3.5, no score below 3) although the same judge lists a blocker "never says that Hans drowned". By the rule of the task a check that flags a judged-good page stays a warning. |
| CLAIM_ORDER | warning | Zero hits in the three runs: no evidence at all. |
| PLAN_ORDER | warning | One hit in three runs (4.4). It matches a judged defect, but one hit is too little. |
| STATE_NOT_DRAWABLE, STATE_ORDER, STATE_CLAIM_UNKNOWN, STATE_DEATH_MISSING | warning | Advice. The last one had 4 hits on run 8, 3 of them right (Swallow, Nightingale, Hans) and 1 wrong (the King). |

**Risk of the one new page error.** The states come from the model's understanding. A wrong state makes a page fail until the writer obeys it (the failure would be visible, D11). Hand-made states fit the judges; model-made states are not tested live. The orchestrator can set `FIGURE_STATE_SEVERITY` in `src/goals/manga-page.ts` to `"warning"` with one line if the live journey shows wrong states. Known false positive: run 8 page 13 panel p4 shows the Prince and the Swallow in Paradise, alive. The flag is correct by the rule and wrong for the story. A heaven scene needs the `flashback` fx or a later rule (open problems).

## 4. Calibration

Script: `apps/agent-worker/scripts/calibrate-t1.ts` (`npx tsx scripts/calibrate-t1.ts`). It makes no model call. Input: `/Volumes/Mrigesh SSD/Book-Reel-scratch/acceptance/{run8,run6,run4}`: `understanding.json`, `plan.json`, `units.json`, `judge/page-NN.json`, `judge-scores.json`.

Definitions:
- **Judged good**: the page ships, or its mean is at least 3.5 with no score below 3. Run 8: 13 of 46 pages (5 ship). Run 6: 10 of 56 (4 ship). Run 4: 12 of 58 (9 ship).
- **Judged defective for a check**: a major or blocker defect whose text matches the check's words, or (state check) continuity at most 2. The word lists are in the script.
- A check is an error only if it flags judged-defective pages and flags no judged-good page.

### 4.1 State check on run 8 (hand-made state table)

Run 8's understanding has no state data. The table is in `test/fixtures/run8-states.ts`: the Prince (one eye given at s1u5 with claim k14, blind at s1u6 with k16, stone at s1u7 with k19), and `eyes: dead` for the Swallow (k21), the Nightingale (k36), the Giant (k48) and Hans (k58). The value `one_empty` stands for "one eye given"; the renderer has no such eye state yet.

118 figures belong to these five characters. 39 of them stand on a page where a state is in force or changes. The check made 15 figure-level hits on 6 pages (a figure that acts, such as a sleeping Swallow before it dies, is not a hit):

| Page | Continuity | Fidelity | Judged | Hits | The judges' text |
|---|---|---|---|---|---|
| 8 | 2 | 3 | defective | 1 (p1 Prince: must show one eye gone) | "In p1 the Prince still has two sapphire eyes, one page after giving one to the Student." Found. |
| 9 | 1 | 3 | defective | 5 (all five panels: eyes open, must be blind) | "The Prince has his sapphire eyes back in p2, p3 and p5, one page after he was shown blind." Found (the check also flags p1 and p4). |
| 10 | 1 | 3 | defective | 3 (Prince eyes open on p1, p4, p5; must be blind) | "After being blinded and stripped, the Prince is still gold, with sapphire eyes in p4 and heart eyes in p5." Eyes found. See note below on gold. |
| 12 | 3 | 2 | other | 1 (Swallow's body at the statue's feet is not `dead`) | No judge text. The hit is correct by the story. |
| 13 | 3 | 2 | other | 3 (p4: Prince and Swallow alive in Paradise) | No judge text. Correct by the rule, wrong for a heaven scene (known false positive). |
| 25 | 2 | 2 | defective | 2 (Giant is not `dead` in p4, p5) | Blocker: "The page never says the Giant is dead ... a smiling, closed-eyed face that reads as asleep." Consistent with the hit; the judge names the fault as a missing statement, not as a look. |

Note on page 10: the gold is not flagged. Page 10 carries the claim k19 (stripping), so on page 10 the Prince may be gold or stone ("happens on this page"). The judges' remark on gold (still gold after the stripping) is a within-page failure that this rule cannot see. From page 11 on, the check flags a Prince who is still gold: page 13 p4 shows `material: flesh` (Paradise).

Judged-good pages flagged: **none**. Judged-defective pages flagged: 4 (pages 8, 9, 10 and 25). Pages 12 and 13 are flagged but have no matching judge text (continuity 3).

The check does not find every low continuity score. Run 8 has 24 pages with continuity at most 2. Only 4 of them are flagged. The others have other causes (scale, place, crowds, order, a prop) or involve a character without a state in the hand table. The state check covers only the look of cast members that have states.

Run 6 and run 4: no state table exists, so no state hits are reported.

### 4.2 Key event stated (CLAIM_EVENT_UNSTATED)

| Run | Hits | Pages | Judged |
|---|---|---|---|
| run 8 | 3 | 25 (Giant dead), 34 (Hans drowned), 37 (marriage) | 25: defective (blocker "never says the Giant is dead"). 37: defective ("never stated" marriage). **34: judged good by scores**, but the judge lists a blocker "The page never says that Hans drowned". |
| run 6 | 2 | 16, 23 | both judged defective (continuity 1 and 2) |
| run 4 | 2 | 15, 47 | 15: continuity 2, fidelity 2. 47: fidelity 2 (marriage). |

Every hit but one is on a defective page, and the one other is a page whose own blocker defect names the same fault. Strictly, one judged-good page is flagged, so the level stays a **warning**.

### 4.3 One-line characters

| Run | Hits | What |
|---|---|---|
| run 8 | 2 | `crowd_member`: "the child" in s3 hidden in c_children_s3 (judged blockers on pages 22, 24, 25: "the little boy is not in the cast"). `one_of_group`: "one of the workmen" in s5 (judged blocker on page 42: "the workmen are not in the planned cast"). |
| run 6 | 2 | workmen; "one of the boys" |
| run 4 | 2 | workmen; "one of the boys" |

Two more candidate hits were removed while building the check: "one of the Court" (a false match, now needs a lower-case group noun) and "the other boy" (a pair, now skipped). There is no false positive left in these three runs. Precision was not tested on other books: the three runs are one book.

For the old rule: `speakerCastIssues` on run 8 gives 2 warnings (God, the Goose) and no error. T1 adds 2 errors for the same run.

### 4.4 Order checks

- CLAIM_ORDER: 0 hits in all three runs. Pages 9 and 25 of run 8 have order problems inside one panel or in the layout, which `claim_map` order cannot see.
- PLAN_ORDER: 0 hits in run 8 and run 6; 1 hit in run 4: page 9 carries k15 before k16 on page 8. The judge of run 4 page 9 lists "The Professor of Ornithology narration is out of order: it happened the day after the ruby, before the Student".

### 4.5 Understanding checks on saved understandings

`stateIssues` on the saved run 8 understanding (no states): 4 warnings STATE_DEATH_MISSING (Swallow, Nightingale, Hans, King); with the hand table 1 left (the King, wrong) plus 1 STATE_NOT_DRAWABLE (`one_empty`). Runs 6 and 4: 2 each (Swallow, Nightingale).

## 5. Audit of the craft grammar (#6)

Source: `docs/rebuild/research/craft.md` (a) A1 to A8 and (b) "Rules for the skills". Skills: **U** book-understanding, **A** adaptation-plan, **P** manga-page. "R" means the renderer or a validator does it, not a skill.

| Rule | In which skill | Missing before T1? | After T1 |
|---|---|---|---|
| A1.1 one beat per page | A rule 1, P section 1 | no | |
| A1.2 at most 4 story points | A rule 2 (3 claims), P section 1 | no | |
| A1.3 one moment per panel | P section 2 | no | |
| A1.4 scenes start and end on page boundaries | A rule 6, P section 2 ("new scene, new page") | no | |
| A1.5 panels per page | P section 2 | no | |
| A1.6 action pages need fewer, bigger panels | P section 2 ("more still") | partly: no 3-4 panel number | not changed (small effect) |
| A1.7 one dominant panel | P section 2 | no | |
| A1.8 kishotenketsu | A rule 7, P section 1 | no | |
| A1.9 logline | U | no | |
| A2.2 blockage | P section 2 | no | |
| A2.6 slanted gutters for action only | P section 2 | no | |
| A2.7 speakers left to right | P section 7 | no | |
| A3.1 shot mix (40 to 45 percent close) | P section 3 ("3 shot sizes") | partly | not changed |
| A3.2 reaction panels | P section 3 | no | |
| A3.4 establish with a wide shot and a caption | P sections 3, 9b | no | |
| A3.6 closer as emotion rises | P section 3 | no | |
| A3.7 180-degree rule | P section 3 (also checked: SIDES_SWAPPED) | no | |
| A4 transitions | P section 4 | no | |
| A5.1 to A5.5 words, balloons, punctuation | P section 6 | no | |
| A5.8 captions for place and time | P section 5 | no | |
| A7 SFX, speed lines, focus lines | P sections 7, 9 | no | |
| A8 page turns and hooks | A rule 8, P section 10 | no | |
| A8 **last page of a section: one big panel, then a small reaction panel** | A rule 8 (book's last page only) | **yes, for sections** | **A rule 8 and P section 10, one line each** |
| (b)1 one argument step per page | A rule 10 | no | |
| (b)2 to (b)8 nonfiction rules | A rules 10, P "Nonfiction" | no | |
| Claim parts all reach the reader (rubric: fidelity) | P `claim_map` text | partly: nothing says a death or a gift must be SAID | **P section 5: "Say the key event"** |
| Words and picture agree (run 8 page 22: trees lettered, not drawn) | P section 5 ("delete a caption that restates") | **yes** | **P section 5: "Words and picture agree"** |
| Pages keep the book's order (rubric: reading flow) | A rule 4 (claim after its source page) | partly: no set-up before climax | **A rule 4** |
| Character continuity (rubric: continuity) | P section 8a (read the earlier pages' beats) | weak: relied on the writer's memory | **P section 8a rewritten around `expected_looks`; U `states`** |
| One-line characters (run 8) | U (two or more lines) | **yes** | **U: one person who speaks or acts alone** |

The grammar of A1 to A8 and (b) is already in the skills. T1 adds only the missing rules that touch the 8 rubric criteria (continuity, fidelity, reading flow, page turn). It does not add rules for R-only items.

## 6. Skill size and versions

| Skill | Version | Bytes before | Bytes after | Change |
|---|---|---|---|---|
| manga-page | 1.5.0 to 1.6.0 | 17,816 | 18,383 | +567 (+3.2%) |
| book-understanding | 1.6.0 to 1.7.0 | 10,821 | 11,534 | +713 (+6.6%) |
| adaptation-plan | 1.2.0 to 1.3.0 | 5,857 | 6,081 | +224 (+3.8%) |
| **Total** | | 34,494 | 35,998 | **+1,504 (+4.4%)** |

Prompt data: `trusted_state_fields` +295 bytes on each understanding call; `lone_speakers_in_source` a few lines only for books with a group speaker; `expected_looks` only for a page whose cast has a state in force or changing (about 100 to 250 bytes). Receipts record the new versions and hashes (`loadSkill`).

The section 8a of the page skill got shorter in its old part and longer in its new part: the net growth is the figure above. `manga-page-review` is not used in production and was not changed.

## 7. Tests

`apps/agent-worker/test/continuity.test.ts` (25 tests):
- expected looks by claim page and by unit; one field with two changes on one page; any look field works with no code change;
- figure checks: eyes returning, statue still gold, change shown too early, never going back, acting before any change allowed (asleep is not dead), flashback skipped;
- `states` validation; the page goal rejects a contradicting figure and its prompt carries `expected_looks` (and nothing for a book without states);
- the child hidden in a crowd and the workmen; at most 3 errors; a fixed cast passes;
- plan order (with "flashback"), claim order, key event stated;
- the key rules and the new versions of the three skills; skill growth below 8 percent.

Results on this branch (load average 10.8 at the last run):
- `apps/agent-worker`: `npx tsc --noEmit` clean; `npx vitest run` 3 files, 66 tests pass (41 before T1).
- `packages/manga-render`: tsc clean; 8 files, 606 tests pass. `packages/agent-runtime`: tsc clean; 1 file, 10 tests pass.
- `backend`: `pytest tests -q` against 27018: 15 passed.

Mutation checks in a private `git archive` copy were **not done** (the archive has no installed workspace packages, and the time went to calibration).

## 8. Open problems

1. **Renderer states.** `one eye given` (the Prince after the first sapphire) cannot be drawn: `EYE_STATES` is open, closed, blind, dead. T2 must add a state and say its name; the understanding then uses it (today it only gets STATE_NOT_DRAWABLE, a warning). Also needed: gilded or stripped for the statue as a look field other than `material`, plant bloom or bare, and a gold-leaf prop (run 8 page 10 draws a diamond).
2. **Within-page gold.** On the page where a change happens, either value is allowed, so a statue that stays gold through its own stripping page is not flagged. Fixing it needs panel-level anchors for the change (a panel id in the state), which the plan does not have.
3. **Afterlife and dream scenes.** A scene in Paradise or a dream shows a character in another state (run 8 page 13). Today the writer must use the `flashback` fx or the check fails. A better rule needs a panel flag; that is a renderer and validator change outside T1.
4. **Model-written states are untested live.** Calibration used a hand-made table. The orchestrator should read the states of the first live understanding before trusting the error level (switch: `FIGURE_STATE_SEVERITY`).
5. **A minor figure cast by the page goal** (option 3 of section 2.2) would remove the need for the cast to list every bit player. It changes the page schema in `packages/manga-render`: not done.
6. **"A sack never carried"** has no check. A carried object is a pose or `holding`, and the existing claim-evidence check counts any prop or pose word.
7. **CLAIM_ORDER is blind to layout order and to order inside one panel** (run 8 pages 9 and 25). The BLOCKAGE_LAYOUT warning exists in the renderer; the writer ignored it (run 8 page 25).
8. **Only one book.** All three saved runs come from one book of five tales. Precision of the new checks on other books is unknown.
9. **Cast limit.** Run 8's cast has 46 members, above the skill's limit of 40. T1 adds up to 3 more cast members through the new errors. The skill text and the validator disagree on this limit already; it is not changed here.

## 9. Files

- New: `src/goals/continuity.ts`, `src/goals/claim-shown.ts`, `scripts/calibrate-t1.ts`, `test/continuity.test.ts`, `test/fixtures/run8-states.ts`, this file.
- Changed: `src/goals/{book-understanding,attribution,manga-page,adaptation-plan}.ts`, `src/skills/{book-understanding,manga-page,adaptation-plan}/SKILL.md`.
- Not touched: `vocabulary.ts`, the default-model lines, `server.test.ts`, `goals.test.ts`, the CLAUDE.md "Language" section.
