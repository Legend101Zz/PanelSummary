# Manga Creation System: Deep Codebase Review and Rebuild Plan

This review is split into focused chapters so each file stays readable and
maintainable. Start here, then walk the chapters in order.

## Chapters

1. [Vision, findings, and DSL direction](manga_creation_system_review_and_plan/00_vision_findings_dsl.md)
2. [Canonical artifacts and pipeline design](manga_creation_system_review_and_plan/01_artifacts_pipeline.md)
3. [Detailed implementation plan](manga_creation_system_review_and_plan/02_implementation_plan.md)
4. [Prompts, PDF types, cost, data, API, and UI](manga_creation_system_review_and_plan/03_prompts_pdf_cost_api.md)
5. [Risks and large-PDF incremental generation](manga_creation_system_review_and_plan/04_risks_large_pdf.md)
6. [Architecture revamp and next steps](manga_creation_system_review_and_plan/05_architecture_next_steps.md)

## Short version

The current system has useful raw ingredients, but average output comes from
missing production artifacts: fact registry, adaptation plan, character/world
bible, beat sheet, authored script, thumbnails/storyboard, quality gate, and
continuity memory.

The recommended direction is **LLM-first manga authorship plus deterministic V4
rendering**:

- extract source facts from the PDF;
- adapt facts into a coherent manga premise/logline;
- build reusable character/world bibles and image assets;
- write beats, scripts, and storyboard pages before rendering;
- validate factual coverage, dialogue coherence, shot variety, and page flow;
- render through V4 as a semantic page DSL, not pixel soup.

Implementation has already started in the v2 project pipeline. See the linked
chapters for the full critique and rollout plan.
