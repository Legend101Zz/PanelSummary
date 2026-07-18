"""Typed vector-scene primitives for manga panel backgrounds.

The renderer consumes these as data and converts them to inline SVG. We do not
accept raw SVG here: keeping the contract as typed primitives gives the
frontend a small, safe whitelist without sanitizer drift.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator


Percent = Annotated[float, Field(ge=0, le=100)]
Opacity = Annotated[float, Field(ge=0, le=1)]

TonePattern = Literal["dots", "hatching", "crosshatch", "speed", "grain", "none"]
LineKind = Literal[
    "horizon",
    "interior",
    "floor",
    "wall",
    "desk",
    "window",
    "door",
    "object",
    "hatching",
    "perspective",
    "speedline",
    "focus",
    "diagonal",
]


class VectorSceneBackground(BaseModel):
    fill: str = "#f8f4ea"
    gradient_to: str = ""
    gradient_angle: Annotated[int, Field(ge=0, le=360)] = 135


class VectorSceneTone(BaseModel):
    pattern: TonePattern = "dots"
    opacity: Opacity = 0.16
    scale: Annotated[float, Field(ge=2, le=24)] = 6
    stroke: str = "#1f1f29"


class VectorSceneLine(BaseModel):
    kind: LineKind = "horizon"
    x1: Percent
    y1: Percent
    x2: Percent
    y2: Percent
    stroke: str = "#1f1f29"
    stroke_width: Annotated[float, Field(gt=0, le=8)] = 1.4
    opacity: Opacity = 0.38


class VectorSceneSilhouette(BaseModel):
    x: Percent = 50
    y: Percent = 78
    scale: Annotated[float, Field(gt=0, le=3)] = 1
    pose: str = "standing"
    opacity: Opacity = 0.36


class VectorSceneSpeedlineBurst(BaseModel):
    origin_x: Percent = 50
    origin_y: Percent = 48
    count: Annotated[int, Field(ge=4, le=48)] = 18
    spread: Annotated[float, Field(ge=10, le=100)] = 72
    opacity: Opacity = 0.24


class VectorSceneRadialFocus(BaseModel):
    x: Percent = 50
    y: Percent = 45
    radius: Annotated[float, Field(ge=10, le=120)] = 72
    opacity: Opacity = 0.18


class VectorSceneSfx(BaseModel):
    text: str
    x: Percent = 50
    y: Percent = 30
    size: Annotated[float, Field(ge=6, le=36)] = 16
    rotation: Annotated[float, Field(ge=-45, le=45)] = 0
    stroke: str = "#1f1f29"
    fill: str = "#fffaf0"

    @field_validator("text")
    @classmethod
    def _compact_lettering(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("vector scene sfx text cannot be blank")
        if len(text) > 24:
            raise ValueError("vector scene sfx text must be 24 characters or fewer")
        return text


class VectorScene(BaseModel):
    background: VectorSceneBackground | None = None
    tone: VectorSceneTone | None = None
    linework: list[VectorSceneLine] = Field(default_factory=list)
    silhouettes: list[VectorSceneSilhouette] = Field(default_factory=list)
    speedlines: list[VectorSceneSpeedlineBurst] = Field(default_factory=list)
    radial_focus: VectorSceneRadialFocus | None = None
    vignette: bool = False
    sfx: list[VectorSceneSfx] = Field(default_factory=list)
    mood: str = ""

    @property
    def has_visible_ink(self) -> bool:
        tone_visible = (
            self.tone is not None
            and self.tone.pattern != "none"
            and self.tone.opacity > 0
        )
        line_visible = any(line.opacity > 0 and line.stroke_width > 0 for line in self.linework)
        silhouette_visible = any(silhouette.opacity > 0 for silhouette in self.silhouettes)
        speed_visible = any(burst.opacity > 0 and burst.count > 0 for burst in self.speedlines)
        focus_visible = self.radial_focus is not None and self.radial_focus.opacity > 0
        sfx_visible = any(sfx.text.strip() for sfx in self.sfx)
        return any(
            [
                tone_visible,
                line_visible,
                silhouette_visible,
                speed_visible,
                focus_visible,
                self.vignette,
                sfx_visible,
            ]
        )
