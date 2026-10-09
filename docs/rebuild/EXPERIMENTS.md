# MiniMax experiments (2026-09-25)

Every call went through the application harness: `apps/agent-worker` goal definitions →
`packages/agent-runtime` sealed Pi session (pinned 0.80.10) → MiniMax anthropic lane.
Runner: `apps/agent-worker/scripts/experiment.ts` (in-process, same code path as the
HTTP worker). Artifacts, traces and rendered PNGs:
`/Volumes/Mrigesh SSD/Book-Reel-scratch/experiments/` (outside the repo).
Cost is the Pi catalog estimate (M3 $0.30/$1.20 per M in/out; M2.7-highspeed
$0.60/$2.40), not a bill. No image-generation model was called: egress files list only
`api.minimax.io/anthropic/v1/messages`.

Test books (public domain): *The Happy Prince and Other Tales* (fiction, 16,159 words,
5 sections, 35 units) and *On the Duty of Civil Disobedience* (nonfiction, 9,339 words,
3 parts, 20 units).

## 1. Book understanding — M3 vs M2.7-highspeed (thinking low)

| Run | Result | Latency | Tokens in / out (cache r/w) | Cost | Submits | Output |
|---|---|---|---|---|---|---|
| fiction M3 | accepted | 360 s | 75,406 / 63,651 (23,825/0) | $0.100 | 2 | 24 cast, 12 locations, 49 claims (40 core) |
| fiction M2.7-hs | accepted | 404 s | 82,114 / 31,592 (4,660/22,031) | $0.134 | 3 | 22 cast, 11 locations, 41 claims |
| nonfiction M3 | accepted | 157 s | 14,264 / 53,822 | $0.069 | 1 | 11 cast (incl. crowds, the State emblem), 42 claims |
| nonfiction M2.7-hs | accepted | 169 s | 19,915 / 13,338 (1,614/14,158) | $0.049 | 2 | 5 cast, 44 claims |

Quality: M2.7-hs cast the Happy Prince statue as a `candle` object and the Selfish Giant
as an ordinary adult; M3 drew the Prince as a tall gilded (`material: gold`) crowned
statue with a sword belt, the Giant at `height: giant` with a long beard, and gave the
nonfiction book a drawable cast (tax-gatherer, fellow prisoner, soldiers, the State).
**Winner: M3.** Known gap: the 24-member cast cap dropped the Reed.

## 2. Adaptation plan — M3 vs M2.7-highspeed (on the M3 understanding)

| Run | Latency | Cost | Pages (budget) | Claims/page | Hooks | Omitted |
|---|---|---|---|---|---|---|
| fiction M3 | 234 s | $0.043 | 37 (25-54, target 37) | 1.32 | 26 | 0 |
| fiction M2.7-hs | 141 s | $0.059 | 36 | 1.39 | 25 | 0 |
| nonfiction M3 | 59 s | $0.032 | 22 (14-31) | 1.91 | 10 | 0 |
| nonfiction M2.7-hs | 52 s | $0.016 | 25 | 1.68 | 15 | 1 |

Both valid on the first or second submission. M3 paces better (one beat per page: the
statue and the Swallow's backstory get separate pages). **Winner: M3** (cost is small).

## 3. Page strategies

Arms on fiction pages 1-6 and nonfiction pages 1-4 (same understanding and plan):

| Arm | Strategy | Book | Pages ok | s/page | $/page | out tok/page | Previews |
|---|---|---|---|---|---|---|---|
| A | per page, M3, vision preview, thinking low | fic / non | 6/6, 4/4 | 142 / 109 | 0.044 / 0.023 | 26,350 / 12,746 | 16 / 9 |
| B | per page, M3, text preview, thinking low | fic / non | 6/6, 4/4 | 133 / 125 | 0.039 / 0.029 | 22,762 / 17,026 | 15 / 6 |
| C | per page, M2.7-highspeed, text preview | fic / non | 6/6, 4/4 | 118 / 86 | 0.062 / 0.038 | 9,064 / 6,156 | 22 / 13 |
| D | one session writes a whole section | fic s1 (9 p) / non s1 (8 p) | 9/9, 8/8 | 69 / 31 | 0.014 / 0.010 | 10,227 / 7,634 | 0 |
| E | per page, M3, thinking medium | fic p3-5 | 3/3 | 110 | 0.032 | 21,617 | — |
| F | per page, M3, thinking off | fic p3-5 | 3/3 | 33 | 0.015 | 6,202 | — |
| R | editor review pass (M3 vision) over B's pages | fic / non | 10/10 | 101 | 0.028 | — | revised 9, approved 1 |

Visual review (side-by-side renders, same pages):

- A ≈ B. Vision previews did not measurably improve staging on this sample (A still put
  the Swallow over the Prince's face on page 3) and cost ~10-15% more.
- C is valid but thinner: page 1 became a single splash with one caption.
- D is 3-4× cheaper per page but clearly worse: fewer panels per page, pages that carry
  less of the book, and confusing two-character extreme close-ups. The fiction section
  used 92,041 of its 100,000 output tokens, so larger sections would truncate; it also
  delays the first readable page to the end of the whole section and turns one failure
  into a lost section.
- E and F ≈ B in quality. F is 3-5× faster and cheaper.
- R made small edits (merged captions, rephrased a thought — once for the worse:
  "Egypt… I am still waited for…"). It could not fix renderer-level problems (lying
  figures framed badly). Not worth doubling page cost.

**Decision so far:** per-page MANGA_PAGE goal on M3 is the production strategy; no
separate review pass; staging problems move into deterministic renderer QA that the page
goal sees in its own validate/preview loop. Thinking level and in-goal vision: see §4.

## 4. Thinking off at scale, and off + vision

| Arm | Strategy | Pages | Result | s/page | $/page | Notes |
|---|---|---|---|---|---|---|
| F | M3, thinking off, text preview | fic 1-9, non 1-4 | 13/13 accepted, 1 submit each | 11-67 (median ~25) | 0.007-0.018 | quality ≈ B on side-by-side review |
| G | M3, thinking off, **vision preview** | fic 1-6 | 6/6 accepted, 1 submit each | 10-53 | 0.007-0.016 | used 1-3 previews per page, driving validation errors to 0 before submitting; page 6 was the best of B/F/G |

Thinking off for the up-front stages (M3):

| Stage | Book | Low (§1-2) | Off | Output |
|---|---|---|---|---|
| understanding | fiction | 360 s, $0.100 | **64 s, $0.021** | 37 cast (now includes the Reed, the three rose-trees, the Dragon-fly), 44 claims |
| understanding | nonfiction | 157 s, $0.069 | **25 s, $0.014** | 19 cast (tax-gatherer, jailer, cellmate, the State, the Law, Conscience, Money), 53 claims |
| plan | fiction | 234 s, $0.043 | **57 s, $0.014** | 40 pages, 1.12 claims/page, 16 hooks |
| plan | nonfiction | 59 s, $0.032 | **42 s, $0.010** | 31 pages, 1.71 claims/page, 11 hooks |

The harness audit had seen M3 skip a required tool call once with thinking off (n=1). In
these 29 thinking-off goals it never did.

## 5. Decision (locked for the product)

- **One harness path, three goals, all MiniMax-M3:** BOOK_UNDERSTANDING (whole book, one
  session) → ADAPTATION_PLAN (one session) → MANGA_PAGE (one session per page, 4 in
  parallel, vision preview on).
- **Thinking off** on first attempts; a retry escalates to **low**. Two attempts per page.
- **No separate review pass** (R did not pay for itself); staging problems are fixed in
  the renderer and surfaced as deterministic warnings/errors inside the page goal.
- **Why not M2.7-highspeed:** weaker understanding (miscast the statue as a candle), thinner
  pages, and not cheaper once repairs and larger inputs are counted.
- **Why not one-pass sections:** lower page quality, later first page, a whole section lost
  per failure, output cap nearly reached (92k/100k).
- Measured cost for the whole fiction test book at this policy ≈ $0.02 + $0.01 +
  40 × ~$0.012 ≈ **$0.52**; time to first page ≈ 2-3 min; whole book ≈ 10 pages/min at
  4 in parallel.

Failure modes seen: none fatal in 60+ goals. Understanding/plan occasionally needed a
second submit after precise validator errors (visible in traces). One review revision made
a line worse. Cast size can exceed the skill's 24 guideline in thinking-off mode (37); the
renderer handles it, but distinctness among many humans is weaker.

## 6. Understanding reliability and the patch tool (2026-09-26)

The acceptance runs showed thinking-off understanding errors that pages cannot recover from
(run 2: the statue cast as a gold `rocket` object; merged characters of different tales;
ducklings as a human crowd). Deterministic guards were added (STATUE_NOT_HUMAN, CAST_SECTIONS,
CROWD_NOT_PEOPLE, GIANT_NOT_GIANT). Fixing a rejection meant re-emitting the whole 40-100k-token
JSON, so fix-ups were slow and hit the submit limit. `revise_understanding` lets the model upsert
only the changed entries.

| Run (fiction book) | Thinking | Tool | Result | Time | Output tokens | Submits / patches |
|---|---|---|---|---|---|---|
| acceptance 3 | low | submit only | correct | 671 s | 103,489 | 2 / – |
| guarded 1 | off | submit only | FAILED (submit limit) | 552 s | 98,916 | 6 / – |
| guarded 2 | off | submit only | correct | 242 s | 41,849 | 3 / – |
| revise off 1 | off | submit + revise | correct | 69 s | 21,098 | 1 / 6 |
| revise off 2 | off | submit + revise | **statue still an object: the model removed the word "statue" from the description to pass the guard** | 67 s | 22,274 | 1 / 2 |
| revise low 1 | low | submit + revise | correct (43 cast, 101 claims) | 269 s | 84,407 | 1 / 2 |

The guard is now sticky per cast id (rewording cannot clear it) and broader (gilded, column,
pedestal). **Decision:** understanding = thinking low + revise (reliable; ~4.5 min); plan and
pages stay thinking off.

## 7. Speakers in the understanding prompt (2026-09-26)

The book's own attributions ("said the Frog") are extracted deterministically
(`apps/agent-worker/src/goals/attribution.ts`: 340 of 499 quoted spans in the fiction book;
1 of 33 in the nonfiction book). As a rejection (error) they made acceptance run 5's
understanding time out. Given up front as a list:

| Run (fiction book, M3 low) | Result | Time | Output tokens | Submits / patches | Cast |
|---|---|---|---|---|---|
| speakers-u1 | accepted | 746 s | 93,649 | 1 / 2 | 43, now including the Frog, the Fire-balloon, the Doctor, the boys, the Professor's daughter; still missing (warnings): God, the Charity Children, the Squib, the Cracker, the Dragon-fly, the Goose |

The Prince stayed a gold statue. Throughput was 126 tokens/s (run 4: 324), so time to first
page depends on MiniMax's speed that hour more than on the prompt.

## Model A/B, 2026-10-09

Question: can `MiniMax-M3.1-Flash-Preview` replace `MiniMax-M3` on a goal without a loss in
judged quality? The book is `happy-prince-two-tales.pdf` (26 PDF pages, 5,794 words, 2 tales).
Understanding is M3 at thinking low in every arm. Three independent Sonnet judges score every
page with the run 8 prompt. "Accepted" is the mean over accepted pages; "all" counts a failed
page as 0.

| Arm (plan / pages) | Pages | Failed | Ship bar | Mean all | Mean accepted | Legibility | Continuity | Fidelity | Generate to page 1 / finished | Cost (Pi est.) |
|---|---|---|---|---|---|---|---|---|---|---|
| M3 / M3, local | 16 | 1 | 2 | 3.31 | 3.53 | 3.60 | 3.04 | 3.29 | 795 s / 2,115 s | $0.81 |
| M3 / M3, CI | 14 | 1 | 3 | 3.20 | 3.45 | 3.46 | 2.95 | 3.36 | 940 s / 1,747 s | $0.60 |
| M3 / Flash, local | 16 | 0 | 2 | 3.40 | 3.40 | 3.31 | 3.04 | 3.08 | 954 s / 1,363 s | $0.53 |
| Flash / Flash, CI | 21 | 0 | 0 | 3.40 | 3.40 | 3.29 | 2.87 | 3.38 | 744 s / 1,087 s | $0.59 |
| Flash / Flash, CI, new code | 22 | 0 | 2 | 3.42 | 3.42 | 3.33 | 3.11 | 3.26 | 1,361 s / 2,094 s | $0.87 |

Findings: Flash plans in 34 to 69 s (M3: 16 to 235 s). Flash pages: median 61 s per page, 18 of
21 accepted at the first submit. Per-page legibility is about 0.2 lower with Flash pages in both
Flash runs. The Flash book-level mean is higher because no page failed. Flash failed the
understanding goal 3 of 3 (the statue guard never cleared). **Decision (D13):** understanding on
M3; plan and pages on Flash; retries at `medium`; M3 is the fallback. Evidence, configs and
commits: `docs/launch/MODEL-AB.md`. Limit: one or two runs per arm; Gate 2 checks it again.


## Understanding A/B, 2026-10-09 (after the statue-guard fix)

The understanding moved from MiniMax-M3 to MiniMax-M3.1-Flash-Preview. On the same code and the 26-page
book, M3 gave 6 of 22 pages at the ship bar and a mean of 3.53, Flash 4 of 22 and 3.49; on tale 1 of
the 68-page book Flash gave 3.53 against 3.40. Flash was 2.5 to 6 times faster (132 s against 801 s;
221 s against 545 s) and passed on the first attempt in 4 of 4 runs. The earlier 3 of 3 Flash failures
came from a wrong statue guard (#33). Details: `docs/launch/MODEL-AB.md`, D13.
