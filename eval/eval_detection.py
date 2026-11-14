"""Detection evaluation on labelled synthetic events.

Metrics
- Recall: share of labelled events with at least one matching alert in the event window (+2 days grace).
- Lead time (drift events): days between TRIX's first alert and the day a fixed-limit-only system would first alert.
- False alarms: alert-days outside any event window (±3 days), per astronaut-week.
- Alert-day precision: share of alert-days that fall inside an event window.
Compares TRIX (personal baselines + drift + multi-signal) with a fixed-limits-only baseline.
"""
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from trix import detect, synth  # noqa: E402

IND_MAP = {"bp": {"bp"}, "hr": {"hr"}, "hrv": {"hrv"}, "temp": {"temp"}, "skin": {"skin"}, "sleep": {"sleep"},
           "fatigue": {"fatigue"}, "mood": {"mood"}, "bone": {"bone"}, "co2": {"co2"}, "rad_daily": {"rad_daily"}}


def matches(ev, alerts):
    who = alerts if ev["who"] == "*" else alerts[alerts.who == ev["who"]]
    inds = set().union(*[IND_MAP.get(i, {i}) for i in ev["indicators"]]) | {"multi_signal"}
    hi = ev["end"] + 2
    return who[(who.day >= ev["start"]) & (who.day <= hi) & (who.indicator.isin(inds))]


def evaluate(alerts: pd.DataFrame, events: list, days: int, n_crew: int) -> dict:
    res, windows = [], []
    for ev in events:
        m = matches(ev, alerts)
        first = int(m.day.min()) if len(m) else None
        res.append({"id": ev["id"], "name": ev["name"], "kind": ev["kind"], "detected": first is not None, "first_alert_day": first,
                    "first_level": (m.sort_values("day").iloc[0].level if len(m) else None)})
        whos = list(alerts.who.unique()) if ev["who"] == "*" else [ev["who"]]
        for w in whos:
            windows.append((w, ev["start"] - 3, ev["end"] + 3))
    a = alerts.drop_duplicates(["who", "day"])
    inside = a.apply(lambda r: any(w == r.who and lo <= r.day <= hi for w, lo, hi in windows), axis=1) if len(a) else pd.Series(dtype=bool)
    fa_days = int((~inside).sum()) if len(a) else 0
    weeks = n_crew * (days - detect.ADAPT_DAYS) / 7
    return {"events": res, "recall": round(sum(r["detected"] for r in res) / len(res), 3),
            "false_alarm_days_per_astronaut_week": round(fa_days / weeks, 3),
            "alert_day_precision": round(float(inside.mean()), 3) if len(a) else None,
            "alert_days": int(len(a))}


def main():
    df, events = synth.generate(seed=7, out_dir=ROOT / "data")
    trix = detect.run(df, explain=False)
    fixed = detect.run(df, use_personal=False, use_drift=False, use_iforest=False, explain=False)
    rt, rf = evaluate(trix, events, synth.DAYS, len(synth.CREW)), evaluate(fixed, events, synth.DAYS, len(synth.CREW))
    rows = []
    for a, b in zip(rt["events"], rf["events"]):
        lead = (b["first_alert_day"] - a["first_alert_day"]) if (a["first_alert_day"] is not None and b["first_alert_day"] is not None) else None
        rows.append({"event": a["id"], "name": a["name"], "kind": a["kind"], "trix_first_day": a["first_alert_day"],
                     "fixed_limits_first_day": b["first_alert_day"], "trix_level": a["first_level"],
                     "lead_days_vs_fixed": lead if lead is not None else ("only TRIX" if a["detected"] and not b["detected"] else None)})
    table = pd.DataFrame(rows)
    leads = [r["lead_days_vs_fixed"] for r in rows if isinstance(r["lead_days_vs_fixed"], int) and r["kind"] == "drift"]
    summary = {
        "trix": {k: rt[k] for k in ("recall", "false_alarm_days_per_astronaut_week", "alert_day_precision", "alert_days")},
        "fixed_limits_only": {k: rf[k] for k in ("recall", "false_alarm_days_per_astronaut_week", "alert_day_precision", "alert_days")},
        "drift_events_mean_lead_days": round(sum(leads) / len(leads), 1) if leads else None,
        "drift_events_only_trix_caught": [r["event"] for r in rows if r["lead_days_vs_fixed"] == "only TRIX"],
    }
    # bone: day the measured index actually crosses the watch level vs TRIX's first alert
    c = df[(df.who == "C") & df.bone.notna()]
    crossed = c[c.bone <= 89.0].day.min()
    e4 = next(r for r in rows if r["event"] == "E4")
    summary["bone_watch_level_crossed_day"] = None if pd.isna(crossed) else int(crossed)
    summary["bone_lead_days"] = None if pd.isna(crossed) or e4["trix_first_day"] is None else int(crossed) - int(e4["trix_first_day"])
    # robustness over seeds
    seeds = []
    for sd in range(1, 11):
        d2, ev2 = synth.generate(seed=sd)
        t2 = evaluate(detect.run(d2, explain=False), ev2, synth.DAYS, len(synth.CREW))
        f2 = evaluate(detect.run(d2, use_personal=False, use_drift=False, use_iforest=False, explain=False), ev2, synth.DAYS, len(synth.CREW))
        seeds.append({"seed": sd, "trix_recall": t2["recall"], "fixed_recall": f2["recall"],
                      "trix_fa": t2["false_alarm_days_per_astronaut_week"], "trix_precision": t2["alert_day_precision"]})
    sdf = pd.DataFrame(seeds)
    summary["over_10_seeds"] = {"trix_recall_mean": round(sdf.trix_recall.mean(), 3), "fixed_recall_mean": round(sdf.fixed_recall.mean(), 3),
                                "trix_false_alarms_per_astronaut_week_mean": round(sdf.trix_fa.mean(), 3),
                                "trix_precision_mean": round(sdf.trix_precision.mean(), 3)}
    out = ROOT / "eval" / "results"
    out.mkdir(exist_ok=True)
    table.to_csv(out / "detection_events.csv", index=False)
    (out / "detection_summary.json").write_text(json.dumps(summary, indent=2))
    trix.to_csv(out / "alerts_trix.csv", index=False)
    print(table.to_string(index=False))
    print(json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    main()
