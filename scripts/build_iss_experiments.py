"""Build trix/kb/iss_experiments.json from NASA's Space Station Research Explorer "All Experiments Report".

Source file: https://www.nasa.gov/mission_pages/station/research/experiments/explorer/All_Experiments_Report.xlsx
(downloaded 15 Nov 2026, report generated 14 Nov 2026). Run: python scripts/build_iss_experiments.py
Keeps the Human Research experiments and links each to the TRIX indicators it studies, by keywords in its name."""
import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "source" / "iss_all_experiments_report.xlsx"
OUT = ROOT / "trix" / "kb" / "iss_experiments.json"

# indicator -> words in an experiment's short or full name that show it studies that indicator
KEYWORDS = {
    "bp": r"cardio|blood pressure|vascular|arter|orthostat|hemodynamic",
    "hr": r"cardio|heart|\becg\b|holter|cardiac",
    "hrv": r"heart rate variab|autonomic|cardiocog",
    "spo2": r"oxygen|\bo2\b|respirat|pulmonar|lung|breath",
    "temp": r"temperat|thermo|circadian",
    "glucose": r"glucose|insulin|metabol",
    "sleep": r"sleep|circadian|actigraph|lighting",
    "mood": r"behavio|psycholog|mood|mental|isolat|stress|team|crew interaction",
    "fatigue": r"fatigue|sleep|alertness|vigilan",
    "reaction": r"cognit|reaction|vigilan|performance|cogni\b",
    "vision": r"vision|ocular|\beye|retin|optic|intracran|\bicp\b|sans",
    "bone": r"bone|osteo|bisphosph|\bqct\b",
    "calcium": r"bone|calcium|osteo",
    "exercise": r"exercise|muscle|treadmill|\bcce\b|resistive",
    "mass": r"body mass|nutri|energy|food",
    "fluid": r"fluid|diure|sprut|hydrat|cephalad",
    "back_pain": r"spin|intervertebral|back pain|cervical|h-reflex",
    "skin": r"skin|derm",
    "rad_daily": r"radiat|dosim|dosmap|matroyshka|evarm|\bradi-n|neutron",
    "rad_career": r"radiat|dosim|dosmap|matroyshka|chromosome",
    "orthostatic": r"orthostat|stand|post-?flight|landing|functional task|field test",
    "co2": r"carbon dioxide|\bco2\b|air quality|cabin air",
}
EXPLORER = "https://www.nasa.gov/mission/station/research-explorer/"


def short_agency(a: str) -> str:
    m = re.search(r"\(([^)]+)\)\s*$", str(a))
    return m[1] if m else str(a)


def main(src: Path = SRC) -> dict:
    d = pd.read_excel(src, header=3).dropna(subset=["Short Name"])
    total = len(d)
    h = d[d["Category"].astype(str).str.contains("Human Research", na=False)].copy()
    h["name"] = h["Short Name"].fillna("").astype(str).str.strip()
    h["full"] = h["Full Name"].fillna("").astype(str).str.strip()
    h["agency"] = h["Sponsoring Space Agency"].fillna("").map(short_agency)
    h["exp"] = h["Expedition(s)"].fillna("").astype(str).str.strip()
    rows = [{"name": r["name"], "full": r["full"], "agency": r["agency"], "expeditions": r["exp"]} for r in h[["name", "full", "agency", "exp"]].to_dict("records")]
    by = {}
    for ind, rx in KEYWORDS.items():
        hit = [i for i, r in enumerate(rows) if re.search(rx, r["name"] + " " + r["full"], re.I)]
        by[ind] = hit
    agencies = h["agency"].value_counts().to_dict()
    out = {"source": {"title": "NASA Space Station Research Explorer: All Experiments Report (generated 14 Nov 2026)",
                      "url": "https://www.nasa.gov/mission_pages/station/research/experiments/explorer/All_Experiments_Report.xlsx",
                      "explorer": EXPLORER},
           "note": "Experiments are linked to indicators by keywords in their names, so a few links may be loose. The report lists what was studied, not results.",
           "total_experiments": total, "human_research": len(rows), "agencies": agencies,
           "experiments": rows, "by_indicator": by}
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    return out


if __name__ == "__main__":
    o = main(Path(sys.argv[1]) if len(sys.argv) > 1 else SRC)
    print(o["total_experiments"], "experiments,", o["human_research"], "human research;", o["agencies"])
    for k, v in o["by_indicator"].items():
        print(f"{k:12s} {len(v):3d}  " + "; ".join(o["experiments"][i]["name"] for i in v[:6]))
