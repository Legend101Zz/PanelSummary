# Detailed Implementation Plan

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
