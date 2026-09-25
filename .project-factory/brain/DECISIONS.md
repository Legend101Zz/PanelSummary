# PanelSummary / Book-Reel: Decisions

> Append-only. New entries may supersede old entries; never rewrite history.
> Entries below were **recovered** on 2026-08-10 from ADRs, config comments, and issue #15.
> They record decisions the owner already made; they are not new decisions by this session.

---

### 2026-08-07: ADR-010 — PanelSummary is the canonical base, ScrollStack is the donor

- Status: accepted
- Choice: keep PanelSummary as the repository of record; port ScrollStack's agent plane into
  it verbatim from donor `main @ 43300b5`, enumerating every boundary edit.
- Why: PanelSummary owns the live product surface and data; a rewrite would put the working
  manga path at risk.
- Alternatives rejected: rewrite in the donor repo; greenfield third repo.
- Evidence considered: `docs/adr/010-repo-strategy-panelsummary-canonical.md`, issue #2.
- Revisit trigger: donor divergence making verbatim ports impractical.

---

### 2026-08-07: ADR-011 — durable context wired behind a byte-compare guard

- Status: accepted
- Choice: `use_compiled_context` sources slice text from a compiled `ContextPack`, then
  byte-compares against the legacy builder and **raises on any mismatch**.
- Why: flag-on must never silently change generated output. A loud crash is preferable to
  quiet divergence in a paid pipeline.
- Evidence considered: `backend/app/services/manga/generation_service.py:459-478`,
  `backend/app/config.py:76-85`, issue #4.
- Assumptions accepted: a byte-identical guard is strong enough to make Phase 1 low-risk.
- Revisit trigger: the guard firing on real books, indicating normalization drift.

---

### 2026-08-07: ADR-012 — agent plane ported; agents get tools, not database handles

- Status: accepted
- Choice: pnpm workspace + `packages/agent-runtime` as the sole Pi-SDK boundary (pinned
  `@earendil-works/pi-coding-agent 0.80.10`) + `apps/agent-worker` as an authenticated
  Fastify host; all agent writes go through the allowlisted domain-tool broker at
  `POST /internal/v1/agent-tools/{tool_name}`.
- Why: bound the blast radius of an agent. Extends ADR-003 (Pi behind an adapter) and
  ADR-004 (tool allowlists).
- Alternatives rejected: agents holding direct Mongo access; unpinned SDK.
- Evidence considered: `docs/adr/012-agent-plane-port-and-domain-tool-broker.md`,
  `docs/evidence/session3-live-director/`.
- Revisit trigger: an SDK upgrade — explicitly a separate reviewed change with golden
  contract tests.

---

### 2026-08-08: Provider and model-mode policy

- Status: accepted
- Choice: every text, structured-output, review, repair, and vision call goes through the
  server-owned `MINIMAX_API_KEY` (`MiniMax-M3` default). OpenRouter is an **image-only**
  credential. Per-purpose model modes are config, not code:
  `direction=quality`, `page_writing=speed`, `thumbnail=speed`. Vision is not configurable —
  M3 only.
- Why: hard cost rule; receipts must record the resolved mode and its provenance.
- Evidence considered: `backend/app/config.py:87-101`, `CLAUDE.md` "Providers", issue #3,
  Session 4 bake-off.
- Revisit trigger: **now** — issue #15 Gap 1 proposes flipping `thumbnail` to `quality`
  because the speed model cannot hold the layout-draft schema. **This is the open decision.**

---

### 2026-08-08: Session 8 bake-off — candidate B is the default standard-page mechanism

- Status: accepted
- Choice: compose a page by pasting one money-shot panel into compiled geometry
  (`paste_panel_art`), rather than one-shot generating the whole page.
- Why: measured — binding 1.0 at $0.039/page; the one-shot lane (C) was demoted after 12
  rejected attempts across three conditioning versions.
- Alternatives rejected: C (one-shot page) demoted; A′ (per-panel, 4× cost) left open.
- Evidence considered: `docs/evidence/session8-bakeoff/`,
  `docs/research/rendering-lane-matrix.md`, issue #12.
- Revisit trigger: the open A′ cost decision in PR #14.

---

### 2026-08-09: Owner-requested database wipe

- Status: accepted (executed)
- Choice: clean-start the live database.
- Consequence: the golden-chain resume state was deleted, so previously accepted
  direction/page-writing artifacts are gone from the live DB. A fresh agentic run restarts
  spend from zero.
- Evidence considered: issue #15; backup recorded at
  `.dev/db-backups/panelsummary-pre-wipe-20260809/` (**not verified this session**).
- Revisit trigger: none — historical.

---

### PROPOSED (not decided): the v1 deprecation plan, issue #15

- Status: **proposed**
- Choice under consideration: Phase 0 decide/merge PR #14 → Phase 1 `use_compiled_context=true`
  → Phase 2 `agentic_manga_pipeline_v1=true` (shadow, burn down Gaps 1/5/8 where failures are
  free) → Phase 3 close Gaps 2–4, 6–7 → Phase 4 promote the agentic lane to default `/build`
  and default reader, v1 behind a fallback flag for one release → Phase 5 delete
  `manga_pipeline/`, v1 slice/sprite/panel-render services, the client-side SVG compositor,
  the `llm_client.py` direct-call path, and v1-only fields; archive `manga_slices`/`manga_pages`.
- Gates: Phase 4 requires side-by-side judging preferring agentic output. Phase 3 requires one
  full book generated by the agentic lane alone.
- Rollback: flag flip at every phase; nothing before Phase 5 deletes code or data.
- **Open owner decisions:** (1) Gap 1 — `AGENT_MODEL_MODE_THUMBNAIL=quality`, ~$0.09–0.16 per
  resume; (2) PR #14 merge; (3) the A′ per-panel 4× cost lane.
- Revisit trigger: owner ratification, which converts this to an accepted decision.

---

### 2026-08-10: Project documentation uses Simplified Technical English

- Status: accepted (the user asked for it in this session)
- Choice: vendor the `simple-english` skill from
  [AminBlg/SimpleEnglish](https://github.com/AminBlg/SimpleEnglish) into
  `.claude/skills/simple-english/`, and write project documentation in ASD-STE100
  **pragmatic** mode.
- Why: the user asked for the language and for cross-session persistence. Short
  sentences, one word per meaning, and condition-first order make the recovery
  views survive one read.
- Scope: the three hand-written views under `.project-factory/views/`, new `/docs`
  pages, handoff notes, and agent skill files. Not code, identifiers, quoted
  errors, or Mermaid sources. Not the renderer-owned views.
- Locked terms: verify, configuration, run, remove, show, problem. `validate`,
  `validators`, and `validation_status` name code and stay unchanged. The full
  table lives in the "Language" section of `CLAUDE.md`.
- Provenance: upstream commit `59bf6702197a5aadc96d197ea17f290d8d50dcd3`, MIT.
  Files are byte-identical to upstream. See
  `.claude/skills/simple-english/PROVENANCE.md`.
- Evidence: prose findings across the three views dropped from 127 to 6. The six
  that remain are false positives of the checker. See
  `.project-factory/evidence/recovery-2026-08-10/README.md`, Addendum 3.
- Revisit trigger: an upstream release of the skill, or a decision to move to
  strict mode. Strict mode needs the official dictionary at asd-ste100.org.
