"""Entry point: ``python -m app.runner`` runs the background job runner."""

import asyncio
import logging

from app.jobs.runner import run_forever

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    asyncio.run(run_forever())
