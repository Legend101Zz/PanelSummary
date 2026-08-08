# Next-session prompt (Session 7 of the v2 roadmap)

Session 6 (content gate + composition/QA/eval machinery live; fresh
planning set BLOCKED by a measured M3 tool-frame wall) completed
2026-08-09 — commits `7097b25`…HEAD on `v2-architecture`; see the Session
6 handoff at the end of NEXT_SESSION.md and the ADR-012 Session 6
addendum (entries 1–9). Paste the block below into a fresh Claude Code
session (recommended model: Fable 5, start in plan mode). Roadmap and
rules live in https://github.com/Legend101Zz/PanelSummary/issues/11 and
NEXT_SESSION.md.

```text
Work in /Volumes/Mrigesh SSD/Book-Reel on branch v2-architecture (never
commit to main; verify the branch before any commit). Read first:
NEXT_SESSION.md (2026-08-09 Session 6 handoff at the end — especially the
TWO-PART HEADLINE), docs/adr/012 INCLUDING the Session 6 addendum
(entries 1-9: content-gate tiers, 422 digests, the M3 tool-frame
mangling, output budgets, stage selection, composition/versioning splits,
contract promotion, reader seam, eval semantics), docs/evidence/
session6-fresh-planning/page_writing_failure_ledger.json (the 10-attempt
diagnosis), docs/research/rendering-lane-matrix.md, and GitHub issues #5,
#10, #7 (Session 6 comments) on Legend101Zz/PanelSummary.

Step 0 — LAND PAGE-WRITING (the binding constraint, now measured twice:
the S5 content finding AND the S6 judge lane both say wordless pages
cannot teach the book — fidelity scored 1/5 on every accepted page):
1. Diagnose the fourth M3 tool-frame mangling shape BEFORE any paid
   attempt: add a server-side raw-arguments dump (temporary, logged, or
   a debug flag on the seam) so the next 422 shows exactly what arrived;
   the first three shapes are already normalized by _unwrap_item_wrappers
   with tests. Consider in parallel: the donor-proven assistant-text
   fallback lane (the skill no longer forbids it — one M3 run may simply
   land via extractAssistantJsonCandidate), and the speed lane with the
   hardened skill 1.4.4 (its a4 failure was 2 fixable errors; the
   identical-resubmit pathology may not survive the new
   fix-every-field-of-the-class digests). Budget the retries EXPLICITLY
   (state per-attempt cost from the S6 ledger: speed ~$0.12-0.20, M3
   ~$0.06-0.08) and STOP at your stated line; every attempt persists
   failure_history receipts.
2. When page-writing lands: thumbnail goal on the speed lane (~$0.13-
   0.26, watch the live RTL craft gate), then lane-C regeneration through
   run_page_art_stage with EXPLICIT thumbnail_artifact_id (state the
   batch first: 2 pages x $0.039 + retry margin; gates v3 now reject
   drawn empty balloons) — the composed output is the FIRST fully-
   authored v2 page set: real beats, real dialogue, tails pointing at
   speakers. Re-run scripts/eval_wmc_s6.py so the fidelity score finally
   has a text channel to measure; the whole loop is ~$0.35 text +
   ~$0.16 image.

Main goal (roadmap row 7 — whole-book mechanism; issue #13):
1. Scope planner: chapter-set -> ordered scope chain with per-scope
   budgets (text/image/judge from the measured matrix numbers).
2. Chain executor: direction -> page-writing -> thumbnail -> page-art ->
   compose per scope with resume (stage idempotency already gives most
   of it), cost preflight (refuse to start a scope whose projected spend
   exceeds the remaining budget), and the eval harness scoring each
   scope as it completes.
3. Library/continuity: character reference reuse across scopes (the
   asset_index seam), memory snapshots between scopes.
4. Golden test: ONE full WMC single-run flow (small chapter set) driven
   end-to-end by the chain executor, scorecards persisted per scope.

Also fold in (small, high-value): reader v2 page_art fallback when a
page has art but no composed row; scorecard baseline/regression compare
(two scorecards -> diff verdict); eval_scorecard + qa_report registry
promotion with fixtures.

Green gates before claiming done: cd backend && uv run pytest tests/ -q
(767-test baseline preserved + new), pnpm suites (contracts 46 +
agent-runtime 22 + agent-worker 13, preserved + new), node
scripts/generate.mjs --check and PYTHONPATH=. uv run python
scripts/export_contracts.py --check clean, injection suites green,
frontend next build + tsc --noEmit green if touched, git diff --check.
Then: update NEXT_SESSION.md with an evidence-backed handoff, tick ONLY
genuinely completed checkboxes on #13/#5/#10 (gh issue view N --json
body, edit exact lines, gh issue edit N --body-file — never retype),
rewrite docs/next-prompt.md for Session 8 per the roadmap table, commit
in logical units on v2-architecture, push origin v2-architecture.

Hard rules (owner policy 2026-08-08 — standing, apply to every session):
1. Model modes: speed=MiniMax-M2.7-highspeed, quality=MiniMax-M3, default
   quality (M3). Per-purpose defaults are config (Settings.agent_model_mode_*):
   direction=quality, page-writing/thumbnail=speed, vision LOCKED M3.
   No silent default switches, ever; A/B overrides are explicit and
   receipted (model_mode + model_mode_source prove it).
2. ALL code changes on v2-architecture or feature branches off it. Nothing
   merges to main until fully tested AND owner-confirmed. main untouched.
3. The laptop's internal SSD is low on space: keep worktrees, artifacts,
   evidence, and heavy files on /Volumes/Mrigesh SSD/.
4. If the external SSD unmounts mid-work: STOP and report. No workarounds.
Plus the constants: text LLM calls are MiniMax-only and budgeted — persist
a receipt for EVERY provider call INCLUDING failures. Image spend needs an
explicit stated budget BEFORE spending ($0.039/page measured; the S6 image
cap went 100% unspent, so the S7 regen is fully funded); vision QA is
$0.0004/page-call and judges $0.0005/page-call. Preserve all v1 behavior
(use_compiled_context AND agentic_manga_pipeline_v1 default OFF; 767-test
baseline stays green; the v2 lane writes to <repo>/storage, v1 to
backend/storage — never cross them). docs/ is gitignored — git add -f for
curated docs. Full-DB backup before live writes: uv run python
scripts/backup_db.py /tmp/bookreel-s7-before-<what>.json.

Outstanding carry-forwards (do not lose): (a) first REAL flag-on v1 slice
run on a FRESH project (Sessions 2-6 carryover; fold in only if image
budget allows AFTER the S7 regen); (b) worker egress restriction; (c)
ARTIFACT_REPAIR goal policy — the S6 transport-mangling evidence argues
FOR a reviewed normalization/repair lane; (d) layout-template.v1 contract
schema + list_layout_templates broker tool + seeded jitter; (e) issue #6
knowledge-base rewrite (reference files are still stubs); (f) issue #3
leftovers: ModelReceipt on every accepted artifact kind, ADR-001
revision, dashboard-lite, per-purpose smokes; (g) vision-QA style-match
vs reference (the #7 wording not yet scored); (h) Magi integration after
owner review of checkpoint download + trust_remote_code; (i) lane A
(sprites+vector) and lane B (key panel) composition paths +
rendered-page.v2 assembly.
```

## Session roadmap (manga lane complete ≈ 8 sessions)

| # | Focus | Issues |
|---|---|---|
| 1 | ✅ 2026-08-07 — ADR-010 + port contracts & durable-context services | #2, #4, #12 |
| 2 | ✅ 2026-08-07 — durable context wired into v1 (ADR-011), scope API, flag-gated ContextPack consumption, continuity proof | #4 |
| 3 | ✅ 2026-08-07 — agent plane live (ADR-012): pnpm workspace, Pi runtime, broker, first live Director goal on M3, injection suites | #8, #3 |
| 4 | ✅ 2026-08-08 — lane-C verdict verified (#12 done); layout compiler + page planning + page_domain_tools port; MANGA_PAGE_WRITING/THUMBNAIL drivers live; 18-template library + craft validators; AGENTIC_MANGA_PIPELINE_V1 shadow lane; Pi details adapter fix; skills 1.3.0/1.4.0; M2.7-highspeed vs M3 bake-off + SVG preview loop on WMC | #5, #6, #3, #8 |
| 5 | ✅ 2026-08-09 — rendering mechanism LIVE: page-art stage + gates, both WMC pages accepted with exact receipt reconciliation; ModelPolicy speed/quality modes; carry-fix trio. Headline: page-writing content quality is the binding constraint | #12, #7, #5, #3, #8 |
| 6 | ✅ 2026-08-09 — content gate + composition upgrades (tails, supersedes, compose-only stage) + vision-QA v3 (empty balloons, qa_report) + contract promotion + reader v2 behind a flag + eval harness (REAL Layout-IoU, M3 judges, 3-lane matrix). Judge lane measured fidelity 1/5 on wordless pages. Fresh planning set BLOCKED: 10 receipted attempts, four walls diagnosed (skill spec -> resubmit pathology -> output cap -> M3 tool-frame mangling); carried with a landing plan | #5, #10, #7 |
| 7 | LAND page-writing + first fully-authored composed set + re-score; whole-book: scope planner, chain executor, cost preflight, library; full WMC single-run golden test | #13, #5, #10 |
| 8 | Hardening + full golden flow + skills iteration from eval scores + merge-review prep | #6, #10, epic |

Reels (#9) afterwards: ~2-3 further sessions. Estimates assume one focused
session per row with review gates between; slips concentrate in rows 5-7
(the visual quality loop + the M3 tool-frame wall) — treat 8 as 8±2.
