"""Cost and time preflight, and the v0.1 size limits (decision D19).

The preflight answers one question before Generate: "is this book inside the
limits, and what will it roughly cost and take?". It is a small model fitted to
the measured acceptance runs, not a quote. Every coefficient below comes from
``FIT_RUNS`` (the measured runs). ``tests/test_preflight.py`` verifies that the
ranges contain every one of those runs, so a change to a coefficient that
breaks the evidence fails the tests.

Rules:
- Ranges are an envelope of what was seen (fastest to slowest, cheapest to
  dearest), widened outward. They are not confidence intervals.
- Cost is the Pi catalog estimate that each receipt records. It is not a bill.
- MiniMax output speed varied 31-324 tokens/s across the runs. Time is the
  weakest part of the model, and the text says so.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from app.settings import Settings

# --- measured runs the model is fitted to (docs/v0.3/O1-ops.md has the tables) ---
# words and pages are what the parser reports. manga_pages is the number of planned pages.
# cost_usd is the sum of the receipts. Times are seconds from Generate. None = not recorded.


@dataclass(frozen=True)
class FitRun:
    name: str
    pdf_pages: int
    words: int
    sections: int
    manga_pages: int
    cost_usd: float
    first_page_s: int | None
    finish_s: int | None
    understanding_s: int | None
    # Model per goal (understanding, plan, pages).
    policy: tuple[str, str, str] = ("MiniMax-M3", "MiniMax-M3", "MiniMax-M3")
    # Sum of the page receipts (the drawing part of cost_usd). None = not recorded.
    draw_cost_usd: float | None = None


_M3 = "MiniMax-M3"
_FLASH = "MiniMax-M3.1-Flash-Preview"
_ALL_FLASH = (_FLASH, _FLASH, _FLASH)
# The model policy of the current default (D13). Only runs with this policy are in the ranges.
CURRENT_POLICY = _ALL_FLASH

# Fit runs: every measured run with the current policy. Each is inside every range (tests).
FIT_RUNS: tuple[FitRun, ...] = (
    # Measured 2026-10-09 (v0.1 code, docs/launch/MODEL-AB.md): the one v0.1 run with Flash on every goal.
    FitRun("understanding A/B, all Flash", 26, 5794, 2, 22, 0.59, 427, 795, 132, _ALL_FLASH),
    # Measured 2026-10-10 to 2026-10-11 (v0.2 live lane and local journeys, docs/v0.2/PLAN.md section 6).
    # Seconds are created_to_first_page_s and created_to_finished_s of the edition; cost is totals.cost_usd
    # at M3 rates; the last number is the sum of the page receipts.
    FitRun("v0.2 live 1, two tales", 26, 5794, 2, 21, 0.75, 211, 517, 82, _ALL_FLASH, 0.691),
    FitRun("v0.2 live 2, two tales (gate 1)", 26, 5794, 2, 22, 0.69, 187, 447, 84, _ALL_FLASH, 0.626),
    FitRun("v0.2 live 3, 68-page book (gate 2)", 68, 16159, 5, 61, 1.88, 292, 882, 144, _ALL_FLASH, 1.763),
    FitRun("v0.2 live 4, self-reliance", 36, 10031, 3, 38, 0.86, 188, 534, 76, _ALL_FLASH, 0.814),
    FitRun("v0.2 live 5, civil disobedience", 34, 9339, 3, 36, 0.81, 149, 491, 38, _ALL_FLASH, 0.747),
    FitRun("v0.2 live 6, just-so", 38, 9419, 3, 34, 0.99, 189, 550, 92, _ALL_FLASH, 0.919),
    FitRun("v0.2 live 8, self-reliance", 36, 10031, 3, 36, 0.82, 131, 401, 62, _ALL_FLASH, 0.769),
    FitRun("v0.2 final journey, just-so", 38, 9419, 3, 35, 0.99, 131, 464, 60, _ALL_FLASH, 0.941),
    FitRun("v0.2 final journey 2, just-so", 38, 9419, 3, 29, 0.80, 104, 367, 56, _ALL_FLASH, 0.756),
    FitRun("v0.1.0 hold-out, just-so", 38, 9419, 3, 30, 0.80, 121, 427, 58, _ALL_FLASH, 0.743),
    # The owner's private book: only its numbers are kept here, never its text.
    FitRun("v0.2 private book (numbers only)", 39, 11339, 3, 44, 1.01, 197, 551, 87, _ALL_FLASH, 0.941),
    # Measured 2026-10-14 (v0.3 code, Gate 1, 1b and 2a; numbers from the run exports, docs/v0.3/O1-ops.md section 2).
    # first_page_s is created_to_first_page_s, finish_s is created_to_finished_s, as for the v0.2 runs.
    # The exports have no understanding time and no page receipts, so those two are None.
    FitRun("v0.3 two-tale (Gate 1)", 26, 5794, 2, 22, 0.71, 179, 483, None, _ALL_FLASH),
    FitRun("v0.3 two-tale (Gate 1b)", 26, 5794, 2, 22, 1.03, 245, 676, None, _ALL_FLASH),
    FitRun("v0.3 Just So (Gate 1b)", 38, 9419, 3, 35, 0.94, 153, 456, None, _ALL_FLASH),
    FitRun("v0.3 sealed fiction 1 (Gate 2a)", 39, 7306, 13, 28, 1.18, 463, 857, None, _ALL_FLASH),
    FitRun("v0.3 sealed fiction 2 (Gate 2a)", 45, 10767, 8, 41, 1.13, 309, 679, None, _ALL_FLASH),
    FitRun("v0.3 sealed nonfiction (Gate 2a)", 34, 8699, 3, 31, 0.89, 156, 473, None, _ALL_FLASH),
)

# Earlier runs with MiniMax-M3 on at least one goal (v0.1 and the model A/B). They are kept for the
# record and for the policy list. They are NOT in the ranges: M3 is slower and dearer than Flash and
# some of them used older skills (see docs/v0.3/O1-ops.md, section "Runs not in the fit").
EARLIER_RUNS: tuple[FitRun, ...] = (
    FitRun("phase0 two tales", 26, 5794, 2, 16, 0.81, 795, 2115, 472),
    FitRun("civil disobedience", 34, 9339, 3, 29, 0.73, 569, None, None),
    FitRun("acceptance run 3", 68, 16159, 5, 60, 2.17, 787, 2502, 660),
    FitRun("acceptance run 4", 68, 16159, 5, 58, 2.02, 397, 1578, 259),
    FitRun("acceptance run 6", 68, 16159, 5, 56, 1.66, 813, 1716, 625),
    FitRun("acceptance run 8", 68, 16159, 5, 46, 1.65, 1823, 2910, 1166),
    FitRun("ci live, all M3", 26, 5794, 2, 14, 0.60, 940, 1747, 793),
    FitRun("A/B M3 plan, Flash pages", 26, 5794, 2, 16, 0.53, 954, 1363, 826, (_M3, _M3, _FLASH)),
    FitRun("A/B Flash plan and pages", 26, 5794, 2, 21, 0.59, 744, 1087, 633, (_M3, _FLASH, _FLASH)),
    FitRun("gate 1, Flash plan and pages", 26, 5794, 2, 22, 0.87, 1361, 2094, 1259, (_M3, _FLASH, _FLASH)),
    FitRun("understanding A/B, M3 understanding", 26, 5794, 2, 22, 0.65, 945, 1337, 801, (_M3, _FLASH, _FLASH)),
)

# The margin of every range: the envelope of the fit runs, widened outward by 10 %.
MARGIN = 0.10

# Manga pages per 1,000 words. Measured 3.08 to 3.88 (18 runs). Widened by the margin: 2.77 and 4.27,
# rounded outward to 2.75 and 4.3.
PAGES_PER_KWORD_LOW = 2.75
PAGES_PER_KWORD_HIGH = 4.3

# Cost model: usd = a * kwords + b * pages, at M3 rates. The understanding and the plan cost
# 0.0044 to 0.0104 usd per 1,000 words; the page receipts cost 0.0208 to 0.0329 usd per page.
# The factors are the smallest and the largest ratio of a measured cost to the cost model at the
# low and the high page count of the range (1.04 and 1.64), widened by the margin (0.93 and 1.81).
COST_PER_KWORD = 0.0075
COST_PER_PAGE = 0.0265
COST_LOW_FACTOR = 0.93
COST_HIGH_FACTOR = 1.81

# The drawing part alone (plan review, D24): the page receipts cost 0.0208 to 0.0329 usd per page.
# Widened by the margin and rounded outward.
DRAW_COST_PER_PAGE_LOW = 0.0187
DRAW_COST_PER_PAGE_HIGH = 0.0363

# Time to the first page = FIRST_PAGE_S_PER_WORD * words + a base (understanding, plan and page 1).
# The base was 28 to 404 s in the 18 runs (the v0.2 runs 28 to 165 s; the v0.1 run with a slow
# understanding hour 381 s; a v0.3 book with 13 sections 404 s). The high base is the largest one,
# rounded outward. The margin widens both ends.
FIRST_PAGE_S_PER_WORD = 0.008
FIRST_PAGE_BASE_S_LOW = 28
FIRST_PAGE_BASE_S_HIGH = 405
# Drawing: seconds per further page (4 pages in parallel). Measured 7.7 to 20.5. Widened by the margin.
PAGE_S_LOW = 6.9
PAGE_S_HIGH = 22.6
# One page that fails twice held a slot for 245 s in the v0.2 runs (gate 2, page 42: 119 s and 126 s,
# both stopped by the submit limit). Widened by the margin. The pre-F1 M3 run had 1,114 s (not in the fit).
FAILED_PAGE_TAIL_S_HIGH = 270

# The goal times out at 25 minutes (1,500 s). The slowest understanding hour ever measured, with
# MiniMax-M3 and many revision turns, was 0.082 s per source word (kept only to guard the word limit).
UNDERSTANDING_S_PER_WORD_HIGH = 0.082
UNDERSTANDING_TIMEOUT_S = 25 * 60

BASIS_MEASURED_MODEL = _M3  # kept for older readers
# Policies the fit has measured runs for: (understanding, plan, pages).
MEASURED_POLICIES = frozenset(run.policy for run in FIT_RUNS)


def _budget(words: int, sections: int) -> tuple[int, int]:
    """The page budget the plan goal enforces (adaptation-plan.ts pageBudget), without claims."""
    minimum = max(sections * 2, round(words / 650), 3)
    maximum = max(minimum + 2, min(140, round(words / 260)))
    return minimum, maximum


def check_limits(
    pdf_pages: int, source_words: int, max_pdf_pages: int, max_source_words: int, *, scoped: bool = False
) -> list[str]:
    """Return a user-readable reason for each limit that is exceeded. Empty means inside.

    ``scoped`` is true when the numbers are those of a chosen part of the book (D19, amended in
    v0.2: the limits apply to the scope). The words then say "selection", not "book".
    """
    reasons: list[str] = []
    subject = "This selection" if scoped else "This book"
    if source_words > max_source_words:
        reasons.append(
            f"{subject} has {source_words:,} words. PanelSummary can adapt "
            f"{'up to' if scoped else 'books up to'} {max_source_words:,} words in one run."
        )
    if pdf_pages > max_pdf_pages:
        reasons.append(
            f"{subject} has {pdf_pages:,} PDF pages. PanelSummary can adapt "
            f"{'up to' if scoped else 'books up to'} {max_pdf_pages:,} PDF pages in one run."
        )
    if reasons:
        if scoped:
            reasons.append("Choose fewer sections or a shorter page range.")
        else:
            reasons.append("You can still read the PDF here. Longer books are planned for a later version.")
    return reasons


def estimate(source_words: int, sections: int) -> dict[str, Any]:
    """Ranges for manga pages, cost and time. Pure function of the parsed size."""
    kwords = source_words / 1000
    budget_min, budget_max = _budget(source_words, sections)
    pages_low = min(budget_max, max(budget_min, math.floor(PAGES_PER_KWORD_LOW * kwords)))
    pages_high = min(budget_max, math.ceil(PAGES_PER_KWORD_HIGH * kwords))
    pages_high = max(pages_high, pages_low)

    def cost(pages: int) -> float:
        return COST_PER_KWORD * kwords + COST_PER_PAGE * pages

    cost_low = cost(pages_low) * COST_LOW_FACTOR
    cost_high = cost(pages_high) * COST_HIGH_FACTOR

    base = FIRST_PAGE_S_PER_WORD * source_words
    first_low = (base + FIRST_PAGE_BASE_S_LOW) * (1 - MARGIN)
    first_high = (base + FIRST_PAGE_BASE_S_HIGH) * (1 + MARGIN)
    total_low = first_low + max(pages_low - 1, 0) * PAGE_S_LOW
    total_high = first_high + max(pages_high - 1, 0) * PAGE_S_HIGH + FAILED_PAGE_TAIL_S_HIGH

    def minutes_low(seconds: float) -> int:
        return max(1, math.floor(seconds / 60))

    def minutes_high(seconds: float) -> int:
        return max(1, math.ceil(seconds / 60))

    return {
        "estimated_manga_pages": {"low": pages_low, "high": pages_high},
        "estimated_cost_usd": {"low": round(cost_low, 2), "high": round(cost_high, 2)},
        "estimated_minutes": {
            "first_page": {"low": minutes_low(first_low), "high": minutes_high(first_high)},
            "total": {"low": minutes_low(total_low), "high": minutes_high(total_high)},
        },
        "_seconds": {"first_page": (first_low, first_high), "total": (total_low, total_high)},
    }


def draw_cost_range(pages: int) -> dict[str, float]:
    """Cost range to draw ``pages`` pages after the plan exists (plan review, D24).

    The understanding and the plan are already paid for, so only the cost of the page receipts
    applies: ``DRAW_COST_PER_PAGE_LOW`` and ``DRAW_COST_PER_PAGE_HIGH`` (measured per page, v0.3 O1).
    """
    return {
        "low": round(DRAW_COST_PER_PAGE_LOW * pages, 2),
        "high": round(DRAW_COST_PER_PAGE_HIGH * pages, 2),
    }


BASIS_SHORT = "Estimate at MiniMax-M3 rates, not a bill."


def cost_basis(settings: Settings) -> str:
    books = {(run.words, run.sections) for run in FIT_RUNS}
    pdf_pages = [run.pdf_pages for run in FIT_RUNS]
    text = (
        f"Pi catalog estimate, not a bill. The range comes from {len(FIT_RUNS)} measured runs with Flash on every "
        f"goal (the current model policy), on {len(books)} books of {min(pdf_pages)} to {max(pdf_pages)} PDF pages. "
        "MiniMax speed varies, so time is the weakest figure."
    )
    policy = (settings.understanding_model, settings.plan_model, settings.page_model)
    if policy not in MEASURED_POLICIES:
        text += (
            f" The current policy (understanding {policy[0]}, plan {policy[1]}, pages {policy[2]}) "
            "was not measured; the numbers are not measured again for it."
        )
    return text


def build_preflight(
    book_id: str,
    pdf_pages: int,
    source_words: int,
    sections: int,
    settings: Settings,
    scope: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The numbers for the whole book (``scope`` None) or for a scope (``pdf_pages`` etc. are then the scope's)."""
    est = estimate(source_words, sections)
    est.pop("_seconds")
    est["estimated_cost_usd"]["basis_short"] = BASIS_SHORT
    est["estimated_cost_usd"]["basis"] = cost_basis(settings)
    reasons = check_limits(
        pdf_pages, source_words, settings.max_pdf_pages, settings.max_source_words, scoped=scope is not None
    )
    return {
        "book_id": book_id,
        "scope": scope,
        "pdf_pages": pdf_pages,
        "source_words": source_words,
        "sections": sections,
        **est,
        "limits": {"max_pdf_pages": settings.max_pdf_pages, "max_source_words": settings.max_source_words},
        "within_limits": not reasons,
        "blocking_reasons": reasons,
    }
