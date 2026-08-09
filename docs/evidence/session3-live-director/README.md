# Session 3 live Manga Director run — blueprint Phase 2 exit

Date: 2026-08-07. Scope: `scope_e440233874519846e51c4e2c`
("proof scope B (continuation)", 3 source units) on the WMC benchmark
project `6a0b5a5b201a8d03f1d82503`, at active memory version 1.

Reproduce with backend + agent worker up (see the Session 3 handoff in
NEXT_SESSION.md for the env block):

```
cd backend && uv run python scripts/live_manga_director.py scope_e440233874519846e51c4e2c
```

## What this proves (blueprint §22 Phase 2 exit)

> Pi returns a validated `MangaPlan` from a persisted `ContextPack`, with no
> shell/filesystem/network capability exposed to the model.

- The compiled `ContextPack` (`context_0983806e6ea7926d74f27197`, 3 units,
  3 grounded facts, ~10.8k estimated tokens) was persisted as an accepted
  artifact **before** the model ran, and the model reached it only through
  the authenticated broker.
- `broker_calls.log` is the complete list of control-plane tool calls made
  during the run: **`submit_manga_plan` only** — three times (two 422
  rejections, then a 200). No built-in tool, no read tool, no other endpoint
  was ever reached. The two 422s are the deterministic contract validators
  doing their job on schema-invalid drafts (12 and 39 pydantic errors); the
  model repaired and the third submission passed every check.
- `accepted_manga_plan.json` re-validates as `MangaPlan` v1 and cites all 3
  ContextPack source units and all 3 required fact IDs, with byte-exact
  `SourceRef` objects (the broker rejects anything else with 403).
- `model_receipt.json` is the persisted `ModelReceipt` on the accepted
  artifact.

## Receipt

| field | value |
| --- | --- |
| provider / model | `minimax` / `MiniMax-M3` |
| purpose | `manga_direction` |
| prompt_version | `manga-direction.v2` |
| skill hash | `f634de4a…448eb` (repo-owned `manga-direction` skill) |
| input tokens | 18,844 |
| output tokens | 43,940 |
| cost | $0.06791976 |
| latency | 291,379 ms (~4m51s) |
| Pi session id | `019fdc46-81a1-786a-94b4-15a59143fc0e` (on the stage run) |

## Durable state after the run

- `context_0983806e6ea7926d74f27197` — accepted `context_pack`
- `candidate_manga_plan_9f9cb2bc20f9a4ac87f47c4a` — broker-stored candidate
  (`valid`), the artifact the driver *requires* to exist before accepting
- `manga_plan_9f9cb2bc20f9a4ac87f47c4a` — accepted plan carrying the receipt
- `run_dir_d03359d53a8a34199836b06b` (succeeded) /
  `stage_dir_5ddeedc9f000559a3a3616f8` (succeeded, carries the Pi session id)

v1 collections were untouched by the run: 1 slice, 13 pages, 8 assets,
`active_memory_version` still 1 — identical to the pre-run backup at
`/tmp/bookreel-s3-before-live-director.json`.

## Idempotency (no double spend)

An immediate second invocation returned `reused: True` with the same
`manga_plan_9f9cb2bc20f9a4ac87f47c4a` in 12.5 s and made **no** model call —
the succeeded stage short-circuits, and the existing artifact's MiniMax
receipt is re-verified before reuse.
