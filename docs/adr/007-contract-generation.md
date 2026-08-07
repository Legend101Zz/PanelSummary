# ADR-007: Pydantic-led contract generation

- Status: Accepted
- Date: 2026-07-19

## Decision

Pydantic 2 models in the Python control plane are canonical. A deterministic
export produces JSON Schema under `packages/contracts/schema`. TypeScript types
are generated from those schemas and runtime validation uses Ajv.

Generated schema and TypeScript files are committed but never hand-edited.
Fixtures must pass both Python and TypeScript validators.

## Consequences

- Critical artifacts have one source of truth.
- Every artifact includes a schema version and stable discriminator.
- Unknown fields and unknown reel component variants fail validation.
