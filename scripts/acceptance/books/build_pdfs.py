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


def _prose(block: str) -> list[str]:
    """prose_blocks() without illustration marks, footnotes and footnote marks (hold-out books of v0.3)."""
    block = re.sub(r"\[Illustration[^\]]*\]", "", block)
    block = re.sub(r"\[Footnote[^\]]*\]", "", block, flags=re.S)
    return [re.sub(r"\[\d+\]", "", p).strip() for p in prose_blocks(block) if p.strip()]


_SMALL = {"the", "and", "of", "to", "a", "for", "in"}


def _nice(t: str) -> str:
    words = t.lower().replace("'", "\u2019").split()
    out = " ".join(w if (0 < i and w in _SMALL) else w[:1].upper() + w[1:] for i, w in enumerate(words))
    return out.replace("Girly-face", "Girly-Face").replace("Water-sprite", "Water-Sprite")


def jataka_tales(out_dir: Path = HERE) -> None:
    """Hold-out fiction (v0.3, #96): 13 of the 18 tales of Thirteen Jataka Tales (PG 62514)."""
    body = body_of((HERE / "pg62514.txt").read_text(encoding="utf-8"))
    body = body[body.index("\nI\n\nTHE MONKEY AND THE CROCODILE"):]
    allh = [("I", "THE MONKEY AND THE CROCODILE"), ("II", "HOW THE TURTLE SAVED HIS OWN LIFE"), ("III", "THE MERCHANT OF SERI"),
            ("IV", "THE TURTLE WHO COULDN'T STOP TALKING"), ("V", "THE OX WHO WON THE FORFEIT"), ("VI", "THE SANDY ROAD"),
            ("VII", "THE QUARREL OF THE QUAILS"), ("VIII", "THE MEASURE OF RICE"), ("IX", "THE FOOLISH, TIMID RABBIT"),
            ("X", "THE WISE AND THE FOOLISH MERCHANT"), ("XI", "THE ELEPHANT GIRLY-FACE"), ("XII", "THE BANYAN DEER"),
            ("XIII", "THE PRINCES AND THE WATER-SPRITE"), ("XIV", "THE KING'S WHITE ELEPHANT"), ("XV", "THE OX WHO ENVIED THE PIG"),
            ("XVI", "GRANNY'S BLACKIE"), ("XVII", "THE CRAB AND THE CRANE"), ("XVIII", "WHY THE OWL IS NOT KING OF THE BIRDS")]
    idx = [body.index(f"\n{r}\n\n{t}\n") for r, t in allh] + [body.index("THE END")]
    chosen = {"I", "II", "IV", "V", "VI", "VII", "IX", "XI", "XII", "XIII", "XIV", "XVII", "XVIII"}
    chapters = []
    for i, (r, t) in enumerate(allh):
        if r in chosen:
            chunk = body[idx[i] + len(f"\n{r}\n\n{t}\n"): idx[i + 1]]
            chunk = re.sub(r"\n\s*PART (I|II)\s*\n", "\n\n", chunk)
            chapters.append((_nice(t), _prose(chunk)))
    render("Thirteen Jataka Tales", "Retold by Ellen C. Babbitt (1912)", chapters, out_dir / "jataka-tales-thirteen.pdf")


def indian_why_stories(out_dir: Path = HERE) -> None:
    """Hold-out fiction (v0.3, #96): 8 tales of Linderman, Indian Why Stories (PG 606)."""
    body = body_of((HERE / "pg606.txt").read_text(encoding="utf-8"))
    body = body[body.index("\nWHY THE CHIPMUNK'S BACK IS STRIPED\n"):]
    allh = ["WHY THE CHIPMUNK'S BACK IS STRIPED", "HOW THE DUCKS GOT THEIR FINE FEATHERS", "WHY THE KINGFISHER ALWAYS WEARS A WAR-BONNET",
            "WHY THE CURLEW'S BILL IS LONG AND CROOKED", "OLD-MAN REMAKES THE WORLD", "WHY BLACKFEET NEVER KILL MICE",
            "OLD-MAN STEALS THE SUN'S LEGGINGS", "OLD-MAN AND HIS CONSCIENCE", "OLD-MAN'S TREACHERY",
            "WHY THE NIGHT-HAWK'S WINGS ARE BEAUTIFUL", "WHY THE MOUNTAIN-LION IS LONG AND LEAN", "THE FIRE-LEGGINGS",
            "THE MOON AND THE GREAT SNAKE", "WHY THE DEER HAS NO GALL"]
    fox = "OLD-MAN AND THE FOX"
    # the first heading starts the body; the others are found after two blank lines
    pos = [body.index(f"\n\n\n{h}\n") if i else 0 for i, h in enumerate(allh)]
    pos.append(body.index(f"\n\n\n{fox}\n"))
    chosen = {"WHY THE CHIPMUNK'S BACK IS STRIPED": "Why the Chipmunk\u2019s Back Is Striped",
              "HOW THE DUCKS GOT THEIR FINE FEATHERS": "How the Ducks Got Their Fine Feathers",
              "WHY THE KINGFISHER ALWAYS WEARS A WAR-BONNET": "Why the Kingfisher Always Wears a War-Bonnet",
              "WHY THE CURLEW'S BILL IS LONG AND CROOKED": "Why the Curlew\u2019s Bill Is Long and Crooked",
              "WHY THE NIGHT-HAWK'S WINGS ARE BEAUTIFUL": "Why the Night-Hawk\u2019s Wings Are Beautiful",
              "WHY THE MOUNTAIN-LION IS LONG AND LEAN": "Why the Mountain-Lion Is Long and Lean",
              "THE MOON AND THE GREAT SNAKE": "The Moon and the Great Snake"}
    chapters = []
    for i, h in enumerate(allh):
        if h in chosen:
            chunk = body[pos[i] + len(f"\n\n\n{h}\n") if i else len(f"\n{h}\n"): pos[i + 1]]
            chapters.append((chosen[h], _prose(chunk)))
    fi = body.index(f"\n\n\n{fox}\n")
    nxt = body.index("\n\n\nWHY THE BIRCH-TREE")
    chapters.append(("Old-Man and the Fox", _prose(body[fi + len(fox) + 4: nxt])))
    render("Seven Why Stories and a Trickster Tale", "Frank B. Linderman (1915)", chapters, out_dir / "indian-why-stories-eight.pdf")


def piece_of_chalk(out_dir: Path = HERE) -> None:
    """Hold-out nonfiction (v0.3, #96): Huxley, On a Piece of Chalk (PG 16729, Lay Sermons, chapter IX)."""
    body = body_of((HERE / "pg16729.txt").read_text(encoding="utf-8"))
    head = "\nON A PIECE OF CHALK.\n\nA LECTURE TO WORKING MEN.\n"
    s = body.index(head)
    e = body.index("\nGEOLOGICAL CONTEMPORANEITY AND PERSISTENT TYPES OF LIFE.\n")
    paras = [p for p in _prose(body[s + len(head): e])
             if not p.startswith("*") and p != "X." and not p.startswith("See Appendix") and not p.startswith('"Elements of Geology')]
    n = len(paras)
    cut = [0, n // 3, 2 * n // 3, n]
    names = ["Part One", "Part Two", "Part Three"]
    render("On a Piece of Chalk", "Thomas Henry Huxley (1868)", [(names[i], paras[cut[i]:cut[i + 1]]) for i in range(3)],
           out_dir / "on-a-piece-of-chalk.pdf")


if __name__ == "__main__":
    happy_prince()
    civil_disobedience()
    just_so_stories()
    self_reliance()
    jataka_tales()
    indian_why_stories()
    piece_of_chalk()
    sys.exit(0)
