# E1: hold-out books (issue #50)

Two test books that PanelSummary was never tuned on. They measure generalisation in v0.2 evaluation.

## The books

| | Fiction | Nonfiction |
|---|---|---|
| PDF | `scripts/acceptance/books/just-so-three-tales.pdf` | `scripts/acceptance/books/self-reliance.pdf` |
| Text | Rudyard Kipling, "Just So Stories" (1902), three tales | Ralph Waldo Emerson, "Self-Reliance" (1841), from "Essays" (First Series) |
| Project Gutenberg | eBook #2781, https://www.gutenberg.org/ebooks/2781 | eBook #16643, https://www.gutenberg.org/ebooks/16643 |
| Source file | `pg2781.txt` | `pg16643.txt` |
| CI name (`-f book=`) | `just-so-three-tales` | `self-reliance` |

## Why these texts

Proof that they are new. I searched the repo (docs, scripts, README) and `/Volumes/Mrigesh SSD/Book-Reel-scratch/launch` for Kipling, Emerson, "Just So", "Elephant's Child", "Acres of Diamonds" and other candidate authors. The only matches were inside the Next.js build chunks of a scratch copy, which are not book text. The tuning books are the Wilde tales (pg902), Thoreau (pg71) and the Andersen tales used in earlier experiments. No hold-out text or author appears in them.

Fiction. Kipling's tales have few named characters, much dialogue, and clear settings the closed renderer vocabulary can draw: people, animals, a cave, a river bank, a hut, wild woods. Three tales give three separate plots of different length (2,412, 3,145 and 3,862 words). The language is hard on purpose: invented words, a storyteller who speaks to the reader ("O Best Beloved"), repetition as a device. This tests generalisation better than a second Wilde book. I left out the tales with ethnic stereotypes or violence ("How the Leopard Got His Spots", "How the Rhinoceros Got His Skin"). Verse between the tales is removed.

Nonfiction. "Self-Reliance" is an essay of argument, as the Thoreau book is, but with a different voice (aphorism and example, no narrative). It is the right size for one run. Its length (10,031 words) is 31 words over the 10,000 target and well inside the 17,500 word limit. I chose it over the lecture "Acres of Diamonds" (about 15,300 words, too long for the cost target).

Limits of this choice. The nonfiction source has no headings. The essay is split in three equal parts (by paragraph count), as the Thoreau book is. The part titles are `Part One`, `Part Two`, `Part Three`.

## How they are built

`scripts/acceptance/books/build_pdfs.py` has two new functions, `just_so_stories()` and `self_reliance()`. They use the same `render()` as the existing books: A5 page, same CSS, `h1` heading on a new page for each section. The Project Gutenberg header and footer are removed (the START and END markers). A helper `prose_blocks()` removes verse blocks, footnote marks and editor footnotes. The unchanged source texts and the PDFs are committed, as for the other books. The title page of each PDF names the source.

## Verification (offline: no model, no spend)

Command (backend venv, Python 3.12; script in my scratch dir): `backend/.venv/bin/python -I "/Volumes/Mrigesh SSD/Book-Reel-scratch/v02/e1/verify_parse.py" backend just-so-three-tales self-reliance`. It calls `app.sources.pdf_source.parse_pdf` and `app.preflight.build_preflight` with default `Settings()`, the same calls the API makes. Full output: `/Volumes/Mrigesh SSD/Book-Reel-scratch/v02/e1/parse-preflight.txt`.

| | just-so-three-tales | self-reliance |
|---|---|---|
| PDF pages (limit 75) | 38 | 36 |
| Words (limit 17,500) | 9,419 | 10,031 |
| Sections found | 3 | 3 |
| Source units | 20 | 20 |
| Within limits | yes | yes |
| Estimated manga pages | 23 to 36 | 25 to 39 |
| Estimated cost (USD) | 0.69 to 1.51 | 0.75 to 1.63 |
| Estimated time, total (minutes) | 9 to 73 | 10 to 76 |

Sections found by the parser (D14 heading detection), with PDF page ranges and words:

- just-so-three-tales: "The Elephant's Child" pp 2-11 (2,412); "How the First Letter Was Written" pp 13-24 (3,145); "The Cat That Walked by Himself" pp 25-38 (3,862).
- self-reliance: "Part One" pp 2-12 (3,393); "Part Two" pp 14-24 (3,525); "Part Three" pp 26-36 (3,113).

The parser found every section on the first build. No change to the parser was needed. The estimates are from the preflight model, not from a run. No live run was made.

## How to use

See the "Hold-out books" section of `docs/launch/EVAL.md`: never tune on them, run each 2 times where the budget allows, record the model policy. The orchestrator starts every live run.
