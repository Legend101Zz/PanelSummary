# HTML Control Room Design

Generate HTML to help the owner understand and decide. Markdown and JSONL remain canonical.

## Design read

Read this as a technical project control room for a hands-on owner. Use a calm engineering-editorial language with medium-high information density, restrained motion, strong source labels, and one teal accent. It should feel like an instrument panel, not generic SaaS marketing.

## Core views

- `index.html`: read-only Kanban with UNDERSTAND, DECIDE, EXECUTE, PROVE, ACTIVATE.
- `architecture.html`: current and desired architecture, boundaries, diagrams, and authority.
- `program-design.html`: contracts, call path, uncertainty routes, slices, and human gates.
- `assumptions.html`: latest state of assumptions and risks with sources and confidence.
- `proof.html`: proof obligations, receipts, falsification results, and activation state.
- `exploration/*.html`: distinct interactive prototypes only when the human needs to compare product directions.

Do not add drag-and-drop in the first version. An editable board would create a second authority and conflict with Markdown/event history.

## Visual system

- Theme: light, slightly cool neutral background; dark ink; teal accent; amber only for real human gates; red only for failures.
- Typography: system sans for prose and system monospace for evidence, state, paths, SHAs, and numbers.
- Shape: small consistent radii; use panels only for real hierarchy.
- Density: compact enough to scan a large program, but keep line length readable.
- Motion: only short state or navigation feedback. Respect `prefers-reduced-motion`.
- Status indicators: always include text; never communicate status by color alone.
- Data: never invent metrics, completion percentages, dates, users, or progress.

## Content rules

- Lead with current authority and next human decision.
- Distinguish proven, code-resolved, assumed, disputed, and unknown.
- Put sources and evidence beside claims.
- Use the same terminology as the canonical Markdown.
- Show why a stage was skipped.
- Show fakes/bypasses in tracer bullets and what they cannot prove.
- Render Mermaid fences as diagrams when the Mermaid runtime is reachable. Keep readable source as the offline fallback.
- Use plain interface verbs and sentence case.

## Additional HTML

When an architecture or program concept needs more explanation, create another HTML file under `views/` and link it from the canonical Markdown before regenerating the index.

For product exploration, create separate self-contained option files. Each should include the user promise, primary workflow, risky assumption, system implications, and a visible return-to-control-room link. Do not disguise a mockup as a working production surface.

## QA

Before handoff:

- Render from canonical artifacts.
- Open the HTML in a real browser when available.
- Check desktop and one narrow viewport.
- Verify keyboard navigation, visible focus, contrast, overflow, Mermaid fallback, and reduced motion.
- Confirm no raw HTML from project Markdown executes as script.
- Confirm links resolve and the control room does not edit source truth.
- Re-read visible copy for ambiguity and false precision.

