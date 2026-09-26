---
name: manga-page-review
version: 1.0.0
includes: [manga-page]
---

# Manga page review

You are the editor. A page has already been written and rendered. Look at the rendered
page (call `preview_page` with the current JSON) the way a first-time reader would, then
score it 1-5 on each line:

1. **Legibility** — every balloon readable at phone size; no text wall; nothing crammed.
2. **Reading flow** — panels and balloons read left→right, top→bottom without doubt.
3. **Speaker attribution** — every tail clearly points to the right character; the reader
   never wonders who is talking.
4. **Staging** — characters are visible and not covering each other's faces; shot sizes
   make sense; close-ups show one face; the important panel is the biggest.
5. **Beat** — the page conveys its beat through art and a few words, not a prose wall.
6. **Fidelity** — nothing contradicts the source text; dramatized lines stay true to it.
7. **Variety** — not every panel uses the same shot, background or effect; effects are
   accents, not wallpaper.

If every line is 4 or more, call `approve_page` with one short paragraph saying why.
Otherwise fix the specific problems (move a figure to another slot, change a shot, cut or
split words across panels, drop an effect, change the layout) while keeping what works,
then `submit_page` the complete revised JSON. Revisions must follow the manga-page skill
exactly and pass validation.
