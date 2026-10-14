# M1: continue with the next section (#80)

Track M1. Decisions: D38 and D39 in `docs/decisions.md`. Part of #80.

## What changed

| Part | Path |
|---|---|
| Stored versions, series rules, the parts view | `backend/app/continuation.py`, `backend/app/documents.py` (`BookUnderstanding`, new edition fields) |
| API | `backend/app/api/editions.py`: `continue_from` in the body of `POST /books/{id}/editions`; new `GET /books/{id}/parts` |
| The Generate job | `backend/app/jobs/generate.py`: sends the `prior`, stores the version |
| The prior and the merge | `apps/agent-worker/src/goals/prior-understanding.ts` (new file), `book-understanding.ts`, `book-input.ts` is unchanged (the prior is parsed in the new file) |
| Skill | `skills/book-understanding/SKILL.md` 1.11.0, section "Continuing a book" |
| Book page | `frontend/components/book/Parts.tsx`, `Parts.module.css`, `bookLogic.ts`, `app/(app)/books/[id]/page.tsx`, `lib/api.ts`, `lib/words.ts` |

## API

`POST /books/{id}/editions` with `{"continue_from": "<edition id>", "section_ids": [...]}` (or a PDF page range).

- The earlier edition must be of this book and `complete` or `completed_with_failures`.
- The body needs a scope. A body with only `continue_from` is 422 "Continue needs a scope".
- 422 with a reason when the scope repeats text that the earlier edition, or a part before it, drew. A repeat is one source unit in both scopes. The reason names the sections. An earlier edition of the whole book cannot be continued.
- The D19 limits apply to the new scope, as for any scope.
- The new edition records `continues_edition_id`, `first_page_number` (earlier first page number + earlier page count), `understanding_version` (prior version used) and, after the job, `understanding_version_produced`. All are in the edition view.
- An edition made before D38 gets its version row when it is first continued (from its stored understanding artifact).

`GET /books/{id}/parts` returns the series that ends at the newest edition: `parts` (part number, edition id, status, section ids and titles, `first_page_number`, `last_page_number`, page counts), `remaining` (sections after the last part that no part touched), `can_continue` and `continue_from`.

## The understanding with a prior

- The worker input has `prior {version, edition_id, understanding}`. The prompt shows the prior cast, locations, earlier section titles and logline in `<prior_understanding>`, escaped like book text. The earlier claims are not shown.
- The merge is described in D38. The checks run on the merged candidate. The states of a prior member are not checked again (their `at` points to units of an earlier part). A prior member may list the sections of earlier parts (`CAST_SECTIONS` accepts them). A prior location may gain `units` of the new scope; its prior units are valid by construction.
- `sections`, `claims` and `themes` of the new understanding cover the new text only, so the plan and the coverage report are judged on the scope.

## Cost and time

The estimate of a continuation is the preflight of its scope (the book page calls `GET /books/{id}/preflight?section_ids=...`). The understanding reads the new text plus the prior. The prior is not in the preflight numbers. Measured size of the prior block on the two replay packages (characters of the JSON block, tokens estimated as characters / 4): Andersen 20,517 characters (about 5,100 tokens), the two-tale book 18,398 characters (about 4,600 tokens). It grows with the cast of the earlier parts. It is input only, a few thousand tokens against the 20,000 or more tokens of the scope text, so it is inside the width of the ranges. A live run should confirm this.

## Deviation from the issue text

The issue asks for page numbers that continue. The reader is frozen, so it numbers each edition from 1. The book page shows the series numbers ("Part 2 · pages 7–12") and links each part to its reader (D39).

## Verification (offline, no model call)

- `backend/tests/test_continue.py`: a two-part and a three-part journey with a fake worker. The prior is in the worker request, the stored version 2 keeps the prior cast and looks, page numbers continue, overlap is 422 (also over the whole chain), the limits apply, no `continue_from` changes nothing, a pre-D38 edition is backfilled.
- `apps/agent-worker/test/prior-understanding.test.ts`: the prior is in its own escaped block, prior members are kept and a changed look is dropped with a warning, sections and states can grow, a duplicate is rejected, a revision cannot remove a prior member.
- `frontend`: `bookLogic.test.ts` and `words.test.ts` (no word of "generate" in the new copy).
- Screenshots of the book page (1440 and 390, light and dark) are in the PR body.

## Not done

- No live run. The orchestrator makes it.
- The replay worker cannot serve a scoped run (its book check needs all sections), so the screenshots use a state seeded in the database from the installed Andersen sample (parts made from its edition, with the real API and the real page).
- `allow_overlap` (a way to draw a scope again on purpose) is not built.
- The Contents list still shows manga pages of the newest edition only, with its own numbering.

## Live finding and fix (first live run, release/v0.3 at b02bc17)

Part 1 (section s1) drew 9 pages. Part 2 (`continue_from` part 1, scope s2) failed with "understanding failed after 2 attempts: submit limit (3)".

| Fault | Cause | Fix |
|---|---|---|
| Every submit had `PLACE_UNITS_INVALID` for `l_home`, `l_road`, `l_limpopo` | The merge copies the prior locations unchanged. Their `units` are part 1 unit ids (`s1u1`, ...). `placeIssues` checked every location against the unit ids of the new scope only, so they were "unknown". The model could not repair it, because the merge restored the prior value each time. | `placeIssues` takes the prior units by location id (`priorUnits`). Those are not checked again. Every other unit is checked against the new scope. The merge now adds the model's new-scope `units` for a prior location id to the prior units (no `PRIOR_LOCATION_KEPT` warning for `units`). A new location is checked as before. |
| One submit crashed: "Cannot read properties of undefined (reading 'kind')" | A new cast member without a `look` reached `loneSpeakers` (`attribution.ts`), which read `m.look.kind`. `baseValue` (`continuity.ts`) had the same read on `look[field]`. | Both read the look with `?.`. The member without a look is now only the normal `LOOK_INVALID` or `FIELD_MISSING` error. |

The plan check (`planPlaceIssues`) reads the merged understanding, so a prior location that gained new-scope units is found for a page of part 2. It is only a warning check (D26) and had no unit-id check against the scope.

Resume: `POST /editions/{id}/resume` on a failed part 2 queues the same edition. The job sends the same prior again (the stored version of the earlier part) with the same scope. There is no overlap check on a resume, so no new 422. No backend change was needed. `backend/tests/test_continue.py::test_a_failed_continuation_can_be_resumed_with_the_same_prior` shows it with the fake worker.

Tests that would have caught it: `apps/agent-worker/test/m1-continue-realistic.test.ts`. Its fixture, `test/fixtures/m1-part1-understanding.json`, is the real part 1 understanding of the tuning book (Kipling, public domain). Without the fix, 5 of its 8 tests fail, and the crash shows as the TypeError above.

Not done: no live run after the fix. The orchestrator resumes part 2.
