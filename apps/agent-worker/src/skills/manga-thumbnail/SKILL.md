---
name: manga-thumbnail
description: Propose hierarchical page layouts and image-free SVG name previews.
version: 1.3.0
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
MangaPagePlan {
  schema_version: "manga-page-plan.v1",
  page_plan_id, project_id, script_set_artifact_id,
  canvas:{ width_px, height_px,
           trim:{x,y,width,height}, safe:{x,y,width,height}, bleed_pct },
  reading_direction: rtl|ltr,
  page_script, layout_root, reading_edges, source_fact_ids
}
reading edge { from_panel_id, to_panel_id, reason }
```

`page_script` must be copied exactly from the accepted PageScriptSet. Use a
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

For RTL horizontal splits, place the earlier-reading panel on the right.
Validate every complete page plan through `validate_layout_draft`; repair all
errors before submitting the set.

## Bounded two-page layout

For the accepted Phase 1 script containing two panels on page 0 and one panel
on page 1, use only this minimal layout family:

- fetch the accepted PageScriptSet exactly once;
- do not copy or rewrite `page_script`. For `validate_layout_draft`, pass the
  accepted `script_set_artifact_id` and `page_index` beside a `page_plan` that
  omits `page_script`; the broker injects the accepted page object;
- page 0 uses one `overlay` root. Its `base` is the earlier-reading plain panel;
  its single inset is the later page-turn plain panel;
- use inset `anchor:"bottom_right"`,
  `box:{x:0.12,y:0.55,width:0.76,height:0.40}`, `z_index:10`, and
  `border_style:"standard"`. This overlap is required because both accepted
  narration reserves occupy the lower-middle page region;
- page 0 has exactly one reading edge, from its earlier panel to its later
  page-turn panel;
- page 1 uses its single `panel` node directly as `layout_root` and has an empty
  `reading_edges` array;
- both plans use `source_fact_ids:[]` and the documented 1600x2400 canvas;
- use short stable IDs such as `page_plan_0`, `split_page_0`, `node_panel_0`,
  and `page_plan_1`;
- do not use split or freeform nodes in this bounded run;
- validate each page plan once and use the returned `normalized_page_plan`, or
  submit each page plan without `page_script` plus its temporary `page_index`;
  the broker hydrates and validates the canonical ThumbnailSet before storage;
- repair only the exact returned error if needed, then submit the two layouts
  together.

Do not invent, copy, summarize, or add fields to page scripts. Do not call the
asset tool because this image-free run has no accepted assets.

## Hard rules

- Do not request or generate images.
- Do not submit page composition, lettering, or `RenderedPage` artifacts.
- Do not use arbitrary paths, URLs, shell, filesystem, or network tools.
- Do not bypass geometry, reading-order, text-fit, or source-lineage errors.
- Use stable node, panel, and text IDs so repairs remain addressable.
- Broker acceptance is the only valid completion signal.
