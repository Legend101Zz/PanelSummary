"""ModelPolicy speed/quality modes (issue #3, owner policy 2026-08-08).

Session 5 Goal B. The owner decision (standing, applies to every session):

- mode ``speed``   = MiniMax-M2.7-highspeed
- mode ``quality`` = MiniMax-M3, and quality is the DEFAULT mode
- per-purpose defaults stay CONFIG, not code (``Settings.agent_model_mode_*``,
  env-overridable) — direction=quality, page-writing/thumbnail=speed per the
  Session 4 bake-off confirmation
- vision is M3 ALWAYS (M3 is the only MiniMax vision model) — locked here in
  code as an invariant, not a config default; a speed override for a vision
  purpose is refused loudly
- receipts must prove the mode: drivers stamp ``model_mode`` +
  ``model_mode_source`` on every ModelReceipt, and the mode name is always
  derivable from the model id (``mode_for_model``)
- no silent default switches, ever: an explicit ``required_model`` override
  on a driver is the documented A/B hatch and is receipted as
  ``explicit-override``.

The agent worker still binds ONE model per process (``AGENT_PROVIDER`` /
``AGENT_MODEL`` env); this layer resolves what the control plane REQUIRES
per purpose, and the drivers' receipt gates fail loud on any mismatch — a
mixed-mode pipeline therefore needs per-mode worker instances, exactly like
the Session 4 bake-off ran.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.config import Settings, get_settings

from .errors import ArtifactValidationError

PROVIDER = "minimax"

#: The two owner-decided modes. Adding a mode is an owner decision, not a
#: config edit.
MODES: dict[str, str] = {
    "speed": "MiniMax-M2.7-highspeed",
    "quality": "MiniMax-M3",
}

#: M3 is the default (owner rule: "default quality").
DEFAULT_MODE = "quality"

#: Purposes whose mode comes from config (Settings field per purpose).
CONFIGURABLE_PURPOSES: dict[str, str] = {
    "manga_direction": "agent_model_mode_direction",
    "manga_page_writing": "agent_model_mode_page_writing",
    "manga_thumbnail": "agent_model_mode_thumbnail",
}

#: Purposes locked to a mode in CODE (invariants, not defaults). Vision is
#: M3-only: MiniMax-M2.7-highspeed is not a vision model, so a "speed"
#: vision call would be a silent capability lie.
LOCKED_PURPOSES: dict[str, str] = {
    "manga_vision_qa": "quality",
}


@dataclass(frozen=True)
class ResolvedModelPolicy:
    purpose: str
    mode: str
    provider: str
    model: str
    #: "config-default" | "locked" | "explicit-override"
    source: str


def mode_for_model(model: str) -> str | None:
    """The mode name a model id belongs to, or None for a foreign model."""
    for mode, mode_model in MODES.items():
        if mode_model == model:
            return mode
    return None


def resolve_model_policy(
    purpose: str,
    *,
    override_mode: str | None = None,
    settings: Settings | None = None,
) -> ResolvedModelPolicy:
    """Resolve the required provider/model for a purpose.

    ``override_mode`` is the explicit, receipted A/B hatch. Unknown purposes
    fall back to the DEFAULT mode (quality/M3) — never to speed.
    """
    if override_mode is not None and override_mode not in MODES:
        raise ArtifactValidationError(
            f"Unknown model mode {override_mode!r}; modes are {sorted(MODES)}"
        )

    locked = LOCKED_PURPOSES.get(purpose)
    if locked is not None:
        if override_mode is not None and override_mode != locked:
            raise ArtifactValidationError(
                f"Purpose {purpose} is locked to mode {locked!r} "
                f"({MODES[locked]}); a {override_mode!r} override is refused"
            )
        return ResolvedModelPolicy(
            purpose=purpose,
            mode=locked,
            provider=PROVIDER,
            model=MODES[locked],
            source="locked",
        )

    if override_mode is not None:
        return ResolvedModelPolicy(
            purpose=purpose,
            mode=override_mode,
            provider=PROVIDER,
            model=MODES[override_mode],
            source="explicit-override",
        )

    config = settings if settings is not None else get_settings()
    field = CONFIGURABLE_PURPOSES.get(purpose)
    mode = getattr(config, field) if field is not None else DEFAULT_MODE
    if mode not in MODES:
        raise ArtifactValidationError(
            f"Configured model mode {mode!r} for purpose {purpose} is unknown; "
            f"modes are {sorted(MODES)}"
        )
    return ResolvedModelPolicy(
        purpose=purpose,
        mode=mode,
        provider=PROVIDER,
        model=MODES[mode],
        source="config-default",
    )


def receipt_mode_fields(model: str, *, explicit_override: bool) -> dict[str, str | None]:
    """The ModelReceipt fields that prove the mode (Session 5 Goal B).

    ``model_mode`` is derived from the model id so a receipt can never claim
    a mode its model does not belong to; ``model_mode_source`` records
    default-vs-override provenance so "no silent default switch" is testable.
    """
    return {
        "model_mode": mode_for_model(model),
        "model_mode_source": "explicit-override" if explicit_override else "config-default",
    }
