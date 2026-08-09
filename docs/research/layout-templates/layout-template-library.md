# Layout template library — spike spec (2026-08-07)

Research spike for issues [#5](https://github.com/Legend101Zz/PanelSummary/issues/5) and
[#12](https://github.com/Legend101Zz/PanelSummary/issues/12). Companion script:
`spike_layout_templates.py` (compiles templates → polygons → RTL read ranks → SVG/PNG
golden previews in `golden/`).

## Thesis

LLMs should **select and adapt** page layouts, not invent geometry. A curated library of
parameterized layout trees (the comfyui_panels cut-grammar idea mapped onto ADR-009's
`LayoutNode`) gives us professional page rhythm by construction, deterministic compilation,
and a small decision surface the Page Writer agent can reason about (template id + slot
assignment + parameter nudges). `freeform_panel` stays a guarded exception.

## Template schema

```jsonc
{
  "template_id": "t_page_turn_reveal",
  "use_when": {                       // selection metadata the agent reasons over
    "purpose": ["reveal", "payoff"],  // beat narrative_purpose values it serves
    "panels": 4,                      // slots provided
    "tempo": "impact"                 // hold | normal | quick | impact
  },
  "tree": { /* ADR-009 LayoutNode tree with parameterized cuts:
               pos (fraction), angle (deg, jitter range allowed) */ },
  "jitter": { "angle_deg": 2.0, "pos": 0.03 }   // seeded variation bounds
}
```

Compiler contract (production = ScrollStack's ADR-009 compiler, extended):
- template + parameters + seed → polygons, bboxes, clip paths, **masks** (new, for #12
  conditioning), read ranks, gutter geometry (vertical gutters narrow, horizontal wider —
  time semantics from the craft research).

## Initial catalog (18; ★ = golden preview rendered in this spike)

| id | purpose | panels | tempo | shape |
|---|---|---|---|---|
| ★ t_ref_rows_2_3_2 | setup/conflict/reaction | 7 | normal | 2/3/2 angled rows (One Piece ch.1187 class), breakout slot on p2 |
| ★ t_page_turn_reveal | reveal/payoff | 4 | impact | 3-panel strip over 60% reveal panel (kishōtenketsu *ten* = largest) |
| ★ t_action_diagonals | conflict | 4 | quick | ±8–12° diagonal cuts |
| ★ t_splash_inset | reveal/hook | 3 | hold | full splash + 2 insets (one broken border) |
| ★ t_quiet_grid_4 | explanation/setup | 4 | hold | calm 2×2, no angles, wide row gutters |
| t_rows_3_flat | setup | 3 | hold | 3 flat rows (establishing → medium → detail) |
| t_rows_2_2_wide | dialogue | 4 | normal | two wide rows × 2 panels |
| t_tall_lead_left | hook | 3 | normal | full-height left panel + 2 stacked right |
| t_tall_lead_right | hook | 3 | normal | mirror of above (RTL lead) |
| t_stairs_down | escalation | 4 | quick | descending stepped panels |
| t_conversation_5 | dialogue | 5 | normal | 2/1-wide/2 rows, center reaction band |
| t_montage_6 | explanation | 6 | normal | 3×2 grid, slight alternating angles |
| t_beat_pause_2 | payoff | 2 | hold | two wide stacked panels (aftermath page) |
| t_cliffhanger_bottom | cliffhanger | 5 | impact | 4 small over one wide bottom hook panel |
| t_inset_reaction | reaction | 4 | normal | 3-panel page + corner reaction inset |
| t_vertical_thirds | action | 3 | quick | 3 tall angled columns |
| t_spread_splash | reveal | 1 | impact | single splash (spread_left/right page kinds) |
| t_dense_7_grid | explanation | 7 | normal | 2/3/2 flat (dense dialogue page) |

Coverage rule: every `narrative_purpose` × tempo combination the Page Writer can emit maps
to ≥2 templates, so selection is a choice, not a forced fit.

## Selection & adaptation protocol (Page Writer / Thumbnailer)

1. Page script fixes panel count, purposes, tempo, and page-turn intent.
2. Agent picks a `template_id` whose `use_when` matches (validator enforces panel-count
   match; mismatch = pick again, not stretch).
3. Agent may nudge parameters inside `jitter` bounds and assign panels → slots.
4. Compiler applies seeded jitter (seed = page idempotency key → reproducible builds).
5. Craft validators from #5 run on the compiled result (largest-panel = *ten* check,
   last-panel hook check, RTL chain check).

## Spike results

- 5 templates compile cleanly; RTL Z-path read ranks verified (rightmost-first per row —
  see `golden/index.json` orders and previews).
- `t_ref_rows_2_3_2` reproduces the reference page's structure class (3 angled rows,
  2/3/2, breakout marker) — the acceptance addition recorded in #5.
- Angled sequential cuts via half-plane clipping are trivially deterministic; the
  production ADR-009 compiler already owns superior geometry (true gutter offsets,
  clip paths) — the *new* work is the template data model, masks export, and jitter.

## Next (implementation, tracked in #5)

- Port template schema into contracts (`layout-template.v1`), template store seeded with
  this catalog, agent tool `list_layout_templates(filter)` + `submit_page_plan(template_id,
  slot_map, nudges)`, compiler mask export for #12.
