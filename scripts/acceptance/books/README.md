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
