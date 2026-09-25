# Architecture and Program Design

Design at three levels. Keep them distinct so the human can steer outcomes without reading implementation code.

## Product design

Define:

- User, problem, and desired outcome
- Supported ordinary journey
- Non-goals
- Chosen concept and rejected options
- Success and failure from the user's perspective
- Human decisions still open

## System architecture

Describe:

- Components and ownership boundaries
- Current authority and desired authority
- Data and control flows
- State, persistence, queues, caches, providers, and configuration
- Trust and failure boundaries
- Legacy, shadow, fallback, and rollback lanes
- Observability required to know what executed
- Mermaid component, sequence, and state diagrams where they clarify the system

Every architecture claim must be source-linked, human-selected, or clearly proposed.

## Program design

Program design explains how the architecture will become a change without writing implementation bodies. Include:

| Area | Required content |
|---|---|
| Participating surface | Expected modules, packages, services, routes, workers, stores, UI screens, and configuration |
| Contracts | Inputs, outputs, schemas, errors, versioning, idempotency, and compatibility |
| Call path | Entry to outcome, including asynchronous and alternate paths |
| State transitions | Created, queued, running, failed, resumed, completed, activated, retired |
| Failure behavior | Retries, timeouts, partial work, cleanup, rollback, and user-visible errors |
| Observability | Receipt fields, correlation IDs, logs, traces, metrics, artifact provenance |
| Test seams | Where deterministic, integration, runtime, API, browser, visual, and human evidence attach |
| Delivery boundaries | Allowed paths, dependencies, slice owner, stop condition, and excluded work |

Avoid line-level pseudocode unless a contract cannot be explained otherwise.

## Uncertainty analysis

For each material slice, record:

| Assumption or question | Type | Cost if false | Existing evidence | Smallest discriminator | Route | Exit criterion |
|---|---|---|---|---|---|---|

Valid routes include characterization, research, prototype, spike, tracer bullet, vertical slice, migration rehearsal, shadow run, canary, and defer-to-human.

A tracer bullet is not the default. Use it only for cross-boundary or runtime-path uncertainty. Make the minimum risky path real, fake or bypass the rest, label fakes, and state which production claims remain unproved.

## Proof designed with the system

Write proof obligations before implementation. For every important requirement include:

- Requirement
- Cheapest evidence that could falsify it
- Forbidden observation
- Required environment and data
- Evidence level
- Receipt fields
- Pass, fail, and inconclusive rules

Observability is part of architecture when proof depends on knowing which lane, configuration, stage, or artifact actually executed.

## Slice design

Each slice should have:

- One user or learning outcome
- One owner
- Explicit allowed and protected paths
- Dependencies and preconditions
- Route and reason
- Proof obligations
- Stop condition
- Evidence location
- Human review point, if needed

Prefer a small number of end-to-end slices over a large inventory of layer-only tasks. Do not create issues merely to simulate progress.

## Program approval

For major changes, stop after presenting the architecture, program design, uncertainty routes, and proof obligations. Ask the human to approve, revise, or reject. For a small local change, the user's explicit implementation request may serve as direction approval, but activation, destructive migration, and new architecture authority still require clear authorization.

