# Task Plan: PanelSummary Analysis & Next-Session Prep

## Goal
Deep-dive the PanelSummary (Book-Reel) project to catalog shortcomings of the current
manga generation (DSL formatting, too much text, no visual/image leverage), research how
real manga are written, evaluate a generated manga, and produce: (1) an in-depth analysis
doc, (2) updated CLAUDE.md / AGENTS.md, (3) a detailed, self-contained prompt for the next
session. **No implementation work this session.**

## Constraints (from user)
- Analysis only — no feature code changes this session.
- Next session should use MINIMAX_API_KEY (already in backend/.env) and OpenRouter image
  models; keep old pipeline working (additive, not breaking).
- Limited image budget: small set of background-less character/asset images reused across
  panels, or LLM-generated SVG. Cost control matters.
- Consider "agent harness generates the manga" orchestration idea (harness > raw API calls).
- Suggest open-source libs/tools worth adopting.

## Phases
| # | Phase | Status |
|---|-------|--------|
| 1 | Setup planning files, confirm project access | complete |
| 2 | Read docs (ARCHITECTURE, flows, image-cost plan), CLAUDE.md, AGENTS.md | complete |
| 3 | Code deep-dive: DSL schema, generation prompts, orchestration, renderer | complete |
| 4 | Evaluate generated manga (localhost:3000 book 6a0b5a11... project 6a0b5a5b...) | complete |
| 5 | Web research: manga craft, One Piece reference, open-source libs, image models | complete |
| 6 | Synthesize shortcomings + redesign recommendations | complete |
| 7 | Update CLAUDE.md/AGENTS.md; write analysis doc + next-session prompt into repo | complete |

## Key Decisions
- Planning files live in repo root (transient; not to be committed by user unless wanted).
- Durable deliverables go in docs/ (analysis + next-session prompt).
- Deliverables written to docs/analysis/SHORTCOMINGS_AND_VISUAL_UPGRADE.md and docs/plans/NEXT_SESSION_PROMPT.md; CLAUDE.md + AGENTS.md updated with pointers.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| WebFetch of tcbonepiecechapters.com returned JS shell (no content) | 1 | Used goteenwriters article + WebSearch corpus for craft research instead |
