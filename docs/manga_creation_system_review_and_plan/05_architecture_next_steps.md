# Architecture Revamp and Next Steps

## 19. Full codebase architecture revamp plan

The manga generation system has grown organically. The next iteration should make it feel like a professional product architecture, not a stack of clever scripts wearing a trench coat.

### 19.1 Revamp principles

1. Domain artifacts first, render DSL last.
2. Separate orchestration from stage logic.
3. Separate persistence from generation logic.
4. Make project/slice continuation first-class.
5. Make V4 the default path.
6. Keep legacy V2 behind an adapter/feature flag.
7. Leave reel-renderer backend untouched for now; add TODO integration points only.
8. Add rollback checkpoints before risky work.

### 19.2 Proposed backend package structure

```text
backend/app/
  api/
    routes/
      books.py
      summaries_legacy.py
      manga_projects.py
      manga_pages.py
      images.py
      jobs.py
      reels.py                  # keep existing reel routes; TODO later
    schemas/
      manga_requests.py
      manga_responses.py

  domain/
    manga/
      types.py                  # Pydantic domain models
      enums.py
      validators.py
    books/
      types.py

  services/
    books/
      pdf_parse_service.py
      chapter_service.py
    manga/
      project_service.py
      slice_service.py
      continuation_service.py
      asset_service.py
      page_service.py
      quality_service.py
    llm/
      llm_service.py
      prompt_runner.py

  manga_pipeline/
    orchestrator.py             # thin coordinator only
    context.py                  # PipelineContext dataclass
    stages/
      canonical_summary_stage.py
      document_understanding_stage.py
      fact_registry_stage.py
      adaptation_plan_stage.py
      character_bible_stage.py
      asset_generation_stage.py
      beat_sheet_stage.py
      script_writer_stage.py
      storyboard_stage.py
      storyboard_to_v4_stage.py
      quality_gate_stage.py
      persistence_stage.py
    legacy/
      legacy_orchestrator_adapter.py
      legacy_v2_adapter.py
      legacy_booksummary_adapter.py

  rendering/
    v4/
      types.py
      mapper.py
      fallback.py
    v2/
      dsl_generator.py
      dsl_fixer.py
      compatibility.py

  repositories/
    book_repository.py
    manga_project_repository.py
    manga_slice_repository.py
    manga_page_repository.py
    manga_asset_repository.py
    summary_repository.py

  workers/
    celery_app.py
    tasks/
      parse_pdf_task.py
      generate_manga_project_task.py
      generate_manga_slice_task.py
      legacy_summary_task.py
      reel_tasks.py             # leave as TODO/compat

  prompts/
    manga/
      document_understanding.py
      adaptation_plan.py
      character_bible.py
      beat_sheet.py
      script_writer.py
      storyboarder.py
      repair.py
```

This does not need to be done in one giant PR. But this is the target shape.

### 19.3 Backend class responsibilities

#### `MangaProjectService`

- create/find project for book/style/options,
- load project state,
- update coverage,
- expose project summary to UI.

#### `ContinuationService`

- choose next source slice,
- build continuity context,
- update continuity ledger after slice generation,
- decide whether to add recap/to-be-continued.

#### `MangaPipelineOrchestrator`

Thin coordinator:

```python
async def run_slice(context: PipelineContext) -> MangaSliceResult:
    context = await canonical_summary_stage.run(context)
    context = await fact_registry_stage.run(context)
    context = await adaptation_plan_stage.run(context)
    context = await character_bible_stage.run(context)
    context = await beat_sheet_stage.run(context)
    context = await script_writer_stage.run(context)
    context = await storyboard_stage.run(context)
    context = await quality_gate_stage.run(context)
    context = await storyboard_to_v4_stage.run(context)
    await persistence_stage.run(context)
    return context.result
```

No persistence hidden inside random generation stages. No renderer writing story. No more goblin casserole.

#### `PipelineContext`

```python
@dataclass
class PipelineContext:
    book: Book
    project: MangaProject
    source_slice: SourceSlice
    prior_continuity: ContinuityLedger
    canonical_chapters: list[dict]
    knowledge_doc: dict
    fact_registry: list[dict]
    adaptation_plan: dict
    character_bible: dict
    beat_sheet: dict
    manga_script: dict
    storyboard_pages: list[dict]
    v4_pages: list[dict]
    quality_report: dict
    options: MangaGenerationOptions
    cost_tracker: CreditTracker | None
```

### 19.4 Frontend revamp structure

```text
frontend/app/
  books/[id]/
    page.tsx                         # book overview
    manga/
      page.tsx                       # latest/default project reader
    manga-projects/[projectId]/
      page.tsx                       # project dashboard
      read/page.tsx                  # project reader
      debug/page.tsx                 # bible/script/storyboard debug

frontend/components/manga/
  generation/
    MangaGeneratePanel.tsx
    SourceSlicePicker.tsx
    MangaProjectStatus.tsx
    ContinuationCTA.tsx
  reader/
    MangaProjectReader.tsx
    MangaPageViewport.tsx
    PageNavigation.tsx
    ToBeContinuedPage.tsx
  v4/
    V4PageRenderer.tsx
    V4PanelRenderer.tsx
    panels/
  debug/
    FactRegistryView.tsx
    ContinuityLedgerView.tsx
    ScriptView.tsx
    StoryboardView.tsx
```

Current large `frontend/app/books/[id]/page.tsx` should be split. The generate panel alone is already doing too much.

### 19.5 Legacy compatibility plan

Keep old behavior available through:

```text
MANGA_PIPELINE_VERSION=legacy | revamp
```

Adapters:

- `LegacySummaryAdapter`: reads new `MangaProject` and returns old `Summary` shape.
- `LegacyOrchestratorAdapter`: lets old generation run if needed.
- `BookSummary` remains until frontend fully migrates.

This gives us a rollback path without freezing progress.

### 19.6 Baseline checkpoint / revert strategy

Before revamp coding:

```bash
git status
python -m pytest tests/ -q
npm test / npm run lint if available

git checkout -b manga-revamp
# after committing current stable state:
git tag pre-manga-revamp-baseline
```

Because the current working tree has an untracked plan doc, do not tag blindly right now. First commit the plan or intentionally leave it out.

Recommended flow:

1. Commit current plan doc.
2. Create branch `manga-revamp`.
3. Tag baseline from main/stable commit:
   - `pre-manga-revamp-baseline`
4. Build revamp behind feature flag.
5. Keep legacy path runnable.
6. Merge only after smoke tests and one sample manga pass.

Rollback options:

- Feature flag back to legacy.
- Git revert PR.
- Git checkout baseline tag for emergency.

### 19.7 “Dummy point” / stable fallback

In addition to a git tag, create a software-level fallback:

```text
Legacy Manga Generation = stable dummy point
Revamp Manga Generation = new pipeline
```

Meaning:

- keep current orchestrator in `legacy/`,
- do not delete V2/V4 current paths immediately,
- add a runtime switch,
- write compatibility tests.

Then if revamp output breaks, the UI can still call legacy mode.

### 19.8 Reel renderer boundary

User requested leaving reel-renderer backend alone for now.

Plan:

- Do not refactor reel rendering in the manga revamp PRs.
- Move reel routes/tasks only if needed for file organization, but avoid logic changes.
- Add TODO comments where new manga artifacts could later power reels:
  - script scenes → reels,
  - fact registry → reel facts,
  - character assets → reel avatars.

---

## 20. Updated immediate next steps

If we start coding right after this plan, I recommend this order:

1. Commit this plan and create a baseline branch/tag strategy.
2. Fix tests so we can move safely.
3. Add feature flag: `MANGA_PIPELINE_VERSION=legacy|revamp`.
4. Make V4 the default in revamp path.
5. Add new project/slice data models.
6. Add `SourceSlice` and large-doc continuation UI/API design.
7. Add `ContinuityLedger`.
8. Add `SourceFactRegistry`.
9. Add `AdaptationPlan`.
10. Add `CharacterWorldBible` with stable character IDs.
11. Add `MangaScript` before touching frontend visuals.
12. Add `StoryboardPage`.
13. Convert storyboard to V4.
14. Add to-be-continued / continuation generation.
15. Improve character assets/frontend rendering.

Why this order?

Because continuity and story structure are more important than pretty sprites. If the story has amnesia, a nicer character portrait only makes the amnesia more stylish. Very fashionable, still broken.

---

## 21. Final recommendation

The current system is close enough that it does not need to be thrown away, but the architecture should be revamped around **Manga Projects** and **incremental continuity**.

Keep:

- document understanding,
- V4 renderer,
- DSL validation,
- image generation utilities,
- LivingPanelDoc ideas,
- current legacy generation path as fallback,
- reel backend logic unchanged for now.

Change:

- V4 becomes default,
- `BookSummary` stops being the only root artifact,
- introduce `MangaProject`, `MangaSlice`, `MangaPageDoc`, `MangaAssetDoc`,
- introduce fact registry/script/storyboard,
- introduce continuity ledger for large PDFs and continuation,
- character assets become reusable production assets,
- quality gates become mandatory,
- current orchestrator becomes a thin pipeline coordinator.

The end state should feel like:

```text
A manga editor adapted the PDF,
a screenwriter wrote the scenes,
a storyboard artist planned the pages,
a continuity editor tracked what came before,
and the renderer drew it consistently.
```

Not:

```text
A summary prompt put speech bubbles on bullet points,
then forgot what happened when the user generated page 11.
```

That is the difference between average output and a manga experience users actually want to continue reading.
