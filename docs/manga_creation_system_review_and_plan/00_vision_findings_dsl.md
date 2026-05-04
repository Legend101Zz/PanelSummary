# Manga Creation System: Deep Codebase Review and Rebuild Plan

> Owner: Mrigesh Thakur  
> Review agent: `code-puppy-0c26ab`  
> Date: 2026-05-04  
> Scope: Analyze the current PDF → manga generation system and design a practical plan to make it produce beautiful, coherent, source-faithful manga.

---

## 0. The product vision

A user uploads a PDF. Instead of reading the whole document, they get a manga/comic adaptation that gives them:

1. the central thesis,
2. the important facts,
3. the emotional/intellectual journey,
4. memorable characters/metaphors,
5. a readable page-by-page manga experience,
6. enough gist that they understand what they would have learned from reading the source.

This is not “summarization with panels.” The right product framing is:

> **Source-grounded manga adaptation.**

That difference matters. Summarization compresses. Adaptation transforms while preserving meaning.

The current codebase has the right ambition and many useful pieces, but the flow currently gives too much creative responsibility to panel/DSL generation. The result is average dialogue, generic character visuals, uneven story pacing, and a scattered v2/v4 architecture.

---

## 1. Executive summary

### What is good today

The codebase already has several strong foundations:

- Whole-document understanding exists in `stage_document_understanding.py`.
- A manga story design/blueprint stage exists in `stage_manga_story_design.py`.
- A planner exists in `agents/planner.py`.
- V2 and V4 renderers exist.
- V4’s semantic intent approach is directionally correct.
- DSL validation/fallbacks exist.
- Character sprite generation exists in `image_generator.py` and `orchestrator.py`.
- Frontend V4 page rendering exists.
- Generated panels are stored separately as `LivingPanelDoc`, avoiding MongoDB document size issues.

### What is weak today

The pipeline does not yet model how manga is actually made:

```text
concept/logline → characters/world → beat sheet → script → thumbnails/storyboard → final rendering
```

Instead, the current pipeline roughly does:

```text
understand doc → blueprint → panel plan → DSL/render
```

That skips the most important creative artifacts:

- a formal adaptation plan,
- source fact registry,
- scene script,
- page storyboard,
- character sheet / expression sheet,
- quality gates.

### Main recommendation

Keep the DSL approach, but make it a rendering layer only.

New core pipeline:

```text
PDF
  → Canonical chapter summaries
  → Document understanding
  → Source fact registry
  → Adaptation plan
  → Character/world bible
  → Beat sheet
  → Manga script
  → Storyboard pages
  → V4 render pages
  → Optional V2 animation layer
  → Quality gate + repair
  → Reader
```

### Strategic engine direction

Make **V4** the default/main engine.

V4 is closer to the right abstraction because it describes semantic intent and lets the renderer control consistency. V2 can remain as “animated/experimental mode,” but it should not be the primary path for good manga generation.

---

## 2. Current architecture observed

### 2.1 Main backend flow

From `backend/app/agents/orchestrator.py`:

```text
0. Credit check
1. Deep document understanding
2. Knowledge graph
3. Narrative arc
4. Manga story design / blueprint
5. Optional sprite generation
6. Panel planning
7. Rule-based scene composition
8. Per-page DSL generation with V2 or V4
9. Assembly and persistence
```

This is a good skeleton. The problem is that several stages are doing overlapping creative work, and the story contract is not strong enough.

### 2.2 Main frontend flow

From `frontend/app/books/[id]/page.tsx`:

- User chooses model, style, image toggle, image model, and engine.
- `selectedEngine` defaults to `"v2"`.
- API call sends `engine` to backend.

From `frontend/app/books/[id]/manga/page.tsx`:

- Fetches summary.
- Fetches living panels.
- If engine is `v4`, uses `v4_pages` or reconstructs pages from flat panels.
- Renders V4 pages using `V4PageRenderer`.
- Otherwise renders V2 living panels.

### 2.3 Storage flow

From `backend/app/celery_worker.py`:

- `BookSummary` stores metadata.
- Generated panel DSLs go into `LivingPanelDoc`.
- `summary_doc.v4_pages` stores page-level V4 data if present.
- `summary_doc.manga_bible` stores a typed legacy-compatible bible.
- `summary_doc.manga_chapters` is still present but generally not populated by the current orchestrator.

---

## 3. File-level codebase findings

### 3.1 `backend/app/agents/orchestrator.py`

This is the main pipeline coordinator.

Strengths:

- It already has a multi-stage design.
- It handles cancellation and credits.
- It calls document understanding, graph, arc, story design, planning, scene composition, and DSL generation.
- It supports both V2 and V4.
- It has optional sprite generation.

Problems:

- Too many responsibilities in one file.
- Story, planning, rendering, sprite generation, fallback, persistence-facing result shape all mix together.
- Sprite generation is optional but not deeply integrated into V4 rendering.
- Quality is tracked mostly as success/fallback counts, not story quality.
- It returns `book_synopsis`/`manga_bible` for backward compatibility, but the richer blueprint is not preserved as a first-class artifact.

Key issue: the orchestrator jumps from blueprint to panel planner. There is no formal script/storyboard stage.

### 3.2 `backend/app/stage_document_understanding.py`

This is one of the strongest pieces.

Strengths:

- It builds a `knowledge_doc` from all canonical chapters.
- It captures document type, core thesis, entities, argument structure, knowledge clusters, emotional arc, quotes, data points, relationships, and hook.
- It correctly frames itself as the single source of truth.

Problems:

- It is based on canonical summaries, not raw source chunks, so factual fidelity depends on earlier summaries.
- It asks the LLM to be exhaustive but does not create stable fact IDs.
- Downstream stages use its facts informally, not through an enforceable registry.

Recommendation:

Keep this stage, but immediately convert its output into a `SourceFactRegistry` with stable IDs.

### 3.3 `backend/app/stage_manga_story_design.py`

This creates the current manga blueprint.

Strengths:

- It understands that synopsis and bible should not be generated independently.
- It asks for title, logline, world, characters, narrative arc, scenes, and must-include facts.
- It validates that all chapters get at least one scene.
- It has conversion helpers for legacy synopsis/bible.

Problems:

- It still tries to do too much in one LLM call.
- It creates scene/dialogue beats but not a proper manga script.
- Character design lacks asset-level constraints.
- Scenes are not page-aware.
- It does not output page-turn hooks, shot types, or panel flow.

Recommendation:

Keep it as a bridge for now, but split it into:

1. adaptation plan,
2. character/world bible,
3. beat sheet,
4. script writer,
5. storyboarder.

### 3.4 `backend/app/agents/planner.py`

This creates `PanelAssignment` and `MangaPlan`.

Strengths:

- It has many useful manga storytelling rules.
- It explicitly says “show, don’t tell.”
- It has text limits.
- It emphasizes dialogue.
- It handles panel/page budgets.
- It attempts layout variety and pacing rhythm.

Problems:

- It writes dialogue at the planning stage.
- It combines adaptation, screenwriting, panel planning, and render guidance.
- The prompt is large and tries to solve too much.
- `PanelAssignment` is too renderer-adjacent to be the creative source of truth.
- Dialogue coherence depends on this single planning call.

Recommendation:

Keep `PanelAssignment` as a compatibility/render bridge, but do not let it be the main creative artifact. Generate it from `StoryboardPage` later.

### 3.5 `backend/app/v4_dsl_generator.py`

This generates V4 semantic pages from `PanelAssignment`.

Strengths:

- V4 philosophy is correct: LLM describes WHAT, engine renders HOW.
- Page-level generation is better than per-panel generation.
- Fallbacks exist.
- Validation exists through `v4_types.py`.

Problems:

- It still asks the LLM to compose page flow from panel assignments.
- It can rewrite dialogue/narration instead of preserving script text.
- Schema lacks important manga fields:
  - shot type,
  - camera angle,
  - bubble placement intent,
  - source fact IDs,
  - character asset refs,
  - SFX,
  - page-turn hook,
  - panel role.

Recommendation:

V4 should consume storyboard pages directly. Ideally no LLM call is needed at V4 generation time once storyboard exists. The V4 generator should become mostly deterministic mapping.

### 3.6 `backend/app/v4_types.py`

Current V4 schema:

- panel type,
- scene,
- mood,
- title,
- narration,
- dialogue lines,
- data items,
- character,
- pose,
- expression,
- effects,
- emphasis.

This is a good start, but not enough for high-quality manga.

Needed additions:

- `panel_role`: establishing, reaction, reveal, explanation, data, transition.
- `shot_type`: wide, medium, closeup, extreme_closeup, insert.
- `camera_angle`: eye_level, low, high, dutch, over_shoulder.
- `sfx`: optional sound effect text.
- `source_fact_ids`: grounding.
- `asset_refs`: character image IDs.
- `read_order`: explicit order.
- `page_turn_hook`: on page object.
- `caption_role`: narration, thought, source_note, aside.

### 3.7 `backend/app/image_generator.py`

Strengths:

- Supports OpenRouter image models.
- Has panel image generation.
- Has character sprite generation.
- Has image budget logic.

Problems:

- `generate_character_sprite` generates one generic upper-body portrait per character.
- It does not generate a proper character sheet or expression sheet.
- It does not store structured asset metadata.
- Current sprite injection mainly targets V2 DSL layers.
- V4 frontend does not currently render sprite assets.

Recommendation:

Shift image generation strategy from “panel/splash images” to “reusable character assets first.”

### 3.8 `frontend/components/V4Engine/*`

Strengths:

- V4 page rendering exists.
- Separate panel renderers exist.
- Palette/mood system exists.
- Accessible aria labels are present.

Problems:

- `DialoguePanel` shows character tags, not actual character sprites/assets.
- Layouts are simple CSS boxes, not manga-like panel cuts/gutters yet.
- No speech bubble collision/fit logic.
- No shot-type-aware composition.
- No source/debug overlay.
- V4 types do not support assets or source IDs.

Recommendation:

Upgrade V4 frontend after backend artifacts exist. Do not over-polish frontend before script/storyboard quality is fixed.

### 3.9 Tests

Running backend tests currently fails during collection:

```text
ModuleNotFoundError: No module named 'app.panel_templates'
```

This means tests are stale after refactors. Before major changes, fix test collection.

---

## 4. Why the generated manga feels average

### 4.1 Dialogue is planned too late and too loosely

Good manga dialogue has purpose:

- reveal character,
- move the idea forward,
- create tension/question,
- set up payoff,
- avoid repeating captions.

Current dialogue is created inside planner/V4 generation prompts. It is not grounded in a formal scene script, so it can become:

- generic mentor/student banter,
- incoherent transitions,
- repeated summary lines,
- melodrama detached from source.

### 4.2 Characters are descriptions, not production assets

A manga character needs:

- silhouette,
- outfit lock,
- face/hair lock,
- expression set,
- pose set,
- color/aura identity,
- speech style.

Current character bible has descriptions but not enough constraints or reusable assets.

### 4.3 Page flow is not storyboarded

Real manga uses page composition:

- establishing shot,
- reaction shot,
- insert/data panel,
- close-up reveal,
- page-turn hook.

Current V4 pages are grouped from planned panels, but there is no dedicated thumbnail/storyboard stage.

### 4.4 The system lacks editorial quality gates

There are technical fallbacks, but no editorial checks like:

- “Does this script make sense without the PDF?”
- “Did we preserve high-priority facts?”
- “Are characters consistent?”
- “Are page turns meaningful?”
- “Are five panels in a row the same shot?”

### 4.5 V2/V4 split creates product ambiguity

Users should not have to pick between internal architecture experiments. The product should pick the best default.

V4 should be the default manga experience. V2 can be an advanced/experimental animated mode.

---

## 5. How actual manga/comic production maps to this app

User gave the right manga-writing process. Here is how it maps to code.

### 5.1 Define key elements

Manga craft question:

- Who is the protagonist?
- What do they want?
- Why can’t they have it?
- What do they do about it?

App artifact:

- `AdaptationPlan`

### 5.2 Write a logline

Manga craft:

- One sentence testing the story’s strength.

App artifact:

- `AdaptationPlan.logline`

### 5.3 Outline the plot

Manga craft:

- Beginning/middle/end or Ki-Sho-Ten-Ketsu.

App artifact:

- `BeatSheet`

### 5.4 Write the script

Manga craft:

- Scene descriptions, panel-by-panel action, dialogue.

App artifact:

- `MangaScript`

### 5.5 Character and world design

Manga craft:

- Profiles, visually distinct designs, character sheets.

App artifact:

- `CharacterWorldBible`
- `MangaAssetDoc`

### 5.6 Create thumbnails

Manga craft:

- Rough page layout, pacing, dialogue placement.

App artifact:

- `StoryboardPage`

### 5.7 Focus on flow

Manga craft:

- Guide the reader’s eye naturally.

App artifact:

- `StoryboardPage.read_order`
- `V4Page.layout`
- frontend page renderer

Note: Japanese manga is right-to-left, but your app currently appears more web/comic oriented. Recommendation: default LTR for accessibility/global users, but support RTL as a style option later.

### 5.8 Vary shot types

Manga craft:

- Close-ups, wide shots, medium shots.

App artifact:

- `StoryboardPanel.shot_type`
- quality gate checks

### 5.9 Drawing/inking/screentones/lettering

Manga craft:

- Pencils, inks, tones, lettering.

App artifact:

- V4 renderer visual system
- CSS/SVG/screentone effects
- optional generated character assets
- speech bubble renderer

### 5.10 Feedback

Manga craft:

- Show drafts to others.

App artifact:

- deterministic quality gates
- optional LLM editor judge
- debug view for script/storyboard

---

## 6. Is the DSL approach right?

Yes, but only as the final rendering contract.

### Keep DSL for

- render stability,
- validation,
- cost control,
- accessibility,
- frontend consistency,
- partial regeneration,
- storage and replay.

### Do not use DSL for

- deciding story structure,
- inventing character arcs,
- writing final dialogue from scratch,
- choosing facts to preserve,
- solving coherence.

### Correct abstraction stack

```text
Source understanding = what is true
Adaptation plan = what story are we telling
Beat sheet = how the story moves
Script = what happens and what is said
Storyboard = how pages/panels flow
V4 DSL = what renderer displays
Frontend = how it looks and feels
```

This is the main architectural fix.

---
