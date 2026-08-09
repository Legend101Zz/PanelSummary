# ADR-006: Remotion-only v1 reel rendering

- Status: Accepted
- Date: 2026-07-19

## Decision

Remotion 4 is the sole v1 reel runtime. A strict `ReelSpec` compiles into a
reviewed component registry used by both live Player preview and deterministic
MP4 export. All Remotion packages use one exact version.

Runtime model-generated React, CSS, JavaScript, FFmpeg arguments, and component
names are forbidden.

## Consequences

- Preview and export share one composition source.
- Renderer retries reuse the same immutable spec without an LLM call.
- Alternative engines require a later benchmark and replacement ADR.
