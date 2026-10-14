#!/usr/bin/env python3
"""Make a compact judge fixture from a run directory (Python 3.12, stdlib only).

Keeps only what kinds.py and aggregate.py need: judge, page, scores, ships and, for each
defect, owner, severity and text. Drops what_works and fix texts. Page statuses other than
"accepted" come from DIR/judge/page-NN.json (or DIR/export/judge/, DIR/live-run/judge/).

Do not make a fixture of a private or copyrighted book: the defect texts quote the book.

  python3 make_fixture.py RUN_DIR --run v0.2-run3 --book acceptance-book --version v0.2 \
      --source "Book-Reel-scratch/v02/live/run3" --out fixtures/v02-run3.json
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fixture  # noqa: E402
from aggregate import load_judgments, read_status  # noqa: E402


def make(run_dir, run, book, version, source, note=""):
    with open(os.path.join(run_dir, "judgments.json"), encoding="utf-8") as f:
        judgments = load_judgments(json.load(f))
    judge_dir = next((d for d in (os.path.join(run_dir, "judge"), os.path.join(run_dir, "export", "judge"),
                                  os.path.join(run_dir, "live-run", "judge")) if os.path.isdir(d)), None)
    statuses = {}
    for pn in sorted({j["page"] for j in judgments}):
        s = read_status(judge_dir, pn)
        if s is not None and s != "accepted":
            statuses[str(pn)] = s
    out = []
    for j in sorted(judgments, key=lambda j: (j["page"], j["judge"])):
        out.append({"judge": j["judge"], "page": j["page"],
                    "scores": {c: int(v) if float(v).is_integer() else v for c, v in j["scores"].items()},
                    "ships": j["ships"],
                    "defects": [{"owner": d.get("owner"), "severity": d.get("severity"), "what": d.get("what", "")}
                                for d in j["defects"]]})
    return {"schema": fixture.FIXTURE_SCHEMA, "run": run, "book": book, "version": version,
            "source": source, "note": note, "page_statuses": statuses, "judgments": out}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("run_dir")
    ap.add_argument("--run", required=True)
    ap.add_argument("--book", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--source", default="")
    ap.add_argument("--note", default="")
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    fx = make(a.run_dir, a.run, a.book, a.version, a.source, a.note)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(fx, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
