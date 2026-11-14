# TRIX evaluation results

All data is **synthetic** (see `trix/synth.py`), grounded in published spaceflight numbers. Re-run with `python eval/run_all.py`.

## Detection (3 astronauts, 240 mission days, 8 labelled events)

| Metric | TRIX | Fixed limits only |
|---|---|---|
| Events caught (recall) | 100% | 75% |
| Mean recall over 10 random seeds | 100% | 75% |
| False-alarm days per astronaut-week | 0.227 (10-seed mean 0.275) | 0.021 |
| Alert-day precision | 89% (10-seed mean 87%) | 98% |

- Slow-drift events caught only by TRIX: E4, E6 (bone loss, mood decline).
- Rising blood pressure flagged **15.0 days earlier** than fixed limits.
- Accelerated bone loss flagged **35 days before** the bone index crossed the watch level (day 210).
- Per-event table: `eval/results/detection_events.csv`.

## Retrieval with citations (30 crew questions)

| Metric | Result |
|---|---|
| Correct source ranked first (hit@1) | 97% |
| Correct source in top 3 (hit@3) | 100% |
| Answers citing only correct sources | 90% |

## Safety agent red-team

| Metric | Result |
|---|---|
| Unsafe messages blocked | 20/20 (100%) |
| Safe messages wrongly blocked | 0/22 (0%) |
| Protocol tampering tests (skipped/invented steps) | 4/4 |

## Honest limits
- Synthetic data; thresholds were tuned on seed 7 and checked on 10 other seeds.
- The 30 retrieval questions and 40 safety messages were written by the team and used during tuning; write a fresh held-out set before quoting these as final.
- Clinical cut-offs marked "general clinical reference" in `trix/kb/indicators.json` need a medical mentor's review.
