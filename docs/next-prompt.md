# Next-session prompt (Session 2 of the v2 roadmap)

Session 1 (ADR-010 + contracts/durable-context port) completed 2026-08-07 —
commits `dd2ab7e`…`da4a9f2` on `v2-architecture`; see NEXT_SESSION.md handoff
and docs/adr/010. Paste the block below into a fresh Claude Code session
(recommended model: Fable 5, start in plan mode). Roadmap and rules live in
https://github.com/Legend101Zz/PanelSummary/issues/11 and NEXT_SESSION.md.

```text
Work in /Volumes/Mrigesh SSD/Book-Reel on branch v2-architecture (never commit
to main). Read first: NEXT_SESSION.md (2026-08-07 session handoff at the end),
docs/adr/010-repo-strategy-panelsummary-canonical.md,
docs/TECHNICAL_ARCHITECTURE_BLUEPRINT.md sections 7-8 and the Phase 1 exit in
section 22, and GitHub issue #4 on Legend101Zz/PanelSummary.

Step 0 carryover — if docs/research/art-economics/out/receipts.json still does
not exist: probe the OpenRouter key (GET https://openrouter.ai/api/v1/key with
OPENROUTER_API_KEY from backend/.env); only if limit_remaining >= 0.15 run
  cd docs/research/art-economics && ../../../backend/.venv/bin/python spike_lane_c_inking.py
review against findings.md's protocol, and post the lane-C verdict with
receipts as a comment on issue #12. If still exhausted, skip silently.

Main goal (issue #4 second half = blueprint Phase 1: durable context consumed
by v1 with NO output change):
1. Decide and execute the wiring approach recorded as deferred in ADR-010:
   the ported persistence layer targets beanie 2.x semantics while this repo
   runs beanie 1.27 + motor. Either adapt initialize_mongo at the boundary to
   motor (preferred if it keeps v1 bit-identical) or upgrade beanie with full
   regression proof. Register the ported Docs in all three init_beanie lists
   (app/main.py, app/celery_worker.py, app/scripts/_db.py) — resolve the
   MangaProjectDoc/BookDoc collection collisions per ADR-010's mapping table
   before registering.
2. Structure-aware source units: normalize the existing parsed WMC book into
   SourceUnitDocs via the ported source_units service — chapter/section from
   Docling headings with page-window fallback, front-matter detect/skip
   (issue #4 explicitly calls out the 1-unit-per-page pollution defect).
3. Scope-selection API: POST /books/{id}/scopes + list/coverage endpoints
   using the ported ScopeService; minimal UI or curl-level evidence is fine
   this session.
4. Wire the v1 manga pipeline to CONSUME a compiled ContextPack (ported
   ContextCompiler) behind a feature flag, default off, with no change to
   generated output when on (blueprint Phase 1 exit).
5. Continuity proof on WMC: adapt scope A (pages 1-10 class), then scope B
   (11-20) in a FRESH process; show the second run's compiled context
   contains the first run's accepted memory purely from Mongo. Also prove:
   required facts survive token-budget reduction; a stale MemoryDelta
   (wrong baseMemoryVersion) is rejected without data loss.

Green gates before claiming done: cd backend && uv run pytest tests/ -q
(516-test baseline preserved + new tests), git diff --check, and the
continuity-proof evidence captured in NEXT_SESSION.md. Update NEXT_SESSION.md
with an evidence-backed handoff, tick completed checkboxes on issue #4, and
rewrite docs/next-prompt.md for Session 3 (see roadmap below).

Hard rules: main untouched; back up the benchmark project DB before any
destructive regeneration (restore pattern in NEXT_SESSION.md) and restore on
failure; text LLM calls are MiniMax-only per issue #3 (M3; server-owned key)
and only if the continuity proof genuinely needs generation — prefer proving
context compilation without paid generation; NO image-model calls without
explicit authorization; every provider call persists a receipt; docs/ is
gitignored so use git add -f for curated docs; preserve all v1 behavior
(feature-flag philosophy; 516 tests stay green).
```

## Session roadmap (manga lane complete ≈ 8 sessions)

| # | Focus | Issues |
|---|---|---|
| 1 | ✅ 2026-08-07 — ADR-010 + port contracts & durable-context services (lane-C verdict still blocked on key limit) | #2, #4, #12 |
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
