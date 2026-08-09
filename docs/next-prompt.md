# Next-session prompt (Session 8 of the v2 roadmap)

Session 7 (the tool-frame wall FELL — first fully-authored planning set
accepted on both lanes; whole-book chain mechanism live with a 4-wall
golden partial; fidelity measured 1/5 BOTH ways — it needs art AND text
bound to the same panels) completed 2026-08-09 — commits
`336f9f5`…HEAD on `v2-architecture`; see the Session 7 handoff at the
end of NEXT_SESSION.md and the ADR-012 Session 7 addendum (entries
1-10). Paste the block below into a fresh Claude Code session
(recommended model: Fable 5, start in plan mode). Roadmap and rules live
in https://github.com/Legend101Zz/PanelSummary/issues/11 and
NEXT_SESSION.md.

```text
Work in /Volumes/Mrigesh SSD/Book-Reel on branch v2-architecture (never
commit to main; verify the branch before any commit). Read first:
NEXT_SESSION.md (2026-08-09 Session 7 handoff at the end — the TWO-PART
HEADLINE and deviations 1-7), docs/adr/012 INCLUDING the Session 7
addendum (entries 1-10: the dump instrument, frame truncation, the armed
text lane, transport-empty classes, the direction-seam treatment, the
gate-wording rule, thumbnail axis geometry, PAGE_ART v2 + the
twice-measured binding limitation, the two-channel fidelity thesis, the
issue-#13 chain cut), docs/evidence/session7-page-art/ (the rejected-art
exemplars + receipts.jsonl), docs/evidence/session7-eval/
(s7_composed_scorecard.json + s6_vs_s7_composed_diff.json), and
docs/evidence/session7-golden-run/chain_outcome.json.

Step 0 — FINISH THE GOLDEN CHAIN (small, surgical; the machinery is one
wall from a complete scope):
1. Diagnose wall 4 FREE first: "PageScriptSet is not an accepted
   ContextPack parent" at the golden thumbnail
   (stage_manga_thumbnail_9d5460abf387aa8e1eb3, run
   run_dir_c6bfbb6ab031c36645ee3151). validate_layout_draft and the
   _authorized_script_set path have NO raw dump — add one (the seam-dump
   helper takes one call site), and check the simplest hypothesis
   offline: the thumbnail ContextPack's parent_artifacts vs the id the
   model cites (accepted_page_script_set_cf19f45c6e614cafa06d254d). The
   context compile for the thumbnail purpose lists parents [plan,
   script] — if the pack predates the accepted script (attempt-stacking)
   the authorization is stale, which is a compile-ordering bug, not a
   model error.
2. ONE chain resume after the fix (direction + page-writing REUSE at $0;
   thumbnail ~$0.09-0.16 speed; art ceiling 2 pages x $0.039 x 2; eval
   ~$0.002). Expect art rejected again -> dsl_only; the scope still
   completes: per-scope scorecard persisted BY THE CHAIN + the first
   LIVE memory merge (verify project.active_memory_version advanced
   exactly once and the next compile sees it). Budget the resume
   explicitly and stop at your stated line.

Main goal (the S8 headline problem — issue #12/#7/#10): LANE-C PANEL
BINDING. Eight rejected art attempts across two conditioning versions
prove one-shot full-page generation does not bind per-panel content to
RTL geometry (right content, wrong panels, every time — see the
session7-page-art exemplars). Fidelity cannot move until art and text
land in the SAME panels. Run a budgeted BAKE-OFF with the eval harness
as referee (compare_scorecards is live; judge $0.0005/page):
1. Candidate A — per-panel generation + deterministic assembly: one
   image call PER PANEL conditioned on that panel's brief + character
   refs, pasted into the compiled geometry by code (the compose stage
   already owns lettering/assembly). Probe a 2-panel page first and
   STATE the economics before scaling (naive cost is panels x $0.039 —
   4-8x lane-C — so measure whether smaller per-panel images price
   lower; if not, this lane needs an explicit owner cost decision).
2. Candidate B — lane-B key panel: ONE money-shot panel per page
   ($0.039), DSL base for the rest; composed text carries the claims.
   Cheapest path to a fidelity signal; splash/spread pages already
   route here by policy.
3. Candidate C — hardened one-shot conditioning: region-tagged prompt
   (the v2 position phrases stay), panel-content thumbnails INSIDE the
   skeleton image, retry-hardening that names the binding failure.
   Cheapest if it works; two batches say it probably will not.
Accept per the harness: vision QA panel match + judge fidelity on the
composed result; persist scorecards + the diff vs the S7 baseline
(eval_scorecard_a575909be3d6023a2df175eb). The winner becomes the
default standard-page lane in the #12 matrix (update
docs/research/rendering-lane-matrix.md with measured numbers).

Also fold in (small, high-value): skills iteration from the eval scores
(issue #6 — readability 2-3 on dsl_only argues denser text placement +
larger type floors in the compositor); the executor budget note
(failed-attempt spend should decrement the chain's remaining budget —
receipts already exist in failure_history); a negative-page_index guard
in _coerce_int; scope planner include/exclude overrides (#13 — WMC's
title section currently plans into scope 0).

Green gates before claiming done: cd backend && uv run pytest tests/ -q
(793-test baseline preserved + new), pnpm suites (contracts 47 +
agent-runtime 22 + agent-worker 13, preserved + new), node
scripts/generate.mjs --check (packages/contracts) and PYTHONPATH=. uv
run python scripts/export_contracts.py --check clean, injection suites
green, frontend next build + tsc --noEmit green if touched, git diff
--check. Known pre-existing: packages/agent-runtime tsc --noEmit fails
in test/injection.test.ts (vitest passes) — fix or record, do not hide.
Then: update NEXT_SESSION.md with an evidence-backed handoff, tick ONLY
genuinely completed checkboxes on #12/#10/#13 (gh issue view N --json
body, edit exact lines, gh issue edit N --body-file — never retype),
rewrite docs/next-prompt.md for Session 9 per the roadmap table, commit
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
explicit stated budget BEFORE spending ($0.039/page lane-C measured;
S7 burned 2x$0.156 on rejected batches — state ceilings AND stop lines).
Vision QA $0.0004/page-call and judges $0.0005/page-call bill the
MINIMAX key (vision is locked M3) — bin them there. Updated planning
actuals: M3 page-writing $0.036-0.075/attempt, direction
$0.034-0.053/attempt, speed page-writing $0.038, speed thumbnail
$0.061-0.158/attempt. Preserve all v1 behavior (use_compiled_context AND
agentic_manga_pipeline_v1 default OFF; 793-test baseline stays green;
the v2 lane writes to <repo>/storage, v1 to backend/storage — never
cross them). docs/ is gitignored — git add -f for curated docs. Full-DB
backup before live writes: uv run python scripts/backup_db.py
/tmp/bookreel-s8-before-<what>.json. AGENT_SEAM_RAW_DUMP_DIR arms the
seam dump (env-only, default off) — run live attempts WITH it.

Outstanding carry-forwards (do not lose): (a) first REAL flag-on v1
slice run on a FRESH project (Sessions 2-7 carryover); (b) worker egress
restriction; (c) ARTIFACT_REPAIR goal policy — S7 normalized FOUR
transport artifact classes at the seam; the case for a reviewed repair
lane is now strong; (d) layout-template.v1 contract schema +
list_layout_templates broker tool + seeded jitter; (e) issue #6
knowledge-base rewrite (reference files are still stubs); (f) issue #3
leftovers: ModelReceipt on every accepted artifact kind, ADR-001
revision, dashboard-lite, per-purpose smokes; (g) vision-QA style-match
vs reference (the #7 wording not yet scored); (h) Magi integration after
owner review of checkpoint download + trust_remote_code; (i) lane A
(sprites+vector) composition path + rendered-page.v2 assembly; (j) #13
spine: AdaptationPlanDoc, Celery wiring, cancellation/supersede,
continue UX, preflight UI, full-book + 2-chunk golden.
```

## Session roadmap (manga lane complete ≈ 8 sessions)

| # | Focus | Issues |
|---|---|---|
| 1 | ✅ 2026-08-07 — ADR-010 + port contracts & durable-context services | #2, #4, #12 |
| 2 | ✅ 2026-08-07 — durable context wired into v1 (ADR-011), scope API, flag-gated ContextPack consumption, continuity proof | #4 |
| 3 | ✅ 2026-08-07 — agent plane live (ADR-012): pnpm workspace, Pi runtime, broker, first live Director goal on M3, injection suites | #8, #3 |
| 4 | ✅ 2026-08-08 — lane-C verdict verified (#12 done); layout compiler + page planning + page_domain_tools port; MANGA_PAGE_WRITING/THUMBNAIL drivers live; 18-template library + craft validators; AGENTIC_MANGA_PIPELINE_V1 shadow lane; Pi details adapter fix; skills 1.3.0/1.4.0; M2.7-highspeed vs M3 bake-off + SVG preview loop on WMC | #5, #6, #3, #8 |
| 5 | ✅ 2026-08-09 — rendering mechanism LIVE: page-art stage + gates, both WMC pages accepted with exact receipt reconciliation; ModelPolicy speed/quality modes; carry-fix trio. Headline: page-writing content quality is the binding constraint | #12, #7, #5, #3, #8 |
| 6 | ✅ 2026-08-09 — content gate + composition upgrades + vision-QA v3 + contract promotion + reader v2 behind a flag + eval harness. Judge lane measured fidelity 1/5 on wordless pages. Fresh planning set BLOCKED: 10 receipted attempts, four walls diagnosed; carried with a landing plan | #5, #10, #7 |
| 7 | ✅ 2026-08-09 — the tool-frame wall FELL: seam dump + normalizations + armed text lane landed page-writing (M3 a14, speed in-chain) AND thumbnail; whole-book planner/executor with preflight+resume+rolling canon (10 tests) + 4-wall golden partial; eval_scorecard promotion + scorecard diff + reader art fallback; fidelity 1/5 both ways — lane-C panel BINDING is the blocker (8/8 art rejections, 2 conditioning versions) | #13, #5, #10 |
| 8 | Panel-binding bake-off (per-panel / lane-B / hardened one-shot) with the harness as referee; finish the golden chain (wall 4 + one resume); skills iteration from eval scores; merge-review prep | #12, #7, #10, #6, epic |

Reels (#9) afterwards: ~2-3 further sessions. Estimates assume one focused
session per row with review gates between; the binding bake-off carries
image-spend risk — state ceilings and stop lines before every batch.
