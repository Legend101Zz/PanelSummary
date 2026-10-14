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

Running total: $0 of $50.

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
