#!/usr/bin/env python3
"""Compare judged runs per book and per version (Python 3.12, stdlib only).

This is the table of the v0.3 hold-out protocol (issue #96). It reuses aggregate.py for all
scoring (a failed page counts as 0 in every mean) and kinds.py for the defect kinds. It
makes no model call.

A run is given with --run. SPEC is a path (a fixture, see fixtures/README.md) or a list of
KEY=VALUE pairs separated by commas:

  file=PATH          judgments.json or a fixture (required)
  label=NAME         name of the run (default: the fixture's "run", else the file name)
  version=V          code version, e.g. v0.2.0 or v0.3 (default: the fixture's "version")
  book=NAME          book (default: the fixture's "book")
  judge_dir=DIR      DIR/page-NN.json gives the page status (failed pages)
  aggregate=FILE     an aggregate.json of the run; its failed_pages are the failed pages

Without judge_dir or aggregate the fixture's own page_statuses are used. A page with every
score 0 is failed in any case (aggregate.py rule).

Per book and version the table pools the runs: the mean is over all pages of all runs
(failed = 0); the strict count and the defect counts are sums; the spread is the min and
max of the run means (only for 2 or more runs). The delta block compares each version with
the base version (--base-version, default: the first version in the input), per book and for
each --group NAME=BOOK1,BOOK2 (all runs of those books pooled).

Defect rates are blocker+major defects per judge-page (kinds_rates.py, --severity). Kind
names and what they measure are in scripts/acceptance/README.md.

  python3 compare_runs.py --run fixtures/v01-justso.json.gz --run fixtures/v02-justso-1.json.gz \\
      --run fixtures/v02-justso-2.json.gz --run fixtures/v02-justso-3.json.gz \\
      --out-md cmp.md --out-json cmp.json
"""
import argparse
import json
import os
import sys
from collections import OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fixture  # noqa: E402
import kinds  # noqa: E402
import kinds_rates  # noqa: E402
from aggregate import CRITERIA, aggregate, load_judgments, read_status, r2  # noqa: E402

SCHEMA = "bookreel-compare-runs.v1"
# The gate measures, in table order: (kind name in kinds.py, column title).
MEASURES = [
    ("key_prop_not_drawn", "key prop not drawn"),
    ("setting_wrong", "wrong setting"),
    ("hero_tiny", "hero a speck or cropped"),
    ("tail_wrong", "tail at wrong figure"),
    ("label_clutter", "label clutter"),
    ("repeat_variety", "repeated panels"),
]


def parse_spec(spec):
    if "=" not in spec:
        return {"file": spec}
    out = {}
    for part in spec.split(","):
        k, sep, v = part.partition("=")
        if not sep:
            raise ValueError(f"bad --run part {part!r}; expected KEY=VALUE")
        out[k.strip()] = v.strip()
    if "file" not in out:
        raise ValueError(f"--run {spec!r}: file=PATH is required")
    return out


def load_run(spec, severities=kinds_rates.DEFAULT_SEVERITIES):
    """Score one run. Returns a dict with the run's numbers and the raw sums used for pooling."""
    s = spec if isinstance(spec, dict) else parse_spec(spec)
    judgments_raw, statuses, meta = fixture.load(s["file"])
    judgments = load_judgments(judgments_raw)
    pages = sorted({j["page"] for j in judgments})
    if s.get("judge_dir"):
        statuses = {pn: st for pn in pages if (st := read_status(s["judge_dir"], pn)) is not None}
    elif s.get("aggregate"):
        with open(s["aggregate"], encoding="utf-8") as f:
            statuses = {int(pn): "failed" for pn in json.load(f).get("failed_pages", [])}
    label = s.get("label") or meta.get("run") or os.path.basename(s["file"])
    version = s.get("version") or meta.get("version")
    book = s.get("book") or meta.get("book")
    if not version or not book:
        raise ValueError(f"run {label}: version and book are required (set them or use a fixture)")
    res = aggregate(judgments, statuses, None, label)
    n_jp, rates = kinds_rates.rates_from_judgments(judgments_raw, severities)
    return {
        "label": label, "version": version, "book": book, "file": s["file"],
        "pages": res["pages"], "failed_pages": res["failed_pages"], "judges": res["judges"],
        "mean": res["overall"], "strict": res["ships_strict"], "criteria": res["criteria"],
        "judge_pages": n_jp, "defect_rates": rates,
        # raw sums for pooling
        "_sum_page_mean": res["overall"] * res["pages"],
        "_sum_criteria": {c: res["criteria"][c] * res["pages"] for c in CRITERIA},
        "_defect_counts": {k: rates[k] * n_jp for k in kinds.KINDS},
    }


def pool(runs):
    """Pooled numbers for a list of runs of one version (of one book, or of a group of books)."""
    pages = sum(r["pages"] for r in runs)
    jp = sum(r["judge_pages"] for r in runs)
    means = [r["mean"] for r in runs]
    out = {
        "runs": len(runs), "run_labels": [r["label"] for r in runs],
        "pages": pages, "pages_per_run": [r["pages"] for r in runs],
        "failed": sum(len(r["failed_pages"]) for r in runs),
        "mean": sum(r["_sum_page_mean"] for r in runs) / pages if pages else 0.0,
        "run_means": means,
        "spread": [min(means), max(means)] if len(runs) >= 2 else None,
        "strict": sum(r["strict"] for r in runs), "strict_per_run": [r["strict"] for r in runs],
        "criteria": {c: (sum(r["_sum_criteria"][c] for r in runs) / pages if pages else 0.0) for c in CRITERIA},
        "judge_pages": jp,
        "defect_rates": {k: (sum(r["_defect_counts"][k] for r in runs) / jp if jp else 0.0) for k in kinds.KINDS},
    }
    out["continuity"] = out["criteria"]["continuity"]
    return out


def compare(runs, base_version=None, groups=None):
    """Build the full result: runs, cells (book x version), deltas per book and per group."""
    versions = list(OrderedDict.fromkeys(r["version"] for r in runs))
    books = list(OrderedDict.fromkeys(r["book"] for r in runs))
    base = base_version or versions[0]
    if base not in versions:
        raise ValueError(f"base version {base!r} not in the input; versions: {versions}")
    cells = {b: {v: pool([r for r in runs if r["book"] == b and r["version"] == v])
                 for v in versions if any(r["book"] == b and r["version"] == v for r in runs)} for b in books}

    def delta(a, b):
        return {"mean": b["mean"] - a["mean"],
                "strict": b["strict"] - a["strict"],
                "strict_per_run": sum(b["strict_per_run"]) / b["runs"] - sum(a["strict_per_run"]) / a["runs"],
                "criteria": {c: b["criteria"][c] - a["criteria"][c] for c in CRITERIA},
                "defect_rates": {k: b["defect_rates"][k] - a["defect_rates"][k] for k in kinds.KINDS}}

    deltas = {}
    for b in books:
        if base not in cells[b]:
            continue
        for v, cell in cells[b].items():
            if v != base:
                deltas.setdefault(b, {})[v] = {"from": base, "to": v, **delta(cells[b][base], cell)}
    group_cells, group_deltas = {}, {}
    for name, members in (groups or {}).items():
        missing = [m for m in members if m not in books]
        if missing:
            raise ValueError(f"group {name}: unknown book(s) {missing}; books: {books}")
        group_cells[name] = {}
        for v in versions:
            rs = [r for r in runs if r["book"] in members and r["version"] == v]
            if rs:
                group_cells[name][v] = pool(rs)
        if base in group_cells[name]:
            for v, cell in group_cells[name].items():
                if v != base:
                    group_deltas.setdefault(name, {})[v] = {"from": base, "to": v, **delta(group_cells[name][base], cell)}
    public_runs = [{k: v for k, v in r.items() if not k.startswith("_")} for r in runs]
    return {"schema": SCHEMA, "base_version": base, "versions": versions, "books": books,
            "groups": groups or {}, "runs": public_runs, "cells": cells, "deltas": deltas,
            "group_cells": group_cells, "group_deltas": group_deltas}


def _spread(c):
    return f"{r2(c['spread'][0]):.2f}-{r2(c['spread'][1]):.2f}" if c["spread"] else "-"


def _rates(rates):
    return " | ".join(f"{r2(rates[k]):.2f}" for k, _ in MEASURES)


def _drates(rates):
    return " | ".join(f"{rates[k]:+.2f}" for k, _ in MEASURES)


def markdown(res):
    L, w = [], None
    w = L.append
    crit_h = " | ".join(c for c in CRITERIA)
    meas_h = " | ".join(t for _, t in MEASURES)
    w("# Run comparison\n")
    w(f"Base version: {res['base_version']}. Mean: failed pages count as 0. Defect rates: blocker+major defects "
      "per judge-page, v0.1 classifier. Spread: min-max of the run means (2 or more runs).\n")
    w("## Runs\n")
    w(f"| Book | Version | Run | Pages | Failed | Mean | Strict | {crit_h} | {meas_h} |")
    w("|---|---|---|---|---|---|---|" + "---|" * (len(CRITERIA) + len(MEASURES)))
    for r in res["runs"]:
        w(f"| {r['book']} | {r['version']} | {r['label']} | {r['pages']} | {len(r['failed_pages'])} | {r2(r['mean']):.2f} | "
          f"{r['strict']} | " + " | ".join(f"{r2(r['criteria'][c]):.2f}" for c in CRITERIA) + " | " + _rates(r["defect_rates"]) + " |")
    w("\n## Per book and version (runs pooled)\n")
    w(f"| Book | Version | Runs | Pages | Failed | Mean | Spread | Strict | Strict per run | {crit_h} | {meas_h} |")
    w("|---|---|---|---|---|---|---|---|---|" + "---|" * (len(CRITERIA) + len(MEASURES)))

    def cell_row(name, v, c):
        return (f"| {name} | {v} | {c['runs']} | {c['pages']} | {c['failed']} | {r2(c['mean']):.2f} | {_spread(c)} | "
                f"{c['strict']} | {'/'.join(map(str, c['strict_per_run']))} | "
                + " | ".join(f"{r2(c['criteria'][k]):.2f}" for k in CRITERIA) + " | " + _rates(c["defect_rates"]) + " |")

    for b, vs in res["cells"].items():
        for v, c in vs.items():
            w(cell_row(b, v, c))
    for g, vs in res["group_cells"].items():
        for v, c in vs.items():
            w(cell_row(f"GROUP {g}", v, c))
    if res["deltas"] or res["group_deltas"]:
        w(f"\n## Delta against {res['base_version']} (version minus base)\n")
        w(f"| Book or group | Version | Mean | Strict (pooled) | Strict per run | {crit_h} | {meas_h} |")
        w("|---|---|---|---|---|" + "---|" * (len(CRITERIA) + len(MEASURES)))
        for src in (res["deltas"], res["group_deltas"]):
            for name, vs in src.items():
                label = name if src is res["deltas"] else f"GROUP {name}"
                for v, d in vs.items():
                    w(f"| {label} | {v} | {d['mean']:+.2f} | {d['strict']:+d} | {d['strict_per_run']:+.1f} | "
                      + " | ".join(f"{d['criteria'][c]:+.2f}" for c in CRITERIA) + " | " + _drates(d["defect_rates"]) + " |")
        w("\nA negative defect delta is an improvement. The pooled strict delta depends on the number of runs; "
          "use the per-run value when the run counts differ.")
    return "\n".join(L) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", action="append", default=[], help="path or KEY=VALUE,... (see above); repeat per run")
    ap.add_argument("--spec", help="JSON file: a list of run specs (dicts with the keys above)")
    ap.add_argument("--group", action="append", default=[], help="NAME=BOOK1,BOOK2 (repeatable)")
    ap.add_argument("--base-version", help="version the deltas are measured against (default: first in the input)")
    ap.add_argument("--severity", default=",".join(kinds_rates.DEFAULT_SEVERITIES))
    ap.add_argument("--out-md")
    ap.add_argument("--out-json")
    a = ap.parse_args(argv)
    severities = tuple(s.strip() for s in a.severity.split(",") if s.strip())
    specs = [parse_spec(s) for s in a.run]
    if a.spec:
        with open(a.spec, encoding="utf-8") as f:
            specs += json.load(f)
    if not specs:
        ap.error("give at least one --run or --spec")
    groups = {}
    for g in a.group:
        name, sep, members = g.partition("=")
        if not sep or not members:
            ap.error(f"bad --group {g!r}; expected NAME=BOOK1,BOOK2")
        groups[name] = [m.strip() for m in members.split(",")]
    res = compare([load_run(s, severities) for s in specs], a.base_version, groups)
    if a.out_json:
        with open(a.out_json, "w", encoding="utf-8") as f:
            json.dump(res, f, indent=1)
            f.write("\n")
    md = markdown(res)
    if a.out_md:
        with open(a.out_md, "w", encoding="utf-8") as f:
            f.write(md)
    else:
        sys.stdout.write(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
