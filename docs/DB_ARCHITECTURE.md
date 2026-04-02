# Database Architecture — Senior Engineer Analysis

> **Status**: Analysis complete, Phase 1 shipped  
> **Date**: 2026-04-02  
> **Context**: BookSummary document was 248KB for a 3-page PDF

---

## The Problem: God Document Anti-Pattern

The original `BookSummary` collection stored EVERYTHING in ONE document:

```
booksummary (one document = 248 KB for 42 panels)
├── _id, book_id, style, status, model      ~200 bytes   (metadata)
├── canonical_chapters[10]                   15 KB        (chapter summaries)
├── manga_bible                              5 KB         (visual consistency)
├── manga_chapters[]                         0 KB         (legacy, dead)
├── living_panels[42]                        108 KB  ← 42% OF THE DOC
├── reels[]                                  0 KB         (not generated yet)
└── cost/status tracking                     ~200 bytes
```

This is the MongoDB equivalent of a **God Class** in OOP. One document
tries to be everything: the book metadata, the AI pipeline outputs,
the rendering instructions, AND the job status tracker.

---

## Why It Matters (Not Just Theoretical)

### 1. Every API call loads the full blob

```
ENDPOINT                             ACTUALLY NEEDS           LOADS     WASTE
GET  /summary/{id}                   status, style            248 KB    99%
GET  /books/{id}/summaries           canonical_chapters       248 KB    94%
GET  /summary/{id}/all-living-panels living_panels            248 KB    57%
POST .../generate                    manga_bible, model       248 KB    98%
DELETE /summaries/{id}               status                   248 KB    99%
```

Only ONE endpoint reads `living_panels`. Every other endpoint loads
108KB of panel data it never touches. At 200 panels (real book),
that's 500KB wasted per status check.

### 2. Document size projections

```
Book Type                Panels    Panel Data    Total Doc    % of 16MB
3-page resume (today)       42       105 KB       248 KB        1.5%
Medium book (300pg)        200       502 KB       644 KB        3.9%
Long book (500pg)          400     1,004 KB     1,146 KB        7.0%
Epic novel (1200pg)       1000     2,509 KB     2,651 KB       16.2%
```

Won't hit 16MB any time soon, but 2.6MB documents are BAD for:
- Network bandwidth (every API call ships the full doc)
- MongoDB WiredTiger cache (each doc version cached in full)
- Write amplification (changing 1 panel rewrites 2.6MB)

### 3. Write pattern mismatch

- **Panels are generated one-by-one** (parallel workers, each produces 1 panel)
- **But stored as one big array** (need to load full doc → append → save)
- **Race condition risk**: two workers finishing simultaneously can overwrite
  each other's results in the array

---

## The MongoDB Embedding Rule

> **Embed what you read together. Separate what you read independently.**

This is the ONLY rule that matters for MongoDB schema design.
Forget normalization theory from SQL — MongoDB rewards denormalization
when the access patterns align.

Applying this rule:

| Field | Read with summary? | Read independently? | Verdict |
|-------|-------------------|--------------------|---------|
| `canonical_chapters` | ✅ Always | ❌ Never alone | **Embed** |
| `manga_bible` | ✅ Always | ❌ Never alone | **Embed** |
| `reels` | ✅ Mostly | ⚠️ Feed endpoint | **Embed** (small) |
| `living_panels` | ❌ Rarely | ✅ Own endpoint | **Separate** |
| `manga_chapters` | ❌ Legacy dead | ❌ Dead | **Remove** |

---

## The Fix (Shipped)

### Phase 1: Move living_panels to own collection ✅

```
COLLECTION: book_summaries          COLLECTION: living_panels
┌────────────────────────────┐      ┌──────────────────────────────┐
│ _id                        │      │ _id                          │
│ book_id                    │      │ summary_id  ← FK             │
│ style                      │      │ panel_id    "ch0-pg0-p0"     │
│ canonical_chapters[10]     │      │ panel_index  0               │
│ manga_bible {}             │      │ dsl {}       (2.5KB avg)     │
│ panel_count: 42            │      │ content_type "splash"        │
│ reels[]                    │      │ chapter_index  0             │
│ model, status, cost...     │      │ created_at                   │
│                            │      ├──────────────────────────────┤
│ ~142 KB (constant)         │      │ Index: (summary_id, panel_index)
└────────────────────────────┘      │ ~2.5 KB per doc (scales linearly)
                                    └──────────────────────────────┘
```

Benefits:
- BookSummary stays at ~142KB regardless of panel count
- Panels load via range query: `find({summary_id}).sort(panel_index)`
- Individual panel regeneration: update ONE 2.5KB doc, not the whole blob
- No 16MB ceiling concern ever
- Pagination: `skip(20).limit(10)` for lazy loading
- Concurrent writes: each worker inserts its own doc, no race conditions

### What stays embedded (and why that's correct)

**canonical_chapters (15KB)**: Always read when you load a summary.
Never read alone. Same lifecycle — generated once, never updated individually.
Embedding is correct. Even at 50 chapters (75KB), it's fine.

**manga_bible (5KB)**: Immutable per generation run. Always needed for
consistency checks. Tiny. Embedding is correct.

**reels (currently 0, will be ~20KB)**: Read together with summary for
the feed. Could be separated later if the feed grows huge, but for now
embedding is correct (YAGNI).

---

## What a Bad Engineer Would Do Here

1. **Over-normalize everything into 8 collections**
   (canonical_chapters, manga_bibles, characters, motifs, reels, panels...)
   This is SQL brain. MongoDB JOIN ($lookup) is expensive and fragile.
   You'd turn 1 read into 5 reads. Worse performance, more failure modes.

2. **Use GridFS for the panel data**
   GridFS is for binary blobs (images, PDFs). Using it for structured
   JSON is an anti-pattern — you lose queryability.

3. **Keep everything embedded but add MongoDB projections**
   Projections (`{living_panels: 0}`) work but are band-aids.
   Beanie ODM makes projections awkward. And you still store 2.6MB docs
   that waste WiredTiger cache and cause write amplification.

---

## Future Phases (If/When Needed)

### Phase 2: Projection-based reads (optional)
Add `.find({}, {canonical_chapters: 0})` for endpoints that don't
need chapters. Saves 15KB per status-check read. Low priority.

### Phase 3: Separate reels (only if feed scales)
If the `/reels` feed endpoint starts aggregating across 1000+ books,
move reels to their own collection for efficient cross-book queries.
Not needed until then.

### Phase 4: TTL indexes for JobStatus
JobStatus docs accumulate forever. Add TTL index to auto-expire
completed jobs after 7 days.

---

## TL;DR

- **The old design was a God Document** — 42% of the doc was panel data
  that only 1 out of 8 endpoints ever read
- **The fix**: panels in their own collection, everything else stays embedded
- **The rule**: embed what you read together, separate what you read alone
- **Don't over-normalize** — MongoDB isn't PostgreSQL, JOINs are expensive
- **The remaining schema is clean** — canonical_chapters and manga_bible
  SHOULD be embedded because they're always read with the summary
