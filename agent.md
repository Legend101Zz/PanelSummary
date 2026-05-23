# Agent Handoff

Start with `CLAUDE.md`, then read:

- `docs/renderer-analysis/findings.md`
- `docs/renderer-analysis/experiments/README.md`
- `docs/next-prompt.md`
- `NEXT_SESSION.md`

Current diagnosis:

- Content, script, storyboard text, and generated character images are good.
- The original reader did not feel like manga because the renderer contract was
  too small and the frontend presentation was card-like.
- The 2026-05-23 implementation pass expanded the backend/frontend contract and
  moved generated character assets into scene sprite layers in the main reader.
- Explicit sprite anchors, z-index, bubble placement, bleed, row-height, gutter,
  and panel-placement fields are now part of `PageComposition` and frontend
  rendering, but old stored pages still rely on heuristic sprite/bubble fallback.
- Use `docs/next-prompt.md` as the paste-ready prompt for the implementation agent.
- Use `NEXT_SESSION.md` as the living progress log; update it throughout the work with files changed, verification, screenshots, risks, and next steps.

Safe next implementation path:

1. DONE: Expand the render contract.
2. DONE: Teach the frontend to render the expanded contract.
3. DONE: Move character assets from dialogue-avatar chrome into panel sprite layers.
4. NEXT: Add/repair a dedicated layout DSL agent now that the renderer can honor
   its output.
5. NEXT: Validate against the saved sample project and screenshots; capture fresh
   after screenshots when a live reader/browser capture is available.
