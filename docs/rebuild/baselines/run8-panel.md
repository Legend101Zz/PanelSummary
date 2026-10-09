# Judge panel report: Run 8 re-judged by the 3-judge Sonnet panel

3 judge(s), 46 pages. Strict ship bar: **7/46**; judges' majority `ships`: 12/46; mean >= 3.5 with no criterion below 3: 16.

Overall mean (panel means): **3.47** (exact 3.4728).

## Criteria

| Criterion | Mean | Pages below 3 |
|---|---|---|
| legibility | 3.48 | 1 |
| reading_flow | 3.97 | 3 |
| speaker_attribution | 3.64 | 3 |
| continuity | 2.88 | 22 |
| variety | 3.64 | 0 |
| page_turn | 3.38 | 2 |
| fidelity | 3.34 | 6 |
| beat_without_prose_wall | 3.44 | 3 |

## Defects

Total 549 (183.0 per judge). By owner: writer 280, renderer 185, plan 68, understanding 16. By severity: blocker 25, major 245, minor 279. Blockers by owner: writer 13, renderer 8, plan 2, understanding 2.

## Sections (tales)

| Section | Pages | Mean | Strict ships |
|---|---|---|---|
| s1 | 13 | 3.35 | 1 |
| s2 | 6 | 3.63 | 1 |
| s3 | 6 | 3.28 | 0 |
| s4 | 11 | 3.55 | 2 |
| s5 | 10 | 3.58 | 3 |

## Comparison with baseline run8

Overall delta +0.10; strict ships delta +2; defects delta +291 (-75.00 per judge).

| Criterion | Delta |
|---|---|
| legibility | +0.17 |
| reading_flow | -0.44 |
| speaker_attribution | -0.18 |
| continuity | +0.45 |
| variety | +0.07 |
| page_turn | -0.05 |
| fidelity | +0.41 |
| beat_without_prose_wall | +0.36 |

### Gate 2

- PASS: ship_bar_pages_above_baseline ({'value': 7, 'baseline': 5})
- PASS: overall_mean_above_3.37 ({'value': 3.47282609, 'bar': 3.37})
- PASS: continuity_above_2.43 ({'value': 2.88405797, 'bar': 2.43})
- FAIL: no_criterion_more_than_0.2_below_baseline ({'worst_delta': -0.442, 'failing': ['reading_flow']})

**Gate 2: FAIL**

**Warning:** Different instrument: 3 judge(s) now, 1 in the baseline. A score change can come from the panel, not from the code.

## Pages

| Page | Section | Status | Mean | Strict | Majority | Weakest criterion |
|---|---|---|---|---|---|---|
| 1 | s1 | accepted | 3.58 | no | no | page_turn 3.0 |
| 2 | s1 | accepted | 2.75 | no | no | legibility 2.0 |
| 3 | s1 | accepted | 3.58 | no | no | speaker_attribution 2.33 |
| 4 | s1 | accepted | 3.42 | no | no | continuity 2.67 |
| 5 | s1 | accepted | 3.29 | no | no | continuity 2.67 |
| 6 | s1 | accepted | 3.46 | no | no | continuity 2.67 |
| 7 | s1 | accepted | 3.29 | no | no | continuity 2.0 |
| 8 | s1 | accepted | 3.92 | yes | yes | continuity 3.33 |
| 9 | s1 | accepted | 3.04 | no | no | continuity 2.0 |
| 10 | s1 | accepted | 3.25 | no | no | continuity 2.0 |
| 11 | s1 | accepted | 3.5 | no | no | legibility 3.0 |
| 12 | s1 | accepted | 3.29 | no | no | legibility 3.0 |
| 13 | s1 | accepted | 3.13 | no | no | continuity 2.33 |
| 14 | s2 | accepted | 3.54 | no | no | continuity 3.0 |
| 15 | s2 | accepted | 3.67 | no | no | continuity 3.0 |
| 16 | s2 | accepted | 3.67 | no | no | continuity 3.0 |
| 17 | s2 | accepted | 3.54 | no | no | beat_without_prose_wall 2.67 |
| 18 | s2 | accepted | 3.54 | no | yes | continuity 2.67 |
| 19 | s2 | accepted | 3.79 | yes | yes | continuity 3.0 |
| 20 | s3 | accepted | 3.38 | no | no | speaker_attribution 3.0 |
| 21 | s3 | accepted | 3.29 | no | no | continuity 3.0 |
| 22 | s3 | accepted | 3.33 | no | no | continuity 2.67 |
| 23 | s3 | accepted | 3.29 | no | no | continuity 2.67 |
| 24 | s3 | accepted | 3.21 | no | no | continuity 2.67 |
| 25 | s3 | accepted | 3.17 | no | no | reading_flow 2.33 |
| 26 | s4 | accepted | 3.58 | no | no | continuity 3.0 |
| 27 | s4 | accepted | 3.54 | no | no | variety 3.0 |
| 28 | s4 | accepted | 3.63 | no | yes | continuity 2.67 |
| 29 | s4 | accepted | 3.71 | yes | yes | continuity 3.0 |
| 30 | s4 | accepted | 3.38 | no | no | continuity 2.33 |
| 31 | s4 | accepted | 3.67 | yes | yes | continuity 3.0 |
| 32 | s4 | accepted | 3.29 | no | no | continuity 2.67 |
| 33 | s4 | accepted | 3.88 | no | yes | continuity 2.67 |
| 34 | s4 | accepted | 3.46 | no | no | legibility 3.0 |
| 35 | s4 | accepted | 3.63 | no | no | continuity 2.67 |
| 36 | s4 | accepted | 3.29 | no | no | reading_flow 2.0 |
| 37 | s5 | accepted | 3.46 | no | no | continuity 2.67 |
| 38 | s5 | accepted | 3.96 | yes | yes | continuity 3.33 |
| 39 | s5 | accepted | 3.63 | no | no | page_turn 3.0 |
| 40 | s5 | accepted | 3.63 | no | yes | page_turn 3.0 |
| 41 | s5 | accepted | 4.04 | yes | yes | legibility 4.0 |
| 42 | s5 | accepted | 3.29 | no | no | reading_flow 2.67 |
| 43 | s5 | accepted | 3.67 | yes | yes | speaker_attribution 3.0 |
| 44 | s5 | accepted | 3.29 | no | no | page_turn 2.67 |
| 45 | s5 | accepted | 3.83 | no | yes | continuity 2.67 |
| 46 | s5 | accepted | 3.0 | no | no | continuity 2.0 |
