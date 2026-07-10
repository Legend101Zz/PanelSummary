# Findings: PanelSummary Analysis

(Recorded as discovered. External/web content goes here, never in task_plan.md.)

## Project layout (top level)
- backend/, frontend/, reel-renderer/, storage/, docs/, docker-compose.yml, start.sh/stop.sh
- docs/: ARCHITECTURE.md, BACKEND_FLOW.md, FRONTEND_FLOW.md, MANGA_BUILD_FLOW_AND_IMAGE_COST_PLAN.md, REEL_RENDERER.md, renderer-analysis/, renderer-experiments/
- NOTE: a MANGA_BUILD_FLOW_AND_IMAGE_COST_PLAN.md already exists — prior thinking on image cost. Must read.

## Docs / architecture summary (read 2026-07-05)
- Stack: Next.js frontend, FastAPI backend, Celery+Redis workers, MongoDB/Beanie, local storage/ for pdfs+images.
- Pipeline: book understanding (synopsis, fact registry, bible, art direction, voice cards, arc outline)
  then per-slice: facts→plan→bible→beat sheet→script→review/repair→storyboard→dsl_validation→
  continuity/quality gates→page_composition→rtl_validation→character_asset_plan→rendered_page_assembly→
  (optional) panel_rendering + panel_quality_gate.
- Contract boundary: `RenderedPage` (backend/app/domain/manga/render_view.py ↔ frontend/lib/types.ts).
- Image modes already implemented (2026-05-18): none | sprites_only | budgeted (default, 8 sprites +
  3 key panels/slice) | full_panel_art. Budget philosophy already matches user's "limited images" ask.
- Renderer diagnosis (2026-05-23, docs/renderer-analysis/findings.md): content pipeline good; blocker =
  renderer contract too small + card-style presentation. Sprites shown as 40px chat avatars, rich layout
  fields (row_heights_pct, sprite_layers, bubble_placement, bleed, z_index) were ignored byte-for-byte.
  A 2026-05-23+ pass expanded contract/frontend to honor explicit boxes/sprites/bubbles WHEN PRESENT;
  old DB rows lack the fields → heuristic fallback. A "layout compositor agent" that authors those fields
  is recommended but NOT yet built (per CLAUDE.md).
- Known upstream defect: composition LLM authors narrow page-turn cells (DSL_RTL_PAGE_TURN_NARROW x10 in
  sample slice).
- Sample data: book 6a0b5a11201a8d03f1d82501 / project 6a0b5a5b201a8d03f1d82503, 11 pages, 1 slice,
  8 character assets, image_mode=sprites_only, 0 panel artifact images. Exported at
  docs/renderer-analysis/sample-dsl.json (294KB).
- Doc drift: CLAUDE.md/AGENTS.md (identical files) reference docs/next-prompt.md and NEXT_SESSION.md —
  NEITHER EXISTS. Also ARCHITECTURE.md references docs/next-prompt.md. Must fix in deliverables.
- Newest screenshots: docs/renderer-analysis/experiments/2026-06-07-reader-polish-after-final-1280.png
  (a "reader polish" pass happened 2026-06-07, after the findings doc).

## Visual evidence (screenshots viewed 2026-07-05)
Baseline (00-baseline-live-reader-viewport.png): dark UI cards on paper, centered text, chat bubbles,
tiny speaker labels; zero manga feel.
After 2026-06-07 polish (2026-06-07-reader-polish-after-final-1280.png): paper-toned panels, black
borders, hand-ish bubble shapes — improved, but still fundamentally a TEXT reader:
1. **Speaker-id leak**: bubble text literally shows "nathan: We're all trying to cope..." — speaker id
   prefix inside displayed dialogue (formatting bug).
2. **Dev chrome leaks**: "S01" badges on every panel; "AN"/"NA" monogram placeholders; "MICHAEL" label
   floating at panel top.
3. **Placeholder art = arch/tombstone shapes**: panels without sprites render an empty arch silhouette;
   reads as gravestones, not characters.
4. **Sprite integration poor**: the one panel using a real sprite pastes it small, centered, with visible
   white background box (not bg-free composited, not scaled/cropped cinematically).
5. **Text-dominant**: narration boxes carry full prose sentences; every panel is essentially a text box.
   No screentones, no SFX lettering, no speedline drama, no shot variety, no bleeds; uniform borders and
   panel sizes; big empty space inside panels.
6. Reading direction/flow unclear; no page-turn drama despite DSL having page_turn_panel_id.
Conclusion matches user's complaint: DSL formatting issues + too much text + images not leveraged.

## Code-level root causes (frontend renderer, read 2026-07-05)
- **"nathan: text" leak**: DialoguePanel.tsx:241 CaptionBox joins `${line.speaker_id}: ${line.text}` when a
  dialogue line is demoted to caption. Demotion trigger: shouldUseCaption() (line > maxBubbleChars, or >2
  lines). panel_presentation.ts:104 `denseDialogue` (longest>58 || total>96 || lines>2) turns the WHOLE
  panel into "text-card" variant → the text-box-only panels in screenshots.
- **Hard truncation**: clampVisibleText(line.text, 54) in BubbleLettering → on-screen dialogue is cut at
  ~54 chars with "..." — CONTENT LOSS, and captions clamp at 116-220 chars.
- **Scene-id badge**: DialoguePanel.tsx:300-314 renders `panel.scene_id` ("S01") as a chip on every
  non-text-card panel. Dev chrome shown to readers.
- **Reference sheets never render**: SceneSprites.tsx:145-147 returns null for asset_type==="reference_sheet".
  Sample project's 8 assets = 5 reference_sheet + 3 expression. Characters with only a reference sheet
  (michael, haw) can NEVER appear as sprites. Asset planner generates what renderer refuses to use.
- **Synthetic sprite layout is formulaic**: synthesizeSpriteLayers() spaces characters evenly, flips
  alternates; bubble placement cycles 3 hardcoded slots; no relation to composition text.
- **Bubble/caption styling**: boxy white rectangles w/ drop shadows; captions italic center boxes — reads
  as UI, not manga lettering. Fonts: generic var(--font-body, sans-serif).
- Sprites render with `drop-shadow` filter but sprite PNGs have WHITE backgrounds (not transparent), so
  they show as pasted white boxes (screenshot bottom panel). Prompting asks for "clean white background";
  no post-processing/matting step exists.

## Manga craft research (web, 2026-07-05)
- goteenwriters "Manga Toolbelt" article = mostly narrative craft: kishotenketsu (ki/sho/ten/ketsu),
  deep POV, tension via serialization "snapshot mindset", simplicity/single-sentence pitch. The
  pipeline ALREADY uses kishotenketsu arc roles (KI/SHO/TEN/KETSU/RECAP in manga_dsl.py) — good.
- Industry text budgets (Dark Horse script guide, letterer rules of thumb): comics ~25 words/balloon,
  ~50 words/panel max; MANGA leaner: ≤25 words/panel, ideally ≤12, ~60 words/PAGE total.
  Sources: images.darkhorse.com scriptguide.pdf; buzzdixon.com rough-rules; techmomma tumblr.
- One Piece ch.1187 reference pages (viewed op_1187_sun_002/006.png):
  * Page = 4-8 panels; TOTAL dialogue on an action page can be 4 words; dialogue page ~30 words.
  * Every bubble ≤ ~8 words, many 2-3 words ("WHOA!!", "NO WAY?!").
  * SFX are giant hand-lettered art elements INTEGRATED into the scene (ドォン!!), often crossing panels.
  * Establishing wide shot w/ tiny figures; extreme close-up stacks for tension; one huge action panel
    can take 2/3 page with speedlines/impact flash.
  * Bubbles overlap panel borders; jagged burst bubbles for shouts; art carries ~95% of meaning.
- Implication for PanelSummary: the DSL dialogue budget (160 chars/panel ≈ 30 words) is ~2-3x too high
  for manga feel, and narration is doing the work art should do (453 narration words vs 211 dialogue
  words in the sample slice = backwards; manga is dialogue+art dominant, captions sparse).

## Storyboard stage prompt (backend, read 2026-07-05)
- storyboard_stage.py prompt is actually decent: RTL flow, shot variety, establishing beat, "avoid
  wall-of-text panels", character_ids = visually present. So text-density failure is partly the script
  stage upstream + renderer demotion, not storyboard prompt ignorance.
- No page-level or panel-level word budgets are enforced numerically anywhere in prompts (need to verify
  manga_script_stage + manga_dsl validators).
- VERIFIED: manga_dsl.py DOES have budgets: kishotenketsu arc roles (KI/SHO/TEN/KETSU/RECAP) w/ panel,
  page, dialogue budgets. DialogueBudget = max 3 lines/panel, 160 chars/panel (~30 words — 2-3x real
  manga), 10 lines/page. Errors on overflow. No narration budget at all. No page word total budget.
- manga_script_stage prompt: qualitative "keep dialogue short" only; numeric budget comes via
  render_dsl_prompt_fragment.
- page_composition_stage: single LLM call per slice, authors gutter_grid + row_heights_pct + gutter_px +
  panel_placements + sprite_layers + bubble_placements + z-order. BUT: its input payload has NO asset
  manifest — it references character_id/expression blind; renderer omits missing sprites silently.
  max_tokens only 4000 for 5-8 pages of detailed geometry → likely truncation → empty fallback.
- character_asset_plan_stage: thin shim over book-level planner; budget default 8 sprites, 1 expression
  per char, no turnaround by default (image-cost plan implemented as documented).
- rendered_page_assembly_stage: pure zip of storyboard+composition; composition carries the layout fields
  into RenderedPage. Frontend mirrors exist (re-exported in frontend/lib/types.ts:298-306).
- vision_client.py EXISTS (VisionLLMClient wrapping LLMClient for image input) — scaffolding for a
  screenshot-critique loop is already half-built. Sprite quality gate + silhouette scores also exist.
- llm_client.py providers: "openai" | "openrouter" only. MINIMAX_API_KEY present in backend/.env but
  UNUSED anywhere in backend code. MiniMax is OpenAI-compatible (base_url https://api.minimax.io/v1,
  models MiniMax-M2.x/M3 incl. highspeed variants) → trivial provider add.
- image_generator.py: OpenRouter chat/completions modality-based image gen; models = gemini-2.5-flash-image
  (default), gemini-3.1-flash-image-preview, gemini-3-pro-image-preview; generate_image_with_references()
  = Gemini-only multimodal conditioning on character sheets. No transparency handling anywhere.

## Live reader judgment (screenshot 2026-07-05, page 1/11 of sample project)
Current state is WORSE than June-7 screenshots: five empty beige panels w/ faint diagonal lines; ALL
dialogue rendered as white caption strips "angela: ...", "nathan: ...", "michael: ..." (no bubbles at
all — every line >34 chars → caption demotion); S01 badges on 2 panels; zero sprites (page-1 characters
have only reference_sheet assets which SceneSprites refuses); giant empty space; no SFX, no tones, no
shot-type visual difference. Verdict: reads as a slide deck, not manga. Screenshot saved at scratchpad
live-reader-p1.png (copy into docs/analysis/ evidence).

## Tooling research (web, 2026-07-05)
- OpenRouter Unified Image API (2026): normalizes `background` transparency (PNG/WebP) across providers;
  `input_references` for reference images. openai/gpt-image-1: native transparent bg + accurate text
  rendering + up to 16 reference images. Gemini 3.1 flash image / nano-banana-pro: identity preservation
  up to 5 subjects, multi-image blending, 2K/4K. → transparent sprite bank is directly achievable.
- rembg (MIT, Python) — local background removal fallback/cleanup for existing white-bg sprites.
- comical-js (MIT, BloomBooks) — SVG comic balloon/caption/callout rendering over HTML: reference for
  organic bubble shapes + tails.
- rough.js (MIT) — sketchy hand-drawn SVG primitives for synthetic panel art.
- satori (Vercel) — HTML/CSS→SVG/PNG server-side; option for headless page export + vision QA without
  browser. Playwright — screenshot loop automation (Chrome headless worked fine today).
- Fonts (free/commercial-ok): Komika family (50 comic fonts, free), Comic Neue (OFL), Google Fonts
  Bangers/Shojumaru/Mochiy Pop One for SFX/display; Blambot $0 tier is nonprofit-print/web-graphics only —
  check per-font license before shipping.
- MiniMax platform: LLMs M2/M2.1/M2.5/M2.7/M3 (+highspeed), OpenAI- AND Anthropic-SDK compatible,
  api.minimax.io/v1; also image-01, TTS, Hailuo video (not needed now).

## What is already GOOD (don't break)
- Staged pipeline w/ typed contracts, retries, fallbacks; kishotenketsu arc roles; fact grounding +
  continuity ledger; image budget modes (none/sprites_only/budgeted/full_panel_art) w/ idempotent asset
  library; expanded PageComposition contract + composition prompt that authors layout/sprites/bubbles;
  RTL + page-turn validation; quality gates incl. sprite silhouette scores; vision client scaffolding;
  reader honors explicit boxes when present w/ legacy fallback.
