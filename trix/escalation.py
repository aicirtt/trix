"""Escalation ladder: turns a reading (+ personal-baseline result) into a level, reasons and actions.

Levels: 0 normal, 1 self_care, 2 crew_medical_officer, 3 flight_surgeon, 4 emergency.
"""
from dataclasses import dataclass, field

from . import kb

ORDER = ["normal", "self_care", "crew_medical_officer", "flight_surgeon", "flight_surgeon_private", "emergency"]
RANK = {"normal": 0, "self_care": 1, "crew_medical_officer": 2, "flight_surgeon": 3, "flight_surgeon_private": 3, "emergency": 4}


@dataclass
class Assessment:
    indicator: str
    status: str                 # green / amber / red
    level: str                  # ladder key
    reasons: list = field(default_factory=list)
    actions: list = field(default_factory=list)
    confidence: float = 1.0
    sources: list = field(default_factory=list)
    route: str = ""             # how the level reaches people at this location

    @property
    def rank(self) -> int:
        return RANK[self.level]


def _bump(level: str) -> str:
    nxt = {"normal": "self_care", "self_care": "crew_medical_officer", "crew_medical_officer": "flight_surgeon",
           "flight_surgeon": "emergency", "flight_surgeon_private": "flight_surgeon_private", "emergency": "emergency"}
    return nxt[level]


def _absolute(ind: dict, value) -> tuple[str, list]:
    """Return ('red'|'amber'|'green', reasons) from fixed limits."""
    a, why = ind.get("absolute", {}), []
    status = "green"

    def hit(s, msg):
        nonlocal status
        if s == "red" or (s == "amber" and status == "green"):
            status = s
        why.append(msg)

    # indicators whose limits are not a plain high/low number
    if "amber_hr_rise" in a and isinstance(value, dict):  # stand test: {"hr_rise": 32, "sys_drop": 12}
        if value.get("hr_rise") is not None and value["hr_rise"] >= a["amber_hr_rise"]:
            hit("amber", f"heart rate rose {value['hr_rise']} bpm on standing (≥ {a['amber_hr_rise']})")
        if value.get("sys_drop") is not None and value["sys_drop"] >= a["amber_sys_drop"]:
            hit("amber", f"systolic fell {value['sys_drop']} mmHg on standing (≥ {a['amber_sys_drop']})")
        return status, why
    if "red_1h_avg" in a and value is not None:  # cabin CO2, 1-hour average in mmHg
        if value > a["red_1h_avg"]:
            hit("red", f"CO2 {value} mmHg above the {a['red_1h_avg']} mmHg 1-hour limit (NASA-STD-3001)")
        elif value >= a["amber_7d_avg"]:
            hit("amber", f"CO2 {value} mmHg at or above the {a['amber_7d_avg']} mmHg watch level")
        return status, why
    if "forecast_watch_level" in a and value is not None:  # bone density, % of pre-flight
        if value <= a["forecast_watch_level"]:
            hit("amber", f"bone density {value}% of pre-flight, at or below the {a['forecast_watch_level']}% watch level")
        return status, why
    if "career_limit" in a and value is not None:  # career radiation dose, mSv
        if value >= a["career_limit"]:
            hit("red", f"{value} mSv reaches the {a['career_limit']} mSv career limit")
        elif value >= a["amber_fraction_of_limit"] * a["career_limit"]:
            hit("amber", f"{value} mSv is over {int(a['amber_fraction_of_limit'] * 100)}% of the career limit")
        return status, why
    if ("red_flag" in a or "amber_flag" in a or "red_solar_event" in a) and not isinstance(value, dict):
        # yes/no or short-text reports: vision, skin, solar events
        text = str(value).lower() if value not in (None, False, 0) else ""
        red_words = {"vision": ("loss", "lost", "can't see", "cannot see"), "skin": ("fever",),
                     "rad_daily": ("storm", "shelter", "in progress")}.get(ind.get("id", ""), ())
        if text in ("", "none", "no", "false", "0"):
            return status, why
        if any(w in text for w in red_words):
            hit("red", f"reported: {value}")
        else:
            hit("amber", f"reported: {value}")
        return status, why

    if isinstance(value, dict):  # e.g. blood pressure
        for lim, s in (("red_high", "red"), ("amber_high", "amber")):
            for k, v in a.get(lim, {}).items():
                if value.get(k) is not None and value[k] >= v:
                    hit(s, f"{k} {value[k]} ≥ {v} {ind['unit']}")
        for k, v in a.get("red_low", {}).items():
            if value.get(k) is not None and value[k] <= v:
                hit("red", f"{k} {value[k]} ≤ {v} {ind['unit']}")
        return status, why

    if value is None:
        return status, why
    if "red_high" in a and value >= a["red_high"]:
        hit("red", f"{value} ≥ red limit {a['red_high']} {ind['unit']}")
    elif "amber_high" in a and value >= a["amber_high"]:
        hit("amber", f"{value} ≥ {a['amber_high']} {ind['unit']}")
    if "red_low" in a and value <= a["red_low"]:
        hit("red", f"{value} ≤ red limit {a['red_low']} {ind['unit']}")
    elif "amber_low" in a and value < a["amber_low"]:
        hit("amber", f"{value} below {a['amber_low']} {ind['unit']}")
    return status, why


def assess(indicator_id: str, value, personal: dict | None = None, persistent_days: int = 0,
           flags: set | None = None, location: str = "mars") -> Assessment:
    """personal: output of detect.RobustBaseline.score(), e.g. {'z': -2.8, 'confidence': 0.9, 'n': 30}.
    flags: special events, e.g. {'irregular_rhythm'} or {'behavioral_concern'}."""
    ind = kb.indicators()[indicator_id]
    esc = ind.get("escalation", {})
    flags = flags or set()
    status, reasons = _absolute(ind, value)

    conf = 1.0
    if personal:
        conf = personal.get("confidence", 1.0)
        rule = ind.get("personal", {})
        z = personal.get("z")
        thr = rule.get("amber_abs_z")
        if z is not None and thr is not None:
            d = rule.get("direction")
            breach = (abs(z) >= thr) if d is None else (z <= -thr if d == "low" else z >= thr)
            if breach:
                if status == "green":
                    status = "amber"
                reasons.append(f"{abs(z):.1f} robust SDs {'below' if z < 0 else 'above'} your normal")
        if personal.get("drift"):
            if status == "green":
                status = "amber"
            reasons.append("slow downward drift detected (CUSUM)")

    lvl = "normal"
    if status == "amber":
        lvl = esc.get("amber", "self_care")
        for key, target in esc.items():
            if key.startswith("amber_persistent_"):
                need = int(key.rsplit("_", 1)[1].rstrip("d"))
                if persistent_days >= need and RANK[target] > RANK[lvl]:
                    lvl = target
                    reasons.append(f"amber for {persistent_days} days")
    elif status == "red":
        lvl = esc.get("red", "flight_surgeon")
        for key, target in esc.items():
            if key.startswith("red_persistent_"):
                need = int(key.rsplit("_", 1)[1].rstrip("d"))
                if persistent_days >= need and RANK[target] > RANK[lvl]:
                    lvl = target
    for f in flags:
        if f in esc:
            status = "red" if esc[f] == "emergency" else status
            if RANK[esc[f]] >= RANK[lvl]:
                lvl = esc[f]
            reasons.append(f.replace("_", " "))

    if conf < 0.5 and RANK[lvl] > RANK["self_care"] and lvl != "emergency":
        lvl = "self_care"
        reasons.append("low confidence: please re-measure before escalating")

    loc = kb.ladder()["locations"][location]
    route = {
        "flight_surgeon": "live consult now" if loc["live_consult"] else "queued for next Earth link window (priority)",
        "flight_surgeon_private": "private live call" if loc["live_consult"] else "private message, next link window",
        "emergency": "start Triage agents now; do not wait for Earth",
    }.get(lvl, "onboard")
    return Assessment(indicator_id, status, lvl, reasons, ind.get("actions", []) if status != "green" else [],
                      round(conf, 2), kb.cite(indicator_id), route)


def combine(assessments: list[Assessment]) -> dict:
    """Rule: two different amber indicators on the same body part escalate one level."""
    by_part: dict[str, list[Assessment]] = {}
    for a in assessments:
        by_part.setdefault(kb.indicators()[a.indicator]["body_part"], []).append(a)
    out = {}
    for part, items in by_part.items():
        top = max(items, key=lambda x: x.rank)
        lvl = top.level
        ambers = [x for x in items if x.status != "green"]
        if len(ambers) >= 2 and lvl not in ("emergency",):
            lvl = _bump(lvl)
        status = "red" if any(x.status == "red" for x in items) else ("amber" if ambers else "green")
        out[part] = {"status": status, "level": lvl, "drivers": [x.indicator for x in ambers]}
    return out
