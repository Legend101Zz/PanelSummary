# D1b: the understanding says what it could not map

Track D1b of v0.3, issue #81 (the understanding and page-writer half). The renderer half is track D1a. Decision: D30.

## The problem

The look vocabulary is closed and a free value is rejected. The model therefore always picks the nearest item, and nothing records that it was a stand-in (an elephant becomes a horse or a boy). The key-prop check asked for a `sword` when a core claim said "blade-bone", because "blade" was a trigger and hyphens split words. Source: the D1 diagnosis (causes C1, C5, C6, C8; options 8.1, 8.4, 8.5, 8.6).

## What changed

| Where | Change |
|---|---|
| `contracts.ts` | Optional `fit` and `wanted` on `CastMember` and `LocationSpec`; `UnmappedItem` and the optional top-level `unmapped`. |
| `validate/book.ts` | `unmapped` is a known key. A bad `fit` is `ENUM_INVALID`; a `wanted` longer than 40 is a warning (`WANTED_LONG`); a bad `unmapped` list is a warning. |
| `goals/book-understanding.ts` | `FIT_WANTED_MISSING` (error), `ARCHETYPE_WITHOUT_FIT` (warning), `wanted`/kind/species shown in look-error messages, `revise_understanding` accepts `unmapped`, receipt note `first_rejected=`. |
| `goals/vocabulary.ts` | `standInVocabulary()`: one-line meanings of the archetypes (body plans), generic environments (kinds of place), `thing_*` props (shapes), `fit`, `wanted`, `unmapped`, and `look.scale`. A value is shown only when the renderer has it, so D1a and D1b can merge in any order. |
| `goals/repair-once.ts` | No "blade" trigger; `wordsOf` keeps hyphenated words whole; the `KEY_PROP_NOT_DRAWN` hint asks for a labelled neutral `thing_*` prop; a labelled neutral prop counts as drawing the object. |
| Skills | `book-understanding` 1.10.0 and `manga-page` 1.12.0: section "When no item fits". |
| Backend | `app/stand_ins.py` and `book.stand_ins` in `GET /editions/{id}`. |
| Frontend | "Drawn as stand-ins" list in "About this adaptation". |

## Decisions in the code

- `wordsOf` (whole hyphenated words) is used only by the key-prop check. The other checks (claim text, duplicate captions, quote checks) were calibrated on split words, so they keep `splitWords`. Changing them is a separate calibration (D26).
- The check for a look that does not match its description is not a word test. The model reports `fit` and `wanted`; a repair message shows them with kind and species.
- Model text (`wanted`, `used`, names) is clipped, kept to plain characters in messages and receipts, and shown as text only.

## Not done

- `PROP_WORDS` in `packages/manga-render/src/scene/props.ts` still lists "blade" for `sword`, and its word match is on word boundaries, so "blade-bone" in a beat can still place a sword. Changing it changes renderer output and needs a new `RENDERER_VERSION`. It is outside this track.
- The page goal note (`codesNote` in `goals/manga-page.ts`) does not yet record the first rejected value. Track W1 owns that file.
- The names of the neutral values are the D1a contract. Until D1a merges, a model that uses them gets `ENUM_INVALID`.
- No live run. Whether the model uses `fit` and `unmapped` well is for a measured run (the owner starts it).
