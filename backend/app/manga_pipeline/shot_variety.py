"""Phase 4.3 \u2014 shot-variety editorial floor.

Sibling module to ``manga_dsl`` rather than inlined into it because
``manga_dsl`` is at 578 lines and the cardinality check that already
lives there is a different signal from what we add here.

What this module catches that ``manga_dsl._validate_shot_variety`` doesn't
---------------------------------------------------------------------
That check counts *distinct* shot types and warns when fewer than 3
appear. A storyboard with 25 MEDIUM panels and one CLOSE_UP and one WIDE
passes (3 distinct types) but is editorially monotone: the reader sees
a wall of medium-shots punctuated by two single-panel exceptions. Pro
manga moves the shot type around panel-to-panel; the dominance check
here is the one that actually surfaces 'wall of MEDIUM' slop.

The two checks
--------------
* ``evaluate_shot_dominance`` \u2014 warns when one ``ShotType`` accounts
  for more than ``DOMINANCE_THRESHOLD`` of slice panels. Skips slices
  with fewer than ``MIN_PANELS_FOR_DOMINANCE_CHECK`` because a 3-panel
  slice forced into 'no shot type may exceed 70%' rounds to a hard
  >=2 distinct types rule, which overlaps the cardinality check
  already in ``manga_dsl``.
* ``evaluate_establishing_coverage`` \u2014 warns when zero panels in the
  slice are ``WIDE`` or ``EXTREME_WIDE``. The slice opens cold without
  ever showing the reader the room. We do NOT enforce 'first panel of
  every scene must be WIDE' \u2014 that's prescriptive and noisy when an
  in-medias-res scene legitimately wants to open on a CLOSE_UP. Per-
  slice 'at least one establishing beat exists' is the editorial floor.

Both issues land at ``warning`` severity. They flow through
``QualityReport`` like every other DSL signal so the existing repair
loop and editor UI pick them up without new wiring.
"""

from __future__ import annotations

from collections import Counter

from app.domain.manga import QualityIssue, ShotType, StoryboardPage

DOMINANCE_THRESHOLD = 0.70
MIN_PANELS_FOR_DOMINANCE_CHECK = 5
ESTABLISHING_SHOT_TYPES: frozenset[ShotType] = frozenset(
    {ShotType.WIDE, ShotType.EXTREME_WIDE}
)


def _all_panels(pages: list[StoryboardPage]):
    """Iterate every panel across every page \u2014 the unit of analysis here."""
    for page in pages:
        for panel in page.panels:
            yield panel


def evaluate_shot_dominance(
    pages: list[StoryboardPage],
    *,
    threshold: float = DOMINANCE_THRESHOLD,
    min_panels: int = MIN_PANELS_FOR_DOMINANCE_CHECK,
) -> list[QualityIssue]:
    """Warn when one shot type dominates the slice past ``threshold``.

    The comparison is strictly greater-than, not >=, so a slice that
    sits exactly at the threshold (e.g. 7/10 MEDIUM at 70%) ships
    without complaint. The whole point is that >70% is editorially
    flat; 70% on the nose is borderline and we trust the storyboarder.

    Tunable via kwargs so tests can pin a tighter threshold without
    monkeypatching the module-level constant.
    """
    panels = list(_all_panels(pages))
    if len(panels) < min_panels:
        return []
    counts = Counter(panel.shot_type for panel in panels)
    dominant_shot, dominant_count = counts.most_common(1)[0]
    share = dominant_count / len(panels)
    if share <= threshold:
        return []
    return [
        QualityIssue(
            severity="warning",
            code="DSL_SHOT_TYPE_DOMINANCE",
            message=(
                f"shot type {dominant_shot.value!r} appears in "
                f"{dominant_count}/{len(panels)} panels ({share:.0%}); "
                f"DSL prefers no single shot type above {threshold:.0%} of a slice"
            ),
            artifact_id="storyboard",
        )
    ]


def evaluate_establishing_coverage(
    pages: list[StoryboardPage],
) -> list[QualityIssue]:
    """Warn when no panel in the slice is WIDE or EXTREME_WIDE.

    An establishing beat anywhere in the slice is enough \u2014 we don't
    require it to be the first panel because in-medias-res openings
    are a legitimate editorial choice. Zero establishing beats anywhere
    means the reader never sees the room, the building, or the
    landscape: pages of close-ups stack into spatial confusion.
    """
    panels = list(_all_panels(pages))
    if not panels:
        return []
    if any(panel.shot_type in ESTABLISHING_SHOT_TYPES for panel in panels):
        return []
    return [
        QualityIssue(
            severity="warning",
            code="DSL_NO_ESTABLISHING_SHOT",
            message=(
                "storyboard has no WIDE or EXTREME_WIDE panel anywhere in the slice; "
                "the reader is never shown the surrounding space"
            ),
            artifact_id="storyboard",
        )
    ]


def evaluate_shot_variety(pages: list[StoryboardPage]) -> list[QualityIssue]:
    """Run every Phase 4.3 shot-variety check; return a flat issue list.

    Single entry point for ``manga_dsl.validate_storyboard_against_dsl`` to
    call. Keeps the integration boundary one type wide \u2014 same pattern as
    the other validators.
    """
    issues: list[QualityIssue] = []
    issues.extend(evaluate_shot_dominance(pages))
    issues.extend(evaluate_establishing_coverage(pages))
    return issues
