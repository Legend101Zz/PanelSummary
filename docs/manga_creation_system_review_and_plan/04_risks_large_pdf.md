# Risks and Large-PDF Incremental Generation

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
