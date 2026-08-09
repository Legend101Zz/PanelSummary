# Rendering-lane cost/quality matrix (issue #12 benchmark box; issue #10 harness)

Session 6, 2026-08-09; **Session 8 bake-off update below** (the S8 panel-
binding bake-off changed the default standard-page lane). Every dollar
figure below is a MEASURED actual from persisted `provider_receipt` rows
(S5 receipts reconcile to the OpenRouter key's usage delta exactly; S6
judge receipts in `docs/evidence/session6-eval/`; S8 receipts in
`docs/evidence/session8-bakeoff/`). Quality figures come from the eval
harness scorecard artifacts.

## The matrix (Session 8 revision)

| lane | mechanism | image cost / page | text/vision cost / page | structural quality (measured) | judge quality (measured, M3 rubrics v1) | status |
|---|---|---|---|---|---|---|
| **A** — sprites + vector scenes | deterministic composition over transparent sprites + vector DSL; ZERO image calls | $0 | $0 (composition is code) | not yet measured — no accepted lane-A page exists; the compose-only stage (`manga_page_compose`) is the live entry point | not yet measured | mechanism live (DSL-only composition live-tested at zero budget in S5); sprite placement carried to S7 |
| **A′** — per-panel generation + code assembly (S8 probe) | one image call PER PANEL pasted into compiled geometry by `paste_panel_art` — binding exact by construction | **$0.0389/panel measured** (flat regardless of panel size) → **~$0.156/4-panel page (4×)** | vision QA $0.0004/call | probe panels show the RIGHT content (binding trivial — one panel, one prompt) | not scaled — no composed set | **OPEN OWNER COST DECISION** (steering rule: no undercut → don't scale). Probe receipts + panel images in `session8-bakeoff/` |
| **B** — budgeted key panel + DSL base | ONE money-shot panel per page (`select_key_panel`: largest bbox, reveal/payoff tiebreak) pasted into the compiled geometry by code; DSL for the rest; authored lettering on top | **$0.039/page measured** (S8: 2 calls $0.077804) | vision QA/binding $0.0005–0.002/call; M3 judge $0.0005/page | **binding 1.0 / 1.0** (vision referee, scene-only prompt); border 0.99/1.0 (code-drawn, excluded from scoring); IoU 0.73/0.78 (lower-bound metric, see notes) | fidelity **score 1/5 both pages** — but claims_conveyed p1 **2/37 → 5/35**; readability 2–3 (baseline parity) | **S8 BAKE-OFF WINNER — the new default standard-page lane.** Scorecard `eval_scorecard_6e6ea2db…` |
| **C** — conditioned full-page inking (one-shot) | compiled-layout skeleton + reference sheets → one image call/page; code letters everything | $0.039/page ($0.156408 spent on the S8 arm: 4 calls, ALL rejected) | vision QA $0.0004/call; M3 judge $0.0005/page | S5 (wordless scripts): border 0.80/1.00, IoU 0.38/0.33. S8 binding: **0.25–0.5, twelve rejected attempts across THREE conditioning versions** (v1 briefs, v2 spatial anchors, v3-experimental in-skeleton content tags) | S5: readability 4/5, craft 3–4/5, fidelity 1/5 | **DEMOTED for standard pages** — one-shot per-panel binding is a thrice-measured limitation; remains the fallback when B's key-panel call fails |

Planning-side text costs (shared by all lanes, per 2-page scope): direction
$0.0679 (M3, S3 actual), page-writing + thumbnail ~$0.16 on the speed lane
(S4 post-trim actuals) — but see the Session 6 harness finding below before
trusting the speed lane with content-rich scripts.

## The Session 6 finding the matrix must carry

**Fidelity is content-bound, not render-bound.** The M3 judge scored the S5
accepted lane-C pages readability 4–5 and craft 3–4 — they *look* like
manga — while fidelity scored **1/5 on every page** (1–4 of ~36
must-preserve claims conveyed). The pages were composed from the Session 4
scripts that carry ZERO text elements: there is literally no channel for
the book's claims to reach the reader. This is the Session 5 headline
finding measured independently by the judge lane, and it is why the
content-quality gate (Session 6 step 0.1) blocks wordless scripts at every
agent submission path. No image-lane improvement can buy fidelity; only
authored text elements can.

Corollary for lane choice: lane C's remaining quality gap is upstream
(page-writing content), so lane C at $0.039/page stays the default
standard-page lane. Re-score after the first fully-authored planning set
lands (S7).

## The Session 8 finding: binding is solved by CODE, not by conditioning

S7 measured that fidelity needs art AND text in the SAME panels; S8 ran
the bake-off. One-shot full-page generation failed panel binding for the
THIRD conditioning version (in-skeleton content tags + binding-specific
retry feedback: 4/4 rejected, binding 0.25–0.5, tag text leaking into the
art). Per-panel generation binds trivially (the probe panels are exactly
their briefs) — the model was never bad at drawing the content, only at
PLACING it. `paste_panel_art` makes placement a code property: candidate
B's composed pages scored binding 1.0/1.0 from the vision referee at
unchanged $0.039/page.

**B is the new default standard-page lane.** What B did NOT buy: the
fidelity SCORE (1/5 both pages; claims_conveyed improved 2/37 → 5/35 on
page 1). One art panel per page is not enough channel for ~37 claims —
the remaining fidelity gap is claims-per-page density (more pages per
scope, denser authored text, or more art panels per page — the A′ owner
decision). Stage-service wiring of lane B as the default (today it is
policy for splash/spread only) is a merge-review follow-up; the S8
evidence lane ran through `scripts/bakeoff_s8_binding.py`.

## Layout-IoU v1 metric notes (why 0.33–0.38 next to border 0.80–1.0)

`layout-iou.v1` flood-fills each compiled panel's interior on a binarized
barrier map and takes IoU of the reached region vs the authored polygon.
On ink-DENSE art (the WMC maze corridors) interior artwork blocks the
fill, so the detected region under-covers the panel: **v1 IoU is a lower
bound** on structural fidelity for inky pages, while border adherence
(dark-pixel sampling along expected borders) is an upper-bound-style
signal. Read them as a bracket. Red-fixture calibration: the skeleton
itself scores >0.85; a borderless page collapses below 0.6; art scored
against the WRONG layout drops ≥0.15 vs the faithful pairing
(`test_manga_eval_v2.py`). Magi (independent panel parsing) is the planned
tie-breaker — torch/transformers are already in the venv; the checkpoint
download + `trust_remote_code` need an owner security review first.

## Judge economics

M3 judge rubric calls (readability + fidelity-to-claims + craft, one call
per page, prompt `m3-judge-rubrics.v1`): **$0.0005/page measured**
($0.001972 for 4 pages, receipts persisted). Scoring a whole 100-page book
costs ~$0.05 — the release-bar fidelity gate (issue #10: the
must-preserve judge score gates acceptance) is affordable per run.
