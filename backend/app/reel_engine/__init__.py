"""
reel_engine — Video DSL Generation & Rendering Pipeline
========================================================
Turns book knowledge (quotes, data, beats) into 30-60s
video reels rendered server-side via Remotion → MP4.

MODULES:
  content_picker    — Selects unused content for new reels
  memory            — Tracks what's been used per book
  prompts           — LLM system prompt with Video DSL spec
  script_generator  — LLM → Video DSL JSON
  dsl_validator     — Validates + auto-fixes DSL
  renderer          — Calls reel-renderer subprocess → MP4
"""
