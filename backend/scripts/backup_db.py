"""Full-database JSON backup before live bake-off writes (Session 4).

Pattern required by the session rules (see /tmp/bookreel-s3-before-live-
director.json from Session 3): every collection of the configured database
is dumped to one JSON file BEFORE any live write. Read-only against Mongo.

    uv run python scripts/backup_db.py /tmp/bookreel-s4-before-bakeoff.json
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient

from app.config import get_settings


async def main() -> int:
    out = Path(sys.argv[1])
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.db_name]
    dump: dict[str, list] = {}
    for name in sorted(await db.list_collection_names()):
        dump[name] = [doc async for doc in db[name].find({})]
    out.write_text(json.dumps(dump, default=str))
    total = sum(len(docs) for docs in dump.values())
    print(
        f"backed up {len(dump)} collections / {total} docs "
        f"({out.stat().st_size:,} bytes) -> {out}"
    )
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
