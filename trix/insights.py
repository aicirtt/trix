"""Links between the cabin and the crew's symptoms.

Cabin air and headaches: NASA found that each 1 mmHg rise in CO2 doubles the odds of a headache on the ISS and
that a 7-day average below 2.5 mmHg keeps the risk under 1% (Law et al. 2014, J Occup Environ Med 56(5):477-83).
TRIX compares headache days with the 7-day CO2 average for this crew, and shows where today sits on NASA's curve.
"""
import math

import pandas as pd

from . import store

SOURCE = {"title": "Law et al. 2014, Relationship between carbon dioxide levels and reported headaches on the ISS (J Occup Environ Med)",
          "url": "https://pubmed.ncbi.nlm.nih.gov/24806559/"}
WATCH = 2.5          # mmHg, 7-day average
ODDS_PER_MMHG = 2.0  # odds of headache double per 1 mmHg
BASE_RISK = 0.01     # about 1% at the 2.5 mmHg 7-day average


def nasa_risk(co2_7d: float) -> float:
    """Headache risk from NASA's finding, anchored at ~1% for a 2.5 mmHg 7-day average."""
    odds0 = BASE_RISK / (1 - BASE_RISK)
    odds = odds0 * ODDS_PER_MMHG ** (co2_7d - WATCH)
    return odds / (1 + odds)


def _daily(who: str | None = None) -> pd.DataFrame:
    """One row per astronaut-day: CO2, its 7-day average, and whether a headache was reported."""
    h = store.history_csv()
    rows = []
    for w in ([who] if who else sorted(h["who"].unique())):
        hw = h[h.who == w].set_index("day").sort_index()
        df = pd.DataFrame({"co2": hw["co2"], "headache": hw.get("headache", 0)})
        live = {}
        for r in store.live_readings(w):
            if r["indicator"] == "co2" and isinstance(r["value"], (int, float)):
                live.setdefault(r["day"], {})["co2"] = float(r["value"])
        for c in store.q("select ts, result from cases where who=?", (w,)):
            import json
            res = json.loads(c["result"])
            if "headache" in (res.get("symptoms") or "").lower():
                d = (res.get("readings") or {}).get("day", store.today())
                live.setdefault(int(d), {})["headache"] = 1
        for d, v in live.items():
            if d in df.index:
                for k, x in v.items():
                    df.loc[d, k] = max(df.loc[d, k], x) if k == "headache" and not pd.isna(df.loc[d, k]) else x
            else:
                df.loc[d] = {"co2": v.get("co2"), "headache": v.get("headache", 0)}
        df = df.sort_index()
        df["co2"] = df["co2"].ffill()
        df["co2_7d"] = df["co2"].rolling(7, min_periods=1).mean()
        df["headache"] = df["headache"].fillna(0).astype(int)
        df["who"] = w
        rows.append(df.reset_index().rename(columns={"index": "day"}))
    return pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()


def co2_headache(who: str | None = None) -> dict:
    d = _daily(who)
    if d.empty:
        return {"ok": False}
    hi = d[d.co2 >= WATCH]          # that day's CO2 (NASA also looked at 24-hour levels)
    lo = d[d.co2 < WATCH]
    rate_hi = float(hi.headache.mean()) if len(hi) else None
    rate_lo = float(lo.headache.mean()) if len(lo) else None
    now = float(d.sort_values("day").groupby("who").tail(1).co2_7d.mean())
    risk_now = nasa_risk(now)
    bins = []
    for a in [1.5, 2.0, 2.5, 3.0, 3.5]:
        sub = d[(d.co2 >= a) & (d.co2 < a + 0.5)]
        bins.append({"from": a, "to": a + 0.5, "days": int(len(sub)), "headache_days": int(sub.headache.sum()),
                     "rate": round(float(sub.headache.mean()), 3) if len(sub) else None,
                     "nasa_risk": round(nasa_risk(a + 0.25), 3)})
    n_head = int(d.headache.sum())
    if n_head == 0:
        finding = "No headaches reported yet, so there is nothing to link to cabin air."
    elif rate_hi is not None and (rate_lo or 0) < rate_hi:
        finding = (f"{int(hi.headache.sum())} of {n_head} headache days happened on days when cabin CO2 was at or above "
                   f"{WATCH} mmHg ({rate_hi:.0%} of those days, vs {(rate_lo or 0):.1%} below it). This matches NASA's finding.")
    else:
        finding = "Headaches in this crew do not follow CO2 so far. Other causes (fluid shift, sleep) are more likely."
    advice = ("Cabin CO2 is above the watch level. Ask the crew to check the scrubber and sleep near a ventilation outlet."
              if now >= WATCH else "Cabin CO2 is in the low-risk range.")
    return {"ok": True, "who": who or "crew", "days": int(len(d)), "headache_days": n_head,
            "rate_high": rate_hi, "rate_low": rate_lo, "days_high": int(len(hi)), "co2_7d_now": round(now, 2),
            "nasa_risk_now": round(risk_now, 4), "bins": bins, "finding": finding, "advice": advice,
            "small_sample": n_head < 10, "source": SOURCE,
            "curve": [{"co2": round(x / 10, 1), "risk": round(nasa_risk(x / 10), 4)} for x in range(10, 51, 2)]}


def headache_message(readings: dict, who: str | None) -> str | None:
    """Coach hint when someone reports a headache: is the cabin CO2 a likely cause?"""
    co2 = readings.get("co2")
    if co2 is None and who:
        last = store.latest(who).get("co2")
        co2 = last["value"] if last else None
    if co2 is None:
        return None
    if co2 >= WATCH:
        return (f"Headache with cabin CO2 at {co2:.1f} mmHg: high CO2 is a known cause in space. "
                "Move near a ventilation outlet, drink water, and ask the crew to check the CO2 scrubber.")
    return f"Cabin CO2 is {co2:.1f} mmHg, so it is probably not the cause. Drink water and rest; tell the crew medical officer if it lasts."
