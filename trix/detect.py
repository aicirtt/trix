"""Detection: robust personal baselines, slow-drift (CUSUM), multi-signal anomaly (Isolation Forest + SHAP), forecast.

Pipeline per astronaut, per day:
 1. RobustBaseline: rolling median and MAD over the previous 30 days (adaptation days 0-13 excluded),
    robust z = (x - median) / (1.4826 * MAD). Confidence grows with the number of days available.
 2. Drift: one-sided CUSUM on residuals from a frozen reference period, for indicators that change slowly
    (bone, blood pressure, mood). A rolling baseline would 'learn' a slow drift and miss it.
 3. Multi-signal: Isolation Forest on the daily vector, trained on days 14-90; SHAP says which signals drove it.
 4. Escalation: every reading goes through escalation.assess() so the same rules drive the UI and the agents.
"""
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from . import escalation, kb

ADAPT_DAYS = 14
WINDOW = 30
MIN_SCALE = {"hr": 2.0, "hrv": 3.0, "sys": 3.0, "dia": 2.5, "spo2": 0.4, "temp": 0.1, "glucose": 4.0,
             "sleep": 0.45, "mood": 0.3, "fatigue": 1.2, "bone": 0.15}
COLUMN = {"mood": "mood_raw"}
DAILY = ["hr", "hrv", "sys", "dia", "spo2", "temp", "sleep", "mood", "fatigue"]
DRIFT = {"bone": "low", "sys": "high", "mood": "low"}


@dataclass
class Score:
    z: float | None
    confidence: float
    n: int
    median: float | None


class RobustBaseline:
    def __init__(self, series: pd.Series, name: str):
        self.s = series.astype(float)
        self.name = name

    def score(self, day: int) -> Score:
        hist = self.s.loc[max(ADAPT_DAYS, day - WINDOW):day - 1].dropna()
        x = self.s.get(day, np.nan)
        if len(hist) < 5 or np.isnan(x):
            return Score(None, 0.0, len(hist), None)
        med = float(hist.median())
        mad = float((hist - med).abs().median()) * 1.4826
        scale = max(mad, MIN_SCALE.get(self.name, 1e-6))
        return Score((x - med) / scale, round(min(1.0, len(hist) / 14), 2), len(hist), med)


def cusum(series: pd.Series, ref_end: int, direction: str, k: float = 0.5, h: float = 5.0,
          detrend: bool = False) -> pd.Series:
    """One-sided CUSUM on standardised residuals vs a frozen reference (days ADAPT_DAYS..ref_end).
    detrend=True removes the expected reference slope (bone is *expected* to fall ~1-1.5 %/month)."""
    s = series.astype(float).dropna()
    ref = s.loc[ADAPT_DAYS:ref_end]
    if detrend:
        b, a = np.polyfit(ref.index, ref.values, 1)
        resid = s - (a + b * s.index)
        ref_r = resid.loc[ADAPT_DAYS:ref_end]
    else:
        resid = s - ref.median()
        ref_r = resid.loc[ADAPT_DAYS:ref_end]
    sd = max(float(ref_r.std(ddof=1)), MIN_SCALE.get(series.name, 1e-6) * 0.6)
    zr = resid / sd
    if direction == "low":
        zr = -zr
    c, out = 0.0, {}
    for day, v in zr.items():
        c = max(0.0, c + v - k)
        out[day] = c
    return pd.Series(out) >= h


def forecast_cross(series: pd.Series, day: int, level: float, lookback: int = 42) -> int | None:
    s = series.astype(float).loc[max(0, day - lookback):day].dropna()
    if len(s) < 3:
        return None
    b, a = np.polyfit(s.index, s.values, 1)
    if b >= 0:
        return None
    cross = (level - a) / b
    return int(np.ceil(cross)) if cross > day else day


def explain_iforest(model: IsolationForest, X: pd.DataFrame, row: pd.Series) -> list[tuple[str, float]]:
    try:
        import shap
        sv = shap.TreeExplainer(model).shap_values(row.to_frame().T[X.columns])
        pairs = sorted(zip(X.columns, sv[0]), key=lambda t: t[1])  # most negative = pushes toward anomaly
        return [(c, round(float(v), 3)) for c, v in pairs[:3]]
    except Exception:  # fallback: largest standardised deviation
        z = ((row[X.columns] - X.median()) / (X.std() + 1e-9)).abs().sort_values(ascending=False)
        return [(c, round(float(v), 2)) for c, v in z.head(3).items()]


def run(df: pd.DataFrame, location: str = "mars", ref_end: int = 90, use_personal: bool = True,
        use_drift: bool = True, use_iforest: bool = True, explain: bool = True) -> pd.DataFrame:
    """Return one row per (day, who, indicator) alert at amber or above."""
    alerts = []
    for who, g in df.groupby("who"):
        g = g.set_index("day").sort_index()
        bases = {i: RobustBaseline(g[COLUMN.get(i, i)].rename(i), i) for i in DAILY + ["bone", "glucose"]}
        drift_flags = {i: cusum(g[COLUMN.get(i, i)].rename(i), ref_end, d, detrend=(i == "bone"))
                       for i, d in DRIFT.items()} if use_drift else {}
        streak: dict[str, int] = {}
        amber_run: dict[str, int] = {}
        iso = None
        if use_iforest:
            X = g.loc[ADAPT_DAYS:ref_end, [COLUMN.get(c, c) for c in DAILY]].dropna()
            iso = IsolationForest(n_estimators=200, contamination=0.01, random_state=0).fit(X)
            thr = np.percentile(iso.score_samples(X), 0.2)
        for day, r in g.iterrows():
            if day < ADAPT_DAYS:
                continue
            day_assess = []
            for ind in ["hr", "hrv", "bp", "spo2", "temp", "glucose", "sleep", "mood", "fatigue", "bone", "co2", "rad_daily", "skin"]:
                meta = kb.indicators()[ind]
                if ind == "bp":
                    value = {"sys": r["sys"], "dia": r["dia"]}
                    sc = bases["sys"].score(day) if use_personal else None
                    drift = bool(drift_flags.get("sys", pd.Series(dtype=bool)).get(day, False))
                elif ind == "co2":
                    value, sc, drift = r["co2"], None, False
                elif ind == "rad_daily":
                    value, sc, drift = None, None, False
                elif ind == "skin":
                    value, sc, drift = None, None, False
                else:
                    value = r[COLUMN.get(ind, ind)]
                    if value is None or (isinstance(value, float) and np.isnan(value)):
                        continue
                    sc = bases[ind].score(day) if (use_personal and ind in bases) else None
                    drift = bool(drift_flags.get(ind, pd.Series(dtype=bool)).get(day, False))
                personal = None
                if sc is not None and sc.z is not None:
                    rule = meta.get("personal", {})
                    thr_z, dirn = rule.get("amber_abs_z"), rule.get("direction")
                    breach = thr_z is not None and ((abs(sc.z) >= thr_z) if dirn is None else (sc.z <= -thr_z if dirn == "low" else sc.z >= thr_z))
                    streak[ind] = streak.get(ind, 0) + 1 if breach else 0
                    need = rule.get("min_days", 1)
                    personal = {"z": sc.z if streak[ind] >= need else 0.0, "confidence": sc.confidence}
                if drift:
                    personal = (personal or {"confidence": 1.0}) | {"drift": True}
                flags = set()
                if ind == "hr" and r.get("irregular_rhythm", 0):
                    flags.add("irregular_rhythm")
                # absolute-only cases with special handling
                if ind == "co2":
                    avg7 = g.loc[max(0, day - 6):day, "co2"].mean()
                    value = r["co2"]
                    a = escalation.assess("co2", None, location=location)
                    if value >= 3.0:
                        a.status, a.level = "red", "crew_medical_officer"; a.reasons = [f"1-h CO2 {value} mmHg > 3.0 limit"]
                        a.actions = meta["actions"]
                    elif avg7 >= 2.5:
                        a.status, a.level = "amber", "crew_medical_officer"; a.reasons = [f"7-day CO2 average {avg7:.2f} mmHg ≥ 2.5"]
                        a.actions = meta["actions"]
                    day_assess.append(a)
                    continue
                if ind == "rad_daily":
                    a = escalation.assess("rad_daily", None, location=location)
                    if r["rad_daily"] > 5:
                        a.status, a.level = "red", "emergency"; a.reasons = ["solar particle event: shelter"]; a.actions = meta["actions"]
                        a.route = "start Triage agents now; do not wait for Earth"
                    day_assess.append(a)
                    continue
                if ind == "skin":
                    a = escalation.assess("skin", None, location=location)
                    if r["skin"]:
                        a.status, a.level = "amber", "crew_medical_officer"; a.reasons = ["new lesion logged (photo + symptom)"]; a.actions = meta["actions"]
                    day_assess.append(a)
                    continue
                # persistence for absolute run rules (sleep, mood)
                ab = meta.get("absolute", {})
                persist = 0
                if "amber_low_run" in ab:
                    col = COLUMN.get(ind, ind)
                    recent = g.loc[max(ADAPT_DAYS, day - ab["amber_low_run"] + 1):day, col]
                    if len(recent) == ab["amber_low_run"] and (recent < ab["amber_low"]).all():
                        pass
                    elif value is not None and ind in ("sleep", "mood") and value < ab.get("amber_low", -1):
                        value = ab["amber_low"]  # single short night is not yet amber by the absolute rule
                a = escalation.assess(ind, value, personal, persistent_days=amber_run.get(ind, 0), flags=flags, location=location)
                amber_run[ind] = amber_run.get(ind, 0) + 1 if a.status != "green" else 0
                day_assess.append(a)

            for a in day_assess:
                if a.status != "green":
                    alerts.append({"day": day, "who": who, "indicator": a.indicator, "status": a.status, "level": a.level,
                                   "reasons": "; ".join(a.reasons), "confidence": a.confidence, "route": a.route,
                                   "body_part": kb.indicators()[a.indicator]["body_part"], "source": "rules"})
            if iso is not None:
                row = r[[COLUMN.get(c, c) for c in DAILY]]
                if row.notna().all():
                    s = iso.score_samples(row.to_frame().T.astype(float))[0]
                    if s < thr:
                        Xtr = g.loc[ADAPT_DAYS:ref_end, [COLUMN.get(c, c) for c in DAILY]].dropna()
                        drivers = explain_iforest(iso, Xtr, row.astype(float)) if explain else []
                        alerts.append({"day": day, "who": who, "indicator": "multi_signal", "status": "amber",
                                       "level": "self_care", "reasons": "unusual combination: " + ", ".join(c for c, _ in drivers),
                                       "confidence": 1.0, "route": "onboard", "body_part": "whole", "source": "iforest"})
    return pd.DataFrame(alerts)
