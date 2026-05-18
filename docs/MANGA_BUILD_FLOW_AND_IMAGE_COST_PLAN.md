# Manga Build Flow And Image Cost Plan

This note traces the manga build from the frontend call you started with through
the backend worker and image generation code. It also records the fix: the image
model should mostly create reusable character sprites that the DSL renderer can
place into manga panels, plus only a few selected painted panels per generated
chunk to make the manga feel engaging.

The important product principle is:

```text
DSL renderer = main manga renderer
image model  = reusable character sprites + a few high-impact panel backdrops
```

We do not want the default build path to generate one paid image for every
panel. That makes the manga expensive and also makes the DSL renderer less
important than it should be.

## 0. Implementation Status

Implemented on 2026-05-18.

The default build path is now:

```text
image_mode = "budgeted"
sprite_budget_total = 8
key_panel_budget_per_slice = 3
key_panel_budget_full_book = 8
```

What changed:

- Frontend exposes image modes instead of one overloaded boolean:
  - `budgeted`: reusable sprites plus selected key panels.
  - `sprites_only`: reusable sprites only; all pages are DSL-rendered.
  - `none`: no paid image generation.
- Backend request models, Celery tasks, and generation options now carry
  `image_mode`, sprite budget, and key-panel budgets.
- Character asset planning now defaults to one front reference sprite and one
  expression sprite per character, capped by `sprite_budget_total`.
- Full turnarounds and larger expression banks remain available through
  advanced options, but they are no longer the default.
- Panel rendering now supports `key_panels` mode. It scores/selects a small
  start/middle/end spread of high-impact panels and skips the rest.
- Skipped panels keep their empty `PanelRenderArtifact`; the frontend DSL
  reader can still render them from storyboard/composition data.
- The panel quality gate now ignores untouched skipped artifacts, but still
  validates panels that were actually attempted.

Important file anchors:

```text
frontend/components/MangaV2ProjectPanel.tsx
frontend/lib/api.ts
backend/app/api/routes/manga_projects.py
backend/app/celery_manga_tasks.py
backend/app/services/manga/generation_service.py
backend/app/services/manga/character_sheet_planner.py
backend/app/services/manga/storyboard_panel_renderer.py
backend/app/manga_pipeline/stages/panel_rendering_stage.py
backend/app/manga_pipeline/stages/panel_quality_gate_stage.py
```

## 1. Desired Product Behavior

What we want:

- Generate a small reusable character sprite bank.
- Sprites should be mostly background-free, or at least clean white/transparent
  background, so the frontend DSL renderer can compose them inside panels.
- Reuse the same sprites across many manga pages so characters stay visually
  consistent and image spend stays low.
- Generate only a few painted panel images per generated chunk, usually `1-3`.
- Use those painted panels at high-impact positions: start/opening, middle beat,
  reveal, cliffhanger, or ending/page-turn.
- Let the DSL/code renderer handle panel layout, speech bubbles, captions,
  screentones, SFX, borders, spacing, and fallback visuals.
- Later expose advanced controls so a user can choose more sprites or more
  painted panels if they accept the cost.

What we do not want as the default:

- Hundreds of generated panel images.
- Three-angle character turnarounds for every character unless explicitly
  requested.
- Multiple expression sheets for every character by default.
- Per-panel paid generation when the DSL renderer can already render the page.

## 2. Current End-To-End Flow

High-level flow:

```text
Frontend build button
  -> frontend API wrapper
    -> backend /manga-projects/{project_id}/build
      -> Celery build_manga_project_task
        -> book understanding, if not ready
          -> character bible
          -> art direction
          -> character sheet library
        -> slice generation
          -> storyboard / DSL
          -> page composition
          -> rendered page assembly
          -> panel rendering, if images are enabled
        -> persisted project/slice/page/asset docs
          -> frontend reader
```

The bug is not one single accidental loop. The problem is a semantic overload:
`generate_images=true` currently means both "generate reusable character assets"
and "render all panel images".

## 3. Frontend Entry Point

File:

```text
frontend/components/MangaV2ProjectPanel.tsx
```

The flow starts inside `handleGenerate()`. The important call is:

```ts
const queued = await startMangaProjectBuild(project.id, {
  apiKey: key,
  provider: providerDraft,
  model: modelDraft.trim() || DEFAULT_MODEL_BY_PROVIDER[providerDraft],
  mode: buildMode,
  pageWindow,
  generateImages,
  imageModel: generateImages ? imageModel : undefined,
  extraOptions: { style: selectedStyle },
});
```

What this sends:

- `apiKey`: user key for LLM/image calls.
- `provider`: text model provider.
- `model`: text model.
- `mode`: `next_chunk` or `full_book`.
- `pageWindow`: source page window size.
- `generateImages`: one boolean for all image behavior.
- `imageModel`: selected image model.
- `extraOptions.style`: selected manga style.

The UI currently labels this area as "Character and panel images" and says it is
"On by default. Creates reusable character references and optional panel art."
That wording is close to the intended behavior, but the backend interpretation
is stronger than "optional panel art": once enabled, the panel rendering stage
renders every panel in the generated slice.

## 4. Frontend API Wrapper

File:

```text
frontend/lib/api.ts
```

`startMangaProjectBuild()` posts to the backend:

```ts
api.post(`/manga-projects/${projectId}/build`, {
  api_key: options.apiKey,
  provider: options.provider,
  model: options.model,
  mode: options.mode,
  page_window: options.pageWindow ?? 10,
  generate_images: options.generateImages ?? true,
  image_model: options.imageModel ?? null,
  options: options.extraOptions ?? {},
});
```

Important detail:

```ts
generate_images: options.generateImages ?? true
```

So if the caller does not provide a value, build defaults to image generation
being on.

There is also a separate slice-generation API:

```text
POST /manga-projects/{project_id}/generate-slice
```

That path defaults `generate_images` to `false`, but the user-facing build path
defaults it to `true`. The path we are tracing is the build path.

## 5. Backend Build Route

File:

```text
backend/app/api/routes/manga_projects.py
```

Request model:

```py
class BuildMangaProjectRequest(BaseModel):
    api_key: str = Field(min_length=1)
    provider: str = "openai"
    model: str | None = None
    mode: str = Field(default="next_chunk", pattern="^(next_chunk|full_book)$")
    page_window: int = Field(default=10, ge=1, le=100)
    generate_images: bool = True
    image_model: str | None = None
    options: dict[str, Any] = Field(default_factory=dict)
```

Route:

```py
@router.post("/manga-projects/{project_id}/build")
async def build_manga_project(project_id: str, request: BuildMangaProjectRequest):
```

What it does:

1. Loads `MangaProjectDoc`.
2. Loads the associated `Book`.
3. Verifies the book is parsed.
4. Checks if a build job is already running.
5. Persists user-facing generation preferences on `project.project_options`.
6. Queues `build_manga_project_task`.
7. Creates a `JobStatus` row for polling.

The route persists:

```py
project_options.update({
    "preferred_provider": request.provider,
    "preferred_model": request.model,
    "page_window": request.page_window,
    "generate_images": request.generate_images,
    "image_model": request.image_model,
})
```

This matters because later services read `project.project_options` to decide
whether to materialize image assets.

## 6. Celery Build Task

File:

```text
backend/app/celery_manga_tasks.py
```

Task:

```py
@celery_app.task(bind=True, name="app.celery_manga_tasks.build_manga_project_task")
def build_manga_project_task(...):
```

The task does two main things:

1. Ensure book understanding exists.
2. Generate one slice or all slices, depending on `mode`.

It builds `run_options`:

```py
run_options = dict(options or {})
run_options.update({
    "style": project.style,
    "generate_images": generate_images,
    "image_model": image_model,
})
if generate_images:
    run_options["image_api_key"] = api_key
    run_options["api_key"] = api_key
```

Important detail:

- If `generate_images` is true, the same key is passed as `image_api_key`.
- That option then flows into both book understanding character sheet
  generation and slice panel rendering.

Book understanding path:

```py
await generate_book_understanding(
    project=project,
    book=book,
    llm_client=llm_client,
    extra_options=run_options,
    progress_callback=understanding_progress,
)
```

Slice generation path:

```py
slice_doc, page_docs = await generate_project_slice(
    project=project,
    book=book,
    llm_client=llm_client,
    page_window=page_window,
    image_api_key=api_key,
    extra_options=run_options,
    progress_callback=slice_progress,
)
```

Notice the second call passes `image_api_key=api_key` regardless of
`generate_images`; later `generate_project_slice()` checks the option before
scheduling panel rendering.

## 7. Book Understanding Phase

File:

```text
backend/app/services/manga/book_understanding_service.py
```

Main function:

```py
async def generate_book_understanding(...):
```

This runs once per project unless forced. It creates the global understanding
artifacts:

- `book_synopsis`
- `fact_registry`
- `adaptation_plan`
- `character_world_bible`
- `character_art_direction`
- `character_voice_cards`
- `arc_outline`

Stage order:

```py
return [
    whole_book_synopsis_stage.run,
    book_fact_registry_stage.run,
    global_adaptation_plan_stage.run,
    global_character_world_bible_stage.run,
    bible_silhouette_uniqueness_stage.run,
    character_art_direction_stage.run,
    character_voice_cards_stage.run,
    arc_outline_stage.run,
]
```

After these artifacts are persisted, it materializes character sheets:

```py
await ensure_book_character_sheets(
    project=project,
    bible=result.character_bible,
    art_direction=result.art_direction,
    image_api_key=image_api_key,
)
```

If images are enabled, it also runs the sprite quality gate:

```py
should_run_sprite_gate = (
    bool(options.get("generate_images")) and bool(image_api_key)
)
```

That means the current build path can spend image calls before it even starts
rendering manga pages.

## 8. Character Sheet Planning

Files:

```text
backend/app/services/manga/character_sheet_planner.py
backend/app/services/manga/character_library_service.py
backend/app/services/manga/asset_image_service.py
```

The planner is pure. It does not call the image model. It creates a list of
`MangaAssetSpec` objects.

Today, for each character, `_specs_for_character()` emits:

1. Three reference sheets:
   - `front`
   - `side`
   - `back`
2. One expression sheet for every expression in `CharacterArtDirection`.

Code shape:

```py
for angle_label, angle_framing in REFERENCE_ANGLES:
    specs.append(MangaAssetSpec(... asset_type="reference_sheet" ...))

for label, expression_direction in _expressions_for_character(...):
    specs.append(MangaAssetSpec(... asset_type="expression" ...))
```

The art direction model requires at least three expressions per character:

```py
_MIN_EXPRESSIONS = 3
```

So the default count is at least:

```text
per character = 3 reference sheets + 3 expression sheets = 6 images
```

For three characters, this is already at least eighteen planned assets before
any panel art. If the image model actually generates these assets, they are
written under:

```text
storage/images/manga_assets/{project_id}/{asset_id}.png
```

`character_library_service.ensure_book_character_sheets()` is idempotent. It
uses stable planner asset IDs and skips assets that already exist. That part is
good and should be kept.

The problem is the default plan is too large for the desired low-cost product.

## 9. Slice Generation Phase

File:

```text
backend/app/services/manga/generation_service.py
```

Main function:

```py
async def generate_project_slice(...):
```

This selects the next source range, builds source text, creates a
`PipelineContext`, hydrates the book-level artifacts, then runs the per-slice
pipeline.

The key image decision is:

```py
should_render_panel_art = bool(options.get("generate_images")) and bool(image_api_key)
if should_render_panel_art:
    options["image_api_key"] = image_api_key

stages = build_v2_generation_stages(with_panel_rendering=should_render_panel_art)
```

If `should_render_panel_art` is true, the stage list includes:

```py
panel_rendering_stage.run
panel_quality_gate_stage.run
```

That means there is no distinction between:

- "generate reusable character sprites"
- "generate every panel backdrop"

Both happen because the same `generate_images` option controls both.

## 10. Per-Slice Pipeline Stages

File:

```text
backend/app/services/manga/generation_service.py
```

The current ordered stages are:

```text
source_fact_extraction_stage
adaptation_plan_stage
character_world_bible_stage
beat_sheet_stage
manga_script_stage
script_review_stage
script_repair_stage
storyboard_stage
dsl_validation_stage
continuity_gate_stage
quality_gate_stage
quality_repair_stage
dsl_validation_stage
continuity_gate_stage
quality_gate_stage
page_composition_stage
rtl_composition_validation_stage
character_asset_plan_stage
rendered_page_assembly_stage
panel_rendering_stage        only when images are enabled
panel_quality_gate_stage     only when panel rendering ran
```

The DSL/storyboard output already exists before panel rendering. The frontend
can render this as manga even when `panel_rendering_stage` does not run.

That is the architecture we want to lean into.

## 11. Panel Rendering Stage

Files:

```text
backend/app/manga_pipeline/stages/panel_rendering_stage.py
backend/app/services/manga/storyboard_panel_renderer.py
backend/app/services/manga/panel_rendering_service.py
backend/app/image_generator.py
```

`panel_rendering_stage.run()` loads library assets and calls:

```py
summary = await render_rendered_pages(
    rendered_pages=context.rendered_pages,
    project_id=context.project_id,
    slice_id=context.source_slice.slice_id,
    bible=context.character_bible,
    art_direction=context.art_direction,
    library_assets=library_assets,
    image_api_key=str(image_api_key),
    image_model=str(image_model) if image_model else None,
    style=style,
)
```

`render_rendered_pages()` loops through every rendered page and every panel:

```py
for rendered_page in rendered_pages:
    page_index = rendered_page.storyboard_page.page_index
    for panel in rendered_page.storyboard_page.panels:
        artifact = rendered_page.panel_artifacts[panel.panel_id]
        tasks.append(asyncio.create_task(render_with_limit(page_index, panel, artifact)))
```

Each successful panel image is written to:

```text
storage/images/manga_panels/{project_id}/{slice_id}/page_{page_index}/{panel_id}.png
```

The image path is stored on the panel artifact:

```py
artifact.image_path = relative_path
artifact.image_aspect_ratio = aspect
```

This is why `storage/images/manga_panels` grows quickly. A generated chunk with
eight manga pages and four panels per page can mean roughly thirty-two panel
image calls, plus the character sheet image calls.

## 12. Frontend Reader

Files:

```text
frontend/app/books/[id]/manga/v2/page.tsx
frontend/components/MangaReader/MangaPageRenderer.tsx
frontend/components/MangaReader/MangaPanelRenderer.tsx
frontend/components/MangaReader/panels/DialoguePanel.tsx
frontend/components/MangaReader/chrome/PaintedPanelBackdrop.tsx
frontend/components/MangaReader/asset_lookup.ts
```

The reader fetches:

- project
- pages
- slices
- assets

It maps persisted asset docs to frontend character assets:

```ts
const characterAssets = assets.map(asset => ({
  character_id: asset.character_id,
  expression: asset.expression,
  asset_type: asset.asset_type,
  image_url: getImageUrl(asset.image_path),
}));
```

Panel rendering behavior:

```ts
const hasPaintedBackdrop = Boolean(artifact.image_path && !artifact.error);
```

If a panel has `artifact.image_path`, it renders:

```tsx
<PaintedPanelBackdrop imagePath={artifact.image_path} />
```

If there is no painted backdrop, the DSL renderer still renders the panel using:

- `DialoguePanel`
- `NarrationPanel`
- `ConceptPanel`
- `TransitionPanel`
- derived palettes
- SFX layer
- speech bubble layer
- layout/composition rules

This is good. It means we can safely leave most panels unpainted and still have
a complete manga page.

Dialogue panels also already know how to use character assets as small avatars:

```tsx
{asset?.image_url ? (
  <img src={asset.image_url} ... />
) : (
  <span>{line.speaker_id.slice(0, 2).toUpperCase()}</span>
)}
```

This is the frontend surface we should improve for true sprite integration:
sprites should be reusable visual material inside DSL panels, not just a side
effect of full panel rendering.

## 13. Why The Current Behavior Gets Expensive

There are two image producers:

```text
Producer A: character assets
  output: storage/images/manga_assets/...
  controlled by: project_options.generate_images
  current scale: characters * (3 reference sheets + >=3 expressions)

Producer B: panel art
  output: storage/images/manga_panels/...
  controlled by: same generate_images flag
  current scale: pages * panels per page
```

Because both producers share one boolean, turning images on for character
sprites also turns on every-panel image rendering.

Cost grows with:

- number of characters in the bible
- number of expressions per character
- number of generated manga pages
- number of panels per page
- `full_book` mode, which repeats the slice loop until source coverage is done

This is why the observed result can feel like runaway image generation. The
code is doing what it was told, but the product meaning of the toggle is wrong.

## 14. Planned Fix: Separate Image Modes

Replace the single overloaded behavior with explicit modes.

### Mode: `none`

Behavior:

- No paid image calls.
- Persist prompt-only asset docs if useful.
- No panel art stage.
- DSL reader renders all panels.

Use case:

- Cheapest mode.
- Debugging and text/DSL validation.

### Mode: `sprites_only`

Behavior:

- Generate reusable character sprites.
- Do not generate painted panel backdrops.
- DSL reader renders all panels and uses sprites where possible.

Use case:

- The main low-cost manga mode if we want zero panel image spend.

### Mode: `budgeted`

Behavior:

- Generate reusable character sprites.
- Generate only `1-3` key painted panels per generated chunk/slice.
- Leave all other panel artifacts empty.
- DSL reader renders the full manga; selected painted panels act as accents.

Use case:

- Recommended default.
- Good balance of visual richness and cost control.

### Mode: `full_panel_art`

Behavior:

- Generate sprites.
- Generate every panel image.

Use case:

- Advanced explicit mode only.
- Should show a cost warning.
- Should not be default.

This mode can be added later. The immediate fix can avoid exposing it in the UI.

## 15. Planned Backend Options

Add these request/project options:

```py
image_mode: Literal["none", "sprites_only", "budgeted", "full_panel_art"]
sprite_budget_total: int
key_panel_budget_per_slice: int
key_panel_budget_full_book: int
```

Default values:

```text
image_mode = "budgeted"
sprite_budget_total = 8
key_panel_budget_per_slice = 3
key_panel_budget_full_book = 8 or 12
```

For the current request, the most important default is:

```text
budgeted = sprites + 1-3 key panels per generated chunk
```

The exact full-book cap can be tuned after the first implementation, but it
must be finite and visible.

## 16. Planned Sprite Behavior

Current planner behavior:

```text
each character -> front + side + back + at least 3 expressions
```

New default behavior:

```text
each important character -> one canonical reusable sprite/reference first
then add expression sprites only while budget remains
```

Sprite prompt requirements:

- Manga character sprite/reference.
- Single subject.
- Mostly transparent or clean white background.
- No complex scene background.
- Clear silhouette.
- Consistent costume and face.
- Usable as a recurring DSL/composited character element.
- Prefer upper-body or full-body depending on what the DSL can place cleanly.

Recommended first implementation:

1. Generate one canonical front sprite for each important bible character until
   budget is exhausted.
2. If budget remains, add one expression sprite for the main protagonist.
3. If budget still remains, add expression sprites for other high-frequency
   speakers.
4. Do not generate side/back sheets by default.

This preserves the existing deterministic asset ID idea, but changes the
default plan size.

## 17. Planned Key Panel Behavior

Budgeted mode should render only a few panels.

Default:

```text
1-3 key panel images per generated chunk/slice
```

Selection strategy:

```text
candidate panels
  -> score by editorial importance
  -> enforce start/middle/end distribution
  -> render top N
```

Good candidates:

- first page opening/title/establishing shot
- reveal panels
- symbolic panels
- wide or extreme-wide shots
- page-turn/cliffhanger panel
- final panel in the chunk
- panels with high composition importance

Panels to usually avoid:

- simple dialogue exchange panels
- recap panels
- dense text panels
- panels where the DSL renderer already does a better job with bubbles/text

Distribution:

```text
if budget = 1:
  pick strongest reveal/opening/ending panel

if budget = 2:
  pick one early panel and one late/reveal panel

if budget = 3:
  pick one early, one middle, one late panel
```

The selected panels get real `PanelRenderArtifact.image_path` values. All
non-selected panels keep empty artifacts:

```json
{
  "image_path": "",
  "image_aspect_ratio": "",
  "used_reference_assets": [],
  "requested_character_count": 0,
  "error": ""
}
```

The frontend already handles this: empty artifact means render DSL-only panel.

## 18. Implementation Plan

### Frontend API

File:

```text
frontend/lib/api.ts
```

Extend `startMangaProjectBuild()` options:

```ts
imageMode?: "none" | "sprites_only" | "budgeted" | "full_panel_art";
spriteBudgetTotal?: number;
keyPanelBudgetPerSlice?: number;
keyPanelBudgetFullBook?: number;
```

Send:

```ts
image_mode: options.imageMode ?? "budgeted",
sprite_budget_total: options.spriteBudgetTotal ?? 8,
key_panel_budget_per_slice: options.keyPanelBudgetPerSlice ?? 3,
key_panel_budget_full_book: options.keyPanelBudgetFullBook ?? 8,
```

Keep `generate_images` temporarily for backward compatibility, but stop using
it as the main internal decision once the backend supports `image_mode`.

### Frontend UI

File:

```text
frontend/components/MangaV2ProjectPanel.tsx
```

Replace the current boolean mental model:

```text
Character and panel images: on/off
```

With:

```text
Image mode:
  Budgeted sprites + key panels
  Sprites only
  No images
```

Default:

```text
Budgeted sprites + key panels
```

Copy should say:

```text
Generates reusable character sprites plus a few key painted panels. Most panels
use the DSL renderer to keep cost low.
```

Advanced controls can expose:

- sprite budget
- key panel budget
- image model

Do not make "full panel art" prominent until cost warnings exist.

### Backend Request Model

File:

```text
backend/app/api/routes/manga_projects.py
```

Extend `BuildMangaProjectRequest`:

```py
image_mode: str = Field(default="budgeted")
sprite_budget_total: int = Field(default=8, ge=0, le=50)
key_panel_budget_per_slice: int = Field(default=3, ge=0, le=20)
key_panel_budget_full_book: int = Field(default=8, ge=0, le=100)
```

Validation rule:

```text
image_mode must be one of:
none, sprites_only, budgeted, full_panel_art
```

Persist these values into `project.project_options`.

### Celery Options

File:

```text
backend/app/celery_manga_tasks.py
```

Pass the new fields into the task and `run_options`.

Internal booleans should become derived values:

```py
should_generate_sprites = image_mode in {"sprites_only", "budgeted", "full_panel_art"}
should_render_key_panels = image_mode == "budgeted"
should_render_all_panels = image_mode == "full_panel_art"
```

This is the main semantic cleanup.

### Character Planner

File:

```text
backend/app/services/manga/character_sheet_planner.py
```

Add planning options:

```py
sprite_budget_total: int = 8
include_turnaround: bool = False
max_expressions_per_character: int = 1
```

Default output should be:

```text
canonical front sprite/reference for important characters first
optional expression sprites second
no side/back by default
```

Keep the old full plan available behind `include_turnaround=True`.

### Character Library Service

File:

```text
backend/app/services/manga/character_library_service.py
```

Thread the planner options through `ensure_book_character_sheets()`.

Keep idempotency:

```text
existing asset_id set -> only generate missing specs
```

This is important because retries should never re-buy the same sprite.

### Slice Generation

File:

```text
backend/app/services/manga/generation_service.py
```

Change this decision:

```py
should_render_panel_art = bool(options.get("generate_images")) and bool(image_api_key)
```

To mode-aware behavior:

```py
image_mode = str(options.get("image_mode", "budgeted"))
should_render_panel_art = (
    image_mode in {"budgeted", "full_panel_art"} and bool(image_api_key)
)
```

Add options for panel rendering:

```py
options["panel_render_mode"] = "key_panels" or "all"
options["key_panel_budget"] = ...
```

### Panel Rendering

Files:

```text
backend/app/manga_pipeline/stages/panel_rendering_stage.py
backend/app/services/manga/storyboard_panel_renderer.py
```

Add support for rendering a subset of panels.

Possible interface:

```py
render_rendered_pages(
    ...,
    panel_selection_mode="all" | "key_panels",
    key_panel_budget=3,
)
```

In `key_panels` mode:

1. Select panel IDs.
2. Render only those panels.
3. Leave other artifacts empty.
4. Summary should record attempted count and skipped count.

The panel quality gate must understand skipped panels are not failures in
budgeted mode. A skipped panel is different from a failed render.

## 19. Important Compatibility Rule

Do not break existing persisted pages.

Existing pages may already have:

- `panel_artifacts` with many image paths
- empty artifacts
- older generated file names

The reader already treats `image_path` as optional. Keep that behavior.

New budgeted builds should simply produce fewer populated `image_path` fields.

## 20. Test Plan

### Unit Tests

Character planner:

- Budget `0` produces no image specs or prompt-only specs, depending on mode.
- Budget `1` produces only one canonical sprite.
- Budget `8` does not produce unlimited turnaround/expression sheets.
- Full/advanced option can still produce side/back/expression assets if needed.

Character library:

- Existing asset IDs are reused.
- Missing specs are generated.
- Retry does not duplicate assets.

Panel selection:

- Budget `1` selects one panel.
- Budget `3` selects early/middle/late when possible.
- Reveal/page-turn panels outrank ordinary dialogue panels.
- Empty slice/page input returns no selected panels.

Panel rendering:

- `key_panels` mode only calls the image generator for selected panels.
- Non-selected panel artifacts remain empty and error-free.
- `full_panel_art` mode still renders every panel.

API/Celery:

- Build request persists `image_mode` and budgets.
- `none` does not pass image generation into stages.
- `sprites_only` generates assets but does not schedule panel rendering.
- `budgeted` schedules subset panel rendering.

### Manual Validation

Run one `next_chunk` build with default settings.

Expected output:

```text
storage/images/manga_assets:
  small sprite bank, around 5-10 images

storage/images/manga_panels:
  only 1-3 new panel images for the generated chunk

reader:
  every manga page still renders
  selected key panels show painted art
  other panels render through DSL
```

Run one `sprites_only` build.

Expected output:

```text
manga_assets has sprites
manga_panels has no new panel images
reader still works through DSL
```

Run one `none` build.

Expected output:

```text
no paid image calls
reader works through DSL fallback visuals
```

## 21. Final Target State

The final behavior should feel like this:

```text
The manga is a DSL-rendered comic page.
Characters recur through a small consistent sprite bank.
Only a few high-impact panels are painted by the image model.
The user gets visual richness without surprise image-model spend.
```

This matches the actual product goal better than the current default, where
turning images on can silently mean "render every panel with the image model."
