# Recovery run evidence — 2026-08-10

Repo: `Legend101Zz/PanelSummary` · branch `v2-architecture` @ `47ea74d`
Entry mode: recovery only. No implementation, no service started, no paid model call.

## What is here

- `pf-arch-desktop.png` — control-room view `recovered-architecture.html` at 1440x1000.
- `pf-arch-diagram.png` — the runtime-components Mermaid diagram, rendered.

## View QA performed

Served `.project-factory/views/` over `127.0.0.1:8791` and loaded in Chromium (Playwright).

| Check | Result |
|---|---|
| Page loads, title correct | pass |
| All 3 Mermaid diagrams render to SVG | pass (`pre.mermaid svg` = 3) |
| Offline fallback note correctly hidden when Mermaid loads | pass |
| Horizontal page overflow at 1440px | none |
| Horizontal page overflow at 390px | none, after adding `overflow-x:auto` to `.chain`/`pre.mermaid` and `overflow-wrap:anywhere` to inline `code` |
| Wide tables scroll inside their own `.table-wrap` | pass (5/5 scrollable, page body does not scroll) |
| HTML well-formedness | pass (no unclosed or mismatched tags) |
| `project_factory.py validate` | PASS — 11 events, 0 programs |

## Not evidence of

Nothing here observes the PanelSummary product at runtime. The manga lanes were not
executed. All runtime claims about the agentic lane rest on committed receipts under
`docs/evidence/`, produced by earlier sessions at earlier SHAs.

---

## Addendum — program-design recovery (same session)

- `pf-progdesign-sequence.png` — the agentic-lane sequence diagram in
  `recovered-program-design.html`, 21 steps, at 1440px.

### View QA

| Check | Result |
|---|---|
| Mermaid sequence diagram renders | pass, **after a fix** |
| Horizontal page overflow at 1200px / 1440px / 390px | none |
| Wide tables, call-stack frames, and the diagram scroll inside their own containers | pass |
| `project_factory.py validate` | PASS — 13 events, 0 programs |

### Defect found and fixed by the QA pass

The first render produced a Mermaid **syntax-error SVG** while still reporting one `<svg>`
element — element-count alone would have passed it. The `.offline-note` fallback caught it.

Cause: a `;` inside a sequence-diagram message (`"mint accepted artifact + ModelReceipt;
stage/run succeeded"`). Mermaid treats `;` as a statement separator, so the message
terminated early and the following `DR-->>EX:` line failed to parse at line 30.

Fix: removed the semicolon and the `{...}` braces from message text. Re-verified:
`syntaxError: false`, `offlineNoteVisible: false`.

Lesson for future views: assert on **absence of "syntax error" text**, not on SVG presence.

---

## Addendum 2 — agentic-lane deep dive (same session)

- `pf-agentic-chain.png` — the nine-artifact flow diagram in `recovered-agentic-lane.html`.

### View QA — all three hand-written views

Served over `127.0.0.1:8791`, checked in Chromium at 1200 / 1440 / 390 px.

| Page | Mermaid | Syntax errors | Offline note | Horizontal overflow | Nav |
|---|---|---|---|---|---|
| `recovered-agentic-lane.html` | 2/2 render | 0 | hidden | none at 1200/1440/390 | 4 links, self marked current |
| `recovered-architecture.html` | 3/3 render | 0 | hidden | none | 4 links, self marked current |
| `recovered-program-design.html` | 1/1 render | 0 | hidden | none | 4 links, self marked current |

Assertion used: every `pre.mermaid` contains an `<svg>` **and** its text does not contain
"syntax error" — the lesson from the defect logged in Addendum 1.

Nav regression check run because the two sibling pages were edited to add the new link.

`project_factory.py validate` → PASS, 16 events, 0 programs.

### New findings recorded this pass

- **Receipts are enforced, not just recorded.** `manga_director.py:585-601` raises if the
  trace's provider/model differ from the policy-required pair, or if provenance or measured
  latency is missing.
- **Mode-to-worker wiring gap** (confidence: medium, inference). No setting maps a model mode
  to a worker URL. `scripts/whole_book_wmc_s8.py:101-108` hand-wires director→M3 worker and
  page_planner→speed worker; `agentic_pipeline_bridge.py:52-66` builds ONE client from
  `AGENT_WORKER_URL` (default `:8788`, the speed worker) and hands it to BOTH drivers. With
  the default URL the shadow direction stage would fail its own receipt gate. Not observed —
  the flag is off — but it is wiring work Gap 3 has to settle.

---

## Addendum 3 — Simplified Technical English pass

The user asked for the views in the language of
[AminBlg/SimpleEnglish](https://github.com/AminBlg/SimpleEnglish), and asked to keep the
skill in the project.

### Skill vendored

`.claude/skills/simple-english/` holds SKILL.md, two references, the MIT LICENSE, and
PROVENANCE.md. Upstream commit `59bf6702197a5aadc96d197ea17f290d8d50dcd3`. The files are
byte-identical to upstream. `CLAUDE.md` gained a "Language" section with the locked term
choices, so later sessions inherit the picks and not only the skill.

### Mode and glossary

Pragmatic mode. The user linked the repository. The user did not ask for STE compliance.

| Concept | Chosen term | Rejected |
|---|---|---|
| Confirm that something holds | verify | check, confirm, ensure |
| Stored options | configuration | config, settings |
| Start a process | run | execute |
| Take something away | remove | delete, erase |
| Put on screen | show | display, present |
| A defect | problem, error | issue (except "issue #15") |

`validate`, `validators`, and `validation_status` name code. They stay unchanged.

### Measured result

`ste_prose_check.py` (in this directory) parses each page, removes `<style>`, `<script>`,
`<pre>`, and `<code>`, then runs the checklist patterns over prose only. Without that
filter every CSS rule reports as a semicolon violation.

| Page | Before | After |
|---|---|---|
| `recovered-architecture.html` | 36 (20 patterns + 16 long sentences) | 1 |
| `recovered-program-design.html` | 56 (36 + 20) | 3 |
| `recovered-agentic-lane.html` | 35 (14 + 21) | 2 |
| **Total** | **127** | **6** |

The six that remain are false positives of the checker. Three are restrictive relative
clauses, not condition-command pairs, and Rule 5.4 governs commands. Two are table cells
that hold arrow chains of identifiers, and Rule 8.6 counts each identifier as one word.
One is the quoted system prompt, and Rule 8.6 counts quoted text as one word.

The largest real class was the semicolon. Rule 8.1 rejects it. The prose held 40 of them.

### Browser QA after the rewrite

| Page | Mermaid | Syntax errors | Offline note | Overflow 1440 | Overflow 390 | Nav |
|---|---|---|---|---|---|---|
| `recovered-architecture.html` | 3/3 | 0 | hidden | none | none | 4 links, self current |
| `recovered-program-design.html` | 1/1 | 0 | hidden | none | none | 4 links, self current |
| `recovered-agentic-lane.html` | 2/2 | 0 | hidden | none | none | 4 links, self current |

Screenshot: `pf-ste-architecture.png`.

### Out of scope, on purpose

The renderer owns `index.html`, `assumptions.html`, `proof.html`, `architecture.html`, and
`program-design.html`. A hand edit there creates a second authority, and the next `render`
overwrites it. Their wording comes from `project_factory.py`. Mermaid sources stayed
unchanged. Diagram labels are not sentences, and an edit there risks the semicolon defect
of Addendum 1 again. Past events and the earlier addenda are append-only history.
