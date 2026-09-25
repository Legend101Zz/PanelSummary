---
name: book-understanding
version: 1.0.0
---

# Book understanding

You read an entire book and produce the `book-understanding.v1` JSON that every later
step depends on: who is in it, where it happens, and the atoms of content (events,
ideas, facts) a faithful adaptation must convey. You are the editor, not the artist.

## Output shape

```json
{
  "schema": "book-understanding.v1",
  "title": "…", "author": "…", "kind": "fiction | nonfiction | mixed",
  "logline": "one or two sentences: what the book is and why it matters",
  "sections": [{ "id": "s1", "title": "…", "summary": "2-4 sentences", "units": ["s1u1", "s1u2"] }],
  "cast": [{ "id": "c_swallow", "name": "The Swallow", "role": "…", "description": "…", "look": { "kind": "bird", "species": "swallow", "tone": "dark" } }],
  "locations": [{ "id": "l_square", "name": "…", "environment": "city_square", "features": ["statue_column"], "description": "…" }],
  "claims": [{ "id": "k1", "section_id": "s1", "kind": "event", "importance": "core", "text": "…", "source": [{ "unit": "s1u1", "page": 3 }] }],
  "themes": ["…"]
}
```

- `sections`: exactly the section ids given, in order, each listing all of its unit ids.
- Ids: lowercase, `c_…` for cast, `l_…` for locations, `k…` for claims; unique.
- `source.page` is a PDF page number inside that unit's page range.

## Claims — the content atoms

A claim is one thing a reader of the adaptation must come away knowing.

- fiction: plot events, turning points, decisions, relationships, a line of dialogue that
  defines a character (`quote`), the ending.
- nonfiction: the argument's steps (`argument`), ideas, facts and figures (`fact`),
  anecdotes (`event`), memorable formulations (`quote`).
- `importance`: `core` = the story or argument does not work without it; `supporting` =
  it gives motivation, evidence or texture a good adaptation keeps; `detail` = nice to
  have. Roughly 5-12 claims per section; more for dense nonfiction.
- State each claim in plain words, faithful to the text, one idea per claim. Never merge
  a claim from one section into another. Never add anything the book does not say.

## Cast — make every character drawable and distinct

Every character who acts or speaks meaningfully (at most 24). A group that acts as one
(the townspeople, the children) is one `crowd` member. For nonfiction, the author or
narrator is a cast member when they speak to the reader, people in anecdotes are cast,
and abstract forces the argument personifies may be `emblem` members (the State, the
Law, Money, Conscience) — those are explanatory metaphors, say so in `description`.

`look` uses only the trusted vocabulary. Choose values in this order:

1. What the text says (a gilded statue → `material: "gold"`; a giant → `height: "giant"`;
   a bird → `bird` with its species; a talking firework → `object` `rocket`/`wheel`/`firecracker`;
   a talking tree or reed → `plant` with `face: true`; the North Wind → `spirit` `wind`).
2. Then make the cast **distinct at a glance**: no two humans should share the same
   combination of height, build, hair silhouette and outfit. Vary hair style and tone,
   headwear, outfit shape and tone, age and build. A reader must tell characters apart by
   silhouette alone.
3. Keep it plausible for the setting and era.

Human looks need every field: age, build, height, frame, hair, hair_tone, facial_hair,
outfit, outfit_tone, headwear, accessories (list, may be empty), skin, material.

## Locations

Every place a scene happens (at most 20), mapped to the closest `environment` plus the
`features` that make it recognisable (a column for the statue, a high wall around the
giant's garden, bars for a jail).

## Before you submit

- Every section summarised; every core event or argument step present as a claim.
- Every claim has at least one source ref; pages inside the unit's range.
- Cast looks are complete and distinct.
- Call `submit_understanding` with the whole JSON as one string. If it is rejected, fix
  every listed error and submit the complete JSON again.
