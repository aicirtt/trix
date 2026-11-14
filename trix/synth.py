"""Synthetic crew data grounded in published spaceflight findings, with labelled events.

Grounding (see trix/kb/indicators.json sources):
- Sleep ~6.1 h ± 0.67 on ISS (Barger et al. 2014)
- Weight-bearing bone loss ~1-1.5 %/month (NASA HRP; Lang et al. 2004)
- Cabin CO2 limit 3 mmHg 1-h average; headaches from ~2.8 mmHg (NASA-STD-3001 / OCHMO-TB-004)
- Fluid ≥2500 mL (M) / 2100 mL (F); calcium 1000-1200 mg (NASA JSC-67378)
Everything else uses healthy-adult ranges. All values are SIMULATED.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

DAYS = 240
CREW = {
    "A": {"role": "Mission specialist", "sex": "F", "hr": 64, "hrv": 52, "sys": 112, "dia": 72, "sleep": 6.3, "mood": 3.9, "bone_rate": 0.011},
    "B": {"role": "Commander", "sex": "M", "hr": 66, "hrv": 48, "sys": 116, "dia": 75, "sleep": 6.0, "mood": 4.0, "bone_rate": 0.012},
    "C": {"role": "Pilot", "sex": "F", "hr": 68, "hrv": 45, "sys": 114, "dia": 73, "sleep": 6.1, "mood": 3.8, "bone_rate": 0.013},
}

# Labelled events. 'kind': acute (sudden) or drift (slow). 'cross' = day an absolute rule would first fire.
EVENTS = [
    {"id": "E1", "who": "A", "kind": "acute", "name": "Irregular heart rhythm", "start": 180, "end": 180, "indicators": ["hr", "hrv"]},
    {"id": "E2", "who": "B", "kind": "acute", "name": "Fever and cold sore (viral reactivation)", "start": 95, "end": 98, "indicators": ["temp", "hr", "skin"]},
    {"id": "E3", "who": "C", "kind": "acute", "name": "Fatigue run", "start": 174, "end": 180, "indicators": ["sleep", "fatigue", "hrv", "mood"]},
    {"id": "E4", "who": "C", "kind": "drift", "name": "Accelerated bone loss after exercise drop", "start": 160, "end": 239, "indicators": ["bone"]},
    {"id": "E5", "who": "B", "kind": "drift", "name": "Rising blood pressure (persists)", "start": 118, "end": 239, "indicators": ["bp"]},
    {"id": "E6", "who": "A", "kind": "drift", "name": "Gradual mood decline", "start": 196, "end": 225, "indicators": ["mood", "hrv"]},
    {"id": "E7", "who": "*", "kind": "acute", "name": "CO2 spikes with headaches", "start": 176, "end": 180, "indicators": ["co2"]},
    {"id": "E8", "who": "*", "kind": "acute", "name": "Solar particle event", "start": 150, "end": 151, "indicators": ["rad_daily"]},
]


def generate(seed: int = 7, out_dir: str | Path | None = None) -> tuple[pd.DataFrame, list]:
    rng = np.random.default_rng(seed)
    d = np.arange(DAYS)
    # shared cabin signals
    co2 = np.clip(rng.normal(2.0, 0.25, DAYS), 1.2, None)
    for day in (176, 178, 180):
        co2[day] = rng.uniform(3.2, 3.6)
    rad = np.clip(rng.normal(1.0, 0.08, DAYS), 0.7, None)
    rad[150], rad[151] = 28.0, 9.0
    rows = []
    for who, p in CREW.items():
        n = lambda s: rng.normal(0, s, DAYS)
        adapt = np.where(d < 14, (14 - d) / 14, 0.0)  # early-flight adaptation
        hr = p["hr"] + 3 * adapt + n(2.2)
        hrv = p["hrv"] - 6 * adapt + n(4.0)
        sys_ = p["sys"] + n(4.0)
        dia = p["dia"] + n(3.0)
        spo2 = np.clip(98 + n(0.5), 94, 100)
        temp = 36.7 + n(0.12)
        glucose = 92 + n(5.0)
        sleep = np.clip(p["sleep"] + n(0.6) - 0.6 * adapt, 3.5, 9)
        mood = p["mood"] + n(0.35)
        perclos = np.clip(8 + n(1.6) + 3 * adapt, 2, None)
        fluid = (2600 if p["sex"] == "M" else 2250) + n(200)
        calcium = 1050 + n(130)
        rate = np.full(DAYS, p["bone_rate"])
        headache = np.zeros(DAYS, dtype=int)
        skin = np.zeros(DAYS, dtype=int)
        irregular = np.zeros(DAYS, dtype=int)

        if who == "A":
            hr[180] = 132; hrv[180] = p["hrv"] * 0.59; irregular[180] = 1
            for i, day in enumerate(range(196, 226)):
                mood[day] -= 0.06 * i
                hrv[day] -= 0.25 * i
        if who == "B":
            temp[95:99] = [38.3, 38.6, 38.1, 37.6]
            hr[95:99] += [12, 15, 9, 4]
            sleep[95:98] -= 0.8
            skin[96] = 1
            ramp = np.clip((d - 118) / 32, 0, 1)
            sys_ += 28 * ramp
            dia += 15 * ramp
        if who == "C":
            sleep[174:181] = rng.uniform(4.6, 5.3, 7)
            perclos[174:181] = rng.uniform(17, 23, 7)
            mood[176:181] -= 0.9
            hrv[174:181] *= 0.78
            rate[160:] = p["bone_rate"] * 2.2
            headache[[176, 178, 180]] = 1
        monthly = np.cumsum(rate / 30.0)
        bone = 100 * np.exp(-monthly) + n(0.12)
        # weekly / periodic measurements
        glucose[d % 7 != 0] = np.nan
        bone[d % 7 != 0] = np.nan
        for i in d:
            rows.append({
                "day": int(i), "who": who, "hr": round(hr[i], 1), "hrv": round(hrv[i], 1),
                "sys": round(sys_[i]), "dia": round(dia[i]), "spo2": round(spo2[i], 1), "temp": round(temp[i], 2),
                "glucose": None if np.isnan(glucose[i]) else round(glucose[i]), "sleep": round(sleep[i], 2),
                "mood": int(np.clip(round(mood[i]), 1, 5)), "mood_raw": round(float(mood[i]), 2),
                "fatigue": round(perclos[i], 1), "fluid": round(fluid[i]), "calcium": round(calcium[i]),
                "bone": None if np.isnan(bone[i]) else round(bone[i], 2), "co2": round(co2[i], 2), "rad_daily": round(rad[i], 2),
                "headache": int(headache[i]), "skin": int(skin[i]), "irregular_rhythm": int(irregular[i]),
            })
    df = pd.DataFrame(rows)
    events = [dict(e) for e in EVENTS]
    if out_dir:
        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)
        df.to_csv(out / "synthetic_daily.csv", index=False)
        (out / "events.json").write_text(json.dumps(events, indent=2))
    return df, events


if __name__ == "__main__":
    df, ev = generate(out_dir=Path(__file__).resolve().parents[1] / "data")
    print(df.shape, "rows written to data/synthetic_daily.csv;", len(ev), "labelled events")
