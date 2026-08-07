---
name: manga-page-writing
description: Write source-grounded page scripts before layout or image generation.
version: 1.2.0
---

# Manga page writing

Turn the accepted MangaPlan into a bounded `page-script-set.v1` whose page
entry/exit states, panel beats, camera/blocking, text intent, page-turn payoff,
and source lineage are explicit.

## Workflow

1. Read only the bounded book context and accepted manga canon needed for the pages.
2. Write deliberate page boundaries and a varied panel rhythm.
3. Keep dialogue, narration, and SFX short enough for planned regions.
4. Attach source references and fact IDs to every factual panel beat.
5. Submit the complete set through `submit_page_script_set`.

## Exact submission shape

All objects reject unknown keys. Submit:

```text
PageScriptSet {
  schema_version: "page-script-set.v1",
  script_set_id, project_id, plan_artifact_id, context_pack_id,
  pages: PageScript[]
}
PageScript {
  page_id, page_index (contiguous from 0),
  page_kind: standard|splash|spread_left|spread_right,
  entry_state, exit_state, page_turn_panel_id?,
  panels: PageScriptPanel[], text_elements: TextElement[]
}
PageScriptPanel {
  panel_id,
  purpose: setup|action|reaction|reveal|transition|insert|payoff,
  story_beat,
  importance: low|medium|high|page_turn,
  tempo: hold|normal|quick|impact,
  camera: { shot: extreme_wide|wide|medium|close_up|extreme_close_up|insert|pov,
            angle: eye|high|low|dutch|over_shoulder,
            movement: static|pan|push_in|pull_out|tracking },
  blocking: [{ subject_ref, pose, expression, anchor:{x,y}, scale,
               facing:left|right|front|away,
               depth:foreground|midground|background }],
  environment_ref?, prop_refs, focal_regions, avoid_text_regions,
  motion: { direction?, speed?, effects:[] },
  source_refs, source_fact_ids
}
TextElement {
  text_id, panel_id,
  kind: dialogue|thought|narration|monologue|sfx,
  content, speaker_ref?, emotion?, writing_direction: horizontal|vertical,
  shape: oval|round_rect|thought_cloud|jagged|caption|free_sfx,
  preferred_region:{x,y,width,height}, tail_target?:{subject_ref?,point:{x,y}},
  typography:{font_token,weight,min_px,max_px,emphasis:normal|bold|whisper|shout},
  overflow:fit|reflow|split|reject, z_index
}
```

All normalized coordinates and sizes are in `0..1`, and boxes must remain
inside the page. Dialogue requires `speaker_ref`. Narration and SFX cannot have
a tail. Copy each `source_ref` exactly from the accepted MangaPlan; do not alter
its book, source-unit, page, or hash fields. Use only accepted fact IDs.

## Bounded two-page shape

For the Phase 1 two-page goal backed by a three-beat MangaPlan:

- create exactly two pages with indices `0` and `1`;
- create exactly three panels total: two on page 0 and one on page 1;
- map each accepted beat exactly once, in source order;
- use `standard` for both page kinds;
- make the second panel on page 0 the page-turn panel and give the single page
  1 panel the payoff;
- when the accepted context has no characters, facts, or assets, use empty
  `blocking`, `prop_refs`, `focal_regions`, `avoid_text_regions`,
  `source_fact_ids`, and `text_elements` arrays;
- use `{ "effects": [] }` for motion when no motion is required;
- copy the one complete source reference for each beat exactly from the
  accepted MangaPlan;
- fetch the accepted MangaPlan at most once. The ContextPack is already present
  in the prompt, so do not repeatedly fetch book context.

Do not add panels or lettering merely to make the script look complete. The
thumbnail stage, not this stage, owns layout geometry.

## Full-book hackathon edition

When the typed goal asks for `target_page_count: 10` and the accepted MangaPlan
contains twenty beats:

- create exactly ten pages with indices `0` through `9`;
- create exactly two panels on every page and map all twenty beats once each in
  source order;
- keep every panel's complete accepted source references;
- use `char_kai` as the recurring dramatized narrator when the accepted plan
  includes that character intent;
- keep Kai visually actionable in blocking: short wavy black hair, one white
  forelock above the right eyebrow, round wire glasses, dark zip jacket, light
  crew-neck shirt;
- add one or two short text elements per page. Prefer concise narration or
  dialogue that advances the idea rather than restating the image;
- reserve real regions for deterministic lettering and keep focal subjects out
  of those regions;
- make the second panel of each page the page-turn panel;
- vary camera scale and tempo across adjacent panels without inventing source
  facts;
- do not create layout trees or request image generation.

The full-book edition is still bounded. Do not add an eleventh page, a twenty-
first panel, or a third panel to any page.

## Hard rules

- Do not request or generate images.
- Do not compose `RenderedPage` artifacts or renderer commands.
- Do not use arbitrary paths, URLs, shell, filesystem, or network tools.
- Do not invent source facts, characters, assets, or continuity.
- Report a blocker when the accepted evidence cannot support a page beat.
- Broker acceptance is the only valid completion signal.
