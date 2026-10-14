These PDFs are test books for the live journey. They are built by build_pdfs.py from public-domain texts.
Sources (Project Gutenberg): pg902 "The Happy Prince and Other Tales" (Oscar Wilde), pg71 "On the Duty of Civil Disobedience" (Henry David Thoreau).
Rebuild: python build_pdfs.py (needs PyMuPDF). The PDFs are committed, so CI does not rebuild them.

## Hold-out books (v0.2, issue #50)

Two books that were never used to tune PanelSummary. Do not tune on them. See docs/launch/EVAL.md and docs/v0.2/E1-holdout-books.md.

| PDF | Kind | Source | Words | PDF pages | Sections |
|---|---|---|---|---|---|
| just-so-three-tales.pdf | fiction | Project Gutenberg eBook #2781, Rudyard Kipling, "Just So Stories" (1902), https://www.gutenberg.org/ebooks/2781 (text: https://www.gutenberg.org/cache/epub/2781/pg2781.txt) | 9,419 | 38 | 3 tales |
| self-reliance.pdf | nonfiction | Project Gutenberg eBook #16643, Ralph Waldo Emerson, "Essays" (First Series, 1841), the essay "Self-Reliance", https://www.gutenberg.org/ebooks/16643 (text: https://www.gutenberg.org/cache/epub/16643/pg16643.txt) | 10,031 | 36 | 3 parts |

NOTICE: The texts are public domain in the United States. The files pg2781.txt and pg16643.txt are the unchanged Project Gutenberg plain texts, with their licence header and footer. The build removes the header and the footer (everything outside the START and END markers) and typesets only the chosen text. The title page of each PDF names the source. The Project Gutenberg trademark and licence terms apply to the full eBook files. See the licence text inside each file.

What the build keeps and removes:
- just-so-three-tales.pdf: three tales ("The Elephant's Child", "How the First Letter Was Written", "The Cat That Walked by Himself"). Verse blocks between the tales are removed.
- self-reliance.pdf: the essay "Self-Reliance". The verse epigraphs, the footnote marks and the editor's footnotes are removed. The essay has no headings, so the build splits it into three parts of equal paragraph count, as for the Thoreau book.

Rebuild only these two: python -c "import build_pdfs as b; b.just_so_stories(); b.self_reliance()".

## Hold-out books of v0.3 (sealed during the v0.3 build, issue #96)

Three books that were sealed during the v0.3 build and measured at Gate 2 (docs/v0.3/HOLDOUT.md). At the v0.3 release they became seen books: they are test books for v0.4 and no longer hold-out books. The SHA-256 of each file is in docs/v0.3/HOLDOUT.md.

| PDF | Kind | Source | Words | PDF pages | Sections | Scope |
|---|---|---|---|---|---|---|
| jataka-tales-thirteen.pdf | fiction | Project Gutenberg eBook #62514, Ellen C. Babbitt, "Jataka Tales" (1912), retold, https://www.gutenberg.org/ebooks/62514 (text: https://www.gutenberg.org/cache/epub/62514/pg62514.txt) | 7,306 | 39 | 13 tales | 13 of the 18 tales. Left out: "The Merchant of Seri", "The Measure of Rice", "The Wise and the Foolish Merchant", "The Ox Who Envied the Pig", "Granny's Blackie". The build removes the foreword, the publisher's note, the illustration captions and the "PART I/II" labels. |
| indian-why-stories-eight.pdf | fiction | Project Gutenberg eBook #606, Frank B. Linderman, "Indian Why Stories: Sparks from War Eagle's Lodge-Fire" (1915), https://www.gutenberg.org/ebooks/606 (text: https://www.gutenberg.org/cache/epub/606/pg606.txt) | 10,767 | 45 | 8 tales | Seven "Why" tales (chipmunk, ducks, kingfisher, curlew, night-hawk, mountain-lion, the Moon and the Great Snake) and "Old-Man and the Fox". The first tale starts with the frame scene. The build removes the preface, the introduction, the verse blocks and the illustration marks. The 1915 retelling has dated language. |
| on-a-piece-of-chalk.pdf | nonfiction | Project Gutenberg eBook #16729, Thomas Henry Huxley, "Lay Sermons, Addresses and Reviews" (1870), chapter IX "On a Piece of Chalk" (lecture of 1868), https://www.gutenberg.org/ebooks/16729 (text: https://www.gutenberg.org/cache/epub/16729/pg16729.txt) | 8,699 | 34 | 3 parts | The whole lecture. It has no headings, so the build splits it into three parts of equal paragraph count, as for the Emerson and Thoreau books. The build removes the footnote marks and the footnotes at the end. |

NOTICE: The texts are public domain in the United States. The files pg62514.txt, pg606.txt and pg16729.txt are the unchanged Project Gutenberg plain texts, with their licence header and footer. The build removes the header and the footer (everything outside the START and END markers) and typesets only the chosen text. The title page of each PDF names the source. The Project Gutenberg trademark and licence terms apply to the full eBook files. See the licence text inside each file.

Rebuild only these three: python -c "import build_pdfs as b; b.jataka_tales(); b.indian_why_stories(); b.piece_of_chalk()". With PyMuPDF 1.24.14 (the version in backend/requirements.txt) the rebuild is byte-identical to the committed files.
