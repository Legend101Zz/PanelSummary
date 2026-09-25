#!/usr/bin/env python3
"""Run the SimpleEnglish checklist over HTML PROSE only.

Code is untouchable per the skill: <style>, <script>, <pre> (mermaid sources),
and <code> spans are removed before any pattern runs. Otherwise every CSS rule
would report as a semicolon violation.
"""
from __future__ import annotations

import re
import sys
from html.parser import HTMLParser

SKIP_ELEMENTS = {"style", "script", "pre", "code"}

#: Block-level tags end a text run. Without this every table cell merges into
#: its neighbours and one row reports as a single 70-word sentence.
BLOCK_ELEMENTS = {
    "p", "li", "td", "th", "tr", "h1", "h2", "h3", "h4", "div", "section",
    "table", "thead", "tbody", "ul", "ol", "footer", "header", "main", "span",
    "small", "br", "nav", "article", "aside",
}

PATTERNS = [
    ("contraction", r"\b\w+('ll|'re|'ve|n't)\b|\bit's\b"),
    ("perfect tense", r"\b(has|have|had) (been|never|already)?\s*\b\w+ed\b|\b(has|have|had) been\b"),
    ("banned modal", r"\b(should|would|may|might|could)\b"),
    ("progressive passive", r"\b(is|are|was|were) being\b"),
    ("-ing clause", r",\s+(making|allowing|enabling|ensuring|leaving|giving|producing|creating)\b"),
    ("semicolon", r";"),
    ("latin abbrev", r"\b(e\.g\.|i\.e\.|etc\.)"),
    ("filler", r"\b(simply|easily|seamlessly|robust|effortlessly|comprehensive|powerful|just)\b"),
    ("slop verb", r"\b(leverage|utilize|facilitate|streamline|delve)\b"),
    ("slop phrase", r"\b(in order to|prior to|due to the fact that|it is worth noting|under the hood|out of the box)\b"),
    # The block separator must not appear between the clause and the keyword,
    # otherwise a condition-first sentence matches its own previous list item.
    ("trailing condition", r"[a-z,][ \t]+(if|when)[ \t]+(?!and\b)\w"),
]

SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z(])|\u2029")


class ProseExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.chunks: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_ELEMENTS:
            self.depth += 1
        elif tag in BLOCK_ELEMENTS and self.depth == 0:
            self.chunks.append("  ")

    def handle_endtag(self, tag):
        if tag in SKIP_ELEMENTS and self.depth:
            self.depth -= 1
        elif tag in BLOCK_ELEMENTS and self.depth == 0:
            self.chunks.append("  ")

    def handle_data(self, data):
        if self.depth == 0:
            self.chunks.append(data)

    def prose(self) -> str:
        text = " ".join(self.chunks)
        text = re.sub(r"[ \t]*\n[ \t]*", " ", text)
        text = re.sub(r"   +", " \u2029 ", text)
        return re.sub(r"[ \t]+", " ", text).strip()


def word_count(sentence: str) -> int:
    """Rule 8.6: numbers with units, identifiers, and quoted text count as one."""
    cleaned = re.sub(r"[—–]", " ", sentence)
    return len([w for w in cleaned.split() if re.search(r"\w", w)])


def check(path: str) -> dict:
    parser = ProseExtractor()
    with open(path, encoding="utf-8") as handle:
        parser.feed(handle.read())
    prose = parser.prose()

    hits: dict[str, list[str]] = {}
    for label, pattern in PATTERNS:
        found = re.findall(pattern, prose, flags=re.IGNORECASE)
        if found:
            hits[label] = [f if isinstance(f, str) else "".join(f) for f in found]

    long_sentences = []
    for sentence in SENT_SPLIT.split(prose):
        count = word_count(sentence)
        if count > 25:
            long_sentences.append((count, sentence.strip()[:110]))

    return {
        "path": path,
        "prose_words": word_count(prose),
        "violations": hits,
        "violation_total": sum(len(v) for v in hits.values()),
        "long_sentences": sorted(long_sentences, reverse=True),
    }


def main() -> int:
    verbose = "-v" in sys.argv
    paths = [a for a in sys.argv[1:] if not a.startswith("-")]
    grand = 0
    for path in paths:
        result = check(path)
        total = result["violation_total"] + len(result["long_sentences"])
        grand += total
        name = path.rsplit("/", 1)[-1]
        print(f"\n=== {name} ({result['prose_words']} prose words) ===")
        print(f"  pattern violations: {result['violation_total']}"
              f" | sentences over 25 words: {len(result['long_sentences'])}")
        for label, found in sorted(result["violations"].items()):
            sample = ", ".join(sorted(set(f.strip() for f in found))[:6])
            print(f"    {label:22s} {len(found):3d}  [{sample}]")
        if verbose:
            for count, text in result["long_sentences"][:8]:
                print(f"    {count:3d}w  {text}")
    print(f"\nTOTAL findings across {len(paths)} pages: {grand}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
