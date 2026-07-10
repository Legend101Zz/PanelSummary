# Progress Log

## Session 2026-07-05 (analysis-only session)
- Confirmed /Volumes/Mrigesh SSD/Book-Reel accessible; backend live on :8000, frontend was down.
- Read ARCHITECTURE.md, MANGA_BUILD_FLOW_AND_IMAGE_COST_PLAN.md, renderer-analysis/findings.md,
  CLAUDE.md/AGENTS.md (identical), key pipeline stages + full MangaReader frontend.
- Pulled live pages from backend API; computed text stats (57 panels, 211 dialogue words,
  453 narration words); confirmed dialogue objects clean → speaker-prefix leak is renderer-side.
- Viewed evidence screenshots (baseline + 2026-06-07 polish), started Next dev server, captured
  fresh live screenshot → saved to docs/analysis/2026-07-05-live-reader-page1.png. Dev server
  stopped afterwards (restored original state).
- Web research: manga text budgets (Dark Horse/letterers), One Piece ch.1187 pages viewed,
  OpenRouter unified image API (transparency/reference images), MiniMax API compatibility,
  open-source tools (rembg, comical-js, rough.js, satori, fonts).
- Deliverables written:
  - docs/analysis/SHORTCOMINGS_AND_VISUAL_UPGRADE.md (diagnosis A1-A5/B1-B8/C1-C5 + phased plan)
  - docs/next-prompt.md (paste-ready next-session prompt, recreated)
  - CLAUDE.md + AGENTS.md updated in sync (diagnosis, gotchas, Providers section, doc-drift fixes)
- No product code changed (analysis-only per user request).

Next session: execute docs/next-prompt.md (Phase V text discipline + vector scene layer, then
sprite fixes). MiniMax provider wiring is part of that prompt.

## Session 2026-07-05 (evening) — judged Codex Tasks 1-4
- Verified independently: 4 commits on visual-upgrade-phase-v (e54c361..dfe55b9); page 1 reads
  manga-shaped (bubbles+tails, sprites, vector scenes, no chrome); 13 pages, all 51 panels have
  vector_scene; exactly 3 painted panels; 8/8 assets RGBA (API transparency failed, local matting
  worked); 0 speaker-prefix leaks. Codex's claims matched evidence everywhere I checked.
- Gaps confirmed for Task 5: composition stage fell back on ALL pages (sprite_layers/bubble_placements/
  panel_placements = 0 everywhere → placement is frontend heuristics → bubble-over-face collisions,
  odd reading order, floating hand crops); 5 dialogue lines >90 chars; p11=63 words, p0/p1 at 60/54
  with mid-clause bubble fragmentation + hyphenation; MiniMax unstable (truncated JSON, stalls).
- ENV GOTCHA: a foreign uvicorn (app:app, py3.14) squats :8000; PanelSummary backend runs on :8001;
  frontend must run with NEXT_PUBLIC_API_URL=http://localhost:8001. Left frontend running on :3000.
- Docs/CLAUDE/AGENTS changes from analysis session still uncommitted (plus deleted agent.md).
