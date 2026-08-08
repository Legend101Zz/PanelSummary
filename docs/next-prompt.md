# Next-session prompt (Session 4 of the v2 roadmap)

Session 3 (agent plane live — issues #8 + first half of #3) completed
2026-08-07 — commits `139c738`…HEAD on `v2-architecture`; see the Session 3
handoff at the end of NEXT_SESSION.md and docs/adr/012. Paste the block below
into a fresh Claude Code session (recommended model: Fable 5, start in plan
mode). Roadmap and rules live in
https://github.com/Legend101Zz/PanelSummary/issues/11 and NEXT_SESSION.md.

```text
Work in /Volumes/Mrigesh SSD/Book-Reel on branch v2-architecture (never commit
to main; verify the branch before any commit). Read first: NEXT_SESSION.md
(2026-08-07 Session 3 handoff at the end), docs/adr/012 (agent plane port +
broker + live-run deviations), docs/adr/009 (manga page DSL v2), docs/adr/004
(tool allowlists), docs/TECHNICAL_ARCHITECTURE_BLUEPRINT.md sections 11-12 and
the Phase 3 build order in section 22, and GitHub issues #5 and #6 on
Legend101Zz/PanelSummary.

Step 0 — ALREADY DONE (2026-08-08, in the planning session): the lane-C
experiment ran; verdict VIABLE-with-guardrails. Receipts + committed evidence in
docs/research/art-economics/ (findings.md results section + out/), verdict
comment on issue #12. Do NOT re-run it; NO image-model spend is authorized in
this session.

Main goal (issues #5 + #6 = blueprint Phase 3 first half: the layout lane):
1. Port ScrollStack's page-layout compiler + craft validators from local main
   @ 43300b5 (same port rule as ADR-010/012: code + tests + docs verbatim;
   boundary edits enumerated in a new ADR or ADR-012 addendum). This is
   page_domain_tools.py's dependency set deferred in Session 3:
   manga_layout.py, manga_page_planning.py, manga_validation.py, and the
   layout-template library.
2. Port page_domain_tools.py (MangaPlanningToolService) now that its imports
   exist, and add the MANGA_PAGE_WRITING + MANGA_THUMBNAIL goal drivers on the
   same runtime the Director already runs on (the policies and skills are
   already ported and green). Reuse the Session 3 MangaDirectorService shape.
3. Wire the page-script and thumbnail stages behind AGENTIC_MANGA_PIPELINE_V1
   as fallback-guarded stages (blueprint §12.3): default OFF, v1 output
   byte-identical when off.
4. SVG preview loop: compile one WMC chapter's page plans to thumbnail SVGs
   (render_thumbnail_svg) and eyeball reading order — no image-model calls.
5. Tests for everything new; extend the injection suite to the new tool
   allowlists (a page-writing goal cannot reach Director-only tools).

Goal B (owner-requested model bake-off — MiniMax-M2.7-highspeed vs M3, see
https://platform.minimax.io/docs/guides/models-intro: "same performance as
M2.7, significantly faster inference"): through the SAME pinned-Pi driver,
first a tiny structured-JSON smoke on MiniMax-M2.7-highspeed (history: M2.5-
highspeed failed exactly this on 2026-07-10 — never burn a full goal before
the smoke passes; if the smoke fails, record it and run everything on M3).
Then run the SAME Manga Director goal on both models, and one page-writing
goal on each, with receipts for every call (tokens, cost, latency, validator
attempts). Judge with the deterministic validators plus honest side-by-side
notes on plan quality. Decision rule — NEVER silently switch defaults: if
quality is equivalent, change nothing and record that the fast lane is
confirmed per issue #3's policy table; if M3 is clearly better, change
nothing and flag it PROMINENTLY in the report and handoff as an open owner
decision. Post the comparison table (model, tokens, cost, latency, validator
attempts, quality notes) as a comment on issue #3.

Green gates before claiming done: cd backend && uv run pytest tests/ -q
(609-test baseline preserved + new tests), TS side (pnpm -r test: 42+19+12
preserved + new), node scripts/generate.mjs --check clean both languages,
injection tests green, git diff --check. Then: update NEXT_SESSION.md with an
evidence-backed handoff, tick ONLY genuinely completed checkboxes on issues
#5/#6 (gh issue view N --json body, edit exact lines, gh issue edit N
--body-file — never retype the body), rewrite docs/next-prompt.md for
Session 5 per the roadmap table, commit in logical units on v2-architecture
with conventional messages, and push origin v2-architecture.

Hard rules: main untouched. Text LLM calls are MiniMax-only per issue #3 and
budgeted — persist a receipt for EVERY provider call (page-writing goals run
on MiniMax-M2.7-highspeed per the issue-#3 policy table, NOT M3; confirm the
model resolves from the pinned Pi catalog before spending). Budget with the
Session 3 actuals (~$0.07 / ~5 min per M3 direction goal; high-speed stages
should be cheaper — measure). Image spend: NONE authorized this session — lane-C already ran on
2026-08-08 (the OpenRouter key is image-only; its ~$9.9 remaining is not
general budget). Preserve all v1
behavior (use_compiled_context stays default OFF; the 609-test backend
baseline stays green; add tests for everything new). docs/ is gitignored —
use git add -f for curated docs. Back up any benchmark data before
destructive operations (pattern: /tmp/bookreel-s3-before-live-director.json).

Outstanding carry-forwards (do not lose): (a) DONE 2026-08-08 — lane-C ran,
verdict on #12; (b) first REAL flag-on v1 slice run on a FRESH project (Session 2/3
carryover — WMC's arc is fully covered); (c) durable tool-call trace
persistence; (d) worker egress restriction. Pick up (b) here if a fresh
project is cheap to stand up, otherwise carry it again with the reason.
```

## Session roadmap (manga lane complete ≈ 8 sessions)

| # | Focus | Issues |
|---|---|---|
| 1 | ✅ 2026-08-07 — ADR-010 + port contracts & durable-context services (lane-C verdict still blocked on key limit) | #2, #4, #12 |
| 2 | ✅ 2026-08-07 — durable context wired into v1: beanie-1.27 bridge (ADR-011), structure-aware source units + front-matter detection, scope API, flag-gated ContextPack consumption, two-scope fresh-process continuity proof on WMC (UI + first real flag-on slice run still open) | #4 |
| 3 | ✅ 2026-08-07 — agent plane live (ADR-012): pnpm workspace + contracts TS side (Phase 0 exit), agent-runtime/agent-worker port, domain-tool broker, first live Manga Director goal on MiniMax-M3 (validated MangaPlan + receipt), injection suites. page_domain_tools + flag-on slice run still open | #8, #3 |
| 4 | Layout compiler + page-script/thumbnail stages + template library + craft validators; page_domain_tools port + MANGA_PAGE_WRITING/THUMBNAIL goals; SVG preview loop on one WMC chapter | #5, #6 |
| 5 | Rendering mechanism build-out per lane-C verdict: page-art stage, OCR gate, vision QA, slicing, v2 composition + lettering (carry v1 bubble/vector work) | #12, #7, #5 |
| 6 | Reader v2 integration + eval harness (structural metrics, Magi critic, M3 judges); score v1 vs v2 | #5, #10 |
| 7 | Whole-book: scope planner, chain executor, cost preflight, library; full WMC single-run golden test | #13 |
| 8 | Hardening + full golden flow + skills iteration from eval scores + merge-review prep | #6, #10, epic |

Reels (#9) afterwards: ~2-3 further sessions. Estimates assume one focused session
per row with review gates between; slips concentrate in rows 5-6 (the visual
quality loop) — treat 8 as 8±2.
