#!/usr/bin/env python3
"""
Track dens (v0.3, Gate 1b): joins the plan flags of scripts/calibrate-dens.ts with the judges and prints the D26
tables of docs/v0.3/W1-writer.md ('Gate 1b: plan density'). No model call.

  npx tsx scripts/calibrate-dens.ts FLAGS.json NAME=RUN_DIR ...
  python3 scripts/calibrate-dens-join.py FLAGS.json

D26 (docs/v0.2/Q2a-writer-checks.md): E >= 10 flagged pages, P >= 60% hit, L >= 20 points over unflagged pages,
C <= 25% of the judged-good pages flagged. Defect kinds: scripts/acceptance/judge/kinds.py (unchanged).
"""
import glob, json, math, os, statistics as st, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "scripts", "acceptance", "judge"))
import kinds  # noqa: E402

B = "/Volumes/Mrigesh SSD/Book-Reel-scratch"
RUNS = {"run2": "v02/live/run2", "run3": "v02/live/run3", "run4": "v02/live/run4", "run5": "v02/live/run5", "run6": "v02/live/run6",
        "run8": "v02/live/run8", "fj": "v02/final-journey", "fj2": "v02/final-journey-2", "v01": "v02/v01-holdout",
        "tt": "v03/gate1-tuning/two-tale", "tt1b": "v03/gate1-tuning/two-tale-1b", "js1b": "v03/gate1-tuning/justso-1b"}
CRIT = ["legibility", "reading_flow", "speaker_attribution", "continuity", "variety", "page_turn", "fidelity", "beat_without_prose_wall"]
flags = {(r["run"], r["page"]): r for r in json.load(open(sys.argv[1]))}
HITK = ["label_clutter", "plan_overload", "claim_not_stated"]


def load(name):
    d = f"{B}/{RUNS[name]}"
    js = json.load(open(d + "/judgments.json"))
    out = []
    for f in sorted(glob.glob(d + "/export/judge/page-*.json")):
        j = json.load(open(f))
        pn = j["page_number"]
        mine = [x for x in js if x["page"] == pn]
        fl = flags.get((name, pn))
        if not mine or not fl:
            continue
        means = {c: st.mean(x["scores"][c] for x in mine) for c in CRIT}
        ml = list(means.values())
        kc = {k: sum(1 for x in mine if any(dd["severity"] != "minor" and k in kinds.labels(dd) for dd in x["defects"])) for k in kinds.KINDS}
        out.append(dict(run=name, page=pn, f=fl, means=means, mean=st.mean(ml), good=st.mean(ml) >= 3.5 and min(ml) >= 3, kinds=kc,
                        strict=sum(1 for x in mine if x.get("ships") is False) , judges=len(mine)))
    return out


pages = [p for n in RUNS for p in load(n)]
mean = lambda x: round(st.mean(x), 3) if x else None
hit_kind = lambda p: any(p["kinds"][k] > 0 for k in HITK)
hit_low = lambda p: p["mean"] < 3.5
hit = lambda p: hit_kind(p) or hit_low(p)


def fisher(a, b, c, d):
    n = a + b + c + d
    r1, c1 = a + b, a + c
    return sum(math.comb(r1, x) * math.comb(n - r1, c1 - x) for x in range(a, min(r1, c1) + 1)) / math.comb(n, c1)


def d26(sub, flag, h, label):
    fl = [p for p in sub if flag(p)]
    un = [p for p in sub if not flag(p)]
    good = [p for p in sub if p["good"]]
    if not fl:
        print(f"| {label} | 0 | - | - | - | - | - |")
        return
    hh = sum(h(p) for p in fl); b = sum(h(p) for p in un)
    P, Bs = hh / len(fl), b / max(1, len(un))
    gf = sum(flag(p) for p in good)
    ok = lambda c: "ok" if c else "FAIL"
    L = P - Bs
    allok = len(fl) >= 10 and P >= .6 and L >= .2 and gf / len(good) <= .25
    p = fisher(hh, len(fl) - hh, b, len(un) - b)
    print(f"| {label} | E {len(fl)} {ok(len(fl) >= 10)} | P {P:.0%} ({hh}/{len(fl)}) {ok(P >= .6)} | base {Bs:.0%}, L {100 * L:.0f} pt {ok(L >= .2)} | C {gf}/{len(good)} = {gf / len(good):.0%} {ok(gf / len(good) <= .25)} | mean {mean([q['mean'] for q in fl])} vs {mean([q['mean'] for q in un])} | {'PASS' if allok else 'fail'} (Fisher p {p:.3f}) |")


print(f"## Data: {len(pages)} judged pages ({sum(p['good'] for p in pages)} judged good, {sum(hit(p) for p in pages)} hit = prose/overload/claim-not-stated defect or mean < 3.5;"
      f" {sum(hit_kind(p) for p in pages)} by defect kind, {sum(hit_low(p) for p in pages)} by mean < 3.5)")
print("runs:", {n: sum(1 for p in pages if p["run"] == n) for n in RUNS})

print("\n## Pages by claim count (all judged pages)")
print("claims | pages | mean | beat_without_prose_wall | strict-ship share (any judge) | hit% | label_clutter pages | plan_overload pages | claim_not_stated pages | mean beat words")
for n in range(0, 6):
    s = [p for p in pages if p["f"]["mix"]["total"] == n] if n < 5 else [p for p in pages if p["f"]["mix"]["total"] >= 5]
    if not s:
        continue
    print(f"{n if n < 5 else '5+'} | {len(s)} | {mean([p['mean'] for p in s])} | {mean([p['means']['beat_without_prose_wall'] for p in s])} | {sum(p['strict'] > 0 for p in s) / len(s):.0%} | {sum(hit(p) for p in s) / len(s):.0%} | {sum(p['kinds']['label_clutter'] > 0 for p in s)} | {sum(p['kinds']['plan_overload'] > 0 for p in s)} | {sum(p['kinds']['claim_not_stated'] > 0 for p in s)} | {mean([p['f']['beat_words'] for p in s])}")

print("\n## Pages with 3+ claims by number of non-core claims")
for k in range(0, 4):
    s = [p for p in pages if p["f"]["mix"]["total"] >= 3 and (p["f"]["mix"]["total"] - p["f"]["mix"]["core"]) == k] if k < 3 else [p for p in pages if p["f"]["mix"]["total"] >= 3 and (p["f"]["mix"]["total"] - p["f"]["mix"]["core"]) >= 3]
    if s:
        print(f"non-core {k if k < 3 else '3+'}: {len(s)} pages, mean {mean([p['mean'] for p in s])}, prose wall {mean([p['means']['beat_without_prose_wall'] for p in s])}, hit {sum(hit(p) for p in s) / len(s):.0%}")

mix = lambda p: p["f"]["mix"]
cands = [
    ("(a) 3 or more claims", lambda p: mix(p)["total"] >= 3),
    ("(b) 3 or more claims, at least 1 supporting or detail", lambda p: mix(p)["total"] >= 3 and mix(p)["total"] - mix(p)["core"] >= 1),
    ("(b2) 3 or more claims, at least 2 supporting or detail", lambda p: mix(p)["total"] >= 3 and mix(p)["total"] - mix(p)["core"] >= 2),
    ("(b3) 4 or more claims", lambda p: mix(p)["total"] >= 4),
    ("(b4) 3 or more claims, at least 1 detail", lambda p: mix(p)["total"] >= 3 and mix(p)["detail"] >= 1),
]
for n in (50, 60, 65, 70, 80):
    cands.append((f"(c) beat longer than {n} words", (lambda n: lambda p: p["f"]["beat_words"] > n)(n)))
cands.append(("(d) 3 or more claims and beat longer than 60 words", lambda p: mix(p)["total"] >= 3 and p["f"]["beat_words"] > 60))

for title, h in [("hit = prose / overload / claim-not-stated defect, or page mean < 3.5 (the task's hit)", hit),
                 ("hit = prose / overload / claim-not-stated defect only", hit_kind),
                 ("hit = page mean < 3.5 only", hit_low)]:
    print(f"\n## D26, {title}")
    print("| candidate | E | P | L | C | page mean flagged vs unflagged | D26 |")
    print("|---|---|---|---|---|---|---|")
    for lab, fn in cands:
        d26(pages, fn, h, lab)

print("\n## Per run: candidate (b) and (a), P of the task's hit (flagged pages) vs unflagged")
print("run | pages | (a) flagged: n, hit% | (a) unflagged hit% | (b) flagged: n, hit% | (b) unflagged hit%")
for n in RUNS:
    s = [p for p in pages if p["run"] == n]
    row = [n, len(s)]
    for fn in (cands[0][1], cands[1][1]):
        f = [p for p in s if fn(p)]; u = [p for p in s if not fn(p)]
        row += [f"{len(f)}, {sum(hit(p) for p in f) / len(f):.0%}" if f else "0, -", f"{sum(hit(p) for p in u) / len(u):.0%}" if u else "-"]
    print(" | ".join(map(str, row)))

print("\n## Leave-one-run-out for (b): P and L when the run is left out")
for n in RUNS:
    s = [p for p in pages if p["run"] != n]
    f = [p for p in s if cands[1][1](p)]; u = [p for p in s if not cands[1][1](p)]
    print(f"without {n}: E {len(f)}, P {sum(hit(p) for p in f) / len(f):.0%}, base {sum(hit(p) for p in u) / len(u):.0%}")

print("\n## Narration words and claim count are not in the judged data here; see the Gate 1b analysis for the 26 vs 17 word figure.")

print("\n## PLAN_PLACE_NOT_LISTED (the beat names a location that the page does not list)")
sw = lambda p: p["kinds"]["setting_wrong"] > 0
print("| variant | pages flagged | setting_wrong in flagged | setting_wrong in unflagged | 2x2 + Fisher p | D26 vs setting_wrong |")
for key, lab in (("places_named_plain", "name words (all)"), ("places_named", "name words, cast-name words ignored")):
    fn = lambda p, key=key: len(p["f"][key]) > 0
    a = sum(1 for p in pages if fn(p) and sw(p)); b = sum(1 for p in pages if fn(p) and not sw(p))
    c = sum(1 for p in pages if not fn(p) and sw(p)); d = sum(1 for p in pages if not fn(p) and not sw(p))
    print(f"| {lab} | {a + b} | {a}/{a + b} = {a / max(1, a + b):.0%} | {c}/{c + d} = {c / max(1, c + d):.0%} | flagged+hit {a}, flagged+no {b}, unflagged+hit {c}, unflagged+no {d}; p = {fisher(a, b, c, d):.3f} | |")
    d26(pages, fn, sw, f"D26 {lab} (hit = setting_wrong)")
    d26(pages, fn, hit, f"D26 {lab} (hit = task hit)")
    d26(pages, fn, lambda p: sw(p) or hit_low(p), f"D26 {lab} (hit = setting_wrong or mean < 3.5)")
print("\nflagged pages by run (cast-name words ignored):", {n: sum(1 for p in pages if p["run"] == n and p["f"]["places_named"]) for n in RUNS})
print("pages with beat naming no place vs flagged: total pages", len(pages))
