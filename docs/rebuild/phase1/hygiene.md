# Phase 1 audit — repository hygiene, dead code, documentation, dependencies, dev stack

- Repository: `/Volumes/Mrigesh SSD/Book-Reel`
- Branch: `product/harness-manga` at `a5e4fbc` (parent `47ea74d`, the `v2-architecture` head).
- Date: 2026-09-25.
- Mode: read-only. This audit changed no tracked file. It wrote only this report and scratch files.
- Language: this page follows the `CLAUDE.md` "Language" rule (Simplified Technical English, pragmatic mode). The locked verb for "take away" is `remove`. Thus the master table uses **REMOVE** where the brief says DELETE.

Evidence labels:

| Label | Meaning |
|---|---|
| Code-resolved | I read the code and the cited lines prove the claim. |
| Runtime-observed | I ran a command in this session and saw the result. |
| Doc-claim | A document states it. I did not verify it. |
| Inference | My conclusion from the evidence. It is not proven. |

---

## 0. Headline

1. The dev scripts are **not safe** for this rebuild. `stop.sh` kills any non-Docker process on port 3000, which is the Hermes bridge. `start.sh` refuses to start while port 3000 is busy, and it tells the user to run `./stop.sh`. All backend processes read `MONGODB_URL` from `backend/.env`, which is the owner's Atlas database.
2. The legacy summary, living-panel and reel **routes are already gone** (git `306f3e6`, `cde8221`, 2026-05-04). What remains is residue: stale comments, docs, contracts, one Remotion package, dead frontend files, unused dependencies, and stale bytecode.
3. The largest removable surface is the **image-generation cluster**: about 4,650 backend lines, 14 of 87 backend test modules, the OpenRouter routes, the image UI, and about 39 MB of image evidence.
4. About **16 MB of valuable files are untracked and are not in the 2026-09-25 backup tarball**. The most important one is `docs/research/wmc-fullbook-defect-analysis.md`. Save these files before any cleanup.
5. The suites are green: backend 822 passed, TypeScript 47/22/16 passed, both contract generators are current, frontend `tsc` passes. The green state proves little about the product path, because the default Generate path is the v1 lane with images on by default.

---

## 1. Safety findings (read these first)

| # | Finding | Evidence | Label |
|---|---|---|---|
| S1 | `stop.sh` frees port 3000 by killing every non-Docker listener. The Hermes WhatsApp bridge (`node`, pid 1663) holds port 3000 now. A run of `./stop.sh` kills it. | `stop.sh:51-77` (`free_port`), `stop.sh:94` (`free_port 3000 "frontend"`). `lsof` showed `node pid=1663` on 3000. | Code-resolved + Runtime-observed |
| S2 | `start.sh` fails when port 3000 is busy and a non-Docker process holds it. The error text tells the user to run `./stop.sh`, which triggers S1. | `start.sh:82` (port list includes 3000), `start.sh:97`. | Code-resolved |
| S3 | Backend, Celery and broker start with the working directory `backend/`. `Settings` reads `backend/.env`. Nothing in `start.sh` overrides `MONGODB_URL`. As a result, the whole stack writes to the owner's Atlas database. | `start.sh:123,186-187,195-197,215-217`, `backend/app/config.py:125-127`. Without an override, `Settings().mongodb_url` has scheme `mongodb+srv` and a non-local host. | Code-resolved + Runtime-observed |
| S4 | A process-level `MONGODB_URL` wins over `backend/.env` (pydantic-settings 2.6.1). A safe start script can therefore force the disposable Mongo. | `MONGODB_URL=mongodb://127.0.0.1:27018/... Settings()` gave `override_honoured=True`. | Runtime-observed |
| S5 | All 15 `backend/scripts/*.py` use `settings.mongodb_url`. If you run them from `backend/`, they connect to Atlas. Nine of them also hardcode project `6a0b5a5b201a8d03f1d82503`. | For example `backend/scripts/whole_book_wmc_s8.py:62-63,78`, `backend/scripts/backup_db.py:25`. | Code-resolved |
| S6 | `.dev/pids/*.pid` hold six PIDs from 2026-08-09 (5053-5059). `stop_pid_file` kills any live process with that PID and does not verify the command. After a PID reuse, `stop.sh` can kill an unrelated process. | `stop.sh:25-49`. The six PIDs are not running now. | Code-resolved + Runtime-observed |
| S7 | Celery reads `REDIS_URL` from the process environment only (default db 0). `settings.redis_url` has no reader. The shared Homebrew Redis db 0 is the default broker. | `backend/app/celery_worker.py:22-28`, `backend/app/config.py:33`, and a `grep` for `redis_url` found one hit only. `backend/.env` `REDIS_URL` has no db index. | Code-resolved + Runtime-observed |
| S8 | The backend on `0.0.0.0:8000` mounts the internal agent-tool router. If `DOMAIN_TOOL_BROKER_TOKEN` is not in the environment, the token is the literal `local-domain-tool-token-change-me`. `start.sh` exports the real token first (`set -a`), but the README manual path and `docker-compose.yml` do not. | `backend/app/main.py:88-95`, `start.sh:176-178`. | Code-resolved |
| S9 | `build_manga_project_task` takes the browser OpenRouter key as a Celery argument. As a result, the key goes into the Redis broker message. | `backend/app/celery_manga_tasks.py:43-49`. | Code-resolved |
| S10 | `GET /openrouter/models` falls back to the server-owned `OPENROUTER_API_KEY` when the caller sends no key. It also takes a key in the query string, and query strings go to access logs. | `backend/app/api/routes/media.py:81-83`, `frontend/lib/api.ts:89`. | Code-resolved |
| S11 | Untracked files that are not in git and not in `Book-Reel-backups/uncommitted-2026-09-25.tgz`: `docs/research/wmc-fullbook-defect-analysis.md` (51 KB), `docs/architecture.html`, `docs/manga-first-product-blueprint.html`, `docs/two-person-hackathon-plan.html`, `docs/evidence/session6-fresh-planning/fresh_planning_receipts.json`, 13 `docs/renderer-analysis/experiments/2026-06-07-*.png`, `.dev/db-backups/` (two `mongodump` trees of Atlas data, 2.1 MB), `storage/` (41 MB), `backend/storage/` (40 MB). If you remove them, you cannot get them back. | `git status --ignored`, `tar -tzf` of the backup tarball (it holds only `.agents`, `.claude`, `.project-factory`, `CLAUDE.md`). | Runtime-observed |
| S12 | `.gitignore:38-39` ignores `docs`. The 165 tracked docs files were force-added. New docs, including `docs/rebuild/`, stay untracked unless someone runs `git add -f`. | `git check-ignore -v docs/rebuild/phase1/hygiene.md` → `.gitignore:39:docs`. | Runtime-observed |

No secret value appears in tracked files, docs, evidence or `.dev/logs`. I scanned for `sk-…`, `sk-or-v1`, JWT, long bearer strings, AWS/OSS presigned signatures and `mongodb+srv://…@`. The only hits are two placeholders: `frontend/components/ApiKeyModal.tsx:40` and `frontend/components/MangaV2ProjectPanel.tsx:682`. (Runtime-observed.)

---

## 2. Top-level inventory

Size is disk size. "Tracked" means that `git ls-files` lists it.

| Path | Tracked | What it is | Status | Evidence | Verdict |
|---|---|---|---|---|---|
| `AGENTS.md` | yes | Byte copy of `CLAUDE.md` without the "Language" section. | Duplicate, stale | `diff AGENTS.md CLAUDE.md` shows only the 28-line Language hunk. | REWRITE (one-line pointer to `CLAUDE.md`) |
| `CLAUDE.md` | yes | Agent guide. The Language section (lines 141-167) is the owner's current rule. The other sections are stale (section 3). | Partly live | section 3 | REWRITE (keep the Language section word for word) |
| `NEXT_SESSION.md` | yes | 1,978-line log, 2026-07-05 → Session 8 (2026-08-09). | Stale history | `grep '^## '` | REMOVE after you extract the lessons in section 11 |
| `findings.md`, `progress.md`, `task_plan.md` | yes | Planning-with-files output of the 2026-07-05 analysis-only session. | Stale | Their headers. Last commit `0f6e7b7` (2026-07-10). | REMOVE |
| `README.md` | yes | Claims start on `:3000`, image lane B, v1 authority. | Stale | section 3 | REWRITE |
| `reel-renderer/` | yes (20 files) + 472 MB `node_modules` | Remotion 4 experiment. Not wired. Last commit 2026-04-09. | Dead | Only docs reference it (`git grep reel-renderer`). | REMOVE |
| `apps/agent-worker/` | yes | Fastify host for Pi sessions. | Live (harness) | 16 tests pass | KEEP (prune dead goals, section 6.4) |
| `packages/agent-runtime/`, `packages/contracts/`, `packages/fixtures/` | yes | Pi boundary, JSON Schema + TS contracts, fixtures. | Live (harness) | 22 + 47 tests pass. Generators current. | KEEP (prune reel and image contracts) |
| `backend/` | yes | FastAPI, Celery, v1 lane, agentic lane, broker. | Mixed | sections 6, 8 | KEEP core, REMOVE clusters |
| `backend/app/reel_engine/` | no | Seven `.pyc` files only. The source was removed in `306f3e6` (2026-05-04). | Dead | `find backend/app/reel_engine` | REMOVE |
| `backend/scripts/` | yes (15) | Session probes and bake-offs (3,858 lines). | Stale | section 6.3 | REMOVE most. KEEP `export_contracts.py`. |
| `frontend/` | yes | Next.js 15 app (npm, outside the pnpm workspace). | Mixed | section 7 | KEEP core, REWRITE Generate + reader |
| `docs/` | 165 tracked, 17 untracked | ADRs, evidence, research, old plans. | Mostly stale | section 5 | See section 5 |
| `storage/` | only `storage/.gitignore` | v2-lane media root: PDFs, images, page-art, composed pages. | Live data | `backend/app/main.py:78-86` | KEEP out of git. Unify with `backend/storage/`. |
| `backend/storage/` | no | v1 media root. `_default_storage()` picks the first parent that has `storage/`, and that parent is `backend/`. | Live data, duplicate root | `backend/app/config.py:12-24` | KEEP data. Set `STORAGE_DIR` to one root. |
| `.dev/` | no | pids, logs, `agent-tokens.env`, `monitor-fullbook.sh`, `db-backups/`, `fullbook-project-id`. | Runtime state + owner data | `find .dev` | KEEP. Owner decides on `db-backups/`. Clear stale pids with the new stop script. |
| `.vscode/settings.json` | yes | Personal Snyk and codelens preferences. | Not product | file content | REMOVE from git |
| `docker-compose.yml` | yes | Mongo, Redis, backend, Celery, frontend. No broker, no agent workers. Binds 3000, 6379, 27017. | Stale, conflicting | `docker-compose.yml:7,18,28,74` | REMOVE (or REWRITE later) |
| `backend/Dockerfile` | yes | Uses `UV_INDEX_URL=https://pypi.ci.artifacts.walmart.com/...`. | Broken outside that network | `backend/Dockerfile:5-6` | REMOVE (or REWRITE) |
| `frontend/Dockerfile` | yes | Runs `npm run dev` in the image. | Dev-only | `frontend/Dockerfile:14` | REMOVE (or REWRITE) |
| `apps/agent-worker/Dockerfile` | yes | Copies `packages/design-tokens/package.json` (the directory does not exist) and `frontend/package.json` (not a workspace member). | Broken | `apps/agent-worker/Dockerfile:12-13` | REWRITE or REMOVE |
| `node_modules/` (root) | no | pnpm virtual store (294 MB) for `apps/*` and `packages/*`. Worker packages link to it. | Live | `apps/agent-worker/node_modules/@scrollstack/*` are symlinks | KEEP (ignored) |
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json` | yes | Workspace root. The name is the donor name `scrollstack`. | Live | `pnpm -r test` ran | KEEP |
| `.project-factory/` | yes (since `a5e4fbc`) | 2026-08-10 recovery brain and views. | Stale history | section 4 | REMOVE after you fold the decisions |
| `.claude/skills/simple-english/` | yes | Vendored STE skill (MIT). `CLAUDE.md` uses it. | Live | `CLAUDE.md:141-167` | KEEP |
| `.claude/skills/run-project-factory/`, `.agents/skills/run-project-factory/` | yes | Same generic skill twice (`diff -rq` shows identical). | Duplicate, not product | section 4 | Owner decision (section 13) |
| `.gitignore` | yes | Ignores `docs`. Has a Walmart Copilot entry (`:30`). | Partly wrong | S12 | REWRITE |
| `.pytest_cache/`, `.DS_Store` | no | Tool and OS residue. | Noise | ignored | Ignore |

---

## 3. `CLAUDE.md` / `AGENTS.md` / `README.md`: statements that are false now

| File:line | Statement | Reality | Label |
|---|---|---|---|
| `CLAUDE.md:20-42` | "Current Diagnosis (2026-07-05)" is the thing to read first. | Sessions 6-8 moved the constraint (see `NEXT_SESSION.md:1625+`). The 2026-09-25 owner brief replaces both. | Code-resolved (dates) |
| `CLAUDE.md:44-80` | The render path is the v1 storyboard → `RenderedPage` chain. | This is true today, but the rebuild makes the harness path the only path. | Code-resolved |
| `CLAUDE.md:102` | Start debug at `/tmp/panelsummary-celery.log`. | `start.sh:197-198` writes `.dev/logs/celery.log`. No `/tmp/panelsummary*` file exists. | Code-resolved + Runtime-observed |
| `CLAUDE.md:111-119` | OpenRouter image generation and image budgets are product policy. | The owner brief (2026-09-25, `docs/rebuild/STATE.md`) forbids image-generation models. | Doc-claim (brief) |
| `CLAUDE.md:131-135` | `docs/next-prompt.md` is the visual-upgrade prompt. `NEXT_SESSION.md` "was deleted" and must be recreated. | `docs/next-prompt.md` is now a post-roadmap page (2026-08-09). `NEXT_SESSION.md` exists (1,978 lines). | Runtime-observed |
| `README.md:60-64` | Lane B, one generated key panel for each page, is the winner. | Image lanes are out of scope now. | Doc-claim (brief) |
| `README.md:169,237,251` | Next.js runs at `http://localhost:3000`. | Port 3000 belongs to Hermes. | Runtime-observed |
| `README.md:200-203` | `stop.sh` frees port 3000. | This is S1. | Code-resolved |
| `README.md:289` | `OPENROUTER_API_KEY` is only a "model-list proxy key". | `image_generator.py` also uses it for paid image calls. | Code-resolved |
| `README.md:355` | `node scripts/generate.mjs --check` from the repo root. | No root `scripts/` exists. The script is `packages/contracts/scripts/generate.mjs`. | Runtime-observed |
| `README.md:385-386` | The old phase and session docs "were intentionally removed". | `NEXT_SESSION.md`, `findings.md`, `progress.md` and `task_plan.md` are back at the root. | Runtime-observed |
| `backend/app/manga_pipeline/manga_dsl.py` (docstring) | Cites `docs/MANGA_DSL_SPEC.md`. | The file does not exist. It is the only missing docs path that code cites. | Runtime-observed |
| `frontend/app/books/[id]/manga/v2lane/page.tsx:8` | Mentions a legacy reader `/books/[id]/manga`. | `cde8221` removed that route (2026-05-04). | Code-resolved |
| `backend/app/config.py:71-75` | "the v2 pipeline is the only one shipped" (`manga_pipeline_version`). | "v2" here means the second-generation v1 stage chain. `.project-factory/brain/NOW.md:55-66` records this naming conflict. | Code-resolved |

Naming trap for the rebuild: the backend test files are named `test_*_v2.py`, but 50 of 87 test modules import only the v1 lane. Only 26 import the agentic lane. (Runtime-observed, import graph.)

---

## 4. `.project-factory/`, `.claude/skills/`, `.agents/skills/`

### 4.1 What they are

- `.project-factory/brain/NOW.md` (444 lines): the 2026-08-10 recovery. It has an authority table, a v1 vs agentic terminology table, the issue #15 gap list and the doc-drift list. It was correct at `47ea74d`. The owner brief supersedes its "next human decision" (Gap 1 pricing). (Code-resolved by reading.)
- `.project-factory/brain/JOURNEYS.md`: three journeys with proof obligations and "forbidden observations". These are good acceptance criteria for the rebuild.
- `.project-factory/brain/DECISIONS.md`: eight entries (section 4.2).
- `.project-factory/views/*.html`: three hand-written views (about 83 KB) and generated shells. `architecture.html` and `program-design.html` are empty because no `PROGRAM.md` exists (`NOW.md:28-31`).
- `.project-factory/evidence/recovery-2026-08-10/`: five PNG screenshots and `ste_prose_check.py`, a prose checker.
- `.project-factory/memory/{current.json,events.jsonl}`: the event log of the skill.
- `.claude/skills/simple-english/`: vendored from AminBlg/SimpleEnglish at `59bf670`, MIT, byte-identical to upstream (`PROVENANCE.md`). `CLAUDE.md` uses it. KEEP.
- `.claude/skills/run-project-factory/` and `.agents/skills/run-project-factory/`: the same generic skill (1,076-line `project_factory.py`). `.agents/` is the Codex location (`agents/openai.yaml`). It is not product code. No copy exists in `~/.claude/skills/`. The only other copies are git commit `a5e4fbc` and the tarball. (Runtime-observed.)

### 4.2 Decisions in `DECISIONS.md` and what to keep

| Entry | Short quote | Keep? | Why |
|---|---|---|---|
| ADR-010 (2026-08-07) | "keep PanelSummary as the repository of record; port ScrollStack's agent plane into it" | Keep one line as history | It is still true. The donor names (`@scrollstack/*`) come from it. |
| ADR-011 (2026-08-07) | "byte-compares against the legacy builder and **raises on any mismatch**… A loud crash is preferable to quiet divergence in a paid pipeline." | Keep the principle, drop the mechanism | The v1 byte-compare guard goes away with v1. The rule "fail loud, not quiet, in a paid pipeline" stays. |
| ADR-012 (2026-08-07) | "`packages/agent-runtime` as the sole Pi-SDK boundary (pinned `@earendil-works/pi-coding-agent 0.80.10`)… all agent writes go through the allowlisted domain-tool broker… agents get tools, not database handles." SDK upgrade = "a separate reviewed change with golden contract tests". | **Keep** | This is the core of the harness. |
| Provider and model-mode policy (2026-08-08) | "every text, structured-output, review, repair, and vision call goes through the server-owned `MINIMAX_API_KEY`… Per-purpose model modes are config, not code… Vision is not configurable — M3 only." | **Keep**, but remove the clause "OpenRouter is an image-only credential" | The owner brief removes image generation. MiniMax-only is unchanged. |
| Session 8 bake-off, lane B (2026-08-08) | "compose a page by pasting one money-shot panel into compiled geometry (`paste_panel_art`)" | Superseded | Keep one lesson only: one-shot page images placed content in the wrong panels (12 rejections). Deterministic placement by code gave binding 1.0. This supports the deterministic visual system. |
| Owner-requested DB wipe (2026-08-09) | "clean-start the live database" | Drop | Historical only. It also means that IDs hardcoded in `backend/scripts/` probably point at removed data (Inference). |
| PROPOSED v1 deprecation plan (issue #15) | "Phase 4 promote the agentic lane… Phase 5 delete `manga_pipeline/`… the client-side SVG compositor, the `llm_client.py` direct-call path" | Keep the gates, drop the phasing | The owner brief decides the direction. Keep the proof gates: negative reachability of the old path, a browser journey upload → generate → read, and human side-by-side judging. |
| STE documentation (2026-08-10) | "write project documentation in ASD-STE100 **pragmatic** mode… Locked terms: verify, configuration, run, remove, show, problem." | **Keep** | This is the owner's active instruction, now in `CLAUDE.md`. |

Also keep from `JOURNEYS.md`: "Forbidden observations: any agentic-lane claim supported only by a shadow-lane row… any cost figure not tied to a persisted `ModelReceipt`." These map directly onto the rebuild's proof phase.

---

## 5. `docs/` (182 files on disk, 54 MB)

### 5.1 Top-level documents

| Path | Date | Content | Verdict |
|---|---|---|---|
| `ARCHITECTURE.md` | 2026-05-23 | v1 lane only. `NOW.md:409-414` flags it as drift. | REWRITE (Phase 2 output) |
| `BACKEND_FLOW.md`, `FRONTEND_FLOW.md` | 2026-05-23 | v1 flows. `BACKEND_FLOW.md:262-279` has the Walmart package index. | REMOVE |
| `MANGA_BUILD_FLOW_AND_IMAGE_COST_PLAN.md` | 2026-05-18 | Image cost plan. | REMOVE |
| `REEL_RENDERER.md` | 2026-05-07 | Notes for the Remotion package. | REMOVE |
| `TECHNICAL_ARCHITECTURE_BLUEPRINT.md` (76 KB) | 2026-07-19 | ScrollStack hackathon specification. The ADRs carry its decisions. | REMOVE |
| `research-report.md` (41 KB) | 2026-08-07 | "PanelSummary to Learning Reels". | REMOVE |
| `next-prompt.md` | 2026-08-09 | Post-roadmap merge checklist. | REMOVE |
| `architecture.html`, `manga-first-product-blueprint.html`, `two-person-hackathon-plan.html` | July, **untracked** | Old plans ("Learning Reel", hackathon). | Move out of the repo. Do not remove without the owner (S11). |
| `analysis/SHORTCOMINGS_AND_VISUAL_UPGRADE.md` | 2026-07-10 | Craft benchmarks (lines 45-54) and "Phase V — visual-first rendering, no image spend" (line 180). | Extract into the craft doc, then REMOVE |
| `analysis/2026-07-05-live-reader-page1.png` | 2026-07-05 | Old screenshot. | REMOVE |
| `renderer-analysis/` (8.2 MB, 13 PNG files untracked) | May-June | Evidence for the old reader. | REMOVE (tracked files stay in git history) |
| `renderer-experiments/` | May | Samples for the old reader. | REMOVE |
| `rebuild/` | 2026-09-25 | Current rebuild state and these reports. | KEEP (make it tracked, S12) |

### 5.2 ADRs (`docs/adr/`)

| ADR | Verdict | Reason |
|---|---|---|
| 001 model and provider policy | REWRITE | It says "the hackathon agentic path uses the event-required OpenAI model" and "OpenRouter is restricted to image generation". Both conflict with MiniMax-only and no images. |
| 002 MongoDB durable authority | KEEP | Still correct. Remove "accepted reels". |
| 003 Pi behind adapter | KEEP | Core harness rule. |
| 004 tool allowlists | KEEP | Core harness rule. |
| 005 artifact contract boundaries | REWRITE | Remove the `MangaManifest` → reel and `ReelSpec` seams. Name the harness artifact that the reader shows. |
| 006 Remotion reel rendering | REMOVE | No reel lane. |
| 007 Pydantic-led contract generation | KEEP | `export_contracts.py --check` and `generate.mjs --check` pass (35 contracts). |
| 008 worker isolation | REWRITE | Remove the reel-render worker. Keep "agent worker has model credentials but no Mongo". |
| 009 hierarchical page DSL v2 | **KEEP** | "The Python control plane is the authoritative layout compiler… Deterministic SVG name previews use the same compiled geometry." This is the base for the SVG visual system. |
| 010 repo strategy | History (one line) | Section 4.2. |
| 011 durable context v1 wiring | History (one line) | The byte-compare guard goes away with v1. |
| 012 agent plane + broker (33 KB with the S3-S8 addenda) | KEEP, condense | Core harness decision. The addenda hold the MiniMax transport lessons (section 11). |

### 5.3 `docs/research/`

| Path | Verdict | Reason |
|---|---|---|
| `layout-templates/` (spec, spike, 5 golden SVG/PNG) | **KEEP** | Thesis: "LLMs should **select and adapt** page layouts, not invent geometry." `backend/app/services/manga_layout_templates.py` promotes it, but only tests import that module (section 6.1). |
| `contract-deltas-real-manga.md` | KEEP | Deterministic renderer proposals (sprite breakout and more). |
| `wmc-fullbook-defect-analysis.md` (**untracked**) | **KEEP as history, add to git** | It is the only human-grade review of a full generated book. It names two reader bugs. I verified both in code: `MangaPageRenderer.tsx:112-123` overwrites the cell `position` with `relative`, and `dialogue_lettering.ts:54` splits every line over 44 characters into two bubbles. |
| `rendering-lane-matrix.md` | REMOVE (keep one lesson, section 4.2) | Image-lane cost matrix. |
| `art-economics/` (5.9 MB) | REMOVE | Image-model spike. |

### 5.4 `docs/evidence/` (about 40 MB)

| Directory | Size | Content | Verdict |
|---|---|---|---|
| `session2-continuity-proof/` | 12 KB | Durable-context two-scope proof. | KEEP as harness history |
| `session3-live-director/` | 36 KB | First live MiniMax Director goal: model receipt, broker calls. | KEEP |
| `session4-bakeoff/` | 8 KB | Speed vs quality model smoke. | KEEP |
| `session4-svg-previews/` | 52 KB | Deterministic SVG previews of compiled layouts. | KEEP (it is the visual-system precedent) |
| `session6-fresh-planning/` (1 file untracked) | 20 KB | M3 attempt record, page-writing failure ledger. | KEEP, add the untracked file |
| `session7-page-writing/raw_dumps/` | 392 KB | Verbatim MiniMax tool-call arguments. They show the transport artifacts. | KEEP |
| `session8-golden-run/` | 68 KB | `chain_outcome.json` (`stopped_failure` at the thumbnail stage) and 15 `validate_layout_draft` dumps. | KEEP |
| `session7-golden-run/`, `session7-gates-smoke/` | 8 KB | Chain outcome, empty-balloon gate smoke. | Optional KEEP |
| `session5-page-art/`, `session6-recompose/`, `session7-page-art/`, `session8-bakeoff/`, `session6-eval/`, `session7-eval/` | about 39 MB | Generated-image candidates, composed image pages, image-lane scorecards. | REMOVE (git history keeps them) |

---

## 6. Backend

### 6.1 Import-graph result (static AST graph over `app/`, `scripts/`, `tests/`)

Roots: `app.main`, `app.celery_worker`, `app.celery_manga_tasks`. Of 149 `app` modules, 133 are reachable. (Runtime-observed. Script: `scratchpad/phase1/pyimports.py`.)

| Module | Importers | Verdict |
|---|---|---|
| `app/agents/credit_tracker.py` (136 lines, OpenRouter credits) | none | REMOVE |
| `app/persistence/mongo.py` (19) | none | REMOVE |
| `app/services/source_units.py` (129) | none (`book_normalization.py` does this job) | REMOVE |
| `app/services/manga_layout_templates.py` (560) | tests only | **KEEP and wire in** (template library, section 5.3) |
| `app/services/whole_book.py` (711) | `scripts/whole_book_wmc_s{7,8}.py` and tests | KEEP. This is the only chain planner and executor. REWRITE its entry point into the Generate path. |
| `app/services/manga_eval.py` (368) | scripts and tests | REWRITE or REMOVE. Layout-IoU can stay. The judges of image art go. |
| `app/contracts/{evaluation,page_art,registry}.py` | scripts and tests | Prune with the contracts (section 6.4) |
| `app/scripts/*` | CLI only | See section 6.3 |
| `backend/app/reel_engine/` | none (no source) | REMOVE |

### 6.2 Image-generation cluster (remove under the no-image rule)

`image_generator.py` (603, OpenRouter), `services/manga_page_art_stage.py` (1,328, paid page-art stage), `services/manga/asset_image_service.py`, `services/manga/panel_rendering_service.py`, `services/manga/storyboard_panel_renderer.py`, `manga_pipeline/stages/panel_rendering_stage.py`, `manga_pipeline/stages/panel_quality_gate_stage.py`, `services/manga/sprite_quality_service.py`, `services/manga/sprite_quality_gate.py`, `services/manga/sprite_transparency.py`, `services/manga_vision_qa.py`, `agents/credit_tracker.py`. That is **4,651 lines** in total. (Runtime-observed, `wc -l`.)

- These 14 test modules import the cluster directly and go with it: `test_asset_prompt_visual_lock_v2`, `test_manga_asset_image_service_v2`, `test_manga_composition_v2`, `test_manga_eval_v2`, `test_manga_page_art_v2`, `test_manga_vision_qa_gates_v2`, `test_panel_pipeline_phase4_2_v2`, `test_panel_quality_gate_stage_v2`, `test_panel_rendering_service_v2`, `test_phase3_sprite_polish_v2`, `test_provider_cost_policy_v2`, `test_sprite_quality_gate_v2`, `test_sprite_quality_service_v2`, `test_sprite_transparency_v2`.
- Routes to remove: `GET /image-models`, `GET /openai/models` (it lists GPT models, which conflicts with MiniMax-only), `GET /openrouter/models` (`api/routes/media.py:18-123`), and `GET /credits` (`api/routes/jobs.py:15-36`).
- Keep in `media.py`: `GET /images/{path}`, `GET /books/{id}/pdf/info`, `GET /books/{id}/pdf/page/{n}`. The source viewer uses them.
- `services/manga_page_art.py` (901) and `vision_client.py` (188): REWRITE, not a blind removal. `manga_page_art.py` holds deterministic geometry and lettering helpers next to the paid calls. M3 vision can still judge our own rasterized SVG pages (Inference).

### 6.3 Scripts

| Script | Content | Verdict |
|---|---|---|
| `backend/scripts/export_contracts.py` | Pydantic → JSON Schema. `packages/contracts` `generate:schemas` calls it. | KEEP |
| `whole_book_wmc_s7.py` / `whole_book_wmc_s8.py` | The same file. Only 3 lines differ (session name and evidence directory). They are the **only** callers of `WholeBookChainExecutor`. | Take the stage-runner wiring into the production task, then REMOVE both |
| `live_manga_director.py`, `live_fresh_planning_s6.py`, `bakeoff_session4.py` | One-goal probes against the worker. | Take the goal-submission code, then REMOVE |
| `live_page_art_wmc.py`, `live_page_art_wmc_s7.py`, `bakeoff_s8_binding.py` (964), `eval_s7_regen.py`, `eval_wmc_s6.py`, `smoke_gates_v3_s7.py`, `preview_bakeoff_thumbnails.py`, `continuity_proof_wmc.py` | Session-specific image and eval runs. Hardcoded Atlas IDs. | REMOVE |
| `backup_db.py` | JSON backup through `settings.mongodb_url`. | REWRITE with a local-only guard, or REMOVE |
| `app/scripts/normalize_source_units.py` | Makes source units. `compiled_context_bridge.py:151` tells users to run it. | KEEP until the pipeline normalizes by itself |
| `app/scripts/migrate_rendered_pages.py` | One-shot v1 migration. | REMOVE |
| `app/scripts/delete_book.py`, `app/scripts/job_monitor.py` | v1 admin tools. | REWRITE for the new collections, or REMOVE |

### 6.4 Donor residue in the harness

- The runtime has goal policies with no backend tools: `BOOK_CANON` (`submit_book_canon` has no backend implementation), `MANGA_COMPOSITION` (5 of 5 tools missing), `REEL_DIRECTION` (5 of 5 missing). See `packages/agent-runtime/src/policies.ts:27-93`, `apps/agent-worker/src/skills/load.ts:7-29`, `backend/app/contracts/context.py:16-21`. In `MANGA_DIRECTION`, the listed tool `submit_asset_requests` also has no backend implementation. (Code-resolved, `grep` for each tool name.) Verdict: REWRITE to remove these goals and their three skills (`book-canon`, `manga-composition`, `reel-direction`).
- Contracts with no non-contract reader in `backend/app`: `reel_spec`, `reel_series`, `reel_player_payload`, `series_progress`, `series_progress_update`, `manga_manifest`, `asset_request`, `revision_request`, `rendered_page.v2`. `image_attempt`, `page_art` and `provider_receipt` exist only for the image lane. (Code-resolved, `grep` for class name and schema string.) Verdict: prune them with their fixtures and generated TypeScript.
- `apps/agent-worker/src/config.ts:52` defaults `AGENT_MODEL_API_KEY_ENV` to `OPENAI_API_KEY`. `apps/agent-worker/src/config.ts:67` defaults the host to `0.0.0.0`. Verdict: make MiniMax and `127.0.0.1` the defaults.
- `apps/agent-worker/src/server.ts:4` imports values from `@scrollstack/contracts`. That package exports `./dist/index.js` (`packages/contracts/package.json`). `start.sh` never builds `dist`. As a result, a fresh clone gets a worker that cannot start (Inference from Code-resolved facts). Today the local `dist/` exists and is ignored.

### 6.5 Other backend hygiene

- `backend/app/pdf_parser.py:163-166` builds `PdfPipelineOptions(do_ocr=False, do_table_structure=False)` but calls `DocumentConverter()` without them. Docling therefore runs OCR and table models by default. That costs parse time and a first-run model download. (The ignored options are Code-resolved. The docling 2.x default is an Inference.)
- `backend/app/celery_worker.py:44-45` sets a global hard limit of 600 s, and no manga task overrides it. A whole-book harness run of several MiniMax calls (worker run timeout 15 min, `apps/agent-worker/src/config.ts:77`) cannot finish inside one such task (Inference).

---

## 7. Frontend

### 7.1 Routes

| Route | Content | Linked from | Verdict |
|---|---|---|---|
| `/` (`app/page.tsx`) | Shelf plus marketing (`AttentionGame` 587, `MangaPivotSection` 509, `Colophon` 306, `MangaShelf` 179). | nav | KEEP. Simplify later (owner taste). |
| `/upload` | PDF upload. | nav | KEEP |
| `/books/[id]` | Book page. It mounts `MangaV2ProjectPanel` (the Generate UI). | shelf | REWRITE the panel |
| `/books/[id]/read` | PDF page viewer (`/books/{id}/pdf/page/{n}`). | `/books/[id]/page.tsx:129` | KEEP (source grounding) |
| `/books/[id]/manga/v2` | Main reader of v1 `MangaPageDoc.rendered_page`. | panel buttons | REWRITE. It must show harness artifacts. |
| `/books/[id]/manga/v2/characters` | Character sprite library (regenerate, pin, image QA). | reader | REMOVE or REWRITE as text character cards |
| `/books/[id]/manga/v2lane` | Reader of harness artifacts (`GET /manga-projects/{id}/v2/pages`). Gated by `NEXT_PUBLIC_MANGA_V2_LANE_READER=1` (`lib/manga-v2-lane.ts:77`). | **nothing** (orphan) | REWRITE into the main reader. It is the nearest thing to the target reader. |

The legacy routes `/books/[id]/manga`, `/manga/living`, `/reels` and `/video-reels` were removed in `cde8221` (2026-05-04). (Code-resolved, `git log --diff-filter=D`.)

### 7.2 Dead files (no importer from any route, per the static import graph)

`components/ApiKeyModal.tsx` (204), `GenerationFacts.tsx` (83, "reels" trivia), `LargePdfWarning.tsx` (127), `LogFeed.tsx` (71), `PipelineTracker.tsx` (173, "Living panel DSLs"), `StyleSelector.tsx` (99), and `lib/utils.ts` (71, imported only by `StyleSelector`). That is **828 lines**. (Runtime-observed. Script: `scratchpad/phase1/tsgraph.py`.)

Other residue:
- `app/globals.css:365-380` has `.reel-feed` and `.reel-slide`. No code uses them.
- `lib/types.ts:447-470` has `STYLE_OPTIONS`. Only the dead `StyleSelector` uses it.
- `app/layout.tsx:84` has the meta description "…swipeable manga panels and lesson reels".
- `lib/api.ts` has functions that no file calls: `startBookUnderstanding` (206), `generateMangaProjectSlice` (230), `checkCredits` (346), `cancelJob` (356). OpenRouter and OpenAI helpers go with section 6.2: `fetchOpenRouterModels`, `fetchOpenAIModels`, `getImageModels`. `components/ModelSelector.tsx` (391) goes with them.
- `components/MangaV2ProjectPanel.tsx` (957): `imageMode` defaults to `"budgeted"` (line 354). It has an OpenRouter key field (676-722), provider choices (665-698), and an image model picker (757-796). `lib/store.ts` keeps `apiKey`, `provider` and `model`. Verdict: REWRITE to one Generate button with no key and no model choice.
- The seven `components/MangaReader/*.test.ts` files are plain assert scripts. `frontend/package.json` has no `test` script and no runner. Only `tsc` touches them.

Reusable for the deterministic visual system (Inference, and the reader auditor owns the final call): `chrome/SpeechBubble.tsx` with `dialogue_geometry.ts` and the tail geometry, `chrome/SfxLayer.tsx`, `chrome/VectorSceneLayer.tsx` (it reads the typed primitives from `backend/app/domain/manga/vector_scene.py`), `lettering_fonts.ts`, and `V2LaneReader.tsx` (compiled polygons and clip paths).

---

## 8. Dependencies

### 8.1 `backend/requirements.txt` (import `grep` over `app/`, `scripts/`, `tests/`)

| Package | Importers | Verdict |
|---|---|---|
| fastapi, uvicorn[standard], python-multipart | 10 / CLI / `UploadFile` | KEEP |
| beanie, motor, pymongo | 14 / 5 / 4 | KEEP |
| celery, redis | 2 / broker transport | KEEP if the job runner stays Celery (Phase 2 decision) |
| **flower** | 0 | REMOVE |
| **pdfplumber** | 0 | REMOVE |
| **python-jose** | 0 ("if we add auth later") | REMOVE |
| **aiofiles** | 0 | REMOVE |
| python-dotenv | 0 direct (pydantic-settings needs it for `env_file`) | Drop the explicit pin (it comes in as a dependency) |
| PyMuPDF (`fitz`) | `pdf_parser.py`, `media.py` | KEEP |
| docling | `pdf_parser.py` only, with a PyMuPDF fallback | Decide in Phase 2. It pulls torch (410 MB), cv2 (119 MB), scipy (76 MB), transformers (58 MB), easyocr and pandas. The test PDFs are born-digital, so PyMuPDF alone can be enough (Inference). Fix the ignored options (section 6.5) if you keep it. |
| openai | `llm_client.py` only (AsyncOpenAI with the MiniMax `base_url`) | KEEP until the harness replaces the direct `llm_client.py` path. Then REMOVE. |
| tiktoken | `llm_client.py` | Goes with `llm_client.py`. It downloads encodings at first use. |
| httpx | 8 (worker client, OpenRouter routes) | KEEP |
| Pillow | 18 (image lane, eval, `pdf_parser`) | KEEP, but most importers leave with section 6.2 |
| pytest | tests | Move to a dev requirements file |

### 8.2 `frontend/package.json`

| Package | Importers | Verdict |
|---|---|---|
| @radix-ui/react-dialog, -progress, -select, -toast, -tooltip | 0 | REMOVE |
| @use-gesture/react | 0 | REMOVE |
| class-variance-authority | 0 | REMOVE |
| clsx, tailwind-merge | only the dead `lib/utils.ts` | REMOVE |
| roughjs | 0 | Keep only if the SVG art system adopts it. `SHORTCOMINGS…md:265` lists it for "hand-drawn SVG primitives". |
| axios, lucide-react, motion, zustand, tailwindcss-animate, next, react | used | KEEP |

Frontend `"dev": "next dev --turbopack"` (`frontend/package.json:6`) uses port 3000 by default. The new script must pass `-p <port>`. It must also add that origin to `CORS_ORIGINS`, because `backend/.env` allows only `http://localhost:3000`.

### 8.3 Workspace

- pnpm importers: `apps/agent-worker`, `packages/agent-runtime`, `packages/contracts`. The frontend is a separate npm project with its own `package-lock.json`. That makes two package managers and two lockfiles. (Runtime-observed.)
- Version drift: `packages/contracts` uses typescript 5.8.3 and vitest 3.2.4. The other packages use 5.9.3 and 4.0.16. This is minor.
- Pi 0.80.10 brings the Anthropic, Google GenAI, OpenAI and Bedrock SDKs transitively (`pnpm-lock.yaml:88,202-216,550,1282`). You cannot remove them without a Pi change (ADR-003). They are harmless if the worker receives only `MINIMAX_API_KEY`.

---

## 9. Dev stack

### 9.1 What the current scripts do

| Script | Starts or touches | Ports | Env and tokens | Problems |
|---|---|---|---|---|
| `start.sh` | Redis (`brew services start redis` if no PONG), backend `uvicorn --reload` `0.0.0.0:8000`, Celery `--pool=solo`, Next.js, the broker (a second `uvicorn app.main:app` on `127.0.0.1:8010`), speed worker `:8788` (M2.7-highspeed), quality worker `:8789` (M3). | 8000, 3000, 8010, 8788, 8789 | It writes `.dev/agent-tokens.env` once (`umask 077`, `openssl rand -hex 24`) and exports the tokens to all children (`set -a`). It greps `MINIMAX_API_KEY` from `backend/.env` into a shell variable and passes it only to the workers (`start.sh:180,235`). It never prints the key. | S2, S3, S7. It does not build contracts `dist` (section 6.4). `tail -f /dev/null \| nohup npm run dev` (`:208`) records the `npm` PID only, so `tail` and `next-server` can survive a stop (Inference). It stops scrollstack Docker containers on its own initiative (`:86-92`). The backend and the broker are two processes of the same app. |
| `check.sh` | Read-only probes. | Same | none | `http_service "Frontend" 3000` (`:111`) probes the Hermes bridge. Today it answers HTTP 404, so the result is "down", but a 200 would give a false "up". It does not report which database the backend uses. |
| `stop.sh` | Kills the PID files, legacy `/tmp/panelsummary_*.pid`, then every non-Docker listener on 8000/3000/8010/8788/8789. | Same | none | S1, S6. |
| `docker-compose.yml` | mongo, redis, backend, celery, frontend | 27017, 6379, 8000, 3000 | It hardcodes a dev `SECRET_KEY`. It mounts `./backend` (which includes `.env`). | No agent plane. Conflicts with Hermes (3000) and Homebrew Redis (6379). |

### 9.2 What a one-command start for the new architecture needs

The Phase 2 architecture decides the process list. Any version must meet these rules:

1. **One non-secret configuration file** in git (for example `dev.env`). It sets `MONGODB_URL=mongodb://127.0.0.1:27018/<db>`, `REDIS_URL=redis://127.0.0.1:6379/7`, `API_PORT=8000`, `WEB_PORT=3100` (any port except 3000), `CORS_ORIGINS=http://localhost:3100`, the worker URLs, and `STORAGE_DIR=<repo>/storage`. The script exports these values. The process environment then overrides `backend/.env` (S4).
2. **A remote-database guard in two places.** The script refuses a `mongodb+srv` or non-loopback `MONGODB_URL` unless `ALLOW_REMOTE_DB=1` is set. The backend `Settings` also refuses it in dev mode, so manual runs and scripts are safe too.
3. **Secrets by name only.** Read `MINIMAX_API_KEY` from `backend/.env` (or the Keychain). Pass it only to the agent worker. Never print it. Keep the generated service tokens in `.dev/agent-tokens.env` (0600). Remove `OPENROUTER_API_KEY` from the flow.
4. **Build before start.** Run `pnpm install` if needed. Build `packages/contracts` if `dist/` is missing. Create `backend/.venv` if it is missing.
5. **Preflight, then start.** Ping Mongo and Redis. If a required port is busy, name the holder and stop. Never offer to kill it.
6. **Own only what you start.** Start each service in its own process group (`set -m` in zsh). Record the PID, the process group and the command line. On stop, verify that the command line still matches, then kill the process group. Never free a port by number. Never touch port 3000.
7. **A status command** that shows each service, the database target as host:port/db (no credentials), the Redis db index, worker readiness (`/readyz`: credential loaded yes or no), and the web URL.
8. **Minimal processes.** The harness needs API + broker (these can be one loopback process), a job runner for long generation runs (Celery or another runner, with a time limit above one book run, section 6.5), at least one MiniMax worker, and Next.js.

Sketch of the command surface (Inference): `./dev up`, `./dev status`, `./dev down`, `./dev logs <service>`. `up` runs steps 1-6. `down` runs step 6 only.

---

## 10. KEEP / REWRITE / REMOVE master table

REMOVE = the brief's DELETE. "History" means that git history already holds the file. "Save first" means that the file is untracked and has no backup.

| Item | Verdict | Precondition |
|---|---|---|
| `.claude/skills/simple-english/`, the `CLAUDE.md` Language section | KEEP | — |
| `CLAUDE.md` (other sections) | REWRITE | After Phase 2 |
| `AGENTS.md` | REWRITE (pointer to `CLAUDE.md`) | — |
| `README.md` | REWRITE | After the new start script |
| `NEXT_SESSION.md` | REMOVE | Extract the lessons (section 11). History. |
| `findings.md`, `progress.md`, `task_plan.md` | REMOVE | History |
| `.project-factory/` | REMOVE | Fold section 4.2 into the decision log. History (`a5e4fbc`). |
| `.claude/skills/run-project-factory/`, `.agents/skills/run-project-factory/` | Owner decision | If the owner wants the skill, copy it to `~/.claude/skills/` first |
| `reel-renderer/`, `docs/REEL_RENDERER.md`, ADR-006 | REMOVE | History |
| `backend/app/reel_engine/` (only `.pyc`) | REMOVE | none (untracked, no source) |
| `backend/app/agents/credit_tracker.py`, `persistence/mongo.py`, `services/source_units.py` | REMOVE | none |
| Image-generation cluster (section 6.2) + 14 tests + 4 routes | REMOVE | Phase 2 records the no-image rule as a decision |
| `services/manga_page_art.py`, `vision_client.py`, `manga_eval.py` | REWRITE | Salvage the deterministic helpers |
| `services/manga_layout_templates.py`, `services/manga_layout.py`, `docs/research/layout-templates/` | KEEP (wire in) | — |
| `services/whole_book.py` | KEEP + REWRITE the entry point | — |
| v1 lane (`manga_pipeline/`, `services/manga/*`, `llm_client.py`) | Out of scope here. The harness and pipeline auditors decide. | Negative reachability proof |
| `backend/scripts/` except `export_contracts.py` | REMOVE | Extract the chain wiring from `whole_book_wmc_s8.py` |
| `app/scripts/normalize_source_units.py` | KEEP (for now) | — |
| `app/scripts/migrate_rendered_pages.py` | REMOVE | — |
| Runtime goals `BOOK_CANON`, `MANGA_COMPOSITION`, `REEL_DIRECTION` + 3 skills | REWRITE (prune) | Update contracts, runtime, worker and tests together |
| Reel and unused contracts (section 6.4) | REMOVE | Regenerate schemas, TypeScript and fixtures |
| Frontend dead files (828 lines) + `.reel-*` CSS + `STYLE_OPTIONS` | REMOVE | — |
| `ModelSelector.tsx`, OpenRouter/OpenAI API helpers | REMOVE | With section 6.2 |
| `MangaV2ProjectPanel.tsx`, `lib/store.ts` | REWRITE | — |
| `/manga/v2` reader, `/manga/v2lane` reader | REWRITE into one main reader | — |
| `/manga/v2/characters`, `CharacterLibrary/AssetCard.tsx` | REMOVE or REWRITE | Phase 2 |
| `/books/[id]/read`, `/upload`, `/` | KEEP | — |
| Unused deps: flower, pdfplumber, python-jose, aiofiles, 5 radix, @use-gesture, cva, clsx, tailwind-merge | REMOVE | — |
| docling | Decide | Measure parse quality with PyMuPDF only |
| `start.sh`, `check.sh`, `stop.sh` | REWRITE (section 9.2) | **Before any stack run** |
| `docker-compose.yml`, three Dockerfiles | REMOVE (or REWRITE later) | — |
| `.vscode/settings.json` | REMOVE | — |
| `.gitignore` | REWRITE (stop ignoring `docs`, drop the Walmart line) | — |
| `docs/ARCHITECTURE.md`, ADR-001, 005, 008, `adr/README.md` | REWRITE | Phase 2 |
| ADR-002, 003, 004, 007, 009, 012 | KEEP (condense 012) | — |
| ADR-010, 011 | History (one line each) | — |
| `BACKEND_FLOW.md`, `FRONTEND_FLOW.md`, `MANGA_BUILD_FLOW_AND_IMAGE_COST_PLAN.md`, `TECHNICAL_ARCHITECTURE_BLUEPRINT.md`, `research-report.md`, `next-prompt.md`, `renderer-analysis/`, `renderer-experiments/`, `analysis/*.png`, `research/art-economics/`, `research/rendering-lane-matrix.md` | REMOVE | History |
| `analysis/SHORTCOMINGS_AND_VISUAL_UPGRADE.md` | REMOVE after extraction | Extract the craft benchmarks |
| `research/wmc-fullbook-defect-analysis.md` | KEEP (add to git) | **Save first** |
| Untracked HTML plans (3) and the 2026-06-07 screenshots | Move out of the repo | **Save first**, owner decision |
| Image evidence dirs (about 39 MB) | REMOVE | History |
| Non-image evidence (about 0.6 MB) | KEEP under `docs/history/` | Add the one untracked JSON file |
| `storage/`, `backend/storage/`, `.dev/db-backups/` | KEEP (untracked data) | Owner decides on the Atlas dumps and the copyrighted WMC PDF |

---

## 11. Content to fold into a small current docs set

Proposed set (Inference): `README.md`, `CLAUDE.md` (+ `AGENTS.md` pointer), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/HARNESS.md`, `docs/MANGA_CRAFT.md`, `docs/history/`, `docs/rebuild/`.

- **`docs/DECISIONS.md`**: section 4.2 "Keep" rows, ADR-002/003/004/007/009/012 in one paragraph each, and the 2026-09-25 owner brief (MiniMax-only through the harness, no image models, deterministic SVG art, Generate → harness → persisted artifacts → main reader).
- **`docs/HARNESS.md`** (from `NEXT_SESSION.md:1625-1700` and the ADR-012 addenda). These are MiniMax transport facts that Sessions 6-8 measured (Doc-claim with raw dumps in `docs/evidence/session7-page-writing/raw_dumps/`):
  - Large tool calls arrive truncated. The "armed assistant-text lane" worked around this.
  - Empty optional values arrive as `""` or `{}`. Nulls arrive as `"null"`. Integers can arrive as digit strings. A whole submission can arrive string-typed.
  - Skill wording can contradict a validator. The Session 6 "non-empty quote" rule contradicted the verbatim-lineage gate.
  - The speed model (M2.7-highspeed) failed the thumbnail layout-draft schema repeatedly (15 `validate_layout_draft` dumps, `chain_outcome.json` `stopped_failure`).
  - M3 has a truncated-JSON ceiling on large outputs (issue #15 Gap 8).
  - Per-purpose model modes are configuration. Receipts record the mode and its provenance.
  - Budget preflight refuses a scope before spend. Resume reuses accepted stages at $0.
- **`docs/MANGA_CRAFT.md`**: benchmarks from `SHORTCOMINGS…md:45-54` (at most 25 words for each panel, ideal 12 or fewer, about 60 words for each page, sparse narration, SFX as drawn lettering, a heavy page-turn panel), the layout-template thesis, `contract-deltas-real-manga.md`, and the defect list from `wmc-fullbook-defect-analysis.md` (filler sub-panels, speaker attribution, character introductions, semantic panel consistency).
- **Acceptance gates** (from `JOURNEYS.md` and issue #15): negative reachability of the old path, one browser journey upload → Generate → read on the harness path, receipts for every cost figure, and a human side-by-side judgment.

---

## 12. Commands run (all read-only for the repository)

| Command | Outcome |
|---|---|
| `git status`, `git log`, `git ls-files`, `git status --ignored`, `git check-ignore -v` | Tree clean at `a5e4fbc`. 760 tracked files. `docs` ignored by `.gitignore:39`. |
| `lsof -nP -iTCP:<port> -sTCP:LISTEN` for 3000, 3001, 8000, 8010, 8788, 8789, 6379, 27017, 27018 | 3000 = `node` pid 1663. 6379 = redis-server. 27018 = mongod. The others are free. |
| `curl http://localhost:3000` | HTTP 404 (Hermes). |
| `ps` on the six `.dev/pids` PIDs | None is running. |
| `Settings()` with and without a `MONGODB_URL` override | Override honoured = True. Default scheme = `mongodb+srv`, not local. No value printed. |
| `sed 's/=.*//'` over `backend/.env`, `frontend/.env.local`, `.dev/agent-tokens.env` | Key names only. |
| Static import graphs (`pyimports.py`, `tsgraph.py` in the scratchpad) | 133/149 backend modules reachable. 7 frontend files unreachable. |
| `pytest tests/ -q` (env: `MONGODB_URL=…27018`, `REDIS_URL=…/7`, empty model keys, no bytecode, no cache) | **822 passed**, 118 warnings, 13.9 s. |
| `pnpm -r --if-present test` | contracts 47, agent-runtime 22, agent-worker 16. All passed. |
| `frontend: tsc --noEmit` | exit 0. |
| `generate.mjs --check`, `export_contracts.py --check` | Both current (35 contracts). |
| `zsh -n start.sh stop.sh check.sh` | Syntax OK. |
| `docker compose config` | exit 0. |
| Credential-pattern scan over docs, evidence, logs and tracked files | Only two placeholders found. |
| `tar -tzf …/uncommitted-2026-09-25.tgz` | Holds only `.agents`, `.claude`, `.project-factory`, `CLAUDE.md`. |

---

## 13. Open questions for the owner

1. Save or remove the three untracked HTML plans and the 2026-06-07 screenshots? They are in no backup.
2. `.dev/db-backups/` has two `mongodump` trees of Atlas data. Keep them outside the repo, or remove them?
3. Do you use Codex on this repo? If not, the `.agents/` copy of `run-project-factory` can go. Do you want `run-project-factory` at all in this product repo, or in `~/.claude/skills/`?
4. Is Docker a target? If not, remove the compose file and all three Dockerfiles.
5. Keep docling (heavy, OCR by default) or use PyMuPDF only for born-digital books?
6. Keep the marketing home page components (about 1,580 lines), or show a plain shelf?
7. Rename the `@scrollstack/*` packages and the root `scrollstack` package, or accept the donor names? Renaming causes churn only.
