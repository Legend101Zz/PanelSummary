"""Read judgment files for the tools in this directory (Python 3.12, stdlib only).

Two input shapes:
  * a raw judge result: a JSON list of {judge, page, scores, ships, defects} (judgments.json);
  * a compact fixture (schema bookreel-judge-fixture.v1): {"schema", "run", "book", "version",
    "source", "page_statuses": {"42": "failed"}, "judgments": [...]}, optionally gzip (.json.gz).
"""
import gzip
import json

FIXTURE_SCHEMA = "bookreel-judge-fixture.v1"


def read_json(path):
    opener = gzip.open if str(path).endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def load(path):
    """Return (raw judgment list, {page: status}, meta dict)."""
    data = read_json(path)
    if isinstance(data, dict) and data.get("schema") == FIXTURE_SCHEMA:
        meta = {k: v for k, v in data.items() if k not in ("judgments", "page_statuses")}
        statuses = {int(p): s for p, s in (data.get("page_statuses") or {}).items()}
        return data["judgments"], statuses, meta
    return data, {}, {}
