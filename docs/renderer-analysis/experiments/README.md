# Renderer Experiment Captions

All screenshots were captured from:

`http://localhost:3000/books/6a0b5a11201a8d03f1d82501/manga/v2?project=6a0b5a5b201a8d03f1d82503`

The edited MongoDB page document was restored after the experiments. The restore
check screenshot is byte-identical to the baseline viewport screenshot.

## Screenshots

- `00-baseline-live-reader-viewport.png`
  - Original live reader viewport for page 1. Shows dark card-like panels,
    chat-style bubbles, and Michael rendered as a small circular dialogue avatar
    instead of a panel sprite.

- `00-baseline-live-reader.png`
  - Full-page baseline capture. Useful for seeing the reader chrome, side rail,
    character asset library, and the lower page-turn panel.

- `01-supported-grid-reflow.png`
  - Hand-edited supported fields only: `gutter_grid`, `panel_order`, and
    `panel_emphasis_overrides`. The screenshot changes visibly, proving the
    current renderer does honor the narrow supported composition contract.

- `02-ignored-rich-layout-fields.png`
  - Hand-edited unsupported fields: `row_heights_pct`, `gutter_px`,
    `bleed_edges`, `panel_placements`, and `page_style`. The screenshot is
    byte-identical to baseline, proving those richer layout fields are ignored.

- `03-ignored-sprite-bubble-fields.png`
  - Hand-edited unsupported panel fields: `sprite_layers`, `bbox_pct`, `z_index`,
    `bubble_placement`, `layer_order`, and `camera`. The screenshot is
    byte-identical to baseline, proving explicit sprite/bubble placement data is
    ignored by the current renderer.

- `04-artifact-backdrop-from-sprite.png`
  - Hand-edited `panel_artifacts.p01_05.image_path` to point at an existing
    generated Michael asset. The renderer shows it only as an object-cover
    panel backdrop, proving this is the one image channel it currently honors.

- `04-artifact-backdrop-from-sprite-full.png`
  - Full-page version of experiment 04 so the modified lower panel is visible.

- `99-restored-baseline-check.png`
  - Post-revert screenshot. Its hash matches `00-baseline-live-reader-viewport.png`.

## Hashes

```text
9d9cd38fc3a288ba1a833adc93dc23fd820469c347b1b7a6e22b10ebc125e04f  00-baseline-live-reader-viewport.png
b74a614704aec31d7f07fd1903ecf8f5be8ccfe01ec16e6077d33e4e3f774f56  00-baseline-live-reader.png
6429dc48e48c477d1dbf1bcf9475b1d667668a101353675b0549ec4122e25739  01-supported-grid-reflow.png
9d9cd38fc3a288ba1a833adc93dc23fd820469c347b1b7a6e22b10ebc125e04f  02-ignored-rich-layout-fields.png
9d9cd38fc3a288ba1a833adc93dc23fd820469c347b1b7a6e22b10ebc125e04f  03-ignored-sprite-bubble-fields.png
435e0533bc280397d862eec65b88502a463c05c7eaba0900b34d0c7bf8d01c63  04-artifact-backdrop-from-sprite.png
601cf6ca6eb7ed3338228fbb7c4fa69d6ff3b691421fe07364fae74e9dad62b9  04-artifact-backdrop-from-sprite-full.png
9d9cd38fc3a288ba1a833adc93dc23fd820469c347b1b7a6e22b10ebc125e04f  99-restored-baseline-check.png
```

