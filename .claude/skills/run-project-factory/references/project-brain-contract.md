# Project Brain Contract

The Project Brain is a compact, versioned interface to current reality and approved intent. It is not a transcript archive and not a replacement for live evidence.

## Canonical layout

```text
.project-factory/
├── brain/
│   ├── NOW.md
│   ├── JOURNEYS.md
│   ├── DECISIONS.md
│   └── programs/<slug>/PROGRAM.md
├── memory/
│   ├── events.jsonl
│   └── current.json
├── evidence/<program-or-run>/
└── views/
    ├── index.html
    ├── architecture.html
    ├── program-design.html
    ├── assumptions.html
    ├── proof.html
    └── exploration/
```

## Authority

| Artifact | Authority and update rule |
|---|---|
| `NOW.md` | Generated from current source, configuration, git, and available runtime receipts. Replace through a recovery run, never casual editing. |
| `JOURNEYS.md` | Human-approved ordinary journeys, outcomes, observability, and proof obligations. Update deliberately. |
| `DECISIONS.md` | Append-only human decisions and supersession records. Never rewrite history. |
| `PROGRAM.md` | One human-reviewable change: intent, architecture, program design, routes, proof, slices, activation. |
| `events.jsonl` | Append-only operational memory. History, not current authority. |
| `current.json` | Generated projection of events. Never hand-edit. |
| `views/*.html` | Generated read-only views. Never treat as source of truth. |

Current source and runtime receipts outrank memory. Human-approved intent outranks inferred intent. A stale decision remains visible but is marked superseded.

## Event contract

Each event contains:

```json
{
  "schema_version": 1,
  "id": "evt-...",
  "timestamp": "UTC ISO-8601",
  "stage": "understand|decide|execute|prove|activate",
  "type": "observation|assumption|decision|work|evidence|falsification|gate|risk|invalidation",
  "status": "proposed|active|verified|invalidated|superseded|blocked|complete|inconclusive|skipped",
  "summary": "compact claim or outcome",
  "subject_id": "stable identifier for assumption updates",
  "program": "optional program slug",
  "sources": [],
  "evidence": [],
  "confidence": "low|medium|high",
  "repo_sha": "optional",
  "config_identity": "optional",
  "actor": "human|agent|verifier|system"
}
```

Append a new event to update an assumption. Reuse `subject_id`; do not edit the prior line. The generated projection selects the latest event for each stable subject.

## Promotion rules

Promote information into durable truth only when it earns the authority:

- Session observation to event: material and source-linked.
- Event to `NOW.md`: current and regenerated from source/runtime evidence.
- Proposal to `DECISIONS.md`: chosen by the human.
- Research to shared knowledge: reused across projects and still current.
- Evidence to proof: tied to exact SHA, configuration, environment, and journey.

Do not store secrets, credentials, raw prompts, full agent transcripts, copied source trees, or huge web dumps.

## Drift and invalidation

Regenerate `NOW.md` when code, configuration, deployed identity, or journey evidence changes materially. Append invalidation when a prior assumption or decision no longer holds. Keep the old record for causality.

## WIP rule

Prefer one active program and one active implementation slice. Multiple active programs require a recorded human choice and explicit resource boundaries.

