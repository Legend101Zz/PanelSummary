---
name: run-project-factory
description: Recovers codebase reality, explores product options, creates human-reviewable architecture and program design, routes uncertainty to the smallest useful learning action, coordinates bounded implementation, and proves real user outcomes with durable project memory and HTML control-room views. Use for unfamiliar or agent-built codebases, architecture recovery, product exploration, feature planning, migrations, legacy cutovers, multi-session delivery, proof obligations, or when the user needs to understand and steer a large software project before or during coding. Do not use for a trivial one-step edit with no architectural, product, or runtime uncertainty.
---

# Run Project Factory

Turn an opaque project into a controlled loop:

`UNDERSTAND -> DECIDE -> EXECUTE -> PROVE -> ACTIVATE -> UPDATE TRUTH`

The sequence is a map, not a conveyor belt. Make the important questions mandatory; make activities conditional.

## Operating contract

1. Preserve the user's scope, repository instructions, existing work, and authorization boundaries.
2. Distinguish source evidence, code-resolved behavior, observed runtime behavior, and human intent. Never call source inspection a runtime observation.
3. Keep one canonical project brain under `.project-factory/`. Treat generated HTML as a view, never as a second authority.
4. Record material assumptions, decisions, evidence, invalidations, and skipped-stage reasons. Do not store secrets, full transcripts, or undigested research.
5. Stop for a human decision when direction, architecture authority, destructive migration, production activation, or legacy retirement remains genuinely ambiguous.
6. Do not start production implementation from exploration artifacts. Require a recorded human choice first.
7. Do not claim independent verification when only self-review was possible. Report the actual independence level.
8. Never mark a claim passed without evidence. Use `inconclusive` when proof is unavailable.

## Start or resume

Locate this skill directory, then initialize the project-local control plane if absent:

```bash
python3 <skill-dir>/scripts/project_factory.py init --root . --project-name "<name>"
```

If `.project-factory/` exists, read these before acting:

1. `.project-factory/brain/NOW.md`
2. `.project-factory/brain/JOURNEYS.md`
3. `.project-factory/brain/DECISIONS.md`
4. The active `.project-factory/brain/programs/<slug>/PROGRAM.md`, if any
5. `.project-factory/memory/current.json`

Run `status` and validate existing state before creating new artifacts:

```bash
python3 <skill-dir>/scripts/project_factory.py status --root .
python3 <skill-dir>/scripts/project_factory.py validate --root .
```

Preserve completed work. Do not recreate a program merely because a new session began.

## Route every transition

Before entering a major activity, answer and record:

1. What decision will this activity enable?
2. What evidence already answers that question?
3. What material risk appears if it is skipped?
4. What is the smallest action that reduces the uncertainty enough?
5. Is the route `run`, `skip`, `loop`, or `defer`, and why?

Read [gate-routing.md](references/gate-routing.md) whenever choosing between recovery, research, prototype, characterization, spike, tracer bullet, vertical slice, rehearsal, shadow run, or activation.

## Choose the entry mode

- **Defined outcome:** the desired user outcome is clear. Recover only the relevant reality, research targeted uncertainties, then design the change.
- **Exploration:** the problem matters but the right product direction is unclear. Research and prototype several options; stop at a human choice.
- **Small local change:** impact is narrow and behavior is well understood. Use a compact route record and direct vertical slice; do not manufacture a large program.
- **Recovery only:** the user wants explanation, audit, or diagnosis. Produce truth and evidence without implementing a fix.

Record the chosen mode and why. If the mode would materially change user intent, ask one focused question; otherwise proceed with a stated assumption.

## Understand

For unfamiliar, agent-built, migrated, or disputed systems, read [reality-recovery.md](references/reality-recovery.md) completely and recover current authority before proposing architecture. Generate `NOW.md`; do not hand-edit it as opinion.

Research is conditional. Read [research-exploration.md](references/research-exploration.md) when feasibility, market patterns, prior art, adoption choices, or UX direction are uncertain. Distill claims with citations and confidence. Keep the research journey out of the main context.

## Decide

After the human chooses a direction, create an active program:

```bash
python3 <skill-dir>/scripts/project_factory.py new-program --root . --slug "<slug>" --title "<title>" --entry-mode defined-outcome
```

Read [architecture-program-design.md](references/architecture-program-design.md) completely. Fill `PROGRAM.md` with:

- Product intent and non-goals
- Current and desired authority
- Chosen direction and rejected options
- System architecture, boundaries, data/control flows, and Mermaid diagrams
- Program design: participating modules, contracts, call paths, state, failure behavior, observability, and test seams, without implementation bodies
- Uncertainty analysis and route choice per risky slice
- Proof obligations and forbidden observations
- Bounded slices, activation, rollback, and legacy-retirement conditions
- Human gates and unresolved questions

Architecture approval does not imply a tracer bullet. Route by uncertainty first.

## Execute

Implement only when the current program and user authorization permit it.

- Unknown feasibility: run a disposable, time-boxed spike.
- Cross-boundary or runtime-path risk: run a tracer bullet using the minimum real parts needed to test the risky assumptions; fake or bypass the rest. Label every fake and never treat it as production proof.
- Well-known local behavior: implement a direct vertical slice.
- Unknown existing behavior: characterize or recover before changing it.
- UX ambiguity: create isolated interactive HTML prototypes and wait for human choice.
- Migration risk: rehearse on representative copied data.
- Cutover risk: use shadow, canary, or activation rehearsal with receipts.

Keep one implementation owner per slice, explicit allowed paths, bounded WIP, and a stop condition. Do not expand scope because workers are available.

## Prove and activate

Read [proof-and-activation.md](references/proof-and-activation.md) completely before declaring a slice complete.

Give a separate verifier the approved program, proof obligations, base, diff, and environment, but not the implementer's reasoning transcript. Ask the verifier to falsify the claim. If a separate verifier is unavailable, perform and label `self_review`.

Run the ordinary product journey at the evidence level required by the claim. Capture a receipt tying outcome to code SHA, resolved configuration, lane/path, stages, artifact, fallback, and evidence links. A passing build is not runtime proof.

Activation remains a human decision. A legacy path is complete only when deleted, explicitly isolated for rollback, or intentionally retained with owner and retirement condition.

## Update memory and views

Append a compact event after every material assumption, decision, evidence result, invalidation, gate, or completed slice:

```bash
python3 <skill-dir>/scripts/project_factory.py event --root . \
  --stage understand --type assumption --status proposed \
  --summary "<claim>" --subject-id "<stable-id>" \
  --source "<file, URL, command, or receipt>" --confidence medium
```

Update an assumption by appending a new event with the same `--subject-id` and a new status. Never rewrite its history.

After material changes, regenerate and validate:

```bash
python3 <skill-dir>/scripts/project_factory.py render --root .
python3 <skill-dir>/scripts/project_factory.py validate --root .
```

Open `.project-factory/views/index.html` for the read-only Kanban-style control room. Read [project-brain-contract.md](references/project-brain-contract.md) for authority and memory rules, and [control-room-design.md](references/control-room-design.md) before creating additional architecture, program-design, proof, or exploration HTML.

## Human handoff

Lead with current truth, then state:

- What is proven, code-resolved, assumed, disputed, or unknown
- Which route ran or was skipped and why
- What changed and which slice owns it
- Which proof obligations passed, failed, or remain inconclusive
- The exact evidence and current SHA/configuration scope
- The next human decision
- The control-room path

Never force the human to reconstruct project state from session history.

## Reference routing

- Read [reality-recovery.md](references/reality-recovery.md) for audits, unfamiliar codebases, migrations, or disputed runtime paths.
- Read [research-exploration.md](references/research-exploration.md) for external research, adoption decisions, and product exploration.
- Read [architecture-program-design.md](references/architecture-program-design.md) for architecture and program design.
- Read [gate-routing.md](references/gate-routing.md) for every non-trivial route decision.
- Read [proof-and-activation.md](references/proof-and-activation.md) for verification, receipts, cutover, rollback, and retirement.
- Read [project-brain-contract.md](references/project-brain-contract.md) before changing project-memory artifacts or schemas.
- Read [control-room-design.md](references/control-room-design.md) before generating or editing human-facing HTML views.
