# Agent Handoff

Start with `CLAUDE.md`, then read:

- `docs/renderer-analysis/findings.md`
- `docs/renderer-analysis/experiments/README.md`
- `docs/next-prompt.md`
- `NEXT_SESSION.md`

Current diagnosis:

- Content, script, storyboard text, and generated character images are good.
- The reader does not feel like manga because the renderer contract is too
  small and the frontend presentation is still card-like.
- Generated character assets are available, but the reader places them as
  small dialogue avatars rather than scene sprites.
- Hand-added sprite anchors, z-index, bubble placement, bleed, and row-height
  fields are ignored by the current frontend.
- Use `docs/next-prompt.md` as the paste-ready prompt for the implementation agent.
- Use `NEXT_SESSION.md` as the living progress log; update it throughout the work with files changed, verification, screenshots, risks, and next steps.

Safe next implementation path:

1. Expand the render contract.
2. Teach the frontend to render the expanded contract.
3. Move character assets from dialogue-avatar chrome into panel sprite layers.
4. Add/repair a dedicated layout DSL agent after the renderer can honor its
   output.
5. Validate against the saved sample project and screenshots.
