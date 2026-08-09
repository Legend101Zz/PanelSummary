---
name: manga-thumbnail
description: Propose hierarchical page layouts and image-free SVG name previews.
version: 1.6.0
---

# Manga thumbnail

Turn an accepted `page-script-set.v1` into `manga-page-plan.v1` candidates with
intentional panel hierarchy, reading edges, text reserves, focal regions, and
page-turn anchors.

## Workflow

1. Fetch the accepted page script and only relevant accepted asset metadata.
2. Propose a hierarchical `panel | split | overlay | freeform_panel` layout.
3. Call `validate_layout_draft` before submission and repair only addressable issues.
4. Check page rhythm, eye path, text reserve, and camera repetition across pages.
5. Submit the complete set through `submit_thumbnail_set`.

## Exact submission shape

All objects reject unknown keys. Fetch the accepted script first and submit:

```text
ThumbnailSet {
  schema_version: "thumbnail-set.v1",
  thumbnail_set_id, project_id, script_set_artifact_id,
  page_plans: MangaPagePlan[]
}
MangaPagePlan (as submitted) {
  schema_version: "manga-page-plan.v1",
  page_plan_id, project_id, script_set_artifact_id,
  page_index,          // TOP-LEVEL integer, 0-based, REQUIRED on submit
  canvas:{ width_px, height_px,
           trim:{x,y,width,height}, safe:{x,y,width,height}, bleed_pct },
  reading_direction: rtl|ltr,
  layout_root, reading_edges, source_fact_ids
}
reading edge { from_panel_id, to_panel_id, reason }
```

NEVER include a `page_script` key in a submitted plan: the broker hydrates
the accepted page object from `script_set_artifact_id` + the plan's
top-level `page_index` (0-based, matching the fetched script's page
order). Embedding the script risks transport truncation of the largest
payload and any drift fails the exact-match gate. Copy
`script_set_artifact_id` BYTE-FOR-BYTE from the goal refs or the
`get_page_script_set` response — never shorten an id, never append a
suffix, never reconstruct one from memory. Use a
1600x2400 canvas with trim `{x:0.03,y:0.02,width:0.94,height:0.96}`, safe
`{x:0.06,y:0.05,width:0.88,height:0.90}`, and `bleed_pct:0.02` unless the goal
explicitly says otherwise.

Every panel appears exactly once in the layout. Node IDs are unique per page.
Multi-panel pages have exactly `panel_count - 1` reading edges forming one
unambiguous chain whose last panel is `page_turn_panel_id`.

```text
panel node    {kind:"panel", node_id, panel_id}
split node    {kind:"split", node_id, axis:x|y, ratios:[positive...],
               gutter:{value,unit:"page_pct"}, angle_deg:-18..18,
               children:[layout nodes...]}
overlay node  {kind:"overlay", node_id, base:layout node,
               insets:[{node,anchor:top_left|top_right|bottom_left|bottom_right|center,
                        box:{x,y,width,height},z_index,border_style:standard|borderless|broken}]}
freeform node {kind:"freeform_panel", node_id, panel_id,
               polygon:[{x,y}...], exception_reason}
```

AXIS ORIENTATION (the compiler's geometry, not a preference): split
`children` are laid out in ARRAY ORDER along the axis — `children[0]` is
the LEFTMOST for `axis:"x"` and the TOPMOST for `axis:"y"`. RTL therefore
means: on every `axis:"x"` split the EARLIER-reading panel goes at the
LAST index (rightmost) and the LATER-reading panel at index 0 (leftmost).
Reading edges NEVER encode direction: they chain panels in SOURCE order
(`panel_0 -> panel_1 -> ...`) regardless of placement — RTL lives in the
PLACEMENT, not in reversed edges. Every layout node carries its `kind`
field, and a page plan has NO `page_id` field (that belongs to the page
script).
Validate every complete page plan through `validate_layout_draft`; repair all
errors before submitting the set. A `TEXT_REGION_OUT_OF_PANEL` error means
an authored text element's `preferred_region` center falls OUTSIDE its
panel's polygon under your split ratios — the page script is immutable, so
the LAYOUT must move: adjust split ratios or restructure until every text
region center sits inside its panel. Re-validate after EVERY layout change
and submit only plans whose LATEST validation response says `passed: true`
— a plan edited after its last validation is an unvalidated plan.

## Bounded goal layout

The typed AgentGoal and the accepted PageScriptSet are the shape authority:
create one `MangaPagePlan` per accepted page, each layout referencing that
page's panels exactly once.

- fetch the accepted PageScriptSet exactly once;
- do not copy or rewrite `page_script`. For `validate_layout_draft`, pass the
  accepted `script_set_artifact_id` and `page_index` beside a `page_plan` that
  omits `page_script`; the broker injects the accepted page object;
- a single-panel page uses its `panel` node directly as `layout_root` with an
  empty `reading_edges` array;
- a multi-panel page uses nested `split` trees: rows via `axis:"y"`, panels
  inside a row via `axis:"x"`, two to four panels per row, and the
  earlier-reading panel on the right of every horizontal split — with
  `children` in array order left-to-right, that means the earlier panel
  sits at the LAST index of the row's `children`;
- give each multi-panel page exactly `panel_count - 1` reading edges forming
  one chain in panel source order, ending on that page's `page_turn_panel_id`
  when one is set;
- reserve `overlay` insets for deliberate emphasis panels only and keep every
  inset box inside `0..1`;
- every plan uses `source_fact_ids:[]` and the documented 1600x2400 canvas;
- use short stable IDs such as `page_plan_0`, `split_page_0`, `node_panel_0`;
- do not use freeform nodes in bounded runs;
- submit each page plan WITHOUT `page_script` and WITH its top-level
  `page_index`; the broker hydrates and validates the canonical
  ThumbnailSet before storage;
- repair only the exact returned error if needed, then submit all layouts
  together.

Do not invent, copy, summarize, or add fields to page scripts. Do not call the
asset tool unless the goal lists accepted assets.

## Hard rules

- Do not request or generate images.
- Do not submit page composition, lettering, or `RenderedPage` artifacts.
- Do not use arbitrary paths, URLs, shell, filesystem, or network tools.
- Do not bypass geometry, reading-order, text-fit, or source-lineage errors.
- Use stable node, panel, and text IDs so repairs remain addressable.
- Broker acceptance is the only valid completion signal.
