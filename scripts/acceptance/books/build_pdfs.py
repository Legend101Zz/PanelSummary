"""Build clean, multi-page test PDFs from public-domain Project Gutenberg texts.

Output PDFs carry real chapter headings so the parser sees sections. Gutenberg
license boilerplate is stripped (the texts are public domain in the US); the
title page records the source.
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

HERE = Path(__file__).parent

CSS = """
body { font-family: serif; font-size: 11pt; line-height: 1.45; }
h1 { font-size: 20pt; text-align: center; margin-top: 30pt; margin-bottom: 18pt; }
h2 { font-size: 15pt; margin-top: 10pt; margin-bottom: 10pt; }
p { text-align: justify; margin-bottom: 7pt; }
.title { font-size: 26pt; text-align: center; margin-top: 160pt; }
.sub { font-size: 13pt; text-align: center; margin-top: 12pt; }
.note { font-size: 9pt; text-align: center; margin-top: 200pt; color: #444; }
"""


def body_of(raw: str) -> str:
    start = raw.index("*** START OF")
    start = raw.index("\n", start) + 1
    end = raw.index("*** END OF")
    return raw[start:end]


def paragraphs(block: str) -> list[str]:
    out = []
    for para in re.split(r"\n\s*\n", block):
        text = " ".join(line.strip() for line in para.strip().splitlines())
        text = re.sub(r"\[Picture:[^\]]*\]", "", text).strip()
        text = text.replace("_", "")
        if text and not re.fullmatch(r"[\* ]+", text):
            out.append(text)
    return out


def render(title: str, byline: str, chapters: list[tuple[str, list[str]]], out: Path) -> None:
    parts = [
        f'<p class="title">{html.escape(title)}</p>',
        f'<p class="sub">{html.escape(byline)}</p>',
        '<p class="note">Public-domain text from Project Gutenberg, typeset for PanelSummary testing.</p>',
    ]
    for heading, paras in chapters:
        parts.append(f'<h1 style="page-break-before: always">{html.escape(heading)}</h1>')
        parts.extend(f"<p>{html.escape(p)}</p>" for p in paras)
    story = fitz.Story(html="".join(parts), user_css=CSS)
    writer = fitz.DocumentWriter(str(out))
    mediabox = fitz.paper_rect("a5")
    where = mediabox + (48, 54, -48, -54)
    more = True
    while more:
        dev = writer.begin_page(mediabox)
        more, _ = story.place(where)
        story.draw(dev)
        writer.end_page()
    writer.close()
    doc = fitz.open(out)
    print(f"{out.name}: {doc.page_count} pages")


def happy_prince() -> None:
    body = body_of((HERE / "pg902.txt").read_text(encoding="utf-8"))
    titles = [
        "The Happy Prince",
        "The Nightingale and the Rose",
        "The Selfish Giant",
        "The Devoted Friend",
        "The Remarkable Rocket",
    ]
    idx = [body.index(f"\n{t}.\n") for t in titles]
    idx.append(len(body))
    chapters = []
    for i, t in enumerate(titles):
        chunk = body[idx[i] + len(t) + 3 : idx[i + 1]]
        chapters.append((t, paragraphs(chunk)))
    render("The Happy Prince and Other Tales", "Oscar Wilde (1888)", chapters, HERE / "happy-prince-and-other-tales.pdf")
    render("The Happy Prince and Other Tales (first two tales)", "Oscar Wilde (1888)", chapters[:2], HERE / "happy-prince-two-tales.pdf")


def civil_disobedience() -> None:
    body = body_of((HERE / "pg71.txt").read_text(encoding="utf-8"))
    paras = paragraphs(body)
    # drop title lines
    paras = [p for p in paras if not p.startswith(("On the Duty of Civil", "by Henry David", "1849, original"))]
    n = len(paras)
    thirds = [paras[: n // 3], paras[n // 3 : 2 * n // 3], paras[2 * n // 3 :]]
    chapters = [
        ("Part One", thirds[0]),
        ("Part Two", thirds[1]),
        ("Part Three", thirds[2]),
    ]
    render("On the Duty of Civil Disobedience", "Henry David Thoreau (1849)", chapters, HERE / "civil-disobedience.pdf")


if __name__ == "__main__":
    happy_prince()
    civil_disobedience()
    sys.exit(0)
