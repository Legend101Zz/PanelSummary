"""The stand-ins of an edition (D30): what the understanding could not map, for the book page.

The understanding may report, besides its cast and locations, that no item of the closed
vocabulary fits a thing of the book (`fit` near or none with `wanted`, and a top-level
`unmapped` list). This module reads that report and gives the reader a short list. All text is
model output: it is kept to strings and clipped. The reader shows it as plain text.
"""

from __future__ import annotations

from typing import Any

WANTED_MAX = 40
USED_MAX = 40
NAME_MAX = 60
LIMIT = 30
FITS = ("near", "none")
TYPES = ("cast", "place", "prop")


def _text(value: Any, limit: int) -> str:
    return " ".join(value.split())[:limit] if isinstance(value, str) else ""


def _used(entry: dict) -> str:
    """The item that was drawn in place of the thing: the species, shape or object of a cast member, or the environment."""
    look = entry.get("look")
    if isinstance(look, dict):
        return _text(look.get("species") or look.get("shape") or look.get("kind"), USED_MAX)
    return _text(entry.get("environment"), USED_MAX)


def stand_ins(understanding: dict) -> list[dict]:
    """`[{type, name, wanted, used, fit}]`: cast and places with fit near or none, then the unmapped objects.

    An `unmapped` entry about a cast member or a place that is already listed does not add a second row;
    its `used` text replaces the item id when it is given.
    """
    rows: list[dict] = []
    seen: dict[tuple[str, str], dict] = {}
    for kind, key in (("cast", "cast"), ("place", "locations")):
        for entry in understanding.get(key) or []:
            if not isinstance(entry, dict) or entry.get("fit") not in FITS:
                continue
            wanted = _text(entry.get("wanted"), WANTED_MAX)
            if not wanted:
                continue
            row = {"type": kind, "name": _text(entry.get("name"), NAME_MAX), "wanted": wanted, "used": _used(entry), "fit": entry["fit"]}
            rows.append(row)
            if isinstance(entry.get("id"), str):
                seen[(kind, entry["id"])] = row
    for item in understanding.get("unmapped") or []:
        if not isinstance(item, dict) or item.get("type") not in TYPES:
            continue
        wanted = _text(item.get("wanted"), WANTED_MAX)
        used = _text(item.get("used"), USED_MAX)
        if not wanted or not used:
            continue
        ref = item.get("ref")
        existing = seen.get((item["type"], ref)) if isinstance(ref, str) else None
        if existing is not None:
            existing["used"] = used
            continue
        rows.append({"type": item["type"], "name": "", "wanted": wanted, "used": used, "fit": "none"})
    return rows[:LIMIT]
