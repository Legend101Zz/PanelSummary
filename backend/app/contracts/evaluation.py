"""Eval-harness artifact contracts (issue #10, promoted Session 7).

Session 6 shipped ``eval_scorecard`` rows with a schema-version STRING
only; the Session 7 scorecard baseline/regression compare
(``manga_eval.compare_scorecards``) is the first cross-run consumer, so
the shape promotes to the registry (ADR-012 promotion rule: first
consumer promotes). Shapes mirror ``manga_eval.build_scorecard``
exactly; every live Session 6 row validates unchanged.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, JsonValue

from .base import ContractModel, Identifier, ShortText


class EvalPageScore(ContractModel):
    """Per-page structural + judge metrics inside a scorecard."""

    page_index: Annotated[int, Field(ge=0, le=999)]
    layout_iou: dict[str, JsonValue] | None = None
    border_adherence_score: Annotated[float, Field(ge=0, le=1)] | None = None
    ocr_clean: bool | None = None
    judge: dict[str, JsonValue] | None = None
    judge_cost_usd: Annotated[float, Field(ge=0)] = 0.0
    notes: list[ShortText] = Field(default_factory=list, max_length=64)


class EvalScorecard(ContractModel):
    """Diffable eval-harness verdict for one run/lane/subject
    (eval-scorecard.v1). Metric and rubric versions ride the payload so
    cross-version comparisons can refuse loudly."""

    schema_version: Literal["eval-scorecard.v1"]
    harness_version: ShortText
    layout_iou_version: ShortText
    judge_rubric_version: ShortText
    project_id: Identifier
    run_id: Identifier
    lane: ShortText
    subject: ShortText
    pages: list[EvalPageScore] = Field(min_length=1, max_length=1_000)
    totals: dict[str, JsonValue]
    extra: dict[str, JsonValue] | None = None
