#!/usr/bin/env python3
"""
Track W1 (v0.3): the join of the page and plan flags with the judges, and every table of docs/v0.3/W1-writer.md.
No model call. Usage:

  npx tsx scripts/calibrate-w1.ts FLAGS.json
  python3 scripts/calibrate-w1-join.py FLAGS.json > W1-tables.txt

The judged data are the saved v0.2 runs (Book-Reel-scratch/v02 on the build machine). Defect kinds come from
scripts/acceptance/judge/kinds.py (the v0.1 rules, unchanged). A judged-good page, the hit and the D26 tests are
those of docs/v0.2/Q2a-writer-checks.md sections 2 and 3.
"""
import collections, glob, json, math, os, random, re, statistics as st, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "scripts", "acceptance", "judge"))
import kinds  # noqa: E402

V = "/Volumes/Mrigesh SSD/Book-Reel-scratch/v02"
RUNS = {"run2": "live/run2", "run3": "live/run3", "run4": "live/run4", "run5": "live/run5", "run6": "live/run6",
        "run8": "live/run8", "fj": "final-journey", "fj2": "final-journey-2", "v01": "v01-holdout"}
JUST_SO = ["run6", "fj", "fj2", "v01"]
CRIT = ["legibility", "reading_flow", "speaker_attribution", "continuity", "variety", "page_turn", "fidelity", "beat_without_prose_wall"]
flags = {(r["run"], r["page"]): r["flags"] for r in json.load(open(sys.argv[1]))}


def load(name):
    d = f"{V}/{RUNS[name]}"
    e = d + "/export"
    plan = json.load(open(e + "/plan.json"))
    plan = plan.get("plan", plan)
    units = {u["id"]: u for u in json.load(open(e + "/units.json"))}
    js = json.load(open(d + "/judgments.json"))
    last = {}
    for q in plan["pages"]:
        last[q["section_id"]] = q["page_number"]
    out = []
    for f in sorted(glob.glob(e + "/judge/page-*.json")):
        j = json.load(open(f))
        if not j.get("spec"):
            continue
        pn = j["page_number"]
        pl = [q for q in plan["pages"] if q["page_number"] == pn]
        mine = [x for x in js if x["page"] == pn]
        if not pl or not mine:
            continue
        p = dict(run=name, page=pn, planned=pl[0], spec=j["spec"], judges=mine, warnings=j.get("warnings") or [], units=units,
                 sectlast=last[pl[0]["section_id"]] == pn, fl=flags[(name, pn)])
        p["means"] = {c: st.mean(x["scores"][c] for x in mine) for c in CRIT}
        ml = list(p["means"].values())
        p["good"] = st.mean(ml) >= 3.5 and min(ml) >= 3
        p["kinds"] = {k: sum(1 for x in mine if any(d["severity"] != "minor" and k in kinds.labels(d) for d in x["defects"])) for k in kinds.KINDS}
        out.append(p)
    return out


pages = [p for n in RUNS for p in load(n)]
mean = lambda x: round(st.mean(x), 3) if x else None


def d26(sub, flag, hit, label):
    fl = [p for p in sub if flag(p)]
    un = [p for p in sub if not flag(p)]
    h = sum(hit(p) for p in fl)
    b = sum(hit(p) for p in un)
    good = [p for p in sub if p["good"]]
    gf = sum(flag(p) for p in good)
    if not fl:
        print(f"{label}: no page flagged")
        return
    P, B = h / len(fl), (b / len(un) if un else float("nan"))
    t = lambda ok: "ok" if ok else "FAIL"
    print(f"{label}: E {len(fl)} {t(len(fl) >= 10)} | P {P:.0%} ({h}/{len(fl)}) {t(P >= .6)} | base {B:.0%}, L {100 * (P - B):.0f} pt {t(P - B >= .2)} | C {gf}/{len(good)} = {gf / len(good):.0%} {t(gf / len(good) <= .25)}")


def fisher(a, b, c, d):
    n = a + b + c + d
    r1, c1 = a + b, a + c
    return sum(math.comb(r1, x) * math.comb(n - r1, c1 - x) for x in range(a, min(r1, c1) + 1)) / math.comb(n, c1)


def table2x2(sub, flag, hit, label):
    a = sum(1 for p in sub if flag(p) and hit(p)); b = sum(1 for p in sub if flag(p) and not hit(p))
    c = sum(1 for p in sub if not flag(p) and hit(p)); d = sum(1 for p in sub if not flag(p) and not hit(p))
    print(f"{label}: flagged+hit {a}, flagged+no hit {b}, unflagged+hit {c}, unflagged+no hit {d}; P {a / max(1, a + b):.0%}, base {c / max(1, c + d):.0%}, one-sided Fisher p = {fisher(a, b, c, d):.3f}")


hasflag = lambda code: (lambda p: code in p["fl"])
kind = lambda k: (lambda p: p["kinds"][k] > 0)

print("## Data:", len(pages), "judged pages;", sum(p["good"] for p in pages), "judged good;", {n: sum(1 for p in pages if p["run"] == n) for n in RUNS})

print("\n## #82 page turn")
ns = [p for p in pages if not p["sectlast"]]
H = [p["means"]["page_turn"] for p in ns if p["planned"].get("page_turn_hook")]
N = [p["means"]["page_turn"] for p in ns if not p["planned"].get("page_turn_hook")]
print(f"pages {len(pages)}; plan hook on {sum(1 for p in pages if p['planned'].get('page_turn_hook'))} ({100 * sum(1 for p in pages if p['planned'].get('page_turn_hook')) // len(pages)}%); the page spec copies the plan flag on {sum(1 for p in pages if bool(p['spec'].get('page_turn_hook')) == bool(p['planned'].get('page_turn_hook')))} pages")
print("run | pages | plan hook % | page_turn mean | hook pages (not last of section) | no-hook pages | difference")
for n in RUNS:
    s = [p for p in pages if p["run"] == n]
    a = [p["means"]["page_turn"] for p in s if not p["sectlast"] and p["planned"].get("page_turn_hook")]
    b = [p["means"]["page_turn"] for p in s if not p["sectlast"] and not p["planned"].get("page_turn_hook")]
    print(f"{n} | {len(s)} | {100 * sum(1 for p in s if p['planned'].get('page_turn_hook')) // len(s)} | {mean([p['means']['page_turn'] for p in s])} | {len(a)}: {mean(a)} | {len(b)}: {mean(b)} | {round(st.mean(a) - st.mean(b), 3) if a and b else '-'}")
print(f"ALL | {len(pages)} | | {mean([p['means']['page_turn'] for p in pages])} | {len(H)}: {mean(H)} | {len(N)}: {mean(N)} | {round(st.mean(H) - st.mean(N), 3)}")
random.seed(1)
d = sorted(st.mean(random.choices(H, k=len(H))) - st.mean(random.choices(N, k=len(N))) for _ in range(5000))
print(f"bootstrap 95% interval of the difference: {d[125]:.3f} to {d[4875]:.3f}; pages of the last page of a section: {sum(p['sectlast'] for p in pages)} (mean {mean([p['means']['page_turn'] for p in pages if p['sectlast']])})")
print(f"share of pages with page_turn mean <= 3: hook {sum(x <= 3 for x in H) / len(H):.0%}, no hook {sum(x <= 3 for x in N) / len(N):.0%}; with a page_turn defect kind: hook {sum(p['kinds']['page_turn'] > 0 for p in ns if p['planned'].get('page_turn_hook')) / len(H):.0%}, no hook {sum(p['kinds']['page_turn'] > 0 for p in ns if not p['planned'].get('page_turn_hook')) / len(N):.0%}")

def txts(panel): return [t["text"] for t in panel.get("text", []) if t["kind"] != "sfx"]
def hooky(panel): return any(re.search(r"\?|\.\.\.|…|—\s*$", t) for t in txts(panel))
def lastclaim_not_last(p):
    pc = p["planned"]["claims"]
    cm = {c["claim"]: c["panels"] for c in p["spec"].get("claim_map", [])}
    return bool(pc) and pc[-1] in cm and p["spec"]["panels"][-1]["id"] not in cm[pc[-1]]
hookpg = [p for p in ns if p["planned"].get("page_turn_hook")]
print("\nLast panel of a hook page (not last of a section), judged page_turn mean:")
feats = [("last panel has a question, an ellipsis or a cut-off dash", lambda p: hooky(p["spec"]["panels"][-1])),
         ("last planned claim is in the last panel", lambda p: not lastclaim_not_last(p)),
         ("last panel has dialogue (speech, shout, whisper)", lambda p: any(t["kind"] in ("speech", "shout", "whisper") for t in p["spec"]["panels"][-1].get("text", []))),
         ("last panel has a thought", lambda p: any(t["kind"] == "thought" for t in p["spec"]["panels"][-1].get("text", []))),
         ("last panel has a dramatized line", lambda p: any(t.get("fidelity") == "dramatized" for t in p["spec"]["panels"][-1].get("text", []))),
         ("last panel is a close or extreme close shot", lambda p: p["spec"]["panels"][-1].get("shot") in ("close", "extreme_close")),
         ("question or ellipsis only in an early panel", lambda p: any(hooky(q) for q in p["spec"]["panels"][:-1]) and not hooky(p["spec"]["panels"][-1]))]
for name, f in feats:
    a = [p["means"]["page_turn"] for p in hookpg if f(p)]
    b = [p["means"]["page_turn"] for p in hookpg if not f(p)]
    print(f"- {name}: yes {len(a)} pages, mean {mean(a)}; no {len(b)} pages, mean {mean(b)}")
pt_hit = lambda p: p["means"]["page_turn"] < 3 or p["kinds"]["page_turn"] > 0
print("\nD26 (hit: page_turn mean < 3 or a major/blocker page_turn defect kind):")
d26(pages, lambda p: not p["sectlast"] and not p["planned"].get("page_turn_hook"), pt_hit, "plan: no hook on a page that does not close a section")
d26(pages, lambda p: not p["sectlast"] and not p["planned"].get("page_turn_hook"), lambda p: p["means"]["page_turn"] <= 3, "  same page set, hit = page_turn mean <= 3")
d26(pages, hasflag("HOOK_PANEL_LARGEST"), pt_hit, "renderer HOOK_PANEL_LARGEST (existing warning)")
d26(pages, lambda p: p["planned"].get("page_turn_hook") and not p["sectlast"] and not hooky(p["spec"]["panels"][-1]), pt_hit, "page candidate: hook page, no question/ellipsis in the last panel")
d26(pages, lambda p: p["planned"].get("page_turn_hook") and not p["sectlast"] and any(hooky(q) for q in p["spec"]["panels"][:-1]) and not hooky(p["spec"]["panels"][-1]), pt_hit, "page candidate: hook spent in an early panel")
d26(pages, lambda p: p["planned"].get("page_turn_hook") and not p["sectlast"] and lastclaim_not_last(p), pt_hit, "page candidate PAGE_TURN_HOOK_NOT_LAST: last planned claim not in the last panel")

print("\n## #83 fidelity labels")
def norm(t): return re.sub(r"[^a-z0-9']+", " ", t.lower().replace("’", "'").replace("‘", "'")).strip()
def lcs_run(words, src):
    best = 0
    for i in range(len(words)):
        n = best + 1
        while i + n <= len(words) and (" " + " ".join(words[i:i + n]) + " ") in src: n += 1
        best = max(best, n - 1)
    return best
FID = re.compile(r"label|paraphras|quote|verbatim|dramati|clipp|cut\b|trimm|ellips|truncat|splic|invent|near-verbatim|literal|exact", re.I)
lines = []
for p in pages:
    src = " " + norm(" ".join(p["units"][u]["text"] for u in p["planned"]["units"] if u in p["units"])) + " "
    defs = [(x["judge"], norm(d["what"]), d) for x in p["judges"] for d in x["defects"] if d["severity"] != "minor" and FID.search(d["what"])]
    for q in p["spec"]["panels"]:
        for t in q.get("text", []):
            if t["kind"] == "sfx": continue
            w = norm(t["text"]).split()
            if len(w) < 5: continue
            cs = [" ".join(w[i:i + 4]) for i in range(len(w) - 3)]
            cited = {jid for jid, dn, d in defs if any(" " + c + " " in " " + dn + " " for c in cs)}
            kk = collections.Counter(k for jid, dn, d in defs if any(" " + c + " " in " " + dn + " " for c in cs) for k in kinds.labels(d))
            fid = t.get("fidelity")
            ell = bool(re.search(r"\.\.\.|…", t["text"]))
            frs = [norm(f).split() for f in re.split(r"\.\.\.|…|--|—", t["text"])]
            frs = [f for f in frs if f]
            verb = bool(frs) and all((" " + " ".join(f) + " ") in src for f in frs if len(f) >= 3) and any(len(f) >= 3 for f in frs)
            r = max((lcs_run(f, src) for f in frs), default=0)
            near = r >= 0.8 * len(w) and r >= 5
            cls = ("quote, cut ('...')" if ell else "quote, plain") if fid == "quote" else (("paraphrase/dramatized, verbatim in source" if verb else "paraphrase/dramatized, near-verbatim (80% run)" if near else "paraphrase/dramatized, other") if fid in ("paraphrase", "dramatized") else fid)
            lines.append(dict(cls=cls, fid=fid, cited=len(cited), kinds=kk))
by = collections.defaultdict(list)
for l in lines: by[l["cls"]].append(l)
print(f"lines of 5 or more words: {len(lines)}. A line is 'cited' when a major/blocker defect about labels, quotes or invention quotes 4 words of it.")
print("class | lines | cited | rate | cited as fidelity_label | cited as quote_clipped")
for c, v in sorted(by.items()):
    print(f"{c} | {len(v)} | {sum(1 for l in v if l['cited'])} | {sum(1 for l in v if l['cited']) / len(v):.0%} | {sum(1 for l in v if l['kinds'].get('fidelity_label'))} | {sum(1 for l in v if l['kinds'].get('quote_clipped'))}")
byfid = collections.defaultdict(lambda: [0, 0])
for l in lines:
    byfid[l["fid"]][1] += 1; byfid[l["fid"]][0] += 1 if l["cited"] else 0
print("by label: " + ", ".join(f"{k} {a}/{b} = {a / b:.0%}" for k, (a, b) in sorted(byfid.items())))
print("fidelity score mean of pages with a cut quote:", mean([p["means"]["fidelity"] for p in pages if any(t.get("fidelity") == "quote" and re.search(r"\.\.\.|…", t["text"]) for q in p["spec"]["panels"] for t in q.get("text", []))]),
      "; without:", mean([p["means"]["fidelity"] for p in pages if not any(t.get("fidelity") == "quote" and re.search(r"\.\.\.|…", t["text"]) for q in p["spec"]["panels"] for t in q.get("text", []))]))
jp = sum(len(p["judges"]) for p in pages)
for k in ("fidelity_label", "quote_clipped", "invented"):
    print(f"rate of {k} (major+blocker per judge-page): {sum(p['kinds'][k] for p in pages) / jp:.3f}")
print("\nQUOTE_CLIPPED re-measure (D26), by window of words left out:")
for code in ["QUOTE_CLIPPED@tail2-6", "QUOTE_CLIPPED@tail2-4", "QUOTE_CLIPPED@tail3-6", "QUOTE_CLIPPED@tail2-99", "QUOTE_CLIPPED@tail4-12"]:
    label = code + (" (the v0.2 window)" if code == "QUOTE_CLIPPED@tail2-6" else "")
    d26(pages, hasflag(code), kind("quote_clipped"), label + ", hit = quote_clipped kind")
    if code == "QUOTE_CLIPPED@tail2-6":
        d26(pages, hasflag(code), kind("fidelity_label"), label + ", hit = fidelity_label kind")
        d26(pages, hasflag(code), lambda p: p["means"]["fidelity"] < 3, label + ", hit = fidelity mean < 3")
        table2x2(pages, hasflag(code), kind("quote_clipped"), label + " 2x2 (quote_clipped)")

def echo_free(code_re, kindname):
    """Hit that does not come from a judge defect that names the check code or the word 'warning' (the judges read the page warnings)."""
    return lambda p: any(d["severity"] != "minor" and kindname in kinds.labels(d) and not re.search(code_re, d["what"], re.I) for x in p["judges"] for d in x["defects"])
named = [p for p in pages if any(re.search("QUOTE_CLIPPED", d["what"]) for x in p["judges"] for d in x["defects"])]
print(f"\nThe judges read the page warnings. Pages whose defects name QUOTE_CLIPPED: {len(named)}; of them flagged by the v0.2 window: {sum('QUOTE_CLIPPED@tail2-6' in p['fl'] for p in named)}.")
for code in ["QUOTE_CLIPPED@tail2-6", "QUOTE_CLIPPED@tail3-6"]:
    d26(pages, hasflag(code), echo_free(r"QUOTE_CLIPPED|warning", "quote_clipped"), code + ", hit = quote_clipped kind, defects that name the code or 'warning' left out")
named_all = sum(1 for p in pages for x in p["judges"] for d in x["defects"] if d["severity"] != "minor" and re.search(r"\b[A-Z]+_[A-Z_]{3,}\b", d["what"]))
total_all = sum(1 for p in pages for x in p["judges"] for d in x["defects"] if d["severity"] != "minor")
print(f"major/blocker defects that name a check code: {named_all} of {total_all} ({named_all / total_all:.0%})")

print("\n## #87a PLAN_LOCATION_NOT_IN_UNITS on model-written units (8 runs; the v0.1.0 hold-out has no units)")
sub = [p for p in pages if p["run"] != "v01"]
print("pages:", len(sub), "; judged good:", sum(p["good"] for p in sub))
for code in ["PLAN_LOCATION_NOT_IN_UNITS", "PLAN_PLACE_UNLISTED"]:
    d26(sub, hasflag(code), kind("setting_wrong"), code + ", hit = setting_wrong")
    table2x2(sub, hasflag(code), kind("setting_wrong"), code + " 2x2 (setting_wrong)")
    table2x2(sub, hasflag(code), lambda p: p["means"]["continuity"] < 3, code + " 2x2 (continuity mean < 3)")
    print("  per run (pages, flagged, flagged with a setting complaint): " + "; ".join(f"{n} {sum(1 for p in sub if p['run'] == n)}, {sum(1 for p in sub if p['run'] == n and code in p['fl'])}, {sum(1 for p in sub if p['run'] == n and code in p['fl'] and kind('setting_wrong')(p))}" for n in RUNS if n != "v01"))
d26(sub, lambda p: "PLAN_LOCATION_NOT_IN_UNITS" in p["fl"] or "PLAN_PLACE_UNLISTED" in p["fl"], kind("setting_wrong"), "either check, hit = setting_wrong")
d26(pages, hasflag("LOCATION_OFF_PLAN"), kind("setting_wrong"), "(reference) page check LOCATION_OFF_PLAN, all runs, hit = setting_wrong")

print("\n## #87c continuity complaints on the Just So runs (run6, final-journey, final-journey-2, v01-holdout)")
print("continuity mean per run:", {n: mean([p["means"]["continuity"] for p in pages if p["run"] == n]) for n in JUST_SO}, "; other books:", mean([p["means"]["continuity"] for p in pages if p["run"] not in JUST_SO]))
CLS = [("place", r"\bcave\b|cottage|bedroom|modern (room|interior|cottage)|picket|setting|location|\bl_[a-z_]+|indoor|interior|outdoor|outside|backdrop|background|in a (room|house)|palace|jungle|river ?bank|desert"),
       ("scale", r"scale|speck|tiny|towers?|inverted|too (big|small|large)|huge|size|dwarf"),
       ("identity", r"is (a|an) (horse|human|dove|dog|lizard|frog|man|woman|boy)|drawn as (a|an)|cast as|look\.kind|human child|reads as|does not read|nothing (on the page )?reads|looks like|resembl|wrong (animal|creature|character|cast)|species|which (animal|creature)|identity"),
       ("state", r"mud|state|intact|changes? (from|colou?r|look)|differs?|checkered|pattern|still (fully|dull|grey|wet)|already|after (he|she|it)|before (he|she|it)|stretch|hair|wet|dry|dead|alive|hurt|broken|wound")]
def classify(t):
    for n, r in CLS:
        if re.search(r, t, re.I): return n
    return "other"
res = collections.Counter(); respg = collections.defaultdict(set); own = collections.defaultdict(collections.Counter); tot = 0
for p in pages:
    if p["run"] not in JUST_SO: continue
    for x in p["judges"]:
        if x["scores"]["continuity"] <= 2:
            for d in x["defects"]:
                if d["severity"] == "minor": continue
                ks = kinds.labels(d)
                if "setting_wrong" in ks or "state_continuity" in ks or re.search(r"continu|inconsist|scale|identity", d["what"], re.I):
                    c = classify(d["what"]); res[c] += 1; respg[c].add((p["run"], p["page"])); own[c][d["owner"]] += 1; tot += 1
print(f"major/blocker continuity-related defects from judges who scored continuity <= 2: {tot}")
print("class | defects | pages | owners")
for c, v in res.most_common(): print(f"{c} | {v} | {len(respg[c])} | {dict(own[c])}")
