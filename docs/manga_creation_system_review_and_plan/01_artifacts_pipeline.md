# Canonical Artifacts and Pipeline Design

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
