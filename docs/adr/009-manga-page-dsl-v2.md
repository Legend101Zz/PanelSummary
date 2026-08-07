# ADR-009: Hierarchical manga page DSL v2

- Status: Accepted
- Date: 2026-07-21

## Context

`rendered-page.v1` preserves source grounding and reader compatibility, but its
current producer collapses each adaptation beat into a full-page panel. It has
no durable page script, thumbnail/name, reading graph, text reservation, or
revision target. Better image generation cannot recover those missing editorial
decisions.

## Decision

ScrollStack will author manga page structure as canonical, versioned JSON backed
by strict Pydantic discriminated unions. A layout tree contains `panel`, `split`,
`overlay`, and guarded `freeform_panel` nodes. Creative agents may propose page
scripts, panel intent, text intent, and layout trees; they may not compile
geometry, approve their own output, invoke a renderer, or access arbitrary
files, URLs, provider credentials, or built-in Pi tools.

The Python control plane is the authoritative layout compiler for v2. It emits
normalized polygons, bounding boxes, SVG clip paths, adjacency, read ranks, and
a hash tied to an explicit layout-engine version. The first implementation
ships compiled geometry to consumers and does not duplicate angled-cut logic in
TypeScript. Deterministic SVG name previews use the same compiled geometry.

Authored page plans, compiled layouts, previews, validation reports, and
revision requests are immutable artifacts. Resume reconstructs work from those
accepted artifacts and stage checkpoints, never from a live agent conversation.
Every revision creates a successor and retains its parent lineage.

## Compatibility and migration

- Existing accepted `rendered-page.v1` artifacts and `manga-reader.v1` remain
  unchanged and continue through the legacy reader path.
- New v2 work uses additive schema versions, including `rendered-page.v2`; it
  does not mutate or reinterpret v1 pages.
- A single-panel v1 page is never automatically upgraded into an invented v2
  composition. Regeneration is an explicit new run with lineage to the old run.
- `MangaManifest` remains unchanged in this phase so the reel-owned seam is not
  widened without a reviewed consumer need and fixture.
- Provider image work is outside Phase 1. Page scripts, layouts, validation,
  and SVG previews must pass before any image budget can be authorized.

## Consequences

- Page rhythm, camera, eye path, lettering regions, and page-turn intent become
  inspectable and independently revisable before paid generation.
- Backend and frontend share a generated contract while Python owns the first
  authoritative compiler implementation.
- Compiler changes require a new engine version and updated golden vectors;
  they cannot silently alter accepted geometry.
- Resume remains deterministic even when a Pi session or worker process is
  gone.
