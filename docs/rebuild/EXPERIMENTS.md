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
