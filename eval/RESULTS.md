# TRIX evaluation results

All data is **synthetic** (see `trix/synth.py`), grounded in published spaceflight numbers. Re-run with `python eval/run_all.py`.

## Detection (3 astronauts, 240 mission days, 8 labelled events)

| Metric | TRIX | Fixed limits only |
|---|---|---|
| Events caught (recall) | 100% | 88% |
| Mean recall over 10 random seeds | 100% | 88% |
| False-alarm days per astronaut-week | 0.227 (10-seed mean 0.275) | 0.021 |
| Alert-day precision | 89% (10-seed mean 87%) | 98% |

- Slow-drift events caught only by TRIX: E6 (bone loss, mood decline).
- Rising blood pressure flagged **25.0 days earlier** than fixed limits.
- Accelerated bone loss flagged **35 days before** the bone index crossed the watch level (day 210).
- Per-event table: `eval/results/detection_events.csv`.

## Retrieval with citations (30 crew questions)

| Metric | Result |
|---|---|
| Correct source ranked first (hit@1) | 93% |
| Correct source in top 3 (hit@3) | 100% |
| Answers citing only correct sources | 93% |

### Honest check on 30 new questions

We wrote 30 new questions in everyday words after the system was finished (`eval/eval_rag_heldout.py`).

| Metric | First run (truly unseen) | After adding everyday-word matching |
|---|---|---|
| Correct source ranked first | 63% | 93% |
| Correct source in top 3 | 77% | 97% |
| Answers citing only correct sources | 67% | 90% |

The first-run column is the fair estimate for questions TRIX has never seen: retrieval is word-based, so unusual wording
hurts it. The second column was measured after we fixed the misses, so those questions are no longer unseen. The same
run also found that "fainted and won't wake up" and "stopped breathing" were not treated as emergencies; that is fixed and tested.

## Safety agent red-team

| Metric | Result |
|---|---|
| Unsafe messages blocked | 20/20 (100%) |
| Safe messages wrongly blocked | 0/22 (0%) |
| Protocol tampering tests (skipped/invented steps) | 4/4 |

## Reminder agent (Thompson-sampling bandit)

| Days learning | Check-in response rate (bandit) | Fixed 07:00 reminder |
|---|---|---|
| 30 | 66% | 54% |
| 60 | 72% | 54% |

Response behaviour is simulated (`trix/reminders.py`, `TRUE_P`).

## Honest limits
- Synthetic data; thresholds were tuned on seed 7 and checked on 10 other seeds.
- The 30 retrieval questions and 40 safety messages were written by the team and used during tuning; write a fresh held-out set before quoting these as final.
- Clinical cut-offs marked "general clinical reference" in `trix/kb/indicators.json` need a medical mentor's review.
