# ADR-008: Worker isolation, credentials, and egress

- Status: Accepted
- Date: 2026-07-19

## Decision

Backend, Celery, agent, and reel-render workers are separate trust boundaries.
The agent worker has model credentials but no Mongo or production repository
mount. The reel-render worker has read-only staged media and writable ephemeral
output but no LLM credentials. Internal calls require separate signed tokens.

Production images apply request limits, concurrency limits, least-privilege
credentials, and restricted egress appropriate to each worker.

## Consequences

- Compromise of a generated artifact does not grant general system access.
- Renderer execution remains deterministic and offline-capable.
- Secrets cannot be copied wholesale across services.
