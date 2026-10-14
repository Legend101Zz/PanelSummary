# PanelSummary v0.3: build plan

This file is the plan of the v0.3 build. The orchestrator (Claude Opus 5.5) keeps it up to date.
The workers are Claude Sonnet agents in workflows. Tracker issue: "v0.3 build" (it links every v0.3 issue).

v0.3 has one goal:

> Make the manga better on books nobody tuned on. Measure it on sealed hold-out books against v0.2.0 with the
> same judge panel. Do not lose v0.2 on the tuning books. Then finish the open product and UI work.

v0.3 is judged by one journey, observed for real:

```text
take a PDF the pipeline has never seen (a sealed hold-out)
   ↓
Add a book → the estimate → Generate manga → the run card tells the truth
   ↓
Start reading → are the cast, the places and the key props the book's own
               (not a human boy for an elephant, not a modern room for a cave, nobody cropped out)?
   ↓
is it better than v0.2.0 on the same book, judged by the same panel?
```

Goal: every v0.3 issue closed (done, or moved to v0.4 with a written reason and evidence),
`release/v0.3` merged into `main`, tag `v0.3.0` with release notes.

## 1. Owner decisions (2026-10-14)

| Question | Decision |
|---|---|
| Live spend | Cap $50. At most about 12 full runs in any 5 hours (MiniMax token plan). The baselines and the final journey use the build's own stacks on other ports, not the owner's app. |
| Continue with the next section (#80) | Build it after the quality tracks. It is first on the cut list. |
| Deploy (#86) | No deploy. GitHub release and local `./start.sh`. |
| Open owner questions (#94) | Apply the defaults written in the issue. |
| Model policy D13 | Stays, unless an A/B run says otherwise. |
| Design | Finished in v0.2 (`docs/design/`). The dark tone strip is done (PR #91). |

The owner's v0.2.0 app (worktree `v020-app`, ports 3100, 8000, 8788 and 27018) was not running at the start
of the build. The build does not start, stop or use it.

## 2. Book classes (#96)

Every quality claim of v0.3 is measured on books that no implementer saw. See `HOLDOUT.md`.

| Class | Books | Rule |
|---|---|---|
| Tuning | the two Wilde books, Andersen, *Just So Stories*, *Civil Disobedience* | Implementers may read them, look at their pages and tune on them. |
| Seen | *Self-Reliance*, the owner's private PDF of *Who Moved My Cheese?* | Judged before. Issues may cite them. No vocabulary or rule for one book. The Cheese PDF stays on the owner's SSD and runs only locally. |
| Sealed | two fiction books and one nonfiction book, chosen at the start | Only the orchestrator and the gate judges see them before Gate 2. `HOLDOUT.md` holds their hashes now and their titles after Gate 2. |

## 3. Tracks

Each track works in its own worktree on the SSD (`/Volumes/Mrigesh SSD/Book-Reel-worktrees/v03-<track>`),
on its own branch (`v03/<track>`), with its own ports and database. A track lands by a pull request into
`release/v0.3` with green CI and an independent review. Only the orchestrator merges.

| Track | Issues | Owned paths | Depends on |
|---|---|---|---|
| E0 evaluation tools | #92 | `scripts/acceptance/judge/**`, `scripts/acceptance/README.md`, `docs/launch/EVAL.md` | — (merged, PR #100) |
| O1 ops | #88, #84, #85 | `backend/app/preflight.py`, `backend/tests/test_preflight.py`, `docs/v0.3/O1-ops.md` | — (PR #101) |
| D1a drawing: renderer | #81 | `packages/manga-render/src/{rig,props,env,lettering}/**`, `contracts.ts` (enum values, `look.scale`, `PropSpec.label`), `catalog.ts`, `capabilities.ts`, `render.ts`, `validate/{look,page}.ts`, `scene/*` except the camera push code, `packages/manga-render/test/**` | — |
| D1b drawing: understanding and page writer | #81 | `apps/agent-worker/src/goals/{book-understanding,vocabulary,book-input}.ts`, the prop-trigger parts of `repair-once.ts`, `skills/book-understanding/**`, one new section of `skills/manga-page/SKILL.md`, `contracts.ts` (only `fit`, `wanted`, `unmapped`), `validate/book.ts`, the backend pass-through, `frontend/components/book/ContentsAbout.tsx` | contract with D1a (§4.1) |
| D2 camera push | #90 | `packages/manga-render/src/scene/compose.ts`: the two camera pushes, `fitHeads`, `clamp`, the `FIGURE_*` and `SPEAKER_TOO_SMALL` checks; `test/push-bounds.test.ts` | — |
| W1 writer | #82, #83, #87 | `apps/agent-worker/src/goals/**` except D1b's files, `skills/{adaptation-plan,manga-page,manga-page-review}/**` except D1b's section, the minor-speaker names in `frontend/components/reader/{SourceDrawer.tsx,transcript.ts}` | — |
| U1 UI | #89, #93, #94 (UI defaults) | `frontend/**` except the reader (only #93 item 1), `ContentsAbout.tsx` (D1b) and the Sources drawer (W1); owns `frontend/lib/words.ts` | O1 (estimate copy) |
| M1 continue with the next section | #80 | backend scope and understanding storage, the understanding input, the book page control | Gate 1 (Wave 2) |

Shared files with an owner and an append rule:
- `packages/manga-render/src/contracts.ts`: D1a owns it. D1b adds only the optional `fit`, `wanted` and `unmapped` types.
- `packages/manga-render/src/scene/compose.ts`: D1a owns it, except the camera push and clip-check code (D2).
- `apps/agent-worker/src/skills/manga-page/SKILL.md`: W1 owns it. D1b adds one section "When no item fits" and edits the prop list lines.
- `frontend/lib/words.ts`: U1 owns it. Other tracks append new exports at the end.
- `docs/decisions.md`: each track appends its own entries: D1a D29, D1b D30, D2 D31, W1 D32–D34, O1 D35–D36, U1 D37, M1 D38–D39.
- `RENDERER_VERSION`: D1a sets 0.7.0, D2 sets 0.6.1. The orchestrator sets the final value at the merge.

## 4. Contracts

### 4.1 Stand-ins for things outside the vocabulary (D1a and D1b, #81)

The diagnosis (`docs/v0.3/D1-diagnosis.md`) found that 85% of the wrong cast, places and props have no item in the
closed vocabulary (class V). The model must choose a nearest item, and nothing records that it is a stand-in.
v0.3 adds neutral stand-ins by body plan, kind of place and shape, and a report of what could not be mapped. No item is
added for one book.

| Part | Names (fixed) |
|---|---|
| Archetype animals (body plans) | `animal` species `quad_small`, `quad_medium`, `quad_large`, `long_low`, `swimmer`; `bird` species `bird_tall`. One flat tone, no species marks, the usual faces and poses. The renderer draws the cast name as a name tag in the first panel of each page where an archetype appears. |
| Size | `look.scale` (optional, any kind): size relative to an adult human, 0.05–4.0 (`LOOK_SCALE_RANGE` outside). Absent: the size does not change. |
| Generic backdrops (kinds of place) | `generic_room`, `generic_hall`, `generic_passage`, `generic_rough`, `generic_outdoor`. No fixed furniture. They draw the location's `features`. |
| Neutral props (shapes) | `thing_long`, `thing_round`, `thing_block`, `thing_flat`, `thing_heap`, and `PropSpec.label` (at most 24 characters). Warning `NEUTRAL_PROP_UNLABELLED`. |
| The understanding's report | `cast[].fit` and `locations[].fit` (`exact`, `near`, `none`), `wanted` (the book's words, at most 40 characters), top-level `unmapped [{type, ref?, wanted, used}]`. Additive: the schema stays `book-understanding.v1`. Error `FIT_WANTED_MISSING`; warning `ARCHETYPE_WITHOUT_FIT`. |
| The reader | "About this adaptation" lists the stand-ins. |
| Independent fixes | "blade" is no longer a sword trigger and a hyphenated word stays whole; `abstract` draws its features; "small" comes from the nominal height, not the kind; a rodent's sit pose; the receipt note records the first rejected value. |

### 4.2 The camera push (D2, #90)

The diagnosis (`docs/v0.3/D2-diagnosis.md`) found that the crops come mostly from the older speaker-readability push
(push A), which has no bound, and not from the v0.2 size-floor push (push B). Both pushes use one bounded search: a
push keeps the head of every planned figure (speakers, the hero and every other planned figure of the panel) inside the
panel, or it does not push. A planned figure is never "cropped on purpose". New warning `FIGURE_HEAD_PARTLY_CLIPPED`
(less than 60% of the head inside), calibrated before it can become an error. `SPEAKER_TOO_SMALL` stays an error;
figures move closer before the push so that a bounded push reaches the speaker size.

### 4.3 Test hooks and the reader

The test hooks of `docs/design/SCREENS-AND-STATES.md` §0 stay exactly. The reader keeps its look and its tokens. Only
#93 item 1 (the first view at 1440×900) may change it, and the minor-speaker names (#87) replace "Someone" in the
Sources drawer. The generated page SVG is never restyled.

## 5. Ports and databases

Every agent that runs a stack uses its own ports and database name. Never use `:3000`, `:3100`, `:8000`,
`:8788` or `:27018`.

| Agent | Web | API | Worker | Mongo | Database |
|---|---|---|---|---|---|
| p0-verify | 3200 | 8100 | 8790 | 27019 | `v03_p0` |
| d1 / d1 review | 3210 / 3215 | 8110 / 8115 | 8810 / 8815 | 27110 / 27115 | `v03_d1` / `v03_d1r` |
| d2 / d2 review | 3220 / 3225 | 8120 / 8125 | 8820 / 8825 | 27120 / 27125 | `v03_d2` / `v03_d2r` |
| w1 / w1 review | 3230 / 3235 | 8130 / 8135 | 8830 / 8835 | 27130 / 27135 | `v03_w1` / `v03_w1r` |
| u1 / u1 review | 3240 / 3245 | 8140 / 8145 | 8840 / 8845 | 27140 / 27145 | `v03_u1` / `v03_u1r` |
| o1 / o1 review | 3250 / 3255 | 8150 / 8155 | 8850 / 8855 | 27150 / 27155 | `v03_o1` / `v03_o1r` |
| m1 / m1 review | 3260 / 3265 | 8160 / 8165 | 8860 / 8865 | 27160 / 27165 | `v03_m1` / `v03_m1r` |
| v0.3 gate runs (local) | 3280 | 8180 | 8880 | 27180 | `v03_gate_<n>` |
| v0.2.0 baseline runs (local) | 3290 | 8190 | 8890 | 27190 | `v03_base_<n>` |

## 6. Gates

**Gate 1 (tuning books only), about 6 hours into the build.** One live run of the two-tale Wilde book and one of
*Just So Stories* with D1, D2 and W1 merged, judged by the panel.
- *Just So* improves on its own failures: key prop not drawn (v0.2: 0.73, 0.86, 0.64), wrong setting (0.18, 0.15,
  0.11) and hero a speck or cropped (0.60, 0.72, 0.61).
- The two-tale book does not fall below v0.2.0 (mean 3.60, 6/22 at the strict bar) by more than the run spread.
- Regressions become the Wave 2 fix list.

**Gate 2 (the v0.3 claim): sealed and seen books.** The v0.3 candidate on each sealed book (two runs where the
budget allows), on *Self-Reliance* and on the Cheese PDF (local only), judged by the same panel, against the v0.2.0
baselines of Phase 0. Pass bar:
- On the two sealed fiction books together, the mean is higher than v0.2.0 by more than the run spread (at least
  +0.08), and more pages pass the strict bar.
- Key prop not drawn, wrong setting and figure clipped (the classifier kind "hero a speck or cropped", and the
  structural `FIGURE_CLIPPED` count) are each down by at least a quarter.
- No criterion is more than 0.2 below v0.2.0.
- On the 68-page tuning book the mean is not below 3.50 and the strict count not below 16/61.
- Zero image-model egress. Every failure is visible.

If Gate 2 does not pass, the build says so plainly: one more fix cycle if 2 hours or more remain, or the release
states the numbers honestly and the owner decides.

**Release gate (all must hold to merge `release/v0.3` into `main` and tag `v0.3.0`):**
1. CI green on the final `release/v0.3` head.
2. Gate 2 reported against v0.2.0 with the same panel (the pass bar, or an honest statement; then the owner decides
   before the tag). The tuning-book guard holds.
3. The final journey observed end to end in a real browser, on a fresh database and a sealed PDF, with the
   architecture and egress evidence.
4. UI changes compared at 1440 and 390 in both themes; impeccable clean or each finding justified; the reader
   unchanged except the listed items.
5. Every v0.3 issue closed or moved to v0.4 with a reason; release notes published; spend inside the cap; the Cheese
   PDF and the owner's app untouched.

## 7. Live runs and spend ledger

Live runs on the tuning books go to GitHub Actions (`gh workflow run live-journey.yml --ref <branch> -f book=<book>`),
one at a time. The sealed books, *Self-Reliance* for the gate and the Cheese PDF run only on a local stack. The cost
is the run's own estimate at MiniMax-M3 rates (`totals.cost_usd`), not a bill.

| # | Started (UTC) | Run | Code | Book | Purpose | Pages and time | Estimated cost | Result |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-10-14 ~12:40 | local (v03-base020, 3290) | tag v0.2.0 @ 39324cf | *Jataka Tales* (sealed f1) | v0.2.0 baseline, run 1 | 34/34, 0 failed; first page 428 s, all 799 s; 36 calls | $1.06 | journey PASSED; egress api.minimax.io only |
| 2 | 2026-10-14 ~12:55 | local | tag v0.2.0 | *Indian Why Stories* (sealed f2) | v0.2.0 baseline, run 1 | 41/41, 0 failed; first page 421 s, all 869 s; 43 calls | $1.19 | journey PASSED; egress api.minimax.io only |
| 3 | 2026-10-14 ~13:15 | local | tag v0.2.0 | *On a Piece of Chalk* (sealed n1) | v0.2.0 baseline, run 1 | 33/33, 0 failed; first page 267 s, all 575 s; 35 calls | $0.76 | journey PASSED |
| 4 | 2026-10-14 ~13:30 | local | tag v0.2.0 | *Jataka Tales* (sealed f1) | v0.2.0 baseline, run 2 | 28/28, 0 failed; first page 566 s, all 978 s; 30 calls | $1.12 | journey PASSED |
| 5 | 2026-10-14 ~13:47 | local | tag v0.2.0 | *Indian Why Stories* (sealed f2) | v0.2.0 baseline, run 2 | 36/36, 0 failed; first page 267 s, all 605 s; 38 calls | $0.90 | journey PASSED |
| 6 | 2026-10-14 ~14:00 | local | tag v0.2.0 | *On a Piece of Chalk* (sealed n1) | v0.2.0 baseline, run 2 | 28/28, 0 failed; first page 139 s, all 609 s; 31 calls (1 failed call) | $0.73 | journey PASSED |
| 7 | 2026-10-14 14:04 | local (v03-gate, 3280) | release/v0.3 @ b02bc17 | just-so-three-tales, section 1 | M1 live: part 1 | 9/9, 0 failed; about 3 min 20 s; 11 calls | $0.24 | complete |
| 8 | 2026-10-14 14:08 | local | release/v0.3 @ b02bc17 | just-so-three-tales, section 2, continue_from part 1 | M1 live: part 2 | 0 pages; understanding failed after 2 attempts (PLACE_UNITS_INVALID on the merged prior locations) | $0.10 | FAILED: M1 bug, fix track m1fix |
| 9 | 2026-10-14 14:02 | GH 38576965161 | release/v0.3 @ b02bc17 | happy-prince-two-tales | GATE 1 (tuning) | 22/22, 0 failed; first page 179 s, all 483 s; 24 calls | $0.71 | journey PASSED; judged: mean 3.53, strict 4/22 (v0.2: 3.60, 6/22) |
| 10 | 2026-10-14 14:12 | GH 38577002483 | release/v0.3 @ b02bc17 | just-so-three-tales | GATE 1 (tuning) | 18 of 35 drawn; edition FAILED: MiniMax overloaded (2064/529) from page 20; page 9 submit limit (lettering) | $0.74 | provider outage: re-run later |
| 11 | 2026-10-14 14:26 | local (v03-gate, 3280) | release/v0.3 @ 6fdb036 | just-so-three-tales, section 2 (resume of #8) | M1 live: part 2 after the fix (#111) | 10/10, 0 failed; about 7 min 47 s; 12 calls | $0.27 | complete; prior cast 9/9 and places 3/3 kept equal; 7 new cast, 3 new places; first_page_number 10 |
| 12 | 2026-10-14 15:00 | GH 38585510402 | release/v0.3 @ 839d032 | happy-prince-two-tales | GATE 1b (tuning, after Wave 2) | 22/22, 0 failed; first page 245 s, all 676 s; 26 calls (2 failed, retried) | $1.03 | journey PASSED |
| 13 | 2026-10-14 15:12 | GH 38585554450 | release/v0.3 @ 839d032 | just-so-three-tales | GATE 1b (tuning, after Wave 2) | 35/35, 0 failed; first page 153 s, all 456 s; 37 calls | $0.94 | journey PASSED |
| 14 | 2026-10-14 ~16:00 | local (v03-gate, 3280) | release/v0.3 @ f58801b | *Jataka Tales* (sealed f1) | GATE 2a, v0.3 candidate 1, run 1 | 28/28, 0 failed; first page 463 s, all 857 s; 31 calls (1 failed, retried) | $1.18 | judged: mean 3.59 (v0.2.0 3.44-3.48) |
| 15 | 2026-10-14 ~16:16 | local | release/v0.3 @ f58801b | *Indian Why Stories* (sealed f2) | GATE 2a, candidate 1, run 1 | 41/41, 0 failed; first page 309 s, all 679 s; 43 calls | $1.13 | judged: mean 3.43 (v0.2.0 3.44) |
| 16 | 2026-10-14 ~16:30 | local | release/v0.3 @ f58801b | *On a Piece of Chalk* (sealed n1) | GATE 2a, candidate 1, run 1 | 31/31, 0 failed; first page 156 s, all 473 s; 33 calls | $0.89 | judged: mean 3.37 (v0.2.0 3.35-3.49) |
| 17 | 2026-10-14 17:32 | local (v03-fj, 3285) | release/v0.3 @ 45ab575 | *Jataka Tales* (sealed f1) | FINAL JOURNEY attempt 1 (UI, headed Chrome) | 11 of 38; edition FAILED at 17:43: MiniMax token plan limit (2062) | $0.52 | stopped by the provider; redo after the reset |
| 18 | 2026-10-14 17:32 | local (v03-gate, 3280) | release/v0.3 @ 45ab575 | *Indian Why Stories* (sealed f2) | GATE 2b run 2 | 14 of 40; FAILED: token plan limit (2062) | $0.47 | stopped by the provider |
| 19 | 2026-10-14 17:35 | GH 38607407443 | release/v0.3 @ 45ab575 | happy-prince-and-other-tales (68 pp) | GATE 2 tuning guard | 11 of 62; FAILED: token plan limit (2062) | $0.53 | stopped by the provider |
| 20 | 2026-10-14 17:40 | local | release/v0.3 @ 45ab575 | *On a Piece of Chalk* (sealed n1) | GATE 2b run 2 | 6 of 31; FAILED: token plan limit (2062) | $0.22 | stopped by the provider |
| 21 | 2026-10-14 17:42 | GH 38607551249 | release/v0.3 @ 45ab575 | self-reliance | GATE 2 seen book | 1 of 38; FAILED: token plan limit (2062) | $0.09 | stopped by the provider |
| 22 | 2026-10-14 17:45 | local | release/v0.3 @ 45ab575 | Cheese (private, local) | GATE 2 seen book | 0 pages; the run was stopped by the orchestrator in understanding (token plan limit) | ~$0 | not counted |
| 23 | 2026-10-14 18:32 | GH 38616099546 | release/v0.3 @ 26dfd3b | happy-prince-and-other-tales (68 pp) | GATE 2 tuning guard (also the quota probe) | 61/61, 0 failed; first page 296 s, all 789 s; 63 calls | $1.98 | journey PASSED |
| 24 | 2026-10-14 18:47 | local (v03-fj, 3285) | release/v0.3 @ 26dfd3b | *Jataka Tales* (sealed f1) | FINAL JOURNEY attempt 2 (UI, headed Chrome) | 18 of 28; stopped at ~19:00: MiniMax token plan limit (2056/429) | $0.66 | journey Q1-Q3 PASS, Q4 PARTIAL; edition resumable |
| 25 | 2026-10-14 19:03 | local (v03-gate, 3280) | release/v0.3 @ 26dfd3b | *Indian Why Stories* (sealed f2) | GATE 2b run 2 (retry) | 0 pages (understanding blocked by the limit); stopped by the orchestrator | ~$0 | resumable |

Running total: about $17.46 of $50 (sum of the run estimates at MiniMax-M3 rates, not a bill) over 25 paid run starts. The binding limit was the MiniMax token plan, not the dollar cap: it stopped 7 runs (rows 17–22, 24–25).

## 8. Cut list (drop in this order if the build is late)

1. #80 continue with the next section.
2. #86 (no deploy: already the decision).
3. #84 wall-clock limit for a failing attempt.
4. #93 items 2 and 6.
5. #88 estimates.
6. #87 continuity follow-ups.
7. #83 fidelity labels.
8. The second run per sealed book (keep one).
9. #82 page turn (keep D1 and D2).

The sealed gate, the final journey and honest reporting are never cut.

## 9. Status log

| Time (UTC) | Event |
|---|---|
| 2026-10-14 12:14 | Build started. Phase 0 workflows: verify `release/v0.3` (`185526a`), choose the sealed books, prepare the v0.2.0 baseline worktree, diagnose #81 and #90, move the evaluation tools into the repository (#92). |
| 2026-10-14 12:21 | Owner answers: $50 cap with own stacks; #80 after the quality tracks; no deploy; #94 defaults. |
| 2026-10-14 12:24 | PR #100 (#92, evaluation tools) reviewed: APPROVE. The rule table is pinned by its SHA-256. |
| 2026-10-14 12:31 | PR #100 merged (`6112a55`). |
| 2026-10-14 12:37 | Phase 0 results: `release/v0.3` offline checks all green (backend 99, worker 191, runtime 32, renderer 772, frontend 119, judge 9) and the replay journey 62/62 with the browser host check; the sealed books chosen and built (`HOLDOUT.md`); the v0.2.0 worktree ready; diagnoses of #81 (`D1-diagnosis.md`) and #90 (`D2-diagnosis.md`). |
| 2026-10-14 12:39 | The v0.2.0 baseline runs on the sealed books started (local stack, ports 3290/8190/8890/27190), one at a time, each judged by the panel. |
| 2026-10-14 12:44 | Wave 1 started: D1a, D1b, D2, W1, then U1. PR #101 (O1) reviewed: APPROVE; D24 amended for the new draw estimate. |
| 2026-10-14 12:48 | PR #102 (this plan) opened; tracker issue #103. |
| 2026-10-14 12:52 | PR #101 (O1) merged (`264f655`); PR #102 (plan) merged (`1ae58d9`). |
| 2026-10-14 13:00–13:24 | PR #105 (D2) merged (`9312d14`). PR #104 (D1b) merged (`66a8be9`) after the orchestrator replaced tuning- and seen-book examples in the model-facing skill text with neutral ones. PR #106 (W1) merged (`98e6b8b`); `manga-page` skill 1.13.0, skill-size limit 1.42. |
| 2026-10-14 13:35 | PR #107 (U1) merged (`df843ae`). Process-safety incident: the U1 implementer ran `pkill -f xxxx` (a forbidden command; it matched no process; the owner's Hermes bridge was alive). A sweep of every agent transcript found no other forbidden call. |
| 2026-10-14 13:53 | PR #109 (M1, #80) merged (`f87d26e`). |
| 2026-10-14 14:02 | PR #108 (D1a, renderer 0.7.0) merged (`b02bc17`) after two extra review rounds on the archetype shapes (the first versions read as a bear, then as a wolf). Gate 1 dispatched on `b02bc17`: live runs 38576965161 (two-tale book) and 38577002483 (*Just So*). The M1 live measurement started (local). |
| 2026-10-14 14:10 | Decisions D29–D39 sorted above "Superseded"; D31 accepted: the residual `SPEAKER_TOO_SMALL` stays an error, measured at the gates. |
| 2026-10-14 14:12–14:30 | Gate 1 (first pass): two-tale 3.53 (v0.2 3.60), continuity −0.26; *Just So* stopped at page 20 on a MiniMax outage (2064/529). The M1 live run found a continuation bug (`PLACE_UNITS_INVALID` on merged prior places); fixed in PR #111 and the resumed part 2 completed (10/10). |
| 2026-10-14 14:35–15:00 | Wave 2 from the Gate 1 analysis: PR #112 (writer: scale rule, `CROWD_STAND_IN`, hooks where the story has one, the previous page's planned hook as data), #113 (renderer 0.7.1: `scale` only on stand-ins and tiny people, labels only on neutral props), #114 (renderer 0.7.2: archetype body marks). |
| 2026-10-14 15:00–15:40 | Gate 1b on `839d032`: *Just So* 3.46 (v0.2 3.40–3.44), strict 4; two-tale 3.43 (v0.2 3.60). Analysis: the two-tale drop came mostly from that run's plan (77 claims, 3 claims on 19 of 22 pages), not from the Wave 2 code. PR #115 (polish, version 0.3.0), #116 (plan density and plan places warnings; nothing passed D26 to become an error). |
| 2026-10-14 16:00–16:48 | Gate 2a on `f58801b`: one v0.3 run per sealed book, judged. Fiction pooled +0.04 mean, key prop not drawn −21%, wrong setting −26%, hero a speck or cropped flat. The pass bar was not met on this candidate. |
| 2026-10-14 16:55–17:31 | Fix cycle from tuning data only: PR #117 (`FIGURE_TOO_SMALL` in `repair_once`, D26: E 53, P 83%, L +27, C 9%). Final code `45ab575`. Gate 2b started: sealed f2 and n1 second runs, the Cheese PDF (local), the 68-page tuning guard and *Self-Reliance* (CI), and the final journey on sealed f1 through the UI. |
| 2026-10-14 17:32–17:45 | Gate 2b and the final journey started on `45ab575`; the MiniMax token plan limit (2062) stopped every run in flight at 17:40. PR #118 (the v0.3 runs in the estimate fit) merged (`26dfd3b`). |
| 2026-10-14 18:32–19:05 | The plan came back: the 68-page guard completed (61/61; mean 3.54, strict 9/61). The final journey attempt 2 drew 18 of 28 pages before the limit (2056) stopped it again; questions 1–3 PASS, question 4 PARTIAL. |
| 2026-10-14 19:25 | The owner decided: release v0.3.0 with the Gate 2 result stated plainly; resume the final journey first (tag with the partial journey if the plan stays blocked past about 22:30 UTC); v0.4 paces paid runs (≤ 6–8 per 5-hour window). v0.4 issues #120–#130 opened. |
| 2026-10-14 19:30 | A resume of the final journey through the UI was refused by the plan limit on its first call (no cost). PR #119 (the sealed books into `scripts/acceptance/books/`, titles in `HOLDOUT.md`) merged (`935fc79`). |
