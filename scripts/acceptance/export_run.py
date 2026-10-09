#!/usr/bin/env python3
"""Export one edition for review and for CI artifacts.

Usage (from backend/, with its venv):
  python ../scripts/acceptance/export_run.py --mongo mongodb://127.0.0.1:27017 --db NAME \
      [--edition ID] [--api http://127.0.0.1:8000] --out DIR

Without --edition, the latest edition is used.
Writes: edition.json, receipts.json, egress.json, understanding.json, plan.json,
units.json and judge/page-NN.{json,svg}. With --api, receipts and egress come
from the API (egress is the agent worker's own count); else from the database.
Render the PNGs after: cd packages/manga-render && npx tsx scripts/svg-dir-to-png.ts DIR/judge 1000
"""
import argparse
import json
import os
import sys
import urllib.request

import pymongo
from bson import ObjectId


def dump(obj, path, **kw):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=1, ensure_ascii=False, default=str, **kw)


def fetch_json(url):
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.load(r)
    except Exception as exc:  # noqa: BLE001 - report, never crash the export
        print(f"warning: {url} failed: {type(exc).__name__}", file=sys.stderr)
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mongo", required=True)
    ap.add_argument("--db", required=True)
    ap.add_argument("--edition")
    ap.add_argument("--api")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    db = pymongo.MongoClient(a.mongo, serverSelectionTimeoutMS=15000)[a.db]
    out = a.out
    os.makedirs(f"{out}/judge", exist_ok=True)
    if a.edition:
        ed = db.editions.find_one({"_id": ObjectId(a.edition)})
    else:
        ed = db.editions.find_one(sort=[("created_at", -1)])
    if not ed:
        print("no edition found", file=sys.stderr)
        return 1
    eid = str(ed["_id"])

    timings = {}
    if ed.get("created_at") and ed.get("finished_at"):
        timings["created_to_finished_s"] = (ed["finished_at"] - ed["created_at"]).total_seconds()
    pages = list(db.edition_pages.find({"edition_id": eid}).sort("page_number", 1))
    first = min((p["updated_at"] for p in pages if p.get("svg") and p.get("updated_at")), default=None)
    if first and ed.get("created_at"):
        timings["created_to_first_page_s"] = (first - ed["created_at"]).total_seconds()
    dump(
        {
            "id": eid, "book_id": ed.get("book_id"), "status": ed.get("status"), "error": ed.get("error"),
            "page_total": ed.get("page_total"), "pages_accepted": ed.get("pages_accepted"),
            "pages_failed": ed.get("pages_failed"), "totals": ed.get("totals"), "policy": ed.get("policy"),
            "coverage": ed.get("coverage"), "stage_failures": ed.get("stage_failures"),
            "created_at": ed.get("created_at"), "finished_at": ed.get("finished_at"), "timings": timings,
        },
        f"{out}/edition.json",
    )

    arts = {x["kind"]: x for x in db.edition_artifacts.find({"edition_id": eid})}
    und = arts.get("understanding", {}).get("content") or {}
    plan = arts.get("plan", {}).get("content") or {}
    dump(und, f"{out}/understanding.json")
    dump(plan, f"{out}/plan.json")

    # receipts and egress
    api_receipts = fetch_json(f"{a.api}/editions/{eid}/receipts") if a.api else None
    if api_receipts:
        receipts = api_receipts
    else:
        calls = [x["receipt"] | {"artifact": x["kind"]} for x in arts.values() if x.get("receipt")]
        calls += list(ed.get("stage_failures") or [])
        for p in pages:
            calls += [r | {"page_number": p["page_number"]} for r in p.get("receipts") or []]
        receipts = {"edition_id": eid, "totals": ed.get("totals"), "calls": calls, "worker_egress": None}
    dump(receipts, f"{out}/receipts.json")
    dump({"worker_egress": receipts.get("worker_egress")}, f"{out}/egress.json")

    src = db.book_sources.find_one({"book_id": ed["book_id"]}) or {}
    units_list = src.get("units", [])
    dump(units_list, f"{out}/units.json")
    units = {u["id"]: u for u in units_list}
    claims = {c["id"]: c for c in und.get("claims", [])}
    cast = {c["id"]: c for c in und.get("cast", [])}
    planned = {p["page_number"]: p for p in plan.get("pages", [])}
    for page in pages:
        pn = page["page_number"]
        pp = planned.get(pn, {})
        ids = set(pp.get("cast", []))
        for panel in (page.get("spec") or {}).get("panels", []):
            for f in panel.get("figures", []):
                ids.add(f.get("character"))
        rec = {
            "page_number": pn, "status": page["status"], "error": page.get("error"), "planned": pp,
            "claims": [claims[k] for k in page.get("claims", []) if k in claims], "spec": page.get("spec"),
            "warnings": page.get("warnings", []),
            "source_units": [
                {"id": u, "pages": units[u].get("pages"), "text": units[u].get("text")}
                for u in page.get("units", []) if u in units
            ],
            "cast": [cast[c] for c in ids if c in cast],
        }
        dump(rec, f"{out}/judge/page-{pn:02d}.json")
        if page.get("svg"):
            with open(f"{out}/judge/page-{pn:02d}.svg", "w", encoding="utf-8") as fh:
                fh.write(page["svg"])
    print(f"{len(pages)} pages exported; edition {eid} {ed.get('status')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
