"""Bible silhouette uniqueness stage (Phase B3).

Runs ONCE per project, immediately after the bible is locked and BEFORE
the art direction stage. Pure heuristic: no LLM call.

The stage populates ``context.bible_warnings``. It does NOT raise. A
silhouette clash is a warning, not an error \u2014 some projects intentionally
have look-alike characters (twins, body doubles, masked reveals). We
surface the warnings so an artist can decide.
"""

from __future__ import annotations

import logging

from app.manga_pipeline.book_context import BookUnderstandingContext
from app.services.manga.bible_uniqueness import find_silhouette_clashes


logger = logging.getLogger(__name__)


async def run(context: BookUnderstandingContext) -> BookUnderstandingContext:
    """Detect silhouette/costume clashes between bible characters."""
    if context.character_bible is None:
        raise ValueError(
            "bible silhouette uniqueness stage requires a locked character_bible"
        )

    issues = find_silhouette_clashes(context.character_bible)
    context.bible_warnings.extend(issues)
    if issues:
        logger.warning(
            "bible silhouette uniqueness produced %d warning(s) for project %s",
            len(issues),
            context.project_id,
        )
        for issue in issues:
            logger.warning("BIBLE_SILHOUETTE_CLASH: %s", issue.message)
    return context
