# T0: MiniMax-M3.1-Flash-Preview in the harness

Status: Flash is registered and selectable per goal. The defaults stay MiniMax-M3 (D13). The default switch waits for the A/B that the orchestrator runs.

Measured on 2026-10-09 (this Mac is shared; load average 4 to 10 during the runs).

## Mechanism

- Pi 0.80.10 (pinned, not changed) lists only M2.7, M2.7-highspeed and M3.
- `packages/agent-runtime/src/goal-runtime.ts` registers Flash with the SDK's own custom-model call, `ModelRuntime.registerProvider("minimax", { models })`. There is no network catalog fetch (`allowModelNetwork` stays false), no `models.json`, and the session stays sealed.
- `registerProvider` replaces the model list of the provider, so the catalog models are passed again with Flash added.
- Flash entry: api `anthropic-messages`, base URL `https://api.minimax.io/anthropic`, input text and image, context window 1,000,000, reasoning on, max output 128,000 (same as the M3 entry).
- `ALLOWED_MODELS` and `VISION_MODELS` include Flash. `apps/agent-worker/src/run-goal.ts` uses `VISION_MODELS` instead of a literal. The goal defaults come from one constant, `DEFAULT_GOAL_MODEL` (value `MiniMax-M3`).
- The worker HTTP API refuses a model or a thinking level that is not in the allow-list (HTTP 400). The backend settings refuse an unknown model name.

## Price

MiniMax publishes no price for MiniMax-M3.1-Flash-Preview. Checked:

- https://platform.minimax.io/docs/guides/pricing-paygo lists M3, M2.7 and M2.7-highspeed only. M3 is $0.30 input and $1.20 output per million tokens up to 512k input tokens, and $0.60 and $2.40 above that.
- https://platform.minimax.io/docs/api-reference/text-anthropic-api names Flash but gives no price.
- Third-party pages list $0.00 for Flash. That is an empty field, not a price.

So the harness uses the M3 rates for Flash. Every trace and receipt has `cost_basis`. For Flash it reads `estimate on MiniMax-M3 rates (no published price for MiniMax-M3.1-Flash-Preview)`. For the other models it reads `Pi catalog rates`. Treat every Flash cost as an estimate. (M3 cost above 512k input tokens is not tiered in the Pi catalog either; these runs stay far below it.)

## Thinking

What Pi puts on the wire (captured request bodies, no headers; script `Book-Reel-scratch/launch/t0-impl/capture.mts`, output `capture-after.json`). For `anthropic-messages` and a non-adaptive model, Pi sends:

| level | M3 request (unchanged) |
|---|---|
| off | `thinking: {type: "disabled"}` |
| minimal | `{type: "enabled", budget_tokens: 1024, display: "summarized"}` |
| low | `{type: "enabled", budget_tokens: 2048, ...}` |
| medium | `{type: "enabled", budget_tokens: 8192, ...}` |
| high | `{type: "enabled", budget_tokens: 16384, ...}` |

What the API accepts for Flash (tiny calls, `probe.sh`, `probe2.sh`, `probe3.sh` in the scratch dir):

- No thinking field: accepted. Flash thinks by default.
- `thinking: {type: "disabled"}`: **HTTP 400** ("requires adaptive thinking; thinking.type=disabled is not allowed").
- `output_config: {effort: "none"}`: **HTTP 400**, same reason.
- `thinking: {type: "enabled", budget_tokens: 1024}`: accepted, and Flash thinks.
- `thinking: {type: "adaptive"}` with `output_config.effort` of `minimal`, `low`, `medium`, `high` or `max`: accepted.
- Effort is a hint. With `low` or `minimal` Flash often (not always) skips thinking: in 4 of 4 calls with `adaptive` plus `low` it did not think; in 2 of 4 calls with `low` alone it did.

Result: **Flash cannot be switched off.** The harness sends `thinking: {type: "adaptive"}` plus `output_config.effort` for Flash. Map: off, minimal, low give `low`; medium gives `medium`; high gives `high`. Without this rewrite, Pi would send `disabled` for level `off` and every default page and plan call on Flash would fail with a 400.

M3 and the other catalog models are not touched. The rewrite returns the same object for them (unit test), and a fake-stream test checks the exact M3 body for all five levels.

The rewrite runs in a wrapper on `runtime.streamSimple`, in the payload hook. Pi 0.80.10 offers no other hook for this without an extension, and the session is sealed.

## Receipts

The trace now has `thinking` (asked), `thinking_sent` (what went on the wire, for example `adaptive:low`, `disabled`, `enabled:2048`; distinct values joined by `|`) and `cost_basis`. `backend/app/jobs/generate.py` stores `thinking_sent` and `cost_basis` in each receipt. The offline journey test asserts them. The edition `policy` already records the model per goal.

## Tolerance of narration and thinking blocks

Tests with a fake Anthropic SSE stream (`packages/agent-runtime/test/flash.test.ts`): a thinking block with a signature, text, a thinking block without a signature, then `tool_use` is accepted in one turn, with no nudge. The text-fallback path reads the final JSON after thinking blocks and narration. `extractFinalJson` ignores thinking blocks. The live runs below also had thinking blocks and narration and needed no nudge.

## Live smoke (real spend)

Total spend: $0.39 (Pi estimate on M3 rates; cap $1.50). Book for the pages and the plan: `happy-prince-and-other-tales.pdf` (the acceptance run 8 book, same understanding and plan as input, so a page can be compared with run 8). Book for the understanding: `happy-prince-two-tales.pdf` (26 pages, whole text). Evidence: `/Volumes/Mrigesh SSD/Book-Reel-scratch/launch/t0-impl/live/`.

| goal | model | thinking asked / sent | result | submits | nudges | text fallback | tokens in / out (cache read) | latency | cost (est.) |
|---|---|---|---|---|---|---|---|---|---|
| BOOK_UNDERSTANDING | Flash | low / adaptive:low | FAILED: turn limit (16) | 2 | 0 | no | 57,085 / 38,301 (594,739) | 317 s | $0.099 |
| BOOK_UNDERSTANDING | Flash | medium / adaptive:medium | FAILED: submit limit (3) | 4 | 0 | no | 56,096 / 51,773 (247,005) | 421 s | $0.094 |
| BOOK_UNDERSTANDING | Flash | high / adaptive:high | FAILED: submit limit (3) | 4 | 0 | no | 61,316 / 60,130 (171,349) | 510 s | $0.101 |
| ADAPTATION_PLAN | Flash | off / adaptive:low | accepted, 61 pages (run 8, M3: 46) | 2 | 0 | no | 44,561 / 19,172 (30,489) | 107 s | $0.038 |
| MANGA_PAGE p1 (vision) | Flash | off / adaptive:low | accepted | 1 | 0 | no | 32,350 / 7,316 (128,037) | 59 s | $0.026 |
| MANGA_PAGE p2 (vision) | Flash | off / adaptive:low | accepted | 1 | 0 | no | 27,659 / 5,342 (67,591) | 32 s | $0.019 |
| MANGA_PAGE p1 (vision) | M3 | off / disabled | accepted | 1 | 0 | no | 22,733 / 5,831 (47,309) | 45 s | $0.017 |

Load average (`uptime`) at the start of each group: 4.4 (understanding low), 6.9 (medium), 4.3 (plan and pages, three processes in parallel), 9.1 (high, at its end).

Reading of the table (one run each; no statistics):

- The harness works end to end on Flash: tool calls, vision previews, thinking blocks and narration all pass, with no nudge and no text fallback.
- BOOK_UNDERSTANDING failed three times, at three thinking levels. The failures are model quality, not the harness: the guard `STATUE_NOT_HUMAN` (the Happy Prince is a statue, not a person) was still open at the end of every run, and the model spent its turns or submits on it. M3 passes this guard at thinking `low` in every acceptance run (D13). This is a real signal against Flash for the understanding goal. It was not tested on a second book.
- The plan was accepted. It has 61 pages against 46 for M3 on the same input; whether that is better is for the A/B.
- Flash pages: the same page 1 and page 2 both passed the deterministic guards at first submit. Looking at the PNGs: Flash page 1 has a small gap in the establishing panel (the Councillors are a tiny floating group, the statue is small), while M3 page 1 has a larger statue and a cleaner establishing shot but cuts the Mathematical Master's line to "You have never seen one." Flash page 1 keeps the whole line ("How do you know? ...you have never seen one."). Flash page 2 reads well (clear speakers, Swallow and Reed staged). No judge score was run; these are my eyes on three pages, not a quality result.
- On time and cost Flash was not faster here: page 1 took 59 s on Flash and 45 s on M3 with different loads. Flash used more cache-read tokens (more turns: 7 against 4). The earlier single tiny-call probes showed 1.5 to 1.8 s against 1.9 to 2.0 s.

## Not done / open

- No judged A/B (the orchestrator runs it). No second book for the understanding.
- `goals/experimental/*.ts` still hold the literal `"MiniMax-M3"` (outside the owned paths of this track).

## Notes for other tracks

- The worker endpoint `/internal/v2/runs` now returns 400 for an unknown model or an unknown thinking level. Before, it passed them on.
- `goals/experimental/manga-section.ts` and `page-review.ts` still hold the literal "MiniMax-M3". They are outside this track. The orchestrator should move them to `DEFAULT_GOAL_MODEL`.
- The Flash live-smoke numbers are one run per cell. Do not read the page latency or cost rows as an A/B result.
