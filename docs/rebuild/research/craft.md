# Manga craft research for the rebuild

Date: 2026-09-25. Phase 4 input ("Manga craft + visual system"). Research only. Nothing in the
code or the live skills was changed. Proposed replacement skills are in
`docs/rebuild/research/skill-proposals/`.

Read before writing this:
`apps/agent-worker/src/skills/{manga-page,adaptation-plan,book-understanding}/SKILL.md`,
`packages/manga-render/src/contracts.ts`, the renderer modules it names (layout, lettering, scene,
style, validate), the goal code that builds the prompts (`apps/agent-worker/src/goals/*.ts`), and the
renderer's gallery output (6 Happy Prince fixture pages plus 40 character, world and FX sheets).

Source tags such as `[S3]` point to section (h). "Renderer" means `packages/manga-render` at
`RENDERER_VERSION = "manga-render/0.1.0"`.

## Top findings

1. **The page writer's word limits are about right. Its panel rules are missing the one-moment
   rule and the dominant-panel rule.** Dixon's manga rule is at most 25 words per panel, ideally
   12 or fewer, and about 60 words per page [S2]. Dark Horse allows at most about 25 words per
   balloon and 50 per panel [S3]. One Piece dialogue pages run to about 95 lettered words, and its
   action pages to 20-40 [S21]. What the current skill does not ask for: each panel shows one frozen
   moment [S2], and one panel per page carries the beat at about 30-45% of the page area (up to
   75% in action) [S21].
2. **Figure–ground separation is the renderer's biggest legibility problem.** Dot tone sits on the
   background, the floor and the figures at the same time (gallery pages 2, 4 and 6). Professional
   practice does the opposite: in close shots the background is dropped or replaced by speed lines,
   and tone is kept for emphasis and shadow [S12, S13, S21]. Two sources also advise flat grey
   instead of dot patterns for screen output, because dots cause moiré [S12, S13].
3. **Staging continuity is not expressible, so the story is wrong in the pictures.** The Happy
   Prince statue is always drawn at street level. The establishing shot shows an empty column. The
   swallow's size relative to the prince changes from panel to panel. The contract has no way to
   put a figure on a feature or next to another figure.
4. **Our tree order is right for expert readers and risky for everyone else.** When a tall panel
   stands to the right of a stack ("blockage"), experienced readers go down the stack first:
   Z-path use falls to 31%, and
   below 10% when the blocking gutter runs the full height [S8, S9]. The renderer's depth-first
   order agrees with that. Readers new to comics fall back to the Z-path [S8], and our readers are
   mostly new to comics. Rows need a clear gutter hierarchy, and the validator should warn on
   blockage.
5. **On a phone, the full page is at the lower limit of legibility.** The minimum speech size of
   22 units shows at 8.6 CSS px on a 390 px screen. LINE Webtoon asks for 18-24 px text on an
   800 px canvas [S14], which comes to about 8.8-11.7 CSS px on a phone. The reader should default
   to guided panel view on phones, and the minimum speech size should rise to 24.
6. **Nonfiction.** Comics teach about as well as text and engage readers more [S15]. The known
   risks are seductive details [S16], metaphors pushed too far, and a false sense of
   understanding [S15]. The skills should require every metaphor to be followed by the literal
   claim, and they need an explicitly labelled reader-proxy device. The current skills ask for a
   proxy but also forbid inventing cast, which is a contradiction.
7. **HyperFrames: adopt its principles, not its packages** (section d). Its player is a
   time-based iframe video player that loads its runtime from jsDelivr, with 2.2 MB + 3.2 MB
   unpacked on npm at version 0.8.77. Our reader needs discrete panel-to-panel moves driven by the
   geometry we already store.
8. **One Piece chapter 1187 is not free to read lawfully** (section c). Chapters #1192 and #1193
   were studied instead and are labelled as such.

---

## (a) Distilled craft rules with numbers

Each rule is written so a model can apply it, carries its source, and names where it lands:
**P** = `manga-page` skill, **A** = `adaptation-plan` skill, **U** = `book-understanding` skill,
**R** = renderer, **V** = validator.

### A1. Page, beat and pacing

| # | Rule | Numbers | Source | Lands |
|---|---|---|---|---|
| A1.1 | A page carries one beat: the one change the reader must register by its last panel. | 1 beat per page | current skill; Dixon's "don't bore" rule [S2]; Gonick builds each page as a small story that climaxes at bottom right [S19] | A, P |
| A1.2 | Limit the major story points on a page. | at most 4 per page | [S2] | A (claims per page), P |
| A1.3 | Every panel is one frozen moment: a character does A in one panel and B in the next, never both in one. | 1 action or 1 reaction per panel | [S2] | P, V (heuristic: two verbs in `beat`) |
| A1.4 | Start and end scenes on page boundaries: the first panel opens a scene and the last panel closes it. | In One Piece #1193, 2 of 3 scene changes open a page; the third opens a new row | [S2, S21] | A, P |
| A1.5 | Panels per page: manga typically runs fewer panels and more mood than US comics. More than 6 feels cramped. | Dixon: US 5-6, manga 3-4 [S2]. One Piece #1193: mean 6.0, median 6, range 4-9 across 16 story pages [S21] | [S2, S21] | P: 3-5 normal, 6-7 only for a rapid exchange or montage |
| A1.6 | Action pages need fewer, bigger panels. | 3-4 panels for action [S3]. One Piece action pages: one panel covers 55-75% of the page [S21] | [S3, S21] | P |
| A1.7 | Most pages have one dominant panel, the one that carries the beat. | One Piece: about 30-45% of the page on most dialogue pages, 55-75% on action pages; the densest explanation page (9 panels) has none [S21] | [S21] | P (choose a template whose big slot carries the beat), R (templates) |
| A1.8 | Kishōtenketsu is a four-part shape with no required conflict: set-up (ki), development (shō), turn (ten), landing (ketsu). The turn can be a reframing rather than a fight. | 4 beats. Use it per page (4 panels) or per sequence (about 4 pages) | [S1, S20] | A (section shape), P (panel arc) |
| A1.9 | Put character first. Alternate close-ups on emotion with wide shots. Distil the premise into one sentence: when X happens, Y must do Z or else W. | the one-sentence hook | [S1] | U (`logline`), A (`beat`) |

### A2. Panel flow and layout

| # | Rule | Numbers | Source | Lands |
|---|---|---|---|---|
| A2.1 | A regular grid is read in Z order by almost everyone. | 94% Z-path | [S8] | R |
| A2.2 | **Blockage.** When a tall panel stands to the *right* of a stack (in left-to-right reading), experts read down the stack first; newcomers keep the Z-path. A tall panel on the *left* (our `l_shape_*` templates) is read first either way and is safe. | Z-path 31% overall; under 10% when the gutter is fully continuous; people who never read comics use the Z-path more | [S8, S9] | V (warn on `stacked_to_tall_3` and authored trees with a stack left of a tall panel), P (use only when either order works), reader (guided view enforces order) |
| A2.3 | **Staggering** (offset panel edges) barely disturbs order. Prefer it to blockage for varying a layout. | 89-90% Z-path | [S8, S9] | R (templates) |
| A2.4 | **Separation.** A wider gutter splits groups. Make the row gutters wider than the column gutters so that rows read as units. | Z-path drops to about 72% with a wide gap. One Piece's horizontal gutters are visibly about 2-3 times its vertical gutters | [S8, S21] | R: row gutter 24-28, column gutter 10-12 (today both are 18) |
| A2.5 | Three tiers are the default page skeleton. Split panels inside a tier, not across tiers. | One Piece #1193: 3 tiers on 14 of 16 story pages | [S21] | R (templates), P |
| A2.6 | Slanted gutters are for action only. | One Piece: slants on the fight pages of #1192, none on the dialogue pages of #1193 | [S21] | P |
| A2.7 | Put the speakers in a panel left to right in the order they speak. | first speaker on the left or at the top | [S2, S3] | P |

### A3. Shots and camera

| # | Rule | Numbers | Source | Lands |
|---|---|---|---|---|
| A3.1 | Manga isolates characters and parts of a scene. US comics show the whole scene more often. | Manga uses more single-character (mono) and detail (micro) panels [S10]. One Piece #1193, estimated by eye: about 40-45% close or extreme-close faces, about 20% medium, about 25% wide or establishing, 5-10% full, about 5% inserts | [S10, S21] | P (shot mix) |
| A3.2 | Reaction panels are the most frequent beat. After a key event, show 1-5 faces reacting, often in a row of narrow panels. | One Piece #1192 p2: a row of 5 close-ups; #1193 p2: 3 | [S21] | P |
| A3.3 | Close-up reaction panels drop the background: a white field, speed or focus lines, or a flat tone. | the pattern on almost every reaction close-up studied | [S21] | R (simplify the background by shot) |
| A3.4 | Establish a new place with a wide panel and a location caption at its top corner. | 3 of 3 scene changes in #1193 | [S21] | P, A |
| A3.5 | Silhouette (a solid-black figure) for menace or power, used sparingly. | 2-3 per chapter | [S21] | R (a future `silhouette` fx), P |
| A3.6 | Move closer as emotion rises. Keep extreme close-ups for the peak. | at most 1 extreme close-up per page (proposal) | current skill; [S21] | P |
| A3.7 | Screen direction (the 180° rule): each character keeps its side of the frame throughout a conversation, and travel keeps one direction. | none | general film grammar, not sourced here | P, V (warn when a speaker swaps side between consecutive panels) |

### A4. Transitions (McCloud's taxonomy, used as concepts)

McCloud names six panel-to-panel transitions: moment, action, subject, scene, aspect and non
sequitur. By his estimate, Kirby's pages are about 65% action-to-action, 20% subject-to-subject
and 15% scene-to-scene, while Japanese comics use subject-to-subject about as often as action and
use aspect-to-aspect to set mood and "stop time" [S7].

- **P rule:** Use action-to-action for events, subject-to-subject for conversation and reaction,
  and aspect-to-aspect (1-2 wordless detail panels: the moon, an empty square, a dripping tap) to
  slow down before a turn. Use scene-to-scene only at a page start, with a caption.
- **Choice of moment** [S7]: choose the panels that keep the event clear. Show the moment before
  and the moment after, not the blur between them.

### A5. Words, dialogue and captions

| # | Rule | Numbers | Source | Lands |
|---|---|---|---|---|
| A5.1 | Words per balloon | about 25 at most [S3]; 20-25 at most [S6]; target 5-15 | [S3, S6] | P (target 5-15, max 25); V warns at 25 and errors at 40 (today) |
| A5.2 | Words per panel | 50 at most [S3]; manga 25 at most, ideally 12 or fewer [S2] | [S2, S3] | P: 25 or fewer, 35 at most in a dialogue-heavy panel; V warns at 40 and errors at 60 (keep) |
| A5.3 | Words per page | manga about 60 [S2]; US about 200 [S2]; One Piece 20-40 on action pages and about 95 on dialogue pages [S21] | [S2, S21] | P: target 40-90; V warns at 110 and errors at 150 (keep) |
| A5.4 | Exchanges per panel: a comment, a response and a counter-response at most. | 3 balloons | [S3] | P, V (warn above 3) |
| A5.5 | A speech may continue across balloons or panels: end the first part with a double dash and open the next with one. Ellipses mark a pause or trailing off, and have exactly three dots. There are no em dashes or semicolons in comics punctuation. | none | [S3, S5, S4 #011] | P. This corrects the current skill's "never across two balloons in one panel". |
| A5.6 | Emphasis is set in bold italic. Whispers use a dashed balloon. Thoughts use a cloud with at least 3 shrinking circles. Shouts use a burst. Captions come in four kinds: location/time, internal monologue, spoken and editorial. | none | [S5, S4 #010] | R (already mostly done), P |
| A5.7 | Stack text as an ovoid, with the widest line in the middle. Avoid a single word alone on the first or last line. | none | [S4 #005, S6] | R (the lens line profile already exists; add widow/orphan checks) |
| A5.8 | Show a new place and time in a caption. Keep narration for what pictures cannot show. | captions of 6 words or fewer (proposal) | current skill; [S15, S17] | P |

### A6. Balloons and tails

| # | Rule | Numbers | Source | Renderer today → change |
|---|---|---|---|---|
| A6.1 | Tails never cross. Balloons may overlap each other; tails may not. | none | [S4 #004, #014] | not checked → add a V check |
| A6.2 | Tails point toward the speaker's mouth or head. | none | [S4 #014, S6] | done (`speakerTip`, `lettering/place.ts:127-148`) |
| A6.3 | Tail length: the tail stops about halfway to the speaker. | about 50-60% of the gap [S4 via Blambot; S6: "half the distance"] | [S4, S6] | today the tip reaches the edge of the head (for example, the tail runs into the top hat on page 1 p3). Stop at about 55% of the gap, with a minimum length |
| A6.4 | Keep the tail's base width the same on every balloon on the page, roughly the width of the letter "O". No needle-thin tails. | the "O" width | [S4 #006] | the base half-width varies with font size, 7-12.5 (`lettering/shapes.ts:236`) → fix one width per page |
| A6.5 | Keep the gap between text and balloon edge slightly larger than one capital letter, and the same on every balloon. | about 1 cap height | [S4 #007, S6] | padding is set in em (`styles.ts`, 0.5-0.62), which is fine |
| A6.6 | Butt or crop balloons against panel borders to save space and tie the lettering to the art. | none | [S4 #014] | not done → allow placement against a border as a low-cost option |
| A6.7 | Put balloons at the top of the panel, never over a face, and never blocking a character's line of sight. | none | [S4 #014, S6] | faces are avoided and the top band is preferred; line of sight is not considered |
| A6.8 | Keep the bulge spacing of thought and radio balloons the same across sizes. | none | [S4 #016] | the clouds look consistent in the gallery |
| A6.9 | Placing balloons close together makes them read in quick succession; butted balloons read as an interruption. | none | [S6] | could support connected balloons (A5.5) |
| A6.10 | Dialogue type size in print is 8-9.5 pt. On screen, LINE Webtoon asks for 18-24 px on an 800 px canvas. | Our page is 1000 units wide, so 8-9.5 pt on a US comic trim is about 17-20 units and 18-24 px webtoon text is about 22-30 units | [S4 #017, S14] | speech runs 28 down to 22 (`styles.ts:21`). Raise the minimum to 24, prefer 28-30, and make guided view the phone default |

### A7. SFX, speed lines, tone and blacks

- **SFX grow out of their source, follow the force of the sound, and are part of the art** [S4 #003, #014].
  One Piece letters its SFX as large hand-drawn shapes that often cross panel borders, with a
  small English gloss. They appear on about 11 of 16 story pages in #1193 [S21]. **R:** place SFX
  in empty space along the direction of motion and never over the subject of an insert. Gallery
  page 6, panel p5 breaks this: "SWOOP" covers the sapphire.
- **Speed lines replace the background in motion panels. Focus lines replace it in shock and
  realisation panels** [S21]. **P:** use them in those two roles only.
- **Tone is for emphasis and shadow, not for every surface.** The Clip Studio guide gives 50-60
  LPI as the standard print frequency and recommends turning the tone effect off (flat grey) for
  online export [S13]. GlobalComix recommends flat grey or no tone online because dot patterns
  cause moiré on different screens [S12]. One Piece uses little tone: mostly line hatching, solid
  blacks, and tone on smoke, dust and some clothing [S21]. Our dot pitch is 7 units
  (`style.ts:43`), which is about 2.7 CSS px on a 390 px phone.
- **Balance solid blacks.** A silhouette, a dark coat, or a night sky gives each page one or two
  large black areas that anchor it [S21].

### A8. Page turns

- The last panel before a turn is the *hiki-goma* (the pull panel). The first panel after the turn
  is the *mekuri-goma* (the reveal) [S11]. The most reliable pull panel shows a character reacting
  to something the reader cannot yet see [S11, S21].
- **Where the turn falls.** In a left-to-right print book, you turn after each right-hand page
  (odd-numbered pages, starting at page 1 on the right). In our single-page digital reader, every
  page boundary is a turn. Plan hooks every 2-4 pages [current skill], always on the page before
  a big reveal, and at the end of every section except the last [A].
- **P:** When `page_turn_hook` is true, the last panel is small to medium (never the page's
  dominant panel) and holds the question. When the previous page ended on a hook, the first panel
  of this page gives the answer and is large (40% of the page or more).
- **Chapter ends.** Both One Piece chapters studied end with one big panel followed by a small
  reaction panel that closes the chapter [S21]. The last page of a book section should end the
  same way.

---

## (b) Adapting nonfiction

### What the evidence says

- Comics are **about as effective as text for learning facts** and **consistently better at
  engagement and motivation**. In one study, 83% of comic readers reported interest against 71% of
  text readers. The caveats: effects may come from the narrative rather than from the comic form;
  anthropomorphic characters can give a **false sense of understanding**; and a metaphor pushed
  beyond what it maps can backfire [S15].
- **Seductive details hurt learning.** In Harp and Mayer's experiments, interesting but
  irrelevant material (a vivid anecdote, an arresting image) cut recall of the main ideas and
  problem-solving transfer. The damage was worst when the material came early in the lesson [S16].
  For us, this means jokes, cute emblem business and colourful asides must serve the claim or be
  cut.
- **Spatial contiguity.** Words placed next to the part of the image they describe are learned
  better than the same words placed away from the image [S17]. Balloons and labels inside the
  panel beat a caption that explains a picture from outside it.
- **Educational manga structure.** The Manga Guides use a learner character and a mentor. Each
  manga chapter is followed by a written explanation section, and a romantic or comic subplot keeps
  the reader going [S18].
- **Gonick's method.** Each page is a small story that climaxes at bottom right. A narrator's
  voiceover runs alongside comments from people "on the ground", with footnotes for the author's
  asides. He keeps real equations and mechanisms instead of simplifying them away [S19].

### Rules for the skills

1. **One argument step per page** (A). The page's `beat` states the step: "Thoreau argues that
   … because …".
2. **Shape each step as a small kishōtenketsu** (P):
   - *ki*: a concrete question or situation from the book (an anecdote, an example, the author
     observing something);
   - *shō*: the mechanism shown, one sub-step per panel;
   - *ten*: the counterpoint, objection or surprising consequence that the book raises;
   - *ketsu*: the claim, in the book's words where possible (`quote`), or a tight `paraphrase`.
3. **Every metaphor is followed by its literal claim on the same page** (P). A metaphor panel
   (emblem, visual analogy) is marked `metaphor`. A panel on the same page states the literal claim
   as `quote` or `paraphrase` with a source. Use at most 1 metaphor per page, and never let a
   metaphor carry a number, a date or a name.
4. **Precision survives adaptation** (U, P). Numbers, dates, names, technical terms and the
   book's own formulations appear exactly. `fact` and `quote` claims are never paraphrased away.
5. **Devices must be labelled** (U, A, P):
   - *Guide*: the author or narrator, but only when the book speaks in the first person or
     addresses the reader. Their lines are `quote` or `paraphrase`.
   - *Reader proxy*: an invented listener who asks the questions a reader would. They are **not
     in the book**, so the understanding must declare them (`role` starts with "Adaptation
     device"). They may ask questions and react but never state the book's claims, and their lines
     are `dramatized`.
   - *Emblem*: the State, the Law, Money and so on. Their lines are always `metaphor`. Use them
     only when the book personifies the idea or the argument turns on it. At most 4 per book.
   - *Anecdote re-enactment*: people from the book's own examples, acting out what the book says
     happened. Their dialogue is `dramatized`.
6. **Cut seductive details** (A, P). A panel that a reader would remember instead of the claim
   is a failure, however charming it is.
7. **Recap** (A). End each section longer than about 6 pages with a page that lands the
   section's concluding claim. If that claim is new, it goes in the recap page's `claims`; the
   recap may restate earlier claims in its `beat` without listing them again.
8. **Put words at the thing they describe** (P). Place a labelling line (speech or narration) in
   the panel that shows the object or process, not one panel later.

### Worked micro-example (public domain: Thoreau, *Civil Disobedience*, 1849)

Planned page beat: *Thoreau argues that the best government is the one that governs least,
because government is only an expedient.* The pattern is sketched below as page-spec fields (not
lettered):

- p1 `wide`, location `study`: the author at his desk. `caption` "Henry David Thoreau, 1849"
  (the essay's publication year, a fact).
- p2 `medium`: the guide (Thoreau) talking to the reader proxy. The proxy asks what government is
  for (`dramatized`).
- p3 `insert` of a ballot box with `emblem` State looming behind it. Emblem line `metaphor`: the
  State as a tool that people pick up and put down.
- p4 `close`: the guide delivers his opening motto, "That government is best which governs
  least" (`quote`, source page).

The metaphor in p3 is followed on the same page by the literal quotation in p4. The proxy never
states a claim.

---

## (c) One Piece: access limitation and findings

### Access, as checked on 2026-09-25

- **Chapter 1187 is not lawfully free to view.** It was released on 5 July 2026 [S22]. The MANGA
  Plus web page for One Piece (`mangaplus.shueisha.co.jp/titles/100020`) offers only #001-#003
  and the three latest chapters, #1191 (dated 23 Aug 2026), #1192 (6 Sept 2026) and #1193
  (13 Sept 2026). Chapters #004-#1190, including #1187, are shown locked behind an advert for the
  app. The page says that the latest 3 chapters are viewable, and that the third-latest is hidden
  when a new chapter arrives (the next one was due on 27 Sept 2026 at 20:30). VIZ's page for
  chapter 1187 shows "Join to read", which means a paid Shonen Jump membership [S22].
- The MANGA Plus site also shows an advert saying all chapters can be read for free in the app.
  I did not install the app, create an account, or accept anything beyond declining the cookie
  banner ("Reject All"). I could not verify the app-only access, so I did not rely on it.
- No scanlation site was used.
- **Studied instead, labelled as the officially free latest chapters:** One Piece **#1193** (all
  16 story pages plus the title page) and **#1192** (12 of 16 story pages plus the title page), in
  the MANGA Plus web viewer, English edition. I recorded counts and patterns only. No page images
  were saved, and no dialogue, characters or layouts are reproduced here.

### Method

The viewer was scaled so each page fitted the screen, and each page was inspected once.
Everything below is counted **by eye** at reduced size. Panel counts are ±1 on pages with insets.
Shot percentages are estimates, ±10 points. MANGA Plus keeps Japanese right-to-left page and panel
order, so every spatial lesson below is mirrored for our left-to-right pages.

### Counts: #1193 (a mixed dialogue and battle chapter, 16 story pages)

| Measure | Result |
|---|---|
| Panels per page | 6, 6, 7, 8, 5, 5, 5, 4, 7, 5, 7, 4, 9, 6, 7, 5. **Mean 6.0, median 6, range 4-9** |
| Tiers per page | 3 on 14 pages, 2 on 1 page, 4 on 1 page |
| Dominant panel | One panel of about 30-45% of the page on 13 of 16 pages. The 9-panel explanation page (the one that explains how the villain can be beaten) has no dominant panel |
| Shot mix (estimate) | close or extreme-close faces about 40-45%, medium about 20%, wide or establishing about 25%, full 5-10%, insert about 5% |
| Reaction panels | Rows of 3 narrow reaction close-ups after a big event (p2). Narrow single reaction panels beside wide action panels (p4) |
| Balloons | Dialogue pages 10-13 balloons; action pages 2-6. Mostly 3-15 words each, set in tall ovals with 1-3 words per line. Many balloons are butted or cropped against panel borders. Tails are short or absent, and the speaker is identified by the balloon's closeness to their head |
| Words per page | about 95 on the densest dialogue page (counted, not copied); about 20-40 on action pages |
| SFX | on about 11 of 16 pages. Large hand-drawn Japanese SFX, often crossing borders, with small English glosses |
| Tone and blacks | Tone is sparse. Line hatching and solid black dominate; tone appears on smoke, dust and some clothing. Solid-black silhouettes appear 2-3 times, for menace |
| Backgrounds in close-ups | dropped: white, speed or focus lines, or dark tone behind a shocked face |
| Scene changes | 3. Each has an ornamental location caption on its first panel. 2 of them start at the top of a page |
| Chapter end | a big action panel, then a small reaction panel as the closing beat, then "To be continued" |

### Counts: #1192 (a battle chapter, 12 story pages seen)

- Panels per page mostly 5-7. The final page has 3 (one panel of about 75%, then two small
  reactions).
- One panel covers 55-75% of the page on at least 4 of the pages seen.
- Slanted gutters appear on 3 of the fight pages. The dialogue pages that follow use straight
  gutters.
- p2: a big impact panel over a row of 5 narrow reaction close-ups. This is the clearest example
  of "event, then how each witness takes it", which our `impact_reactions_4` template already
  encodes.

### What this means for PanelSummary

1. A page has three tiers, with the row gutter wider than the column gutter (R). Tiers carry the
   reading order.
2. Give each page one dominant panel on the beat (P), and in action pages let it take most of the
   page (P, R).
3. Reaction close-ups against a simplified background are the workhorse (P, R).
4. Words can be dense on dialogue pages if balloons are short and many. Our renderer cannot yet
   crop balloons against borders or connect them, so our targets should stay lower than Oda's (P,
   R).
5. SFX are drawn into the art, sized by force, and may cross borders (R).
6. Open a scene with a location caption on its first panel, preferably at the top of a page (A, P).
7. End a chapter or section on a big moment followed by a reaction (A, P).

---

## (d) HyperFrames: reuse a package, or only its principles?

**Decision: do not add any `@hyperframes/*` package to the reader. Adopt four of its design
principles. Keep MP4 export out of scope; if it is ever wanted, it should be an offline job
outside the app bundle.**

### Evidence

Repository: `github.com/heygen-com/hyperframes`, shallow clone at `fbaa9f9` (2026-09-25), inspected
in the scratchpad only.

| Question | Finding | Where |
|---|---|---|
| What is it? | "Write HTML. Render video." It turns HTML/CSS plus seekable animation (GSAP, CSS, Lottie, Three.js, WAAPI adapters) into **deterministic MP4** by seeking headless Chrome frame by frame and encoding with FFmpeg. Requires Node 22+ and FFmpeg | `README.md` |
| What is `@hyperframes/player`? | A `<hyperframes-player>` web component. It **loads the composition in a sandboxed iframe** and scales it to fit. The API is time-based: `play()`, `pause()`, `seek(seconds)`, `currentTime`, `duration`, `playbackRate` | `packages/player/README.md` |
| Isolation | The default sandbox includes `allow-same-origin`, which the README itself describes as trusted-content mode rather than an isolation boundary. An opaque mode exists | player README, "Advanced: iframe access" |
| Network | The player injects its runtime from **jsDelivr**: `https://cdn.jsdelivr.net/npm/@hyperframes/core@<version>/dist/hyperframe.runtime.iife.js`. It polls the iframe every 200 ms to decide when to inject | `packages/player/src/runtime-url.ts`, `shouldInjectRuntime.ts`, `tsup.config.ts` |
| Discrete navigation | A `./slideshow` export (slides, fragments, hotspots, presenter mode) is the closest analogue to panel-by-panel reading, but it still drives time-based scene documents inside the iframe | `packages/player/src/slideshow/*` |
| Reduced motion | `prefers-reduced-motion` is honoured only for the player's own controls (button icon transitions, hotspot pulse, spinner). Motion inside the content is not reduced | `packages/player/src/styles.ts:281`, `slideshow/hyperframes-slideshow.ts:143` |
| Size and dependencies | npm unpacked size: player **2.2 MB**, core **3.2 MB**, both at **0.8.77** (pre-1.0; the version number shows frequent releases). Core depends on `postcss`, `linkedom`, `bpm-detective`, `@chenglou/pretext`, `@hyperframes/lint`, `/parsers` and `/studio-server`. The player bundles core (`noExternal`) | `npm view`; `packages/*/package.json` |
| License | Apache-2.0 (`LICENSE` at the repo root). The player and core `package.json` files have **no `license` field** (`npm view … license` is empty), so SPDX scanners may report UNKNOWN. Copying code would require keeping the LICENSE text and marking changes | `LICENSE`; `npm view` |
| What we already have | Every accepted page is a persisted SVG with per-panel `polygon`, `bbox` and reading `order` (`RenderResult.panels`). The frontend already depends on `motion` ^11 | `contracts.ts`; `frontend/package.json` |

### Why not reuse it

The reader's job is to move a camera from panel *i* to panel *i+1* over the same SVG, in response
to a tap or swipe, and to work offline and under a strict CSP. The player's model is continuous
media time inside an iframe, with a runtime fetched from a third-party CDN. Using it would add an
iframe hop, a network dependency and roughly 5 MB of unpacked dependencies, and still not give us
panel geometry, which we already own. Its reduced-motion support does not reach content motion,
which is the only kind we have.

### Principles to adopt

1. **Camera as a pure function.** `camera(page, fromPanel, toPanel, p ∈ [0,1]) → viewBox`. The
   function reads no wall clock and has no physics state, so seeking to any panel always produces
   the same frame (HyperFrames: "no wall clock", `time = frame / fps`, `docs/concepts/determinism.mdx`).
   `requestAnimationFrame` only supplies `p`.
2. **A ready gate before the first move.** Wait for `document.fonts.ready` and the SVG decode
   before showing the page or animating (their `__playerReady` / `__renderReady` gates).
3. **Seeded randomness only.** The renderer already uses `mulberry32`, and the camera needs no
   randomness.
4. **Preview equals render.** The reader shows the exact persisted SVG. That is already the
   architecture decision; keep it.

### Proposed camera specification (our proposal, to be tuned by testing)

- Target `viewBox` = the panel's `bbox`, padded by 4% and fitted to the viewport's aspect ratio.
  For a slanted panel, use the polygon's bbox and mask the other panels at 85% paper-white.
- Transition: interpolate `x`, `y`, `w` and `h` of the viewBox with ease-in-out over 280-360 ms.
  Zoom-in and zoom-out moves between very different scales use a short arc (zoom out 10%, then
  in). All numbers are ours.
- `prefers-reduced-motion: reduce`: cut instantly, or cross-fade in 120 ms or less, with no pan or
  zoom (WCAG 2.3.3, "Animation from Interactions" [S27]).
- Order: follow `RenderedPanel.order`. This makes the reader enforce the intended order on
  blockage layouts (A2.2).
- MP4 export (optional, later): write a HyperFrames composition from our SVG plus a CSS/WAAPI
  keyframe track generated by the same camera function, and render it with
  `npx hyperframes render --docker` in an offline worker. Nothing from HyperFrames enters the
  reader bundle.

---

## (e) SVG practices from the logo-designer skill applied to a comic asset vocabulary

The skill (`Book-Reel-scratch/research/svg-logo-designer-SKILL.md`, from rknall/claude-skills)
is about brand marks, but several of its engineering practices apply to a library of comic assets
[S25]. The skill does **not** mention silhouette testing. That practice comes from character design
and is already in our renderer's sheets.

| Practice (skill) | Transfer to comic assets | Renderer today | Adopt? |
|---|---|---|---|
| Use `viewBox`; avoid pixel-specific sizes | Draw every asset in its own unit box and place it with a transform | Done: page `viewBox 0 0 1000 1500`, modules draw in page units | Keep |
| Define colours once and reuse them (CSS classes) | Keep ink, paper and tone as tokens; no stray greys | Done: `INK`, `PAPER`, `STROKE`, `toneFill()` (`style.ts`). Fills are inline rather than classes, which is fine | Keep |
| **Use symbols for repeated elements** | `<symbol>` / `<use>` for windows, cobbles, bricks, trees, crowd heads, sparkles, rain streaks | **Not done**: no `<symbol>` or `<use>` anywhere. Gallery pages are 177-248 KB of SVG with 461-738 paths each (44-66 KB gzipped) | **Adopt (P2)**: expected at least a 2× cut in size. `use` references must stay inside the page's ID prefix (`scene/ids.ts` already hoists defs) |
| Minimise decimal precision | 2 decimals | Done: `n()` rounds to 2 decimals (`svg.ts`) | Keep |
| Remove invisible elements | Cull geometry that falls wholly outside the panel's clip polygon | Environments are drawn in full and then clipped | Adopt (P2): bbox culling before emit |
| Monochrome and reversed variants | Black-and-white is our only mode. **Reversed**: a dark figure on a dark (night) background needs a white rim or light outline | Partly: page 3 p1 (the dark swallow on a dark sky) loses its outline | **Adopt (P0, with figure–ground)**: add a 3-5 unit paper-white knockout stroke under figure and prop outlines when their contrast with the background is low |
| Test at different sizes; minimum sizes (100 px digital) | **Level of detail**: below a figure height threshold, drop facial detail, thicken the outline, and simplify the costume, like an icon-only logo lockup | Phone sheets exist (`*-phone.png`), but no size floor is enforced. Page 6 p1's figure is about 7% of the panel's height, page 3 p2's swallow about 4% | **Adopt (P0)**: minimum sizes per asset (below) plus LOD tiers |
| Clear space around the mark | Padding around balloons and faces | Done: `HEAD_GAP = 6` and `BALLOON_GAP = 9` (`place.ts:66-67`) | Keep; add line-of-sight clearance |
| No effects (shadows, glows) | Flat ink. Only `soft_glow` uses a gradient | Mostly done | Keep |
| Accessibility `<title>` / `<desc>` / `role="img"` | Page `<title>` = page and purpose. Per-panel `<g role="group" aria-label="Panel 2 of 5: …">` in reading order | Partly: `role="img" aria-label=…` on the root (`render.ts:275`); text is live `<text>` (good); no `<title>`/`<desc>`, no per-panel labels | **Adopt (P2)** |
| Test the silhouette (not in the skill) | Cast members must be told apart by silhouette | A sheet exists (`human-cast.png`): the seamstress, the soldier and the young playwright have similar silhouettes | **Adopt (P1)**: automated test = silhouette IoU at the same scale; warn above 0.8 in `validateUnderstanding` |

Proposed minimum sizes (ours, derived from the 1000-unit page and a 390 px phone showing the page
at 0.39×, or about 2× that in guided view):

- A **speaking** figure's head radius is at least 22 units (about 8.6 CSS px when the whole page is
  shown on a phone). Below that, warn that the speaker is too small to read as the speaker.
- A readable **expression** needs a head radius of at least 30 units. Below that, render at LOD1:
  eyes and mouth only.
- The main prop in an **insert** covers at least 35% of the panel's short side. Any other prop is
  at least 40 units.
- Actual figure heights by shot should match `SHOT_GUIDE`: establishing 20-25%, wide about 40%,
  full about 75%. On page 6 p1 the figure is about 7-8%, so the guide is not enforced.

---

## (f) Renderer critique and prioritised improvements

### Gallery critique (Happy Prince fixture, pages 1-6)

| Page | What works | Problems (evidence) |
|---|---|---|
| 1 | A clean establishing → full → close progression; the balloons read in order; the split line gives a good comic pause | **The statue stands at street level, and the column in p1 is empty** (a continuity error that breaks the story). The cobblestone texture is patchy (p1 lower half). A stray cloud or bubble fragment sits under the narration box (p2). A clipped shape at the right edge of p3. The tail runs into the speaker's top hat. The mayor speaks a line that belongs to a Town Councillor in Wilde, and the line is labelled `dramatized` although it is near-verbatim |
| 2 | The flashback border reads as a flashback; the close-up's heart eyes are clear | **Tone mush in p1**: flashback tone, dotted foliage and a dotted ground all at once, so the tiny swallow (about 4% of panel height) is lost. p3's balloon runs to 6 lines of 2 words in a narrow ellipse, with a long tail to a tiny speaker |
| 3 | A good night establishing shot with speed lines; the extreme close-up of tears with "PLIP" is a strong reveal | **Blockage**: p2 and p3 are stacked beside the tall p4. Tree order is p2 → p3 → p4, but newcomers will read p2 → p4 → p3 (A2.2). The thought cloud in p2 sits over the prince's body while its trail runs to a tiny swallow. **The statue is at street level again.** `angle: "low"` in p2 does not read, because figures are only scaled 1.05× (`scene/compose.ts:111-124`) |
| 4 | Sapphire eyes carry over; off-panel tails; the insert of the ruby | Dots cover all three right-hand panels. The sweat drops in p3 float large and detached from the face. p1's dialogue narrates what p2 shows (redundant words). The boy lies on the floor beside an empty bed |
| 5 | Good rhythm: flight → insert → reaction → dialogue → close | **The ruby and the sapphire (page 6) are the same white diamond.** The swallow's close-up in p5 is an unreadable disc with a bar across it. The narration "A good deed…" is editorial (correctly labelled `metaphor`, but it is commentary the book does not make at that point) |
| 6 | A three-beat middle row is good rhythm; "Winter was coming" makes a good closing panel | The young man in the establishing shot is about 7% of the panel's height. Heavy dots on the roof and floor. The swallow is drawn from behind in a close shout (`facing: back`) and reads as a black blob. "SWOOP" covers the subject of the insert |

Sheets. Human poses are readable, but the body language is stiff: the head is always upright and
the torso never leans. There are 18 human expressions, clear at 3/4 view. The environments are
good and coherent. The FX sheet shows the problem: `flashback` puts dot tone on the figures as
well as the background (`dark_mood` leaves the figures white, as it should). The cast lineup and silhouettes show three similar mid-height profiles.

### Prioritised improvements

Priority reflects each item's effect on the rubric in (g).

**P0: legibility and story truth**

1. **Figure–ground and tone discipline.** (a) Never put pattern tone behind a speaking head: the
   area within 1.5 head radii of a speaker is white or flat light grey. (b) Pattern tone covers at
   most about 35% of a panel's area. (c) `flashback` and `dark_mood` tone the background and
   border, never the figures. (d) A paper-white knockout rim of 3-5 units under figure and prop
   outlines. (e) A render option `tone: "pattern" | "flat"`, with flat greys used for thumbnails,
   previews and page-fit view on phones (moiré advice in [S12, S13]).
   *Check:* a new validator metric, `tone_area_ratio` per panel, plus a head-halo test; gallery
   pages 2, 4 and 6 re-scored for legibility.
2. **Simplify the background by shot** [S21]. `close` draws the environment at about 50% line
   weight with no pattern tone and no detail. `extreme_close` draws white, focus lines or a flat
   tone. `medium` reduces detail by one step. `establishing` and `wide` stay full.
   *Check:* the per-panel path count drops in close shots; faces pop at phone size.
3. **Staging anchors and scale continuity** (contract plus renderer). Add an optional
   `FigureSpec.on`, meaning "stands or perches on", taking either a feature (for example
   `statue_column`) or another figure's character id with a part (`feet`, `shoulder`, `hand`). A
   `statue_column` feature draws any cast member whose `material` is not flesh on top when that
   cast member is in the location's cast and not placed elsewhere. Add a per-kind scale table so a
   swallow is always about 0.12× a standing adult's height unless the shot isolates it.
   *Check:* page 1's establishing shot shows the statue on the column; pages 3 and 5 show the
   swallow at the statue's feet and on its shoulder.
4. **A readable-size floor and LOD.** Warn when a speaking figure's head radius is under 22 units
   (section e). Enforce `SHOT_GUIDE` figure heights at ±25%. Add LOD tiers by head radius (≥ 30
   full face, 18-30 eyes and mouth, < 18 silhouette with a thicker outline).
5. **Reading-order safety.** Row gutter 24-28 and column gutter 10-12 (today both are 18). Warn
   (`BLOCKAGE_LAYOUT`) when a panel spanning two or more rows has a stack to its reading-earlier
   side (left in left-to-right reading, as in `stacked_to_tall_3` and gallery page 3), telling the writer that
   newcomers read across; allow it but prefer staggering. Add order numbers to the debug overlay.
6. **Phone legibility.** Raise the minimum speech size from 22 to 24 and prefer 28-30. On phones,
   guided panel view is the default. Report each text's effective CSS px at 390 px page-fit in the
   preview so the model sees it.

**P1: craft quality**

7. **Balloons:** one tail base width per page (the "O" width); tails stop at about 55% of the
   gap; balloons may butt or crop against panel borders; connected balloons when the same speaker
   has two in a panel; line breaking that avoids 1-2-word lines (widows); an aspect ratio cap on
   balloons (warn when lines exceed 5 at the chosen width); a thought trail that avoids other
   figures' bodies; a check that tails do not cross (A6.1-A6.9).
8. **Angles that read:** low and worms-eye move the horizon to knee level or below and apply a
   simple foreshortening (head 0.9×, legs 1.1×); high and birds-eye do the opposite. At eye level,
   the horizon passes through standing figures' eyes. Today only the environment's horizon moves
   (`env/index.ts:49-55`).
9. **Acting:** head tilt, torso lean and shoulder drop by expression (sad −10° with the head
   down, afraid leaning back 8°, angry leaning forward 6°, determined chin up). Warn on
   `facing: "back"` in `close` and `extreme_close`. Make the swallow's and other creatures' close-up
   faces legible (the eye-bar disc on page 5 p5).
10. **Prop identity:** `PropSpec` or `holding` gains a tone or variant (ruby = black with a white
    highlight; sapphire = mid tone), so key objects stay distinct across pages.
11. **SFX placement:** place SFX in the largest free area along the motion vector; never over an
    insert's subject or a face; allow SFX to cross the panel border when `impact_burst` or
    `speed_lines` is present.
12. **Page-turn-aware layout:** when `page_turn_hook` is true, the validator warns if the last
    panel is the largest. When the previous page had a hook, it warns if the first panel is under
    30% of the page area.

**P2: efficiency, accessibility and hygiene**

13. `<symbol>`/`<use>` for repeated environment parts and culling of clipped geometry (target
    < 100 KB of SVG per page).
14. `<title>`/`<desc>` and per-panel `role="group"` labels in reading order.
15. Artifact fixes: patchy cobbles (page 1 p1), stray fragments (page 1 p2), the edge clip (page 1
    p3).
16. An automated silhouette distinctness check for the cast (IoU at equal scale, warn above 0.8).
17. SHOT and TEXT guides in `catalog.ts` rewritten to match the skill proposals (for example,
    `wide` carries at most one short line).

---

## (g) Acceptance rubric: score each generated page from 1 to 5

**Ship bar:** no criterion below 3, **source fidelity at least 4**, **legibility at least 4**, and
a mean of at least 3.5. Score 2 or 4 when a page falls between the descriptors. Automated signals
from `RenderResult` and the spec are listed for each criterion; a person or the M3 vision pass
scores the rest from the rendered PNG at 800 px, plus a 390 px phone check.

| Criterion | 1 (fails) | 3 (acceptable) | 5 (excellent) | Automated signals |
|---|---|---|---|---|
| **Legibility** | Any text overflow or overlap; a balloon over a face or key prop; a panel whose subject cannot be found (lost in tone or too small); text under the kind's minimum | All text readable on desktop; at most 1-2 cramped balloons (5 or more lines, or over 25 words), or one panel where the subject competes with the background | Every panel's subject is found within about a second; every text sits at 24 units or more with balanced stacking; no tone behind speaking heads; the page reads on a 390 px phone in guided view and its text reaches 11 CSS px or more in panel view | issues `TEXT_DOES_NOT_FIT`, `font_px`, `words_max_panel`; the proposed `tone_area_ratio` and head-size checks |
| **Panel order and reading flow** | The order is ambiguous in a way that changes meaning (a reply can be read before its question, a reveal before its setup); crossed tails | The order can be recovered, but one junction makes the reader choose (blockage whose Z-reading still makes sense) or one balloon pair needs a second look | A first-time reader follows panels and balloons without thinking: clear tiers, balloons top-left to bottom-right in speaking order, no crossings | `order`; the proposed `BLOCKAGE_LAYOUT` and tail-crossing checks |
| **Speaker attribution** | Any line can be attributed to the wrong character; a speaker who cannot be identified or is not present without an off-panel setup | One balloon needs a second look (a long tail to a small speaker; an off-panel voice with weak setup) | Every tail points at the speaker's mouth from about halfway out; speakers are visible and large enough; any off-panel voice was established in the previous panel; thought, speech, whisper and shout are chosen correctly | speaker head radius, tail length ratio, `speaker` present in `figures` |
| **Character continuity** | A lapse that contradicts the story: the statue at street level when height matters, a wrong look, key props swapped or identical when the difference matters, a scale that implies a different creature | One noticeable but explainable lapse: a scale jump, a side swap mid-conversation, a pose that ignores the previous panel | Looks, scale, position, props and screen direction stay consistent across panels and with the previous page; staging facts from the source are respected | side-swap check (the 180° rule), `holding` persistence, staging anchors (proposed) |
| **Visual variety** | Every panel has the same shot size and panel size (a grid of talking heads), or the layout repeats the previous page without purpose | Two shot sizes dominate, or there is no clear dominant panel, but the page is not monotonous | At least 3 shot sizes on a page of 4 or more panels; no shot size three times in a row; one dominant panel (at least 35-40%) on the beat; angles used with meaning; the template differs from the previous page | shot histogram from the spec; the `REPEATED_LAYOUT` warning; the largest panel's share of the page |
| **Page-turn rhythm** | The page ends mid-action with no landing, or a planned hook is spent on this page (the answer is shown before the turn); a scene changes mid-row with no caption | The page ends acceptably, but the hook is weak or the payoff is buried mid-page | The last panel lands the beat or poses the hook (a small or medium pull panel); if the previous page hooked, the first panel pays it off large; scene changes open the page with a caption | `page_turn_hook` against last-panel size and first-panel size (proposed) |
| **Source fidelity** | Any invented fact presented as the book's; a mislabelled quote; a wrong speaker for a quoted line; a planned `core` claim missing | All assigned claims are conveyed; one paraphrase drifts in nuance or one fidelity label is debatable; no factual error | Every text carries the right `fidelity`; quotes are verbatim with correct attribution; dramatised lines act out facts in the source; metaphors are labelled and followed by the literal claim; every panel cites its source | claims-to-text coverage; the `fidelity` distribution; source refs present |
| **Conveys its beat without a prose wall** | More than 120 words, or the beat exists only in narration boxes over generic figures (illustrated prose) | The beat is clear but carried mostly by narration (narration is 50% or more of the words), or a caption restates what the picture shows | Someone who has not read the book can state the beat from the pictures plus 90 words or fewer; pose, expression and FX carry the action and emotion; narration appears only for what cannot be drawn | `words_total`; narration share; captions per panel |

**Baseline: the gallery fixture scored with this rubric** (my assessment). The fixture was written
by hand to exercise the renderer, so these scores measure the renderer more than the model.

| Page | Legib. | Order | Speaker | Contin. | Variety | Turn | Fidelity | Beat | Mean | Passes |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4 | 5 | 4 | 2 | 4 | 3 | 3 | 4 | 3.6 | no (continuity, fidelity) |
| 2 | 2 | 5 | 3 | 3 | 4 | 3 | 5 | 4 | 3.6 | no (legibility) |
| 3 | 3 | 3 | 3 | 2 | 5 | 4 | 5 | 4 | 3.6 | no (continuity, legibility) |
| 4 | 3 | 4 | 4 | 3 | 4 | 3 | 4 | 3 | 3.5 | no (legibility) |
| 5 | 4 | 5 | 4 | 3 | 5 | 3 | 4 | 4 | 4.0 | yes |
| 6 | 3 | 5 | 3 | 3 | 5 | 4 | 5 | 4 | 4.0 | no (legibility) |

P0 items 1-4 in (f) address every failing cell except page 1's fidelity (a fixture attribution
error, which is a data problem).

---

## (h) Sources and access notes

All URLs were accessed on 2026-09-25. No page images, dialogue or characters from any
copyrighted work are reproduced in this document.

| Tag | Source | Access note |
|---|---|---|
| S1 | Ellen McGinty, "The Manga Toolbelt for Fiction Writers", Go Teen Writers, 31 Jan 2024. https://goteenwriters.com/2024/01/31/the-manga-toolbelt-for-fiction-writers/ | Supplied by the owner; **fetched successfully**. General fiction craft (kishōtenketsu, character establishment, the one-sentence hook). Few numbers |
| S2 | Buzz Dixon, "A Few Rough Rules of Thumb for Writing Comics / Graphic Novels". https://buzzdixon.com/home/writing-2/a-few-rough-rules-of-thumb-for-writing-comics-graphic-novels | Fetched. The page shows the date "July 26" with no year |
| S3 | Dark Horse Comics, "Script format and specifications" (script guide PDF, 2 pp.). https://images.darkhorse.com/darkhorse08/company/submissions/scriptguide.pdf | Fetched; text extracted with `pdftotext` |
| S4 | Nate Piekos / Blambot, "Better Letterer" tips #001-#024. https://blambot.com/pages/lettering-tips | The page carries 24 infographic images and no text. The images were downloaded to the scratchpad and read |
| S5 | Blambot, "Comic Book Grammar & Tradition". https://blambot.com/pages/comic-book-grammar-tradition | Fetched |
| S6 | Evan Waterman, lettering guide, "General Tips". https://evanjwaterman.com/guide/lettering/general-tips/ | Fetched |
| S7 | Scott McCloud, *Understanding Comics* (1993) and *Making Comics* (2006) | Books not read in this session. Concepts (the six transitions, the Kirby percentages, the five choices) confirmed through EBSCO Research Starters and Wikipedia summaries found by search |
| S8 | Neil Cohn (2013), "Navigating comics: an empirical and theoretical approach to strategies of reading comic page layouts", *Frontiers in Psychology*. https://pmc.ncbi.nlm.nih.gov/articles/PMC3629985/ | Full text fetched (PMC) |
| S9 | Cohn & Campbell (2015), "Navigating Comics II: Constraints on the reading order of comic page layouts", *Applied Cognitive Psychology*. https://www.visuallanguagelab.com/P/NCHC_pagelayouts2.pdf | Author PDF fetched; text extracted |
| S10 | Cohn, Taylor-Weiner & Grossman (2012), "Framing attention in Japanese and American comics", *Frontiers in Psychology* 3:349 | Abstract only (Visual Language Lab post, search results). No percentages used |
| S11 | GlobalComix, "Creator Tips and Tricks #11: The Art of the Page Turn". https://globalcomix.com/news/details/270/creator-tips-and-tricks-11-the-art-of-the-page-turn | Fetched. The source of the *hiki-goma* / *mekuri-goma* terms |
| S12 | GlobalComix, "Creator Tips and Tricks #15: Screen Tones". https://globalcomix.com/news/details/317/creator-tips-and-tricks-15-screen-tones | Fetched. Flat grey online, because of moiré |
| S13 | Cyfuko, "An Ultimate Guide to Screentones", Clip Studio Tips. https://tips.clip-studio.com/en-us/articles/6198 | Fetched. 50-60 LPI for print; turn the tone effect off for online export |
| S14 | S-Morishita Studio, "What Font Size do Webtoon Artists Use?", which cites LINE Webtoon's 18-24 px guidance. https://www.s-morishitastudio.com/what-font-size-do-webtoon-artist-use/ | Fetched. LINE's own page was not fetched (a secondary citation) |
| S15 | Matteo Farinella (2018), "The potential of comics in science communication", *JCOM* 17(01) Y01. https://jcom.sissa.it/article/pubid/JCOM_1701_2018_Y01/ | Fetched |
| S16 | Harp & Mayer (1998), "How seductive details do their damage", *Journal of Educational Psychology* | ERIC abstract and search summaries (https://eric.ed.gov/?id=EJ576496); full text not read |
| S17 | Mayer's multimedia principles (spatial contiguity, coherence, redundancy); Ginns (2006) meta-analysis | Through search summaries only; neither primary text was read. Treat as background |
| S18 | The Manga Guides (Ohmsha / No Starch Press). https://en.wikipedia.org/wiki/The_Manga_Guides ; https://nostarch.com/releases/manga_all.html | Fetched (secondary descriptions) |
| S19 | Christopher Roosen, "Larry Gonick, The Cartoon Guides and the Art of Visually Communicating Complex Information" (2021). https://www.christopherroosen.com/blog/2021/8/29/larry-gonick-cartoon-guides-visually-communicating-complex-information ; MediaSmarts interview (search summary) | Blog fetched; the interview seen only in a search summary |
| S20 | "Kishōtenketsu", Wikipedia | Seen through search summaries |
| S21 | One Piece #1192 and #1193 (Eiichiro Oda, Shueisha), official English edition on MANGA Plus. https://mangaplus.shueisha.co.jp/titles/100020 (viewer 1030379, 1030380) | **Officially free latest chapters**, studied in the browser with the cookie banner declined. Nothing saved or copied. Counts are by eye |
| S22 | VIZ, One Piece chapter 1187. https://www.viz.com/shonenjump/one-piece-chapter-1187/chapter/50692 ; release date from a Yahoo Entertainment preview (search result) | VIZ shows "Join to read" (subscription). Release date 5 July 2026 |
| S23 | HyperFrames, `github.com/heygen-com/hyperframes` @ `fbaa9f9` (2026-09-25), Apache-2.0 | Shallow clone into the scratchpad with LFS skipped. Read the README, `packages/player`, `packages/core/package.json` and `docs/concepts/determinism.mdx` |
| S24 | npm registry metadata for `@hyperframes/player` and `@hyperframes/core` (0.8.77) | `npm view` (read-only) |
| S25 | "SVG Logo Designer" skill (rknall/claude-skills), local copy at `Book-Reel-scratch/research/svg-logo-designer-SKILL.md` | Read in full |
| S26 | PanelSummary renderer (`packages/manga-render`, 0.1.0), the gallery and sheets in the session scratchpad (`render/gallery/page-1..6.png`, `render/sheets/*.png`) | Read locally |
| S27 | W3C WCAG 2.2, Success Criterion 2.3.3 "Animation from Interactions"; the CSS `prefers-reduced-motion` media query | Standard references, not fetched in this session |

Not used: Hirohiko Araki's *Manga in Theory and Practice*. Only book blurbs and a wiki stub were
reachable, and they held no specific guidance. Several SEO-style "guide" sites turned up by search
(multic.com, comicory.com, jenova.ai, benargon.com) were not used as sources.
