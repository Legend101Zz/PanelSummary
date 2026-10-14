"""Gate 2a: join figure sizes (tiny-figures-measure.ts) with the judges' hero_tiny defects.
Usage: python3 tiny-figures-join.py before.json"""
import json, sys, os, itertools, collections
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../scripts/acceptance/judge"))
import kinds
V2="/Volumes/Mrigesh SSD/Book-Reel-scratch/v02/"; V3="/Volumes/Mrigesh SSD/Book-Reel-scratch/v03/gate1-tuning/"
def path(run): return (V2+run[4:]) if run.startswith("v02/") else (V3+run[4:])
d=json.load(open(sys.argv[1])); rows=d["rows"]
CRIT=["legibility","reading_flow","speaker_attribution","continuity","variety","page_turn","fidelity","beat_without_prose_wall"]
pj={}   # (run,page) -> dict(hit, any, good, n)
for run in sorted({r["run"] for r in rows}|{p["run"] for p in d["pages"]}):
    f=path(run)+"/judgments.json"
    if not os.path.exists(f): continue
    by=collections.defaultdict(list)
    for j in json.load(open(f)): by[j["page"]].append(j)
    for pg,js in by.items():
        hit=any(x["severity"] in("major","blocker") and "hero_tiny" in kinds.labels(x) for j in js for x in j["defects"])
        anyd=any("hero_tiny" in kinds.labels(x) for j in js for x in j["defects"])
        m=[sum(j["scores"][c] for j in js)/len(js) for c in CRIT]
        good=all(v>=3 for v in m) and sum(m)/8>=3.5
        pj[(run,pg)]={"hit":hit,"any":anyd,"good":good,"n":len(js),"nd":sum(1 for j in js for x in j["defects"] if x["severity"] in("major","blocker") and "hero_tiny" in kinds.labels(x))}
J=[k for k in pj]
print("judged pages",len(J),"judge-pages",sum(v["n"] for v in pj.values()),"hero_tiny blocker/major defects",sum(v["nd"] for v in pj.values()),"rate/judge-page %.3f"%(sum(v["nd"] for v in pj.values())/sum(v["n"] for v in pj.values())),"hit pages",sum(v["hit"] for v in pj.values()),"good pages",sum(v["good"] for v in pj.values()))
rows=[r for r in rows if (r["run"],r["page"]) in pj]
# figure size distribution by shot and role
def q(a,p): a=sorted(a); return a[int(p*(len(a)-1))] if a else None
print("\nFigure height share (of panel height) by shot x role: n, p10, p25, median; head radius median")
for shot in ["establishing","wide","full","medium","close","extreme_close","insert"]:
    for role in ["speaker","named","labelled","other"]:
        a=[r for r in rows if r["shot"]==shot and r["role"]==role]
        if len(a)>=5: print(f"  {shot:13s}{role:9s} n={len(a):4d} p10={q([r['hShare'] for r in a],.1):.2f} p25={q([r['hShare'] for r in a],.25):.2f} med={q([r['hShare'] for r in a],.5):.2f} head_med={q([r['head'] for r in a],.5):.1f}")
def evaluate(name,pred):
    flagged=set(); firings=0
    for r in rows:
        if pred(r): flagged.add((r["run"],r["page"])); firings+=1
    F=[k for k in J if k in flagged]; U=[k for k in J if k not in flagged]
    E=len(F); hitF=sum(pj[k]["hit"] for k in F); hitU=sum(pj[k]["hit"] for k in U)
    P=hitF/E if E else 0; base=hitU/len(U) if U else 0
    good=[k for k in J if pj[k]["good"]]; C=sum(1 for k in good if k in flagged)/len(good)
    rec=hitF/max(1,sum(pj[k]["hit"] for k in J))
    ok=E>=10 and P>=.6 and (P-base)>=.2 and C<=.25
    print(f"  {name:48s} E={E:3d} P={P:5.0%} base={base:5.0%} L={100*(P-base):+4.0f} C={C:4.0%} recall={rec:4.0%} firings={firings:3d} {'PASS' if ok else 'fail'}")
print("\nRules (page flagged when any figure meets it); judged pages with a hit:",sum(pj[k]['hit'] for k in J),"of",len(J))
inplay=lambda r: not r["cropped"] and r["shot"]!="establishing"
for t in [.15,.2,.25,.3,.35,.4]:
    evaluate(f"speaker/named hShare<{t} (non-establishing)",lambda r,t=t: inplay(r) and r["role"] in("speaker","named") and r["hShare"]<t)
for t in [.15,.2,.25,.3]:
    evaluate(f"speaker/named tight<{t} (non-est.)",lambda r,t=t: inplay(r) and r["role"] in("speaker","named") and r["tight"]<t)
for t in [.12,.15,.2]:
    evaluate(f"any planned hShare<{t} (non-est.)",lambda r,t=t: inplay(r) and r["hShare"]<t)
for t in [12,16,20,22,26,30]:
    evaluate(f"speaker/named head<{t} (non-est.)",lambda r,t=t: inplay(r) and r["role"] in("speaker","named") and r["head"]<t)
for t in [12,16,20]:
    evaluate(f"any planned head<{t} (non-est.)",lambda r,t=t: inplay(r) and r["head"]<t)
for t in [.25,.3,.35]:
    evaluate(f"speaker/named hShare<{t} in medium/close/full",lambda r,t=t: r["shot"] in("medium","close","full") and not r["cropped"] and r["role"] in("speaker","named") and r["hShare"]<t)
for t in [.2,.25,.3]:
    evaluate(f"speaker/named hShare<{t} in wide",lambda r,t=t: r["shot"]=="wide" and not r["cropped"] and r["role"] in("speaker","named") and r["hShare"]<t)
evaluate("existing HERO_TOO_SMALL or SPEAKER_TOO_SMALL (panel)",lambda r: "HERO_TOO_SMALL" in r["pcodes"] or "SPEAKER_TOO_SMALL" in r["pcodes"])
