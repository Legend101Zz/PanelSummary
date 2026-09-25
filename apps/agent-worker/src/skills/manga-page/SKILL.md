---
name: manga-page
version: 1.0.0
---

# Manga page

You write and stage ONE manga page: the panels, the camera, who is in each panel doing
what with which face, and every word of lettering. Code draws everything from your JSON
(characters, backgrounds, balloons, screentone) — you choose, it renders. Your page must
make one beat of the book clear and engaging to a reader who has not read the book.

## Output: `manga-page.v1`

```json
{
  "schema": "manga-page.v1",
  "page_number": 4, "section_id": "s1",
  "purpose": "the beat, one sentence (not lettered)",
  "layout": { "template": "<template id>" },
  "panels": [
    {
      "id": "p1",
      "beat": "what the panel shows (not lettered)",
      "shot": "wide", "angle": "high", "location": "l_square", "time": "night",
      "figures": [
        { "character": "c_swallow", "pose": "fly", "expression": "tired", "facing": "right", "slot": "center_left", "depth": "mid" }
      ],
      "props": [],
      "fx": ["wind"],
      "text": [
        { "kind": "narration", "text": "Night fell over the city.", "fidelity": "paraphrase", "source": { "unit": "s1u2", "page": 5 } }
      ],
      "source": [{ "unit": "s1u2", "page": 5 }]
    }
  ],
  "claims": ["k4"],
  "page_turn_hook": false
}
```

`layout` is either `{ "template": id }` from the trusted template list (panels fill the
slots in reading order, panel count must equal the template's slot count) or an authored
tree `{ "tree": { "split": "rows", "sizes": [2, 1], "children": [{ "panel": "p1" }, { "split": "cols", "sizes": [1, 1], "children": [{ "panel": "p2" }, { "panel": "p3" }] }] } }`
(`slant` up to ±12 degrees tilts a split's gutters for energy). Panels are read left to
right, top to bottom; `panels` must be listed in that reading order.

## Craft

**Beat first.** Decide what the reader must feel or understand at the end of the page.
Every panel moves toward it. The last panel lands the beat — or, if `page_turn_hook`,
leaves a question that makes the reader turn the page.

**Panel count and size.** 3-5 panels is normal. 1-2 panels for a big moment (a
revelation, a death, a transformation). 6-7 only for quick action or a rapid exchange.
The most important panel gets the most space — choose a template whose big slot falls on
it. Vary layouts between pages.

**Camera.** Open a scene with an `establishing` or `wide` shot so the reader knows where
they are. Move closer as emotion rises (`medium` → `close` → `extreme_close` for the peak).
Cut to reaction shots: a face reacting is often the real payoff. Use `low` angle for power
or awe, `high` for smallness or loneliness, `birds_eye` for scale, `dutch` for unease,
`insert` for an important object (a ruby, a letter, a coin).

**Show, don't tell.** The art carries action and emotion: pose + expression + fx. If a
caption would only describe what the panel already shows, delete the caption. Narration is
for what pictures cannot show: time passing, a character's reasoning, the book's argument,
a narrator's voice worth keeping. Keep a narration box to 1-2 short sentences.

**Lettering limits.** A balloon holds one breath: aim for 8-18 words, never over 40.
At most 2-3 balloons per panel and about 60-90 words per page (hard limit 150). Split a
long speech across panels (show the listener reacting between), never across two
balloons in one panel. Every word must earn its place.

**Speakers.** A character who speaks (`speech`, `shout`, `whisper`, `thought`) should be a
figure in that panel. Put the first speaker on the left (the reading start) and the
responder on the right, so balloons read in order and tails do not cross. `thought` for
inner voice; `shout` for raised voices; `whisper` for secrets. `sfx` for sounds (short,
punchy: "FLAP", "CRACK", "DRIP"). `caption` for place/time labels ("The city, at night").

**Characters.** Use each character's defined look; only choose pose, expression, facing,
slot, depth. Poses and expressions must be supported for that character's kind (see
`trusted_cast_capabilities`). Face characters toward each other when they talk
(the one on the left faces `right`). When a character appears for the first time in the
book, name them in a caption or line on that page.

**Truth.** `fidelity` on every text:
- `quote` — the words are (nearly) verbatim from the source text you were given;
- `paraphrase` — the source's content in fewer words;
- `dramatized` — invented dialogue or thought that acts out something the source says
  happened or argued;
- `metaphor` — an explanatory image or comparison that the source does not make (for
  nonfiction emblem characters, visual analogies).
Never state as fact anything the source does not support. Cite `source` (unit + PDF page)
on every panel, and on every `quote`/`paraphrase` text.

**Nonfiction.** Dramatise the argument: the author or a guide figure speaks to someone,
an anecdote is acted out, an emblem character embodies an abstraction (label its lines
`metaphor`). Keep the reasoning's steps and the book's precise claims intact — the page
must teach the idea, not just gesture at it.

## Process

1. Read the source text and the claims for this page.
2. Draft the page JSON. Use `preview_page` to check it (it lists every issue; with vision
   you also see the rendered page — check reading order, who is speaking, whether faces are
   covered, whether the art carries the beat).
3. Fix problems, then `submit_page` with the complete JSON string. If it is rejected, fix
   every error and submit the complete JSON again.
