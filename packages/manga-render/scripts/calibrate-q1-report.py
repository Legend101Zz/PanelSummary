"""Join the Q1 calibration logs (old and new renderer) with the judges' findings and print the tables.

  python3 scripts/calibrate-q1-report.py <calDir> [--md out.md]

<calDir> holds old-<tag>.json and new-<tag>.json from scripts/calibrate-q1.ts for tags final, g2 and g2b.
The judge findings are read from the launch scratch dir (same paths as scripts/legibility-join.py).
Kinds come from the regexes of launch/clusters/kinds2.py: hero_tiny (kind 1) and tail_wrong (kind 4).
A page is "flagged" for a kind when at least two of its three judges raised it as a blocker or major.
"""
import json, sys, statistics, collections
sys.path.insert(0, '/Volumes/Mrigesh SSD/Book-Reel-scratch/launch/clusters')
import kinds2

BASE = '/Volumes/Mrigesh SSD/Book-Reel-scratch/launch/'
JUDG = {'final': 'final-journey/judgments.json', 'g2': 'gate2-flash-ci/judgments.json', 'g2b': 'gate2b-ci/judgments.json'}
TAGS = ['final', 'g2', 'g2b']
cal = sys.argv[1]
md = sys.argv[sys.argv.index('--md') + 1] if '--md' in sys.argv else None
OUT = []
def p(s=''):
    print(s)
    OUT.append(s)

def pct(v, q):
    if not v: return float('nan')
    v = sorted(v)
    i = (len(v) - 1) * q
    lo = int(i); hi = min(lo + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (i - lo)

def dist(v, d=3):
    if not v: return 'n=0'
    return 'n=%d  p10 %.*f  p25 %.*f  median %.*f  p75 %.*f  p90 %.*f' % (len(v), d, pct(v, .1), d, pct(v, .25), d, pct(v, .5), d, pct(v, .75), d, pct(v, .9))

def load(prefix):
    rows = []
    for t in TAGS:
        j = json.load(open('%s/%s-%s.json' % (cal, prefix, t)))
        for r in j['panels']:
            r['tag'] = t
            rows.append(r)
    return rows, json.load(open('%s/%s-%s.json' % (cal, prefix, 'final')))['renderer']

old, oldv = load('old')
new, newv = load('new')

# judged kinds per (tag, page)
flag = {}
for t in TAGS:
    cnt = collections.defaultdict(lambda: collections.Counter())
    for j in json.load(open(BASE + JUDG[t])):
        for d in j['defects']:
            if d['severity'] not in ('blocker', 'major'): continue
            for k in kinds2.labels(d):
                if k in ('hero_tiny', 'tail_wrong'):
                    cnt[(t, j['page'])][k] += 1
    for key, c in cnt.items():
        flag[key] = c
def flagged(t, page, kind, n=2):
    return flag.get((t, page), {}).get(kind, 0) >= n
pages = sorted({(r['tag'], r['page']) for r in old if r['panel'] != 'CRASH'})
hero_pages = {k for k in pages if flagged(k[0], k[1], 'hero_tiny')}
tail_pages = {k for k in pages if flagged(k[0], k[1], 'tail_wrong')}
p('Renderer old: %s   new: %s' % (oldv, newv))
p('Pages: %d judged pages (final %d, g2 %d, g2b %d); flagged hero_tiny by >=2 judges: %d; flagged tail_wrong by >=2 judges: %d' % (
    len(pages), *[len([k for k in pages if k[0] == t]) for t in TAGS], len(hero_pages), len(tail_pages)))
crash = [(r['tag'], r['page']) for r in old + new if r['panel'] == 'CRASH']
p('Crashes (old+new): %d' % len(crash))
p()

def figs(rows, pred=lambda r, f: True):
    for r in rows:
        if r['panel'] == 'CRASH': continue
        for f in r['figures']:
            if pred(r, f): yield r, f

def heroes(rows, nonEst=True, shots=None):
    return [(r, f) for r, f in figs(rows) if f['hero'] and (not nonEst or r['shot'] != 'establishing') and (shots is None or r['shot'] in shots)]

def table(title, fn, rows_old, rows_new, d=3, extra=None):
    p('%s' % title)
    p('  old: ' + dist(fn(rows_old), d))
    p('  new: ' + dist(fn(rows_new), d))

p('## 1. Hero size (hero = named in the beat, a speaker, or the only figure; establishing shots excluded)')
H0 = heroes(old); H1 = heroes(new)
p('hero figures: old %d, new %d (the panels are the same; heroes are the same figures)' % (len(H0), len(H1)))
def share(H, key, thr, below=True):
    n = sum(1 for _, f in H if (f[key] < thr if below else f[key] >= thr))
    return '%d (%.1f%%)' % (n, 100.0 * n / max(1, len(H)))
p('Body box share of the panel area (clipped to the panel):')
p('  old: ' + dist([f['areaFrac'] for _, f in H0]))
p('  new: ' + dist([f['areaFrac'] for _, f in H1]))
p('Body height share of the panel height:')
p('  old: ' + dist([f['heightFrac'] for _, f in H0]))
p('  new: ' + dist([f['heightFrac'] for _, f in H1]))
p('Head radius (page units):')
p('  old: ' + dist([f['headR'] for _, f in H0], 1))
p('  new: ' + dist([f['headR'] for _, f in H1], 1))
p()
p('Hero figures under a size line (count and share of heroes):')
p('| line | old | new |')
p('|---|---|---|')
for key, thr in (('areaFrac', 0.03), ('areaFrac', 0.05), ('areaFrac', 0.08), ('heightFrac', 0.3), ('heightFrac', 0.4), ('headR', 12), ('headR', 16), ('headR', 22)):
    p('| %s under %s | %s | %s |' % (key, thr, share(H0, key, thr), share(H1, key, thr)))
p()
p('By shot (median body height share of the panel, hero figures):')
p('| shot | n | old median | new median | old p10 | new p10 |')
p('|---|---|---|---|---|---|')
for shot in ('wide', 'full', 'medium', 'close', 'insert'):
    a = [f['heightFrac'] for r, f in H0 if r['shot'] == shot]
    b = [f['heightFrac'] for r, f in H1 if r['shot'] == shot]
    if a: p('| %s | %d | %.2f | %.2f | %.2f | %.2f |' % (shot, len(a), pct(a, .5), pct(b, .5), pct(a, .1), pct(b, .1)))
p()
p('Judge-flagged pages (hero_tiny by >=2 judges) vs the other pages, hero body share of the panel (median per hero figure):')
for name, sel in (('flagged', lambda r: (r['tag'], r['page']) in hero_pages), ('not flagged', lambda r: (r['tag'], r['page']) not in hero_pages)):
    a = [f['areaFrac'] for r, f in H0 if sel(r)]
    b = [f['areaFrac'] for r, f in H1 if sel(r)]
    p('  %s: figures %d  old median %.3f -> new median %.3f   old under-0.05 %d -> new %d' % (name, len(a), pct(a, .5), pct(b, .5), sum(x < .05 for x in a), sum(x < .05 for x in b)))
p()
p('## 2. Heads cut by the panel edge (head circle less than 85 percent inside the panel; deliberate headCropped statues excluded)')
def cut(rows):
    return [(r, f) for r, f in figs(rows) if not f['headCropped'] and f['headInside'] < 0.85]
c0 = cut(old); c1 = cut(new)
p('figures with a cut head: old %d, new %d (of %d figures)' % (len(c0), len(c1), len(list(figs(old)))))
c0h = [1 for r, f in c0 if f['hero']]; c1h = [1 for r, f in c1 if f['hero']]
p('  of which heroes: old %d, new %d' % (len(c0h), len(c1h)))
p('panels with at least one cut head: old %d, new %d' % (len({(r['tag'], r['page'], r['panel']) for r, f in c0}), len({(r['tag'], r['page'], r['panel']) for r, f in c1})))
p()
p('## 3. Balloon tails (speaker drawn, tail not off-panel)')
def tails(rows):
    out = []
    for r in rows:
        if r['panel'] == 'CRASH': continue
        for t in r['tails']:
            if t['drawn'] and not t['offPanel']: out.append((r, t))
    return out
T0 = tails(old); T1 = tails(new)
p('tails: old %d, new %d' % (len(T0), len(T1)))
p('Tip to mouth anchor (head radii):')
p('  old: ' + dist([t['mouthDist'] for _, t in T0], 2))
p('  new: ' + dist([t['mouthDist'] for _, t in T1], 2))
p('| line | old | new |')
p('|---|---|---|')
def nshare(T, fn):
    n = sum(1 for _, t in T if fn(t))
    return '%d (%.1f%%)' % (n, 100.0 * n / max(1, len(T)))
for thr in (2, 3, 4, 6):
    p('| tip more than %d head radii from the mouth | %s | %s |' % (thr, nshare(T0, lambda t: t['mouthDist'] > thr), nshare(T1, lambda t: t['mouthDist'] > thr)))
def amb(T, thr):
    n = sum(1 for _, t in T if t.get('margin') is not None and t['margin'] < thr)
    m = sum(1 for _, t in T if t.get('margin') is not None)
    return '%d of %d (%.1f%%)' % (n, m, 100.0 * n / max(1, m))
p('| tip not clearly nearer its speaker than another head (margin under 0.5 speaker head radii) | %s | %s |' % (amb(T0, 0.5), amb(T1, 0.5)))
p('| tip nearer another head than its speaker (margin under 0) | %s | %s |' % (amb(T0, 0.0), amb(T1, 0.0)))
p('| nearest head to the tip is NOT the speaker | %s | %s |' % (nshare(T0, lambda t: t['nearestIsSpeaker'] is False), nshare(T1, lambda t: t['nearestIsSpeaker'] is False)))
BOWED = {'bow', 'cower', 'cover_face', 'kneel', 'lie', 'sit', 'cry'}
for name, fn in (('speaker is bowed/kneeling/lying/sitting', lambda t: t['speakerPose'] in BOWED), ('speaker is a crowd', lambda t: t['speakerKind'] == 'crowd'), ('speaker is a small creature (bird/insect/animal)', lambda t: t['speakerKind'] in ('bird', 'insect', 'animal'))):
    a = [t['mouthDist'] for _, t in T0 if fn(t)]; b = [t['mouthDist'] for _, t in T1 if fn(t)]
    p('%s: old n=%d median %.2f p90 %.2f wrong-nearest %s | new n=%d median %.2f p90 %.2f wrong-nearest %s' % (
        name, len(a), pct(a, .5), pct(a, .9), nshare([x for x in T0 if fn(x[1])], lambda t: t['nearestIsSpeaker'] is False),
        len(b), pct(b, .5), pct(b, .9), nshare([x for x in T1 if fn(x[1])], lambda t: t['nearestIsSpeaker'] is False)))
p()
p('Judge-flagged tail_wrong pages (>=2 judges) vs the others:')
for name, sel in (('flagged', lambda r: (r['tag'], r['page']) in tail_pages), ('not flagged', lambda r: (r['tag'], r['page']) not in tail_pages)):
    a = [t for r, t in T0 if sel(r)]; b = [t for r, t in T1 if sel(r)]
    p('  %s: tails old %d new %d | wrong-nearest old %d -> new %d | >3 radii old %d -> new %d' % (
        name, len(a), len(b), sum(1 for t in a if t['nearestIsSpeaker'] is False), sum(1 for t in b if t['nearestIsSpeaker'] is False), sum(1 for t in a if t['mouthDist'] > 3), sum(1 for t in b if t['mouthDist'] > 3)))
p()
p('## 4. Key props (height share of the panel, non-establishing panels)')
def kp(rows):
    return [k['heightFrac'] for r in rows if r['panel'] != 'CRASH' and r['shot'] != 'establishing' for k in r['keyProps']]
p('  old: ' + dist(kp(old)))
p('  new: ' + dist(kp(new)))
p()
p('## 5. Issue codes per panel (renderer warnings), old -> new')
def codes(rows):
    c = collections.Counter()
    for r in rows:
        if r['panel'] == 'CRASH': continue
        for x in r['codes']: c[x] += 1
    return c
c0 = codes(old); c1 = codes(new)
for k in sorted(set(c0) | set(c1)):
    p('  %s: %d -> %d' % (k, c0[k], c1[k]))
if md:
    open(md, 'w').write('\n'.join(OUT) + '\n')
