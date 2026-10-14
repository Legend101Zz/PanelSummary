# D1: Diagnosis of issue #81 (closed drawing vocabulary on unseen books)

Date: 2026-10-14. Code read: worktree `Book-Reel-worktrees/v03-plan` (release/v0.3 at 185526a), read only. Evidence: the five exports under `Book-Reel-scratch/v02/`. No app was started. No model call was made. The code was not changed.

## 0. Scope and method

Question: for each wrong cast member, place and key prop that the judges name, where did it go wrong?

Four classes:

- **U** The understanding chose a wrong look, kind, species or backdrop although a fitting item exists in the vocabulary (or left out a place it should have listed).
- **V** The vocabulary has no item for it. The nearest item was chosen, or nothing was drawn.
- **R** The renderer drew a valid item badly (a rig that reads as another animal, a scale problem).
- **P** The plan or the page writer dropped or replaced it. It was right in the understanding and wrong on the page.

Each item has one primary class. A second cause is written in the "also" column.

Evidence used (all paths are under `Book-Reel-scratch/v02/`):

| Short name | Directory | Book | Code | Understanding skill | Pages | Judge-pages |
|---|---|---|---|---|---|---|
| run6 | `live/run6` | Just So Stories | v0.2 | 1.9.0 | 34 | 102 |
| FJ1 | `final-journey` | Just So Stories | v0.2 | 1.9.0 | 35 | 105 |
| FJ2 | `final-journey-2` | Just So Stories | v0.2.0 | 1.9.0 | 29 | 87 |
| v0.1.0 | `v01-holdout` | Just So Stories | v0.1.0 | 1.7.0 | 30 | 90 |
| Cheese | `cheese` | Who Moved My Cheese? (private) | v0.2.0 | 1.9.0 | 44 | 132 |

A judge-page is one page judged by one of the three judges. Files read in each directory: `export/understanding.json`, `export/plan.json`, `export/judge/page-NN.json` (the page spec, the page warnings), `export/receipts.json`, `judgments.json`, `aggregate.md`. The page images `export/judge/page-NN.png` were looked at for five pages (Cheese 1 and 9, v0.1.0 1, FJ1 1, FJ2 6).

### How the counts are made (read this before you trust a number)

1. A defect counts only when its severity is `blocker` or `major`. Minor defects are not counted (one minor defect is quoted where it is the only evidence).
2. The judges write free text. To find the defects that name an item, I used one regular expression for each item. The expressions are in `final_table.py` and `gen_tables.py` in the scratch directory. I read every hit for the Cheese items and for the doubtful Just So items, and I removed the hits that are about something else. The removed hits are listed in `gen_tables.py` (`EXCLUDE`). The count is therefore a measured count of the judge text, not a hand count of all defects. The issue text gives Cheese numbers from another classifier: "cheese drawn as bread on 4 pages (12 judge-pages)" is the same as mine (4 pages, 12 judge-pages). For the Maze the issue says 9 pages (18 judge-pages). My strict count is 7 pages (15 judge-pages). A looser expression ("maze" anywhere) gives 10 pages (19 judge-pages).
3. One defect can name two items (for example "Station C is a bedroom and the cheese is bread"). The judge-page counts of two items can overlap. Do not add the judge-page counts of different items to get a number of defects.
4. "Spec pages" is an exact count from the page specs: the number of pages with at least one panel that uses the item (the cast member in a figure, the location in a panel, the prop in `props` or `holding`).
5. An "item-run" is one item in one export. The Just So Stories book has four exports, so the same wrong item can count in up to four item-runs. The Cheese book has one export.

Not found in the judge text: the issue says that the mice read "as an owl or a bear". The judges of the Cheese run say "rats/bears rather than mice" once (page 1, judge 3, minor). The word "owl" is in no Cheese defect. The owl is in the Just So Stories book (the Bat is drawn as an owl, and Kolokolo Bird reads as an owl).


## 1. Summary

Counts are item-runs (see section 0). Each class cell shows the total, then (cast/place/prop).

| Export | Items | U | V | R | P |
|---|---|---|---|---|---|
| run6 | 18 | 2 (1/1/0) | 15 (8/3/4) | 1 (1/0/0) | 0 (0/0/0) |
| FJ1 | 18 | 2 (1/1/0) | 16 (9/2/5) | 0 (0/0/0) | 0 (0/0/0) |
| FJ2 | 22 | 2 (1/1/0) | 17 (9/3/5) | 2 (2/0/0) | 1 (0/1/0) |
| v0.1.0 | 18 | 0 (0/0/0) | 17 (9/3/5) | 1 (1/0/0) | 0 (0/0/0) |
| Cheese | 12 | 1 (1/0/0) | 10 (1/4/5) | 0 (0/0/0) | 1 (0/1/0) |
| **Just So Stories, all 4 exports** | 76 | 6 (3/3/0) | 65 (35/11/19) | 4 (4/0/0) | 1 (0/1/0) |
| **Cheese** | 12 | 1 (1/0/0) | 10 (1/4/5) | 0 (0/0/0) | 1 (0/1/0) |
| **Both books** | 88 | 7 (4/3/0) | 75 (36/15/24) | 4 (4/0/0) | 2 (0/2/0) |

Distinct items (the same item in several Just So exports counts once):

| Book | Items | U | V | R | P |
|---|---|---|---|---|---|
| Just So Stories | 24 | 2 (1/1/0) | 18 (9/3/6) | 3 (3/0/0) | 1 (0/1/0) |
| Cheese | 12 | 1 (1/0/0) | 10 (1/4/5) | 0 (0/0/0) | 1 (0/1/0) |

Judge-pages per class (sum over items, so a judge-page that names two items counts twice):

| Book | U | V | R | P |
|---|---|---|---|---|
| Just So Stories (4 exports) | 28 | 350 | 8 | 2 |
| Cheese | 1 | 72 | 0 | 4 |

Per object type, both books (item-runs / judge-pages):

| Type | Just So Stories | Cheese |
|---|---|---|
| cast | 42 / 264 | 2 / 6 |
| place | 15 / 71 | 5 / 35 |
| prop | 19 / 53 | 5 / 36 |


Reading of the summary:

- **V is the main cause.** 75 of 88 item-runs (85%) are V: the vocabulary has no item, so the understanding or the page writer chose the nearest item (or nothing was drawn). U is 7 (8%), R is 4 (5%), P is 2 (2%).
- **U is small and specific.** Three kinds: (1) the mice of the Cheese book are `rat` although `mouse` exists; (2) the elephants' relatives are a `crowd` of people although the skill says that a group of animals is one animal member (3 exports); (3) the place list of the Just So section 3 has no place for "outside the Cave" (3 exports).
- **R is small.** The renderer drew a valid item in a way that reads as another animal: the horse seen from the front reads as a kangaroo (FJ2 page 6); the Wild Dog reads as a bear (FJ2 page 21, v0.1.0 page 23); Kolokolo Bird (`crow`) reads as an owl (run6 page 10). R is also a second cause for the Hippopotamus (FJ2: the raised bear arm reads as a trunk), the mice (the rat in the `sit` pose is as upright as a bear, `quad.ts:121`), the size of the Little people and the Maze (the `abstract` backdrop is blank).
- **P is rare.** Two: the Cheese plan puts the four parable characters in the Chicago lunch room (page 2), and the FJ2 plan puts the Python on the road, not on the river bank (page 8). P is also a second cause in 5 item-runs: the KEY_PROP_NOT_DRAWN check asks for a `sword` when a claim says "blade-bone" (4 exports, section 3.5), and the Cheese plan has no location on page 1 (the Maze).
- **Cast is the biggest group on Just So Stories** (42 of 76 item-runs, 264 of 388 judge-pages). **Places and props are the biggest groups on Cheese** (5 and 5 of 12 items; 71 of 77 judge-pages).

## 2. Per-item trace table

Columns: item; export; spec pages (pages where the stand-in is on the page, exact); judge pages (pages with a blocker or major defect that names the item) and the number of judge-pages; class (primary, then "also"); evidence (file, field, value). `U.json` is `export/understanding.json` of that export.

| Item | Export | Type | Spec pages | Judge pages (n) | Class | Evidence |
|---|---|---|---|---|---|---|
| Baboon | run6 | cast | 2 | 1,10 (3) | V | `U.json` cast[c_baboon].look=animal/dog |
| Baboon | FJ1 | cast | 3 | 1,2,11 (5) | V | `U.json` cast[c_baboon].look=animal/dog |
| Baboon | FJ2 | cast | 2 | 9 (3) | V | `U.json` cast[c_baboon].look=animal/fox |
| Baboon | v0.1.0 | cast | 2 | 1,9 (4) | V | `U.json` cast[c_baboon].look=animal/fox |
| Bat | run6 | cast | 2 | 29 (3) | V | `U.json` cast[c_bat].look=animal/mouse |
| Bat | FJ1 | cast | 1 | 29 (3) | V | `U.json` cast[c_bat].look=bird/owl |
| Bat | FJ2 | cast | 2 | 25 (3) | V | `U.json` cast[c_bat].look=bird/owl |
| Bat | v0.1.0 | cast | 1 | 26 (2) | V | `U.json` cast[c_bat].look=bird/owl |
| Crocodile | run6 | cast | 5 | 4,5,6,7,9,11 (15) | V | `U.json` cast[c_crocodile].look=animal/fish |
| Crocodile | FJ1 | cast | 4 | 4,5,6,7 (9) | V | `U.json` cast[c_croc].look=animal/lizard |
| Crocodile | FJ2 | cast | 4 | 4,5,6,10 (8) | V | `U.json` cast[c_crocodile].look=animal/fish |
| Crocodile | v0.1.0 | cast | 3 | 4,5,6 (8) | V | `U.json` cast[c_crocodile].look=animal/fish |
| Elephant relatives (crowd) | run6 | cast | 3 | 2,10,11 (8) | U (also V) | `U.json` cast[c_elephant_families].look=crowd/townsfolk/many |
| Elephant relatives (crowd) | FJ1 | cast | 1 | 10 (2) | U (also V) | `U.json` cast[c_brothers].look=crowd/children/few |
| Elephant relatives (crowd) | FJ2 | cast | 4 | 2,3,9,10 (10) | U (also V) | `U.json` cast[c_elephants].look=crowd/townsfolk/many |
| Elephant's Child | run6 | cast | 10 | 1,2,7,8,9,10,11 (17) | V | `U.json` cast[c_elephant_child].look=animal/horse |
| Elephant's Child | FJ1 | cast | 11 | 1,2,3,4,5,6,7,8,9,10,11,30 (33) | V | `U.json` cast[c_ec].look=human/child/height=giant/outfit=underclothes |
| Elephant's Child | FJ2 | cast | 9 | 1,2,3,4,5,6,7,8,9,10 (21) | V | `U.json` cast[c_elephant_child].look=animal/horse |
| Elephant's Child | v0.1.0 | cast | 10 | 1,2,4,5,6,7,8,9,10 (20) | V | `U.json` cast[c_elephant_child].look=human/child/height=giant/outfit=rags |
| Elephant's Child (horse, front view) reads as another animal | FJ2 | cast | 9 | 6 (3) | R | `U.json` cast[c_elephant_child].look=animal/horse |
| Giraffe | run6 | cast | 1 | 1 (3) | V | `U.json` cast[c_giraffe].look=animal/horse |
| Giraffe | FJ1 | cast | 3 | 1,2,11 (6) | V | `U.json` cast[c_giraffe].look=animal/horse |
| Giraffe | FJ2 | cast | 1 | 1 (2) | V | `U.json` cast[c_giraffe].look=animal/horse |
| Giraffe | v0.1.0 | cast | 4 | 1,3,9,10 (9) | V | `U.json` cast[c_giraffe].look=animal/horse |
| Hippopotamus | FJ1 | cast | 4 | 1,2,10,11 (6) | V | `U.json` cast[c_hippo].look=animal/bear |
| Hippopotamus | FJ2 | cast | 1 | 1 (3) | V (also R) | `U.json` cast[c_hippopotamus].look=animal/bear |
| Hippopotamus | v0.1.0 | cast | 2 | 1,10 (4) | V | `U.json` cast[c_hippopotamus].look=animal/bear |
| Kolokolo Bird reads as owl | run6 | cast | 2 | 10 (2) | R | `U.json` cast[c_kolokolo].look=bird/crow |
| Ostrich | run6 | cast | 1 | 1 (3) | V | `U.json` cast[c_ostrich].look=bird/dove |
| Ostrich | FJ1 | cast | 3 | 1,2 (5) | V | `U.json` cast[c_ostrich].look=bird/dove |
| Ostrich | FJ2 | cast | 1 | 1 (1) | V | `U.json` cast[c_ostrich].look=bird/dove |
| Ostrich | v0.1.0 | cast | 2 | 9,10 (3) | V | `U.json` cast[c_ostrich].look=bird/duck |
| Python-Rock-Snake | run6 | cast | 4 | 3,7,8,9 (7) | V | `U.json` cast[c_python].look=animal/lizard |
| Python-Rock-Snake | FJ1 | cast | 5 | 3,6,7,8 (5) | V | `U.json` cast[c_python].look=animal/lizard |
| Python-Rock-Snake | FJ2 | cast | 5 | 4,5,6 (3) | V | `U.json` cast[c_python].look=animal/lizard |
| Python-Rock-Snake | v0.1.0 | cast | 4 | 4,6,8 (7) | V | `U.json` cast[c_python_rocksnake].look=animal/lizard |
| Wild Cow | run6 | cast | 1 | 26 (3) | V | `U.json` cast[c_cow].look=animal/bear |
| Wild Cow | FJ1 | cast | 2 | 26,27 (6) | V | `U.json` cast[c_wildcow].look=animal/horse |
| Wild Cow | FJ2 | cast | 1 | 23 (1) | V | `U.json` cast[c_wild_cow].look=animal/horse |
| Wild Cow | v0.1.0 | cast | 1 | 24 (2) | V | `U.json` cast[c_cow].look=animal/horse |
| Wild Dog reads as bear | FJ2 | cast | 4 | 21 (2) | R | `U.json` cast[c_wild_dog].look=animal/dog |
| Wild Dog reads as bear | v0.1.0 | cast | 3 | 23 (1) | R | `U.json` cast[c_dog].look=animal/dog |
| 'Outside the Cave' beat drawn in the interior place | run6 | place | 9 | 30 (3) | U (also V) | `U.json` locations[l_cave_interior].environment=room_poor features=['fireplace', 'bed', 'door'] |
| 'Outside the Cave' beat drawn in the interior place | FJ1 | place | 1 | 29 (2) | U (also V) | `U.json` locations[l_cave_home].environment=room_poor features=['door', 'fireplace'] |
| 'Outside the Cave' beat drawn in the interior place | FJ2 | place | 10 | 26 (3) | U (also V) | `U.json` locations[l_cave_interior].environment=room_poor features=['fireplace', 'door'] |
| Cave (inside) | run6 | place | 9 | 23,25,31 (6) | V | `U.json` locations[l_cave_interior].environment=room_poor features=['fireplace', 'bed', 'door'] |
| Cave (inside) | FJ1 | place | 14 | 17,23,24,25,26,30,31 (17) | V | `U.json` locations[l_cave_home].environment=room_poor features=['door', 'fireplace']; locations[l_cave_interior].environment=room_poor features=['fireplace', 'door', 'bed'] |
| Cave (inside) | FJ2 | place | 10 | 20,21,25 (7) | V | `U.json` locations[l_cave_interior].environment=room_poor features=['fireplace', 'door'] |
| Cave (inside) | v0.1.0 | place | 10 | 21,22,25 (6) | V | `U.json` locations[l_s3_cave].environment=room_poor features=['fireplace', 'bed', 'table', 'door'] |
| Cave (outside) | run6 | place | 3 | 12,17,18 (8) | V | `U.json` locations[l_cave_s2].environment=cottage features=['door', 'fireplace'] |
| Cave (outside) | FJ2 | place | 3 | 15,19 (5) | V | `U.json` locations[l_cave].environment=cottage features=['door', 'fireplace'] |
| Cave (outside) | v0.1.0 | place | 2 | 11,15,21 (7) | V | `U.json` locations[l_cave_home].environment=cottage features=['fireplace', 'table', 'door'] |
| Python staged on the road, not the river bank | FJ2 | place | 1 | 8 (2) | P | `plan.json` pages[8].locations=[l_africa_woodland] but the claim is on the Limpopo bank |
| wait-a-bit thorn-bush | run6 | place | 0 (not drawn) | 2 (1) | V | no thorn-bush in ENVIRONMENTS or ENV_FEATURES; meadow+trees used |
| wait-a-bit thorn-bush | FJ1 | place | 0 (not drawn) | 2,11 (2) | V | no thorn-bush in ENVIRONMENTS or ENV_FEATURES; meadow+trees used |
| wait-a-bit thorn-bush | FJ2 | place | 0 (not drawn) | 3 (1) | V | no thorn-bush in ENVIRONMENTS or ENV_FEATURES; meadow+trees used |
| wait-a-bit thorn-bush | v0.1.0 | place | 0 (not drawn) | 2 (1) | V | no thorn-bush in ENVIRONMENTS or ENV_FEATURES; meadow+trees used |
| birch-bark picture-letter | run6 | prop | 2 | 22 (1) | V | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: letter |
| birch-bark picture-letter | FJ2 | prop | 1 | 18 (1) | V | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: letter |
| birch-bark picture-letter | v0.1.0 | prop | 2 | 14,15 (3) | V | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: letter |
| hornets' nest | FJ1 | prop | 0 (not drawn) | 11 (3) | V | no prop drawn (nothing in PROPS fits) |
| hornets' nest | FJ2 | prop | 0 (not drawn) | 9 (3) | V | no prop drawn (nothing in PROPS fits) |
| hornets' nest | v0.1.0 | prop | 0 (not drawn) | 9 (2) | V | no prop drawn (nothing in PROPS fits) |
| horse-skin curtain | run6 | prop | 0 (not drawn) | 23,30 (3) | V | no prop drawn (nothing in PROPS fits) |
| horse-skin curtain | FJ1 | prop | 0 (not drawn) | 23,30 (4) | V | no prop drawn (nothing in PROPS fits) |
| horse-skin curtain | FJ2 | prop | 0 (not drawn) | 20,26 (2) | V | no prop drawn (nothing in PROPS fits) |
| mutton blade-bone | run6 | prop | 1 | 23,31 (5) | V (also P) | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: sword |
| mutton blade-bone | FJ1 | prop | 2 | 24 (3) | V (also P) | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: sword |
| mutton blade-bone | FJ2 | prop | 1 | 21,23 (4) | V (also P) | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: sword |
| mutton blade-bone | v0.1.0 | prop | 2 | 22 (3) | V (also P) | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: sword |
| roasted mutton-bone | run6 | prop | 1 | 25 (2) | V | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: roast_goose/bread |
| roasted mutton-bone | FJ1 | prop | 1 | 25 (3) | V | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: roast_goose/bread |
| roasted mutton-bone | FJ2 | prop | 1 | 22 (2) | V | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: roast_goose/bread |
| roasted mutton-bone | v0.1.0 | prop | 1 | 23 (3) | V | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: roast_goose/bread |
| shark's-tooth spear | FJ1 | prop | 2 | 13 (3) | V | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: sword |
| shark's-tooth spear | v0.1.0 | prop | 2 | 11 (3) | V | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: sword |
| Hem and Haw (size of mice) | Cheese | cast | 24 | 2,3,7,8 (5) | V (also R) | `U.json` cast[c_hem].look=human/adult/height=short/outfit=tunic; cast[c_haw].look=human/adult/height=short/outfit=tunic |
| Sniff and Scurry (mice) | Cheese | cast | 9 | 24 (1) | U (also R) | `U.json` cast[c_sniff].look=animal/rat; cast[c_scurry].look=animal/rat |
| Cheese Station C | Cheese | place | 9 | 8,9,12,15 (7) | V | `U.json` locations[l_station_c].environment=room_poor features=['high_wall', 'door'] |
| Cheese Station N | Cheese | place | 5 | 12,24,25 (6) | V | `U.json` locations[l_station_n].environment=room_rich features=['high_wall', 'window'] |
| Story characters staged in the Chicago lunch room | Cheese | place | 5 | 2,3 (4) | P | `plan.json` pages[2].locations=[l_chicago_lunch]; the beat names the four parable characters |
| The Maze | Cheese | place | 12 | 1,7,8,15,17,18,28 (15) | V (also R,P) | `U.json` locations[l_maze].environment=abstract features=['high_wall', 'window'] |
| the huge empty Cheese Station (p19) | Cheese | place | 1 | 19 (3) | V | `plan.json` pages[19].locations=[l_maze] (no station place in the understanding) |
| Cheese | Cheese | prop | 5 | 1,8,23,25 (12) | V | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: bread |
| Haw's wall writing | Cheese | prop | 11 | 11,16,17,23,27 (9) | V | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: paper/sign |
| New Cheese | Cheese | prop | 2 | 12 (3) | V | `judge/page-NN.json` `spec.panels[].props[].prop` or `figures[].holding`: basket |
| cheese pile / pieces | Cheese | prop | 0 (not drawn) | 18,20,21,24,25 (9) | V | no prop drawn (nothing in PROPS fits) |
| chisel, hammer, hole in the wall | Cheese | prop | 0 (not drawn) | 14 (3) | V | no prop drawn (nothing in PROPS fits) |

## 3. Traces

All line numbers are in `Book-Reel-worktrees/v03-plan` (release/v0.3 at 185526a). `contracts.ts` is `packages/manga-render/src/contracts.ts`. `U.json` is `export/understanding.json` of the named export.

### 3.1 The Elephant's Child (full trace)

What the judges say. In v0.1.0 page 1 the Child is "a human boy" (FJ1, v0.1.0: the page image shows a boy with messy hair in a rag shirt, and the Giraffe is a checkered horse, the Hippopotamus a bear). In run6 and FJ2 the Child is "a dark horse". Both are wrong for an elephant. In the horse exports the judges say there is no trunk on any page (run6 pages 7 to 11, FJ2 pages 7 to 10), so the central change of the story (the nose becomes a trunk) cannot be shown.

Trace, step by step:

| Step | Where | What happens | Value |
|---|---|---|---|
| 1 | `apps/agent-worker/src/skills/book-understanding/SKILL.md:98-107` | The skill says: "`look` uses only the trusted vocabulary. Choose values in this order: 1. What the text says (... a bird -> `bird` with its species ...)". There is no step for "no item fits". Line 199: "every non-human's `description` gives its size relative to people". | text |
| 2 | `apps/agent-worker/src/goals/vocabulary.ts:6-37` and `book-understanding.ts:275` | The goal shows the model the closed vocabulary as the data block `trusted_vocabulary`: `animal: { species: ANIMAL_SPECIES, tone }`. The species are rat, mouse, cat, dog, fox, rabbit, frog, lizard, horse, bear, fish (`contracts.ts:250-262`). There is no elephant, no large grey quadruped, no neutral animal. | 11 species |
| 3 | `packages/manga-render/src/validate/look.ts:33-55 (LOOK_FIELDS), 57-90` | The look must exist and every field must be in the list (`FIELD_MISSING`, `ENUM_INVALID`). A free species is rejected. An extra key only gives a warning (`FIELD_UNKNOWN`, `validate/util.ts:123-129`). So the model must put an item from the list. | closed |
| 4 | `U.json` (run6) `cast[c_elephant_child].look` | `{"kind":"animal","species":"horse","tone":"dark"}`; description: "A small young elephant, smaller than his tall and broad grown-up relatives ... no trunk". Same in FJ2: `animal/horse/mid`. | horse |
| 4b | `U.json` (FJ1) `cast[c_ec].look` | `{"kind":"human","age":"child","build":"heavy","height":"giant","outfit":"underclothes","skin":"dark"...}`; description: "A small elephant ... his nose becomes a true trunk". v0.1.0: `human/child/giant/rags/masc`. The description says "elephant", the look says person. | human |
| 5 | `apps/agent-worker/src/goals/book-understanding.ts:116-143` (`lookSenseIssues`) | The only look-versus-description checks are: statue words, "giant" without `height: giant`, a `crowd` of listed animals (`:135`). Nothing compares the look kind with the species named in the description. The understanding was accepted: FJ1 receipt `tool_calls` = `submit_understanding errors=3 CROWD_NOT_PEOPLE(c_tribe),SPEAKER_NOT_IN_CAST,SPEAKER_ONE_OF_GROUP` then `revise_understanding accepted`. No error is about `c_ec`. | accepted |
| 6 | `export/plan.json`, `export/judge/page-NN.json` `spec.panels[].figures[]` | A figure is `{character:"c_ec", pose, expression, facing, slot, depth}`. The page spec has no look. The look always comes from the cast. | no look on the page |
| 7 | `packages/manga-render/src/scene/compose.ts:566-575` | `castWithVariant(base, spec.variant)` (`scene/looks.ts:59`; `resolveCastLook`, `:51`, has only a firework fix) then `safeDraw(cast.look, ...)` (`compose.ts:2181-2200`). | no species logic |
| 8 | `packages/manga-render/src/rig/index.ts:22-32, 34-38` | `RIGS[look.kind]` is a fixed map: human, crowd, bird, animal, insect, object, plant, spirit, emblem. The kind alone chooses the rig. | rig by kind |
| 9a | `rig/animal.ts:16-28, 36-67`, `rig/creature/quad.ts:73, 80` | `horse`: nominal height 160, a quadruped with mane and hooves, 9 poses (stand, walk, run, jump, lie, talk, bow, hold, fall; no sit). No trunk exists in any rig. In the front close-up (FJ2 page 6, panel 4) the horse face reads as a kangaroo or koala with glasses (R). | horse |
| 9b | `rig/human/look.ts:9-13`, `rig/human/draw.ts` | `child` 64 x `giant` 2.6 = nominal height 166. The human rig draws a child in rags or underclothes. | boy |
| 10 | `scene/compose.ts:253, 591` | `SMALL_KINDS = {bird, insect, animal}`: every animal figure, also a 160-high horse, is `small: true` in the camera code (see 3.9). | small |

Class: V (there is no item for an elephant, so two exports chose the nearest "big animal" and two chose a person). Second observation: nothing in the pipeline reads the `description` against the look. Also R in FJ2 page 6 (3 judge-pages).

Counts for this item: spec pages 10 (run6), 11 (FJ1), 9 (FJ2), 10 (v0.1.0); judge pages 7 / 12 / 10 / 9; judge-pages 17 / 33 / 21 / 20.

Why a person in two of four exports: the model must fill every look field and cannot say "elephant". With `human` it can set `height: giant` (the only way to say "much bigger than a person", factor 2.6, `look.ts:10`), but then it gets a boy. With `animal` it can choose only among 11 species. The choice between these two is not stable between runs (the same book and skill gave horse, human, horse, human). That is the sign of a vocabulary gap, not of a wrong choice in one run.

### 3.2 The mice of the Cheese book (rat)

- `cheese/export/understanding.json` `cast[c_sniff].look` = `{"kind":"animal","species":"rat","tone":"mid"}`; `cast[c_scurry].look` = `animal/rat/dark`. Their role text says "the mouse who sniffs out change early" and "the mouse who scurries into action".
- The vocabulary has `mouse` (`contracts.ts:252`, `rig/creature/quad.ts:68`). The issue says "the mice map to `species: rat` (the closest item)". That is not correct: `mouse` is in the list. The model chose `rat` although `mouse` exists. Class **U**.
- What `rat` and `mouse` draw (`quad.ts:67-68`): rat height 13, ears 2.1 (round), tail 17. Mouse height 11, ears 3.0, tail 12. The two are close. The R cause: in the `sit` pose rat, mouse, bear and rabbit use the same upright spine (`quad.ts:121`: `upright = sp === "rat" || sp === "mouse" || sp === "bear" || sp === "rabbit"`), so the sitting rat on page 9 (panel 4) has a round bear-like body (image checked). The judges: page 1 judge 3 (minor) "drawn as rats/bears rather than mice"; page 24 judge 1 (blocker) "Sniff is a rat on the floor edge".
- The first understanding submission of the Cheese run was rejected with `ENUM_INVALID(c_hem.look|c_haw.look)` (`cheese/export/receipts.json`, BOOK_UNDERSTANDING, `tool_calls[0].note`). The value that the model tried is not recorded. The accepted understanding has `human/adult/short` for both. It shows that the model first tried a value outside the list for the Little people, and the closed list sent it back to a nearest item (see 3.8).

### 3.3 The cave (modern room, cottage)

- The understanding maps the cave to two kinds of place. Outside: `environment: cottage` (run6 `l_cave_s2`, FJ2 `l_cave`, v0.1.0 `l_cave_home`; features door, fireplace). Inside: `room_poor` (all four; features fireplace, door, and `bed` in run6, FJ1 and v0.1.0). In FJ1 both are `room_poor`. There is no cave in `ENVIRONMENTS` (`contracts.ts:384-419`). The skill (`SKILL.md:161`) says "mapped to the closest `environment`". Class **V**.
- What the two environments draw: `cottage` (`env/scenes-town.ts:574-626`) is a thatched house with a chimney, smoke, a garden path and a picket fence (`picketFence`, `:604-605`). That is the "suburban cottage" of the judges (all 7 cottage judge-pages of run6, on pages 12, 17 and 18, say "suburban/modern cottage with picket fence"). `room_poor` (`env/scenes-interior.ts:49-85`) always draws a plank floor, a window, plaster cracks, a **bed**, a table, a stool and a candle, whatever the `features` list says. So the bed appears even when the model did not list `bed` (FJ2, `features = [fireplace, door]`, judges: "bedroom (bed, door, window, candle)"). That is the "modern bedroom" of the judges.
- Spec pages: the interior is on 9 (run6), 14 (FJ1), 10 (FJ2) and 10 (v0.1.0) pages; the cottage on 3, 0, 3 and 2 pages.
- Second problem, class **U** (3 exports): the page "Outside the Cave" (run6 page 30, FJ2 page 26) is drawn in the interior place. The plan lists only `l_cave_interior` (`plan.json` pages 30 and 26). The place has `units` of section 3 only; the exterior `l_cave` lists the units of section 2 only (`U.json` `locations[].units`). The skill says every distinct place is a location (`SKILL.md:170-172`) and the understanding left out the cave mouth for section 3. There is no cave-mouth environment either, so the fix cannot be only in the understanding.

### 3.4 The mutton blade-bone, the roasted bone, the spear (props)

- The understanding has no props. The page writer picks them from `PROPS` (`contracts.ts:448-496`, 45 items). There is no bone, no spear, no stick-like neutral object.
- Blade-bone: `sword` on the page in run6 p23, FJ1 p24, FJ2 p21, v0.1.0 p22 (4 of 4 exports). Roasted mutton-bone: `roast_goose` (run6 p25, FJ2 p22) or `bread` (FJ1 p25, v0.1.0 p23). Shark's-tooth spear: `sword` (FJ1 p13, v0.1.0 p11). Birch-bark picture-letter: `letter`, a modern envelope with a wax seal (v0.1.0 pp14-15, FJ2 p18, run6 p22), although `paper` and `scroll` exist. Class **V** for all (no item); the picture-letter could have used `paper`, so a better choice existed on the page, but no item shows birch-bark.
- Second cause, class **P** (a code cause): `apps/agent-worker/src/goals/repair-once.ts:133-134` has `PROP_TRIGGERS.sword = ["sword","sword-hilt","hilt","blade"]`, and `wordsOf` (`:70-77`) splits on hyphens, so the core claim "...marks on the blade-bone of a shoulder of mutton" (FJ2 k36, run6 k53, FJ1 k55, v0.1.0 k30) contains the word "blade". `keyPropNotDrawnIssues` (`:195-220`) then says: `core claim ... names "blade", but no panel draws it (no prop or holding "sword"). Add {"prop": "sword"} ...`. The receipts show `KEY_PROP_NOT_DRAWN` in a preview round on all four sword pages: FJ2 page 21, run6 page 23, v0.1.0 page 22, FJ1 page 24 (`export/receipts.json`, goal `MANGA_PAGE`, the `preview_page` note). The same word is in `scene/props.ts:16` (`PROP_WORDS.sword` has "blade"), so a beat that says "blade-bone" also marks the sword as the key prop. The writer then draws the sword that the check asks for. The roast-goose pages (FJ2 p22, run6 p25) had no such error, so the writer also picks the nearest item without a nudge. A rule for core claims ("draw the key object") with no neutral object leads to a wrong object.
- Spec pages: sword 1 page (run6), 2 (FJ1), 1 (FJ2), 2 (v0.1.0).
- The horse-skin curtain and the hornets' nest have no item and nothing was drawn (judges: "the Curtain falling is not drawn", "no hornets' nest"): 3 and 3 exports, 0 spec pages.

### 3.5 Cheese drawn as bread (and the other cheese props)

- Prop `bread` on the page in 5 pages (1, 2, 8, 23, 25) and `basket` in 2 (12, 27). `PROPS` has no cheese, no wedge, no pile. The page writer picked `bread` (gold tone on page 1) and `basket` (New Cheese). Class **V**. The first preview of page 1 had `ENUM_INVALID` among 12 errors (`receipts.json`, run_id `...-page1-a1`, `preview_page` note: `errors=12 FIELD_MISSING,ENUM_INVALID,LAYOUT_SLOT_COUNT,PROSE_WALL`); the value is not recorded, so I cannot prove that it was "cheese", but it fits.
- The cheese pile at Station N and Haw's imagined pile (pages 20, 24, 25) have no prop at all: 0 spec pages, 9 judge-pages in 5 pages.
- Haw's wall writing is `paper` on 8 pages and `sign` on 3 pages (`paper` draws a sheet with a curled corner, `props/index.ts:335`). Judges: "a blank sheet of paper (a page-curl icon)" (pages 16, 17, 23, 27). There is no wall-writing prop or wall decal. Class **V**.
- Chisel, hammer and the hole in the wall (page 14): nothing drawn, 3 judge-pages. Class **V**.

### 3.6 The Maze

- `U.json` `locations[l_maze]`: `environment: abstract`, `features: [high_wall, window]`, description "A labyrinth of corridors and chambers with dark corners, blind alleys and walls covered in Haw's handwriting". There is no maze, corridor or labyrinth environment (`contracts.ts:384-419`). The model chose the stand-in `abstract`. The manga-page skill says: "Prefer a concrete place from the book over the `abstract` environment. Use `abstract` for at most one panel per page, and not two pages in a row" (`manga-page/SKILL.md:353-355`), but the Maze is the only place that fits the book, and it is used for 45 panels on 12 pages (pages 1, 7, 8, 16-23, 28).
- What `abstract` draws (`env/scenes-nature.ts:627-720`): a calm paper field, one of six variants (gradation, contour lines, vignette, dotted band, radiance, hatch bands). The judges: "a blank white void", "wavy lines on white that read as dunes", "bare speed-lines". The renderer **ignores the features**: `env/index.ts:262` sets `skyLess` for `void` and `abstract`, and `:273` calls `drawFeatures` only when `!skyLess`. So `high_wall` and `window` in `l_maze` are never drawn. Class **V**, also **R** (the valid item hides its features) and **P** (page 1: the plan has no location, `plan.json` page 1 `locations: []`; the writer used `l_maze` and the renderer warned `LOCATION_NOT_PLANNED` three times, `judge/page-01.json` `warnings`).
- Page 19 "the huge promising Cheese Station": the plan lists only `l_maze`, so the Station is drawn as the abstract backdrop (3 judge-pages). Class V (no station place).

### 3.7 Cheese Station C and N, and the "palace hall"

- Station C: `locations[l_station_c]` = `room_poor`, features `[high_wall, door]`. `room_poor` draws the fixed bed, table, candle and window (`scenes-interior.ts:49-85`): "a bedroom (bed, table, candle)" (pages 8, 9, 12, 15; 9 spec pages). Class **V**.
- Station N: `locations[l_station_n]` = `room_rich`, features `[high_wall, window]`. `room_rich` (`scenes-interior.ts:245-279`) always draws panelling, a curtained window, a fireplace, a rug, a chandelier, a table and a chair. That is the "ornate mansion hall with a chandelier and fireplace" of the judges (pages 12, 24, 25; 5 spec pages). Class **V**.
- The issue calls this the "palace hall". The environment in the exports is `room_rich`, not `palace_hall`. `palace_hall` (throne dais, checker floor, colonnade, `scenes-interior.ts:394-470`) is never used in the Cheese run. `room_rich` is also the place of the Chicago lunch (5 pages) and the hotel lounge (16 pages): 26 pages with the same room. The judges name the room as a wrong setting only for Station N and for page 2 (see below); on the lunch and lounge pages they complain about the chandelier filling the dominant panel (pages 3, 5, 26, 38, 41, 44; 6 pages, 10 judge-pages), which is a layout problem that the fixed furniture causes, not a wrong-place defect. I did not count those as items.
- Page 2 (class **P**, 4 judge-pages on pages 2 and 3): the plan puts the four imaginary parable characters in `l_chicago_lunch` (`plan.json` page 2, `locations: [l_chicago_lunch]`; beat "four labelled portraits"). Judge 3: "places the story's characters inside the Chicago lunch room. This stages a fiction as literal fact".

### 3.8 Size of the Little people and the mice (see also section 6)

- `U.json` `cast[c_hem].look` = `human/adult/height=short/outfit=tunic`, the same for Haw. Description: "A Little person the size of a mouse". The only human sizes are `short` (0.9), `average`, `tall` (1.1), `giant` (2.6) of a nominal 100 (adult) (`rig/human/look.ts:9-13`). A short adult has nominal height 90; the rat 13. The ratio is 6.9. The book needs about 1. There is no value and no field for it. Class **V**.
- Second cause **R**: the camera code boosts small animals (`SMALL_KINDS`, `compose.ts:253`; the foreground boost `compose.ts:760-766` up to 8 times), so the mouse size jumps between panels ("mouse is huge in close-ups, speck in the establishing shot", Cheese page 2 judge 1; "the people are about 5x the height of the mice, while in p2 the mice fill the panel", page 7 judge 1; "3x", page 8 judge 2).
- Judge pages 2, 3, 7, 8 (5 judge-pages).

### 3.9 The other animals of the Just So Stories (all class V)

| Needed | Chosen look in the exports | Judge text | Note |
|---|---|---|---|
| Crocodile | `fish` (run6, FJ2, v0.1.0), `lizard` (FJ1) | "a small fish", "a tiny lizard" | Both are flagged: lizard is not the fix either. |
| Python | `lizard` (all 4) | "a hatched blob", "a tiny striped lizard" | no snake body plan |
| Giraffe | `horse` + checks (all 4) | "a spotted horse", "no long neck" | |
| Hippopotamus | `bear` (FJ1, FJ2, v0.1.0) | "Hippo = bear"; FJ2: the raised arm "reads as a trunk" | also R in FJ2 |
| Baboon | `dog` (run6, FJ1), `fox` (FJ2, v0.1.0) | "a tiny dog or gorilla head" | |
| Ostrich | `dove` (3), `duck` (v0.1.0) | "a tiny dove" | birds are 14-30 high (`rig/bird.ts:73-80`), no tall bird |
| Wild Cow | `bear` (run6), `horse` (3) | "a hornless grey bear", "a unicorn" | |
| Bat | `mouse` (run6), `bird/owl` (3) | "drawn as an owl" | |
| Elephant relatives | `crowd/townsfolk` (run6, FJ2), `crowd/children` (FJ1) | "humans in hats and aprons" | class U |

Elephants' relatives (class **U**, also V): the skill line `SKILL.md:84-85` says "`crowd` draws people only. A group of animals or plants ... is one `bird`/`animal`/`plant` member". The guard `CROWD_NOT_PEOPLE` (`book-understanding.ts:135`) tests the description against a fixed word list (duckling, duck, bird, sheep, cattle, cow, goose, hen, chicken, dog, cat, mice, rat, frog, fish, insect, bee, flower, tree). The words "elephant", "aunt", "uncle", "herd" are not in it, so the three crowds passed. A nearer animal item (not an elephant) was available in the vocabulary.

The size of the animals is also a problem on the page: the Crocodile "shrinks from large in p1 to tiny in p3/p5" (run6 page 5 judge 2), "a fish the size of the Child's eye" (FJ2 page 5 judge 1). The animal heights are in `rig/animal.ts:16-28` (rat 13, mouse 11, frog 12, lizard 10, fish 20, cat 30, rabbit 22, dog 40, fox 40, bear 120, horse 160). A lizard is 10 high, a horse 160, so a "Python longer than the elephant is tall" is a 10-unit lizard beside a 160-unit horse.

## 4. Vocabulary inventory (task part a)

Paths: `contracts.ts` = `packages/manga-render/src/contracts.ts`. Rigs are in `packages/manga-render/src/rig/`. Scenes are in `packages/manga-render/src/env/`. "h" is the nominal height used for size (see section 6).

### 4.1 Cast: look kinds and what each draws

A cast member has exactly one `look` of nine kinds (`LOOK_KINDS`, `contracts.ts:370-380`). `RIGS` in `rig/index.ts:22-32` maps the kind to a rig. The kind chooses the rig; nothing else does.

| Kind | Fields and values (file:line) | Rig (file:line) and sizes |
|---|---|---|
| human | age 4, build 4, height 4 (short, average, tall, giant), frame 3, hair 13, hair_tone 12 tones, facial_hair 5, outfit 16, outfit_tone, headwear 9, accessories 10, skin 3, material 4 (`contracts.ts:151-214, 215-232`) | `rig/human.ts`, `rig/human/*` (draw.ts, pose.ts, body.ts, hair.ts, outfit.ts). h = age (child 64, teen 90, adult 100, elder 95) x height (0.9, 1, 1.1, 2.6): `rig/human/look.ts:9-13`. 20 poses (`rig/human/pose.ts:78`). |
| animal | species: rat, mouse, cat, dog, fox, rabbit, frog, lizard, horse, bear, fish (11, `contracts.ts:250-262`), tone | `rig/animal.ts:16-28` h: rat 13, mouse 11, cat 30, dog 40, fox 40, rabbit 22, frog 12, lizard 10, horse 160, bear 120, fish 20. Eight are quadrupeds from one skeleton: `rig/creature/quad.ts:66-75` (`QUAD`: rat, mouse, cat, dog, fox, rabbit, horse, bear). `frog` `rig/creature/critters.ts:39`, `lizard` `:130`, `fish` `:206`. Poses: quad 13 (horse 9, `quad.ts:79-82`), frog 10, lizard 7, fish 7 (`critters.ts:32-34`). |
| bird | species: swallow, nightingale, sparrow, linnet, dove, crow, owl, duck (8, `contracts.ts:234-243`), tone | `rig/bird.ts:72-81` (`SPECS`) h 14 to 30 (swallow 16, dove 20, crow 25, owl 25, duck 30). |
| insect | butterfly, dragonfly, bee (`contracts.ts:269`) | `rig/insect.ts:38` h 7 to 9. |
| object | shape: rocket, wheel, candle, lamp, firecracker, roman_candle, squib, bengal_light, coin, book, clock, cup, kettle, box (14, `contracts.ts:277-292`), tone, face | `rig/object.ts:41-56` h 15 to 66. A personified object. |
| plant | oak, tree, rose_bush, flower, reed, daisy (`contracts.ts:300`), tone, face, bloom | `rig/plant.ts:45` h 15 to 260. |
| spirit | wind, frost, snow, hail, sun, moon, fire, rain (`contracts.ts:320`) | `rig/spirit.ts:39` h 84 to 92. |
| crowd | townsfolk, children, soldiers, officials, workers, nobles (`contracts.ts:327`), size few/many, count 1-8 | `rig/crowd.ts:223` h 66 (children) or 100. People only. |
| emblem | state, law, money, conscience, machine, crowd_voice, time, idea (`contracts.ts:344`) | `rig/emblem.ts:41` h 56 to 88. |

There is no neutral figure. `rig/stub.ts` (a plain ink blob, h given by the caller) exists but no kind uses it (`rig/index.ts:22-32` maps nine kinds to nine real rigs).

### 4.2 Places: environments (32) and features (20)

`ENVIRONMENTS` is `contracts.ts:384-419`. The scene functions are registered in `env/index.ts:63-96` (`SCENES`). Interiors are listed in `env/index.ts:59` (`INTERIORS`).

| Group | Environments (scene function: file:line) |
|---|---|
| Town (`env/scenes-town.ts`) | city_square :97, street :129, rooftops :167, market :228, town_hall :317, church :400, cottage :574, mill :628 |
| Interior (`env/scenes-interior.ts`) | room_poor :49 (fixed bed, table, stool, candle, window), forge :90, foundry :164, room_rich :245 (fixed fireplace, chandelier, rug, panelling, curtained window), garret :281, palace_hall :394 (throne dais, checker floor, colonnade), jail_cell :471, courtroom :515, study :579, classroom :628 |
| Nature (`env/scenes-nature.ts`) | garden :43, forest :86, meadow :222, riverbank :239, pond :265, seaside :285, sky :382, country_road :427, moor :498, ditch :550, abstract :627, void :721 |
| Story (`env/scenes-story.ts`) | dustheap :151, paradise :194 |

There is no cave, maze, corridor, storeroom, restaurant, lounge, office, camp or "cave mouth". `abstract` and `void` have no sky and draw no features (`env/index.ts:262, 273`).

`ENV_FEATURES` (`contracts.ts:421-442`, 20): statue_column, fountain, window, fireplace, bed, table, bookshelf, trees, fence, high_wall, gate, bars, river, bridge, lamp_post, clock_tower, flowers, snow_ground, crowd_background, door. They are drawn by `drawFeatures` (`env/features.ts:82-`) on top of the scene. A scene with fixed furniture draws it also when the feature is not listed (room_poor always draws a bed). `time` (4) and `weather` (6) are in `contracts.ts:445-446`.

### 4.3 Props (45) and other page vocabulary

`PROPS`: `contracts.ts:448-496`. Drawn by `props/index.ts` (`SPECS`, `:120-1137`; seats `:1160-1210`). The list: sword, gem, coin, coins_pile, money_bag, rose, flower, book, letter, paper, scroll, lamp, candle, matches, needle, bread, cup, bottle, basket, bag, key, chains, crown, staff, umbrella, spade, wheelbarrow, ballot_box, gavel, clock, feather, bell, flag, gold_leaf, thorn, axe, firework, sign, and the v0.2 additions pot, stove, roast_goose, heart, angel, loom, sledge.

There is no bone, cheese, spear, tool (hammer, chisel), wall writing, curtain, nest, log, stone, neutral box or neutral bundle. `PropSpec` has no label (`contracts.ts:631`): `{prop, slot, depth?, tone?}`.

Other closed lists: `SHOTS` 7, `ANGLES` 6, `SLOTS` 5, `POSES` 22, `EXPRESSIONS` 18, `TONES` 12, `FX` 15 (`contracts.ts:62-520`).

### 4.4 How the vocabulary is told to the models

| Goal | Where the list comes from | Text that tells the model what to do when nothing fits |
|---|---|---|
| Understanding | `lookVocabulary()` (`apps/agent-worker/src/goals/vocabulary.ts:4-36`), sent as data block `trusted_vocabulary` (`goals/book-understanding.ts:275`); also `trusted_state_fields` (`:276`) from `catalog().variants` | Skill `skills/book-understanding/SKILL.md` v1.9.0: `look` "uses only the trusted vocabulary" (`:98`); locations are "mapped to the closest `environment`" (`:161`); "Never reuse an unrelated location because it is close enough" (`:174`, about places that exist in the book, not about the list); "New environments: foundry, dustheap, paradise" (`:165`); a group of animals is one animal member (`:84-86`). Nothing says what to do when no species, place or prop fits. |
| Plan | the understanding itself (ids) | none |
| Page | `pageVocabulary()` (`vocabulary.ts:38-62`) and `catalog()` (`packages/manga-render/src/catalog.ts`), sent as `trusted_catalog` (`goals/manga-page.ts:511`); `castCapabilities` (`capabilities.ts`) gives the poses of each cast member | Skill `skills/manga-page/SKILL.md`: "Draw the key object or action of the beat ... (KEY_PROP_NOT_DRAWN.) New props: pot, stove, roast_goose, heart, angel, loom, sledge" (`:153-155`); "Prefer a concrete place ... over `abstract`" (`:353-355`). Nothing says what to do when no prop fits. |
| Checks | `validate/look.ts:33-55` (LOOK_FIELDS), `validate/book.ts:82-88` (environment, features), `validate/page.ts:223, 341` (holding, prop) | `ENUM_INVALID`: "... is not allowed; use one of: ..." (`validate/util.ts:116-117`) |

How the vocabulary grew: v0.1.0 had 29 environments and 38 props. v0.2 (commit `deddd2f` "Q1 renderer (#41): looks, props and backdrops that stories need") added 3 environments (foundry, dustheap, paradise), 7 props (pot, stove, roast_goose, heart, angel, loom, sledge) and 2 outfits (underclothes, undressed) for the books of that run. Earlier commits added moor, ditch and forge the same way. Two small name-based patches do the same job in code: `scene/places.ts:11-33` (`resolveEnvironment` turns the stand-ins `abstract`, `void`, `country_road`, `meadow` into moor, ditch, foundry, forge, dustheap, paradise or sky when the location name says so) and `scene/looks.ts:44-58` (a firework named "Roman candle", "squib" or "Bengal light" is redrawn). Each is a patch for one earlier book. Two Just So exports used `roast_goose` (added in v0.2) as the stand-in for a mutton bone.

## 5. Can the understanding say "no item fits"? (task part b)

No. Details:

1. **There is no field for it.** `CastMember` is `{id, name, role, description, look, sections?}` and `LocationSpec` is `{id, name, environment, features, description}` (`contracts.ts:681-698`). `look` is required and closed. `environment` is required and closed. `features` is a closed list. `PropSpec` has no prop name. The only free text is `description` (and `name`, `role`). It is shown to the page writer; the renderer reads none of it (the one exception is the name tests in `scene/looks.ts` and `scene/places.ts` above).
2. **What happens to a free value.** In the understanding, an unknown species, kind, environment or feature is an error (`ENUM_INVALID` / `FIELD_MISSING`, `validate/look.ts:57-90`, `validate/book.ts:82-88`) and the goal answers `REJECTED ... use one of: <list>` (`goals/book-understanding.ts:204-212`). The model must send a value from the list, so the free value is lost. Evidence: the Cheese run was rejected once with `ENUM_INVALID(c_hem.look|c_haw.look)`; FJ2 was rejected once with `FIELD_MISSING(c_elephant_child.look|c_ostrich.look|c_giraffe.look+9)` (12 cast members sent without a look). The receipts keep only the error codes, not the value that was tried (`export/receipts.json` `calls[].tool_calls[].note`).
3. **An extra key is only a warning and is ignored** (`FIELD_UNKNOWN`, `validate/util.ts:123-129`). A model that writes `"species": "elephant"` is rejected; a model that writes `"also": "elephant"` is accepted and nothing reads it. There is one precedent for an optional extra field without a schema change: `locations[].units` (`goals/places.ts:1-20`, "an optional, additive field. The schema stays `book-understanding.v1`").
4. **If a free value reached the renderer** (for example an old saved understanding): `rig/index.ts:34-38` and `rig/animal.ts:48` throw on an unknown kind or species; `safeDraw` (`scene/compose.ts:2181-2200`) catches the error and returns nothing, so the figure is not drawn (`compose.ts:574`, `if (!probe) return`). An unknown environment throws in `env/index.ts:261` and is not caught in `compose.ts:685-702`; a missing location falls back to `void` (`compose.ts:680`).
5. **The description is not checked against the look.** Section 3.1, step 5. A description that says "elephant" with a human look is accepted.
6. **On the page, the same:** an unknown `prop` is `ENUM_INVALID` (`validate/page.ts:341`), and the `KEY_PROP_NOT_DRAWN` check (`goals/repair-once.ts:195-220`) pushes the writer to draw "the key object". With no neutral object the writer takes the nearest item (sword, roast goose, bread, basket, paper).
7. **The only "no fit" outputs that exist today are stand-in environments**: `abstract` and `void` (blank backdrops) and `LOCATION_NOT_PLANNED` warnings. A stand-in is a confident value; nothing marks it as a stand-in in the page or in the receipt. The judges cannot tell it from a real choice, and the reader gets no label.

## 6. How the size of a figure is chosen (task part c)

1. **Nominal height by kind.** The rig gives `nominalHeight(look)` (`rig/index.ts:156`): human = age x height factor, 64 to 260 (`rig/human/look.ts:9-13`); animal by species (`rig/animal.ts:16-28`); bird 14 to 30; insect 7 to 9; object, plant, spirit, crowd, emblem by tables (section 4.1). It is in "figure units" where an adult person is 100.
2. **There is no size field.** The only human sizes are short 0.9, average 1, tall 1.1, giant 2.6. A person cannot be smaller than a `short` `child` (0.9 x 64 = 57.6). A non-human has its species height. The understanding writes a size in `description` ("relative size for anything not an adult human", `SKILL.md:129`), but only the page writer reads it. The renderer does not.
3. **Panel scale.** For a ground shot, one scale `world = shot_fraction x panel_height / tallest_figure_height` is chosen (`scene/compose.ts:722-729`): establishing 0.22, wide 0.4, full 0.74 (`compose.ts:235`). A human `giant` counts as 0.68 of its height (`GIANT_BAND_SHARE`, `:183`). Every figure is drawn at `world x depth factor` (fore 1.2, mid 1, back 0.62, `:727`). So relative size is the ratio of nominal heights (a rat is 13/100 of an adult), and `depth` changes it by up to 2 times.
4. **Boosts that break the ratio** (`scene/compose.ts`): `SMALL_KINDS = {bird, insect, animal}` (`:253`) marks every animal "small", also the horse (160) and the bear (120). A small figure at depth `fore` next to a larger one is scaled up to a readable head, up to 8 times (`:760-762`); a small hero or a figure with nominal height 45 or less is scaled up the same way (`:763-766`); `SUBJECT_MIN_SIZE` 0.3, `SUBJECT_MAX_ENLARGE` 1.8 (`:226-232`); a speaker needs a head radius of 22 (`SPEAKER_MIN_HEAD_RADIUS`, `:196`), so a small speaker is enlarged in a wide shot. This is why the judges see mice "huge in close-ups, speck in the establishing shot" (Cheese page 2).
5. **The "size of mice" case.** Hem and Haw are `human/short` (nominal 90); Sniff and Scurry are `rat` (13). The ratio is 6.9 before the boosts, and the book needs about 1. The judges measured 3 to 5 times (Cheese pages 7 and 8). No value of the closed vocabulary gives a person of nominal height 13 to 15: the smallest species, `lizard` (10), `frog` (12), `mouse` (11) and `rat` (13), are animals. The only other way is a human with a smaller `age`, which gives 57.6 at best.
6. **Other size cases in the evidence.** The Python "longer than the elephant is tall" is a lizard of h 10 beside a horse of h 160; the Crocodile "vast" is a fish (h 20). The Ostrich "very tall aunt" is a dove (h 20). The elephant relatives "a crowd bigger than he is" are `crowd/townsfolk` of nominal 100 beside a giant child (166) or a horse (160): "a fraction of the Elephant's Child's size" (run6 page 10 judge 2).

## 7. Causes found in the code (summary for the designer)

These are facts from sections 3 to 6. Each has a file and line.

| # | Cause | Where | Items it explains |
|---|---|---|---|
| C1 | The look, the environment and the features are closed lists, and a free value is rejected, so the model always chooses a nearest item. Nothing records that it was a stand-in. | `validate/look.ts:57-90`, `validate/book.ts:82-88`, `goals/book-understanding.ts:204-212` | all V items |
| C2 | The vocabulary has no neutral item: no neutral animal, no neutral prop, and the only neutral backdrops (`abstract`, `void`) are blank and draw no features. | `contracts.ts:250-262, 384-419, 448-496`; `env/index.ts:262, 273` | Maze, Station, bone, cheese |
| C3 | Scenes have fixed furniture that the `features` list does not control: `room_poor` always has a bed; `room_rich` always has a chandelier and a fireplace; `cottage` always has a picket fence. | `env/scenes-interior.ts:49-85, 245-279`; `env/scenes-town.ts:574-626` | Cave (inside and outside), Stations C and N |
| C4 | Size is a table by kind and species. No field can give a person the size of a mouse. Animals are all marked "small" and boosted, so the ratio is not kept. | `rig/human/look.ts:9-13`, `rig/animal.ts:16-28`, `scene/compose.ts:253, 760-766` | Little people, mice, Python, Crocodile, Ostrich |
| C5 | The description is not checked against the look; the crowd guard uses a fixed word list that has no elephant. | `goals/book-understanding.ts:116-143` | Elephant's Child as a boy, elephant relatives |
| C6 | The key-prop check asks for a `sword` when a core claim says "blade-bone" (the word "blade" is a trigger and hyphens split words). The writer then draws the sword. | `goals/repair-once.ts:70-77, 133-134, 195-220`; `scene/props.ts:16` | blade-bone as a sword (4 of 4 exports) |
| C7 | The renderer has two rigs that share one pose for a bear and a rat (`quad.ts:121`), and a horse seen from the front reads as another animal. | `rig/creature/quad.ts:66-75, 121` | mice as bears, Wild Dog as a bear, FJ2 page 6 |
| C8 | The plan takes its places from the `units` that the understanding lists for each place (`planPlaceIssues` only warns). The cave mouth is listed for section 2 only, so the plan of a section 3 page has only the interior. A page can also have no location (Cheese page 1). | `goals/places.ts` (`planPlaceIssues`) | "Outside the Cave", page 1 of Cheese |
| C9 | The vocabulary grows one book at a time (3 environments and 7 props in v0.2; name patches in `scene/places.ts` and `scene/looks.ts`). A new book hits a new gap. | `contracts.ts`, commit `deddd2f` | all V items |

What was not found: the plan did not drop a correct item in any case except Cheese page 1 and page 2 (P). The page writer did not replace a correct understanding item with a worse one in any case that I found; in each case that I checked, the look or the place on the page is the one in the understanding.

## 8. Design options for a general fix

The aim: when no item fits, draw a neutral stand-in and say so, instead of a confident wrong match. Nothing below adds an item for one book ("an elephant"). All options use a body plan, a size and a kind of place. This section is a set of options and risks, not a decision.

### 8.1 Report what could not be mapped (understanding side)

- Add optional fields, in the same way as `locations[].units` (`goals/places.ts:1-20`: additive, schema stays `book-understanding.v1`):
  - `cast[].fit`: `exact` | `near` | `none`, and `cast[].wanted`: the thing in the book's words ("a young elephant"). Same for `locations[]` (`fit`, `wanted`).
  - top level `unmapped`: a list of `{type: cast|place|prop, id_or_word, wanted, used}`.
- Where: `contracts.ts:681-698, 718-731` (types); `validate/book.ts:51` (the top-level key list; today an unknown key is only a warning) and `:63-70, 73-89`; `goals/vocabulary.ts:4-36` (show the new values); `skills/book-understanding/SKILL.md` (a new section "When nothing fits": choose the neutral item, set `fit: none` and `wanted`); `goals/book-understanding.ts:116-143` (new checks: `fit: none` without `wanted`; `fit: exact` while the description names a thing that is not in the list is not checkable, so keep it as advice); the edition `coverage` report (`backend/app/jobs/generate.py:523-559`) to carry the `unmapped` list to the reader and to the judges.
- Why: it makes the stand-ins visible in the receipts (today the receipts keep only error codes, section 5), and it gives a measure for the gate: the count of confident wrong matches against the count of labelled stand-ins.
- Risks: the model may set `fit: exact` for a wrong match (no code can check it); the model may choose `none` too often (add a warning when the `nearest` item is already in the list); an extra field is not read by old replays (safe, it is optional).

### 8.2 Neutral archetype figures, by body plan and size

- Option A: new `animal` species that are archetypes, not animals: for example `quad_small`, `quad_medium`, `quad_large`, `long_low` (a reptile or snake body), `swimmer`, `two_legged_tall`. Data rows only for the quadrupeds: `QUAD` in `rig/creature/quad.ts:66-75` is a table (height, leg, body, neck, ears, tail, mane, hoof), so an archetype is a row with plain ears and a plain tail; `HEIGHTS` in `rig/animal.ts:16-28`; `ANIMAL_SPECIES` in `contracts.ts:250-262`; `lookVocabulary()`. `long_low` reuses `drawLizard` (`critters.ts:130`) at a larger height; `swimmer` reuses `drawFish` (`:206`).
- Option B: keep the species list and add a size to every look: `look.scale` (a factor of the adult human, 0.1 to 3). Where: `rig/index.ts:156` (`nominalHeight` x scale) and the `draw` wrapper (`rig/index.ts:153-168`; `actCreature`, `:75`, already applies a matrix to a figure): draw at `lineWidth / scale` and scale the svg and the anchors. `validate/look.ts` (a range check). `scene/compose.ts:253, 591` (`small` from the nominal height instead of the kind). This gives the Little people (scale 0.14), a long Python and a big Crocodile with the existing rigs. It does not give the Elephant: the archetype is still needed.
- Option C (both): archetype for the shape, `scale` for the size. The minimum set for the evidence: `quad_large` (elephant, hippo, cow), `long_low` (crocodile, python), The size of the Little people is a `scale`, not a new `height` value.
- Draw rules for an archetype: one flat tone, no species marks (no mane, no horns, no trunk), a face with the usual expressions, and a name tag always drawn on the first appearance (see 8.5).
- Risks: (1) an archetype may read as an animal that the judges name ("a bear", as today's bear for the Hippopotamus). The label is the answer; without it the judges will say "wrong animal" again. (2) A change of any nominal height or of the `small` rule changes all existing pages and the saved replays (`scripts/fixtures/replays`, `svg_hash`). Keep the existing items unchanged and change `small` only when the new field is present. (3) `scale` and the readable-speaker rules (`SPEAKER_MIN_HEAD_RADIUS`, `compose.ts:196`) fight: a speaker of scale 0.14 is enlarged in a wide shot, so the ratio is kept only in shots without a speaker. (4) A model that uses `scale` for everything. (5) The tests of `packages/manga-render/test` and the gold files must be updated for new rows.

### 8.3 Neutral backdrop for each kind of place

- Add a small set of generic environments chosen by the kind of place, not by the name. Suggested kinds (each is a short scene function, in a new file such as `env/scenes-generic.ts`, built from the helpers that exist: `roomShell` and `stoneBlocks` for walls, `drawGround`, `hills`, `treeLine`, `highWall`):
  - `generic_room`: plain walls, a floor, one window, no furniture (the furniture of `room_poor` is the problem in C3).
  - `generic_hall`: the same, wider and higher, no chandelier.
  - `generic_passage`: a narrow, long room in perspective with plain or stone walls (Maze, tunnel, corridor, cave tunnel).
  - `generic_rough`: stone-toned walls and a dark ceiling, no furniture (cave, dungeon, burrow).
  - `generic_outdoor`: a ground line, a horizon and a sky (camp, clearing, field).
- Where: `contracts.ts:384-419` (`ENVIRONMENTS`); `env/index.ts:59` (`INTERIORS`), `:63-96` (`SCENES`), `:109-113` (`ROOM_HEIGHT`); `validate/book.ts:82` (automatic); `lookVocabulary()` (automatic); the skill text `SKILL.md:161`. Call `drawFeatures` for the new scenes (unlike `abstract`, `env/index.ts:273`), so `high_wall` and `door` in the Maze place are drawn.
- Option: one `generic` environment with a `setting` field (`room`, `hall`, `passage`, `rough`, `outdoor`) on the location. Fewer enum values, but a new field on `LocationSpec` and a switch inside one scene.
- Do not change `room_poor`, `room_rich` or `cottage` to make furniture depend on `features` in this release without a plan for the tests: every existing page would change (C3). A safer way is that the generic scenes are new and the skill tells the model to prefer them over a stand-in.
- Risks: (1) the model may use `generic_*` when a real environment fits (add a warning `GENERIC_WHEN_ITEM_FITS` is not decidable by code; use a prompt rule and the unmapped report). (2) A neutral room is plainer than a furnished one, so the "empty panel" complaints may grow (the judges already say 60 percent of several Maze panels is empty); the scenes need some structure (floor lines, wall blocks, a door). (3) A passage in perspective needs the camera code (`env/camera.ts`) to work with a long narrow box; test with all 7 shots and 6 angles. (4) The Maze needs corridors that turn; a straight passage is a stand-in that must be labelled.

### 8.4 Neutral object

- Add three to five neutral props by shape, not by name: `thing_long` (bone, spear, stick, tool), `thing_round` (fruit, ball, stone, a wheel of cheese), `thing_block` (loaf, box, crate, a wedge of cheese), `thing_flat` (a sheet, board, bark), `thing_heap` (a pile: cheese, rubble, grass). A tone is already part of `PropSpec`.
- Where: `contracts.ts:448-496` (`PROPS`); `props/index.ts:120-1137` (`SPECS`, one drawing function each); `scene/props.ts:15-60` (`PROP_WORDS`); `goals/repair-once.ts:133-181` (`PROP_TRIGGERS`); the skill text (`manga-page/SKILL.md:153-155`).
- Fix the check first: remove "blade" from `PROP_TRIGGERS.sword` and `PROP_WORDS.sword`, and keep a hyphenated word whole in `wordsOf` (`repair-once.ts:70-77`). Then, when a core claim names an object that no prop fits, the check should ask for a neutral object with a label (8.5), not for the nearest prop.
- Risks: (1) a neutral object is also a stand-in that the judges may call "key prop not drawn" (today's rate is 0.38 to 0.86 per judge-page, from the issue); the label and a clear shape (a long bone-like shape) are what change the score. (2) Shape choice by the page writer; give the shapes plain words in the vocabulary. (3) The existing `bread`, `sword`, `roast_goose` stand-ins stay in the list, so the writer can still choose them; the skill must say "never use a prop of another object".

### 8.5 A label

- Figures already have a name tag: `TextSpec.about` (`contracts.ts:570`), drawn next to the character, first appearance (`lettering/index.ts`, `NAME_TAG_*` codes in `catalog.ts`). Option: a cast member with `fit: none` (or a neutral archetype) always gets a tag, enforced by a validator error on the page (`validate/page.ts`), and the tag text is `wanted` ("Elephant's Child").
- For a prop: `PropSpec.label` (a short text) drawn as a small tag beside the prop; or `about` on a caption that points to a prop index. Where: `contracts.ts:631`, `scene/props.ts` (`planProps`, key props are kept free of lettering), `lettering/index.ts`.
- For a place: the location caption (the writer already writes it, for example "Cheese Station C, one morning"). Option: put `LocationSpec.name` in a caption automatically on the first panel of a place that has `fit: none`.
- Risks: (1) tags cost room and can cover faces (the judges already name `TAIL_CROSSES_PROP`, `KEY_PROP_COVERED`, name tags that float away from the figure); (2) a label does not make a stand-in right: the judges may still score "wrong" if the picture contradicts the label (a boy labelled "Elephant's Child"); the archetype must be closer to the thing than a person is; (3) fidelity: a label is invented text, so it should come from the source name (`wanted`), not from the writer.

### 8.6 Small corrections that are independent of the design

1. `PROP_TRIGGERS` and `PROP_WORDS`: remove "blade"; do not split hyphenated words (C6).
2. `CROWD_NOT_PEOPLE` (`book-understanding.ts:135`): the word list is a patch list. Adding "elephant" would be a patch for one book. Prefer a rule that does not need words: a `crowd` member must be people, and the model states `wanted` for any group that is not people (8.1).
3. `abstract`: draw features (`env/index.ts:273`) or stop offering it for a place with `high_wall` or `door`.
4. `SMALL_KINDS`: use the nominal height (`compose.ts:253`), so a horse is not "small".
5. `lookSenseIssues`: a word test for "elephant" or "crocodile" would be a book patch. Instead ask the model for `wanted` (8.1) and show `wanted` and `species` together in the repair message.
6. Receipts: record the first rejected value of a field (`ENUM_INVALID` value) in `tool_calls[].note`. Then the next diagnosis can see what the model tried (section 5).
7. Plan: a page with no location (`plan.json` page 1 of Cheese) should be an error, not only `LOCATION_NOT_PLANNED` at render time.

### 8.7 How to measure (for the hold-out protocol, #96)

- Count, per book: stand-ins that are labelled (`unmapped` list) against confident wrong matches that the judges name (the V and U items of section 2). The aim is that V items become labelled stand-ins, and judge text changes from "drawn as X" to "neutral figure, labelled".
- The judges' rates to watch are "key prop not drawn" and "wrong setting" (the issue gives 0.38 and 0.19 on Cheese, 0.64 and 0.11 on Just So FJ2).
- Run on a new hold-out book that the design never saw (the Cheese book is seen: the issue says it must not be tuned on).

## 9. What I could not do, and limits

- The counts of judge-pages come from regular expressions on free text (section 0). They are exact for the spec pages and for the receipts; they are not a hand count of every defect. Different expressions can give a different number by a few judge-pages (the Maze: 15 strict, 19 loose).
- The classes are my reading of the evidence. The hardest calls: the Elephant's Child (V, not U, because no item is an elephant; two exports chose a person); the elephant relatives (U, because the skill rule exists, but also V); the mice (U, because `mouse` exists; the R cause is a second cause). A reader who counts the elephant relatives as V moves 3 item-runs from U to V.
- I did not run the renderer. The claims about what a scene draws come from reading the scene code and from the judge text and five page images. I did not render a neutral stand-in to test 8.2 to 8.5.
- The receipts keep only error codes, so the value that the model first tried (`ENUM_INVALID` on Hem and Haw, `FIELD_MISSING` on 12 cast members in FJ2) is not known.
- That `KEY_PROP_NOT_DRAWN` pushed the writer to the sword is shown by the code and by the preview notes on all four sword pages; the page writer's own reasoning is not recorded, so a pure writer choice is not excluded (the roast-goose pages had no such error and also have a stand-in).
- The Cheese book is private and copyrighted. Only a few words of it are quoted. Nothing was copied out of the SSD.
- Not opened: `v03/sealed/`, `v03/gates/`, `v03/baseline/`. The worktrees `Book-Reel` and `v020-app` were not touched. No port was used and no process was started or stopped.

## 10. Scratch files (all in this directory)

`specs.py`, `plan_vs_spec.py`, `spec_counts.py` (spec facts); `items.py`, `final_table.py`, `gen_tables.py`, `md_tables.py` (judge counts and tables); `rows.json` (the item-run rows behind section 2); `hits.py` (print the judge text that matches an item); `dump_u.py`, `dump_j.py` (dump the understanding and the defects); `j_*.txt` (blocker and major defects of each export).
