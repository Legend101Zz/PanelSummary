# v0.3 sealed hold-out books (#96)

This file is the commitment for the sealed hold-out books of the v0.3 build. The books measure whether v0.3 draws
better on books that nobody tuned on (`docs/v0.3/PLAN.md` §2).

## 1. Why the titles are not here yet

Implementers and reviewers read `docs/v0.3/`. If the titles were here, a track could add an item for one of the
books, and the measurement would be wrong. So this file holds a hash commitment now: the SHA-256 of each PDF, its
size, its page and word counts and its class. The titles, the sources and the public-domain notice are added here
after Gate 2, and the PDFs then go into `scripts/acceptance/books/` (they become seen books for v0.4). Anybody can
then verify that the published PDFs are the files that were chosen at the start.

One agent chose and built the books at the start of the build (2026-10-14, 12:17–12:37 UTC) from Project Gutenberg
texts, with `scripts/acceptance/books/build_pdfs.py`. The orchestrator verified the hashes. Only the orchestrator and
the gate judges see the books before Gate 2.

## 2. The commitment

| File | Class | SHA-256 | Bytes | PDF pages | Words (app count) | Sections |
|---|---|---|---|---|---|---|
| `sealed-f1.pdf` | fiction | `aa4d5f953d0abf2aa45c01fc0d7e5d00576752cfa98dcc1d0f5466840d0ec9df` | 328,643 | 39 | 7,306 | 13 |
| `sealed-f2.pdf` | fiction | `ef83b961736d9b610c0509aad86399f889b9ede5551e28bdea9643c3005589d2` | 436,310 | 45 | 10,767 | 8 |
| `sealed-n1.pdf` | nonfiction | `f12ae5282008dfed1b77999a68d25c65a986f3de022f84b68bac6ac9eff1b4fd` | 390,747 | 34 | 8,699 | 3 |

The selection rule (#96): two public-domain fiction books whose cast and places are outside the v0.2 drawing
vocabulary (animals, places before modern times or outside Europe), and one nonfiction book. Each is inside the app's
limits (at most 75 PDF pages and 17,500 words). The authors of the tuning and seen books are excluded.

## 3. The protocol

- The same 3-judge Sonnet panel and the run-8 rubric (`docs/launch/EVAL.md`).
- v0.2.0 (tag `v0.2.0`) and the v0.3 candidate run on the same books, on a local stack with the real worker, in
  the same build.
- Two runs per version per book where the budget allows.
- A failed page counts as 0.
- The report per book: the mean with the spread between runs, the pages at the strict ship bar, continuity, and the
  defect rates (key prop not drawn, wrong setting, hero a speck or cropped, tail at the wrong figure, label clutter,
  repeated panels). `scripts/acceptance/judge/compare_runs.py` makes the table.

The results are in `docs/v0.3/GATES.md` after Gate 2.
