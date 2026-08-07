---
name: manga-composition
description: Compose validated manga candidates from accepted plans and assets.
version: 1.0.0
---

# Manga composition

Compose an accepted MangaPlan into contract-shaped page candidates using only
accepted asset IDs and source receipts.

## Workflow

1. Fetch the accepted MangaPlan by artifact ID.
2. Resolve only the asset metadata and source receipts needed for its beats.
3. Allocate panels and text with deliberate page rhythm.
4. Check reading order, speaker identity, source linkage, text capacity, and
   asset reuse before submission.
5. Submit through `submit_manga_composition`.

## Hard rules

- Follow [panel rhythm](references/panel-rhythm.md),
  [bubbles and narration](references/bubbles-and-narration.md), and
  [asset reuse](references/asset-reuse.md).
- Never create or edit files, code, CSS, or renderer commands.
- Never refer to an arbitrary path, URL, or unregistered asset.
- Keep source receipts attached through every transformation.
- Use `report_composition_blocker` instead of fabricating missing content.
- Broker acceptance is the only valid completion signal.
