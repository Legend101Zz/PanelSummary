# ADR: Manga v2 LLM-First Orchestration

Date: 2026-05-04  
Status: Accepted for v2 implementation  
Owner: code-puppy-0c26ab

## Context

The legacy manga flow grew organically and now mixes story design, rendering DSL,
validation, and fallback generation in the same path. Several legacy modules use
local fallback artifacts when LLM output is malformed or incomplete. That keeps a
job from failing, but it also allows low-quality manga to ship silently.

For manga creation, silent fallback is the wrong tradeoff. The product promise is
not "always return something". The promise is:

> Turn a PDF into a coherent, source-grounded manga that captures the gist,
> characters, emotional arc, and key ideas of the document.

That requires powerful LLM and image-model stages, not avoidance of them.

## Decision

Manga v2 treats LLMs and image models as first-class production components.
Creative stages must call the configured model and produce validated artifacts.
If an output is invalid, the system must perform model-backed repair attempts.
If the artifact still fails validation, the job fails loudly with a traceable
contract error.

Manga v2 must not silently replace model output with cheap local fallback manga.

## Required v2 flow

```text
PDF source slice
  -> source fact extraction              LLM-backed
  -> adaptation plan                     LLM-backed
  -> character/world bible               LLM-backed
  -> beat sheet                          LLM-backed
  -> manga script                        LLM-backed
  -> storyboard                          LLM-backed
  -> quality gate                        deterministic + optional LLM repair
  -> character asset prompt generation   LLM-backed
  -> character image generation          image model-backed
  -> V4 page rendering                   deterministic renderer target
```

The renderer may be deterministic. The creative authoring stages may not be
replaced by local fallback logic.

## Contract rules

Every LLM-backed stage must define:

1. stage name
2. system prompt
3. user prompt
4. output Pydantic model or typed adapter
5. maximum validation attempts
6. token budget
7. temperature
8. trace metadata

Every LLM response must be validated before handoff.

Validation failures must trigger a repair prompt that includes:

- validation issues
- previous response preview
- original request
- instruction to return only contract-valid JSON

If all validation attempts fail, raise a structured error. Do not patch the
creative artifact locally just to continue.

## Observability expectations

Each structured LLM invocation stores a compact trace:

- stage name
- provider
- model
- attempt count
- input token count
- output token count
- estimated cost
- content preview
- validation issues

Full source text should not be stored in traces.

## Why this is safer

- Bad model output cannot silently become low-quality manga.
- The failure mode is explicit and debuggable.
- Validation errors become repair context for the model.
- Artifacts remain source-grounded and schema-checked.
- The renderer no longer invents story semantics.

## Why this is more scalable

- Each creative step has a small, typed contract.
- Stages can be retried, measured, tuned, or swapped independently.
- Different models can be selected per stage later.
- Cost and quality can be observed per stage instead of as one blob.

## V1 vs V2 comparison

| Area | V1 behavior | V2 behavior |
| --- | --- | --- |
| Story design | Large mixed module | Typed stage contract |
| Invalid JSON | Retry, sometimes fallback | Repair with model, then fail |
| Renderer | Can compensate creatively | Pure rendering target |
| Continuity | Summary-based | Project ledger + facts |
| Quality gate | Partial/manual | Required artifact gate |
| Observability | Logs around calls | Per-stage trace |
| Character consistency | Prompt text mostly | Bible + asset specs |

## Explicit non-goals

- Do not optimize by avoiding LLM calls for creative stages.
- Do not generate generic manga when the model fails.
- Do not let the DSL become the story author.
- Do not store API keys or full private source text in traces.

## Implementation status

Implemented foundation:

- `backend/app/manga_pipeline/llm_contracts.py`
- structured request/result/trace models
- Pydantic validation adapter
- model-backed repair loop
- loud failure via `LLMOutputValidationError`
- unit tests for success, repair, schema failure, and hard failure

Implemented concrete v2 LLM stages:

- `source_fact_extraction_stage.py`
- `adaptation_plan_stage.py`
- `character_world_bible_stage.py`
- `beat_sheet_stage.py`
- `manga_script_stage.py`
- `storyboard_stage.py`
- `quality_repair_stage.py`
- `character_asset_plan_stage.py`

Concrete LLM-backed stage adapters are now in place for the v2 backend spine.
The first image-model execution layer now consumes `MangaAssetSpec` records and
stores generated reusable character sheets/variants when `generate_images=true`.
It is strict by design: no local placeholder fallback and no silent model switch.

Each adapter uses the structured contract runner and is unit verified with a
fake model before being wired into real jobs.
