#!/usr/bin/env python3
"""Defect-kind rates per judge-page (Python 3.12, stdlib only).

For each input file the rate of a kind is: defects of the counted severities that match the
kind, divided by the number of judge-pages (one judge's judgment of one page). The default
counted severities are blocker and major, the measure of the v0.1 report and of
docs/v0.2/GATES.md. One defect can match several kinds. See kinds.py for the rules.

Input: raw judgments.json files or fixtures (fixtures/*.json). Give a label with LABEL=PATH.

  python3 kinds_rates.py fixtures/v01-gate2.json fixtures/v02-run3.json
  python3 kinds_rates.py gate2=fixtures/v01-gate2.json --kinds hero_tiny,tail_wrong --json
  python3 kinds_rates.py run.json --severity blocker,major,minor
"""
import argparse
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fixture  # noqa: E402
import kinds  # noqa: E402

DEFAULT_SEVERITIES = ("blocker", "major")


def rates_from_judgments(judgments, severities=DEFAULT_SEVERITIES):
    """Return (judge-page count, {kind: rate}) for a raw judgment list. Every kind is a key."""
    counts = collections.Counter()
    for j in judgments:
        for d in j.get("defects") or []:
            if d.get("severity") not in severities:
                continue
            for k in kinds.labels(d):
                counts[k] += 1
    n = len(judgments)
    return n, {k: (counts[k] / n if n else 0.0) for k in kinds.KINDS}


def rates(path, severities=DEFAULT_SEVERITIES):
    judgments, _, _ = fixture.load(path)
    return rates_from_judgments(judgments, severities)


def split_arg(arg):
    label, sep, path = arg.partition("=")
    if sep and not os.path.exists(arg):
        return label, path
    return os.path.basename(arg).removesuffix(".gz").removesuffix(".json"), arg


def table(results, kind_list):
    """Markdown table: one row per kind, one column per run. results = [(label, n, rates)]."""
    L = ["| kind | " + " | ".join(f"{n} ({jp} jp)" for n, jp, _ in results) + " |",
         "|---|" + "---|" * len(results)]
    for k in kind_list:
        L.append(f"| {k} | " + " | ".join(f"{r.get(k, 0):.2f}" for _, _, r in results) + " |")
    return "\n".join(L) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+", help="judgments.json or fixture files, optionally LABEL=PATH")
    ap.add_argument("--kinds", help="comma-separated kind names (default: every kind)")
    ap.add_argument("--severity", default=",".join(DEFAULT_SEVERITIES),
                    help="severities to count (default: blocker,major)")
    ap.add_argument("--json", action="store_true", help="machine output")
    a = ap.parse_args(argv)
    severities = tuple(s.strip() for s in a.severity.split(",") if s.strip())
    kind_list = [k.strip() for k in a.kinds.split(",")] if a.kinds else list(kinds.KINDS)
    unknown = [k for k in kind_list if k not in kinds.KINDS]
    if unknown:
        ap.error(f"unknown kind(s): {', '.join(unknown)}; known: {', '.join(kinds.KINDS)}")
    results = []
    for arg in a.inputs:
        label, path = split_arg(arg)
        n, r = rates(path, severities)
        results.append((label, n, r))
    if a.json:
        json.dump({"severities": list(severities),
                   "runs": [{"label": l, "judge_pages": n, "rates": {k: r[k] for k in kind_list}}
                            for l, n, r in results]}, sys.stdout, indent=1)
        sys.stdout.write("\n")
    else:
        sys.stdout.write(table(results, kind_list))
    return 0


if __name__ == "__main__":
    sys.exit(main())
