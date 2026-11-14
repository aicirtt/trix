"""Run every evaluation and write eval/RESULTS.md (numbers for the pitch)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "eval"))
import eval_detection  # noqa: E402
import eval_rag  # noqa: E402
import eval_safety  # noqa: E402

d, r, s = eval_detection.main(), eval_rag.main(), eval_safety.main()
t, f, seeds = d["trix"], d["fixed_limits_only"], d["over_10_seeds"]
md = f"""# TRIX evaluation results

All data is **synthetic** (see `trix/synth.py`), grounded in published spaceflight numbers. Re-run with `python eval/run_all.py`.

## Detection (3 astronauts, 240 mission days, 8 labelled events)

| Metric | TRIX | Fixed limits only |
|---|---|---|
| Events caught (recall) | {t['recall']:.0%} | {f['recall']:.0%} |
| Mean recall over 10 random seeds | {seeds['trix_recall_mean']:.0%} | {seeds['fixed_recall_mean']:.0%} |
| False-alarm days per astronaut-week | {t['false_alarm_days_per_astronaut_week']} (10-seed mean {seeds['trix_false_alarms_per_astronaut_week_mean']}) | {f['false_alarm_days_per_astronaut_week']} |
| Alert-day precision | {t['alert_day_precision']:.0%} (10-seed mean {seeds['trix_precision_mean']:.0%}) | {f['alert_day_precision']:.0%} |

- Slow-drift events caught only by TRIX: {', '.join(d['drift_events_only_trix_caught'])} (bone loss, mood decline).
- Rising blood pressure flagged **{d['drift_events_mean_lead_days']} days earlier** than fixed limits.
- Accelerated bone loss flagged **{d['bone_lead_days']} days before** the bone index crossed the watch level (day {d['bone_watch_level_crossed_day']}).
- Per-event table: `eval/results/detection_events.csv`.

## Retrieval with citations ({r['questions']} crew questions)

| Metric | Result |
|---|---|
| Correct source ranked first (hit@1) | {r['hit@1']:.0%} |
| Correct source in top 3 (hit@3) | {r['hit@3']:.0%} |
| Answers citing only correct sources | {r['citation_accuracy']:.0%} |

## Safety agent red-team

| Metric | Result |
|---|---|
| Unsafe messages blocked | {s['blocked']}/{s['unsafe_messages']} ({s['block_rate']:.0%}) |
| Safe messages wrongly blocked | {s['false_blocks']}/{s['safe_messages']} ({s['false_block_rate']:.0%}) |
| Protocol tampering tests (skipped/invented steps) | {s['plan_tamper_tests_passed']} |

## Honest limits
- Synthetic data; thresholds were tuned on seed 7 and checked on 10 other seeds.
- The 30 retrieval questions and 40 safety messages were written by the team and used during tuning; write a fresh held-out set before quoting these as final.
- Clinical cut-offs marked "general clinical reference" in `trix/kb/indicators.json` need a medical mentor's review.
"""
(ROOT / "eval" / "RESULTS.md").write_text(md)
print("\nWrote eval/RESULTS.md")
