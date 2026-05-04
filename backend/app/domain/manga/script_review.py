"""Editorial review artifacts for the manga adaptation pipeline.

Phase A introduces an *editor* layer between the script and storyboard
stages. The script_review_stage asks an LLM to read the generated script
through a manga editor's lens and surface defects we cannot detect with
purely structural validators: voice drift, weak tension, cliched lines,
dropped continuity hooks.

We model the report as data, not free-text, so the repair stage can
target individual scenes/lines and the existing QualityReport can absorb
the same issues without inventing a parallel pipeline.

Design rules:
- Reports are plain Pydantic models — no I/O, no LLM calls.
- Severity vocabulary mirrors QualityIssue ('error' | 'warning') so the
  repair stage can route by severity without a translation layer.
- Issue codes are stable identifiers ('SCRIPT_VOICE_DRIFT' etc) the
  repair prompt can quote back to the model with surgical precision.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator


class ScriptIssue(BaseModel):
    """One editorial defect in a manga script.

    ``scene_id`` and ``line_index`` together pin the issue to a precise
    location. ``line_index`` is None when the defect is scene-wide (e.g.
    a scene without enough tension) rather than line-specific.
    """

    severity: str
    code: str
    message: str
    scene_id: str = ""
    line_index: int | None = None
    speaker_id: str = ""
    suggestion: str = ""

    @field_validator("severity")
    @classmethod
    def severity_is_known(cls, value: str) -> str:
        if value not in {"error", "warning", "info"}:
            raise ValueError("severity must be error|warning|info")
        return value

    @field_validator("code")
    @classmethod
    def code_required(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("issue code cannot be blank")
        return value.strip()


class ScriptReviewReport(BaseModel):
    """Editor's pass over a manga script.

    ``passed`` is True only when no ``error``-severity issue is present;
    warnings still ship but get logged. The repair stage refuses to run
    on a passed report (it would burn tokens with nothing to fix).
    """

    slice_id: str
    passed: bool
    issues: list[ScriptIssue] = Field(default_factory=list)
    voice_summary: str = ""
    tension_summary: str = ""
    notes: str = ""

    @field_validator("slice_id")
    @classmethod
    def slice_id_required(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("slice_id cannot be blank")
        return value.strip()

    @model_validator(mode="after")
    def passed_consistent_with_issues(self) -> "ScriptReviewReport":
        # An LLM that says "passed=true" but lists error-severity issues is
        # contradicting itself; treat its boolean as a hint and recompute
        # mechanically. We MUST do this because the downstream repair stage
        # gates on `passed`, not on the issue list.
        has_error = any(issue.severity == "error" for issue in self.issues)
        object.__setattr__(self, "passed", not has_error)
        return self

    def error_issues(self) -> list[ScriptIssue]:
        return [issue for issue in self.issues if issue.severity == "error"]
