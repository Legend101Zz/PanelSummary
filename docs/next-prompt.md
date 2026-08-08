# Next-session prompt (Session 6 of the v2 roadmap)

Session 5 (rendering mechanism live — page-art stage + gates, ModelPolicy
modes, carry-fix trio) completed 2026-08-09 — commits `f534373`…HEAD on
`v2-architecture`; see the Session 5 handoff at the end of NEXT_SESSION.md
and ADR-012 Session 5 addendum entries 1–6. Paste the block below into a
fresh Claude Code session (recommended model: Fable 5, start in plan mode).
Roadmap and rules live in
https://github.com/Legend101Zz/PanelSummary/issues/11 and NEXT_SESSION.md.

```text
Work in /Volumes/Mrigesh SSD/Book-Reel on branch v2-architecture (never
commit to main; verify the branch before any commit). Read first:
NEXT_SESSION.md (2026-08-09 Session 5 handoff at the end — especially the
HEADLINE FINDING), docs/adr/012 INCLUDING the Session 5 addendum (entries
1-6: model-visible projection, craft gate, failed-run traces, ModelPolicy
modes, page-art stage decisions, live gate calibration), docs/adr/009,
docs/evidence/session5-page-art/ (accepted lane-C art + receipts), and
GitHub issues #5, #10, #7 (Session 5 comments) on Legend101Zz/PanelSummary.

Step 0 — the binding constraint first (Session 5 headline finding):
1. Page-writing CONTENT quality: the accepted Session 4 WMC page scripts
   carry ONE-WORD story beats ("hook", "conflict") and ZERO text elements,
   which live-degraded lane-C conditioning (content drift) and made
   lettering vacuous. Fix the manga-page-writing skill + driver
   instructions so accepted scripts carry real, source-grounded story
   beats AND authored dialogue/caption text elements (with speakers from
   continuity where they exist); add a deterministic content-quality gate
   (beat length / text-element presence class checks, warn-vs-block per
   rule like the craft gate). Then produce a FRESH accepted planning set
   on WMC (direction can reuse the accepted plan if lineage allows;
   page-writing + thumbnail re-run on the speed lane, ~$0.03 + ~$0.13
   post-trim actuals) — the Session 4 accepted thumbnail set is
   KNOWN-RTL-defective under the live craft gate and cannot be reader-v2
   material.
2. Regenerate lane-C art for the fresh set through the existing page-art
   stage (state the batch first: 2 pages x $0.039 + retry margin) and
   letter the REAL text elements — the first fully-authored composed v2
   pages.

Main goal (roadmap row 6 — reader v2 + eval harness; issues #5, #10):
1. Reader v2: consume composed_page/rendered-page.v2 compiled geometry in
   frontend/components/MangaReader/ behind a flag; legacy v1 path
   untouched (ADR-009 compatibility: never auto-upgrade v1 pages).
   Promote page_art / composed_page / provider_receipt to
   packages/contracts with fixtures as part of the consumer seam.
2. Eval harness (#10): REAL Layout-IoU vs authored geometry (replaces the
   Session 5 border-adherence stand-in — keep both, IoU is the metric),
   Magi panel-parse agreement if feasible, M3 judge rubrics; score the
   Session 5 accepted pages AND the fresh Step-0 pages; publish the
   3-lane cost/quality matrix into docs/research/ (the unticked #12
   benchmark box).
3. Vision QA upgrades (#7): empty-balloon detection (reject reason),
   persisted QA report artifacts, and port the two donor heading images
   as OCR-gate red fixtures.
4. Composition upgrades (#5): bubble tails + carry v1's vector-scene/
   bubble-rules into the v2 composition stage; lane A (sprites+vector)
   composition path; populate supersedes lineage when regenerating over
   an accepted page_art.

Green gates before claiming done: cd backend && uv run pytest tests/ -q
(722-test baseline preserved + new), pnpm suites (contracts 42 +
agent-runtime 22 + agent-worker 13, preserved + new), node
scripts/generate.mjs --check and PYTHONPATH=. uv run python
scripts/export_contracts.py --check clean, injection suites green, git
diff --check. Then: update NEXT_SESSION.md with an evidence-backed handoff,
tick ONLY genuinely completed checkboxes on #5/#10/#7 (gh issue view N
--json body, edit exact lines, gh issue edit N --body-file — never retype),
rewrite docs/next-prompt.md for Session 7 per the roadmap table, commit in
logical units on v2-architecture, push origin v2-architecture.

Hard rules (owner policy 2026-08-08 — standing, apply to every session):
1. Model modes: speed=MiniMax-M2.7-highspeed, quality=MiniMax-M3, default
   quality (M3). Per-purpose defaults are config (Settings.agent_model_mode_*):
   direction=quality, page-writing/thumbnail=speed, vision LOCKED M3.
   No silent default switches, ever; A/B overrides are explicit and
   receipted (model_mode + model_mode_source now prove it).
2. ALL code changes on v2-architecture or feature branches off it. Nothing
   merges to main until fully tested AND owner-confirmed. main untouched.
3. The laptop's internal SSD is low on space: keep worktrees, artifacts,
   evidence, and heavy files on /Volumes/Mrigesh SSD/.
4. If the external SSD unmounts mid-work: STOP and report. No workarounds.
Plus the constants: text LLM calls are MiniMax-only and budgeted — persist
a receipt for EVERY provider call INCLUDING failures (failed runs now
persist traces + failure_history; keep it that way). Image spend needs an
explicit stated budget BEFORE spending (Session 5 actuals: $0.039/page,
2-page batch $0.078, worst-case with retries 2x); vision QA is
$0.0004/page-call. Preserve all v1 behavior (use_compiled_context AND
agentic_manga_pipeline_v1 default OFF; 722-test baseline stays green).
docs/ is gitignored — git add -f for curated docs. Full-DB backup before
live writes: uv run python scripts/backup_db.py
/tmp/bookreel-s6-before-<what>.json.

Outstanding carry-forwards (do not lose): (a) first REAL flag-on v1 slice
run on a FRESH project (Sessions 2-5 carryover — Step 0's fresh planning
set does NOT satisfy it unless run through generate_project_slice with the
flag on; fold it in if cheap, otherwise carry with reason); (b) worker
egress restriction; (c) ARTIFACT_REPAIR goal policy; (d) layout-template.v1
contract schema + list_layout_templates broker tool + seeded jitter (mask
export landed Session 5); (e) issue #6 knowledge-base rewrite (reference
files are still stubs); (f) issue #3 leftovers: ModelReceipt on every
accepted artifact kind, ADR-001 revision, dashboard-lite, per-purpose
smokes; (g) OCR-gate donor heading fixtures (#7 comment).
```

## Session roadmap (manga lane complete ≈ 8 sessions)

| # | Focus | Issues |
|---|---|---|
| 1 | ✅ 2026-08-07 — ADR-010 + port contracts & durable-context services | #2, #4, #12 |
| 2 | ✅ 2026-08-07 — durable context wired into v1 (ADR-011), scope API, flag-gated ContextPack consumption, continuity proof | #4 |
| 3 | ✅ 2026-08-07 — agent plane live (ADR-012): pnpm workspace, Pi runtime, broker, first live Director goal on M3, injection suites | #8, #3 |
| 4 | ✅ 2026-08-08 — lane-C verdict verified (#12 done); layout compiler + page planning + page_domain_tools port; MANGA_PAGE_WRITING/THUMBNAIL drivers live; 18-template library + craft validators; AGENTIC_MANGA_PIPELINE_V1 shadow lane; Pi details adapter fix; skills 1.3.0/1.4.0; M2.7-highspeed vs M3 bake-off + SVG preview loop on WMC | #5, #6, #3, #8 |
| 5 | ✅ 2026-08-09 — rendering mechanism LIVE: page-art stage (skeleton conditioning, OCR gate w/ noise filter, border adherence, M3 vision QA, v2 composition + code-owned lettering), both WMC pages accepted with exact receipt reconciliation; ModelPolicy speed/quality modes; carry-fix trio (payload trim, craft warn-vs-block gate, durable failed-run receipts). Headline finding: page-writing content quality is now the binding constraint | #12, #7, #5, #3, #8 |
| 6 | Page-writing content fix + fresh WMC set; reader v2 integration + eval harness (Layout-IoU, Magi critic, M3 judges); score v1 vs v2; contract promotion | #5, #10, #7 |
| 7 | Whole-book: scope planner, chain executor, cost preflight, library; full WMC single-run golden test | #13 |
| 8 | Hardening + full golden flow + skills iteration from eval scores + merge-review prep | #6, #10, epic |

Reels (#9) afterwards: ~2-3 further sessions. Estimates assume one focused
session per row with review gates between; slips concentrate in rows 5-6
(the visual quality loop) — treat 8 as 8±2.
