# MangaPlan v1

Submit one JSON object through `submit_manga_plan` with exactly these fields. Do
not add fields. Copy identity values from the ContextPack; never create alternate
project, scope, context-pack, memory, source-unit, book, or hash values.

- `schema_version`: exactly `manga-plan.v1`.
- `plan_id`: a stable identifier using letters, digits, underscore, hyphen, or
  period; derive it from the existing scope ID.
- `project_id`, `scope_id`, `context_pack_id`, `memory_version`: exact ContextPack
  values.
- `title`: non-empty, at most 500 characters.
- `summary`: non-empty, at most 20,000 characters.
- `target_page_count`: integer from 1 through the number of beats, and no greater
  than the goal's `max_pages`.
- `beats`: 1-1000 beat objects in source order. Their `sequence` values must be
  the contiguous integers starting at zero and `beat_id` values must be unique.
- `character_state_updates`, `terminology_updates`, `new_facts`, and
  `unresolved_thread_updates`: use empty arrays unless the supplied source and
  continuity support a durable update.
- `ending_state`: non-empty grounded description of the state after the final
  beat.

Each beat object has exactly:

- `beat_id`: unique stable identifier.
- `sequence`: zero-based contiguous integer.
- `source_refs`: 1-128 exact source-reference objects copied from the ContextPack.
  Across all beats, every ContextPack source unit must appear at least once,
  except for the explicitly bounded full-book hackathon edition below.
- `required_fact_ids`: only fact IDs present in `book_canon.facts`.
- `narrative_purpose`: one of `hook`, `setup`, `conflict`, `explanation`,
  `reveal`, `payoff`, `cliffhanger`.
- `book_essence`: non-empty grounded prose.
- `dramatization`: non-empty visual dramatization that does not change facts.
- `character_intent`: zero or more objects with exactly `character_id`, `intent`,
  and `emotional_state`. Use only characters present in supplied continuity; if
  none are supplied, use an empty array instead of inventing characters.
- `visual_intent`: 1-64 short visual descriptions, never code.
- `must_preserve`: 1-128 non-empty grounded claims.
- `may_compress`: zero or more non-empty grounded claims.
- `confidence`: number from 0 through 1.

An exact source-reference object has `book_id`, `source_unit_id`, `page_start`,
`page_end`, `start_offset`, `end_offset`, `quote`, and `text_hash`. Copy it as
provided, including null optional values. Never paraphrase `quote` or alter the
hash. Do not use free-form source citations.

Optional durable updates, when evidence supports them, use these exact shapes:

- Character state: `character_id`, non-empty `state_patch` object, and
  `source_refs` array.
- Terminology: `term`, `canonical_form`, `meaning`, and non-empty `source_refs`.
- New fact: `fact_id`, `claim`, non-empty `source_refs`, and `confidence` from 0
  through 1.
- Thread: `thread_id`, `summary`, `status` (`open`, `resolved`, or `deferred`), and
  `source_refs`.

Before submission, check all identities, allowed enum values, sequence order,
unique IDs, source hashes, required fact IDs, and the source-coverage rule for
the requested edition shape. The submitted JSON is the artifact candidate; do
not wrap it in prose.

## Bounded vertical-slice shape

When the typed goal asks for the two-page Phase 1 vertical slice and the
ContextPack contains three source units, prefer the smallest valid plan:

- set `target_page_count` to exactly `2`;
- create exactly three beats, with sequences `0`, `1`, and `2`;
- ground each beat in one corresponding ContextPack source unit, in source
  order, so all three selected units are covered;
- use empty arrays for `required_fact_ids`, character intent, and every durable
  update when the ContextPack provides no canon facts or characters;
- copy each complete `source_ref` object exactly from the ContextPack, including
  its null `start_offset`, `end_offset`, and `quote` values;
- keep every identifier under 160 characters and every short text field under
  500 characters.

Do not expand this bounded shape merely because the source could support more
beats. If a submission fails, repair the exact broker error while preserving
the identities and three-source coverage; do not replace a contract error with
a source-conflict report.

## Full-book hackathon edition

When the typed goal asks for the full-book hackathon edition:

- set `target_page_count` to exactly `10`;
- create exactly twenty beats in source order, two beats per final page;
- cover every major table-of-contents section from Opening through Saying Yes;
- cite exactly one complete representative source reference per beat, using
  twenty distinct ContextPack units in page order that span the beginning
  through the end of the book;
- do not copy all ContextPack sources into the plan: the accepted ContextPack
  remains the immutable parent and preserves complete full-source lineage;
- keep `character_intent` empty when the ContextPack provides no canonical
  characters; the deterministic art stage introduces its recurring narrator;
- keep every factual claim grounded in the representative source cited by its
  beat;
- end with a practical synthesis of choosing a clear hell-yes commitment.
