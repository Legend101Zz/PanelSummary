---
name: reel-direction
description: Direct deterministic ReelSpecs from an accepted MangaManifest.
version: 1.0.0
---

# Reel direction

Translate an accepted MangaManifest into one or more strict ReelSpecs. Reels
adapt accepted manga beats; they never re-interpret the source independently.

## Workflow

1. Fetch the MangaManifest by artifact ID.
2. Inspect the reviewed component registry and exact component contracts.
3. Select pacing, camera language, captions, and interaction mappings.
4. Normalize frame timing to integers and use asset IDs only.
5. Submit all specs together through `submit_reel_specs`.

## Hard rules

- Follow [pacing](references/pacing.md),
  [manga camera language](references/manga-camera-language.md), and
  [reel safe zones](references/reel-safe-zones.md).
- Only use returned registry component types and their exact props.
- Never emit React, CSS, JavaScript, FFmpeg arguments, shell commands, paths, or
  arbitrary URLs.
- Do not call an LLM during playback or deterministic rendering.
- Use `report_missing_capability` when the registry cannot express the beat.
- Broker acceptance is completion.
