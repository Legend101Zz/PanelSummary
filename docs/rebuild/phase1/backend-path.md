# Phase 1: backend production path audit

Scope: the backend path from PDF upload to the reader API, on branch `product/harness-manga` (HEAD `a5e4fbc`, based on `v2-architecture` @ `47ea74d`). This phase was read-only. The only files written are this report and scratch probes under `/private/tmp/claude-501/-Users-comreton-Desktop/3b1640fe-8ce0-4ed7-b544-0b35ca3ba64d/scratchpad/phase1/`. `git status` was clean before and after every run.

Labels used below:
- **[Code]**: resolved by reading the current code (cited as file:line; paths are relative to `backend/app/` unless shown otherwise).
- **[Run]**: I ran it in this session.
- **[Doc]**: a claim in a doc that I did not verify.
- **[Inf]**: an inference.

---

## 0. Verdict

The Generate button calls `POST /manga-projects/{id}/build`, which runs a Celery task ([Code] `api/routes/manga_projects.py:672-754`, `celery_manga_tasks.py:43-283`). That task drives the v1 pipeline:

1. Eight book-understanding stages.
2. A 26-step per-slice stage list, with 2 more steps added when image mode is on.
3. Writes to `MangaSliceDoc` and `MangaPageDoc.rendered_page`.
4. The main reader then reads `GET /manga-projects/{id}/pages`.

What that path does today, compared with the product goal:

1. **The MiniMax harness is never used by the default path.** Every LLM call is a direct HTTP call through the OpenAI SDK to `https://api.minimax.io/v1` ([Code] `llm_client.py:100-103`, `manga_pipeline/llm_contracts.py:176`). The Node agent worker (the harness) can only be reached through two flags that are both off by default, or through `scripts/` ([Code] `services/manga/generation_service.py:653-670`, `services/agentic_pipeline_bridge.py:42-66`).
2. **Image models are on by default.** The frontend defaults to `imageMode="budgeted"` ([Code] `frontend/components/MangaV2ProjectPanel.tsx:354`), and the backend build request defaults to `generate_images=True` ([Code] `api/routes/manga_projects.py:93`). Both lead to OpenRouter `google/gemini-2.5-flash-image` calls for character sheets, sprite regeneration and key-panel art.
3. **A deterministic "repair" stage fakes quality.** Its effects:
   - It stamps missing required fact IDs onto the first panel without adding any text.
   - It pads pages and panels with silent copies.
   - It truncates dialogue.
   - It then clears the quality report.

   [Run] A storyboard with 5 error codes becomes `passed=True`.
4. **Source coverage can be lost silently.**
   - [Run] A 1-page overlap between LLM-authored arc ranges skips a whole arc entry.
   - [Run] Gaps between arc ranges are accepted.
   - [Run] Book understanding sees only about 25% of the source text.
5. **The project status flips to `complete` after every slice**, even while a full-book build is still running. [Code] `services/manga/generation_service.py:631`; the bug is still present.
6. **Two security defects** (both [Run]):
   - The OpenRouter key the user types is serialized into MiniMax prompts.
   - `GET /images/{path}` allows path traversal, which reaches `backend/.env`.
7. **Tests:** 822 passed, 0 failed ([Run]). The suite does not touch Mongo, Redis or any paid API. It does not exercise `generate_project_slice`, the build task, or persistence.

---

## 1. Method and safety

- Every Python run used these environment overrides: `MONGODB_URL=mongodb://127.0.0.1:27018/panelsummary_phase1`, `DB_NAME=panelsummary_phase1`, `REDIS_URL=redis://127.0.0.1:6379/7`, bogus `MINIMAX_API_KEY` and `OPENROUTER_API_KEY`, and `STORAGE_DIR` pointing at scratch.
  - [Run] `get_settings()` honoured all of them. Process environment variables take priority over `.env` in pydantic-settings.
- I added a network guard (`scratchpad/phase1/netguard/sitecustomize.py`). It blocks DNS lookups and connections to any address that is not loopback, and logs every attempt.
- `backend/.env` was inspected for key names only: `MONGODB_URL`, `REDIS_URL`, `SECRET_KEY`, `CORS_ORIGINS`, `OPENROUTER_API_KEY`, `MINIMAX_API_KEY`.
  - It sets **none** of the feature flags, so every flag is at its code default.
  - I printed no values.
- I did not connect to Atlas and did not touch port 3000.

---

## 2. End-to-end trace (what happens today)

### 2.1 Upload: `POST /upload`
- [Code] `main.py:184-264`.
  - The file is read into memory; the size cap is 50 MB.
  - The SHA-256 is computed, and the PDF is written to `settings.pdf_dir/<sha>.pdf`.
  - A `Book` is found or created, and `parse_pdf_task.delay(book_id, path)` is queued along with a `JobStatus(job_type="parse_pdf")`.
- Dedupe behaviour:
  - If the book is already `PARSED`, it returns `task_id="cached"`.
  - If it is `FAILED`, it resets the book and requeues.
  - If it is `PENDING` or `PARSING`, it falls into the `else` branch and inserts a second `Book` with the same `pdf_hash`. The index on `pdf_hash` is unique (`models.py:81`), so this becomes a 500 (duplicate key) [Code/Inf].
- `settings.pdf_dir` and `image_dir` resolve to `backend/storage/*`. `_default_storage()` finds `backend/storage` first (`config.py:12-24`) [Code].

### 2.2 Parse: `parse_pdf_task` → `pdf_parser.parse_pdf`
- [Code] `celery_worker.py:168-282`, `pdf_parser.py:385-514`.
- Structure comes from Docling first (`pdf_parser.py:147-198`), with PyMuPDF heuristics as the fallback (`pdf_parser.py:201-250`, `433-435`).
  - The fallback is **silent**: it is only logged, and the `Book` document does not record which parser produced it.
  - `PdfPipelineOptions` (do_ocr/table off) is built and **never passed** to `DocumentConverter()` (`pdf_parser.py:163-167`). It is dead code, so Docling runs with its default options [Code].
- **[Run] Docling on this machine:** `~/.cache/huggingface` does not exist. With the network blocked, Docling failed trying to fetch its models from `huggingface.co`, and the parser fell back to PyMuPDF. Whether production parses use Docling depends on network access or an `HF_HOME` cache [Inf].
- **[Run] PyMuPDF result on the acceptance book** (`happy-prince-and-other-tales.pdf`, 68 pages, 5 tales). The parse took 59.8 s and produced 10 "chapters":

  | Chapter | Pages | Words | Title |
  |---|---|---|---|
  | 0 | 1–1 | 0 | "The Happy Prince and" |
  | 1 | 1–2 | 12 | "Other Tales" |
  | 2 | 3–16 | 3476 | "The Happy Prince" |
  | 3 | 17–26 | 2325 | "The Nightingale and the Rose" |
  | 4 | 27 | 220 | "The Selﬁsh Giant" |
  | 5 | 27 | 0 | "TRESPASSERS" |
  | 6 | 28 | 0 | "WILL BE" |
  | 7 | 28–33 | 1428 | "PROSECUTED" |
  | 8 | 34–50 | 4333 | "The Devoted Friend" |
  | 9 | 51–68 | 4382 | "The Remarkable Rocket" |

  The rule that treats ALL-CAPS lines as headings (`pdf_parser.py:236`) split one tale into 4 chapters. The run extracted 0 images.
- **[Run] `civil-disobedience.pdf`** (34 pages, PyMuPDF): 5 chapters. The title was split into 2 stubs, then Part One (pp 3–12), Part Two (13–24) and Part Three (25–34) were detected correctly.
- Other parser behaviour [Code]:
  - Text before the first detected heading is **dropped** (`pdf_parser.py:341`, `elif current_chapter:`).
  - Every `section_header` shorter than 80 characters becomes a chapter until there are 50 (`pdf_parser.py:324-328`), so "chapters" are really sections.
  - If no headings are found, the whole book becomes one chapter titled "Full Text" (`pdf_parser.py:355-363`).
  - The page for each element comes from Docling provenance (`_page_from_prov`, `pdf_parser.py:266-281`). Without provenance a chapter collapses to page 1 (`337-338`), which was the bug fixed in d3e0790.
  - Images are stored as `page{N}.png`, so several images on one page overwrite each other (`celery_worker.py:210-215`).
- **Book document shape** [Code] `models.py:51-104`, `celery_worker.py:217-236`: each `BookChapter` has **exactly one** `BookSection` whose content is the whole chapter text and whose page range is the chapter's range. There is no page-level text anywhere.
- Celery setup [Code] `celery_worker.py:31-46`: `task_time_limit=600`, `acks_late=True`.
  - `start.sh:197` and `docker-compose.yml:51` run `--pool=solo`.
  - The solo pool's `apply_target` drops the timeout options (it swallows them via `**_`; `.venv/.../celery/concurrency/base.py:20-38`, `solo.py:11-20`). **Time limits are therefore not enforced** [Code].
  - It is a single worker, so every job (parse, understanding, builds) is serialized.

### 2.3 Project: `POST /books/{book_id}/manga-projects`
- [Code] `api/routes/manga_projects.py:340-355` calls `get_or_create_project` (`services/manga/project_service.py:92-121`).
  - Uniqueness is on (book, style, engine), but the index is **not** unique (`manga_models.py:76-79`), so concurrent creates can race [Inf].
  - It seeds an empty `ContinuityLedger`.
- The frontend's `ensureProject` sends `project_options`, which include `generate_images` and `image_mode` ([Code] `frontend/components/MangaV2ProjectPanel.tsx:497-517`).

### 2.4 Generate: `POST /manga-projects/{id}/build` (what the button calls)
- Frontend `handleGenerate` ([Code] `MangaV2ProjectPanel.tsx:520-560`):
  - It sends `apiKey` (an OpenRouter key, required when images are on), `provider="minimax"`, `model="MiniMax-M3"`, `mode=buildMode` and `imageMode`.
  - The defaults are **`buildMode="next_chunk"`** (`:352`) and **`imageMode="budgeted"`** (`:354`).
- Endpoint ([Code] `api/routes/manga_projects.py:672-754`):
  - The "already running" check covers only `job_type="build_manga_project"` (`:690-700`).
  - It writes the options to `project_options` without the key (`:706-717`), sets `status="generating"` (`:719`), and queues `build_manga_project_task` with **`api_key` as a Celery argument**. The key therefore sits in the Redis broker message [Code/Inf].
- Task ([Code] `celery_manga_tasks.py:43-283`):
  1. Moves `last_failure` into `previous_failure` and clears it, then saves `status="generating"` once (`:97-114`).
  2. On resume, reports only a progress message built from the ledger (`:129-140`).
  3. Builds an `LLMClient`. The `provider`, `model` and `api_key` arguments are overridden to MiniMax with the server key (`llm_client.py:71-108`).
  4. `run_options` gets **`image_api_key` and `api_key` set to the user's key** whenever images are on (`:154-156`).
  5. If understanding is not ready, it calls `generate_book_understanding(extra_options=run_options)` (`:158-172`).
  6. Loops calling `generate_project_slice` (`:182-234`). It stops on "fully covered", or on "no extractable text" once any slice or ledger range exists (`:213-223`). `next_chunk` mode breaks after one slice (`:233-234`).
  7. At the end sets `status="complete"` and reports job success (`:236-248`).
  8. On failure, sets `status="failed"` and `last_failure={message, phase, task_id, at}` (`:251-281`).
- `POST /generate-slice` ([Code] `:757-832`) and `generate_manga_slice_task` ([Code] `celery_manga_tasks.py:286-401`) run the same `generate_project_slice` for one slice. That path does **not** write `last_failure` (`:384-387`).
- `POST /book-understanding` ([Code] `:599-669`) and `generate_book_understanding_task` ([Code] `celery_manga_tasks.py:404-520`) do the same work separately. That path puts no keys into its options.

### 2.5 Book understanding (runs once per project)
[Code] `services/manga/book_understanding_service.py:48-72`, `200-345`. Stage order:

| # | Stage | Kind | Notes |
|---|---|---|---|
| 1 | `stages/book/whole_book_synopsis_stage` | **LLM** (MiniMax, 4000 tok) | Input is at most 4000 chars per chapter and 120k chars in total. The chapter loop `break`s at the budget, so tail chapters are dropped (`:25-26`, `:63-64`, `:83-84`). The prompt includes the full `options` (`:103`). |
| 2 | `book_fact_registry_stage` | **LLM** (8000 tok) | Same budget. Target is 8–60 facts, `max(8, min(60, chapters*4))` (`:94`). |
| 3 | `global_adaptation_plan_stage` | **LLM** | Picks **12–30 `important_fact_ids` for the whole book** (`:43`). The prompt includes `options` (`:66`). |
| 4 | `global_character_world_bible_stage` | **LLM** | The prompt includes `options` (`:68`). |
| 5 | `bible_silhouette_uniqueness_stage` | deterministic | Writes `context.bible_warnings`, which are **never persisted or returned** (only 3 references exist; `book_context.py:88`). |
| 6 | `character_art_direction_stage` | **LLM** (16000 tok) | The prompt includes `options` (`:87`). |
| 7 | `character_voice_cards_stage` | **LLM** | |
| 8 | `arc_outline_stage` | **LLM** | 4–12 slices, each with an LLM-authored page range and `must_cover_fact_ids`. |

After the stages:
- `_persist_understanding_to_project` sets `understanding_status="ready"` and `bible_locked=True` **before** the character sheets exist (`:276-277`).
- `ensure_book_character_sheets` calls the **image model** when `generate_images` is set and a key exists (`:285-293`, `character_library_service.py:127-135`, `188-193`).
- The sprite quality gate then runs a **MiniMax-M3 vision** review and **auto-regenerates images** for failed sprites (`:301-342`, `services/manga/sprite_quality_service.py:430`, `sprite_quality_gate.py:145`).
- **[Run] How much text the understanding stages see:** 25% of `happy-prince-and-other-tales` (21,334 of 86,731 chars) and 23% of `civil-disobedience` (12,139 of 51,990 chars). The fact registry and arc outline are planned from that fraction.
- There is no per-stage checkpoint: nothing is persisted until all 8 stages succeed, so a failure at stage 8 means paying again for stages 1–7 [Code] (`:259-277`).

### 2.6 `generate_project_slice` (per slice)
[Code] `services/manga/generation_service.py:423-674`

1. `_pick_next_slice` (`:380-420`): if an arc outline exists, it uses `choose_next_arc_slice`; otherwise it uses the legacy `choose_next_textful_page_slice`.
2. `build_source_text_for_slice` (`:96-117`) includes **every section that overlaps the slice**. There is one section per chapter, so every slice that touches a chapter gets the **whole chapter** [Code]. Empty text raises `"no extractable text"` (`:454-456`).
3. Optional compiled context (flag): the text is byte-compared and the call raises on mismatch (`:458-479`).
4. Options are merged from project options, run options, `source_text`, `asset_manifest`, and `image_api_key` when panel art is on (`:481-502`). `slice_role` defaults to **"opening" for every slice** (`:189-190`).
5. Book artifacts are hydrated into the context and treated as read-only (`:148-172`). The arc entry is stamped on (`:513-516`).
6. The stage list runs (`:518-524`). If the final `quality_report` has errors, it raises and **nothing is persisted** (`:525-541`).
7. Assets: `_build_asset_docs` calls the image model for missing specs when images are on (`:309-377`, `:544-551`).
8. Persistence, non-atomic, in this order:
   1. `MangaSliceDoc.insert` with `status="complete"` (`:553-570`).
   2. One `MangaPageDoc` per rendered page, with `page_index = coverage.page_count + offset` (`:572-589`).
   3. Asset inserts (`:591-592`).
   4. Ledger update (`:610-616`).
   5. Project fields, then **`project.status="complete"`** and save (`:617-632`).
9. The optional memory mirror (`:634-651`) and the optional agentic shadow lane (`:653-670`) run last.

### 2.7 The v1 per-slice stage list: `build_v2_generation_stages`
[Code] `services/manga/generation_service.py:212-288`. There are 26 entries, plus 2 when panel art is on. "LLM" means a MiniMax call through `run_structured_llm_stage` (`manga_pipeline/llm_contracts.py:154-211`); it validates and retries with a repair prompt, and each attempt is paid.

| # | Stage | LLM? | Image? | What it does |
|---|---|---|---|---|
| 1 | `source_fact_extraction` | Only if the registry is empty | – | With a registry (the normal case), it sets `new_fact_ids` to registry facts whose `source_refs` overlap the slice pages and are not yet known. There is **no LLM call, and no new slice-local facts** (`stages/source_fact_extraction_stage.py:37-59`, `114-115`). |
| 2 | `adaptation_plan` | Only if there is no book plan | – | Passthrough (`:65-68`). |
| 3 | `character_world_bible` | Only if the bible is not locked | – | Passthrough (`:63-65`). |
| 4 | `beat_sheet` | **Yes** (≤5 attempts, 7000 tok) | – | `project_options` in the prompt contains `source_text` and **the keys** (`:65`). |
| 5 | `manga_script` | **Yes** (≤5, 9000) | – | `:73` |
| 6 | `script_review` | **Yes** (≤3, 9000), plus deterministic voice and grounding validators | – | The report is **not persisted**. |
| 7 | `script_repair` | Only if the review has errors (≤5) | – | **No second review** after the repair; the review is set to None (`:147`). |
| 8 | `storyboard` | **Yes** (≤5, 10000) | – | `:98` |
| 9 | `dsl_validation` | – | – | Panel, page and dialogue budgets and must-cover anchors, checked by ID (`manga_dsl.py:502-557`). |
| 10 | `continuity_gate` | – | – | Arc must-cover (error), hooks (warning), protagonist present (error). |
| 11 | `quality_gate` | – | – | **Requires every global `important_fact_id` (12–30 for the whole book) in each slice** (`stages/quality_gate_stage.py:16-18`, `services/manga/quality_service.py:44-56`). |
| 12 | `storyboard_grounding_repair` | – | – | **Deterministic mutation**, then `quality_report=None` (see §5). |
| 13–15 | dsl, continuity, quality | – | – | Re-check. |
| 16 | `quality_repair` | Only if still failing (≤5, 24000) | – | Full storyboard rewrite (`:97-125`). |
| 17 | `storyboard_grounding_repair` | – | – | Mutates again. |
| 18–20 | dsl, continuity, quality | – | – | |
| 21 | `quality_assert` | – | – | Raises on any error (`:8-21`). |
| 22 | `page_composition` | **Yes, one call per page** (≤5 each, 6000) | – | A deterministic grid is the fallback (§5). |
| 23 | `rtl_composition_validation` | – | – | Warnings only (`manga_dsl.py:601,639,677`), so it never blocks. |
| 24 | `vector_scene` | **Yes** (≤3, 5000) | – | Typed SVG primitives per panel. Deterministic defaults on failure (§5). |
| 25 | `character_asset_plan` | – | – | Deterministic planner (`:24-56`). |
| 26 | `rendered_page_assembly` | – | – | Storyboard plus composition becomes `RenderedPage` (`:30-52`). |
| 27 | `panel_rendering` (conditional) | – | **Yes**: OpenRouter Gemini image with character-sheet references | Only when `image_mode` is `budgeted` or `full_panel_art` and a key exists (`generation_service.py:495-502`). Budgeted mode renders 3 key panels per slice; a full book is capped at 8 (`celery_manga_tasks.py:198-203`). |
| 28 | `panel_quality_gate` (conditional) | – | – | Structural checks on render artifacts. Individual panel failures are **not** errors (`:112-163`). |

Minimum LLM calls per slice when understanding is ready: beat, script, review, storyboard, vector, plus one per page (usually 3–6 pages). With retries it can reach about 5 attempts × (5 stages + pages) [Code/Inf].

### 2.8 Persistence and reader API
- `MangaSliceDoc` ([Code] `manga_models.py:82-111`) holds `source_slice`, `beat_sheet_fragment`, `manga_script_fragment`, `storyboard_pages`, `quality_report`, `llm_traces` and `new_fact_ids`. Only successful slices are written, and they are always `status="complete"`.
- `MangaPageDoc.rendered_page` ([Code] `manga_models.py:114-136`, `domain/manga/render_view.py:94-150`) holds `{storyboard_page (panels: dialogue, narration, action, vector_scene, source_fact_ids), composition, panel_artifacts{image_path, error, used_reference_assets}}`. The `(project_id, page_index)` index is **not unique**.
- `MangaAssetDoc`: character sheets (image path, or prompt only).
- Routes the frontend uses [Code] (`frontend/lib/api.ts:80-357`):
  - `GET /books/{id}`
  - `POST /books/{id}/manga-projects` and `GET /books/{id}/manga-projects`
  - `GET /manga-projects/{id}` (with `active_jobs` and `latest_jobs`)
  - `GET /manga-projects/{id}/slices`
  - **`GET /manga-projects/{id}/pages`**, the main reader (`api/routes/manga_projects.py:386-393`, sorted by `page_index`, no dedupe)
  - `GET /manga-projects/{id}/assets`, `POST /manga-projects/{id}/character-sheets`, `POST /manga-projects/{id}/assets/{a}/regenerate`, `POST /manga-projects/{id}/assets/{a}/pin`
  - `POST /manga-projects/{id}/next-source-slice`, which uses the **legacy page slicer even for arc projects** (`:584-591`)
  - `POST /manga-projects/{id}/book-understanding`, `/build` and `/generate-slice`
  - `GET /status/{task}` and `POST /jobs/{task}/cancel`
  - `GET /images/{path}` (`frontend/lib/api.ts:343`)
  - `GET /openrouter/models`, `/image-models`, `/credits`
  - `GET /books/{id}/pdf/*`
- The v2-lane reader `GET /manga-projects/{id}/v2/pages` and `/v2-media/*` ([Code] `api/routes/manga_v2_reader.py:97-190`) are behind `NEXT_PUBLIC_MANGA_V2_LANE_READER=1`, which is off by default ([Code] `frontend/lib/manga-v2-lane.ts:76-78`).

---

## 3. Providers: how MiniMax is reached, and every image-model call

### 3.1 Text LLM: `llm_client.py`
- [Code] Every caller is forced to MiniMax.
  - A provider other than MiniMax only produces a warning (`:71-83`).
  - `api_key` is ignored in favour of the `MINIMAX_API_KEY` environment variable or setting (`:96-99`).
  - A model name not starting with "minimax" becomes `MiniMax-M3` (`:104-108`).
  - The transport is `AsyncOpenAI(base_url="https://api.minimax.io/v1")`, i.e. **direct HTTP, not the harness** (`:100-103`).
  - It sends `extra_body={"reasoning_split": True, "thinking": {"type": "disabled"}}` for M3 (`:133-144`) and uses `asyncio.wait_for` with a 1800 s default (`:208-211`).
- **Hidden retries** [Run]: openai 1.57.0 defaults to `max_retries=2` with a 600 s read timeout, and `_should_retry` covers 429 and ≥500. So the comment "429 — surface immediately" (`:251-259`) is false at the SDK level. A slow call can be sent up to 3 times inside one 1800 s wait.
- Cost estimates use gpt-4o-mini prices (`:123-131`), not MiniMax prices, so every `cost_so_far` figure is wrong [Code].
- `tiktoken.encoding_for_model` (`:112-115`) downloads a BPE file from `openaipublic.blob.core.windows.net` when the cache is cold [Run]. This was the only outbound request the tests made.
- Strict-JSON stages use `strict_json_routing.strict_json_client_for` (`manga_pipeline/strict_json_routing.py:21-61`). It can build a new MiniMax `LLMClient` per stage, and it **mutates `request_timeout_seconds` on the shared client** (300 s default).
- Direct MiniMax call sites:
  - `manga_pipeline/llm_contracts.py:176`, used by every structured stage, book-level and per-slice.
  - `services/manga/sprite_quality_service.py:430` (vision).
  - `services/manga_vision_qa.py:43` (vision, agentic lane).
  - `LLMClient.chat_with_retry` (`:473-509`) has **no callers**.

### 3.2 Vision: `vision_client.py`
- [Code] It wraps the same `LLMClient.client` and sends image parts (base64 data URLs) to MiniMax (`:112-133`); the model is fixed to M3 via `services/manga/vision_client_factory.py:23-42`. It uses no timeout wrapper, only the SDK's 600 s and 2 retries.
- It is used by the sprite quality gate (book understanding) and by the v2 page-art gates.

### 3.3 Image generation: `image_generator.py` and friends
Every place that can call an image-generation model:

| # | Call site | Model / endpoint | Reached from | Default path? |
|---|---|---|---|---|
| I1 | `image_generator.generate_image_with_model` (`:78-200`, POST `openrouter.ai/api/v1/chat/completions` at `:118`, ≤3 attempts) | `google/gemini-2.5-flash-image`, forced by `_low_cost_image_model` (`:55-67`) | `services/manga/asset_image_service.build_generated_asset_doc:94` ← (a) `character_library_service._materialize_spec:127-135` ← `ensure_book_character_sheets` ← book understanding (`book_understanding_service.py:288`) and `POST /character-sheets` (`manga_projects.py:475`); (b) `character_library_service.regenerate_asset_doc:300` ← `POST /assets/{id}/regenerate` (`manga_projects.py:536`) and the sprite-gate auto-regen (`book_understanding_service.py:327-342`); (c) `generation_service._build_asset_docs:360-368` per slice | **YES** (image mode on by default) |
| I2 | `image_generator.generate_image_with_references` (`:203-348`, POST at `:263`, ≤3 attempts) | same model, with reference PNGs | `services/manga/storyboard_panel_renderer.render_rendered_pages:398,409-443` ← `stages/panel_rendering_stage.py:50` | **YES** (budgeted: 3 key panels per slice) |
| I3 | `image_generator.generate_panel_image` (`:351-446`, `:391`), `generate_character_sprite` (`:453-495`), `generate_images_for_summary` (`:526-603`) | same | **no callers** (dead) | no |
| I4 | `services/manga/panel_rendering_service.py:461` (default renderer `generate_image_with_references`) | same | helpers imported by `storyboard_panel_renderer` | via I2 |
| I5 | `services/manga_page_art_stage._execute_image_call` (`:657-676`) | `PAGE_ART_MODEL="google/gemini-2.5-flash-image"` (`services/manga_page_art.py:56`), using the **server** `OPENROUTER_API_KEY` (`agentic_pipeline_bridge.py:57-61`) | agentic shadow lane (flag) and `scripts/live_page_art_wmc*.py`, `whole_book_wmc_s7/s8.py`, `smoke_gates_v3_s7.py`, `eval_*` | no (both flags off; the shadow budget defaults to `max_image_cost_usd=0.0`, `:191-195`) |
| I6 | `scripts/bakeoff_s8_binding.py:312` | direct OpenRouter | script | no |

Non-generative OpenRouter calls that go away with image models: `GET /openrouter/models` (`api/routes/media.py:80-123`), `GET /credits` (`api/routes/jobs.py:15-36`), `GET /image-models` (`media.py:18-23`), and `agents/credit_tracker.py:78`, which has **no importers**.

**To make image calls zero:**
- Remove or disable I1, I2, I4 and I5 (I3 is already dead code).
- Force `image_mode="none"` server-side. Both request defaults need changing: `manga_projects.py:93` and frontend `:354`.
- Delete the stages `panel_rendering_stage` and `panel_quality_gate_stage`.
- Remove the sprite quality gate's regeneration path.

The deterministic pieces already in place are the `vector_scene` primitives, the composition geometry and `character_asset_plan` prompt-only docs.

---

## 4. Feature flags and lanes

Settings in `config.py` (none are set in `.env`, so the values below are the effective ones):

| Setting | Default | Read by | Effect |
|---|---|---|---|
| `mongodb_url` / `db_name` | `mongodb://localhost:27017` / `panelsummary` | `main.py:109`, `celery_worker.py:92,125` | `.env` overrides the URL (to Atlas); the db name stays `panelsummary`. |
| `redis_url` | `redis://localhost:6379` | **not used by Celery**: `celery_worker.py:22` reads `os.getenv("REDIS_URL")`, and `.env` is never exported by `start.sh` | The `.env` `REDIS_URL` is ignored by the worker [Code]. |
| `default_model`, `max_tokens_per_chapter`, `max_pages_per_job`, `secret_key`, `manga_pipeline_version="legacy"` | – | **0 readers** | Dead. |
| `llm_request_timeout_seconds` 1800 / `llm_slow_warning_seconds` 300 | env `LLM_REQUEST_TIMEOUT_SECONDS` / `LLM_SLOW_WARNING_SECONDS` override | `llm_client.py:87-94` | |
| `openrouter_api_key` | "" | `media.py`, `agentic_pipeline_bridge.py:59`, `manga_page_art_stage.py` | The server key is used only by the agentic lane. |
| `minimax_api_key` | "" | `llm_client.py:96`, `strict_json_routing.py:14`, `book_understanding_service.py:321` | |
| `use_compiled_context` | **False** | `generation_service.py:461`, bridge | When on, slice text is rebuilt from `source_units` and byte-compared; it raises on any drift. Source units are created only by `app/scripts/normalize_source_units.py` or the scopes API, and the frontend never calls `/scopes` [Code]. |
| `compiled_context_max_input_tokens` 120000 | | `compiled_context_bridge.py` | |
| `agent_model_mode_direction`="quality", `_page_writing`="speed", `_thumbnail`="speed" | | `services/model_policy.py` only (agentic lane) | |
| `agentic_manga_pipeline_v1` | **False** | `generation_service.py:653`, `agentic_pipeline_bridge.py:120` | **Shadow lane.** It also requires `use_compiled_context` (`:122-131`), runs after the v1 slice is persisted, and swallows every exception (`:151-157`). |
| `agent_seam_raw_dump_dir` | "" | `page_domain_tools.py` | |

Settings that exist only as environment variables:
- `DOMAIN_TOOL_BROKER_TOKEN`: `main.py:91-93` has an insecure default, `local-domain-tool-token-change-me`. `start.sh` exports a random token.
- `AGENT_WORKER_URL` and `AGENT_WORKER_TOKEN` (`agentic_pipeline_bridge.py:54-55`).
- `NEXT_PUBLIC_MANGA_V2_LANE_READER` (frontend).

Which code runs where:
- **Active path:** the v1 build path in §2, which is only direct MiniMax plus OpenRouter images.
- **Shadow-only, behind two flags that are both off:**
  - `agentic_pipeline_bridge` (Director → page scripts → thumbnails → page art through the Node harness on `:8788`/`:8789`)
  - `compiled_context_bridge`
  - `memory`, `context_compiler`, `generation_runs`, `scopes`
  - `manga_director`, `manga_page_planner`, `manga_page_art(_stage)`, `manga_vision_qa`
- `start.sh` still launches the broker (`:8010`) and two harness workers (`:8788`/`:8789`), but the v1 path never calls them.
- **Reachable only through the internal tool router**, which only the Node worker calls: `/internal/v1/agent-tools/{tool}` (`api/routes/internal_tools.py:48-88`), backed by `page_domain_tools`, `domain_tools`, `manga_page_planning`, `manga_content_validation`, `manga_craft_validation`, `manga_validation` and `manga_layout`.
- **Scripts or tests only:**
  - `services/whole_book.py`
  - `services/manga_eval.py`
  - `services/manga_layout_templates.py` (tests only)
  - everything in `scripts/*.py`
  - `app/scripts/*` (CLI: `job_monitor`, which is the only code that **revokes** a Celery task, at `:216`; `delete_book`; `migrate_rendered_pages`; `normalize_source_units`)
- **Dead code:**
  - `image_generator` I3
  - `LLMClient.chat_with_retry`
  - `agents/credit_tracker.py`
  - `app/reel_engine/`, which holds only stale `__pycache__` and has no tracked source

---

## 5. Silent fallbacks and degradations (the owner wants these made visible)

| # | Where | What silently replaces authored or LLM work | Visible to the user? |
|---|---|---|---|
| F1 | `stages/storyboard_grounding_repair_stage.py:104-133` (called at `:463-466` and `:476-479`) | **Fake fact grounding.** Every missing global `important_fact_id` is appended to page 1, panel 1's `source_fact_ids`, and no text is added. `tests/test_storyboard_grounding_repair_stage_v2.py:70-95` asserts this as intended behaviour ("anchors_required_facts_without_visible_text"). | No. The quality report then shows the facts as "grounded". |
| F2 | same file, `:64-101` | Dialogue from speakers not in the bible is moved into `action`, which is art direction and never shown as text. Those characters are removed from `character_ids`. | No |
| F3 | `:136-165` | Narration beyond `len(panels)//3` captions is moved into `action`. | No |
| F4 | `:168-198`, `:257-262` | Dialogue is **truncated** at a word boundary. At most 2 chunks are kept, and dialogue groups beyond the panel budget are **dropped** (`groups[: 1 + available_new_panels]`). | No |
| F5 | `:294-308` | Pages are padded to `min_panels` with duplicated "Silent continuation beat" panels. | No |
| F6 | `:404-405`, `:407-432` | Pages beyond `max_pages` are **cut**, and slices are padded to `min_pages` with silent copies of the last page. | No |
| F7 | `:327-371` | The last panel is repurposed as To-Be-Continued with the default text "To be continued." and hook "The story turns toward the next change." Because `slice_role` is always "opening" (`generation_service.py:189-190`) and `source_has_more = page_end < total_pages` (`:481`), the **final KETSU slice** also gets a TBC when the arc ends before the back matter. | Only as a CONTINUITY_TBC_AFTER_KETSU warning |
| F8 | `:486` | `quality_report=None`, which discards all issues found so far. | No |
| F9 | `stages/page_composition_stage.py:734-742`, `:440-479` | When an LLM composition fails validation or has the wrong panel IDs, a deterministic equal-split grid replaces it (`_fallback_composition_for_page`, `:286-376`). The real reason ("failed validation") is overwritten by the misleading note "panel_order did not match". | Only in the `composition_notes` string |
| F10 | `page_composition_stage.py:630-696` | Bubbles that overlap faces or are invalid are **dropped**. | Only in the notes |
| F11 | `stages/vector_scene_stage.py:218-220`, `:169-181` | On `LLMOutputValidationError`, every panel gets `default_vector_scene_for_panel`, and the **failed trace (spend) is discarded**. Scenes that are partly authored are filled in quietly. | No |
| F12 | `stages/rendered_page_assembly_stage.py:39-43` | Default compositions become `None`, so the reader falls back to its legacy layout. | No |
| F13 | `llm_client.py:346-352`, `:356-471` | **Truncated-JSON recovery.** A response cut off at `max_tokens` is closed or trimmed; if the result passes the schema, the artifact is accepted with content missing. | Only in logs |
| F14 | `stages/script_repair_stage.py:147` | The repaired script is accepted without a second review. The review report is never persisted. | No |
| F15 | `pdf_parser.py:193-198`, `:433-435` | Docling failure falls back to PyMuPDF heuristics ([Run]: this happened on this machine). | Only in logs |
| F16 | `pdf_parser.py:341`, `:355-363` | Text before the first heading is dropped; if no headings are found, the book becomes a single "Full Text" chapter. | No |
| F17 | `whole_book_synopsis_stage.py:63-64`, `:83-84`, and the same in `book_fact_registry_stage.py:69-84` | Chapter bodies are cut at 4000 chars, and tail chapters are dropped at 120k chars ([Run]: about 25% of each test book is seen). | No |
| F18 | `celery_manga_tasks.py:217-222` together with the arc path (`generation_service.py:398-408`, `454-456`) | A **textless arc entry** in the middle of a full-book build ends the build as "Remaining source has no adaptable text — coverage complete". The arc path does not skip textless entries. | Reported as success |
| F19 | `services/manga/source_slice_service.py:128-130` (legacy path) | Textless windows are marked covered. | No |
| F20 | `stages/panel_rendering_stage.py:72-78` | Partial panel-render failures are only logged. `panel_rendering_summary` sits in `options` and is not persisted. | Only as `panel_artifacts[x].error` |
| F21 | `image_generator.py:59-67`, `llm_client.py:73-83`, `strict_json_routing.py:40-48` | Requested models or providers are silently replaced. | Only in logs |
| F22 | `celery_manga_tasks.py:236` and `generation_service.py:631` | The status is `complete` after a single `next_chunk` slice, and after every slice of a full-book build (§7). | Misleading |
| F23 | `agentic_pipeline_bridge.py:151-157` | Every failure in the shadow lane is swallowed. v2 page art degrades to `dsl_only_after_{rejected, budget_exhausted}` (`manga_page_art_stage.py:505-514`); this is receipted, but the v2 reader is off. | No |
| F24 | `book_context.py:88` | Bible uniqueness warnings are dropped. | No |

**[Run] Effect of F1–F8** (probe `scratchpad/phase1/repair_probe.py`, no LLM). The input was one page with one panel: a 180-character line (about 21 words, so over the 90-char per-panel cap), a line from an unknown speaker, and only 1 of 3 required facts anchored.
- Gate before the repair: **FAIL**, with DSL_PAGE_UNDER_PANEL_BUDGET, DSL_PANEL_OVER_DIALOGUE_CHARS, DSL_SLICE_UNDER_PAGE_BUDGET, missing_required_fact and panel_unknown_character.
- After the repair:
  - 3 pages × 3 panels, of which 7 are silent padded panels.
  - Panel 1 `source_fact_ids=[f001,f002,f003]`, with narration `''`.
  - The unknown speaker's line was moved into `action`.
  - The line was cut to "…becomes the thing that", dropping the ending.
  - The TBC panel says "To be continued."
- Gate after the repair: **`passed=True`, 0 errors, grounded=[f001,f002,f003], missing=[]**.

Why F1 fires on every slice: the per-slice quality gate demands all 12–30 **book-wide** `important_fact_ids` (`stages/quality_gate_stage.py:16-18`). A 3–6 page slice cannot honestly carry them, so the deterministic stamp satisfies the check, and each slice's page 1, panel 1 claims to carry every important fact in the book [Code/Inf].

---

## 6. Source coverage and claim tracking

- **Slice selection** [Code] `services/manga/arc_slice_planning_service.py:54-141`.
  - The arc outline authored by the LLM has 4–12 entries, and `ArcOutline` allows up to 24 (`domain/manga/book_understanding.py:145-155`).
  - The validator (`:156-180`) checks entry count, 1..N numbering and non-decreasing `page_start`. It does **not** check that ranges cover pages 1..`total_pages`, that ranges don't overlap, that `must_cover` IDs exist in the registry, or that THESIS/CORE facts are covered.
  - An entry counts as "already covered" if **any** covered range intersects it (`:54-72`).
- **[Run] Arc probe** (`scratchpad/phase1/arc_probe.py`). Entries were 1:[1-20], 2:[20-40], 3:[41-60] and 4:[80-100]; the generated order was 1, 3, 4.
  - **Entry 2 was silently skipped** because it overlaps entry 1 at page 20.
  - Pages 61–79 were never assigned, and nothing reported it.
  - The build then reports "All source pages are already covered" (`celery_manga_tasks.py:214-216`).
- **Page budget:** 3–6 manga pages per slice, depending on role (`manga_pipeline/manga_dsl.py:105-111`). A whole book therefore produces at most about 72 pages, and typically 16–48 [Code/Inf].
- **Source text precision:** there is one section per chapter (`celery_worker.py:223-236`) and sections are selected by overlap (`generation_service.py:96-117`). An arc entry that splits a chapter gives the **entire chapter** to both slices, and page ranges do not constrain the text [Code].
- **Must-preserve tracking:**
  - Facts live in `project.fact_registry` (IDs, text, importance, `source_refs` pages) and come from about 25% of the text (§2.5).
  - Per-slice extraction is skipped once the registry exists, so facts that only appear in the unseen 75% can never enter the registry [Code/Inf].
  - Every "coverage" check is an **ID-presence** check on `panel.source_fact_ids`: `quality_service.py:19-56`, `manga_dsl.py:420-449` and `continuity_gate_stage.py:137-153`. Nothing checks that the fact's content appears in dialogue, narration or art.
  - `ledger.known_fact_ids` is updated from `new_fact_ids`, which means "registry facts whose pages overlap this slice", not "facts the storyboard delivered" (`domain/manga/continuity.py:78-92`, `stages/source_fact_extraction_stage.py:37-59`).
- **The ledger's narrative state is never written in v1:** `open_threads`, `character_state` and `current_story_state` are only assigned in `services/memory.py`, which is the v2 lane. v1 writes only covered ranges, known facts, the recap (240 chars) and the last hook [Code].
- **Where coverage can be silently lost:** F16 and F17 (parse and understanding budgets), arc overlap and gaps, F18 (textless arc entry ends the build), F4 and F6 (truncation and page cuts), and F1 (fake anchoring).

---

## 7. Job and project status semantics

- **The recorded bug, rechecked: still present.**
  - The build sets `project.status="generating"` once (`celery_manga_tasks.py:113`).
  - Each `generate_project_slice` then sets `project.status="complete"` and saves (`generation_service.py:631-632`).
  - During a full-book build the project therefore reads `complete` from slice 1 until the task ends. The frontend shows `project.status` in the project picker (`frontend/components/MangaV2ProjectPanel.tsx:924`) [Code].
- **`next_chunk` is the frontend default** (`:352`). One Generate click produces **one arc slice** of 3–6 pages, then "Manga build complete: 1 chunk(s)". Both the project and the job read complete while most of the book is not adapted [Code].
- `complete` mixes up "the last job finished" with "the book is adapted". No field reports arc progress; `slice_progress_summary` exists (`arc_slice_planning_service.py:158-167`) but no route uses it [Code].
- **Cancel is cosmetic.** `POST /jobs/{id}/cancel` sets `JobStatus.status="cancelled"` and does **not** revoke the Celery task (`api/routes/jobs.py:39-54`). The task keeps running and paying, and later overwrites the status with success or failure. Meanwhile the "active job" lock is released, so a second build can start [Code].
- **The "already running" lock is per job type.** `build`, `generate-slice` and `book-understanding` each check only their own type (`manga_projects.py:627-638`, `:690-700`, `:783-793`), so a build and a generate-slice can run on the same project at once [Code]. With the single solo worker they queue rather than overlap; overlap needs two workers [Inf].
- **Stale jobs.** `GET /status` only turns a job into a failure when Celery reports FAILURE or REVOKED (`main.py:351-379`). If the worker dies, the result stays PENDING and the JobStatus stays `pending`/`progress`, which blocks `/build` for that project indefinitely ("A manga build is already running") [Code]. `acks_late` redelivery after a restart may eventually re-run it [Inf].
- The guards in `_run_guarded` catch every exception and do not re-raise, so the Celery state is SUCCESS even when the job failed. JobStatus is the only source of truth [Code].

---

## 8. Resumability, idempotency and repeated charges

- **`last_failure` and "continue"** (commit 0fc2515):
  - `last_failure` is written only by the build task (`celery_manga_tasks.py:262-268`).
  - It is **cleared at the start of the next build** (`:97-98`) and turned into a transient progress message (`:129-140`).
  - The frontend never renders `last_failure`; there are no grep hits under `frontend/`.
  - "Continue" is simply the arc or ledger picking the next uncovered entry.
  - Tests cover only the helpers (`tests/test_build_resume_v1.py`); the task itself is untested [Code].
- **No checkpoints inside a slice.** When a slice fails (quality assert, an LLM contract failure, or the gate at `generation_service.py:525-541`), nothing is persisted, including the `llm_traces`. The retry reruns every per-slice stage from the start, and the spend on the failed attempt is invisible [Code].
- **No checkpoints inside book understanding** (§2.5). A failure reruns up to 7 LLM stages.
- **Non-atomic writes** (`generation_service.py:553-632`). A crash after `slice_doc.insert` or the page inserts but before `project.save` leaves orphan slice and page documents. The ledger was not advanced, so the next run regenerates the same entry with `page_index` starting at the **old** `coverage.page_count`. That produces **duplicate `page_index` rows**, which the reader returns (`manga_projects.py:392`, and the index is not unique) [Code].
- **Repeated provider charges:**
  - Up to 3–5 validation attempts per stage (`llm_contracts.py:175-211`).
  - Up to 2 hidden SDK retries per attempt, including on 429 and timeouts [Run/§3.1].
  - Up to 5 attempts per page for composition.
  - Image calls: up to 3 attempts per asset or panel (`image_generator.py:115-200`, `260-348`), plus sprite-gate regenerations.
  - Celery `acks_late` redelivery after a worker restart re-runs the whole task [Inf].
- **Idempotency that does exist:** assets are deduped by planner `asset_id` (`generation_service.py:337-341`), and character sheets are idempotent. The v2 lane has `idempotency_key` unique indexes on runs and stages (`persistence/documents.py:263-264`, `299-300`), which v1 lacks.

---

## 9. Book understanding: the artifact and whether it can be reused

The book-understanding pass persists these artifacts on `MangaProjectDoc` ([Code] `book_understanding_service.py:125-146`, `domain/manga/book_understanding.py:43-203`, `domain/manga/artifacts.py:63-90`):

- `book_synopsis`: title, author_voice, intended_reader, central_thesis, logline, structural_signal, themes, key_concepts, emotional_arc, notable_evidence. A validator requires at least 3 signals.
- `fact_registry`: `SourceFact[]`, each with `fact_id`, text, importance (THESIS…SUPPORTING), `source_refs` (page ranges) and tags.
- `adaptation_plan`: logline, thesis, protagonist_contract, `important_fact_ids` (12–30), journeys and metaphors.
- `character_world_bible`: characters with `character_id`, name, role, visual_lock, silhouette, outfit and hair/face notes, plus the world and visual style.
- `character_art_direction` and `character_voice_cards`.
- `arc_outline`: entries with role (KI/SHO/TEN/KETSU/RECAP), source_range, headline_beat, must_cover_fact_ids and closing_hook.
- `book_understanding_traces`.

**Is it reusable as a "book understanding" stage?**
- The *schemas* are good and typed, and they already carry page provenance for facts and arc ranges.
- The *producer* cannot be trusted as-is:
  1. It sees about 25% of the text [Run].
  2. The arc validator allows gaps and overlaps [Run].
  3. The plan's global `important_fact_ids` are misused as a per-slice gate (§5).
  4. It dumps `options`, including keys, into prompts [Run].
  5. It is not checkpointed.
  6. It calls MiniMax directly, not through the harness.
- The agentic lane does **not** read any of it (no references in `manga_director.py`, `manga_page_planner.py`, `context_compiler.py` or `memory.py`); the two lanes have separate "understanding" [Code].

**Recommendation** [Inf]: keep the domain models. Re-implement the producer as harness goals, with three changes:
- Chunk the text by chapter so every chapter is read in full.
- Validate that the arc covers pages 1..N with no overlap.
- Make `must_cover` a per-slice subset of the registry, and verify it by content rather than by ID.

---

## 10. Mongo collections

| Collection | Document class | Lane | Registered in |
|---|---|---|---|
| `books` | `models.Book` | v1 (the donor `BookDoc` targets the same collection but is **not registered**; it is read through the bridge) | `main.py:112-118`, `celery_worker.py:127-130` |
| `job_statuses` | `models.JobStatus` | v1 | same |
| `manga_projects` | `manga_models.MangaProjectDoc` (the donor v2 class of the same name is not registered) | v1, with `active_memory_version` added for the bridge | same |
| `manga_slices` | `MangaSliceDoc` | v1 only | same |
| `manga_pages` | `MangaPageDoc` (the main reader's contract) | v1 only | same |
| `manga_assets` | `MangaAssetDoc` | v1 only | same |
| `source_units` | `persistence/documents.SourceUnitDoc` | agentic / durable context | `persistence/v1_bridge.init_wired_documents` (`:68-88`), on a separate tz-aware client |
| `scope_manifests` | `ScopeManifestDoc` | agentic | same |
| `project_memory_snapshots` | `ProjectMemorySnapshotDoc` | agentic | same |
| `artifacts` | `ArtifactDoc` (the v2 reader's source) | agentic | same |
| `generation_runs` | `GenerationRunDoc` (unique `idempotency_key`) | agentic | same |
| `stage_runs` | `StageRunDoc` (unique `idempotency_key`) | agentic | same |
| `series_progress` | `SeriesProgressDoc` | agentic (reel) | same |

API and worker startup run `init_wired_documents`, which creates the indexes on the 7 agentic collections in whichever database `MONGODB_URL` points to, including Atlas under the current `.env`. The default path writes no rows to them [Code/Inf].

---

## 11. Tests

- **Setup** [Code]:
  - There is no `conftest.py`, `pyproject.toml` or `pytest.ini`. Tests add `backend/` to `sys.path` themselves.
  - Async code runs through `asyncio.run` (53 files). pytest-asyncio and pytest-timeout are **not installed**, so `--timeout` could not be used.
  - `uv run` works outside a project and resolves to `backend/.venv` (Python 3.12.8).
  - No test calls `init_beanie`, Motor or Mongo. FastAPI routes are tested with `TestClient` and in-process fakes.
  - LLMs are `FakeLLMClient` (provider "fake"). Where a stage could build a real client, tests monkeypatch `LLMClient`.
- **Commands and results** [Run], all with the guards from §1:
  1. `uv run pytest tests/ -q -x -p no:cacheprovider`: **1 failed, 254 passed**. The failure (`test_llm_client_json_parsing.py::test_minimax_provider_uses_env_key_and_openai_compatible_base_url`) happened because my network guard blocked tiktoken's first download of its BPE file from `openaipublic.blob.core.windows.net`. This is an environment artifact, not a code defect.
  2. The same command with only that free public host allowed: **822 passed, 0 failed** (16.7 s).
  3. The same without `-x`, logging loopback connections too: **822 passed, 0 failed** (13.8 s). **0 outbound and 0 loopback connections**, so no Mongo, no Redis and no paid APIs.
  4. `git status --short` stayed empty.
- **What the suite does not cover** [Code]:
  - `generate_project_slice` end to end.
  - `build_manga_project_task`, `generate_manga_slice_task` and `generate_book_understanding_task`.
  - Persistence ordering, status transitions, cancellation, and duplicate pages.
- Several tests **lock in the silent behaviours** as intended, for example `test_storyboard_grounding_repair_anchors_required_facts_without_visible_text`, `..._clamps_pages_to_configured_max` and `..._cuts_unbroken_dialogue_at_word_boundary`. Green tests here do not show that the behaviour is correct.

---

## 12. Security findings (in scope because they sit on the backend path)

- **S1: the user's OpenRouter key reaches MiniMax prompts** [Run, Code].
  - `celery_manga_tasks.py:154-156` puts the key into `run_options`, and `generation_service.py:498` puts `options["image_api_key"]` into the context options.
  - Ten prompt builders serialize those options with `json.dumps`: `stages/adaptation_plan_stage.py:46`, `beat_sheet_stage.py:65`, `character_world_bible_stage.py:46`, `manga_script_stage.py:73`, `storyboard_stage.py:98`, `quality_repair_stage.py:73`, and in the book stages `whole_book_synopsis_stage.py:103`, `global_adaptation_plan_stage.py:66`, `global_character_world_bible_stage.py:68` and `character_art_direction_stage.py:87`.
  - On the normal path (understanding ready), the per-slice adaptation_plan and character_world_bible stages short-circuit. The key still reaches beat_sheet, manga_script, storyboard and quality_repair on every slice, and the four book stages when the build runs understanding inline.
  - Probe (`scratchpad/phase1/leak_probe.py`): with a sentinel key in the options, the beat_sheet prompt contained it **twice**.
  - This contradicts `docs/BACKEND_FLOW.md:51`, which claims "not stored" [Doc]. The key is also a Celery task argument, so it sits in Redis [Inf].
- **S2: path traversal on `GET /images/{image_path:path}`** [Run].
  - The route does `os.path.join(settings.image_dir, image_path)` with no normalization (`api/routes/media.py:126-136`).
  - Probe (`scratchpad/phase1/traversal_probe.py`, run against a scratch sentinel): `/images/..%2F..%2Ftraversal_sentinel.txt` returned **200 and the file**, and so did the `%2E%2E/` form.
  - With the default layout, `image_dir` is `backend/storage/images`, so `/images/..%2F..%2F.env` would serve `backend/.env` [Inf; I did not request the real file].
  - `start.sh:187` binds uvicorn to `0.0.0.0`.
  - The v2 route `resolve_v2_media_path` is already traversal-safe (`manga_v2_reader.py:78-89`).
- **S3:** the internal tool router has a hard-coded default token when `DOMAIN_TOOL_BROKER_TOKEN` is not set (`main.py:91-93`), which is the case under docker-compose [Code].

---

## 13. Reusable versus removable

**Reusable:**
- Domain contracts in `domain/manga/*`: `SourceRange`, `SourceSlice`, `SourceFact`, `ContinuityLedger`, the `StoryboardPage`/`StoryboardPanel`/`ScriptLine` budgets, `PageComposition`, `RenderedPage`, and especially **`VectorScene`** (typed SVG primitives) with `default_vector_scene_for_panel`, the deterministic ink source for the art system.
- The DSL validators `validate_storyboard_against_dsl` and `validate_composition_against_rtl` (`manga_pipeline/manga_dsl.py`), as checks only. The "repair" should not be kept.
- The composition geometry sanitizers (`page_composition_stage.py:483-696`).
- `run_structured_llm_stage`, a validate-then-repair loop that should be re-hosted behind the harness.
- The book-understanding schemas and `ArcOutline`, once their validators are strengthened.
- `arc_slice_planning_service`, after fixing the overlap rule.
- JobStatus progress plumbing.
- The v2 persistence primitives (`ArtifactDoc`, `GenerationRunDoc`, `StageRunDoc` with idempotency keys), which suit resumable, receipted runs.
- `resolve_v2_media_path`.
- The 822 offline tests (≈15 s).

**Removable** (given the no-image-models rule, or because the code is dead):
- `image_generator.py`
- The image branches in `services/manga/asset_image_service.py` and `character_library_service`
- `panel_rendering_stage`, `panel_quality_gate_stage`, `storyboard_panel_renderer.py` and `panel_rendering_service.py`
- `sprite_quality_*`
- The OpenRouter call in `manga_page_art_stage`
- `media.py` `/image-models` and `/openrouter/models`, and `jobs.py` `/credits`
- `agents/credit_tracker.py` (no importers)
- `LLMClient.chat_with_retry` (no callers) and `_supports_cache_control` (always False)
- The dead settings listed in §4
- `app/reel_engine/` (pyc only)
- The unused `PdfPipelineOptions` in the parser
- `scripts/*` bakeoffs (evidence only)

---

## 14. Open questions

1. Does the owner's machine have a Docling model cache (for example via `HF_HOME`), or network access during parsing? This decides whether Docling or PyMuPDF heuristics produce the chapters. [Run] offline shows PyMuPDF, which splits "The Selfish Giant" into 4 chapters.
2. Should the new pipeline keep `manga_pages.rendered_page` and `/pages` as the reader contract, or move to `artifacts` and `/v2/pages`?
3. Does MiniMax bill timed-out or 5xx requests that the SDK retries? This decides the retry policy.
4. What is the target manga length per book? Today it is 4–12 slices × 3–6 pages.
5. Is a visibly degraded page (flagged in the UI) acceptable, or must a slice fail hard?
