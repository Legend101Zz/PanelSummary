# Sample: Four Tales by Hans Christian Andersen

- `andersen-four-tales.pdf` holds four tales by Hans Christian Andersen (22 PDF pages, 4 sections, 4,775 words).
  The text comes from Project Gutenberg eBook #1597 (https://www.gutenberg.org/ebooks/1597). The PDF was set
  by the PanelSummary project from that text, for tests.
- Licence of the text: public domain in the United States. Hans Christian Andersen died in 1875. The Project
  Gutenberg licence allows the free use of this text.
- `sample.json.gz` is the stored result of the real v0.1 final-journey run on this PDF: the book, its parsed
  sections and units, the edition (18 pages, real totals, timings, coverage and policy), the book understanding
  and the adaptation plan, and the 18 pages with their persisted SVG, panels, texts and receipts.
  All numbers are measured values of that run. The sample is not drawn again.
  `scripts/fixtures/export_sample.py` shows how the file was made. It removes the machine path of the PDF and nothing else.
