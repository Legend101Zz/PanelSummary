# Next-session prompt (Session 3 of the v2 roadmap)

Session 2 (durable context wired into v1 — issue #4 second half) completed
2026-08-07 — commits `c10d8a9`…HEAD on `v2-architecture`; see the Session 2
handoff at the end of NEXT_SESSION.md and docs/adr/011. Paste the block below
into a fresh Claude Code session (recommended model: Fable 5, start in plan
mode). Roadmap and rules live in
https://github.com/Legend101Zz/PanelSummary/issues/11 and NEXT_SESSION.md.

```text
Work in /Volumes/Mrigesh SSD/Book-Reel on branch v2-architecture (never commit
to main). Read first: NEXT_SESSION.md (2026-08-07 Session 2 handoff at the
end), docs/adr/011-durable-context-v1-wiring.md, docs/adr/003 + 004 (Pi
runtime boundary, tool allowlists), docs/TECHNICAL_ARCHITECTURE_BLUEPRINT.md
sections 9-10 and the Phase 2 exit in section 22, and GitHub issues #8 and #3
on Legend101Zz/PanelSummary.

Step 0 carryover — if docs/research/art-economics/out/receipts.json still does
not exist: probe the OpenRouter key (GET https://openrouter.ai/api/v1/key with
OPENROUTER_API_KEY from backend/.env; never print the key); only if
limit_remaining >= 0.15 run
  cd docs/research/art-economics && ../../../backend/.venv/bin/python spike_lane_c_inking.py
review against findings.md's protocol, and post the lane-C verdict with
receipts as a comment on issue #12. If still exhausted, skip silently.

Main goal (issue #8 + first half of #3 = blueprint Phase 2: integrate Pi
safely):
1. pnpm workspace bootstrap: workspace root + packages/contracts TS side
   (port ScrollStack's generate.mjs / Ajv validators / vitest fixtures test —
   deferred in ADR-010) so Python and TypeScript validate the same 32+6
   fixtures (blueprint Phase 0 exit, still open).
2. Port apps/agent-worker + packages/agent-runtime from ScrollStack local
   main @ 43300b5 (same port rule as ADR-010: code + tests + docs verbatim,
   boundary edits documented). Exact-pinned Pi SDK dependency; built-in tools
   disabled; internal worker auth + health checks.
3. Domain-tool broker: expose ONLY typed domain tools per ADR-004's
   allowlists; no shell/filesystem/network reaches the model.
4. First live Manga Director goal on MiniMax-M3 (server-owned
   MINIMAX_API_KEY from backend/.env; disabled-thinking + reasoning_split
   controls per NEXT_SESSION 2026-07-10 notes): consume a persisted
   ContextPack (Session 2's compiler output — see
   services/compiled_context_bridge.py) and return a validated MangaPlan
   artifact with a model receipt. This is also the natural place for the
   first REAL flag-on slice run recorded as outstanding in the Session 2
   handoff.
5. Prompt-injection tests: malicious source-unit fixtures (blueprint §14)
   asserting the worker never executes instructions from book text and the
   broker rejects out-of-allowlist tool calls.

Green gates before claiming done: cd backend && uv run pytest tests/ -q
(563-test baseline preserved + new tests), TS fixture validation green
(pnpm test in packages/contracts), git diff --check, injection tests green.
Update NEXT_SESSION.md with an evidence-backed handoff, tick completed
checkboxes on issues #8/#3 (gh issue view N --json body, edit exact lines,
gh issue edit N --body-file — never retype), and rewrite docs/next-prompt.md
for Session 4 (see roadmap below).

Hard rules: main untouched; docs/ is gitignored so use git add -f for curated
docs; text LLM calls are MiniMax-only per issue #3 and budgeted — persist a
receipt for EVERY provider call; NO image-model calls without explicit
authorization; preserve all v1 behavior (use_compiled_context stays default
OFF; 563 tests stay green); back up any benchmark data before destructive
operations (pattern: /tmp/bookreel-s2-before-wiring.json).
```

## Session roadmap (manga lane complete ≈ 8 sessions)

| # | Focus | Issues |
|---|---|---|
| 1 | ✅ 2026-08-07 — ADR-010 + port contracts & durable-context services (lane-C verdict still blocked on key limit) | #2, #4, #12 |
| 2 | ✅ 2026-08-07 — durable context wired into v1: beanie-1.27 bridge (ADR-011), structure-aware source units + front-matter detection, scope API, flag-gated ContextPack consumption, two-scope fresh-process continuity proof on WMC (UI + first real flag-on slice run still open) | #4 |
| 3 | pnpm workspace + agent-worker/agent-runtime port; TS contracts side; domain-tool broker; first live Manga Director goal on MiniMax; injection tests | #8, #3 |
| 4 | Layout compiler + page-script/thumbnail stages + template library + craft validators; SVG preview loop on one WMC chapter | #5, #6 |
| 5 | Rendering mechanism build-out per lane-C verdict: page-art stage, OCR gate, vision QA, slicing, v2 composition + lettering (carry v1 bubble/vector work) | #12, #7, #5 |
| 6 | Reader v2 integration + eval harness (structural metrics, Magi critic, M3 judges); score v1 vs v2 | #5, #10 |
| 7 | Whole-book: scope planner, chain executor, cost preflight, library; full WMC single-run golden test | #13 |
| 8 | Hardening + full golden flow + skills iteration from eval scores + merge-review prep | #6, #10, epic |

Reels (#9) afterwards: ~2-3 further sessions. Estimates assume one focused session
per row with review gates between; slips concentrate in rows 5-6 (the visual
quality loop) — treat 8 as 8±2.
