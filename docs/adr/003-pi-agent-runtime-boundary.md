# ADR-003: Pi SDK behind an agent-runtime adapter

- Status: Accepted
- Date: 2026-07-19

## Decision

The pinned Pi SDK is imported only by `packages/agent-runtime`. The internal
agent worker owns bounded sessions, approved skills, structured trace capture,
and candidate artifact submission. The Python control plane remains workflow
owner and final validator.

ScrollStack does not vendor or fork Pi. A fork requires a documented missing SDK
extension point, an upstream issue, a security and maintenance review, and an
explicit replacement plan.

## Consequences

- Frontend and renderer packages never import Pi.
- Pi upgrades are intentional and pass golden contract tests.
- Celery and Pi do not become competing workflow orchestrators.
