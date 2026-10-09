import json,sys
from join import load
tag_files=sys.argv[1]  # prefix: old or new
rows=[]
for tag in ['p0','ci','r8']:
    d=json.load(open(f'{tag_files}-{tag}.json'))
    j,pg=load(tag)
    judged=set(r['page'] for r in j)
    for p in d['panels']:
        if p['page'] not in judged or p['panel'] in('page','CRASH'): continue
        bad=len(pg[p['page']]['hero'])
        for f in p['figures']:
            rows.append((tag,p['page'],p['panel'],p['shot'],f,bad))
# hero stats
import statistics as st
def q(v):
    v=sorted(v); 
    return [round(v[int(len(v)*x)],1) for x in (0.05,0.25,0.5,0.75)] if v else []
for label,cond in [('bad pages (>=2 hero defects)',lambda b:b>=2),('good pages (0 hero defects)',lambda b:b==0)]:
    h=[f['headR'] for t,pg_,pn,sh,f,b in rows if f['hero'] and cond(b) and sh not in('establishing',)]
    print(label,len(h),'hero headR quantiles 5/25/50/75',q(h))
    h=[f['inFrame'] for t,pg_,pn,sh,f,b in rows if f['hero'] and cond(b)]
    print('   inFrame',len(h),q(h))
# list heroes with headR<16
small=[(t,pg_,pn,sh,f['id'],f['headR'],f['heightFrac'],f['inFrame'],b) for t,pg_,pn,sh,f,b in rows if f['hero'] and f['headR']<16 and sh!='establishing']
print(len(small),'hero<16 non-establishing')
for s in small[:60]: print(s)
