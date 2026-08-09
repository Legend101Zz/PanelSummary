# ADR-005: Artifact contract boundaries

- Status: Accepted
- Date: 2026-07-19

## Decision

`RenderedPage` is the only persisted manga-reader payload. `MangaManifest` is
the semantic handoff from accepted manga to the reel lane. `ReelSpec` is the
only generated reel input accepted by the component registry and renderer.

All three are versioned, source-grounded artifacts. Assets are referenced by
IDs, never model-provided paths or arbitrary URLs. Existing contract versions
remain readable until an explicit migration removes them.

## Consequences

- Reel generation never scrapes manga pixels or hidden agent context.
- Models do not generate frontend, Remotion, CSS, or shell code.
- Contract changes ship with regenerated schemas, types, and fixtures.
