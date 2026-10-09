#!/usr/bin/env python3
"""Aggregate judge-panel scores for one BookReel edition (Python 3.12, stdlib only).

Input  : raw judgments, a JSON list of {judge, page, scores, ships, what_works, defects}
         (the judge-workflow.js result), or a run-8 style judge-scores.json (one judge:
         entries have no "judge" key and count as judge 1).
Options: --judge-dir DIR  reads DIR/page-NN.json for the page status
         --plan FILE      plan.json, maps page -> section (tale)
         --baseline FILE  a JSON produced by this script (docs/rebuild/baselines/run8.json)
Output : --out-json FILE and --out-md FILE.

Failed pages (status != accepted, or every score 0): the page never ships, its
criterion scores count as 0 in every mean (a failed page is a real gap in the book,
D11), and it is listed in `failed_pages`. `accepted_only` repeats the means without
them. Run 8 judged only accepted pages (page 36 was judged after its retry), so its
baseline is the same either way.
"""
import argparse
import json
import re
import statistics
import sys
from collections import Counter, defaultdict

SCHEMA = "bookreel-judge-aggregate.v1"
CRITERIA = ["legibility", "reading_flow", "speaker_attribution", "continuity",
            "variety", "page_turn", "fidelity", "beat_without_prose_wall"]
SEVERITIES = ["blocker", "major", "minor"]
OWNERS = ["writer", "renderer", "plan", "understanding"]

# Strict ship bar per page (craft.md section (g)).
MIN_CRITERION, MIN_LEGIBILITY, MIN_FIDELITY, MIN_MEAN = 3, 4, 4, 3.5
# Gate-2 pass bar (run 8 is the baseline).
GATE_OVERALL_ABOVE = 3.37
GATE_CONTINUITY_ABOVE = 2.43
GATE_MAX_CRITERION_DROP = 0.2


def mean(values):
    values = list(values)
    return sum(values) / len(values) if values else 0.0


def r2(x):
    return round(x + 1e-12, 2)


def meets_strict_bar(scores):
    """Strict ship bar applied to a dict of 8 criterion scores."""
    return (min(scores.values()) >= MIN_CRITERION
            and scores["legibility"] >= MIN_LEGIBILITY
            and scores["fidelity"] >= MIN_FIDELITY
            and mean(scores.values()) >= MIN_MEAN)


def load_judgments(data):
    if isinstance(data, dict):
        for key in ("judgments", "pages", "result"):
            if isinstance(data.get(key), list):
                data = data[key]
                break
    if not isinstance(data, list):
        raise ValueError("judgments must be a JSON list")
    out = []
    for item in data:
        if not item:
            continue
        missing = [c for c in CRITERIA if c not in item.get("scores", {})]
        if missing:
            raise ValueError(f"page {item.get('page')}: missing criteria {missing}")
        out.append({"judge": item.get("judge", 1), "page": int(item["page"]),
                    "scores": {c: float(item["scores"][c]) for c in CRITERIA},
                    "ships": bool(item.get("ships")), "what_works": item.get("what_works", ""),
                    "defects": item.get("defects") or []})
    return out


def read_status(judge_dir, page):
    if not judge_dir:
        return None
    try:
        with open(f"{judge_dir}/page-{page:02d}.json", encoding="utf-8") as f:
            return json.load(f).get("status")
    except (OSError, ValueError):
        return None


def aggregate(judgments, statuses=None, page_section=None, label=""):
    statuses = statuses or {}
    page_section = page_section or {}
    by_page = defaultdict(list)
    for j in judgments:
        by_page[j["page"]].append(j)
    judges = sorted({j["judge"] for j in judgments})
    pages = []
    for pn in sorted(by_page):
        js = by_page[pn]
        status = statuses.get(pn)
        failed = (status is not None and status != "accepted") or \
            all(all(v == 0 for v in j["scores"].values()) for j in js)
        if failed:
            panel = {c: 0.0 for c in CRITERIA}
        else:
            panel = {c: mean(j["scores"][c] for j in js) for c in CRITERIA}
        page_mean = mean(panel.values())
        strict = (not failed) and meets_strict_bar(panel)
        majority = (not failed) and sum(j["ships"] for j in js) * 2 > len(js)
        pages.append({"page": pn, "section": page_section.get(pn), "status": status or ("failed" if failed else "accepted"),
                      "failed": failed, "judges": len(js), "panel": {c: round(v, 8) for c, v in panel.items()},
                      "mean": round(page_mean, 8), "ships_strict": strict, "ships_majority": majority,
                      "judge_ships": [j["ships"] for j in js]})

    def stats(rows):
        return {"pages": len(rows),
                "criteria": {c: round(mean(p["panel"][c] for p in rows), 8) for c in CRITERIA},
                "overall": round(mean(p["mean"] for p in rows), 8)}

    base = stats(pages) if pages else {"pages": 0, "criteria": {c: 0 for c in CRITERIA}, "overall": 0}
    accepted = [p for p in pages if not p["failed"]]
    defects = [d for j in judgments for d in j["defects"]]
    n_judges = max(len(judges), 1)
    sections = defaultdict(list)
    for p in pages:
        sections[p["section"] or "unknown"].append(p)
    return {
        "schema": SCHEMA, "label": label, "judges": len(judges), "pages": len(pages),
        "ships_strict": sum(p["ships_strict"] for p in pages),
        "ships_majority": sum(p["ships_majority"] for p in pages),
        "mean_ge_3_5_no_criterion_below_3": sum(
            1 for p in pages if not p["failed"] and min(p["panel"].values()) >= MIN_CRITERION and p["mean"] >= MIN_MEAN),
        "criteria": base["criteria"], "overall": base["overall"],
        "accepted_only": stats(accepted) if accepted else None,
        "failed_pages": [p["page"] for p in pages if p["failed"]],
        "pages_below_3": {c: [p["page"] for p in pages if p["panel"][c] < 3] for c in CRITERIA},
        "defects": {
            "total": len(defects), "per_judge": round(len(defects) / n_judges, 2),
            "by_owner": {o: sum(1 for d in defects if d.get("owner") == o) for o in OWNERS},
            "by_severity": {s: sum(1 for d in defects if d.get("severity") == s) for s in SEVERITIES},
            "blockers_by_owner": {o: sum(1 for d in defects if d.get("owner") == o and d.get("severity") == "blocker") for o in OWNERS},
        },
        "sections": {k: {**stats(v), "ships_strict": sum(p["ships_strict"] for p in v)} for k, v in sorted(sections.items())},
        "page_rows": pages,
    }


def compare(cur, base):
    """Gate-2 verdict of `cur` against `base` (both aggregate outputs)."""
    deltas = {c: round(cur["criteria"][c] - base["criteria"][c], 4) for c in CRITERIA}
    checks = {
        "ship_bar_pages_above_baseline": {"value": cur["ships_strict"], "baseline": base["ships_strict"],
                                          "pass": cur["ships_strict"] > base["ships_strict"]},
        "overall_mean_above_3.37": {"value": cur["overall"], "bar": GATE_OVERALL_ABOVE,
                                    "pass": cur["overall"] > GATE_OVERALL_ABOVE},
        "continuity_above_2.43": {"value": cur["criteria"]["continuity"], "bar": GATE_CONTINUITY_ABOVE,
                                  "pass": cur["criteria"]["continuity"] > GATE_CONTINUITY_ABOVE},
        "no_criterion_more_than_0.2_below_baseline": {
            "worst_delta": min(deltas.values()),
            "failing": [c for c, d in deltas.items() if d < -GATE_MAX_CRITERION_DROP],
            "pass": all(d >= -GATE_MAX_CRITERION_DROP for d in deltas.values())},
    }
    return {"baseline_label": base.get("label"), "deltas": deltas,
            "overall_delta": round(cur["overall"] - base["overall"], 4),
            "ships_strict_delta": cur["ships_strict"] - base["ships_strict"],
            "defects_delta": cur["defects"]["total"] - base["defects"]["total"],
            "defects_per_judge_delta": round(cur["defects"]["per_judge"] - base["defects"]["per_judge"], 2),
            "checks": checks, "gate2_pass": all(c["pass"] for c in checks.values())}


def markdown(res):
    L = []
    w = L.append
    w(f"# Judge panel report{': ' + res['label'] if res['label'] else ''}\n")
    w(f"{res['judges']} judge(s), {res['pages']} pages. Strict ship bar: **{res['ships_strict']}/{res['pages']}**; "
      f"judges' majority `ships`: {res['ships_majority']}/{res['pages']}; "
      f"mean >= 3.5 with no criterion below 3: {res['mean_ge_3_5_no_criterion_below_3']}.\n")
    w(f"Overall mean (panel means): **{r2(res['overall'])}** (exact {res['overall']:.4f}).\n")
    if res["failed_pages"]:
        w(f"Failed pages (never ship, count as 0 in the means): {res['failed_pages']}. "
          f"Overall over accepted pages only: {r2(res['accepted_only']['overall']) if res['accepted_only'] else 'n/a'}.\n")
    w("## Criteria\n")
    w("| Criterion | Mean | Pages below 3 |\n|---|---|---|")
    for c in CRITERIA:
        w(f"| {c} | {r2(res['criteria'][c])} | {len(res['pages_below_3'][c])} |")
    d = res["defects"]
    w(f"\n## Defects\n\nTotal {d['total']} ({d['per_judge']} per judge). By owner: "
      + ", ".join(f"{o} {n}" for o, n in d["by_owner"].items()) + ". By severity: "
      + ", ".join(f"{s} {n}" for s, n in d["by_severity"].items()) + ". Blockers by owner: "
      + ", ".join(f"{o} {n}" for o, n in d["blockers_by_owner"].items()) + ".\n")
    w("## Sections (tales)\n\n| Section | Pages | Mean | Strict ships |\n|---|---|---|---|")
    for k, v in res["sections"].items():
        w(f"| {k} | {v['pages']} | {r2(v['overall'])} | {v['ships_strict']} |")
    cmp_ = res.get("comparison")
    if cmp_:
        w(f"\n## Comparison with baseline {cmp_['baseline_label'] or ''}\n")
        w(f"Overall delta {cmp_['overall_delta']:+.2f}; strict ships delta {cmp_['ships_strict_delta']:+d}; "
          f"defects delta {cmp_['defects_delta']:+d} ({cmp_['defects_per_judge_delta']:+.2f} per judge).\n")
        w("| Criterion | Delta |\n|---|---|")
        for c in CRITERIA:
            w(f"| {c} | {cmp_['deltas'][c]:+.2f} |")
        w("\n### Gate 2\n")
        for name, chk in cmp_["checks"].items():
            w(f"- {'PASS' if chk['pass'] else 'FAIL'}: {name} ({ {k: v for k, v in chk.items() if k != 'pass'} })")
        w(f"\n**Gate 2: {'PASS' if cmp_['gate2_pass'] else 'FAIL'}**")
    w("\n## Pages\n\n| Page | Section | Status | Mean | Strict | Majority | Weakest criterion |\n|---|---|---|---|---|---|---|")
    for p in res["page_rows"]:
        weak = min(p["panel"], key=lambda c: p["panel"][c])
        w(f"| {p['page']} | {p['section'] or ''} | {p['status']} | {r2(p['mean'])} | {'yes' if p['ships_strict'] else 'no'} | "
          f"{'yes' if p['ships_majority'] else 'no'} | {weak} {r2(p['panel'][weak])} |")
    return "\n".join(L) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("judgments")
    ap.add_argument("--judge-dir")
    ap.add_argument("--plan")
    ap.add_argument("--baseline")
    ap.add_argument("--label", default="")
    ap.add_argument("--out-json")
    ap.add_argument("--out-md")
    a = ap.parse_args(argv)
    with open(a.judgments, encoding="utf-8") as f:
        judgments = load_judgments(json.load(f))
    statuses = {}
    if a.judge_dir:
        for pn in {j["page"] for j in judgments}:
            s = read_status(a.judge_dir, pn)
            if s is not None:
                statuses[pn] = s
    page_section = {}
    if a.plan:
        with open(a.plan, encoding="utf-8") as f:
            page_section = {int(p["page_number"]): p.get("section_id") for p in json.load(f)["pages"]}
    res = aggregate(judgments, statuses, page_section, a.label)
    if a.baseline:
        with open(a.baseline, encoding="utf-8") as f:
            res["comparison"] = compare(res, json.load(f))
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
