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

# --- measured runs the model is fitted to (docs/rebuild/ACCEPTANCE.md, docs/launch/T3-scope.md) ---
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
    # Model per goal (understanding, plan, pages). The first six runs are all MiniMax-M3.
    policy: tuple[str, str, str] = ("MiniMax-M3", "MiniMax-M3", "MiniMax-M3")


_M3 = "MiniMax-M3"
_FLASH = "MiniMax-M3.1-Flash-Preview"

FIT_RUNS: tuple[FitRun, ...] = (
    FitRun("phase0 two tales", 26, 5794, 2, 16, 0.81, 795, 2115, 472),
    FitRun("civil disobedience", 34, 9339, 3, 29, 0.73, 569, None, None),
    FitRun("acceptance run 3", 68, 16159, 5, 60, 2.17, 787, 2502, 660),
    FitRun("acceptance run 4", 68, 16159, 5, 58, 2.02, 397, 1578, 259),
    FitRun("acceptance run 6", 68, 16159, 5, 56, 1.66, 813, 1716, 625),
    FitRun("acceptance run 8", 68, 16159, 5, 46, 1.65, 1823, 2910, 1166),
    # Measured 2026-10-09 on the 26-page two-tale book (docs/launch/MODEL-AB.md). Times are the
    # journey's observed Generate-to-page and Generate-to-finished seconds; cost is the receipts' sum.
    FitRun("ci live, all M3", 26, 5794, 2, 14, 0.60, 940, 1747, 793),
    FitRun("A/B M3 plan, Flash pages", 26, 5794, 2, 16, 0.53, 954, 1363, 826, (_M3, _M3, _FLASH)),
    FitRun("A/B Flash plan and pages", 26, 5794, 2, 21, 0.59, 744, 1087, 633, (_M3, _FLASH, _FLASH)),
    FitRun("gate 1, Flash plan and pages", 26, 5794, 2, 22, 0.87, 1361, 2094, 1259, (_M3, _FLASH, _FLASH)),
)

# Manga pages per 1,000 words. Measured 2.76 to 3.71. Widened outward to 2.5 and 4.0.
PAGES_PER_KWORD_LOW = 2.5
PAGES_PER_KWORD_HIGH = 4.0

# Cost model: usd = a * kwords + b * pages. The two coefficients were fitted (least squares) on the
# six all-M3 runs; the Flash-policy runs were added after, only as checks on the range (tests).
COST_PER_KWORD = 0.0125
COST_PER_PAGE = 0.0302
# The fit is off by -26 % to +46 % on single runs, so the range is widened.
# The high factor grew from 1.15 to 1.25 when the Flash-policy runs were added: the gate 1 run
# cost $0.87 for 22 pages (a slow understanding hour with 348,000 output tokens in all).
COST_LOW_FACTOR = 0.85
COST_HIGH_FACTOR = 1.25

# Understanding seconds per source word. Measured 0.016 (fast hour) to 0.082 (slow hour
# with many revision turns). The goal times out at 25 minutes (1,500 s).
UNDERSTANDING_S_PER_WORD_LOW = 0.016
UNDERSTANDING_S_PER_WORD_HIGH = 0.082
UNDERSTANDING_TIMEOUT_S = 25 * 60
# A slow understanding hour is flat extra time, not a rate per word: the 5,794-word book needed
# 1,259 s once (633 to 826 s in three other runs), which is 0.22 s per word. Added to the high
# bound of the time to the first page (and so to the total).
UNDERSTANDING_SLOW_HOUR_EXTRA_S = 800
# Plan seconds, observed 16 to 235 (Flash: 34 and 69; M3: 16 to 235); the slow-hour run needed
# up to about 450 for plan + page 1.
PLAN_S_LOW = 60
PLAN_S_HIGH = 450
# Time from plan to the first accepted page. Fastest page seen 34 s.
FIRST_PAGE_S_LOW = 35
FIRST_PAGE_S_HIGH = 200
# Drawing: seconds per page with 4 pages in parallel. Measured 17 to 29 on healthy runs.
PAGE_S_LOW = 16
PAGE_S_HIGH = 30
# One page that fails twice held a slot for about 1,100 s in the phase 0 run.
FAILED_PAGE_TAIL_S_HIGH = 1100

BASIS_MEASURED_MODEL = _M3  # kept for older readers
# Policies the fit has measured runs for: (understanding, plan, pages).
MEASURED_POLICIES = frozenset(run.policy for run in FIT_RUNS)


def _budget(words: int, sections: int) -> tuple[int, int]:
    """The page budget the plan goal enforces (adaptation-plan.ts pageBudget), without claims."""
    minimum = max(sections * 2, round(words / 650), 3)
    maximum = max(minimum + 2, min(140, round(words / 260)))
    return minimum, maximum


def check_limits(pdf_pages: int, source_words: int, max_pdf_pages: int, max_source_words: int) -> list[str]:
    """Return a user-readable reason for each limit the book is over. Empty means inside."""
    reasons: list[str] = []
    if source_words > max_source_words:
        reasons.append(
            f"This book has {source_words:,} words. BookReel v0.1 can adapt books up to "
            f"{max_source_words:,} words in one run."
        )
    if pdf_pages > max_pdf_pages:
        reasons.append(
            f"This book has {pdf_pages:,} PDF pages. BookReel v0.1 can adapt books up to "
            f"{max_pdf_pages:,} pages in one run."
        )
    if reasons:
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

    first_low = UNDERSTANDING_S_PER_WORD_LOW * source_words + PLAN_S_LOW + FIRST_PAGE_S_LOW
    first_high = UNDERSTANDING_S_PER_WORD_HIGH * source_words + UNDERSTANDING_SLOW_HOUR_EXTRA_S + PLAN_S_HIGH + FIRST_PAGE_S_HIGH
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


def cost_basis(settings: Settings) -> str:
    n_all_m3 = sum(1 for run in FIT_RUNS if run.policy == (_M3, _M3, _M3))
    n_flash = len(FIT_RUNS) - n_all_m3
    text = (
        f"Pi catalog estimate, not a bill. The range comes from {len(FIT_RUNS)} measured runs: "
        f"{n_all_m3} with MiniMax-M3 on every goal and {n_flash} with Flash on the plan or the pages "
        "(M3 on the book understanding in all). The Flash runs are one book of 26 PDF pages, so the "
        "Flash part of the range is thinner. MiniMax speed varies, so time is the weakest figure."
    )
    policy = (settings.understanding_model, settings.plan_model, settings.page_model)
    if policy not in MEASURED_POLICIES:
        text += (
            f" The current policy (understanding {policy[0]}, plan {policy[1]}, pages {policy[2]}) "
            "was not measured; the numbers are not measured again for it."
        )
    return text


def build_preflight(book_id: str, pdf_pages: int, source_words: int, sections: int, settings: Settings) -> dict[str, Any]:
    est = estimate(source_words, sections)
    est.pop("_seconds")
    est["estimated_cost_usd"]["basis"] = cost_basis(settings)
    reasons = check_limits(pdf_pages, source_words, settings.max_pdf_pages, settings.max_source_words)
    return {
        "book_id": book_id,
        "pdf_pages": pdf_pages,
        "source_words": source_words,
        "sections": sections,
        **est,
        "limits": {"max_pdf_pages": settings.max_pdf_pages, "max_source_words": settings.max_source_words},
        "within_limits": not reasons,
        "blocking_reasons": reasons,
    }
