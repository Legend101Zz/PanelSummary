# PanelSummary to Learning Reels

## Research verdict and recommended architecture

**Prepared:** 18 July 2026  
**Repository audited:** `/Volumes/Mrigesh SSD/Book-Reel`  
**Primary decision:** keep PanelSummary's manga pipeline, add a source-grounded `LearningBeat` intermediate representation, compile the same beats into manga pages and vertical reels, and make every generation stage resumable through a small durable run ledger.

The product should not be described as "Instagram, but educational." That framing is easy to copy and hard to prove. The sharper product is:

> Turn a selected chapter or set of notes into a coherent five-episode visual learning series, then let a friend leave a message that unlocks when you reach the same idea.

That demo contains the whole thesis: understand once, teach through two visual formats, preserve source fidelity, resume later, and make learning social without building a social network.

### The six verdicts

1. **Do not replace the current orchestrators with an agent framework for the hackathon.** Keep the stage graph explicit in Python. Add `GenerationRun`, `StageRun`, and immutable `Artifact` records so a failed stage resumes from the last valid checkpoint.
2. **Do not invent a programming language.** Define versioned JSON contracts in Pydantic and Zod. The LLM may author semantic data, but only deterministic code may select components, normalize timelines, or invoke renderers.
3. **Add one shared semantic IR: `LearningBeat`.** Manga and reels should be two renderings of the same cited teaching unit. Reels should not be screen recordings of manga pages.
4. **Use the existing Remotion package.** Refactor its permissive `Record<string, any>` payload into a bounded registry and a validated `ReelSpec`. Revideo and Hyperframes are credible later alternatives, but changing engines now loses time without improving the judged demo.
5. **Cut the social layer to one shareable thread with beat-anchored future messages.** Defer friend presence, account graphs, general chat, streak systems, what-if fan fiction, and a full collage dashboard.
6. **Resolve the provider-policy conflict before coding.** The current upstream repository instructions prohibit OpenAI for text or vision LLM calls, while the OpenAI Build Week rules require meaningful use of Codex and GPT-5.6. A hackathon branch needs an owner-approved, documented exception and a narrow GPT-5.6 responsibility. Otherwise the submission risks being ineligible even if the product works.

## What the repository actually contains

This audit used the local checkout, its upstream diff, and current primary sources. The local branch was 12 commits behind `origin/main` on 18 July 2026. It also had user-owned untracked renderer experiment images; this research did not alter or delete them.

### Existing production shape

The current product flow is real and sensibly decomposed:

`PDF -> Book -> MangaProject -> book understanding -> MangaSlice -> script/storyboard/composition/assets -> MangaPage(RenderedPage) -> Next.js reader`

The main persistent records are already close to what a long-running adaptation needs:

- `Book` holds parsed chapters, sections, and full content.
- `MangaProjectDoc` holds the synopsis, arc outline, adaptation map, fact registry, character and world bible, art direction, voice cards, continuity ledger, coverage, and lifecycle state.
- `MangaSliceDoc` holds a source slice plus beat sheet, script, storyboard, quality data, continuity versions, and trace metadata.
- `MangaPageDoc` persists the canonical `RenderedPage` payload consumed by the reader.
- `MangaAssetDoc` stores generated character and scene assets with quality metadata.

Relevant implementation seams include:

- `backend/app/manga_models.py`
- `backend/app/models.py`
- `backend/app/manga_pipeline/book_orchestrator.py`
- `backend/app/manga_pipeline/orchestrator.py`
- `backend/app/manga_pipeline/generation_service.py`
- `backend/app/manga_pipeline/source_slice_service.py`
- `backend/app/celery_manga_tasks.py`
- `frontend/src/components/manga/MangaReader.tsx`
- `reel-renderer/src/types.ts`
- `reel-renderer/src/ReelComposition.tsx`

### What is good

- The book-level spine and the slice-level generation context are separated. That is the correct basis for "understand once, generate many."
- Facts, continuity, characters, voice, art direction, and coverage are persisted rather than reconstructed from a single prompt.
- The frontend reads one canonical page contract instead of understanding every generation stage.
- Image budgets and a materialized asset library prevent the default path from becoming one paid image call per panel.
- The 12 upstream commits add meaningful composition, grounding, vector-scene, and quality work. They should be reviewed and fast-forwarded before new implementation rather than duplicated locally.

### What is structurally weak

1. **A pipeline run is durable only at coarse boundaries.** The orchestrators loop over hardcoded stage functions and pass in-memory contexts. Slice pages, assets, coverage, and continuity are persisted after most generation has completed. A late failure can force expensive earlier work to run again.
2. **Retries are task-level, not stage-level.** Celery can mark a project or job failed, but it cannot reliably say "storyboard succeeded, image 3 failed, resume at image 3."
3. **Idempotency is not a first-class contract.** There is no unique stage key derived from project, selected scope, pipeline version, stage name, and input hash. Duplicate delivery can create duplicate work or conflicting artifacts.
4. **Book storage and prompting assume whole-book availability.** `Book` contains all chapters and content in one document, while the understanding pass consumes the canonical chapter set. The slice service advances through page windows, but the product does not expose a user-authored chapter scope.
5. **The rendering problem is partly upstream of CSS.** Earlier diagnostics found missing panel images and heuristic layout fallbacks. Upstream work improves this, but stable output still requires an explicit composition contract, asset manifest, text budgets, and deterministic repair before the reader sees a page.
6. **The reel code already exists but is not integrated.** `reel-renderer/` contains a Remotion composition, scene and layer components, a sample DSL, and render scripts. It is parked future work. Its current `props: Record<string, any>` boundary is too permissive for generated production input, and the sample includes unsupported placeholder claims. Treat it as a prototype to harden, not proof of a working feature.

---

# Track 1: orchestration architecture

## Patterns worth copying

### OpenAI Codex: typed sessions, event streams, bounded work

[OpenAI Codex](https://github.com/openai/codex) is not a content-generation DAG engine, so copying its architecture wholesale would be category error. Its reusable ideas are narrower and useful:

- A **thread, turn, item** hierarchy gives every piece of work a stable identity.
- Work emits explicit lifecycle events instead of relying on logs as state.
- Typed, versioned protocol schemas separate a long-running engine from clients.
- Terminal completion is authoritative; partial deltas are not silently treated as success.
- Queue bounds, cancellation, and backoff are product behavior, not afterthoughts.

PanelSummary equivalent: `GenerationRun -> StageRun -> Artifact`, with typed `queued`, `running`, `succeeded`, `retryable_failed`, `terminal_failed`, and `cancelled` events.

### LangGraph: checkpoints and two different kinds of memory

[LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence) checkpoints graph state by thread and supports replay, fault recovery, and pending writes. Its distinction between thread-scoped checkpoints and a cross-thread store maps well to this product:

- Project content memory is shared across every generation run for a book.
- A learner's progress and mastery are scoped to that learner and series.
- A single run has its own stage checkpoints and retry state.

The pattern is strong. Adopting LangGraph in the three-day build window is not. It would wrap or replace the existing Celery and Mongo design while leaving the same domain-model work unfinished.

### Temporal: durable execution as a later production migration

[Temporal](https://docs.temporal.io/workflows) persists workflow history and provides activity retries, timers, signals, cancellation, and crash recovery. It is the strongest eventual answer if generation becomes a high-volume service with workflows lasting hours or days. It loses for this hackathon because it adds another service, a new operational model, workflow determinism constraints, and a migration of working Celery paths.

Design the records so Temporal can own execution later. Do not install Temporal now.

### ComfyUI: graph provenance and cache invalidation

[ComfyUI](https://github.com/Comfy-Org/ComfyUI) treats a generation as a graph of typed nodes and preserves workflow metadata with outputs. The reusable idea is content-addressed artifact provenance: when an art-direction hash changes, invalidate affected images and pages, not the source parse or every unrelated chapter.

Again, copy the artifact model, not the node editor.

## Recommended state model

### 1. Source memory

Replace whole-book prompt assumptions with normalized, addressable units:

```json
{
  "source_unit_id": "unit_ch04_p081_094",
  "book_id": "book_123",
  "kind": "chapter_section",
  "chapter_id": "ch04",
  "page_start": 81,
  "page_end": 94,
  "text_hash": "sha256:...",
  "text_ref": "object://...",
  "heading_path": ["Part II", "Chapter 4", "Time dilation"],
  "token_count": 6120
}
```

Keep raw PDFs and large extracted text in object storage or GridFS; keep addressable metadata and compact summaries in Mongo. A `ScopeManifest` freezes what the user selected:

```json
{
  "scope_id": "scope_abc",
  "project_id": "project_123",
  "source_unit_ids": ["unit_ch04_p081_094"],
  "scope_hash": "sha256:...",
  "selection_label": "Chapter 4",
  "created_by": "user",
  "pipeline_version": "learning-reel-v1"
}
```

This makes "three chapters today, two next week" an extension of scope, not a new book upload.

### 2. Project memory

Version the existing fact registry, adaptation map, bible, voice cards, art direction, continuity ledger, and coverage ledger. Split global and scoped views:

- **Global project state:** stable characters, terminology, overall style, per-unit summaries, source index.
- **Scoped spine:** selected-unit synopsis, learning objectives, local arc, required facts, misconceptions, prerequisites.
- **Coverage:** source spans taught, beat IDs rendered, quiz evidence, and unresolved gaps.

Extending a scope reuses global state and builds only the new scoped spine. It does not summarize the entire book again.

### 3. Learner memory

Do not put learner behavior in `MangaProjectDoc`. Add a separate `LearnerSeriesState`:

```json
{
  "user_id": "user_7",
  "series_id": "series_9",
  "last_beat_id": "beat_04_03",
  "viewed_beat_ids": ["beat_04_01", "beat_04_02"],
  "retrieval_results": {"beat_04_02": "correct"},
  "confused_concept_ids": ["proper_time"],
  "updated_at": "..."
}
```

Watching is exposure, not mastery. Only a retrieval answer or an explicit self-rating should update mastery. This distinction prevents the learning claim from becoming fake analytics.

### 4. Run state

```text
GenerationRun
  id, project_id, scope_id, pipeline_version, status, requested_outputs

StageRun
  run_id, stage_name, attempt, input_hash, status, started_at, ended_at,
  retry_class, error_code, artifact_ids

Artifact
  id, kind, schema_version, content_hash, source_refs, model_receipt,
  parent_artifact_ids, storage_ref, validation_status
```

Use a unique idempotency key:

`sha256(project_id + scope_hash + pipeline_version + stage_name + input_hash)`

Each stage reads immutable artifacts, writes immutable artifacts, validates them, and only then marks its `StageRun` successful. Project pointers move to validated versions. This is enough for reliable resume without a new orchestration framework.

## Retry and partial-failure policy

| Failure class | Example | Behavior |
|---|---|---|
| Transient provider | timeout, rate limit, 5xx | Exponential backoff with jitter, maximum attempts, same idempotency key |
| Invalid structured output | schema violation, missing citation | One deterministic repair, then one constrained regeneration; preserve bad output for diagnosis |
| Quality gate | unsupported fact, unreadable density | Return to the nearest authoring stage, not the whole pipeline |
| Asset failure | one character sprite fails | Retry that asset only; compose a page only from validated asset IDs |
| Renderer failure | Chromium or FFmpeg crash | Retry render from the same immutable `ReelSpec`; do not call an LLM |
| Permanent input | encrypted PDF, no extractable pages | Terminal failure with a user action, never blind retry |
| Cancelled or superseded | user changes selected chapter | Stop downstream work; keep reusable content-addressed artifacts |

## The central IR: `LearningBeat`

The current pipeline risks asking the manga script to do two jobs: preserve the book and invent an enjoyable scene. Add a semantic contract before presentation:

```json
{
  "beat_id": "beat_ch04_03",
  "sequence": 3,
  "learning_objective": "Distinguish proper time from coordinate time",
  "source_refs": [
    {"unit_id": "unit_ch04_p081_094", "page": 88, "span_hash": "sha256:..."}
  ],
  "required_fact_ids": ["fact_441", "fact_447"],
  "hook": "Two twins, one clock disagreement",
  "explanation": "...",
  "example": "...",
  "misconception": "Time dilation means the traveler feels time slowing",
  "retrieval_prompt": "Which clock measures proper time?",
  "payoff": "The traveler experiences normal local time",
  "character_intent": ["Asha challenges the naive explanation"],
  "visual_intent": ["contrast two clock paths"],
  "spoiler_level": 0,
  "confidence": 0.94
}
```

Then compile:

```text
SourceUnits + ScopedSpine
          |
          v
     LearningBeat[]
       /         \
      v           v
MangaEpisodeSpec  ReelSpec
      |           |
RenderedPage[]    MP4 + captions + timeline map
```

The `source_refs` and `required_fact_ids` survive both branches. The presentation may dramatize; it may not alter the claim. A reel timeline map records `beat_id -> time range`, so a future message anchors to the stable beat while the UI can still display a timestamp.

## DSL versus hardcoded pipeline

Use three different levels of flexibility:

1. **Pipeline topology stays hardcoded and versioned.** It is application policy, not user content. An LLM does not choose which safety or grounding stages to skip.
2. **Semantic content is typed JSON.** `LearningBeat` expresses what must be taught and sourced.
3. **Presentation is a bounded typed JSON spec.** `MangaEpisodeSpec` and `ReelSpec` may reference only registered components and validated assets.

This is a DSL in the useful sense: a small declarative contract. It is not a new parser, grammar, visual node editor, or general-purpose timeline language.

---

# Track 2: DSL engines and reusable patterns

Status was checked against the public repository, README, license metadata, and latest visible default-branch commit on 18 July 2026. A recent commit is a maintenance signal, not proof of production quality.

## Verification table

| Project | Verified status | What its DSL looks like | Reusable lesson | Verdict |
|---|---|---|---|---|
| [Editly](https://github.com/mifi/editly) | Exists, MIT, not archived. Latest visible default-branch commit: 20 Feb 2025. | JSON/JSON5 edit spec with `clips`, per-clip `layers`, transitions, audio, dimensions, and defaults. | A renderer should consume normalized declarative data, not LLM-written renderer code. | **Pattern only.** Maintenance is quiet and the scene vocabulary is too generic for manga learning beats. |
| [Vidformer](https://github.com/ixlab/vidformer) | Exists, Apache-2.0, active. Latest visible commit: 4 Jul 2026. | Declarative video operations represented as an evaluable specification; Python APIs can resemble familiar frame operations while evaluation is deferred. | Separate authoring intent from optimized execution; cache and evaluate only needed media work. | **Do not adopt as authoring DSL.** It is a video query/processing engine, not a narrative composition language. |
| [Pavo Engine](https://github.com/sonnhfit/pavo-engine-py) | Exists and recently touched. Latest visible commit: 31 May 2026. Small ecosystem; GitHub exposed no verified license even though README badges mention MIT. | Python builder methods such as adding text, subtitles, strips, tracks, start times, and durations, compiled into JSON. | A typed builder that emits schema-validated JSON is friendlier than hand-authoring raw objects. | **Pattern only.** Experimental footprint and license uncertainty are unnecessary risk. |
| [Editry](https://github.com/scienceuntangled/editry) | Exists, experimental R wrapper around Editly. Latest visible commit: 7 Feb 2026. License metadata was not asserted by GitHub. | R functions build an Editly specification and invoke the Node renderer through Docker. | Language-specific builders can sit above one canonical render schema. | **Reject.** Adds no capability for this TypeScript/Python monorepo. |
| [HTML-Video](https://github.com/nexu-io/html-video) | Exists, Apache-2.0, active. Latest visible commit: 21 Jun 2026. | A content graph is topologically ordered into frames; templates expose JSON input schemas; frame HTML/CSS is rendered through an adapter, currently Hyperframes. | Template manifests, typed inputs, graph provenance, and render-adapter boundaries are excellent patterns. | **Adapt the pattern, not the framework.** Its meta-layer is broader than the hackathon needs and several advertised adapters remain future work. |
| [htmlv](https://github.com/xxatsushixx/htmlv) | Repository exists, but only an initial commit was visible from 3 Oct 2024; no license and no demonstrated renderer. | Proposed HTML-like `<scene>` elements and CSS-like time, easing, and transition properties. | Human-readable temporal layout is attractive. | **Drop.** It is a specification experiment, not a maintained engine. |
| [YTP DSL](https://github.com/AlexandreRio/ytpdsl) | Exists, GPL-3.0, last visible commit 8 Mar 2020. | Grammar-driven stochastic clip selection and FFmpeg-oriented operations. | A grammar can constrain algorithmic edits. | **Drop.** Stale, copyleft, stochastic remix focus, and wrong product semantics. |
| `Wavyte/wavyte` | The supplied GitHub URL returned 404 on 18 Jul 2026. | Not verifiable. | None that can be responsibly adopted. | **Drop as unverified.** Do not cite it as an active option. |

## Recommended `ReelSpec`

The existing draft `VideoDSL` should become a versioned contract shared by Pydantic and Zod:

```json
{
  "schema_version": "reel-spec.v1",
  "reel_id": "reel_04_03",
  "beat_ids": ["beat_ch04_03"],
  "format": {"width": 1080, "height": 1920, "fps": 30},
  "style_kit_id": "style_ink_red_v2",
  "audio": {
    "narration_asset_id": "asset_voice_17",
    "music_asset_id": null,
    "captions_asset_id": "artifact_vtt_17"
  },
  "scenes": [
    {
      "scene_id": "s1",
      "beat_id": "beat_ch04_03",
      "component": "manga_split_reveal",
      "start_frame": 0,
      "duration_frames": 150,
      "props": {
        "left_asset_id": "asset_asha_clock",
        "right_asset_id": "asset_dev_clock",
        "headline": "Two clocks. Both correct.",
        "source_label": "Chapter 4, p. 88"
      }
    }
  ],
  "interaction_map": [
    {"beat_id": "beat_ch04_03", "start_ms": 0, "end_ms": 5000}
  ]
}
```

Rules:

- `component` is an enum backed by a curated registry.
- Every component has a component-specific prop schema. Remove `Record<string, any>`.
- Assets are IDs, never arbitrary filesystem or remote URLs from model output.
- Timing is integer frames in the render spec. The authoring compiler may work in milliseconds but normalizes once.
- Captions, audio, safe zones, and source receipts are first-class.
- The LLM never emits React, CSS, JSX, FFmpeg arguments, or shell commands.
- Validation, timeline normalization, font and text-fit checks, and missing-asset checks run before Remotion starts.

**Track 2 verdict:** build a minimal custom typed JSON DSL, using Editly's normalized timeline and HTML-Video's typed template-manifest patterns. Do not adopt a general DSL engine and do not create a custom grammar.

---

# Track 3: reel rendering engine

## Comparison

| Engine | Strengths | Costs and mismatches | Verdict |
|---|---|---|---|
| [Remotion](https://www.remotion.dev/) | React-native composition, reusable components, deterministic frame model, browser preview, strong TypeScript fit, CSS/SVG/Canvas/WebGL support. The repo already contains a Remotion package. | Headless Chromium and FFmpeg operations need careful job isolation. Its [commercial terms](https://www.remotion.dev/license) become a real product-cost question as the team/company grows. | **Use now.** Harden the existing package behind `ReelSpec`; do not let models generate arbitrary React. |
| [Content Agent Routing Promptbase](https://github.com/RinDig/Content-Agent-Routing-Promptbase) | Demonstrates a component registry, style guide, scene specs, chunked generation, and human timing adjustment for a 13-minute Remotion project. | It is prompts and workflow guidance, not a renderer dependency; no repository license was visible. The claim is creator evidence, not a benchmark. | **Copy the operating pattern only:** registry + style kit + scene spec + render QA. |
| [Revideo](https://github.com/midrender/revideo) | MIT, TypeScript, generator-based scene sequencing, dynamic inputs, headless rendering, React player, audio support, and recent activity. | Its imperative generator idiom is less safe as direct model output. Adopting it means rewriting an existing Remotion prototype for little demo benefit. | **Strong runner-up, reject for this deadline.** Reconsider only if Remotion licensing or runtime economics become unacceptable. |
| [Hyperframes](https://github.com/heygen-com/hyperframes) | Apache-2.0, HTML/CSS/media authoring, timeline attributes, seekable animations, Chromium/FFmpeg rendering, and very active development. | Fast-moving pre-1.0 surface, Node 22 requirement, and a rewrite of the existing React renderer. Direct HTML authoring is unsafe unless templates are tightly sandboxed. | **Best post-hackathon alternative.** Prototype one adapter later, not during submission week. |
| [Motion Canvas](https://github.com/motion-canvas/motion-canvas) | Excellent timeline editor and TypeScript generator model for precise, voice-over-synchronized vector explainers. MIT and active. | Optimized for handcrafted animation logic. A manga feed needs asset, typography, caption, and reusable scene-template orchestration more than bespoke vector choreography. | **Reject as core.** Keep as a future specialist renderer for math or diagram beats. |
| [Editly](https://github.com/mifi/editly) | Simple declarative JSON, transitions, audio, and FFmpeg-oriented batch rendering. | Quieter maintenance, less expressive component model, and weaker path to a polished manga-native design system. | **Reject as engine.** Use its DSL simplicity as inspiration. |
| [MoviePy](https://github.com/Zulko/moviepy) | Mature MIT Python library for clip transforms, compositing, audio, and direct media manipulation. | Python/frame-array workflows are slower and have no native React preview or component design system. It moves the reel layer away from the frontend team's strongest stack. | **Reject as primary renderer.** Use only for isolated media utilities if FFmpeg alone is insufficient. |
| [Manim](https://github.com/3b1b/manim) | Exceptional programmable mathematical diagrams, TeX, camera moves, and precise explanatory animation. MIT and active. | Scene code is specialized and expensive to auto-author safely. It solves mathematical visualization, not manga pacing, recurring characters, or a feed template system. | **Reject as primary renderer.** A future optional `math_explainer` component could invoke it offline. |

The [awesome-video](https://github.com/sitkevij/awesome-video) list was also checked. It confirms the major programmatic categories above and points to FFmpeg wrappers and media libraries, but it did not expose a better fit than the existing Remotion path. Its Revideo link was also lagging the current project organization, which is a reminder to verify aggregator links against primary repositories.

## Why building from scratch loses

A custom renderer would still need timeline semantics, text measurement, image fit, audio synchronization, caption layout, font loading, video encoding, preview, cancellation, concurrency control, and platform-safe output. None of those creates the product's differentiator. The defensible layer is the cited `LearningBeat`, consistent manga assets, constrained scene registry, and social unlock. Build those on a renderer that already exists.

## Internal package boundary

For the hackathon, keep `reel-renderer/` in place to avoid a risky monorepo move. Give it a clean API:

```text
renderReel(spec: ReelSpec, output: RenderTarget) -> RenderReceipt
validateReel(spec: unknown) -> ReelSpec
inspectReel(spec: ReelSpec) -> asset and timeline diagnostics
```

After the submission, move it to `packages/reel-renderer` only if the workspace tooling is already standardized. The backend should submit immutable `ReelSpec` artifacts to a render worker; the worker should not query the database during a render.

**Track 3 verdict:** Remotion now, wrapped in a constrained registry and immutable render job. Hyperframes is the first alternative to benchmark after the hackathon. No from-scratch renderer.

---

# Track 4: ruthless UX audit

## The conversion problem

The current story contains too many product identities: PDF tool, manga generator, reel network, AI director studio, wellness dashboard, study app, streak app, social chat app, and fan-fiction generator. A visitor cannot trial a philosophy. They trial a result.

The landing promise should be concrete:

> Upload one chapter. Get a five-part visual lesson you can finish tonight.

Primary CTA: **Turn a chapter into a series**  
Secondary evidence: a playable five-episode example generated from a rights-safe source  
Trust line: **Every episode links back to the source pages**

Do not lead with "dopamine," "addiction," or "guilt-free." Those are internal design hypotheses, not a credible user benefit. The product should earn retention through narrative progress, curiosity, and social anticipation rather than claim to manipulate addiction.

## What the references actually teach

### Storyboarder: progressive control beats a prompt box

[Storyboarder](https://www.ycombinator.com/companies/storyboarder) presents a staged creator workflow around building scenes, posing characters, and framing shots, with reusable assets and 3D-to-2D scene control. The applicable pattern is a progressive editor:

1. Select a source scope.
2. Review the AI's five-beat outline.
3. Lock characters and visual direction once.
4. Regenerate one weak scene, not the whole series.
5. Preview manga and reels from the same beat rail.

### Shortbread: story and granular correction beat one-click generation

[Shortbread](https://www.ycombinator.com/companies/shortbread) emphasizes character consistency, script-driven creation, and creator control. Its public founder discussion also describes moving away from a generic prompt-to-comics direction toward more granular artistic control. The lesson is direct: a one-click demo may attract attention, but correction boundaries make the product usable.

For this hackathon, expose only three controls: source selection, five-beat outline approval, and regenerate-this-scene. Do not build a full canvas editor.

### Manga Plus: the reader gets out of the story's way

[Manga Plus](https://mangaplus.shueisha.co.jp/) supports familiar episode entry and reading modes, including vertical and horizontal reading preferences. The reusable principles are:

- Put series title, episode number, and completion state before entering the reader.
- Let the content own the viewport; tap or click the center to toggle chrome.
- Keep navigation at the edges and respect reading direction.
- Ask for favorite, next episode, or discussion at a natural completion boundary.

Live signed-in interaction inspection was unavailable in this research environment, so this audit relies on the public product pages, official FAQ/help surfaces, and public company descriptions rather than pretending to have completed a click-through.

## Recommended product flow

### A. Creation flow

1. **Upload:** one PDF or notes PDF. Show page count and parse status.
2. **Scope:** display detected table of contents and page ranges. Default to one chapter, never the whole 400-page book.
3. **Plan:** show exactly five `LearningBeat` cards with objective, source-page receipt, and a one-line hook. CTA: **Build my series**.
4. **Generate:** a stage timeline reports meaningful checkpoints: understanding source, scripting beats, materializing characters, composing pages, rendering reels. A retry resumes a stage.
5. **Review:** one horizontal beat rail switches between manga and reel previews. A beat can be regenerated without losing the rest.
6. **Publish:** generate a private share link by default. Public publishing is not needed for the demo.

### B. Reader and feed

The manga reader and reel feed are complementary, not competing layouts:

- The reel feed defaults to vertical swipe and one episode per viewport.
- The manga reader defaults to a content-first page mode with a visible direction setting.
- A compact episode rail appears only when chrome is open.
- Viewed episodes show a check; current is high contrast; upcoming episodes show number and title without fake lock gamification.
- Progress is `3 / 5` and a concept label, not an XP score.
- Every episode has a quiet **Source: Chapter 4, pp. 88-90** receipt that opens the cited excerpt.
- The end card asks one retrieval question before revealing the concise answer. It is optional and takes under 10 seconds.

### C. Share and thread

The share sheet has one highlighted action: **Discuss this series**. It creates a private invite link. Do not build a friend picker, online status, or recent activity.

Inside the thread:

- Messages attach to `beat_id`, not a raw timestamp.
- The UI displays the current rendered timecode derived from the reel's interaction map.
- A user can leave a future message and choose **Reveal when they reach Episode 4**.
- The recipient sees a small sealed-message marker in the episode rail, without the message content.
- A spoiler gate prevents normal thread messages from revealing later beats.
- A shared snippet is a rights-safe preview card with series art, a short user-authored caption, beat ID, and deep link. Do not redistribute a copyrighted video segment by default.

This future-message mechanic is the social differentiator. It creates anticipation and a personal reason to continue without requiring a network effect on day one.

## Scope triage

| Idea | Demo impact | Incremental effort | Decision |
|---|---:|---:|---|
| Notes PDF to five reels | High | Low, if treated as the same PDF path | **Include as the demo source.** Do not create a second ingestion product. |
| Beat-anchored future message | Very high | Medium | **Include.** It proves the social thesis. |
| Source receipt and retrieval card | High | Low to medium | **Include.** It proves learning and grounding. |
| Progress collage | Medium | Medium | **Defer.** A five-thumbnail completion strip is enough for the demo. |
| Streak | Low | Medium | **Cut.** Commodity behavior with no evidence of learning. |
| Accountability buddy | Medium | High as a real system | **Fold into the private thread.** Do not build a second mechanic. |
| Friend picker, presence, activity | Low | Very high | **Cut.** Vibe-coded social scaffolding before a network exists. |
| What-if generator | Flashy but confusing | Medium to high | **Cut.** It weakens source fidelity and introduces fan-fiction and spoiler problems. |
| General real-time chat | Medium | Very high | **Cut.** A simple persisted thread is enough. |
| Adaptive backtracking engine | High long-term | Very high | **Cut for the hackathon.** Capture retrieval evidence now and adapt later. |
| Well-being dashboard | Low | High | **Cut.** Unprovable claims and another product identity. |
| Creator marketplace/director studio | High long-term | Very high | **Cut.** Keep only outline approval and per-scene regenerate. |

## Hackathon eligibility and demo constraints

The current [OpenAI Build Week rules](https://openai.devpost.com/rules) and [FAQ](https://openai.devpost.com/details/faqs) materially change the implementation plan:

- The deadline is **21 July 2026 at 5:00 PM PDT**.
- Submit to the **Education** track; the source-grounded retrieval loop is a clearer fit than presenting this as a general social product.
- The project must use **Codex and GPT-5.6**.
- Pre-existing projects are allowed, but judging is limited to meaningful work added during the competition window. The submission must make the new learning-reel and social work unmistakable.
- The demo video must be public, under three minutes, include audio, and show the working project.
- The repository/README should document how Codex was used and identify a representative Codex session.
- Use a public-domain or user-authored PDF/lecture-notes source and rights-safe music/assets. Do not make the judge evaluate copyright risk.

### Required policy decision

The current upstream `AGENTS.md` and `CLAUDE.md` say every text, structured-output, review, repair, and vision LLM call must use server-owned MiniMax, with OpenRouter allowed only for image generation. That directly conflicts with the event requirement.

Before implementation, the owner should approve a hackathon-specific exception and update both instruction files together. The narrowest meaningful GPT-5.6 lane is:

- GPT-5.6 authors and verifies `LearningBeat[]` for the selected scope, including cited learning objectives, misconceptions, retrieval prompts, and concise explanations.
- Existing MiniMax stages may continue to perform manga-specific scripting and repair if desired.
- OpenRouter remains image-only.
- Model receipts on the generated artifact prove which stage used GPT-5.6.

Do not hide GPT-5.6 in a decorative chat button. Judges should see it doing necessary product work.

---

# Recommended target architecture

```text
Browser / Next.js
  | upload PDF, choose chapter, approve five beats
  v
FastAPI control plane
  | creates ScopeManifest + GenerationRun
  v
Celery pipeline runner
  |-- parse/index --------------------------> SourceUnit[] + chapter map
  |-- scoped understanding ----------------> ScopedSpine + facts + bible
  |-- learning design (GPT-5.6) -----------> LearningBeat[]
  |      |                                       |
  |      |                                       +--> LearnerSeriesState
  |      v
  |-- manga compiler ----------------------> MangaEpisodeSpec
  |      |--> storyboard/assets/composition --> RenderedPage[]
  |
  |-- reel compiler -----------------------> ReelSpec
  |      |--> Remotion worker + FFmpeg -------> MP4/VTT/thumbnail
  |
  +-- every stage -------------------------> StageRun + immutable Artifact

Reader/feed
  | consumes RenderedPage or MP4
  | updates resume/exposure/retrieval state
  +--> private thread messages anchored to beat_id
```

## Acceptance proof for one golden demo

Use one short, rights-safe notes PDF. The build is accepted only if:

1. The user selects one detected section rather than processing the whole document.
2. Five ordered `LearningBeat` records cite exact source pages/spans.
3. The same beat IDs appear in manga pages and reel interaction maps.
4. At least one consistent character asset appears in both representations.
5. A deliberately failed render resumes without re-running source understanding.
6. The five reels play in the feed with captions and safe-zone-correct text.
7. A friend opens a private link, watches to Episode 4, and unlocks a beat-anchored future message.
8. The final episode asks one retrieval question and reveals the source-backed answer.
9. Model receipts demonstrate meaningful GPT-5.6 use.
10. The demo can be recorded in under three minutes without explaining unfinished features.

---

# Prompt for the next implementation session

Copy the prompt below into a fresh Codex session. It deliberately starts with policy and upstream reconciliation because implementing against the stale local checkout or the wrong provider rule would waste the remaining window.

```text
Work in /Volumes/Mrigesh SSD/Book-Reel.

Read AGENTS.md, CLAUDE.md, docs/research-report.md, docs/architecture.html, README.md,
NEXT_SESSION.md, and git status before changing anything. Preserve every user-owned
untracked renderer experiment. The local main branch was observed 12 commits behind
origin/main on 2026-07-18, so inspect and reconcile the upstream diff safely before
duplicating work. Do not pull, reset, commit, or push without first proving the exact
scope and preserving dirty state.

Goal: implement the smallest OpenAI Build Week golden path:
selected notes-PDF section -> five source-cited LearningBeat records -> the existing
manga path plus five Remotion reels -> private share thread -> a future message that
unlocks at a stable beat_id.

First stop condition: current upstream AGENTS.md/CLAUDE.md prohibit OpenAI LLM calls,
but Build Week requires meaningful GPT-5.6 use. Do not silently violate either rule.
Show the conflict and obtain/confirm owner approval for a hackathon-specific exception.
If approved, update both instruction files consistently and assign GPT-5.6 the real
LearningBeat authoring/verification stage. Keep OpenRouter image-only.

Implementation constraints:
1. Keep pipeline topology hardcoded. Do not add LangGraph, Temporal, or an agent DAG.
2. Add Pydantic/Zod versioned contracts for ScopeManifest, LearningBeat, ReelSpec,
   GenerationRun, StageRun, and Artifact. Use stable source refs and content hashes.
3. Checkpoint each expensive stage and make retries idempotent. Prove a renderer retry
   does not rerun source understanding.
4. Reuse and harden reel-renderer/. Replace Record<string, any> with a component enum
   and component-specific prop schemas. The model emits JSON only, never JSX/CSS/code.
5. Add captions, source receipt, safe zones, beat-to-time interaction map, and render
   receipts. Reels compile from LearningBeat and shared assets, not manga screenshots.
6. UI scope is only: upload, chapter/section selection, five-beat approval, generation
   status, manga/reel preview, private invite thread, and future-message unlock.
7. Do not build friend presence, streaks, collage, what-if generation, real-time chat,
   a marketplace, or a custom renderer.
8. Use a public-domain or user-authored notes PDF and never invent source facts.

Before coding, write a short implementation plan tied to exact files and tests. Then
implement the thinnest end-to-end vertical slice, run focused tests, render one reel,
exercise the share/unlock flow, and report exact evidence and remaining gaps. Do not
claim acceptance without the ten checks in docs/research-report.md.
```

---

# Single recommended hackathon build order

1. **Hour 0 to 2: reconcile reality.** Review the 12 upstream commits, preserve the dirty renderer experiments, approve and document the GPT-5.6 exception, choose a rights-safe notes PDF, and freeze one five-episode demo script.
2. **Hour 2 to 8: make scope and state durable.** Add `SourceUnit`, `ScopeManifest`, `GenerationRun`, `StageRun`, and `Artifact`; expose chapter/section selection; checkpoint parsed source and scoped understanding.
3. **Hour 8 to 16: create the shared teaching contract.** Implement GPT-5.6-backed `LearningBeat` generation and verification with page/span citations, fact IDs, misconception, retrieval prompt, and model receipt. Approve five beats in the UI.
4. **Hour 16 to 28: prove both presentations from the same beats.** Compile beats into the existing manga path and harden `reel-renderer/` into validated `ReelSpec` plus three to five registered scene components, captions, safe zones, shared assets, source receipt, and MP4 render receipt.
5. **Hour 28 to 36: ship the one social differentiator.** Add a private invite URL, persisted beat-anchored thread, spoiler state, and one future message that unlocks when the recipient reaches its beat.
6. **Hour 36 to 44: prove resilience and learning.** Add one retrieval end card, resume state, a forced render-failure test, stage-level retry proof, source-grounding assertions, and one end-to-end golden-path test.
7. **Hour 44 to deadline: stop adding features.** Polish the upload-to-result path, record the under-three-minute demo with audio, show Codex and GPT-5.6 receipts, update README with new-work boundaries and a Codex session ID, verify the public repository and video, and submit with buffer.
