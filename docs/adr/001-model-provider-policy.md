# ADR-001: Model and provider policy

- Status: Accepted
- Date: 2026-07-19

## Decision

Model selection is configuration expressed through a purpose-specific policy.
The hackathon agentic path uses the event-required OpenAI model. OpenRouter is
restricted to image generation. Every accepted artifact stores a model receipt
with provider, model, prompt and skill versions, inputs, attempt, latency, token
usage when available, and cost when available.

Provider fallback is never silent. A failed provider operation is retried under
the same idempotency key or surfaced. Character assets in one visual set remain
on the same accepted image model.

## Consequences

- Provider credentials are injected only into the service that needs them.
- Provider and model names never become domain-model assumptions.
- Text, vision, image, and optional audio policies may be changed separately.
