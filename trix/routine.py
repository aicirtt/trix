"""The daily routine: what TRIX asks for and when, how to do each measurement, what the astronaut gets back,
the alertness and strain trend, and the talk-to-TRIX assistant that routes speech to the agents."""
import re
import statistics as st

import pandas as pd

from . import escalation, game, kb, store, voice

# item id -> (label, minutes, where the app opens it)
ITEMS = {
    "sleep": ("Sleep last night", 0.3, "capture"), "hr": ("Heart rate", 0.5, "capture"), "bp": ("Blood pressure", 1, "capture"),
    "temp": ("Temperature", 0.5, "capture"), "glucose": ("Blood sugar", 1, "capture"), "spo2": ("Blood oxygen", 0.5, "capture"),
    "fatigue": ("Face scan", 0.5, "checkin/2"), "voice": ("Voice check", 0.3, "checkin/2"), "reaction": ("Reaction test", 1, "capture"),
    "mood": ("Mood", 0.2, "capture"), "exercise": ("Exercise done today", 0.3, "capture"), "food": ("Food and water", 0.5, "checkin/4"),
    "buddy": ("Buddy check", 1, "crew"), "vision": ("Vision grid", 1, "checkin/3"), "mass": ("Body mass", 0.5, "capture"),
    "back_pain": ("Back pain", 0.2, "capture"),
}
MORNING = ["sleep", "hr", "bp", "temp", "glucose", "spo2", "fatigue", "voice", "reaction"]
EVENING = ["mood", "exercise", "food", "buddy"]
WEEKLY = ["vision", "mass", "back_pain"]
SIX = ["bp", "hr", "glucose", "temp", "sleep", "mood"]          # the measurements the NASA challenge names
EVENING_AT = "21:00"

HOWTO = {
    "sleep": ["Check your sleep watch, or think back to when you fell asleep and woke.", "Enter the hours you actually slept, not time in the sleep station.", "TRIX compares it with your own usual sleep."],
    "hr": ["Sit still and strapped in for 1 minute.", "Read your wearable, or count your pulse for 30 seconds and double it.", "Enter the number, or let the Bluetooth strap send it."],
    "bp": ["Rest for 5 minutes with your arm at heart level.", "Wrap the cuff on bare skin above the elbow and press start. Stay still and quiet.", "Enter the top and bottom numbers."],
    "temp": ["Wait 15 minutes after exercise, food or a hot drink.", "Hold the thermometer in place until it beeps.", "Enter the number."],
    "glucose": ["Wash and dry your hands.", "Prick the side of a fingertip and touch the strip to the drop.", "Wait for the meter and enter the number."],
    "spo2": ["Warm your hand and keep it still.", "Clip the sensor on a fingertip without nail polish and wait 20 seconds.", "Enter the steady number."],
    "reaction": ["Hold the tablet steady with both hands.", "Wait for the box to turn bright, then tap it as fast as you can.", "Do not guess: tapping early counts as a false start. 8 rounds."],
    "mood": ["Take one slow breath.", "Pick the number that fits how you feel right now.", "There is no right answer. Details stay private unless you choose to share."],
    "exercise": ["Add up today's exercise blocks (resistance, bike, treadmill).", "Enter the total minutes.", "TRIX links it to your bone and muscle trend."],
    "mass": ["Use the body mass device at the same time of day each week.", "Stay still until it gives a steady number.", "Enter the number in kilograms."],
    "back_pain": ["Notice your back for a moment while you stretch gently.", "0 is no pain, 10 is the worst you can imagine.", "Pick the number for right now."],
}
RANGE = {"sleep": (0, 14), "hr": (25, 220), "sys": (60, 250), "dia": (30, 150), "temp": (33, 42), "glucose": (30, 500), "spo2": (60, 100),
         "reaction": (120, 2000), "mood": (1, 5), "exercise": (0, 300), "mass": (30, 200), "back_pain": (0, 10)}
COL = {"bp": "sys", "mood": "mood_raw"}


def _done_today(who: str) -> set[str]:
    done = {r["indicator"] for r in store.live_readings(who, since_day=store.today())}
    if "sys" in done:
        done.add("bp")
    if "fluid" in done:
        done.add("food")
    if store.q("select 1 from buddy where who=? and day=?", (who, store.today())):
        done.add("buddy")
    return done


def _done_week(who: str) -> set[str]:
    return {r["indicator"] for r in store.live_readings(who, since_day=store.today() - 6)}


def _item(i: str, done: bool) -> dict:
    label, minutes, where = ITEMS[i]
    return {"id": i, "label": label, "minutes": minutes, "done": done,
            "go": f"#/capture/{i}" if where == "capture" else f"#/{where}"}


def readiness(view: dict, ring_done: int) -> int:
    """Readiness for the next critical task (0-100): today's status colours plus how complete today's checks are."""
    bm = view.get("body_map", {})
    amber = sum(v["status"] == "amber" for v in bm.values())
    red = sum(v["status"] == "red" for v in bm.values())
    return int(max(0, min(100, 70 + 30 * ring_done / len(SIX) - 6 * amber - 18 * red)))


def routine(who: str, view: dict, slot: str, now_min: int | None = None) -> dict:
    done, week = _done_today(who), _done_week(who)
    sessions = [
        {"id": "morning", "name": "Morning check", "at": slot, "items": [_item(i, i in done) for i in MORNING]},
        {"id": "evening", "name": "Evening check", "at": EVENING_AT, "items": [_item(i, i in done) for i in EVENING]},
        {"id": "weekly", "name": "This week", "at": "any day", "items": [_item(i, i in week) for i in WEEKLY]},
    ]
    events = []
    for a in view.get("assessments", []):
        if a["status"] != "green" and a["indicator"] in ITEMS and ITEMS[a["indicator"]][2] == "capture" and a["indicator"] not in ("mood", "exercise", "sleep"):
            ind = kb.indicators()[a["indicator"]]
            events.append({"id": a["indicator"], "label": f"Re-check {ind['name'].split(' (')[0].lower()}", "minutes": ITEMS[a["indicator"]][1],
                           "why": (a.get("reasons") or ["it was outside your normal"])[0], "go": f"#/capture/{a['indicator']}", "status": a["status"]})
    ring = sum(i in done for i in SIX)
    prompt = None
    if now_min is not None:
        def mins(t):
            h, m = t.split(":")
            return int(h) * 60 + int(m)
        for s in sessions[:2]:
            todo = [x for x in s["items"] if not x["done"]]
            if todo and now_min >= mins(s["at"]):
                left = round(sum(x["minutes"] for x in todo) + 0.4)
                prompt = {"session": s["id"], "title": f"{s['name']}: {todo[0]['label']}", "item": todo[0], "remaining": len(todo), "minutes": max(1, left),
                          "why": ("Fills your day ring" if todo[0]["id"] in SIX else "Part of your routine") + f" · {len(todo)} left, about {max(1, left)} min"}
                break
    for s in sessions:
        s["done"] = sum(x["done"] for x in s["items"])
    return {"sessions": sessions, "events": events[:3], "ring": {"done": ring, "of": len(SIX)}, "prompt": prompt,
            "readiness": readiness(view, ring), "xp_per_item": 20}


def next_item(who: str, after: str) -> dict | None:
    done = _done_today(who) | {after}
    for group in (MORNING, EVENING):
        if after in group:
            for i in group:
                if i not in done:
                    return _item(i, False)
    return None


# ------------------------------------------------------------------ what you get back
def _personal(who: str, ind: str):
    col = COL.get(ind, ind)
    pts = [p["value"] for p in store.series(who, col)]
    if ind == "mood":
        pts += [p["value"] for p in store.series(who, "mood")]
    return pts


def meaning(who: str, ind: str, value) -> dict:
    """Plain-words meaning of a value: status, your own usual range, and the limits as a colour bar."""
    k = kb.indicators()[ind]
    v = {"sys": value.get("sys"), "dia": value.get("dia")} if ind == "bp" else value
    a = escalation.assess(ind, v)
    hist = _personal(who, ind)[:-1][-30:]
    usual = None
    if len(hist) >= 5:
        q = pd.Series(hist).quantile([0.1, 0.9])
        usual = [round(float(q.iloc[0]), 1), round(float(q.iloc[1]), 1)]
    word = {"green": "GO", "amber": "WATCH", "red": "NO-GO"}[a.status]
    shown = f"{round(v['sys'])}/{round(v['dia'])}" if ind == "bp" and v.get("dia") is not None else (round(v["sys"]) if ind == "bp" else f"{float(value):g}")
    text = f"{shown} is {word}."
    if a.status == "green":
        text += " It is inside the healthy range" + (f" and close to your own usual {usual[0]} to {usual[1]}." if usual else ".")
    else:
        text += f" {a.reasons[0].capitalize() if a.reasons else 'Outside the usual range'}. {k['actions'][0]}."
    return {"status": a.status, "word": word, "text": text, "usual": usual, "limits": k.get("absolute", {}), "level": a.level}


def insight(who: str, ind: str, view: dict) -> dict:
    """One personal sentence after a measurement, plus the progress it earned."""
    k = kb.indicators()[ind]
    name = k["name"].split(" (")[0]
    pts = _personal(who, ind)
    line = f"{name} saved."
    if len(pts) >= 8:
        last, prev = pts[-1], pts[-8:-1]
        med = st.median(prev)
        diff = last - med
        spread = (max(prev) - min(prev)) or 1
        if abs(diff) <= 0.5 * spread:
            line = f"Your {name.lower()} is right where it has been all week."
        else:
            line = f"Your {name.lower()} is {'higher' if diff > 0 else 'lower'} than your last 7 readings (usually about {round(med, 1)} {k['unit']})."
    elif pts:
        line = f"First {name.lower()} logged in TRIX. After a few more, TRIX compares you with your own normal."
    worst = [a for a in view.get("assessments", []) if a["status"] != "green" and a["indicator"] != ind]
    focus = None
    if worst:
        w = max(worst, key=lambda a: a["status"] == "red")
        wk = kb.indicators()[w["indicator"]]
        focus = f"The thing to work on today is {wk['name'].split(' (')[0].lower()}: {wk['actions'][0].lower()}."
    return {"line": line, "focus": focus, "series": pts[-30:], "unit": k["unit"], "name": name}


# ------------------------------------------------------------------ alertness and strain trend
def overview(who: str, days: int = 30) -> dict:
    """Daily sleep, mood, alertness and strain (0-100), each compared with this astronaut's own normal."""
    def ser(col):
        return pd.Series({p["day"]: p["value"] for p in store.series(who, col)}, dtype=float)
    s = {k: ser(c) for k, c in {"sleep": "sleep", "mood": "mood_raw", "fatigue": "fatigue", "hrv": "hrv", "reaction": "reaction"}.items()}
    mood_live = ser("mood")
    if len(mood_live):
        s["mood"] = pd.concat([s["mood"], mood_live]).groupby(level=0).last()

    def z(x, bad_high):
        if len(x.dropna()) < 5:
            return pd.Series(dtype=float)
        med = x.rolling(30, min_periods=5).median().shift(1)
        mad = (x - med).abs().rolling(30, min_periods=5).median().shift(1) * 1.4826
        zz = (x - med) / mad.replace(0, float("nan"))
        return (zz if bad_high else -zz).clip(-3, 4)
    alert_parts = pd.concat([z(s["fatigue"], True), z(s["reaction"], True), z(s["sleep"], False)], axis=1)
    strain_parts = pd.concat([z(s["sleep"], False), z(s["mood"], False), z(s["hrv"], False), z(s["fatigue"], True), z(s["reaction"], True)], axis=1)
    alert = (100 - 50 - 14 * alert_parts.mean(axis=1) + 30).clip(0, 100)      # 80 = your normal
    strain = (25 + 16 * strain_parts.mean(axis=1)).clip(0, 100)               # 25 = your normal
    end = int(max((x.index.max() for x in s.values() if len(x)), default=store.today()))
    idx = range(end - days + 1, end + 1)
    def out(x, nd=1):
        return [None if d not in x.index or pd.isna(x.get(d)) else round(float(x.get(d)), nd) for d in idx]
    last_strain = next((v for v in reversed(out(strain)) if v is not None), None)
    last_alert = next((v for v in reversed(out(alert)) if v is not None), None)
    status = "green" if (last_strain or 0) < 45 else "amber" if last_strain < 65 else "red"
    msg = {"green": "Strain is at your normal level.", "amber": "Strain is above your normal. Protect sleep and take your rest block today.",
           "red": "Strain is well above your normal. Rest, and talk to the crew medical officer."}[status]
    return {"days": list(idx), "sleep": out(s["sleep"]), "mood": out(s["mood"]), "alertness": out(alert, 0), "strain": out(strain, 0),
            "now": {"strain": last_strain, "alertness": last_alert, "status": status, "message": msg},
            "note": "Built from sleep, mood, heart-rate variability, eye closure and reaction time, each against your own normal. Not an emotion detector."}


# ------------------------------------------------------------------ talk to TRIX
EMERGENCY = re.compile(r"unresponsive|unconscious|not breathing|stopped breathing|isn'?t breathing|no pulse|lifeless|(won'?t|doesn'?t|not|can'?t) (wake|respond|responding|waking)|chest\b.{0,20}(pain|tight|pressure|hurt|crush)|(pain|tight|pressure).{0,12}chest|can'?t breathe|short of breath|collapsed|passed out|"
                       r"bleeding|solar storm|heart (is )?(racing|flutter|skipping)|irregular|emergency|help me", re.I)
NAV = [(r"(?=.*\b(start|do|begin|open)\b)(?=.*\b(check[- ]?in|morning check|evening check))", "#/checkin", "Opening your check-in."),   # verb before or after the noun (Korean, Hindi)
       (r"reaction test|alertness test", "#/capture/reaction", "Opening the reaction test."),
       (r"\b(trend|chart|graph|overview)", "#/body", "Opening your trends."),
       (r"agent (tree|log|office)|who decided|what did the agents", "#/office", "Opening the agent tree."),
       (r"\b(ecg|procedure|cpr|ultrasound)", "#/care", "Opening procedures."),
       (r"\b(crew|buddy|streak|badge)", "#/crew", "Opening the crew screen."),
       (r"earth|report|space weather|delay", "#/earth", "Opening the Earth link."),
       (r"\b(home|deck|dashboard)\b", "#/today", "Back to your deck."),
       (r"\b(sos|emergency screen)\b", "#/emergency", "Opening the emergency screen.")]
MEASURE_VERB = re.compile(r"\b(measure|take|record|enter|log|capture)\b", re.I)
SHOW_VERB = re.compile(r"\b(open|show|pull up|bring up|go to|display|see)\b", re.I)
ALIAS = {"sleep": "sleep", "heart rate": "hr", "pulse": "hr", "blood pressure": "bp", "pressure": "bp", "sugar": "glucose", "glucose": "glucose",
         "temperature": "temp", "oxygen": "spo2", "mood": "mood", "bone": "bone", "co2": "co2", "air": "co2", "reaction": "reaction",
         "fatigue": "fatigue", "vision": "vision", "eyes": "vision", "radiation": "rad_daily", "water": "fluid", "calcium": "calcium"}
SYMPTOM = re.compile(r"headache|dizzy|nause|rash|tingl|numb|blur|cough|itch|lonely|stress|anxious|sore|pain|sick|tired|can'?t sleep", re.I)


def intent(text: str) -> dict:
    """Decide what the astronaut wants. The API then hands it to the right agents."""
    t = text.strip()
    low = t.lower()
    if not t:
        return {"kind": "empty"}
    if EMERGENCY.search(low):
        return {"kind": "emergency"}
    parsed = voice.parse(t)
    question = bool(re.match(r"\s*(why|what|how|when|is|are|should|can|do|does|tell me|explain)\b", low)) or low.endswith("?")
    if parsed["readings"] and not question:
        return {"kind": "log", "readings": parsed["readings"], "symptoms": parsed["symptoms"]}
    for pat, go, say in NAV:
        if re.search(pat, low) and not question:
            return {"kind": "navigate", "go": go, "say": say}
    if not question and (MEASURE_VERB.search(low) or SHOW_VERB.search(low)):
        for word, ind in ALIAS.items():
            if word in low:                                   # a measurement by name: its guided screen, or its trend
                go = f"#/capture/{ind}" if ind in HOWTO and not SHOW_VERB.search(low) else f"#/body/{ind}"
                return {"kind": "navigate", "go": go, "say": f"Opening {word}."}
    if question and re.search(r"\b(my|am i|i am|me)\b", low):
        for word, ind in ALIAS.items():
            if word in low:
                return {"kind": "status", "indicator": ind}
        if re.search(r"how am i|my (status|health)|am i (ok|okay|fine)", low):
            return {"kind": "summary"}
    if SYMPTOM.search(low) and not question:
        return {"kind": "symptom", "symptoms": t}
    return {"kind": "ask", "question": t}


# ------------------------------------------------------------------ simulated devices
# The demo has no real BP cuff, oximeter, glucose meter... so these devices are simulated: a reading is drawn
# around this astronaut's own recent values. Every such reading is labelled "simulated device".
DEVICE = {"hr": "Holter ECG", "bp": "BP cuff", "spo2": "Pulse oximeter", "temp": "Thermometer", "glucose": "Glucose meter",
          "sleep": "Sleep watch", "mass": "Body mass device", "exercise": "Exercise device log", "co2": "Cabin air sensors"}
_DEFAULT = {"mass": (72.0, 0.3), "exercise": (110, 15), "glucose": (92, 4), "co2": (2.0, 0.2)}
_ROUND = {"hr": 0, "sys": 0, "dia": 0, "spo2": 0, "temp": 1, "glucose": 0, "sleep": 1, "mass": 1, "exercise": 0, "co2": 2}


def _draw(who: str, col: str) -> float:
    import random
    vals = [p["value"] for p in store.series(who, col)][-14:]
    if len(vals) >= 5:
        med = st.median(vals)
        sd = max(st.pstdev(vals) * 0.6, abs(med) * 0.004)
    else:
        med, sd = _DEFAULT.get(col, (0, 1))
    lo, hi = RANGE.get(col, (-1e9, 1e9))
    v = round(min(hi, max(lo, random.gauss(med, sd))), _ROUND.get(col, 1))
    return int(v) if _ROUND.get(col, 1) == 0 else v


def device_read(who: str, ind: str) -> dict | None:
    if ind not in DEVICE:
        return None
    vals = {"sys": _draw(who, "sys"), "dia": _draw(who, "dia")} if ind == "bp" else {ind: _draw(who, ind)}
    return {"indicator": ind, "device": DEVICE[ind], "values": vals, "simulated": True}
