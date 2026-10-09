# F4: a provider limit shows as itself and stops the job

Status: built on branch `fix/provider-errors`. Date: 2026-10-09. Offline checks only: no live model call was made.

## Problem

At about 08:50 UTC on 2026-10-09 the MiniMax account answered every call with HTTP 429:

    {"type":"rate_limit_error","message":"Token Plan usage limit reached: Upgrade your Token Plan or purchase Credits for more usage. (2056)"}

In the running 68-page edition (`gate2-m3u-local`) the job kept sending page after page against the dead
quota. Every MANGA_PAGE call from page 19 on gave 0 output tokens and 0 submits. Its receipt and the page reason
said `NO_SUBMISSION: finished without an accepted submission`. The pages were marked `failed`, so the reader
showed a wrong reason and the edition could not be told from a model failure.

The numbers in this section (68 pages, 32 of 50 failed, 20 to 25 s per call) come from the track brief. I did not
measure them again; the export read was too slow on the loaded Mac.

## What the Pi SDK does (read from the installed source, 0.80.10)

- The Anthropic Messages stream catches the provider error. It does not throw. It ends the assistant message with
  `stopReason: "error"` and `errorMessage` (the SDK error text, for example `429 {json}`).
- `AgentSession` retries such a message by itself (`retry: { maxRetries: 2 }` in `goal-runtime.ts`) when the text
  matches its retry list. `rate_limit_error` matches it. So one refused goal made three calls and took about 20 to 25 s.
- After the last retry the error message stays as the last assistant message. `session.prompt()` does not throw.
- The old code then did not look at it. It sent one more "nudge" prompt, saw no submit, and reported `no_submission`.

## What changed

1. Runtime (`packages/agent-runtime`). New `provider-error.ts` classifies the last assistant error.
   If the provider refused, the goal ends at once (no nudge) with `stop_reason: "provider_error"` and
   `trace.provider_error = { code, type, http_status, message }`. Codes:

   | Code | When |
   |---|---|
   | `PROVIDER_LIMIT` | HTTP 429, `rate_limit_error`, usage limit, credits, quota, billing |
   | `PROVIDER_UNAVAILABLE` | HTTP 5xx, `overloaded_error`, `api_error`, dropped connection |
   | `PROVIDER_AUTH` | HTTP 401, 403, `authentication_error`, `permission_error` |

   The message is cleaned: bearer tokens, `sk-` keys and `authorization` or `api-key` lines are removed, and the
   text is cut at 400 characters. An error that is not a provider refusal (for example a 400 for a bad request)
   keeps `stop_reason: "error"`, now with its own text instead of "finished without an accepted submission".
2. Worker (`apps/agent-worker`). `executeDefinition` returns `error.code = PROVIDER_*` with `provider_type`,
   `provider_message` and `http_status`. The trace is returned as before.
3. Backend (`backend/app/jobs`). A circuit breaker (see D11):
   - `PROVIDER_LIMIT` and `PROVIDER_AUTH` stop the job at once. `PROVIDER_UNAVAILABLE` stops it after the
     normal attempts (2 for a page, 2 for the understanding and the plan).
   - After the first stop, no page starts a new call. Calls already in flight finish and are recorded.
   - The page that met the refusal goes back to `pending` and gets its attempt back. It is not a model failure.
     Its receipt is kept (D12).
   - Pages never tried stay `pending`. Accepted pages stay accepted.
   - The understanding and the plan stop at once, with no second attempt.
   - The edition ends `failed` with `error` and `provider_stop`. The job ends `failed` with the same text.
   - Resume continues the pending pages. A call sent again after a refusal gets a new run id (`-r1`).
4. Frontend. The book page and the reader show the reason in plain words and what to do next. They read
   `edition.provider_stop` and use `providerStopLines()` in `frontend/lib/words.ts`. `plainReason()` also knows
   the plan-limit wording for old editions.

## Decision: `failed`, not `paused`

I kept the status `failed`. `failed` already means "stopped, can be resumed" in the API, the runner and the screens.
Every poller already treats it as final. A new `paused` status would be unknown to them. The new field
`provider_stop` carries the difference. Recorded in D11.

## What the screens say

For a plan limit:

- Title: "MiniMax stopped the drawing: usage limit reached".
- "Your MiniMax plan has no more usage right now. Nothing more was sent, so nothing more was spent. The pages
  already drawn stay as they are, and N pages were not tried yet."
- "Wait for the limit to reset, or add credits to the plan. Then press Resume drawing."
- Technical detail: the provider's type and message.

## Tests (all offline)

| Where | What it proves |
|---|---|
| `packages/agent-runtime/test/provider-error.test.ts` | The classifier maps the real MiniMax answer to `PROVIDER_LIMIT`. A fake `fetch` returns 429, 529 and 401: the run ends `provider_error` with the right code. The 429 case makes exactly 3 calls (Pi's own retries) and no nudge call. A 400 stays a plain error. No key in the trace. |
| `apps/agent-worker/test/provider-error.test.ts` | The worker outcome and the HTTP answer carry `PROVIDER_LIMIT`, the provider type and message. The code is not `NO_SUBMISSION`. |
| `backend/tests/test_provider_stop.py` | Fake worker over HTTP. Limit on page 3 of 5: pages 1 and 2 accepted, pages 3 to 5 pending, 3 page calls (not 5), no failed page, reason visible, receipts kept, resume draws exactly pages 3, 4, 5 and the edition is complete. Parallel pages: only the in-flight calls are made. Limit in the understanding and in the plan: one call, no second attempt, resume works. Bad key: one call. Unavailable: two attempts, then stop. One unavailable answer that recovers does not stop the job. |

Mutation check (private copy): with the breaker test `if breaker["stop"] is not None` replaced by `if False`,
4 of the 7 backend tests fail.

## Not covered

- No live call. The behaviour of the real MiniMax API after the limit resets is not tested here. The orchestrator runs the live journeys.
- The shelf (`LibraryBook.latest_edition`) still says "Drawing stopped" for this case. Showing the limit there needs a change in `backend/app/api/library.py`, which this track does not own.
- The screens were checked with `tsc` and a production build, not with a screenshot of a stopped edition.
