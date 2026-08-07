# Next-session prompt (Session 1 of the v2 roadmap)

Paste the block below into a fresh Claude Code session (recommended model: Fable 5,
start in plan mode). Sessions roadmap and rules live in the GitHub epic
https://github.com/Legend101Zz/PanelSummary/issues/11 and NEXT_SESSION.md.

```text
Work in /Volumes/Mrigesh SSD/Book-Reel on branch v2-architecture (never commit to
main). Read first: NEXT_SESSION.md, docs/TECHNICAL_ARCHITECTURE_BLUEPRINT.md
(sections 5-9, 11, 22), docs/research/ (all three spike docs), and GitHub issues
#2, #4, #12 on Legend101Zz/PanelSummary.

Step 0 — if docs/research/art-economics/out/receipts.json does not exist yet, run
the lane-C experiment first (OpenRouter key must have headroom; ~$0.12):
  cd docs/research/art-economics && ../../../backend/.venv/bin/python spike_lane_c_inking.py
Then review the generated pages against the protocol in findings.md, decide the
lane-C verdict, and record it as a comment on issue #12 with the receipts.

Main goal (issue #2 + first half of #4): make PanelSummary the canonical v2 base.
1. Write docs/adr/ADR-010 (repo strategy: PanelSummary canonical, ScrollStack
   donor) with the file-level port inventory and the name-mapping table
   (ScrollStack MangaEdition/manga-plan.v1 vs existing slice/adaptation stages).
2. Port from ScrollStack main (github.com/Legend101Zz/ScrollStack — its
   vertical-slice work is merged there): backend/app/contracts/* and the durable-
   context services (source_units, scopes, context_compiler, memory,
   generation_runs, generation_workflow, hashing) WITH their pytest suites,
   adapted to this repo's module layout. Port code+tests+ADRs; never re-implement
   from memory. Do not wire them into the live v1 pipeline yet.
3. Green gates before claiming done: cd backend && uv run pytest tests/ -q (all
   ported suites passing), plus git diff --check. Update NEXT_SESSION.md with an
   evidence-backed handoff and tick the completed checkboxes on issues #2/#4.

Hard rules: main untouched; no image-model calls beyond Step 0 without explicit
authorization in this session; MiniMax lanes per issue #3 when an LLM call is
needed; every provider call persists a receipt; docs/ is gitignored so use
git add -f for curated docs; preserve all v1 behavior (feature-flag philosophy).
```

## Session roadmap (manga lane complete ≈ 8 sessions)

| # | Focus | Issues |
|---|---|---|
| 1 | ADR-010 + port contracts & durable-context services (+ lane-C verdict) | #2, #4, #12 |
| 2 | Wire compiled context into v1 pipeline; scope selection API/UI; structure-aware source units; two-scope continuity proof on WMC | #4 |
| 3 | pnpm workspace + agent-worker/agent-runtime port; domain-tool broker; first live Manga Director goal on MiniMax; injection tests | #8, #3 |
| 4 | Layout compiler + page-script/thumbnail stages + template library + craft validators; SVG preview loop on one WMC chapter | #5, #6 |
| 5 | Rendering mechanism build-out per lane-C verdict: page-art stage, OCR gate, vision QA, slicing, v2 composition + lettering (carry v1 bubble/vector work) | #12, #7, #5 |
| 6 | Reader v2 integration + eval harness (structural metrics, Magi critic, M3 judges); score v1 vs v2 | #5, #10 |
| 7 | Whole-book: scope planner, chain executor, cost preflight, library; full WMC single-run golden test | #13 |
| 8 | Hardening + full golden flow + skills iteration from eval scores + merge-review prep | #6, #10, epic |

Reels (#9) afterwards: ~2-3 further sessions. Estimates assume one focused session
per row with review gates between; slips concentrate in rows 5-6 (the visual
quality loop) — treat 8 as 8±2.
