#!/usr/bin/env python3
"""Spike: manga layout template library -> compiled polygons -> SVG/PNG previews.

Standalone research spike for issue #5 (layout research findings) and #12 (lane C
conditioning input). Models a comfyui_panels-style iterative-cut grammar on top of
the ADR-009 LayoutNode idea: templates are parameterized trees of angled cuts;
a tiny deterministic compiler clips polygons and assigns RTL read ranks.

The production compiler is ScrollStack's (polygons/clip paths/read ranks); this
spike only proves template expressiveness and produces golden previews.

Usage: python3 spike_layout_templates.py [--out golden]
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

Point = tuple[float, float]
Poly = list[Point]

PAGE_W, PAGE_H = 800.0, 1200.0
MARGIN = 28.0
GUTTER = 7.0  # half-gutter applied per polygon edge via centroid shrink


# ---------------------------------------------------------------- geometry ---

def clip_halfplane(poly: Poly, a: float, b: float, c: float, keep_neg: bool) -> Poly:
    """Sutherland-Hodgman clip of poly against line ax+by+c=0."""
    def side(p: Point) -> float:
        v = a * p[0] + b * p[1] + c
        return -v if keep_neg else v

    out: Poly = []
    n = len(poly)
    for i in range(n):
        cur, nxt = poly[i], poly[(i + 1) % n]
        cs, ns = side(cur), side(nxt)
        if cs >= 0:
            out.append(cur)
        if (cs >= 0) != (ns >= 0):
            denom = cs - ns
            if abs(denom) > 1e-12:
                t = cs / denom
                out.append((cur[0] + t * (nxt[0] - cur[0]), cur[1] + t * (nxt[1] - cur[1])))
    return out


def bounds(poly: Poly) -> tuple[float, float, float, float]:
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


def centroid(poly: Poly) -> Point:
    x = sum(p[0] for p in poly) / len(poly)
    y = sum(p[1] for p in poly) / len(poly)
    return x, y


def shrink(poly: Poly, amount: float) -> Poly:
    """Approximate inward offset by scaling toward centroid (spike-grade gutters)."""
    cx, cy = centroid(poly)
    x0, y0, x1, y1 = bounds(poly)
    span = max(min(x1 - x0, y1 - y0), 1e-6)
    f = max(0.0, 1.0 - 2.0 * amount / span)
    return [(cx + (p[0] - cx) * f, cy + (p[1] - cy) * f) for p in poly]


def split_poly(poly: Poly, axis: str, cuts: list[dict]) -> list[Poly]:
    """Split a region by sequential angled cuts. axis 'y' stacks rows; 'x' columns."""
    x0, y0, x1, y1 = bounds(poly)
    parts: list[Poly] = []
    remaining = poly
    for cut in cuts:
        f, ang = float(cut["pos"]), math.radians(float(cut.get("angle", 0.0)))
        if axis == "y":
            yc = y0 + f * (y1 - y0)
            xc = (x0 + x1) / 2.0
            # line: y = yc + tan(ang) * (x - xc)  ->  tan*x - y + (yc - tan*xc) = 0
            # v > 0 above the line (smaller y); keep above first, remainder below.
            a, b, c = math.tan(ang), -1.0, yc - math.tan(ang) * xc
            first = clip_halfplane(remaining, a, b, c, keep_neg=False)  # above line
            remaining = clip_halfplane(remaining, a, b, c, keep_neg=True)
        else:
            xc = x0 + f * (x1 - x0)
            yc = (y0 + y1) / 2.0
            # line: x = xc + tan(ang) * (y - yc)
            a, b, c = 1.0, -math.tan(ang), -(xc - math.tan(ang) * yc)
            first = clip_halfplane(remaining, a, b, c, keep_neg=True)   # left of line
            remaining = clip_halfplane(remaining, a, b, c, keep_neg=False)
        if len(first) >= 3:
            parts.append(first)
    if len(remaining) >= 3:
        parts.append(remaining)
    return parts


# ---------------------------------------------------------------- compiler ---

def compile_node(node: dict, region: Poly, out: list[dict]) -> None:
    kind = node["kind"]
    if kind == "panel":
        out.append({"panel_id": node["panel_id"], "polygon": region,
                    "breakout": node.get("breakout", False)})
    elif kind == "split":
        parts = split_poly(region, node["axis"], node["cuts"])
        children = node["children"]
        if len(parts) != len(children):
            raise ValueError(f"split produced {len(parts)} parts for {len(children)} children")
        for child, part in zip(children, parts):
            compile_node(child, part, out)
    elif kind == "overlay":
        compile_node(node["base"], region, out)
        x0, y0, x1, y1 = bounds(region)
        for inset in node["insets"]:
            bx, by, bw, bh = inset["box"]  # fractions of base region
            ipoly = [(x0 + bx * (x1 - x0), y0 + by * (y1 - y0)),
                     (x0 + (bx + bw) * (x1 - x0), y0 + by * (y1 - y0)),
                     (x0 + (bx + bw) * (x1 - x0), y0 + (by + bh) * (y1 - y0)),
                     (x0 + bx * (x1 - x0), y0 + (by + bh) * (y1 - y0))]
            out.append({"panel_id": inset["panel_id"], "polygon": ipoly,
                        "inset": True, "border": inset.get("border", "standard")})
    else:
        raise ValueError(f"unknown node kind {kind}")


def read_ranks_rtl(panels: list[dict]) -> None:
    """RTL Z-path: cluster into rows by centroid y, then right-to-left in each row."""
    items = sorted(panels, key=lambda p: centroid(p["polygon"])[1])
    rows: list[list[dict]] = []
    row_break = PAGE_H * 0.12
    for p in items:
        cy = centroid(p["polygon"])[1]
        if rows and abs(cy - centroid(rows[-1][-1]["polygon"])[1]) < row_break:
            rows[-1].append(p)
        else:
            rows.append([p])
    rank = 0
    for row in rows:
        for p in sorted(row, key=lambda q: -centroid(q["polygon"])[0]):
            p["read_rank"] = rank
            rank += 1


# ---------------------------------------------------------------- renderers ---

def to_svg(panels: list[dict], title: str) -> str:
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{PAGE_W:.0f}" height="{PAGE_H:.0f}" '
        f'viewBox="0 0 {PAGE_W:.0f} {PAGE_H:.0f}">',
        f'<rect width="{PAGE_W:.0f}" height="{PAGE_H:.0f}" fill="white"/>',
        f'<title>{title}</title>',
    ]
    for p in sorted(panels, key=lambda q: q.get("inset", False)):
        poly = shrink(p["polygon"], GUTTER)
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in poly)
        dash = ' stroke-dasharray="10,7"' if p.get("border") == "broken" else ""
        fill = "#f3f3f3" if p.get("inset") else "white"
        parts.append(f'<polygon points="{pts}" fill="{fill}" stroke="black" stroke-width="3.5"{dash}/>')
        cx, cy = centroid(poly)
        parts.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="16" fill="#ddd" stroke="black"/>')
        parts.append(f'<text x="{cx:.1f}" y="{cy + 5:.1f}" font-family="Helvetica" font-size="16" '
                     f'text-anchor="middle">{p["read_rank"]}</text>')
        if p.get("breakout"):
            x0, y0, x1, y1 = bounds(poly)
            parts.append(f'<ellipse cx="{(x0+x1)/2:.1f}" cy="{y0:.1f}" rx="52" ry="34" '
                         f'fill="white" stroke="black" stroke-width="2.5" stroke-dasharray="4,4"/>')
            parts.append(f'<text x="{(x0+x1)/2:.1f}" y="{y0+5:.1f}" font-family="Helvetica" '
                         f'font-size="11" text-anchor="middle">breakout</text>')
    parts.append("</svg>")
    return "\n".join(parts)


def to_png(panels: list[dict], path: Path) -> None:
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (int(PAGE_W), int(PAGE_H)), "white")
    d = ImageDraw.Draw(img)
    for p in sorted(panels, key=lambda q: q.get("inset", False)):
        poly = shrink(p["polygon"], GUTTER)
        if p.get("inset"):
            d.polygon(poly, fill=(243, 243, 243))
        d.line(poly + [poly[0]], fill="black", width=5)
        cx, cy = centroid(poly)
        d.ellipse([cx - 15, cy - 15, cx + 15, cy + 15], outline="black", width=2)
        d.text((cx - 4, cy - 7), str(p["read_rank"]), fill="black")
    img.save(path)


# ---------------------------------------------------------------- templates ---

PAGE: Poly = [(MARGIN, MARGIN), (PAGE_W - MARGIN, MARGIN),
              (PAGE_W - MARGIN, PAGE_H - MARGIN), (MARGIN, PAGE_H - MARGIN)]

TEMPLATES: dict[str, dict] = {
    # Reference class: One Piece ch.1187-style dialogue/action page (rows 2/3/2,
    # slight angles, one breakout sprite crossing its frame).
    "t_ref_rows_2_3_2": {
        "use_when": {"purpose": ["setup", "conflict", "reaction"], "panels": 7, "tempo": "normal"},
        "tree": {"kind": "split", "axis": "y",
                 "cuts": [{"pos": 0.34, "angle": -2.5}, {"pos": 0.67, "angle": 1.5}],
                 "children": [
                     {"kind": "split", "axis": "x", "cuts": [{"pos": 0.55, "angle": -3}],
                      "children": [{"kind": "panel", "panel_id": "p1"},
                                   {"kind": "panel", "panel_id": "p2", "breakout": True}]},
                     {"kind": "split", "axis": "x",
                      "cuts": [{"pos": 0.36, "angle": 2}, {"pos": 0.66, "angle": -2}],
                      "children": [{"kind": "panel", "panel_id": "p3"},
                                   {"kind": "panel", "panel_id": "p4"},
                                   {"kind": "panel", "panel_id": "p5"}]},
                     {"kind": "split", "axis": "x", "cuts": [{"pos": 0.45, "angle": 1.5}],
                      "children": [{"kind": "panel", "panel_id": "p6"},
                                   {"kind": "panel", "panel_id": "p7"}]},
                 ]},
    },
    # Kishotenketsu 'ten' page: small setup strip, huge page-turn reveal below.
    "t_page_turn_reveal": {
        "use_when": {"purpose": ["reveal", "payoff"], "panels": 4, "tempo": "impact"},
        "tree": {"kind": "split", "axis": "y", "cuts": [{"pos": 0.40, "angle": 2}],
                 "children": [
                     {"kind": "split", "axis": "x",
                      "cuts": [{"pos": 0.30, "angle": 0}, {"pos": 0.62, "angle": 0}],
                      "children": [{"kind": "panel", "panel_id": "p1"},
                                   {"kind": "panel", "panel_id": "p2"},
                                   {"kind": "panel", "panel_id": "p3"}]},
                     {"kind": "panel", "panel_id": "p4_reveal"},
                 ]},
    },
    # High-energy action: strong diagonals, 4 panels.
    "t_action_diagonals": {
        "use_when": {"purpose": ["conflict", "action"], "panels": 4, "tempo": "quick"},
        "tree": {"kind": "split", "axis": "y", "cuts": [{"pos": 0.5, "angle": -12}],
                 "children": [
                     {"kind": "split", "axis": "x", "cuts": [{"pos": 0.5, "angle": 10}],
                      "children": [{"kind": "panel", "panel_id": "p1"},
                                   {"kind": "panel", "panel_id": "p2"}]},
                     {"kind": "split", "axis": "x", "cuts": [{"pos": 0.5, "angle": -8}],
                      "children": [{"kind": "panel", "panel_id": "p3"},
                                   {"kind": "panel", "panel_id": "p4"}]},
                 ]},
    },
    # Splash with two overlay insets (reaction + detail), broken border on one.
    "t_splash_inset": {
        "use_when": {"purpose": ["reveal", "hook"], "panels": 3, "tempo": "hold"},
        "tree": {"kind": "overlay",
                 "base": {"kind": "panel", "panel_id": "p1_splash"},
                 "insets": [
                     {"panel_id": "p2", "anchor": "top_right", "box": [0.62, 0.06, 0.32, 0.20]},
                     {"panel_id": "p3", "anchor": "bottom_left", "box": [0.06, 0.72, 0.34, 0.22],
                      "border": "broken"},
                 ]},
    },
    # Calm 2x2 grid, no angles (quiet explanation beat; wide time gutters).
    "t_quiet_grid_4": {
        "use_when": {"purpose": ["explanation", "setup"], "panels": 4, "tempo": "hold"},
        "tree": {"kind": "split", "axis": "y", "cuts": [{"pos": 0.5, "angle": 0}],
                 "children": [
                     {"kind": "split", "axis": "x", "cuts": [{"pos": 0.5, "angle": 0}],
                      "children": [{"kind": "panel", "panel_id": "p1"},
                                   {"kind": "panel", "panel_id": "p2"}]},
                     {"kind": "split", "axis": "x", "cuts": [{"pos": 0.5, "angle": 0}],
                      "children": [{"kind": "panel", "panel_id": "p3"},
                                   {"kind": "panel", "panel_id": "p4"}]},
                 ]},
    },
}


def main() -> None:
    out_dir = Path(__file__).parent / (sys.argv[sys.argv.index("--out") + 1]
                                       if "--out" in sys.argv else "golden")
    out_dir.mkdir(parents=True, exist_ok=True)
    index = {}
    for name, spec in TEMPLATES.items():
        panels: list[dict] = []
        compile_node(spec["tree"], PAGE, panels)
        read_ranks_rtl(panels)
        svg = to_svg(panels, name)
        (out_dir / f"{name}.svg").write_text(svg)
        to_png(panels, out_dir / f"{name}.png")
        index[name] = {"use_when": spec["use_when"], "panel_count": len(panels),
                       "read_order": [p["panel_id"] for p in
                                      sorted(panels, key=lambda q: q["read_rank"])]}
        print(f"{name}: {len(panels)} panels, read order "
              f"{' -> '.join(index[name]['read_order'])}")
    (out_dir / "index.json").write_text(json.dumps(index, indent=2))
    print(f"wrote {len(TEMPLATES)} templates to {out_dir}")


if __name__ == "__main__":
    main()
