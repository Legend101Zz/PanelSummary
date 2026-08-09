"""Read-only reader-v2 seam over the v2-architecture lane (Session 6).

Serves the ADR-009 compiled-geometry lineage — accepted ``composed_page``
rows (latest per page, supersedes-aware) with their ``page_art`` and
``compiled_layout`` parents — to the flag-gated v2 reader in
``frontend/components/MangaReader``. Additive on purpose:

- the legacy v1 reader path and its endpoints are untouched (ADR-009
  compatibility: v1 pages are never auto-upgraded);
- this router only READS accepted artifacts; it can never mutate a run;
- composed/page-art images live outside the v1 ``image_dir``, so a
  dedicated allowlisted file route serves exactly those two folders.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.persistence.documents import ArtifactDoc
from app.persistence.protocols import Repositories

#: Only these storage folders are reachable through the v2 media route.
V2_MEDIA_FOLDERS = frozenset({"composed-pages", "page-art"})


def latest_accepted_per_page(
    artifacts: list[ArtifactDoc], *, kind: str
) -> dict[int, ArtifactDoc]:
    """Latest accepted artifact of ``kind`` per page_index, supersedes-aware.

    A row that any OTHER accepted row supersedes is history, never served;
    among the remainder the newest ``created_at`` wins per page index.
    Pure function — unit-tested without Mongo.
    """
    accepted = [
        artifact
        for artifact in artifacts
        if artifact.kind == kind
        and artifact.validation_status == "accepted"
        and artifact.content is not None
    ]
    superseded = {
        artifact.supersedes_artifact_id
        for artifact in accepted
        if artifact.supersedes_artifact_id
    }
    by_page: dict[int, ArtifactDoc] = {}
    for artifact in accepted:
        if artifact.artifact_id in superseded:
            continue
        page_index = int(artifact.content.get("page_index", -1))
        current = by_page.get(page_index)
        if current is None or artifact.created_at > current.created_at:
            by_page[page_index] = artifact
    return by_page


def latest_composed_per_page(artifacts: list[ArtifactDoc]) -> list[ArtifactDoc]:
    """Session 6 shape, kept for its tests: composed rows in page order."""
    by_page = latest_accepted_per_page(artifacts, kind="composed_page")
    return [by_page[index] for index in sorted(by_page)]


def storage_media_url(storage_ref: str | None) -> str | None:
    """Map a ``storage://folder/name.png`` ref onto the v2 media route."""
    if not storage_ref or not storage_ref.startswith("storage://"):
        return None
    relative = storage_ref.removeprefix("storage://")
    folder = relative.split("/", 1)[0]
    if folder not in V2_MEDIA_FOLDERS:
        return None
    return f"/v2-media/{relative}"


def resolve_v2_media_path(storage_root: Path, media_path: str) -> Path:
    """Traversal-safe resolution limited to the allowlisted folders."""
    folder = media_path.split("/", 1)[0]
    if folder not in V2_MEDIA_FOLDERS:
        raise HTTPException(status_code=404, detail="Unknown media folder")
    candidate = (storage_root / media_path).resolve()
    allowed_root = (storage_root / folder).resolve()
    if not str(candidate).startswith(str(allowed_root) + "/") and candidate != allowed_root:
        raise HTTPException(status_code=404, detail="Media path outside storage")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="Media file not found")
    return candidate


def manga_v2_reader_router(
    repositories: Repositories, *, storage_root: Path
) -> APIRouter:
    router = APIRouter(tags=["manga-v2-reader"])

    @router.get("/manga-projects/{project_id}/v2/pages")
    async def list_v2_pages(project_id: str) -> dict:
        runs = await repositories.list_project_runs(project_id)
        v2_runs = [run for run in runs if run.run_id.startswith("run_dir_")]
        if not v2_runs:
            raise HTTPException(
                status_code=404, detail="Project has no v2-architecture runs"
            )
        artifacts: list[ArtifactDoc] = []
        for run in v2_runs:
            artifacts.extend(
                await repositories.list_artifacts(run.run_id, accepted_only=True)
            )
        composed_by_page = latest_accepted_per_page(artifacts, kind="composed_page")
        art_by_page = latest_accepted_per_page(artifacts, kind="page_art")
        if not composed_by_page and not art_by_page:
            raise HTTPException(
                status_code=404, detail="Project has no accepted composed pages"
            )
        layouts_by_plan = {
            artifact.content.get("page_plan_id"): artifact
            for artifact in artifacts
            if artifact.kind == "compiled_layout" and artifact.content is not None
        }
        art_by_id = {
            artifact.artifact_id: artifact
            for artifact in artifacts
            if artifact.kind == "page_art"
        }

        def art_payload(art: ArtifactDoc | None) -> dict | None:
            if art is None:
                return None
            return {
                "artifact_id": art.artifact_id,
                "image_url": storage_media_url(art.storage_ref),
                "rendering_mode": (art.content or {}).get("rendering_mode"),
                "gates_accepted": bool(
                    ((art.content or {}).get("gates") or {}).get("accepted")
                ),
            }

        pages = []
        for page_index in sorted(set(composed_by_page) | set(art_by_page)):
            composed = composed_by_page.get(page_index)
            if composed is not None:
                content = composed.content or {}
                art_id = content.get("page_art_artifact_id")
                art = art_by_id.get(art_id) if isinstance(art_id, str) else None
                layout = layouts_by_plan.get(content.get("page_plan_id"))
                pages.append(
                    {
                        "page_index": content.get("page_index"),
                        "composed": {
                            "artifact_id": composed.artifact_id,
                            "schema_version": composed.schema_version,
                            "content": content,
                            "image_url": storage_media_url(composed.storage_ref),
                            "supersedes_artifact_id": composed.supersedes_artifact_id,
                        },
                        "page_art": art_payload(art),
                        "compiled_layout": (
                            layout.content if layout is not None else None
                        ),
                    }
                )
                continue
            # Session 7 fold: a page with accepted ART but no composed row
            # (a mid-pipeline crash or a compose-stage regression) serves
            # its raw page_art instead of 404ing the whole page.
            art = art_by_page[page_index]
            layout = layouts_by_plan.get((art.content or {}).get("page_plan_id"))
            pages.append(
                {
                    "page_index": (art.content or {}).get("page_index"),
                    "composed": None,
                    "page_art": art_payload(art),
                    "compiled_layout": (
                        layout.content if layout is not None else None
                    ),
                }
            )
        return {"project_id": project_id, "pages": pages}

    @router.get("/v2-media/{media_path:path}")
    async def get_v2_media(media_path: str) -> FileResponse:
        path = resolve_v2_media_path(storage_root, media_path)
        return FileResponse(
            path,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    return router
