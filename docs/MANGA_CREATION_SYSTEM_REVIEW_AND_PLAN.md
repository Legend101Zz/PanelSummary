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

## 7. Proposed new canonical artifacts

### 7.1 `SourceFactRegistry`

Purpose: prevent hallucination and guarantee source coverage.

Example:

```json
{
  "fact_id": "f042",
  "text": "The source states that X increased by 37% in 2024.",
  "source_chapter": 3,
  "source_section": "Market Results",
  "fact_type": "metric",
  "importance": "high",
  "must_appear": true,
  "quote_exact": false
}
```

Sources:

- `knowledge_doc.data_points`
- `knowledge_doc.knowledge_clusters[].key_facts`
- `canonical_chapters[].key_concepts`
- `canonical_chapters[].memorable_quotes`
- `canonical_chapters[].dramatic_moment`
- key entities and relationships

Rules:

- high-importance facts must appear in script/storyboard,
- exact quotes must be flagged,
- factual dialogue/captions must reference fact IDs.

### 7.2 `AdaptationPlan`

Purpose: answer core manga story questions.

```json
{
  "title": "string",
  "logline": "one sentence",
  "source_thesis": "one sentence",
  "adaptation_thesis": "one sentence",
  "protagonist_id": "kai",
  "protagonist_goal": "understand why X matters",
  "central_obstacle": "the concept appears simple but hides complexity",
  "stakes": "without this insight, the reader misreads the document",
  "reader_promise": "by the end, reader understands A, B, C",
  "structure": "ki_sho_ten_ketsu",
  "tone": "manga",
  "must_preserve_fact_ids": ["f001", "f002"],
  "no_invention_rules": [
    "Do not invent events not in source",
    "Dialogue can be explanatory but cannot pretend to quote real people unless exact quote exists"
  ]
}
```

### 7.3 `CharacterWorldBible`

Purpose: define reusable, consistent visual and dialogue identity.

```json
{
  "world": {
    "setting": "A library where ideas become living shadows and light.",
    "visual_style": "High-contrast manga ink with Walmart blue accents and spark highlights.",
    "palette": ["#0053e2", "#ffc220", "#0F0E17", "#F0EEE8"],
    "motifs": ["glowing pages", "forked paths", "screentone storms"]
  },
  "characters": [
    {
      "id": "kai",
      "name": "Kai",
      "role": "protagonist",
      "represents": "the reader",
      "wants": "to understand the document quickly without losing nuance",
      "flaw": "jumps to simple conclusions",
      "arc": "curious → confused → challenged → clear",
      "speech_style": "short, direct, curious questions",
      "silhouette": "messy hair, oversized jacket, forward-leaning posture",
      "visual_description": "young reader, messy dark hair, blue hoodie, expressive eyes",
      "outfit_lock": "blue hoodie, dark pants, small spark pin",
      "do_not_change": ["hair shape", "hoodie", "spark pin"],
      "signature_color": "#0053e2",
      "allowed_expressions": ["neutral", "curious", "shocked", "determined", "relieved"],
      "asset_refs": {
        "sheet": "image_id",
        "portrait_neutral": "image_id",
        "portrait_curious": "image_id"
      }
    }
  ]
}
```

### 7.4 `BeatSheet`

Purpose: structure the manga story before pages.

For nonfiction/explainer PDFs, support:

1. **Ki-Sho-Ten-Ketsu**
   - Ki: setup
   - Sho: development
   - Ten: twist/reframe
   - Ketsu: resolution

2. **Three-act explainer**
   - Act 1: problem/setup
   - Act 2: complication/learning
   - Act 3: synthesis/application

3. **Documentary case study**
   - context → evidence → conflict → result → lesson

Example:

```json
{
  "structure": "ki_sho_ten_ketsu",
  "beats": [
    {
      "beat_id": "b001",
      "role": "ki",
      "summary": "Kai enters the world of the document and sees the core problem.",
      "source_chapters": [0],
      "required_fact_ids": ["f001"],
      "emotional_shift": "curious → unsettled",
      "reader_question": "Why does this problem matter?",
      "target_pages": 2
    }
  ]
}
```

### 7.5 `MangaScript`

Purpose: write scenes and dialogue coherently before panels.

```json
{
  "scenes": [
    {
      "scene_id": "s001",
      "beat_id": "b001",
      "scene_title": "The Door Made of Pages",
      "scene_goal": "Introduce the document’s core thesis.",
      "conflict_or_question": "Kai thinks the idea is simple, but the mentor shows hidden stakes.",
      "setting": "archive of glowing pages",
      "characters": ["kai", "mentor"],
      "source_chapters": [0],
      "source_fact_ids": ["f001", "f002"],
      "script_beats": [
        {
          "action": "Kai opens the first page and the room fills with diagrams.",
          "caption": "The document begins with a deceptively simple problem.",
          "dialogue": [
            {
              "character_id": "kai",
              "text": "Wait... this is the whole problem?",
              "intent": "reader_question",
              "source_fact_ids": []
            },
            {
              "character_id": "mentor",
              "text": "Only the surface. Look at what it changes.",
              "intent": "reframe",
              "source_fact_ids": ["f001"]
            }
          ]
        }
      ]
    }
  ]
}
```

Rules:

- speech bubbles should be short,
- no exact quote unless quote exists,
- factual lines cite fact IDs,
- each scene has a goal and payoff.

### 7.6 `StoryboardPage`

Purpose: thumbnail/page layout.

```json
{
  "page_id": "p001",
  "page_index": 0,
  "scene_id": "s001",
  "read_direction": "ltr",
  "layout": "asymmetric",
  "page_goal": "hook the reader with the core mystery",
  "page_turn_hook": "But then the numbers start moving.",
  "panels": [
    {
      "panel_id": "p001_01",
      "read_order": 1,
      "panel_role": "establishing",
      "shot_type": "wide",
      "camera_angle": "eye_level",
      "action": "Kai stands before a giant archive door.",
      "characters": ["kai"],
      "caption": "Every document has a door. This one was locked by complexity.",
      "dialogue": [],
      "sfx": "KRRR",
      "source_fact_ids": []
    },
    {
      "panel_id": "p001_02",
      "read_order": 2,
      "panel_role": "reaction",
      "shot_type": "closeup",
      "camera_angle": "low",
      "action": "Kai notices the first key fact glowing.",
      "characters": ["kai"],
      "caption": "",
      "dialogue": [
        { "character_id": "kai", "text": "That number... it changes everything." }
      ],
      "source_fact_ids": ["f001"]
    }
  ]
}
```

### 7.7 `QualityReport`

Purpose: make quality visible and repairable.

```json
{
  "status": "pass | repair_needed | fail",
  "coverage": {
    "required_facts": 12,
    "covered_facts": 11,
    "missing_fact_ids": ["f009"]
  },
  "dialogue": {
    "too_long_lines": ["panel_id"],
    "repeated_lines": [],
    "style_violations": []
  },
  "visuals": {
    "shot_repetition_warnings": [],
    "missing_establishing_shots": []
  },
  "characters": {
    "unknown_character_ids": [],
    "invalid_expressions": []
  },
  "fidelity": {
    "ungrounded_factual_claims": []
  }
}
```

---

## 8. New pipeline design

### 8.1 Current pipeline

```text
canonical summaries
  → document understanding
  → knowledge graph
  → narrative arc
  → manga blueprint
  → planner
  → scene composition
  → V2/V4 DSL
```

### 8.2 Proposed pipeline

```text
canonical summaries
  → document understanding
  → source fact registry
  → adaptation plan
  → character/world bible
  → optional character assets
  → beat sheet
  → manga script
  → storyboard pages
  → quality gate pass 1
  → V4 pages from storyboard
  → quality gate pass 2
  → persist panels/pages/assets
```

### 8.3 Migration-safe pipeline

Do not big-bang rewrite. Add new stages behind a flag or incremental fallback.

```text
if new_manga_pipeline_enabled:
    run new artifacts
    generate V4 pages from storyboard
else:
    run current orchestrator path
```

But since this is likely an active product iteration, a practical middle path:

1. Add fact registry.
2. Add adaptation plan.
3. Add script writer.
4. Add storyboarder.
5. Adapt existing V4 generator to accept storyboard.
6. Leave V2 path as is.

---

## 9. Detailed implementation plan

### Phase 0 — make the repo safe to change

#### 0.1 Fix tests

Current failure:

```text
ModuleNotFoundError: No module named 'app.panel_templates'
```

Options:

1. Restore a compatibility `backend/app/panel_templates.py` if tests describe still-useful behavior.
2. Update tests to target current modules.
3. Delete stale tests only if behavior is fully obsolete.

Acceptance:

```bash
cd backend && python -m pytest tests/ -q
```

must collect tests successfully.

#### 0.2 Add golden sample tests

Create small fixture:

- 2 fake chapters,
- 5 facts,
- 2 characters,
- expected storyboard shape.

Tests should verify:

- fact registry stable IDs,
- script references fact IDs,
- storyboard has pages and shot variety,
- V4 page conversion preserves dialogue.

#### 0.3 Default to V4

Change:

- `frontend/app/books/[id]/page.tsx`: `selectedEngine` default `"v4"`.
- `frontend/lib/api.ts`: default engine `"v4"`.
- `backend/app/main.py`: request model default `"v4"` if applicable.
- `backend/app/celery_worker.py`: summarize task default `"v4"` if applicable.

Rename UI labels:

- V4 → `Recommended Manga Pages`
- V2 → `Experimental Animated Panels`

### Phase 1 — source fact registry

Create:

```text
backend/app/manga_adaptation/__init__.py
backend/app/manga_adaptation/types.py
backend/app/manga_adaptation/fact_registry.py
```

Implementation notes:

- Use deterministic IDs based on order and normalized text.
- De-duplicate near-identical facts.
- Mark facts from data points/quotes as higher priority.
- Track source chapters.

Functions:

```python
def build_fact_registry(knowledge_doc: dict, canonical_chapters: list[dict]) -> list[SourceFact]:
    ...

def find_missing_required_facts(facts: list[SourceFact], used_fact_ids: set[str]) -> list[str]:
    ...
```

Acceptance:

- Stable IDs across runs for same input.
- High-priority data points become `must_appear=True`.
- Unit tests for dedupe and coverage.

### Phase 2 — adaptation plan

Create:

```text
backend/app/manga_adaptation/adaptation_plan.py
```

Prompt role:

> You are a manga editor. Given source understanding and fact registry, decide the adaptation strategy.

Output:

- title,
- logline,
- protagonist,
- goal,
- obstacle,
- stakes,
- structure,
- must-preserve facts,
- rules against invention.

Fallback:

- protagonist = reader avatar,
- mentor = source wisdom,
- structure = three-act explainer,
- must facts = top high-priority facts.

Acceptance:

- Plan answers all core writer questions.
- Plan references fact IDs.
- No raw rendering details.

### Phase 3 — character/world bible v2

Create:

```text
backend/app/manga_adaptation/character_bible.py
```

Inputs:

- knowledge doc,
- adaptation plan,
- fact registry,
- style.

Outputs:

- world design,
- characters with IDs,
- visual constraints,
- speech constraints,
- allowed expressions,
- asset plan.

Important design rules:

- Max 2-4 recurring characters.
- If document is about a real person, that person can be a character, but do not invent fake events involving them.
- For abstract books, use symbolic characters:
  - reader/protagonist,
  - mentor/source voice,
  - rival/doubt/old assumption,
  - concept avatar if useful.

Acceptance:

- Every character has unique silhouette.
- Every character has speech style.
- No duplicate generic “Kai/The Sage” unless fallback.

### Phase 4 — character asset generation MVP

Current state:

- `generate_character_sprite` exists.
- Orchestrator can generate up to `MAX_SPRITES_PER_BOOK`.
- Sprite URLs are injected into V2 DSL only.
- V4 does not render sprites.

New plan:

Create:

```text
backend/app/manga_adaptation/character_assets.py
```

Asset types:

- `portrait_neutral`
- `portrait_curious`
- `portrait_shocked`
- `portrait_determined`
- later: `full_body_sheet`

Storage options:

- Short-term: save files in existing image dir and store refs in bible dict.
- Medium-term: create `MangaAssetDoc` collection.

Recommended model:

```python
class MangaAssetDoc(Document):
    summary_id: str
    book_id: str
    character_id: str
    asset_type: str
    expression: str = ""
    image_path: str
    prompt: str
    model: str
    created_at: datetime
```

Prompting guidelines:

- Generate character sheet first when model supports it.
- Use same seed/reference if model supports image input later.
- Include strict outfit/silhouette lock.
- Ask for clean white/transparent background.
- Avoid text in image.

Acceptance:

- Assets are generated once and reused.
- V4 pages include `asset_refs`.
- Frontend dialogue panel can display portrait asset.

### Phase 5 — beat sheet

Create:

```text
backend/app/manga_adaptation/beat_sheet.py
```

Inputs:

- adaptation plan,
- fact registry,
- narrative arc,
- canonical chapters.

Output:

- 8-20 beats depending on document size.
- Each beat maps to source chapters and required fact IDs.
- Each beat has emotional shift and reader question.

Rules:

- For 1-3 chapters: 4-8 beats.
- For 4-10 chapters: 8-16 beats.
- For long PDFs: summarize clusters into 12-24 beats, not one beat per chapter.

Acceptance:

- All high-priority facts assigned to beats.
- Each selected chapter covered.
- Emotional journey is explicit.

### Phase 6 — manga script writer

Create:

```text
backend/app/manga_adaptation/script_writer.py
```

Inputs:

- beat sheet,
- character bible,
- fact registry,
- canonical chapters.

Output:

- `MangaScript`

Rules:

- Scene count follows beat count.
- Each scene has:
  - scene goal,
  - conflict/question,
  - source facts,
  - characters,
  - script beats.
- Dialogue line max:
  - normal bubble: 90 chars,
  - dramatic short line: 40 chars,
  - caption: 120 chars.
- Dialogue cannot use exact quotes unless quote fact is exact.
- Dialogue should avoid fake claims like “I did X” unless source supports it.

Acceptance:

- Script can be read standalone and makes sense.
- Each scene has a setup/development/payoff.
- Factual lines cite fact IDs.

### Phase 7 — storyboarder

Create:

```text
backend/app/manga_adaptation/storyboarder.py
```

Inputs:

- manga script,
- character bible,
- fact registry,
- page budget.

Output:

- `StoryboardPage[]`

Layout rules:

- Opening page can be splash or asymmetric.
- Every scene starts with establishing or contextual panel.
- Use close-ups for emotional turns.
- Use data panels for metrics/lists.
- Use reaction panels after important facts.
- End important pages with hook/reveal.

Shot variety rules:

- No more than 2 same shot types in a row.
- No more than 2 dialogue-only pages in a row.
- At least one wide/establishing panel per scene.
- At least one close-up per emotional beat.

Acceptance:

- Storyboard references script scene IDs.
- Storyboard references fact IDs.
- Page count within budget.
- Visual variety gate passes.

### Phase 8 — V4 schema upgrade

Modify backend `v4_types.py` and frontend `V4Engine/types.ts`.

Add to `V4Panel`:

```python
panel_role: str
shot_type: str
camera_angle: str
read_order: int
caption_role: str
sfx: str
source_fact_ids: list[str]
asset_refs: dict
```

Add to `V4Page`:

```python
page_goal: str
page_turn_hook: str
read_direction: str
scene_id: str
```

Backward compatibility:

- All new fields optional.
- Existing V4 pages still render.

### Phase 9 — Storyboard to V4 conversion

Modify/create:

```text
backend/app/manga_adaptation/storyboard_to_v4.py
```

This should be mostly deterministic.

Mapping:

- `StoryboardPage.layout` → `V4Page.layout`
- `StoryboardPanel.panel_role` → `V4Panel.panel_role`
- `shot_type`/`camera_angle` copied
- script dialogue copied exactly
- source fact IDs copied
- character asset refs injected from bible
- mood/effects inferred from beat/emotional shift

Important: avoid another LLM rewrite here. The script is the source of truth.

Acceptance:

- V4 output preserves script dialogue exactly.
- V4 output preserves fact IDs.
- No panel is empty.

### Phase 10 — quality gates

Create:

```text
backend/app/manga_adaptation/quality_gate.py
```

Checks:

#### Coverage

- required facts covered,
- selected chapters covered,
- scenes map to source.

#### Dialogue

- max line length,
- no repeated dialogue,
- no empty dialogue panels,
- character speech style basic checks.

#### Character consistency

- IDs exist,
- expressions allowed,
- asset refs valid when expected.

#### Visual variety

- shot repetition,
- layout repetition,
- no all-dialogue monotony,
- establishing shots present.

#### Factual fidelity

- factual captions/dialogue have fact IDs,
- exact quotes only from quote facts,
- no unknown real-person actions.

Repair strategy:

```text
run deterministic gates
  → if minor: deterministic fix
  → if major: targeted LLM repair for script/storyboard only
  → re-run gates once
  → if still failing: safe fallback manga
```

Do not repair by regenerating everything unless absolutely needed.

### Phase 11 — frontend V4 manga quality upgrade

After backend emits richer V4 pages, upgrade frontend.

#### Dialogue panel

Current: character tags + bubbles.

New:

- show character portrait asset if available,
- support left/right speaker placement,
- bubble tails point toward portrait,
- expression affects portrait/effect,
- detect and shrink long text,
- support thought bubbles vs speech bubbles.

#### Page renderer

Current: simple flex/grid.

New:

- manga gutters,
- asymmetric panels,
- diagonal cuts for dramatic layouts,
- optional RTL read direction,
- page-turn hook animation.

#### Panel renderer

Use new fields:

- `shot_type`: controls crop/scale.
- `camera_angle`: CSS transform/composition hints.
- `sfx`: render impact text.
- `panel_role`: visual treatment.
- `source_fact_ids`: optional debug overlay.

#### Accessibility

- Keep aria labels.
- Ensure text contrast WCAG 2.2 AA.
- Keyboard navigation.
- Do not rely only on color to convey speaker/emotion.

---

## 10. Prompt strategy

Do not make one giant mega-prompt. Use role-specific prompts.

| Stage | Role | Temperature | Output |
|---|---|---:|---|
| Document understanding | Knowledge architect | 0.3-0.4 | `KnowledgeDoc` |
| Adaptation plan | Manga editor | 0.5-0.6 | `AdaptationPlan` |
| Character bible | Character designer | 0.6-0.7 | `CharacterWorldBible` |
| Beat sheet | Story architect | 0.5-0.6 | `BeatSheet` |
| Script writer | Manga screenwriter | 0.6-0.75 | `MangaScript` |
| Storyboarder | Manga storyboard artist | 0.5-0.65 | `StoryboardPage[]` |
| Quality judge | Editor/proofreader | 0.2 | `QualityReport` |

### General prompt rules

- Every stage returns strict JSON.
- Every factual claim references fact IDs once registry exists.
- Dialogue line limits are hard requirements.
- Use small enough context per stage.
- Avoid giving raw whole source to every stage.
- Prefer repair prompts over full regeneration.

### Dialogue prompt rules

Tell script writer:

- Dialogue is not narration split into bubbles.
- Each line needs intent:
  - question,
  - challenge,
  - explanation,
  - reaction,
  - reveal,
  - transition.
- A scene should read naturally even without images.
- Characters should not all sound like the same narrator wearing fake mustaches.

---

## 11. Handling different PDF types

The system should adapt by document type.

### 11.1 Business/report PDFs

Best manga format:

- analyst protagonist,
- data spirits/charts as visual entities,
- boardroom/war-room metaphor,
- data panels emphasized.

Structure:

```text
problem → metrics → causes → tradeoffs → recommendation
```

### 11.2 Technical books/tutorials

Best manga format:

- learner protagonist,
- mentor/source voice,
- bug/rival as misconception,
- concept visualization.

Structure:

```text
confusion → model → example → mistake → mastery
```

### 11.3 Research papers

Best manga format:

- investigator protagonist,
- hypothesis as mystery,
- experiment/result panels,
- limitation panels.

Structure:

```text
question → method → evidence → result → limitation → implication
```

### 11.4 Biographies/resumes/portfolios

Best manga format:

- real person as protagonist if appropriate,
- timeline quest,
- achievements as milestones,
- avoid invented scenes/dialogue.

Important fidelity rule:

- Do not fabricate personal dialogue or events.
- Use captions and symbolic scenes instead.

### 11.5 Dense textbooks

Best manga format:

- chapter clusters,
- recurring lesson arcs,
- more data/concept panels,
- lower drama, higher clarity.

Structure:

```text
concept map → examples → misconceptions → synthesis
```

---

## 12. Cost and performance strategy

### 12.1 Do not generate full panel images by default

Full image panels are:

- expensive,
- inconsistent,
- hard to edit,
- often bad with text,
- difficult for accessibility.

### 12.2 Generate reusable assets

Best ROI:

1. character portrait/sheet,
2. expression variants,
3. occasional splash background.

### 12.3 Cache aggressively

Cache keys:

- book hash,
- summary style,
- character visual description hash,
- image model.

### 12.4 Regenerate small artifacts

If a page is bad, regenerate:

- script scene, or
- storyboard page, or
- V4 page,

not the entire manga.

---

## 13. Data model migration

Short-term, add dict/list fields to `BookSummary` to avoid over-migration:

```python
fact_registry: list[dict] = []
adaptation_plan: dict = {}
character_world_bible: dict = {}
beat_sheet: dict = {}
manga_script: dict = {}
storyboard_pages: list[dict] = []
quality_report: dict = {}
```

Later, convert to typed Pydantic models after stable.

Possible `MangaAssetDoc` collection:

```python
class MangaAssetDoc(Document):
    summary_id: Indexed(str)
    book_id: str
    character_id: str
    asset_type: str
    expression: str = ""
    image_path: str
    prompt: str
    model: str
    created_at: datetime
```

Keep `LivingPanelDoc` for rendered panel/page payloads.

---

## 14. API/UI implications

### 14.1 Generation UI

Add “quality mode” later:

- Fast summary manga
- Balanced manga
- Premium manga with character assets

Do not overload the user with V2/V4 terminology.

### 14.2 Progress tracker

Current progress messages should become:

```text
Analyzing document
Extracting source facts
Planning adaptation
Designing characters
Writing manga script
Creating storyboards
Rendering pages
Checking quality
Complete
```

### 14.3 Debug/admin view

Add a developer/debug view for a generated summary:

- fact registry,
- adaptation plan,
- character bible,
- script,
- storyboard,
- quality report.

This will make iteration 10x easier. Otherwise we’re debugging “manga bad” like cavemen inspecting smoke signals.

---

## 15. Suggested PR sequence

### PR 1 — test hygiene and V4 default

- Fix stale `app.panel_templates` test issue.
- Make V4 default frontend/backend.
- Rename UI labels.
- Add V4 smoke test.

### PR 2 — fact registry

- Add `manga_adaptation/types.py`.
- Add `fact_registry.py`.
- Add tests.
- Store `fact_registry` on summary.

### PR 3 — adaptation plan

- Add `adaptation_plan.py`.
- Integrate after document understanding.
- Store plan on summary.
- Add fallback.

### PR 4 — character bible v2

- Add `character_bible.py`.
- Replace/augment current blueprint character output.
- Add visual constraints and IDs.
- Store `character_world_bible`.

### PR 5 — script writer

- Add `script_writer.py`.
- Generate `MangaScript` from beat/plan/facts.
- Add dialogue coherence tests.

### PR 6 — storyboarder

- Add `storyboarder.py`.
- Generate `StoryboardPage[]`.
- Add visual variety tests.

### PR 7 — V4 schema/storyboard conversion

- Extend backend/frontend V4 types.
- Add `storyboard_to_v4.py`.
- Preserve script dialogue exactly.

### PR 8 — quality gate

- Add `quality_gate.py`.
- Run gates after script/storyboard.
- Store `quality_report`.
- Add repair loop skeleton.

### PR 9 — character asset MVP

- Add asset generation/caching.
- Render assets in V4 dialogue panels.
- Add fallback if asset missing.

### PR 10 — frontend manga polish

- Better page layouts.
- Character portraits.
- SFX.
- Bubble fitting.
- Debug overlay.

---

## 16. Concrete acceptance criteria for “better manga”

A generated manga should pass these checks:

### Story

- Has logline.
- Has protagonist goal and obstacle.
- Has beginning/development/reframe/resolution.
- Each scene has a goal and payoff.

### Source fidelity

- 90%+ high-priority facts covered.
- 100% must-appear facts covered unless impossible.
- No exact fake quotes.
- No invented real-world events.

### Dialogue

- Average bubble under 90 chars.
- No repeated dialogue lines.
- Characters have distinct voices.
- Dialogue advances understanding.

### Visual manga quality

- Shot types vary.
- Page layouts vary.
- At least one close-up per emotional beat.
- Data panels used for numbers.
- Splash pages reserved for major moments.

### Character consistency

- Every major character has visual constraints.
- Every rendered character references a known ID.
- Generated assets reused across pages.

### UX/accessibility

- Text readable on mobile/desktop.
- WCAG 2.2 AA contrast.
- Keyboard page navigation.
- Aria labels describe panel content.

---

## 17. Biggest risks

### Risk 1: Too many LLM calls

Mitigation:

- Use deterministic transformations where possible.
- Make V4 conversion deterministic.
- Use repair prompts only for failed sections.

### Risk 2: Over-engineering the schema

Mitigation:

- Start with dict fields.
- Promote to typed models after two iterations.
- Keep compatibility with current V4.

### Risk 3: Character image inconsistency

Mitigation:

- Generate character sheet first.
- Use strict outfit/silhouette locks.
- Reuse assets rather than regenerating per panel.
- Use CSS fallback if assets fail.

### Risk 4: Faithfulness vs fun

Mitigation:

- Every factual claim cites fact IDs.
- Use symbolic scenes for dramatization.
- Do not fabricate source events.

### Risk 5: Frontend complexity

Mitigation:

- Make backend emit simple semantic fields.
- Add renderer features incrementally.
- Avoid pixel-perfect LLM output.

---

## 18. Incremental generation for large PDFs

This is a critical product requirement.

If a PDF is 100 pages and the user generates only the first slice, the manga must still feel like the beginning of a larger coherent story. Later, if the user asks for more, the next slice must continue the same story, characters, themes, and visual language. We cannot let every 10-page/10-chapter run become a fresh reboot.

### 18.1 Current behavior

Current large-doc flow:

- `frontend/components/LargePdfWarning.tsx` prompts for `Full Book`, `First 10 Chapters`, or `Custom Range`.
- `frontend/app/books/[id]/page.tsx` sends `chapterRange` to `startSummarization`.
- `backend/app/celery_worker.py` receives `chapter_range` and filters `book.chapters`.
- The orchestrator then generates a new summary/manga from only that filtered set.

Current code:

```python
if chapter_range and len(chapter_range) == 2:
    start_idx, end_idx = chapter_range
    all_chapters = [c for c in all_chapters if start_idx <= c.index <= end_idx]
```

This means the system currently understands only the selected range. It has running context within that range, but not a durable manga continuity memory across separate generations.

Also note: the UI says “First 10 Chapters”, while the product conversation often says “10 pages.” These are different things. A robust system needs `SourceSlice`, not just `chapter_range`.

### 18.2 Required behavior

For partial generation, the first slice should:

1. establish the manga title/logline,
2. introduce recurring characters,
3. establish the world/metaphor,
4. cover selected source pages/chapters,
5. intentionally leave unresolved threads if source remains,
6. end with a “To be continued” page/card,
7. store enough state so later slices continue seamlessly.

When the user asks for more, the next slice should:

1. load existing project state,
2. keep the same character bible and assets,
3. preserve prior facts and open threads,
4. summarize the prior manga for continuity,
5. ingest the new source slice,
6. merge new facts into the fact registry,
7. append new script/storyboard/pages,
8. resolve or evolve earlier threads,
9. avoid repeating the first slice except as a tiny recap.

### 18.3 Product framing: manga project, not one-off summary

A generated manga should become a persistent **Manga Project**.

```text
Book
  └── MangaProject(style/options)
        ├── global adaptation plan
        ├── global character/world bible
        ├── continuity ledger
        ├── source fact registry
        ├── generated assets
        ├── slice 1: pages 1-10 / chapters 0-2
        ├── slice 2: pages 11-20 / chapters 3-5
        └── slice N
```

A `BookSummary` is currently acting like the root output. For the revamp, we should introduce a clearer project model and keep `BookSummary` as compatibility if needed.

### 18.4 New concept: `SourceSlice`

Use a source range abstraction instead of only `chapter_range`.

```json
{
  "slice_id": "src_001",
  "book_id": "...",
  "mode": "pages | chapters | sections",
  "page_start": 1,
  "page_end": 10,
  "chapter_start": 0,
  "chapter_end": 2,
  "section_ids": [],
  "word_count": 5300,
  "is_partial_chapter_start": false,
  "is_partial_chapter_end": true
}
```

Why this matters:

- “10 pages” and “10 chapters” are not equivalent.
- Some PDFs have huge chapters.
- A slice may start/end in the middle of a chapter.
- Continuity should follow source order, not UI convenience.

### 18.5 New concept: `ContinuityLedger`

This is the memory that prevents manga amnesia.

```json
{
  "project_id": "...",
  "covered_source_ranges": [
    { "page_start": 1, "page_end": 10, "chapter_start": 0, "chapter_end": 1 }
  ],
  "current_story_state": {
    "protagonist_state": "Kai understands the basic problem but has not seen the hidden tradeoff.",
    "emotional_position": "curious → unsettled",
    "knowledge_state": "Reader knows facts f001-f006.",
    "world_state": "The archive door is open; the second chamber remains locked."
  },
  "open_threads": [
    {
      "thread_id": "t001",
      "question": "Why does the simple solution fail at scale?",
      "introduced_in_slice": "slice_001",
      "related_fact_ids": ["f003"],
      "status": "open"
    }
  ],
  "resolved_threads": [],
  "character_state": {
    "kai": {
      "arc_position": "confident but challenged",
      "known_facts": ["f001", "f002"],
      "visual_changes_allowed": []
    }
  },
  "recap_for_next_slice": "Kai entered the archive, learned the core thesis, and saw the first contradiction. The next chamber promises the cause.",
  "last_page_hook": "But the numbers were only the shadow. The source was deeper."
}
```

The ledger must be updated after every slice.

### 18.6 New concept: `MangaSlice`

Each partial generation is one slice/episode/volume segment.

```json
{
  "slice_id": "slice_002",
  "project_id": "...",
  "source_slice": { "page_start": 11, "page_end": 20 },
  "status": "complete",
  "slice_role": "continuation",
  "input_continuity_version": 1,
  "output_continuity_version": 2,
  "canonical_chapters": [],
  "new_fact_ids": ["f007", "f008"],
  "script_scene_ids": ["s006", "s007"],
  "storyboard_page_ids": ["pg012", "pg013"],
  "v4_page_ids": ["v4_pg012", "v4_pg013"],
  "quality_report": {}
}
```

Slice roles:

- `opening`: first generated slice.
- `continuation`: middle slice.
- `finale`: slice that reaches source end.
- `standalone`: user intentionally generated only a selected excerpt.

### 18.7 First partial slice behavior

If the user generates only the beginning of a large PDF:

```text
1. Build project-level manga identity.
2. Build initial fact registry from selected slice.
3. If cheap metadata for full book exists, build a rough source map from titles/page ranges.
4. Create opening beat sheet.
5. End with open thread + To Be Continued.
6. Store continuity ledger.
```

The ending should not pretend the whole book is complete.

Recommended final page types:

- `transition` page with “To be continued”
- unresolved question
- next source range CTA

Example:

```json
{
  "type": "transition",
  "title": "To be continued...",
  "narration": "The first door opened. The real mechanism waits in the next pages.",
  "page_turn_hook": "Continue with pages 11-20"
}
```

### 18.8 Extension behavior

When user clicks “Generate more”:

```text
1. Find existing MangaProject for book/style.
2. Load continuity ledger, bible, assets, fact registry.
3. Determine next unprocessed SourceSlice.
4. Summarize new source slice with prior continuity context.
5. Merge new facts into registry.
6. Update beat sheet for continuation.
7. Write continuation script.
8. Storyboard continuation pages.
9. Render new V4 pages.
10. Append pages to project.
11. Update continuity ledger.
```

Important: do not regenerate previous pages by default. Append.

Regeneration should be explicit:

- “Regenerate this slice”
- “Rebuild full manga with all generated source”
- “Replan from beginning”

### 18.9 Continuity context prompt

For continuation summaries/scripts, pass compact continuity context:

```text
MANGA CONTINUITY SO FAR:
Title: ...
Logline: ...
Characters:
- Kai: visual lock, speech style, current arc state
- Mentor: ...
World/motifs: ...
Covered source: pages 1-10, chapters 0-1
Reader already knows: f001, f002, f003
Open threads:
- Why does X fail at scale?
Last manga moment:
- Kai saw the first contradiction glowing behind the archive door.
Do not repeat previous exposition except as a 1-panel recap if needed.
Continue from this state.
```

This is much cheaper and more coherent than feeding all prior raw pages.

### 18.10 Fact registry merge

When adding a slice:

```text
new source facts → normalize/dedupe → merge into project fact registry
```

Rules:

- Existing fact IDs remain stable.
- New facts get new IDs.
- If a new fact refines an old fact, link it:
  - `extends_fact_id`
  - `contrasts_with_fact_id`
  - `resolves_thread_id`

Example:

```json
{
  "fact_id": "f019",
  "text": "The later chapter explains the earlier contradiction as a scaling issue.",
  "source_slice_id": "slice_002",
  "extends_fact_id": "f003",
  "resolves_thread_id": "t001"
}
```

### 18.11 Story arc across slices

Do not make every slice follow the same mini-arc mechanically. The project needs both:

1. local slice arc,
2. global manga arc.

Project-level structure:

```text
Slice 1: setup / first mystery
Slice 2: development / deeper mechanism
Slice 3: twist / contradiction or tradeoff
Slice 4: synthesis / application
Final slice: resolution / complete gist
```

For unknown total length or on-demand continuation, use elastic structure:

```text
opening → expandable middle episodes → finale when source end reached
```

### 18.12 “To be continued” rules

Add “To be continued” only when:

- source remains unprocessed,
- the user generated a partial range,
- and the slice is not marked standalone.

Do not add it for:

- full-book generation,
- user-selected excerpt where they asked for only that excerpt,
- final slice.

### 18.13 Recap rules for continuation

When generating slice 2+, include a short recap page only if needed.

Recap max:

- 1 page,
- 1-2 panels,
- no more than 3 prior facts,
- must point directly into new content.

Bad recap:

> “Previously, everything from chapter 1 happened again.”

Good recap:

> “Kai had found the first contradiction. Now the next pages reveal why it exists.”

### 18.14 UI for continuation

Book page should show manga project coverage:

```text
Manga generated: pages 1-10 of 100
[Read manga] [Generate next 10 pages] [Choose next range] [Rebuild full]
```

Reader end page should show:

```text
To be continued
Continue with pages 11-20
```

Also show:

- current coverage,
- generated slices,
- quality status per slice,
- whether assets/bible are reused.

### 18.15 API additions

Recommended endpoints:

```text
POST /api/books/{book_id}/manga-projects
GET  /api/manga-projects/{project_id}
POST /api/manga-projects/{project_id}/generate-slice
POST /api/manga-projects/{project_id}/extend
GET  /api/manga-projects/{project_id}/pages?cursor=...
GET  /api/manga-projects/{project_id}/continuity
POST /api/manga-projects/{project_id}/rebuild
```

Compatibility endpoint can continue to return old `BookSummary` shape while UI migrates.

### 18.16 Data model additions for incremental manga

New collections/documents:

```python
class MangaProject(Document):
    book_id: Indexed(str)
    style: str
    engine: str = "v4"
    title: str
    status: str
    project_options: dict = {}
    adaptation_plan: dict = {}
    character_world_bible: dict = {}
    fact_registry: list[dict] = []
    continuity_ledger: dict = {}
    coverage: dict = {}
    active_version: int = 1
    created_at: datetime
    updated_at: datetime
```

```python
class MangaSlice(Document):
    project_id: Indexed(str)
    book_id: Indexed(str)
    source_slice: dict
    slice_index: int
    slice_role: str
    status: str
    canonical_summaries: list[dict] = []
    beat_sheet_fragment: dict = {}
    manga_script_fragment: dict = {}
    storyboard_pages: list[dict] = []
    quality_report: dict = {}
    created_at: datetime
    updated_at: datetime
```

```python
class MangaPageDoc(Document):
    project_id: Indexed(str)
    slice_id: Indexed(str)
    page_index: int
    source_range: dict
    v4_page: dict
    created_at: datetime
```

```python
class MangaAssetDoc(Document):
    project_id: Indexed(str)
    character_id: str
    asset_type: str
    expression: str = ""
    image_path: str
    prompt: str
    model: str
    created_at: datetime
```

We can keep `BookSummary` as a compatibility adapter for old readers during migration.

---

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
