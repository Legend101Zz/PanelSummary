# v0.3 sealed hold-out books (#96)

This file is the commitment for the sealed hold-out books of the v0.3 build. The books measure whether v0.3 draws
better on books that nobody tuned on (`docs/v0.3/PLAN.md` §2).

## 1. The titles

This commitment was published on 2026-10-14 at 12:48 UTC in PR #102, without the titles. The titles are revealed at
the v0.3 release. The three PDFs are now in `scripts/acceptance/books/`. They are seen books for v0.4, and the sources,
the scope and the public-domain notice are in `scripts/acceptance/books/README.md`.

One agent chose and built the books at the start of the build (2026-10-14, 12:17–12:37 UTC) from Project Gutenberg
texts, with `scripts/acceptance/books/build_pdfs.py`. The orchestrator verified the hashes. Only the orchestrator and
the gate judges saw the books before Gate 2.

## 2. The commitment

| File | Class | Title | Author | Gutenberg | Repository file | SHA-256 | Bytes | PDF pages | Words (app count) | Sections |
|---|---|---|---|---|---|---|---|---|---|---|
| `sealed-f1.pdf` | fiction | Thirteen Jataka Tales | Ellen C. Babbitt (1912), retold | #62514 | `scripts/acceptance/books/jataka-tales-thirteen.pdf` | `aa4d5f953d0abf2aa45c01fc0d7e5d00576752cfa98dcc1d0f5466840d0ec9df` | 328,643 | 39 | 7,306 | 13 |
| `sealed-f2.pdf` | fiction | Seven Why Stories and a Trickster Tale (from Indian Why Stories: Sparks from War Eagle's Lodge-Fire) | Frank B. Linderman (1915) | #606 | `scripts/acceptance/books/indian-why-stories-eight.pdf` | `ef83b961736d9b610c0509aad86399f889b9ede5551e28bdea9643c3005589d2` | 436,310 | 45 | 10,767 | 8 |
| `sealed-n1.pdf` | nonfiction | On a Piece of Chalk | Thomas Henry Huxley (1868) | #16729 | `scripts/acceptance/books/on-a-piece-of-chalk.pdf` | `f12ae5282008dfed1b77999a68d25c65a986f3de022f84b68bac6ac9eff1b4fd` | 390,747 | 34 | 8,699 | 3 |

The repository files have exactly these hashes. Checked at the release with
`shasum -a 256 scripts/acceptance/books/{jataka-tales-thirteen,indian-why-stories-eight,on-a-piece-of-chalk}.pdf`.

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
