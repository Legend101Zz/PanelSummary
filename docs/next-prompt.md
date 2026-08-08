# Next-session prompt (Session 5 of the v2 roadmap)

Session 4 (layout lane live — issues #5 + #6 first half, #8 broker close,
#3 bake-off) completed 2026-08-08 — commits `b5a04d4`…HEAD on
`v2-architecture`; see the Session 4 handoff at the end of NEXT_SESSION.md
and the ADR-012 Session 4 addendum. Paste the block below into a fresh
Claude Code session (recommended model: Fable 5, start in plan mode).
Roadmap and rules live in
https://github.com/Legend101Zz/PanelSummary/issues/11 and NEXT_SESSION.md.

```text
Work in /Volumes/Mrigesh SSD/Book-Reel on branch v2-architecture (never
commit to main; verify the branch before any commit). Read first:
NEXT_SESSION.md (2026-08-08 Session 4 handoff at the end), docs/adr/012
INCLUDING the Session 4 addendum (Pi details-field adapter fix, goal-shape-
generic skills, per-arm scopes, the validate_layout_draft payload problem),
docs/adr/009, the lane-C verdict comment on issue #12 plus
docs/research/art-economics/findings.md (results + production guardrails),
and GitHub issues #12, #7, #5 on Legend101Zz/PanelSummary.

Step 0 — carry-fixes that gate everything else (do these first):
1. Trim validate_layout_draft's MODEL-visible payload to issues +
   normalized_page_plan (drop compiled_layout + preview_svg from the
   <tool_data> text, keep them in the response for the control plane) —
   Session 4's thumbnail goal burned 158k input tokens ($0.13) on echoed
   geometry. Boundary edit on the ported page_domain_tools or adapter-side
   filter; enumerate it in the ADR-012 addendum.
2. Surface manga_craft_validation warnings through validate_layout_draft
   and the thumbnail acceptance report. Session 4's ACCEPTED WMC thumbnails
   carry RTL_READING_FLOW_INCOHERENT defects (top rows read left-to-right;
   evidence in docs/evidence/session4-svg-previews/) that error-level
   validators cannot see. Decide warn-vs-block per rule; add a regression
   fixture from the live defect.
3. Durable receipts/traces for FAILED runs: failed agent runs currently
   persist NOTHING (bit Session 4 twice — every failed-run cost is an
   estimate). Persist the worker-side trace (tokens, cost, latency, tool
   calls, session id) on failure as well, and store the tool_calls list on
   stage rows (issue #8 traces checkbox).

Main goal (roadmap row 5 — rendering mechanism per the lane-C verdict;
issues #12, #7, #5):
1. Page-art stage behind AGENTIC_MANGA_PIPELINE_V1: lane-C conditioned
   full-page inking as the default for standard pages (mix per findings.md:
   lane A quiet pages, lane C standard, lane B key-panel money shots).
   Conditioning input = compiled-layout skeleton rendered from the accepted
   thumbnail set (skeleton/mask export from compiled geometry is new work —
   see the template library's deferred list) + character reference sheets.
2. Production OCR gate with a screentone-noise filter (dictionary words +
   min confidence + min word count — the spike gate false-positives on
   tones/speedlines) + panel-count and Layout-IoU accept/retry per the
   #12 guardrails. Capture the text body of no-image responses in receipts.
3. M3 vision QA per panel against briefs (issue #3: vision is M3-only) with
   selective single-page regeneration (lineage per ADR-009).
4. v2 composition + deterministic lettering carrying v1's bubble/vector
   work (issue #5 boxes): ALL text rendered by code over text-free art.
5. Image spend needs an explicit stated budget BEFORE spending: state the
   planned call count x $0.039/page (+retry margin) and keep a receipt per
   call. Lane-C page-art on the WMC bake-off pages is the natural first
   target (2 pages ≈ $0.08-0.16 incl. one retry).

Goal B (issue #3, owner-decided 2026-08-08): implement speed/quality modes
in the ModelPolicy layer — mode "speed" = MiniMax-M2.7-highspeed, mode
"quality" = MiniMax-M3, with M3 as the DEFAULT mode; per-purpose defaults
stay config-not-code (direction=quality; page-writing/thumbnail=speed per
the Session 4 fast-lane confirmation; vision=M3 always). Receipts must
prove the mode. Never switch a default silently. The Session 4 bake-off
table + verdict is a comment on issue #3 — read it before wiring.

Green gates before claiming done: cd backend && uv run pytest tests/ -q
(684-test baseline preserved + new), pnpm suites (contracts 42 +
agent-runtime 20 + agent-worker 12, preserved + new), node
scripts/generate.mjs --check and PYTHONPATH=. uv run python
scripts/export_contracts.py --check clean, injection suites green, git
diff --check. Then: update NEXT_SESSION.md with an evidence-backed handoff,
tick ONLY genuinely completed checkboxes on #12/#7/#5 (gh issue view N
--json body, edit exact lines, gh issue edit N --body-file — never retype),
rewrite docs/next-prompt.md for Session 6 per the roadmap table, commit in
logical units on v2-architecture, push origin v2-architecture.

Hard rules (owner policy 2026-08-08 — standing, apply to every session):
1. Model modes: speed=MiniMax-M2.7-highspeed, quality=MiniMax-M3, default
   quality (M3). No silent default switches, ever; A/B overrides are
   explicit and receipted.
2. ALL code changes on v2-architecture or feature branches off it. Nothing
   merges to main until fully tested AND owner-confirmed. main untouched.
3. The laptop's internal SSD is low on space: keep worktrees, artifacts,
   evidence, and heavy files on /Volumes/Mrigesh SSD/.
4. If the external SSD unmounts mid-work: STOP and report. No workarounds.
Plus the constants: text LLM calls are MiniMax-only and budgeted — persist
a receipt for EVERY provider call INCLUDING failures (Step 0.3); budget
with Session 4 actuals (speed lane: direction $0.026/77s, page-writing
$0.030/42s, thumbnail $0.132/165s pre-trim; quality lane direction:
$0.068/291s class, expect 422-repair attempts). Preserve all v1 behavior
(use_compiled_context AND agentic_manga_pipeline_v1 default OFF; 684-test
baseline stays green). docs/ is gitignored — git add -f for curated docs.
Full-DB backup before live writes: uv run python scripts/backup_db.py
/tmp/bookreel-s5-before-<what>.json.

Outstanding carry-forwards (do not lose): (a) first REAL flag-on v1 slice
run on a FRESH project (Sessions 2-4 carryover) — the rendering work needs
a live slice anyway, so fold it in here if a fresh small book is cheap to
stand up, otherwise carry with the reason; (b) worker egress restriction;
(c) ARTIFACT_REPAIR goal policy; (d) layout-template.v1 contract schema +
list_layout_templates broker tool + seeded jitter (feeds Main goal 1);
(e) issue #6 knowledge-base rewrite (reference files are still stubs;
Session 4 only generalized the bounded shape sections).
```

## Session roadmap (manga lane complete ≈ 8 sessions)

| # | Focus | Issues |
|---|---|---|
| 1 | ✅ 2026-08-07 — ADR-010 + port contracts & durable-context services | #2, #4, #12 |
| 2 | ✅ 2026-08-07 — durable context wired into v1 (ADR-011), scope API, flag-gated ContextPack consumption, continuity proof | #4 |
| 3 | ✅ 2026-08-07 — agent plane live (ADR-012): pnpm workspace, Pi runtime, broker, first live Director goal on M3, injection suites | #8, #3 |
| 4 | ✅ 2026-08-08 — lane-C verdict verified (#12 done); layout compiler + page planning + page_domain_tools port; MANGA_PAGE_WRITING/THUMBNAIL drivers live; 18-template library + craft validators; AGENTIC_MANGA_PIPELINE_V1 shadow lane; Pi details adapter fix; skills 1.3.0/1.4.0; M2.7-highspeed vs M3 bake-off + SVG preview loop on WMC | #5, #6, #3, #8 |
| 5 | Rendering mechanism per lane-C verdict: page-art stage, OCR gate, vision QA, v2 composition + lettering; speed/quality modes plumbing; validate_layout_draft trim + craft-warning wiring + failed-run receipts | #12, #7, #5, #3 |
| 6 | Reader v2 integration + eval harness (structural metrics, Magi critic, M3 judges); score v1 vs v2 | #5, #10 |
| 7 | Whole-book: scope planner, chain executor, cost preflight, library; full WMC single-run golden test | #13 |
| 8 | Hardening + full golden flow + skills iteration from eval scores + merge-review prep | #6, #10, epic |

Reels (#9) afterwards: ~2-3 further sessions. Estimates assume one focused
session per row with review gates between; slips concentrate in rows 5-6
(the visual quality loop) — treat 8 as 8±2.
