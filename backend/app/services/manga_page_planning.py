"""Durable Phase 1 page-script, thumbnail, layout, report, and preview artifacts."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from pydantic import ValidationError

from app.contracts.manga import (
    CompiledPageLayout,
    MangaPagePlan,
    MangaPlan,
    PageScriptSet,
    PageValidationIssue,
    PageValidationReport,
    ThumbnailSet,
)
from app.persistence.documents import ArtifactDoc, construct_document, utc_now
from app.persistence.protocols import ArtifactRepository, RunRepository

from .errors import ArtifactValidationError, AuthorizationError, NotFoundError
from .hashing import binary_content_hash, content_hash
from .manga_layout import (
    LayoutCompilationError,
    compile_page_layout,
    render_thumbnail_svg,
)
from .manga_validation import (
    validate_page_plan,
    validate_page_sequence,
    validation_report,
)


@dataclass(frozen=True)
class ThumbnailPlanningResult:
    thumbnail_artifact: ArtifactDoc
    report_artifact: ArtifactDoc
    compiled_artifacts: tuple[ArtifactDoc, ...]
    preview_artifacts: tuple[ArtifactDoc, ...]


class MangaPagePlanningService:
    def __init__(
        self,
        runs: RunRepository,
        artifacts: ArtifactRepository,
        *,
        media_root: Path = Path("storage"),
    ) -> None:
        self._runs = runs
        self._artifacts = artifacts
        self._media_root = media_root

    async def submit_page_script_set(
        self,
        *,
        run_id: str,
        stage_run_id: str,
        plan_artifact_id: str,
        script_set: PageScriptSet,
        context_pack_id: str | None = None,
        author: str = "agent",
        implementation_version: str | None = None,
    ) -> ArtifactDoc:
        run = await self._runs.get_run(run_id)
        if run is None:
            raise NotFoundError(f"Generation run {run_id} does not exist")
        plan_artifact = await self._accepted_artifact(
            artifact_id=plan_artifact_id,
            project_id=script_set.project_id,
            run_id=run_id,
            kind="manga_plan",
        )
        if plan_artifact.content is None:
            raise ArtifactValidationError("Accepted MangaPlan has no inline content")
        try:
            plan = MangaPlan.model_validate(plan_artifact.content)
        except ValidationError as error:
            raise ArtifactValidationError("Accepted MangaPlan content is invalid") from error
        expected_context_pack_id = context_pack_id or plan.context_pack_id
        if (
            run.project_id != script_set.project_id
            or script_set.plan_artifact_id != plan_artifact_id
            or script_set.context_pack_id != expected_context_pack_id
        ):
            raise AuthorizationError("PageScriptSet identity does not match accepted run lineage")
        if len(script_set.pages) > plan.target_page_count:
            raise ArtifactValidationError("PageScriptSet exceeds accepted plan page count")
        if sum(len(page.panels) for page in script_set.pages) > len(plan.beats):
            raise ArtifactValidationError("PageScriptSet exceeds accepted grounded beat count")
        self._validate_script_sources(script_set, plan)

        payload = script_set.model_dump(mode="json")
        digest = content_hash(payload)
        artifact = construct_document(
            ArtifactDoc,
            artifact_id=f"page_script_set_{digest[:24]}",
            project_id=script_set.project_id,
            run_id=run_id,
            stage_run_id=stage_run_id,
            kind="page_script_set",
            schema_version="page-script-set.v1",
            content=payload,
            storage_ref=None,
            content_hash=digest,
            parent_artifact_ids=[plan_artifact_id],
            author=author,
            supersedes_artifact_id=None,
            source_refs=self._script_source_refs(script_set),
            model_receipt=None,
            validation_status="accepted",
            validation_report={
                "passed": True,
                "issues": [],
                "validator_version": "page-script-validator.v1",
                **(
                    {"implementation_version": implementation_version}
                    if implementation_version is not None
                    else {}
                ),
            },
            created_at=utc_now(),
        )
        return await self._artifacts.save_artifact(artifact)

    async def submit_thumbnail_set(
        self,
        *,
        run_id: str,
        stage_run_id: str,
        script_artifact_id: str,
        thumbnail_set: ThumbnailSet,
        author: str = "agent",
    ) -> ThumbnailPlanningResult:
        script_artifact = await self._accepted_artifact(
            artifact_id=script_artifact_id,
            project_id=thumbnail_set.project_id,
            run_id=run_id,
            kind="page_script_set",
        )
        if script_artifact.content is None:
            raise ArtifactValidationError("Accepted PageScriptSet has no inline content")
        try:
            script_set = PageScriptSet.model_validate(script_artifact.content)
        except ValidationError as error:
            raise ArtifactValidationError("Accepted PageScriptSet content is invalid") from error
        if thumbnail_set.script_set_artifact_id != script_artifact_id:
            raise AuthorizationError("ThumbnailSet references another PageScriptSet")
        expected_pages = {page.page_id: page for page in script_set.pages}
        actual_pages = {
            plan.page_script.page_id: plan.page_script
            for plan in thumbnail_set.page_plans
        }
        if actual_pages != expected_pages:
            raise ArtifactValidationError(
                "ThumbnailSet page scripts must match the accepted PageScriptSet exactly"
            )

        thumbnail_payload = thumbnail_set.model_dump(mode="json")
        thumbnail_digest = content_hash(thumbnail_payload)
        thumbnail_artifact_id = f"thumbnail_set_{thumbnail_digest[:24]}"
        compiled: list[tuple[MangaPagePlan, CompiledPageLayout]] = []
        issues: list[PageValidationIssue] = []
        for index, plan in enumerate(thumbnail_set.page_plans):
            try:
                layout = compile_page_layout(plan)
            except LayoutCompilationError as error:
                issues.extend(
                    issue.model_copy(
                        update={"path": f"/page_plans/{index}{issue.path}"}
                    )
                    for issue in error.issues
                )
                continue
            known_fact_ids = {
                fact_id
                for page in script_set.pages
                for panel in page.panels
                for fact_id in panel.source_fact_ids
            }
            issues.extend(
                issue.model_copy(update={"path": f"/page_plans/{index}{issue.path}"})
                for issue in validate_page_plan(
                    plan,
                    layout,
                    known_source_fact_ids=known_fact_ids,
                )
            )
            compiled.append((plan, layout))
        if len(compiled) == len(thumbnail_set.page_plans):
            issues.extend(validate_page_sequence(compiled))

        report = validation_report(
            candidate_artifact_id=thumbnail_artifact_id,
            issues=issues,
        )
        report_artifact = await self._persist_report(
            run_id=run_id,
            stage_run_id=stage_run_id,
            project_id=thumbnail_set.project_id,
            parent_artifact_id=script_artifact_id,
            report=report,
        )
        accepted = report.passed and len(compiled) == len(thumbnail_set.page_plans)
        thumbnail_artifact = construct_document(
            ArtifactDoc,
            artifact_id=thumbnail_artifact_id,
            project_id=thumbnail_set.project_id,
            run_id=run_id,
            stage_run_id=stage_run_id,
            kind="thumbnail_set",
            schema_version="thumbnail-set.v1",
            content=thumbnail_payload,
            storage_ref=None,
            content_hash=thumbnail_digest,
            parent_artifact_ids=[script_artifact_id, report_artifact.artifact_id],
            author=author,
            supersedes_artifact_id=None,
            source_refs=self._script_source_refs(script_set),
            model_receipt=None,
            validation_status="accepted" if accepted else "invalid",
            validation_report={
                "passed": accepted,
                "issues": [
                    {
                        "code": issue.code,
                        "message": issue.message,
                        "path": issue.path,
                    }
                    for issue in issues
                ],
                "validator_version": report.validator_version,
            },
            created_at=utc_now(),
        )
        stored_thumbnail = await self._artifacts.save_artifact(thumbnail_artifact)
        if not accepted:
            return ThumbnailPlanningResult(
                thumbnail_artifact=stored_thumbnail,
                report_artifact=report_artifact,
                compiled_artifacts=(),
                preview_artifacts=(),
            )

        compiled_artifacts: list[ArtifactDoc] = []
        preview_artifacts: list[ArtifactDoc] = []
        for plan, layout in compiled:
            page_artifact = await self._persist_page_plan(
                run_id=run_id,
                stage_run_id=stage_run_id,
                thumbnail_artifact=stored_thumbnail,
                plan=plan,
                author=author,
            )
            compiled_artifact = await self._persist_compiled_layout(
                run_id=run_id,
                stage_run_id=stage_run_id,
                thumbnail_artifact=stored_thumbnail,
                page_artifact=page_artifact,
                layout=layout,
            )
            preview_artifact = await self._persist_preview(
                run_id=run_id,
                stage_run_id=stage_run_id,
                project_id=thumbnail_set.project_id,
                page_artifact=page_artifact,
                compiled_artifact=compiled_artifact,
                svg=render_thumbnail_svg(plan, layout),
            )
            compiled_artifacts.append(compiled_artifact)
            preview_artifacts.append(preview_artifact)
        return ThumbnailPlanningResult(
            thumbnail_artifact=stored_thumbnail,
            report_artifact=report_artifact,
            compiled_artifacts=tuple(compiled_artifacts),
            preview_artifacts=tuple(preview_artifacts),
        )

    async def reconstruct_previews(self, thumbnail_artifact_id: str) -> tuple[str, ...]:
        artifact = await self._artifacts.get_artifact(thumbnail_artifact_id)
        if artifact is None:
            raise NotFoundError(f"Thumbnail artifact {thumbnail_artifact_id} does not exist")
        if artifact.kind != "thumbnail_set" or artifact.validation_status != "accepted":
            raise ArtifactValidationError("Thumbnail artifact is not accepted")
        if artifact.content is None:
            raise ArtifactValidationError("Accepted ThumbnailSet has no inline content")
        try:
            thumbnail_set = ThumbnailSet.model_validate(artifact.content)
        except ValidationError as error:
            raise ArtifactValidationError("Accepted ThumbnailSet content is invalid") from error
        return tuple(
            render_thumbnail_svg(plan, compile_page_layout(plan))
            for plan in thumbnail_set.page_plans
        )

    async def _accepted_artifact(
        self,
        *,
        artifact_id: str,
        project_id: str,
        run_id: str,
        kind: str,
    ) -> ArtifactDoc:
        artifact = await self._artifacts.get_artifact(artifact_id)
        if artifact is None:
            raise NotFoundError(f"Artifact {artifact_id} does not exist")
        if (
            artifact.project_id != project_id
            or artifact.run_id != run_id
            or artifact.kind != kind
            or artifact.validation_status != "accepted"
        ):
            raise AuthorizationError(f"Artifact {artifact_id} is outside accepted run lineage")
        return artifact

    @staticmethod
    def _validate_script_sources(script_set: PageScriptSet, plan: MangaPlan) -> None:
        accepted_refs = {
            content_hash(ref.model_dump(mode="json")): ref
            for beat in plan.beats
            for ref in beat.source_refs
        }
        for page in script_set.pages:
            for panel in page.panels:
                for ref in panel.source_refs:
                    if content_hash(ref.model_dump(mode="json")) not in accepted_refs:
                        raise AuthorizationError(
                            f"PageScript panel {panel.panel_id} cites source outside MangaPlan"
                        )

    @staticmethod
    def _script_source_refs(script_set: PageScriptSet) -> list[dict[str, object]]:
        refs = {
            content_hash(ref.model_dump(mode="json")): ref.model_dump(mode="json")
            for page in script_set.pages
            for panel in page.panels
            for ref in panel.source_refs
        }
        return [refs[key] for key in sorted(refs)]

    async def _persist_report(
        self,
        *,
        run_id: str,
        stage_run_id: str,
        project_id: str,
        parent_artifact_id: str,
        report: PageValidationReport,
    ) -> ArtifactDoc:
        payload = report.model_dump(mode="json")
        artifact = construct_document(
            ArtifactDoc,
            artifact_id=report.report_id,
            project_id=project_id,
            run_id=run_id,
            stage_run_id=stage_run_id,
            kind="validation_report",
            schema_version="page-validation-report.v1",
            content=payload,
            storage_ref=None,
            content_hash=content_hash(payload),
            parent_artifact_ids=[parent_artifact_id],
            author="system",
            supersedes_artifact_id=None,
            source_refs=[],
            model_receipt=None,
            validation_status="accepted",
            validation_report={
                "passed": True,
                "issues": [],
                "validator_version": "page-validation-report-schema.v1",
            },
            created_at=utc_now(),
        )
        return await self._artifacts.save_artifact(artifact)

    async def _persist_page_plan(
        self,
        *,
        run_id: str,
        stage_run_id: str,
        thumbnail_artifact: ArtifactDoc,
        plan: MangaPagePlan,
        author: str,
    ) -> ArtifactDoc:
        payload = plan.model_dump(mode="json")
        digest = content_hash(payload)
        artifact = construct_document(
            ArtifactDoc,
            artifact_id=f"page_layout_{digest[:24]}",
            project_id=thumbnail_artifact.project_id,
            run_id=run_id,
            stage_run_id=stage_run_id,
            kind="page_layout",
            schema_version="manga-page-plan.v1",
            content=payload,
            storage_ref=None,
            content_hash=digest,
            parent_artifact_ids=[thumbnail_artifact.artifact_id],
            author=author,
            supersedes_artifact_id=None,
            source_refs=[
                ref.model_dump(mode="json")
                for panel in plan.page_script.panels
                for ref in panel.source_refs
            ],
            model_receipt=None,
            validation_status="accepted",
            validation_report={
                "passed": True,
                "issues": [],
                "validator_version": "manga-page-validator.v1",
            },
            created_at=utc_now(),
        )
        return await self._artifacts.save_artifact(artifact)

    async def _persist_compiled_layout(
        self,
        *,
        run_id: str,
        stage_run_id: str,
        thumbnail_artifact: ArtifactDoc,
        page_artifact: ArtifactDoc,
        layout: CompiledPageLayout,
    ) -> ArtifactDoc:
        payload = layout.model_dump(mode="json")
        digest = content_hash(payload)
        artifact = construct_document(
            ArtifactDoc,
            artifact_id=f"compiled_layout_{digest[:24]}",
            project_id=thumbnail_artifact.project_id,
            run_id=run_id,
            stage_run_id=stage_run_id,
            kind="compiled_layout",
            schema_version="compiled-layout.v1",
            content=payload,
            storage_ref=None,
            content_hash=digest,
            parent_artifact_ids=[thumbnail_artifact.artifact_id, page_artifact.artifact_id],
            author="system",
            supersedes_artifact_id=None,
            source_refs=page_artifact.source_refs,
            model_receipt=None,
            validation_status="accepted",
            validation_report={
                "passed": True,
                "issues": [],
                "validator_version": "manga-layout-compiler.v1",
            },
            created_at=utc_now(),
        )
        return await self._artifacts.save_artifact(artifact)

    async def _persist_preview(
        self,
        *,
        run_id: str,
        stage_run_id: str,
        project_id: str,
        page_artifact: ArtifactDoc,
        compiled_artifact: ArtifactDoc,
        svg: str,
    ) -> ArtifactDoc:
        data = svg.encode("utf-8")
        digest = binary_content_hash(data)
        relative = Path("manga-previews") / f"{digest}.svg"
        path = self._media_root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and binary_content_hash(path.read_bytes()) != digest:
            raise ArtifactValidationError("Thumbnail preview identity has different bytes")
        if not path.exists():
            path.write_bytes(data)
        artifact = construct_document(
            ArtifactDoc,
            artifact_id=f"thumbnail_preview_{digest[:24]}",
            project_id=project_id,
            run_id=run_id,
            stage_run_id=stage_run_id,
            kind="thumbnail_preview",
            schema_version="thumbnail-preview.svg.v4",
            content=None,
            storage_ref=f"storage://{relative.as_posix()}",
            content_hash=digest,
            parent_artifact_ids=[page_artifact.artifact_id, compiled_artifact.artifact_id],
            author="system",
            supersedes_artifact_id=None,
            source_refs=page_artifact.source_refs,
            model_receipt=None,
            validation_status="accepted",
            validation_report={
                "passed": True,
                "issues": [],
                "validator_version": "thumbnail-preview-svg.v4",
            },
            created_at=utc_now(),
        )
        return await self._artifacts.save_artifact(artifact)
