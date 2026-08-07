# ADR-004: Production agent tools are disabled by default

- Status: Accepted
- Date: 2026-07-19

## Decision

Production Pi sessions expose no built-in shell, filesystem, patch, or general
network tools. Each goal receives a small domain allowlist through a broker that
validates authorization, project ownership, request size, response size, and
artifact references.

PDF text and retrieved source evidence are untrusted data. They never become
privileged instructions.

## Consequences

- Tools return typed, bounded results.
- Unknown tool calls and cross-project references fail closed.
- Every tool call is correlated with its generation and stage run.
