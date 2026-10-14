"""D30: the edition view carries the stand-ins the understanding reports. No model is called."""

from __future__ import annotations

import asyncio
import uuid

import httpx

from app.stand_ins import stand_ins
from test_preflight import _env, needs_mongo

UNDERSTANDING = {
    "title": "T",
    "cast": [
        {"id": "c_calf", "name": "The Calf", "role": "r", "look": {"kind": "animal", "species": "quad_large"}, "fit": "none", "wanted": "a young elephant"},
        {"id": "c_mouse", "name": "The Mouse", "role": "r", "look": {"kind": "animal", "species": "rat"}, "fit": "near", "wanted": "a mouse"},
        {"id": "c_boy", "name": "The Boy", "role": "r", "look": {"kind": "human"}, "fit": "exact", "wanted": "a boy"},
        {"id": "c_plain", "name": "Plain", "role": "r", "look": {"kind": "human"}},
    ],
    "locations": [{"id": "l_maze", "name": "The Maze", "environment": "generic_passage", "fit": "none", "wanted": "a maze of passages"}],
    "unmapped": [
        {"type": "prop", "wanted": "a blade-bone", "used": "thing_long"},
        {"type": "cast", "ref": "c_calf", "wanted": "a young elephant", "used": "a large figure"},
    ],
}


def test_stand_ins_lists_near_and_none_and_the_unmapped_props():
    rows = stand_ins(UNDERSTANDING)
    assert [(r["type"], r["name"], r["wanted"], r["fit"]) for r in rows] == [
        ("cast", "The Calf", "a young elephant", "none"),
        ("cast", "The Mouse", "a mouse", "near"),
        ("place", "The Maze", "a maze of passages", "none"),
        ("prop", "", "a blade-bone", "none"),
    ]
    # The unmapped line about the Calf adds no second row; its `used` text is kept.
    assert rows[0]["used"] == "a large figure"
    assert rows[1]["used"] == "rat"
    assert rows[2]["used"] == "generic_passage"
    assert rows[3]["used"] == "thing_long"


def test_stand_ins_is_empty_without_a_report_and_survives_bad_model_output():
    assert stand_ins({"cast": [{"id": "a", "name": "A", "look": {"kind": "human"}}], "locations": []}) == []
    assert stand_ins({}) == []
    bad = {
        "cast": ["x", {"id": 3, "name": 4, "fit": "none", "wanted": 5}, {"id": "c", "name": "N", "fit": "none", "wanted": "  "}],
        "locations": None,
        "unmapped": ["x", {"type": "thing", "wanted": "a", "used": "b"}, {"type": "prop", "wanted": "", "used": "b"}, {"type": "prop", "wanted": "w" * 100, "used": "u" * 100}],
    }
    rows = stand_ins(bad)
    assert len(rows) == 1
    assert len(rows[0]["wanted"]) == 40 and len(rows[0]["used"]) == 40


def test_stand_ins_is_capped():
    many = {"unmapped": [{"type": "prop", "wanted": f"thing {i}", "used": "thing_long"} for i in range(100)]}
    assert len(stand_ins(many)) == 30


@needs_mongo
def test_the_edition_view_carries_stand_ins(tmp_path, monkeypatch):
    db_name = f"ps_standins_{uuid.uuid4().hex[:8]}"
    _env(monkeypatch, tmp_path, db_name)

    async def scenario():
        from app.db import init_db
        from app.documents import Edition, EditionArtifact
        from app.main import app

        client_db = await init_db()
        try:
            plain = Edition(book_id="b1")
            await plain.insert()
            reported = Edition(book_id="b2")
            await reported.insert()
            base = {"title": "T", "author": "A", "logline": "L", "kind": "fiction", "sections": [], "claims": []}
            for edition, content in ((plain, {**base, "cast": [{"id": "c1", "name": "One", "role": "r"}]}), (reported, {**base, **UNDERSTANDING})):
                await EditionArtifact(edition_id=str(edition.id), kind="understanding", schema_id="book-understanding.v1", content=content, content_hash="h", receipt={}).insert()
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://api") as api:
                none = (await api.get(f"/editions/{plain.id}")).json()
                assert none["book"]["stand_ins"] == []
                got = (await api.get(f"/editions/{reported.id}")).json()
                assert [r["wanted"] for r in got["book"]["stand_ins"]] == ["a young elephant", "a mouse", "a maze of passages", "a blade-bone"]
        finally:
            await client_db.drop_database(db_name)

    from app import db as db_module
    from app.settings import get_settings

    try:
        asyncio.run(scenario())
    finally:
        get_settings.cache_clear()
        db_module._client = None
