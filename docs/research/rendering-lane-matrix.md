# Rendering-lane cost/quality matrix (issue #12 benchmark box; issue #10 harness)

Session 6, 2026-08-09. Every dollar figure below is a MEASURED actual from
persisted `provider_receipt` rows (S5 receipts reconcile to the OpenRouter
key's usage delta exactly; S6 judge receipts in
`docs/evidence/session6-eval/`). Quality figures come from the Session 6
eval harness (`manga-eval-harness.v1`) scoring the Session 5 accepted WMC
lane-C pages — scorecard artifacts `eval_scorecard` on the hs-arm run.

## The matrix

| lane | mechanism | image cost / page | text/vision cost / page | structural quality (measured) | judge quality (measured, M3 rubrics v1) | status |
|---|---|---|---|---|---|---|
| **A** — sprites + vector scenes | deterministic composition over transparent sprites + vector DSL; ZERO image calls | $0 | $0 (composition is code) | not yet measured — no accepted lane-A page exists; the compose-only stage (`manga_page_compose`) is the live entry point | not yet measured | mechanism live (DSL-only composition live-tested at zero budget in S5); sprite placement carried to S7 |
| **B** — budgeted key panel | one high-quality splash/money-shot image per page | $0.0388/panel (donor phase2 actuals: 2 accepted key panels, $0.0775631 exact) | vision QA $0.0004/call | not yet measured in this repo (donor images are the OCR red fixtures — both FAILED the text gate) | not yet measured | no accepted lane-B page yet; splash/spread pages route here by code policy |
| **C** — conditioned full-page inking | compiled-layout skeleton + reference sheets → one image call/page; code letters everything | **$0.039/page** (S5: 6 calls $0.2341125, equals the key delta to the digit); worst case with retries 2× | vision QA $0.0004/call; M3 judge $0.0005/page | border adherence **0.80 / 1.00**; Layout-IoU v1 **0.38 / 0.33** (see metric notes) | readability **4/5**, craft 3–4/5, **fidelity 1/5** (see the finding) | LIVE — both S5 WMC pages accepted attempt 1 under gates v2 |

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
