import json,re,sys,collections
B="/Volumes/Mrigesh SSD/Book-Reel-scratch/"
J={'p0':B+'launch/p0-baseline/judgments.json','ci':B+'launch/orchestrator/ci-live-p0/judgments.json','r8':B+'launch/run8-panel/judgments.json'}
KW={
 'hero':re.compile(r"tiny|speck|\bdot\b|blob|pixel|cropp|clipp|too small|barely|few px|miniscule|minuscule|illegible|unreadable|can.?t (?:be )?(?:see|read)|hard to (?:see|read|find)|microscopic|\bsmall\b",re.I),
 'tail':re.compile(r"tail|points? (?:at|to)|wrong (?:figure|speaker)|ambiguous speaker|off.?panel",re.I),
 'statue':re.compile(r"column|plinth|pedestal|street level|statue|slab",re.I),
 'setting':re.compile(r"blank|white|void|empty (?:background|panel)|no (?:background|setting)",re.I),
}
def load(tag):
    j=json.load(open(J[tag]))
    pages=collections.defaultdict(lambda:{k:[] for k in KW})
    n=collections.Counter()
    for r in j:
        n[r['page']]+=1
        for d in r.get('defects',[]):
            if d.get('owner')!='renderer': continue
            for k,rx in KW.items():
                if rx.search(d.get('what','')):
                    pages[r['page']][k].append((d['severity'],d['what'][:160]))
    return j,pages
if __name__=='__main__':
    for tag in J:
        j,pg=load(tag)
        print(tag,len(set(r['page'] for r in j)),'pages judged')
        for p in sorted(pg):
            print(' ',p,{k:len(v) for k,v in pg[p].items() if v})
