# Provenance

Source: https://github.com/AminBlg/SimpleEnglish
Path in source: `skills/simple-english/`
Upstream commit: `59bf6702197a5aadc96d197ea17f290d8d50dcd3`
Vendored on: 2026-08-10
License: MIT (see LICENSE, Copyright (c) 2026 AminBlg)
Skill version at vendor time: 1.2.0 (ASD-STE100 Issue 9, 2025-01-15)

## What this is

An agent skill that writes technical text with ASD-STE100 Simplified Technical
English. The rules give short sentences, one meaning per word, active voice, and
condition-before-command order.

## Files

- `SKILL.md` — the 53-rule catalog, two modes, vocabulary discipline, self-check.
- `references/checklist.md` — searchable verification pass. Use it for audits.
- `references/use-cases.md` — adaptations for error messages, runbooks, incident
  reports, release notes, and agent instructions.

Files are byte-identical to upstream. Do not edit them. To update, re-vendor from
the source repository and record the new commit here.

## Where it is used in this project

The Project Factory control-room views under `.project-factory/views/` are written
in pragmatic mode. See the "Language" section of `CLAUDE.md`.

## Limits

This skill is an unofficial aid. It is not affiliated with ASD or STEMG. No tool
can guarantee ASD-STE100 compliance. ASD-STE100 is a registered trademark of ASD.
The official standard is a free download at asd-ste100.org.
