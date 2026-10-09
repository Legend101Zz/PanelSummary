# Product rebuild — running state

Owner brief (2026-09-25): finish PanelSummary as a working PDF → manga product.
MiniMax through the application harness is the only generation intelligence;
no image-generation models; deterministic SVG/CSS art; Generate → harness →
persisted pages → main reader.

## Workspace

- Branch: `product/harness-manga` (from `v2-architecture` @ 47ea74d).
- Preserved first: commit a5e4fbc (CLAUDE.md language section, `.agents/`,
  `.claude/skills/`, `.project-factory/`) plus the tarball
  `/Volumes/Mrigesh SSD/Book-Reel-backups/uncommitted-2026-09-25.tgz`.
- Disposable MongoDB: `mongodb://127.0.0.1:27018` (data in
  `/Volumes/Mrigesh SSD/Book-Reel-scratch/mongo-27018`). The Atlas URL in
  `backend/.env` is the owner's database and is not used by this work.
- Port 3000 belongs to the owner's Hermes WhatsApp bridge. The frontend must
  use another port.
- Test books (public domain, Project Gutenberg), built by
  `Book-Reel-scratch/books/build_pdfs.py`:
  - `happy-prince-and-other-tales.pdf` — 68 pages, 5 tales (fiction, dialogue,
    multiple characters). Acceptance book.
  - `happy-prince-two-tales.pdf` — 26 pages, first 2 tales.
  - `civil-disobedience.pdf` — 34 pages, 3 parts (nonfiction, argument, one
    narrative episode).

## Phases (all done; evidence in this folder)

1. Truth audit: `phase1/` (routes, services, defects rechecked, hygiene, harness audit).
2. Architecture decision: `DECISION-architecture.md` and `../decisions.md` (D13).
3. MiniMax experiments: `EXPERIMENTS.md` (M3 over M2.7-highspeed; per-page goal over
   one-pass sections and a review pass; thinking off for plan/pages, low + patch tool
   for understanding; vision preview on).
4. Manga craft + visual system: `research/craft.md` (rubric in section (g)) and
   `packages/manga-render` (renderer 0.3.0).
5. Clean + implement: one harness path, Mongo-leased job runner, rebuilt reader; about
   142k lines of v1/reel/image/Celery code and stale docs removed.
6. Product proof: `ACCEPTANCE.md` (eight live runs of upload → Generate → reader, two of
   them cancelled on purpose, one nonfiction run, judge-panel scores per run).

## Where quality stands

The product path works end to end and fails visibly. Page quality is still below the strict
ship bar on most pages (final run 8: 5 of 46 pages; mean 3.37 of 5; speaker attribution 3.83
and fidelity 2.93 are the best of all runs). Continuity of a character's state across pages
(2.43) and claims only partly shown are the weakest; the remaining blockers are listed at the
end of `ACCEPTANCE.md`. Deterministic checks in
the page goal (`apps/agent-worker/src/goals/`) are the main lever; each one is calibrated on
judged pages before it becomes an error.

## Open (owner decisions)

- Branch `product/harness-manga` was merged into `main` as PR #16 (`7c14501`) on 2026-09-26.
  The v0.1 launch work is tracked in issue #17. The launch plan is in `docs/launch/`.
- Owner-only files kept: `CLAUDE.md` language section, `.claude/skills/simple-english/`.
- Backups outside the repo: `/Volumes/Mrigesh SSD/Book-Reel-backups/`.
