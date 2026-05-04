# Prompts, PDF Types, Cost, Data, API, and UI

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
