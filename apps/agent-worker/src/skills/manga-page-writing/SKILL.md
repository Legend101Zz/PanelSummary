---
name: manga-page-writing
description: Write source-grounded page scripts before layout or image generation.
version: 1.5.3
---

# Manga page writing

Turn the accepted MangaPlan into a bounded `page-script-set.v1` whose page
entry/exit states, panel beats, camera/blocking, text intent, page-turn payoff,
and source lineage are explicit.

## Workflow

1. Read only the bounded book context and accepted manga canon needed for the pages.
2. Write deliberate page boundaries and a varied panel rhythm.
3. Write a REAL story beat for every panel and REAL text elements for every
   page (see "Content quality is gated" below).
4. Keep dialogue, narration, and SFX short enough for planned regions.
5. Attach source references and fact IDs to every factual panel beat.
6. Submit the complete set through `submit_page_script_set`.

## Content quality is gated

A deterministic content-quality gate rejects the submission when these
rules are violated. Submissions that fail return the exact rule and path;
repair and resubmit.

- **Story beats are sentences, not labels.** Each `story_beat` must be a
  concrete, source-grounded visual sentence — WHO does WHAT, WHERE — of at
  least four words. `"hook"`, `"conflict"`, `"reveal"` are structural
  labels and are REJECTED. Good: `"Haw hesitates at the dark maze
  junction, clutching his last cheese crumb."` The beat is the image
  model's brief: everything the panel must show has to be in it.
- **Every page carries authored text elements.** At least one per page,
  drawn from the source: dialogue (`speaker_ref` REQUIRED, use characters
  from the accepted continuity/canon where they exist), thought,
  narration captions, or SFX. Narration needs NO speaker, so an empty
  character context is never a reason to submit a wordless page.
- **Text is the adaptation, not decoration.** Dialogue and captions must
  advance the book's actual ideas (use accepted facts and `must_preserve`
  claims); do not caption what the image already shows.
- Give most panels a text element; a silent panel is a deliberate craft
  choice for at most a minority of a page's beats.

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
  typography:{font_token,
              weight: INTEGER 100..900 (400=normal, 700=bold — NEVER a
              keyword string),
              min_px: INTEGER >= 8, max_px: INTEGER <= 256,
              emphasis:normal|bold|whisper|shout},
  overflow:fit|reflow|split|reject, z_index
}
```

Field-type traps (submissions are rejected on any of these):

- `panel.purpose` takes ONLY the seven PageScriptPanel values listed in
  the shape above. The MangaPlan beat's `narrative_purpose` uses a
  DIFFERENT vocabulary — `"conflict"`, `"explanation"`, `"hook"` are plan
  words and are REJECTED as panel purposes. Translate: explanation
  beats usually become `setup`/`reaction` panels, conflict beats
  `action`/`reveal`.
- Optional reference fields (`speaker_ref`, `environment_ref`,
  `emotion`, `tail_target`, `page_turn_panel_id`) are OMITTED or `null`
  when unused — NEVER an empty string. Narration and SFX carry no
  `speaker_ref` at all.
- `typography.weight` is a NUMBER (400 or 700), never `"normal"`/`"bold"`;
  `min_px`/`max_px` are integers with `min_px >= 8`.
- Every `source_ref` must be the COMPLETE object copied BYTE-FOR-BYTE
  from the accepted MangaPlan — every field exactly as the plan carries
  it, including `quote`, `start_offset`, and `end_offset` EVEN WHEN THEY
  ARE NULL. A null quote stays null: never fill in, invent, or beautify
  a quote the plan does not carry, and never retype one it does. The
  submission gate hash-compares each ref against the plan's refs, so ANY
  difference (an added quote, a changed offset) rejects the panel as
  citing source outside the plan.
- ALL `*_ref`/`*_refs` and `*_id` fields (`environment_ref`, `prop_refs`,
  `subject_ref`, `speaker_ref`, `panel_id`, …) are IDENTIFIER TOKENS
  matching `^[A-Za-z0-9][A-Za-z0-9._:-]*$` — no spaces, no prose. Write
  `env_maze_corridor`, `prop_chalk_stub` — never `"dark maze corridor
  junction"`. Prose about the setting belongs in `story_beat`; when no
  accepted environment/prop exists, OMIT `environment_ref` and use empty
  `prop_refs`.
- Every region box (`preferred_region`, every `focal_regions` and
  `avoid_text_regions` entry) must satisfy `x + width <= 1` AND
  `y + height <= 1` — boxes live INSIDE the unit page. Check the
  arithmetic before submitting (x=0.5 with width=0.6 is invalid).
- When a submission is rejected, repair ONLY the fields named in the
  error and resubmit; do not regenerate untouched parts of the set (a
  full rewrite is how correct source_refs get corrupted). If several
  errors share one class, fix EVERY field of that class across all
  pages, not just the listed ones. A resubmission must ACTUALLY CHANGE
  the named fields — never resubmit an unchanged payload.

All normalized coordinates and sizes are in `0..1`, and boxes must remain
inside the page. Dialogue requires `speaker_ref`. Narration and SFX cannot have
a tail. Copy each `source_ref` exactly from the accepted MangaPlan; do not alter
its book, source-unit, page, or hash fields. Use only accepted fact IDs.

## Transport-artifact rejections: switch to the text lane

The provider's tool-call frame can MANGLE a structurally correct
submission in transit: arrays arrive wrapped in `{"item": ...}`, empty
lists and nulls become `""`, whole fields vanish — and a LARGE
submission (a full two-page script is one) can be TRUNCATED mid-frame,
so the server sees entire pages or panels missing that you wrote. The
signature is a rejection reporting `missing` / `list_type` /
`dict_type` / `int_parsing` / `string_too_short` errors for fields you
KNOW you emitted correctly. That is a transport artifact, not a content
problem — repairing content cannot fix it and resubmitting through the
same frame usually fails the same way.

After ONE rejected `submit_page_script_set` call whose errors name
fields, panels, or pages you already wrote correctly, STOP calling
tools entirely. Do NOT call `report_page_script_blocker` — a transport
artifact is not an evidence blocker — and do NOT burn a second tool
submission on a frame that truncates. Instead emit the complete,
corrected PageScriptSet as your FINAL assistant message: ONE bare JSON
object, starting with `{` and ending with `}`, the entire message — no
prose, no markdown fences, no tool call. The runtime sends that object
through the same authenticated submit tool and the same validation
gates; acceptance then completes outside your turn.

Reserve `report_page_script_blocker` for genuine evidence gaps (the
accepted plan or context cannot support a page beat) — never for
validation or transport failures.

## Bounded goal shape

The typed AgentGoal is the shape authority. Read
`constraints.target_page_count` and `constraints.target_panel_count` and:

- create exactly `target_page_count` pages with contiguous indices from `0`;
- create exactly `target_panel_count` panels total, never more than
  `constraints.max_panels_per_page` on any page;
- map each accepted MangaPlan beat to exactly one panel, in source order —
  the accepted plan's beat count equals `target_panel_count`;
- use `standard` page kinds unless the goal says otherwise;
- set each page's `page_turn_panel_id` to its final panel and give the final
  panel overall the payoff;
- when the accepted context has no characters, facts, or assets, use empty
  `blocking`, `prop_refs`, `focal_regions`, `avoid_text_regions`, and
  `source_fact_ids` arrays — but NEVER an empty `text_elements` array:
  author narration captions from the source in that case;
- write one to three text elements per page, grounded in the source; give
  dialogue a `speaker_ref` from accepted continuity and place each
  element's `preferred_region` inside its panel, away from focal regions;
- use `{ "effects": [] }` for motion when no motion is required;
- copy the one complete source reference for each beat exactly from the
  accepted MangaPlan;
- fetch the accepted MangaPlan at most once. The ContextPack is already present
  in the prompt, so do not repeatedly fetch book context.

Do not add panels merely to make the script look complete. The thumbnail
stage, not this stage, owns layout geometry. Text elements are NOT padding:
they are the page's authored voice and are required (see "Content quality
is gated").

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
- Broker acceptance is the only valid completion signal — except on the
  transport-fallback text lane above, where the runtime performs the
  final authenticated submission from your emitted JSON object.
