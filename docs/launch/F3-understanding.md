# F3: the statue guard rejected living people

Status: fixed on branch `fix/understanding-statue`. Date: 2026-10-09.

## Problem

On `release/v0.1` (a53378e) the BOOK_UNDERSTANDING goal for the two-tale book failed with
"submit limit (3)" after 1,471 s. The error code was `STATUE_NOT_HUMAN`. The same model passed
on the old code. MiniMax-M3.1-Flash-Preview also failed on this guard.

## Root cause (measured)

The guard `lookSenseIssues()` decides that a cast member is "a statue of a person" when the
name, role or description has a statue word AND a person word. Two faults made this wrong:

1. The test read the whole text. A living person who only talks about a statue matched.
   The "about a statue" filter (`ABOUT_A_STATUE`) knew only a short list of verbs.
2. The flag is sticky per id for the session. After a wrong flag, rewording did not help:
   the member stayed "a statue".

Captured with the new `--capture` option (run `repro1`, M3, thinking low, current code).
The first submit was rejected with:

    errors=3 FIELD_MISSING(c_bridge_boys.look),STATUE_NOT_HUMAN(c_mayor|c_art_prof)

The two flagged members were people, not statues:

- `c_mayor`: "... is the first to call the stripped statue shabby; he proposes another statue,
  of himself." ("call ... statue" and "proposes another statue" were not in the filter.)
- `c_art_prof`: role "the Art Professor at the University who judges the statue by its
  usefulness" ("judges the statue" was not in the filter).

The model tried to reword them twice (revise 2 and 3, both still rejected, because the words
"statue" or "figure on the column" stayed or the sticky flag held). In revise 4 it gave in and set
`material: "stone"` for the Mayor and the Art Professor. The run was accepted with two living
people drawn as stone. That is the run-6 failure, and it is worse than a rejection. In the
failed production run the model did not give in, so the edition stopped.

The flash run (`fixed-flash`, first code fix) showed a second false positive: the Swallow
("sleep between the statue's feet", look `bird`) was flagged four times in a row. A possessive
("statue's") and a bird look were not handled.

Not the cause: T1 `states` patches, lone speakers and the trusted state fields. The Prince's
`states` entry that sets `material: "stone"` at s1u7 was never flagged. The guard does not read
`states`.

## Fix

Files: `apps/agent-worker/src/goals/book-understanding.ts` (guard, notes, capture hook),
`apps/agent-worker/scripts/experiment.ts` (`--capture`), the skill `SKILL.md` (one rule).

- New function `statueReason()`. A statue word counts only if it is in the name or in the
  HEAD of the role or description (the text up to the first comma or relative word). Elsewhere
  in the text it counts only when the look is an `object` (the gold "rocket" case).
- Only `human` and `object` looks can be statues of a person. A bird, animal, plant, crowd
  or spirit never is.
- `ABOUT_A_STATUE` has many more verbs and determiners (call, judge, propose, order, build,
  replace, another, new ...), and possessives ("the statue's feet") are ignored.
- The sticky flag stays, but now only starts from a real statue.
- The repair message names the id, the matched words, and what to do if the member is not
  a statue.
- Tool notes carry the failing paths: `errors=2 STATUE_NOT_HUMAN(c_mayor|c_art_prof)`.
- `--capture` (experiment.ts only; the hook is unset in production) writes each candidate,
  each revise patch and each validator reply to `OUT/capture/NN-<tool>.*`.
- Skill: a living person who only looks at or judges a statue keeps `flesh`; start the role
  with what they are.

## Tests

`apps/agent-worker/test/statue-guard.test.ts` (10 tests). They use the captured Mayor,
Art Professor, admirer and Swallow entries. They show: those pass; no sticky flag starts;
a statue as an object fails (message has the id); a statue as a flesh human fails; an object
look with a deep statue word fails; the sticky rule still holds for a real statue; the notes
list paths. The existing `goals.test.ts` guard tests still pass. All captured and earlier
understandings (p0 baseline, run 8, the repro result) give no guard issue.
Offline: `npx tsc --noEmit && npx vitest run` in apps/agent-worker: 78 tests pass.

## Live before and after (book: happy-prince-two-tales, thinking low)

Load average given at start of each run. The Mac was shared.

| Run | Code | Model | Result | Submits / tool calls | Time | Output tokens | Cost |
|---|---|---|---|---|---|---|---|
| orchestrator local run | a53378e | M3 | FAILED, submit limit | 4 / 13 | 1,471 s | 107,850 | n/a |
| repro1 (load 5.5) | a53378e + capture | M3 | accepted, but Mayor and Art Professor set to stone | 1 / 4 (3 rejected by this guard) | 629 s | 87,614 | $0.148 |
| fixed-m3 | fix v1 | M3 | ACCEPTED, only the Prince is gold | 1 / 1 | 723 s | 71,670 | $0.115 |
| fixed-flash | fix v1 | Flash | ACCEPTED, but Swallow flagged 3 times (second fault) | 2 / 6 | 240 s | 27,700 | $0.056 |
| fixed2-m3 (load 7) | fix v2 (final) | M3 | ACCEPTED, only the Prince is gold | 1 / 2 (submit rejected on FIELD_MISSING and STATUE_NOT_HUMAN(c_prince), then 1 revise accepted) | 980 s | 73,824 | $0.122 |
| fixed2-flash | fix v2 (final) | Flash | ACCEPTED, only the Prince is gold | 1 / 2 (submit rejected, then 1 revise accepted) | 168 s | 14,588 | $0.023 |

Known gap: a human look with flesh material passes when the statue word comes only after a comma or in a phrase such as "on a tall column" (for example "A prince, a gilded statue of fine gold"). The words on, by, than, made, makes, cast and casts were removed from the about-a-statue list to keep this gap small.

Other rejections in these runs (FIELD_MISSING for crowd size, ENUM_INVALID) were fixed by the
model in one revise. Total live spend for this track: about $0.46 (Pi catalog estimates).

Caveats: one run per cell; model output varies between runs (repro1 passed after a long
fight, the production run did not). Flash at 14.6k output tokens gave 30 cast and 72 claims,
the same size as M3; quality was not judged here. The Flash result is one pass, not proof that
T0's 3-of-3 failures are gone. The default model is not changed by this track.
