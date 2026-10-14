# PanelSummary v0.3.0

Released 2026-10-14 (tag `v0.3.0`). License: PolyForm Noncommercial 1.0.0 (`LICENSE.md`).

v0.3 has one goal: make the manga better on books that nobody tuned on, measured on sealed hold-out books against
v0.2.0 with the same judge panel, without losing v0.2 on the tuning books. It also finishes open product and UI work.

## Quality on books nobody tuned on (the v0.3 claim)

Measured with the same 3-judge Sonnet panel as v0.2 (AI judges, not readers), on three books that were sealed during
the whole build (chosen and hash-committed at the start; no implementer saw them; `docs/v0.3/HOLDOUT.md`), against
v0.2.0 on the same books. Details: `docs/v0.3/GATES.md`.

| Book (class) | v0.2.0 | v0.3 | Key prop not drawn | Wrong setting | Hero a speck or cropped |
|---|---|---|---|---|---|
| *Jataka Tales*, 13 animal fables (sealed fiction) | 3.44–3.48 (2 runs) | **3.59** and **3.54** (2 runs) | 0.78 → 0.62 / 0.53 | 0.18 → 0.13 / 0.09 | 0.75 → 0.76 / 0.69 |
| *Indian Why Stories*, 8 stories (sealed fiction) | 3.44 (2 runs) | 3.43 | 0.75 → 0.59 | 0.21 → 0.15 | 0.64 → 0.67 |
| *On a Piece of Chalk* (sealed nonfiction) | 3.35–3.49 | 3.37 | 0.48 → 0.45 | 0.23 → 0.22 | 0.48 → 0.46 |
| **Sealed fiction pooled** | **3.45** | **3.51** (+0.06) | **−24%** | **−32%** | flat |
| *Just So Stories* (tuning; the #81 diagnosis book) | 3.40–3.44 (3 runs) | 3.46 | 0.75 → 0.62 | 0.15 → 0.19 | 0.65 → 0.52 |
| Two-tale Wilde (tuning) | 3.60 | 3.53 and 3.43 (2 runs) | 0.50 → 0.70 / 0.74 | 0.14 → 0.27 / 0.35 | 0.55 → 0.61 / 0.62 |
| 68-page Wilde (tuning guard) | 3.55, 20/61 strict | 3.54, 9/61 strict | 0.43 → 0.51 | 0.20 → 0.20 | 0.35 → 0.43 |

**The v0.3 bar was not met.** The plan asked for a mean higher than v0.2.0 by at least 0.08 on the sealed fiction
books, more pages at the strict bar, and key prop not drawn, wrong setting and a tiny or cropped figure each down by a
quarter. v0.3 reached +0.06, fewer strict pages, key prop −24%, wrong setting −32%, and no change on tiny or cropped
figures. On the 68-page tuning book the mean holds but fewer pages pass the strict bar (9 against 20).

What the numbers do show: the neutral stand-ins work where the book needs them. On the animal-fable book v0.3 is better
than v0.2.0 in two independent runs, and on every fiction book fewer key props are left undrawn. The largest remaining
defect on every book is a key figure that is tiny or cropped; v0.4 starts there (#120).

Not measured on the final code, because the MiniMax token plan limit stopped the runs: the Cheese PDF, *Self-Reliance*,
and the second runs of two sealed books (#126). The owner decided to release v0.3.0 with these numbers stated.

## What changed

### Drawing books outside the vocabulary (#81)
- Neutral stand-ins instead of confident wrong matches: six archetype animals by body plan (`quad_small`,
  `quad_medium`, `quad_large`, `long_low`, `swimmer`, `bird_tall`) with optional body marks (`long_neck`, `long_nose`,
  `horns`, `big_ears`, `long_tail`), five generic backdrops by kind of place (no fixed furniture; they draw the place's
  features), five neutral props by shape with a label. A stand-in figure gets its name tag.
- The understanding says what it could not map (`fit`, `wanted`, `unmapped`); "About this adaptation" lists the
  stand-ins.
- General fixes from the diagnosis: "blade-bone" no longer asks for a sword; `abstract` draws its features; "small" for
  the camera comes from the figure's height; a sitting rodent no longer reads as a bear.
- Gate 1 fixes: `look.scale` only on stand-ins and on tiny people (a real-world size made small birds into specks);
  labels only on neutral props; a crowd is always people.
- Renderer `manga-render/0.7.2`. Decisions D29, D30.

### The camera push keeps every planned figure in the panel (#90)
- Both camera pushes use one bounded search; a planned figure is never cropped on purpose. On 290 judged v0.2 pages the
  figures lost or cut by a push went from 21 to 0. Decision D31.

### Writer (#82, #83, #87)
- Page turn: hooks where the story has one; the page after a hook answers it or moves on (the page goal sees the
  previous page's planned hook). Fidelity labels: no new label; `QUOTE_CLIPPED` is not run (no signal). Continuity: the
  location check stays a warning (no better than chance); minor speakers have names in the Sources drawer.
  Decisions D32–D34.

### Continue with the next section (#80)
- A versioned understanding per book; a new part reuses the cast, the looks and the places; page numbers continue on
  the book page; "Continue with the next section". The live run found a bug that the offline tests could not, and it is
  fixed (#111). Decisions D38–D39.

### UI (#89, #93, #94)
- The reader opens at the read size at 1440×900 with the "Whole page" chip off the art (D37); the time strip says
  "Faster than the estimate"; one rule for "Continue from page N"; the 390 bottom bar no longer covers the estimate; a
  dark-theme impeccable scan; edges on the status bands; a "Plan ready to review" band; "Stopped by you"; the #94 defaults.

### Ops (#88, #84, #85)
- The estimates are re-fitted on 12 Flash runs (a 9,419-word book: first page 1–9 min instead of 4–38). No wall-clock
  limit for a page attempt (D35). No second host: the worker talks only to `api.minimax.io` (D36).

### Evaluation (#92, #96)
- The defect-kind classifier, the rate script, fixtures of every gate run and a run-comparison tool are in the
  repository. The sealed hold-out protocol is in `docs/v0.3/HOLDOUT.md`.

## Cost and time

- 25 paid run starts and 2 resumes during the build, about $17.77 at MiniMax-M3 rates (not a bill; MiniMax publishes no price for
  the Flash model, D36). The binding limit was the MiniMax token plan: it stopped 7 runs (the runs show the stop and can
  be resumed).
- v0.3 runs use 30–60% more tokens than v0.2 runs (longer skill text, more repair rounds). A 34-page book cost
  $0.89–1.18; the 68-page book $1.98. The estimates were re-fitted on 18 Flash runs (#88): for a 9,419-word book,
  first page 1–9 min, all pages 4–27 min, cost $0.68–1.85.

## Known limits

- A key figure is often tiny or cropped (the largest judged defect on every book, #120).
- Stand-ins are not wrong but are often hard to read: a monkey reads as a goat, a crocodile as a salamander on land,
  a neutral prop as "a grey slab" (#121); places outside Europe are drawn as European towns (#122).
- The understanding's claim count varies from run to run; dense plan pages score lower (#123).
- The reader numbers each part of a continued book from 1 (the reader was frozen; the book page shows the series
  numbers, #128); its Page/Panels/Sources controls are 40 px (#127).
- The run card says "10 pages were not tried yet" after a provider stop although one of them was tried and refused.
- The final journey (a sealed book through the UI, `docs/v0.3/GATES.md` §5): questions 1–3 PASS; question 4 PASS for
  the reader and PARTIAL for the drawing. The token plan stopped the edition at page 18; a resume through the UI finished
  it (28 of 28 pages, 0 failed). The run card then said "10 pages were not tried yet" although one was tried and refused,
  and it gives no hint of when the limit resets.

## Moved to v0.4

- #86 deploy → #129 (the owner chose no deploy for v0.3).
- From #89: the reader's 40 px controls → #127 (the reader was frozen).
- From #80: series numbers inside the reader → #128.
- From #85: the plan headroom endpoint (a second host) → #124 (owner decision).
- The Gate 2 runs the token plan stopped → #126. A new sealed set → #130.
- New: #120 (tiny or cropped figures), #121 (readable stand-ins), #122 (places outside Europe), #123 (plan density),
  #124 (tokens), #125 (the 68-page strict count).
