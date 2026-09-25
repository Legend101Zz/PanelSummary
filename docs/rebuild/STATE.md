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

## Phases

1. Truth audit — reports in `docs/rebuild/phase1/`.
2. Architecture decision.
3. MiniMax experiments.
4. Manga craft + visual system.
5. Clean + implement.
6. Product proof.
