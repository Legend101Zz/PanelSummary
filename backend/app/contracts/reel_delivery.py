"""Browser-ready reel delivery and consumption-state contracts."""

from __future__ import annotations

from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import AwareDatetime, Field, field_validator, model_validator

from .base import ContentHash, ContractModel, Identifier
from .manga import MangaManifest
from .reel import (
    DialogueExchangeScene,
    ImpactCutScene,
    MontageScene,
    NarratorCardScene,
    PageTurnScene,
    PanelFocusScene,
    ReelSpec,
    SplitPanelScene,
)


BrowserUrl = Annotated[
    str,
    Field(
        min_length=1,
        max_length=2_048,
        pattern=r"^(?:https?://[^\s/]+(?:/[^\s]*)?|/[^/\s][^\s]*)$",
    ),
]
MimeType = Annotated[
    str,
    Field(
        min_length=3,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$",
    ),
]


def _is_browser_url(value: str) -> bool:
    if value.startswith("/"):
        return not value.startswith("//")
    parsed = urlsplit(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _referenced_panel_ids(reel_spec: ReelSpec) -> set[str]:
    panel_ids: set[str] = set()
    for scene in reel_spec.scenes:
        if isinstance(scene, (PanelFocusScene, DialogueExchangeScene, ImpactCutScene)):
            panel_ids.add(scene.panel_id)
        elif isinstance(scene, (SplitPanelScene, MontageScene)):
            panel_ids.update(scene.panel_ids)
        elif isinstance(scene, PageTurnScene):
            panel_ids.update((scene.from_panel_id, scene.to_panel_id))
    return panel_ids


class ReelSummary(ContractModel):
    reel_id: Identifier
    reel_spec_artifact_id: Identifier
    sequence: Annotated[int, Field(ge=0)]
    duration_frames: Annotated[int, Field(gt=0)]


class ReelSeries(ContractModel):
    schema_version: Literal["reel-series.v1"]
    book_id: Identifier
    project_id: Identifier
    series_id: Identifier
    manga_manifest_artifact_id: Identifier
    reels: list[ReelSummary] = Field(min_length=1, max_length=1_000)

    @model_validator(mode="after")
    def validate_reels(self) -> "ReelSeries":
        reel_ids = [reel.reel_id for reel in self.reels]
        if len(reel_ids) != len(set(reel_ids)):
            raise ValueError("reel_id values must be unique")
        artifact_ids = [reel.reel_spec_artifact_id for reel in self.reels]
        if len(artifact_ids) != len(set(artifact_ids)):
            raise ValueError("reel_spec_artifact_id values must be unique")
        if [reel.sequence for reel in self.reels] != list(range(len(self.reels))):
            raise ValueError("reel sequence values must be contiguous from zero")
        return self


class ResolvedReelAsset(ContractModel):
    asset_id: Identifier
    kind: Literal["image", "audio", "caption_track"]
    content_hash: ContentHash
    mime_type: MimeType
    url: BrowserUrl
    url_expires_at: AwareDatetime | None = None
    width: Annotated[int, Field(gt=0)] | None = None
    height: Annotated[int, Field(gt=0)] | None = None
    duration_ms: Annotated[int, Field(gt=0)] | None = None

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        if not _is_browser_url(value):
            raise ValueError("url must be root-relative or use http(s)")
        return value

    @model_validator(mode="after")
    def validate_mime_type(self) -> "ResolvedReelAsset":
        normalized = self.mime_type.lower()
        if self.kind == "image" and not normalized.startswith("image/"):
            raise ValueError("image assets require an image MIME type")
        if self.kind == "audio" and not normalized.startswith("audio/"):
            raise ValueError("audio assets require an audio MIME type")
        return self


class CaptionCue(ContractModel):
    text: Annotated[str, Field(min_length=1, max_length=240)]
    start_frame: Annotated[int, Field(ge=0)]
    end_frame: Annotated[int, Field(gt=0)]
    speaker_id: Identifier | None = None

    @model_validator(mode="after")
    def validate_frame_range(self) -> "CaptionCue":
        if self.end_frame <= self.start_frame:
            raise ValueError("end_frame must be greater than start_frame")
        return self


class ReelPlayerPayload(ContractModel):
    schema_version: Literal["reel-player-payload.v1"]
    book_id: Identifier
    project_id: Identifier
    series_id: Identifier
    manga_manifest_artifact_id: Identifier
    reel_spec_artifact_id: Identifier
    reel_spec: ReelSpec
    manga_manifest: MangaManifest
    assets: dict[Identifier, ResolvedReelAsset] = Field(max_length=10_000)
    captions: list[CaptionCue] = Field(default_factory=list, max_length=10_000)
    poster_url: BrowserUrl | None = None
    rendered_mp4_url: BrowserUrl | None = None

    @field_validator("poster_url", "rendered_mp4_url")
    @classmethod
    def validate_optional_url(cls, value: str | None) -> str | None:
        if value is not None and not _is_browser_url(value):
            raise ValueError("media URL must be root-relative or use http(s)")
        return value

    @model_validator(mode="after")
    def validate_delivery_graph(self) -> "ReelPlayerPayload":
        if self.manga_manifest.project_id != self.project_id:
            raise ValueError("manga_manifest project_id must match payload project_id")
        if self.reel_spec.series_id != self.series_id:
            raise ValueError("reel_spec series_id must match payload series_id")
        if self.reel_spec.manga_manifest_id != self.manga_manifest_artifact_id:
            raise ValueError(
                "reel_spec manga_manifest_id must match payload manga_manifest_artifact_id"
            )

        source_book_ids = {ref.book_id for ref in self.reel_spec.source_refs}
        source_book_ids.update(
            ref.book_id for beat in self.manga_manifest.beats for ref in beat.source_refs
        )
        source_book_ids.update(
            ref.book_id for panel in self.manga_manifest.panels for ref in panel.source_refs
        )
        if source_book_ids != {self.book_id}:
            raise ValueError("all source refs must match payload book_id")

        manifest_beat_ids = {beat.beat_id for beat in self.manga_manifest.beats}
        if not set(self.reel_spec.beat_ids).issubset(manifest_beat_ids):
            raise ValueError("reel_spec beat_ids must reference manga_manifest beats")

        panels = {panel.panel_id: panel for panel in self.manga_manifest.panels}
        referenced_panel_ids = _referenced_panel_ids(self.reel_spec)
        if not referenced_panel_ids.issubset(panels):
            raise ValueError("reel scenes must reference manga_manifest panels")

        if set(self.assets) != {asset.asset_id for asset in self.assets.values()}:
            raise ValueError("asset map keys must match ResolvedReelAsset.asset_id")

        required_image_ids: set[str] = set()
        for panel_id in referenced_panel_ids:
            visual_asset_ids = panels[panel_id].visual_asset_ids
            if not visual_asset_ids:
                raise ValueError("referenced manifest panels must provide a visual asset")
            required_image_ids.add(visual_asset_ids[0])
        for scene in self.reel_spec.scenes:
            if isinstance(scene, PanelFocusScene) and scene.asset_id is not None:
                if scene.asset_id not in panels[scene.panel_id].visual_asset_ids:
                    raise ValueError(
                        "panel_focus asset_id must belong to the referenced manifest panel"
                    )
                required_image_ids.add(scene.asset_id)
            elif isinstance(scene, NarratorCardScene) and scene.background_asset_id is not None:
                required_image_ids.add(scene.background_asset_id)

        required_audio_ids = {
            asset_id
            for asset_id in (
                self.reel_spec.audio.narration_asset_id,
                self.reel_spec.audio.music_asset_id,
            )
            if asset_id is not None
        }
        required_audio_ids.update(cue.asset_id for cue in self.reel_spec.audio.sfx_cues)
        required_caption_ids: set[str] = set()
        if self.reel_spec.audio.caption_track_id is not None:
            required_caption_ids.add(self.reel_spec.audio.caption_track_id)

        required_asset_ids = required_image_ids | required_audio_ids | required_caption_ids
        missing_asset_ids = required_asset_ids - set(self.assets)
        if missing_asset_ids:
            raise ValueError("all referenced reel assets must be resolved")
        if any(self.assets[asset_id].kind != "image" for asset_id in required_image_ids):
            raise ValueError("panel and background assets must resolve as image assets")
        if any(self.assets[asset_id].kind != "audio" for asset_id in required_audio_ids):
            raise ValueError("reel audio assets must resolve as audio assets")
        if any(
            self.assets[asset_id].kind != "caption_track" for asset_id in required_caption_ids
        ):
            raise ValueError("caption track assets must resolve as caption_track assets")

        previous_end = 0
        for cue in self.captions:
            if cue.start_frame < previous_end:
                raise ValueError("caption cues must be ordered and non-overlapping")
            if cue.end_frame > self.reel_spec.format.duration_frames:
                raise ValueError("caption cues must fall inside the reel timeline")
            previous_end = cue.end_frame
        return self


class SeriesProgress(ContractModel):
    schema_version: Literal["series-progress.v1"]
    series_id: Identifier
    last_manga_page: Annotated[int, Field(ge=0)]
    last_reel_id: Identifier | None = None
    viewed_reel_ids: list[Identifier] = Field(default_factory=list, max_length=10_000)
    updated_at: AwareDatetime

    @model_validator(mode="after")
    def validate_reel_history(self) -> "SeriesProgress":
        if len(self.viewed_reel_ids) != len(set(self.viewed_reel_ids)):
            raise ValueError("viewed_reel_ids must be unique")
        if self.last_reel_id is not None and self.last_reel_id not in self.viewed_reel_ids:
            raise ValueError("last_reel_id must appear in viewed_reel_ids")
        return self


class SeriesProgressUpdate(ContractModel):
    schema_version: Literal["series-progress-update.v1"]
    last_manga_page: Annotated[int, Field(ge=0)]
    last_reel_id: Identifier | None = None
    viewed_reel_ids: list[Identifier] = Field(default_factory=list, max_length=10_000)

    @model_validator(mode="after")
    def validate_reel_history(self) -> "SeriesProgressUpdate":
        if len(self.viewed_reel_ids) != len(set(self.viewed_reel_ids)):
            raise ValueError("viewed_reel_ids must be unique")
        if self.last_reel_id is not None and self.last_reel_id not in self.viewed_reel_ids:
            raise ValueError("last_reel_id must appear in viewed_reel_ids")
        return self
