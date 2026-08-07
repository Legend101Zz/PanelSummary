# ADR-002: MongoDB is the durable authority

- Status: Accepted
- Date: 2026-07-19

## Decision

MongoDB stores project truth: source-unit metadata, frozen scopes, versioned
memory snapshots, artifact lineage, accepted manga, accepted reels, generation
runs, stage runs, budgets, continuity, and provenance. Large binaries live in
the configured media store and are referenced by immutable IDs and hashes.

Pi sessions are bounded working context. They are never the database and must
be reconstructible from persisted artifacts.

## Consequences

- Memory updates use optimistic version checks.
- Only validated artifacts may become active project pointers.
- Logs aid diagnosis but do not replace durable run state.
