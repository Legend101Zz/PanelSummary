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


def prose_blocks(block: str) -> list[str]:
    """Like paragraphs(), but drop verse (blocks whose lines are all indented), footnote marks and rules."""
    kept = []
    for para in re.split(r"\n\s*\n", block):
        lines = [ln for ln in para.splitlines() if ln.strip()]
        if not lines or all(ln.startswith("   ") for ln in lines):
            continue
        kept.append(para)
    out = paragraphs("\n\n".join(kept))
    return [re.sub(r"\[\d+\]", "", p).strip() for p in out if not p.startswith("[Footnote")]


def just_so_stories() -> None:
    """Hold-out fiction (#50): three Kipling tales from Just So Stories (PG 2781)."""
    body = body_of((HERE / "pg2781.txt").read_text(encoding="utf-8"))
    order = [  # all headings of the book, in order; the chosen tales end where the next heading begins
        "HOW THE WHALE GOT HIS THROAT", "HOW THE CAMEL GOT HIS HUMP", "HOW THE RHINOCEROS GOT HIS SKIN",
        "HOW THE LEOPARD GOT HIS SPOTS", "THE ELEPHANT\u2019S CHILD", "THE SING-SONG OF OLD MAN KANGAROO",
        "THE BEGINNING OF THE ARMADILLOS", "HOW THE FIRST LETTER WAS WRITTEN", "HOW THE ALPHABET WAS MADE",
        "THE CRAB THAT PLAYED WITH THE SEA", "THE CAT THAT WALKED BY HIMSELF", "THE BUTTERFLY THAT STAMPED",
    ]
    idx = [body.index(f"\n{t}\n") for t in order]
    idx.append(len(body))
    chosen = {
        "THE ELEPHANT\u2019S CHILD": "The Elephant\u2019s Child",
        "HOW THE FIRST LETTER WAS WRITTEN": "How the First Letter Was Written",
        "THE CAT THAT WALKED BY HIMSELF": "The Cat That Walked by Himself",
    }
    chapters = []
    for i, t in enumerate(order):
        if t in chosen:
            chapters.append((chosen[t], prose_blocks(body[idx[i] + len(t) + 2 : idx[i + 1]])))
    render("Three Just So Stories", "Rudyard Kipling (1902)", chapters, HERE / "just-so-three-tales.pdf")


def self_reliance() -> None:
    """Hold-out nonfiction (#50): Emerson, Self-Reliance (from PG 16643, Essays: First Series)."""
    body = body_of((HERE / "pg16643.txt").read_text(encoding="utf-8"))
    start = body.index("\nSELF-RELIANCE\n\n\"Ne te")
    end = body.index("\nFRIENDSHIP.[278]")
    text = body[start + len("\nSELF-RELIANCE\n") : end]
    paras = [p for p in prose_blocks(text) if not p.startswith("*")]
    n = len(paras)
    cut = [0, n // 3, 2 * n // 3, n]
    names = ["Part One", "Part Two", "Part Three"]
    chapters = [(names[i], paras[cut[i] : cut[i + 1]]) for i in range(3)]
    render("Self-Reliance", "Ralph Waldo Emerson (1841)", chapters, HERE / "self-reliance.pdf")


if __name__ == "__main__":
    happy_prince()
    civil_disobedience()
    just_so_stories()
    self_reliance()
    sys.exit(0)
