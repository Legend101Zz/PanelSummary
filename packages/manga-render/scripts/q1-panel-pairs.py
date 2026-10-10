"""Step 2 of the Q1 before/after review: crop the panels of manifest.json and build side-by-side sheets.

  python3 scripts/q1-panel-pairs.py <dir> [panelsPerSheet]

Writes <dir>/sheet-01.png ... Left is the old renderer (red frame), right the new one (green frame).
"""
import json, sys
from PIL import Image, ImageDraw
d = sys.argv[1]
per = int(sys.argv[2]) if len(sys.argv) > 2 else 5
M = json.load(open(d + '/manifest.json'))
W = 520
sheets = []
for i in range(0, len(M), per):
    chunk = M[i:i + per]
    rows = []
    for m in chunk:
        pad = 6
        b = m['bbox']; s = m['scale']
        box = (int((b['x'] - pad) * s), int((b['y'] - pad) * s), int((b['x'] + b['w'] + pad) * s), int((b['y'] + b['h'] + pad) * s))
        a = Image.open(m['old']).convert('RGB').crop(box)
        n = Image.open(m['new']).convert('RGB').crop(box)
        k = W / a.width
        a = a.resize((W, int(a.height * k))); n = n.resize((W, int(n.height * k)))
        rows.append((m['label'], a, n))
    H = sum(a.height + 30 for _, a, _ in rows) + 10
    im = Image.new('RGB', (2 * W + 50, H), 'white')
    dr = ImageDraw.Draw(im)
    y = 5
    for label, a, n in rows:
        dr.text((10, y + 4), label + '   (left: before, renderer 0.5.0; right: after, 0.6.0)', fill=(0, 0, 0))
        im.paste(a, (10, y + 24)); im.paste(n, (W + 40, y + 24))
        dr.rectangle((9, y + 23, 10 + W, y + 24 + a.height), outline=(200, 0, 0))
        dr.rectangle((W + 39, y + 23, W + 40 + W, y + 24 + n.height), outline=(0, 140, 0))
        y += a.height + 30
    f = '%s/sheet-%02d.png' % (d, len(sheets) + 1)
    im.save(f)
    sheets.append(f)
    print(f)
