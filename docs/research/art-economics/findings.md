# Hybrid page-art economics — spike findings (2026-08-07)

Research spike for [#12](https://github.com/Legend101Zz/PanelSummary/issues/12).
Companion script: `spike_lane_c_inking.py` (lane C experiment: 2 conditioned attempts +
1 unconditioned control + OCR gate + lettering-composite demo).

## ⛔ Execution blocker (user action required)

The `OPENROUTER_API_KEY` in `backend/.env` is valid but **its total spend limit is
exhausted** (`limit: $9, limit_remaining: $0` from `GET /api/v1/key`; live probe returned
`403 Key limit exceeded`). No image generation is possible on this key until the limit is
raised in the OpenRouter dashboard (the 403 message links the key management page).

Once raised, run:

```bash
cd docs/research/art-economics
"../../../backend/.venv/bin/python" spike_lane_c_inking.py
# outputs: out/v1_conditioned_a{1,2}.png, out/v2_control_a1.png,
#          out/receipts.json (latency, usage/cost, OCR-gate verdicts),
#          out/*_lettered.png (deterministic lettering composited over lane-C art)
```

Estimated spend: 3 calls ≈ **$0.12** at the observed `google/gemini-2.5-flash-image` rate.

## Cost model (receipts-based, from prior evidence)

Observed unit costs (ScrollStack `NEXT_SESSION.md` §18/§20, immutable receipts):

- `google/gemini-2.5-flash-image` key panel (832×1248): **$0.0388/image** (n=4 receipts)
- Demo edition: 10 accepted panel images + 1 reference, incl. 3 rejected attempts →
  **$0.549 total** for a 5-page edition = **$0.11/page** at partial coverage
- Text stages (MiniMax): direction $0.017, page-writing $0.038, thumbnail $0.020 per scope

Projected for a 40-page manga (~6 panels/page average):

| Lane | Mechanism | Image calls | Est. image cost | Coverage |
|---|---|---|---|---|
| naive | 1 call per panel | ~240 (+rejects) | **~$9.40+** | full ❌ economics |
| A | sprites + vector scenes | 0 marginal (8-sprite library amortized) | ~$0.31 one-time | full, but flat visual ceiling |
| B | budgeted key panels (status quo) | ~10–30 | ~$0.40–1.20 | 2–3 illustrated panels/slice, rest DSL-only |
| **C** | conditioned full-page inking | ~40 (+retry margin) | **~$1.55–2.30** | **every panel illustrated** |

Lane C's bet: the compiled layout skeleton (from the layout-template spike) + character
reference sheets condition ONE call that inks the whole page; deterministic lettering
owns all text on top (composite demo included in the script). The control variant (V2,
no layout conditioning) measures whether conditioning actually buys panel-boundary
adherence — if V2 is as good, the mechanism is simpler than we think; if V1 wins,
conditioning is the USP.

## What the run must answer (protocol in the script)

1. **Boundary adherence**: does the generated page reproduce the skeleton's panels
   (visual + later Layout-IoU via #10)? 
2. **OCR gate**: does "NO text" hold? (tesseract `--psm 11`; known defect — the same
   model previously rendered forbidden headings; the gate + retry is the mitigation).
3. **Identity**: do Hem/Haw match the reference sheets across panels in one call?
4. **Retry economics**: does a rejected page (text found / boundaries broken) still keep
   lane C under lane B's cost at realistic reject rates? (break-even: lane C with 1 retry
   per page ≈ $3.10/book, still ~3× cheaper than naive.)

## Recommended default mix (pending live confirmation)

Per-page deterministic policy: **A** for quiet dialogue pages (tempo=hold, no action),
**C** for standard pages, **B high-quality key panel** for splash/page-turn money shots
(importance=page_turn). Preflight (issue #13) prices the mix before the run; target
**<$2/book** average.

## Inputs used

- Layout skeleton: `../layout-templates/golden/t_ref_rows_2_3_2.png` (One Piece-class 2/3/2)
- Character references: existing accepted WMC assets
  (`storage/images/manga_assets/6a0b5a5b201a8d03f1d82503/{haw,hem}__reference_sheet__front.png`)
- Panel briefs: 7-panel "empty cheese station" scene (WMC ch.2 class content)
