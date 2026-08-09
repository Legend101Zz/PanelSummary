# Post-roadmap page (the 8-session manga-lane roadmap is COMPLETE)

Session 8 (the final roadmap session) completed 2026-08-09 — commits
`1ebedd9`…HEAD on `v2-architecture`. The manga lane's mechanism is
built, instrumented, and measured end-to-end; what remains is the
OWNER'S merge review plus the enumerated open threads below. This page
replaces the per-session prompt: it is the merge-review checklist, the
open-thread ledger, and the golden-chain runbook.

Read first: the Session 8 handoff at the end of NEXT_SESSION.md
(HEADLINE + deviations 1-8 + the MERGE-READINESS section), the ADR-012
Session 8 addendum (entries 1-10), `docs/evidence/session8-bakeoff/`
(winner_criteria.json committed BEFORE spend; scorecards; the A′ probe
economics), `docs/evidence/session8-golden-run/` (chain outcomes + raw
seam dumps), and `docs/research/rendering-lane-matrix.md` (the S8
revision: lane B is the default standard-page lane).

## 1) Merge-review checklist (owner)

- [ ] Read the S8 MERGE-READINESS section (NEXT_SESSION.md end):
      proven vs flag-guarded vs open.
- [ ] Verify the gates yourself: `cd backend && uv run pytest tests/ -q`
      (817), `pnpm --filter @scrollstack/contracts test` (47),
      `pnpm --filter @scrollstack/agent-runtime test` (22) + `typecheck`
      (now CLEAN), `pnpm --filter agent-worker test` (16),
      `node scripts/generate.mjs --check` + `PYTHONPATH=. uv run python
      scripts/export_contracts.py --check`, `git diff --check`.
- [ ] Confirm v1 safety: `use_compiled_context` and
      `agentic_manga_pipeline_v1` default OFF; v1's test surface inside
      the 817 is untouched; v2 writes to `<repo>/storage`, v1 to
      `backend/storage`.
- [ ] Decide the TWO model-policy calls the evidence priced:
      (a) `AGENT_MODEL_MODE_THUMBNAIL=quality` for the chain's thumbnail
      (speed-lane schema flailing is the measured blocker; ~$0.09-0.16 a
      resume); (b) the A′ per-panel question — exact binding at a FLAT
      $0.0389/panel = 4x per page (docs/evidence/session8-bakeoff/
      a_probe.json, honest_verdict field).
- [ ] Decide merge timing: after one completed golden scope
      (recommended; see runbook below) OR now with the chain carried as
      flag-guarded WIP. Both defensible — flags keep v1 byte-identical.
- [ ] Approve (or defer) lane-B default wiring into
      `manga_page_art_stage` — the bake-off winner is script-proven;
      promotion re-keys the paid stage (`PAGE_ART_VERSION` bump) and was
      deliberately NOT done without review.
- [ ] Magi integration: checkpoint download + `trust_remote_code` under
      the egress posture (carry-forward h) — approve or park.

## 2) Open threads (carry-forwards, consolidated)

1. **Golden chain completion**: scope 0 needs ONE thumbnail acceptance
   (capability wall, owner option above), then art (~$0.156 ceiling) +
   per-scope scorecard + the FIRST LIVE memory merge
   (`active_memory_version` 1 → 2, exactly once — currently test-proven
   only, verified unchanged at 1).
2. **Reel lane (#9)**: ~2-3 sessions, untouched by the roadmap.
3. **#13 spine**: AdaptationPlanDoc, Celery wiring,
   cancellation/supersede, continue UX, preflight UI, full-book +
   2-chunk golden.
4. **Bake-off follow-ups**: lane-B stage wiring (above); the A′ cost
   decision; lane-A (sprites+vector) composition path + rendered-page.v2
   assembly (still unmeasured — the one #12 matrix row without numbers);
   binding-referee variance (single-panel verdicts move ±1 category
   between runs — average 3 runs or gate on the composed-set level).
5. **Fidelity**: the score is still 1/5 with binding SOLVED — the
   channel is claims-density now: more pages per scope, composition-v3
   captions (landed), denser authored text (skill 1.6.0 landed), or
   more art panels (A′). Re-measure after the next accepted planning set.
6. **Standing smaller items**: first REAL flag-on v1 slice on a FRESH
   project; worker egress restriction; ARTIFACT_REPAIR reviewed-lane
   policy (FIVE normalized transport classes now argue for it); issue #6
   reference stubs; #3 leftovers (ModelReceipt on every accepted
   artifact, ADR-001 revision, dashboard-lite, per-purpose smokes);
   vision-QA style-match wording (#7); layout-template.v1 contract +
   list_layout_templates + seeded jitter.
7. **Housekeeping**: bake-off composed rows (author `s8-bakeoff`) are
   latest-per-page on `run_dir_a99464c…` — future latest-pick evals on
   that run see them; reader-v2 is flag-off so no user impact. The
   defective first binding-referee scorecard is superseded, retained as
   evidence.

## 3) Golden-chain runbook (end-to-end, as S8 ran it)

Services: `./start.sh` at the repo root now starts the whole stack —
v1 surface plus broker :8010 and both workers :8788/:8789 — with tokens
persisted in `.dev/agent-tokens.env` (`source` it before chain runs;
`./check.sh` shows status, `./stop.sh` stops). The manual per-process
form below remains for seam-dump/custom-env runs. (The stale docker
`scrollstack-*` containers on :8000/:27017 are NOT this stack — do not
reuse them; the v2 lane's durable authority is the Atlas cluster in
`backend/.env`.)

```bash
# 1) broker/backend on :8010 with the seam dump armed
cd backend && AGENT_SEAM_RAW_DUMP_DIR=<abs-evidence-dir>/raw_dumps \
  DOMAIN_TOOL_BROKER_TOKEN=<48-hex> \
  uv run uvicorn app.main:app --host 127.0.0.1 --port 8010

# 2) speed worker :8788 and quality worker :8789 (fresh shell each)
cd apps/agent-worker && AGENT_WORKER_PORT=8788 \
  AGENT_WORKER_TOKEN=<48-hex-2> \
  DOMAIN_TOOL_BROKER_URL=http://127.0.0.1:8010 \
  DOMAIN_TOOL_BROKER_TOKEN=<same-as-backend> \
  AGENT_PROVIDER=minimax AGENT_MODEL=MiniMax-M2.7-highspeed \
  AGENT_MODEL_API_KEY_ENV=MINIMAX_API_KEY MINIMAX_API_KEY=<from backend/.env> \
  pnpm start
# ...same with AGENT_WORKER_PORT=8789 and AGENT_MODEL=MiniMax-M3

# 3) backup, then ONE budgeted chain execution (state the budget FIRST)
cd backend && uv run python scripts/backup_db.py /tmp/bookreel-<tag>.json
AGENT_WORKER_TOKEN=<48-hex-2> \
  AGENT_SEAM_RAW_DUMP_DIR=<same-dir> \
  uv run python scripts/whole_book_wmc_s8.py --text-budget 0.90 --image-budget 0.25
# add AGENT_MODEL_MODE_THUMBNAIL=quality to the backend env for the
# owner-option resume (receipted via model_mode_source)
```

Workers read skills from `src/skills/*/SKILL.md` at STARTUP (tsx, no
build) — restart workers after skill edits; the served version is the
frontmatter version (honest since S8). Evidence lands in
`docs/evidence/<tag>/`; chain outcome JSON + raw dumps are the
diagnosis surface. Expected: direction + page-writing REUSE at $0;
thumbnail is the open wall; art degrades to dsl_only on rejection; the
scope completes with a chain-persisted scorecard + ONE memory-version
advance.

Bake-off harness (repeatable):
`uv run python scripts/bakeoff_s8_binding.py --phase criteria|a-probe|b|c|eval`
(criteria first — it pre-commits the winner rules; every phase states a
budget and refuses calls beyond it).

## 4) Standing owner rules (unchanged, apply to ANY future session)

1. Model modes: speed=MiniMax-M2.7-highspeed, quality=MiniMax-M3,
   default quality; per-purpose defaults are config
   (`Settings.agent_model_mode_*`); vision LOCKED M3. No silent
   switches; A/B overrides explicit + receipted.
2. ALL code on `v2-architecture` or branches off it; nothing merges to
   main until fully tested AND owner-confirmed.
3. Keep worktrees/artifacts/evidence on /Volumes/Mrigesh SSD/.
4. If the external SSD unmounts mid-work: STOP and report.
Plus: MiniMax-only text, receipts for EVERY provider call including
failures; image spend needs a stated ceiling + stop line BEFORE
spending; full-DB backup before live writes; docs/ is gitignored —
`git add -f` for curated docs.

## Roadmap ledger (complete)

| # | Focus | Issues |
|---|---|---|
| 1-7 | ✅ (see prior versions of this file / NEXT_SESSION.md) | — |
| 8 | ✅ 2026-08-09 — bake-off: B wins (binding 1.0 by construction, $0.039/page); one-shot binding failed a 3rd conditioning version (thrice-measured); A′ flat-price probe → owner decision; every chain SEAM wall down (capability wall remains, owner option priced); composition v3 + skills 1.6.0; overrides + budget folds; agent-runtime tsc FIXED; merge-readiness written | #12, #7, #10, #6, #13, epic #11 |
