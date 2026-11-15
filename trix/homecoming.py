"""Coming home: landing-day readiness and a recovery plan.

After months of weightlessness (or one-sixth gravity on the Moon) the body has adapted to the wrong gravity.
Landing day is when that shows: dizziness or fainting on standing, weaker bones and muscles, poor balance,
eye changes and the radiation dose collected over the mission. This module turns the readings TRIX already
has into one readiness score, a status per risk area and a plan for before, on and after landing.
It is a planning aid for the crew and flight surgeons, not a medical clearance."""
from __future__ import annotations

import numpy as np

from . import kb, store

# status -> points for the readiness score; "due" means no reading yet
POINTS = {"green": 100, "due": 70, "amber": 55, "red": 20}
WORD = {"green": "GO", "due": "DUE", "amber": "WATCH", "red": "NO-GO"}

DEST = {"iss": "Earth", "moon": "Earth", "rover": "Earth", "mars": "the surface of Mars"}
FROM = {"iss": "months of weightlessness", "moon": "months in one-sixth gravity", "rover": "months in one-sixth gravity",
        "mars": "months of weightlessness on the way to Mars"}


def _lim(ind: str) -> dict:
    return kb.indicators()[ind].get("absolute", {})


def _vals(who: str, col: str, since: int | None = None) -> list[float]:
    pts = store.series(who, col)
    return [p["value"] for p in pts if since is None or p["day"] >= since]


def _last(who: str, col: str):
    v = store.latest(who).get(col)
    return None if v is None else v["value"]


def _worst(*s: str) -> str:
    order = ["red", "amber", "due", "green"]
    return min(s, key=order.index)


def landing_day() -> int:
    """Planned landing day (mission day). Defaults to two weeks from today."""
    d = store.get("landing_day")
    return int(d) if d is not None else store.today() + 14


def set_landing(in_days: int) -> int:
    if not 0 <= in_days <= 400:
        raise ValueError("landing must be between 0 and 400 days away")
    store.put("landing_day", store.today() + int(in_days))
    return landing_day()


def save_stand_test(who: str, lying_hr: float, standing_hr: float, lying_sys: float, standing_sys: float) -> dict:
    """Store the result of the landing rehearsal stand test (LAND-01) as heart-rate rise and blood-pressure drop."""
    for v, lo, hi in ((lying_hr, 30, 200), (standing_hr, 30, 220), (lying_sys, 60, 250), (standing_sys, 50, 250)):
        if v is None or not lo <= float(v) <= hi:
            raise ValueError("check the numbers: heart rate 30-220 bpm, top blood pressure 50-250 mmHg")
    rise, drop = round(float(standing_hr) - float(lying_hr)), round(float(lying_sys) - float(standing_sys))
    store.add_readings(who, {"ortho_hr_rise": rise, "ortho_sys_drop": drop}, "stand test")
    return {"hr_rise": rise, "sys_drop": drop}


def _areas(who: str, loc: str, land: int) -> list[dict]:
    today = store.today()
    since = today - 13
    out = []

    # 1. heart and blood pressure on standing
    lim = _lim("orthostatic")
    rise, drop = _last(who, "ortho_hr_rise"), _last(who, "ortho_sys_drop")
    fluid = _vals(who, "fluid", since)
    fluid_avg = float(np.mean(fluid)) if fluid else None
    if rise is None:
        st, val = "due", "Stand test not done yet"
        why = "After landing, blood pools in the legs. Many astronauts feel dizzy or faint when they first stand."
        todo = "Do the stand test rehearsal (lie 2 minutes, stand 3 minutes) in the last two weeks."
    else:
        hit = (rise >= lim["amber_hr_rise"]) + (drop >= lim["amber_sys_drop"])
        st = "green" if hit == 0 else "amber" if hit == 1 else "red"
        val = f"Heart rate +{rise:g} bpm, top pressure -{drop:g} mmHg on standing"
        why = ("Your heart and blood pressure held steady when you stood up." if st == "green" else
               f"Your heart rate rose {rise:g} bpm and top pressure fell {drop:g} mmHg when you stood up. "
               f"A rise of {lim['amber_hr_rise']} bpm or a drop of {lim['amber_sys_drop']} mmHg means a higher risk of fainting after landing.")
        todo = ("Keep drinking well and repeat the test a few days before landing." if st == "green" else
                "Plan fluid loading and a compression garment with the flight surgeon; get up in stages after landing.")
    if fluid_avg is not None and fluid_avg < 2000:
        todo += f" You drank about {fluid_avg:.0f} mL a day lately: aim for more."
    out.append({"id": "standing", "name": "Standing up without fainting", "part": "heart", "status": st, "value": val,
                "why": why, "todo": todo, "procedure": "LAND-01", "source": "ORTHO_GCG"})

    # 2. bones
    s = store.series(who, "bone")
    lvl = _lim("bone")["forecast_watch_level"]
    if s:
        days = np.array([p["day"] for p in s if p["day"] >= today - 42], float)
        vals = np.array([p["value"] for p in s if p["day"] >= today - 42], float)
        now = s[-1]["value"]
        proj = float(np.polyval(np.polyfit(days, vals, 1), land)) if len(days) >= 3 else now
        st = "amber" if min(now, proj) <= lvl else "green"
        val = f"Bone index {now:.1f}% of pre-flight, about {proj:.1f}% by landing"
        why = (f"Bone index is at or heading below the {lvl:g}% watch level. Bones lose strength without the load of gravity, "
               "so falls and heavy lifting are riskier after landing." if st == "amber" else
               "Bone index is above the watch level. Bone still takes months to rebuild after landing.")
        todo = "Keep resistance exercise every day and calcium with meals. Ask for a bone scan after landing."
    else:
        st, val, why, todo = "due", "No bone readings", "Bones lose strength without gravity.", "Keep resistance exercise every day."
    out.append({"id": "bones", "name": "Bones", "part": "bones", "status": st, "value": val, "why": why, "todo": todo, "source": "HRP_BONE"})

    # 3. muscle: exercise minutes (logged) and body mass trend
    ex = _vals(who, "exercise", since)
    mass = _vals(who, "mass")
    amin = _lim("exercise")["amber_low"]
    if ex:
        avg = float(np.mean(ex))
        st = "amber" if avg < amin else "green"
        val = f"About {avg:.0f} min of exercise a day (last 2 weeks)"
    else:
        st, avg, val = "due", None, "No exercise logged in the last 2 weeks"
    if len(mass) >= 2 and mass[0] and (mass[-1] - mass[0]) / mass[0] < -0.05:
        st = _worst(st, "amber")
        val += f" · body mass down {100 * (mass[0] - mass[-1]) / mass[0]:.0f}%"
    out.append({"id": "muscle", "name": "Muscles and strength", "part": "bones", "status": st, "value": val,
                "why": "Leg and back muscles shrink without gravity, so walking and carrying your own weight feel hard at first.",
                "todo": f"Log your exercise each evening and aim for at least {amin} minutes a day until landing.", "source": "HRP_MUSCLE"})

    # 4. balance and reaction
    rt = _last(who, "reaction")
    rl = _lim("reaction")
    if rt is None:
        st, val = "due", "No reaction test yet"
    else:
        st = "red" if rt >= rl["red_high"] else "amber" if rt >= rl["amber_high"] else "green"
        val = f"Reaction time {rt:.0f} ms"
    out.append({"id": "balance", "name": "Balance and coordination", "part": "brain", "status": st, "value": val,
                "why": "The inner ear has to relearn which way is down. Walking, turning your head and judging distance can be off for days.",
                "todo": "Do the eyes-closed balance step of the stand test. No driving until a flight surgeon clears you.", "procedure": "LAND-01",
                "source": "HRP_RISKS"})

    # 5. eyes
    vis = _last(who, "vision")
    st = "due" if vis is None else "amber" if vis else "green"
    out.append({"id": "eyes", "name": "Eyes and vision", "part": "eyes", "status": st,
                "value": "No vision check yet" if vis is None else "Change seen on the vision grid" if vis else "No change on the vision grid",
                "why": "Fluid shifting to the head in weightlessness can change the back of the eye (SANS). Some changes last after landing.",
                "todo": "Do the vision grid before landing and book a full eye exam after landing.", "source": "SANS_EVIDENCE"})

    # 6. radiation total for the mission
    rl = _lim("rad_career")
    total = float(np.nansum(_vals(who, "rad_daily")))
    frac = total / rl["career_limit"]
    st = "amber" if frac >= rl["amber_fraction_of_limit"] else "green"
    out.append({"id": "radiation", "name": "Radiation dose", "part": "rad", "status": st,
                "value": f"{total:.0f} mSv this mission ({100 * frac:.0f}% of the {rl['career_limit']} mSv career limit)",
                "why": "Radiation does not hurt on landing day, but it adds to long-term cancer and heart risk, so it goes in your health record.",
                "todo": "Your dose record goes to the flight surgeons with your landing report.", "source": "STD3001_RAD"})

    # 7. spine
    bp = _last(who, "back_pain")
    bl = _lim("back_pain")
    st = "due" if bp is None else "red" if bp >= bl["red_high"] else "amber" if bp >= bl["amber_high"] else "green"
    out.append({"id": "spine", "name": "Back and spine", "part": "bones", "status": st,
                "value": "No back pain score yet" if bp is None else f"Back pain {bp:g} / 10",
                "why": "The spine lengthens without gravity. In the first weeks back, the discs are more easily injured.",
                "todo": "No heavy lifting or deep bending in the first weeks. Bend at the knees.", "source": "HRP_RISKS"})

    # 8. sleep and mood
    sl, md = _vals(who, "sleep", since), _vals(who, "mood", since)
    sla, mda = (float(np.mean(sl)) if sl else None), (float(np.mean(md)) if md else None)
    st = "due" if sla is None else "amber" if sla < _lim("sleep")["amber_low"] or (mda is not None and mda < 3) else "green"
    out.append({"id": "sleep", "name": "Sleep and mood", "part": "brain", "status": st,
                "value": "No sleep readings" if sla is None else f"About {sla:.1f} h sleep a night" + (f", mood {mda:.1f} / 5" if mda is not None else ""),
                "why": "Landing day is long and tiring, and coming home after isolation can be overwhelming as well as happy.",
                "todo": "Protect sleep in the last week and plan quiet time after landing.", "source": "BARGER_2014"})
    return out


def plan(loc: str, areas: list[dict]) -> list[dict]:
    """Recovery plan in phases; adds a line for every area that needs extra care."""
    mars = loc == "mars"
    extra = {a["id"]: a for a in areas if a["status"] in ("amber", "red")}
    before = ["Rehearse the stand test and keep exercising every day.", "Drink well. On landing day, take the fluid and salt the flight surgeon prescribes.",
              "Put on the compression garment before landing."]
    if "standing" in extra:
        before.insert(0, "Your stand test showed a big change: agree a fainting plan with the flight surgeon.")
    if "bones" in extra or "muscle" in extra:
        before.append("Add resistance exercise: your bone or muscle readings are low.")
    day0 = ["Stay seated until someone helps you. Get up in stages: lie, sit for a minute, then stand.",
            "Turn your head slowly. Nausea and dizziness are common.", "Do not lift anything heavy."]
    week1 = ["Walk with support at first. Practise balance a little every day.", "No driving until a flight surgeon clears you.",
             "Keep drinking well and sleep as much as you need."]
    later = ["Supervised reconditioning: strength, balance and fitness (about 45 days for space station crews).",
             "Bone scan and eye exam. Bone can take a year or more to recover.", "Talk to someone about how coming home feels."]
    if mars:
        day0[0] = "There is no ground crew on Mars: crewmates help each other up. Get up in stages: lie, sit for a minute, then stand."
        week1[1] = "No driving rovers or heavy work until the crew medical officer clears you."
        later[0] = "Reconditioning in the habitat: strength and balance every day with the exercise devices."
        later[1] = "Repeat the stand test and vision grid weekly while you adapt to Mars gravity."
    if "spine" in extra:
        week1.append("Your back pain is up: no bending to lift; ask about core exercises.")
    if "eyes" in extra:
        later.insert(1, "Your vision grid changed: ask for an eye exam soon after landing.")
    return [{"phase": "Before landing", "when": "last 2 weeks", "steps": before},
            {"phase": "Landing day", "when": "day 0", "steps": day0},
            {"phase": "First week", "when": "days 1-7", "steps": week1},
            {"phase": "Weeks to months", "when": "after", "steps": later}]


def readiness(who: str, loc: str) -> dict:
    land = landing_day()
    areas = _areas(who, loc, land)
    w = {"standing": 2, "bones": 1.5, "muscle": 1.5, "balance": 1.5}
    score = round(sum(POINTS[a["status"]] * w.get(a["id"], 1) for a in areas) / sum(w.get(a["id"], 1) for a in areas))
    reds, ambers = [a for a in areas if a["status"] == "red"], [a for a in areas if a["status"] == "amber"]
    level = "red" if reds or score < 60 else "amber" if ambers or score < 80 else "green"
    verdict = {"green": "Ready for landing", "amber": "Ready, with extra care", "red": "Needs a plan with the flight surgeon"}[level]
    body = {}
    for a in areas:
        p = body.setdefault(a["part"], {"status": "none", "areas": []})
        p["areas"].append(a["name"])
        if a["status"] != "due":
            p["status"] = a["status"] if p["status"] == "none" else _worst(p["status"], a["status"])
    src_all = kb.sources()
    for a in areas:
        s = src_all.get(a.get("source"))
        a["source"] = {"title": s["title"], "url": s.get("url")} if s else None
        a["word"] = WORD[a["status"]]
    return {"who": who, "today": store.today(), "landing_day": land, "days_to_landing": land - store.today(),
            "destination": DEST.get(loc, "Earth"), "after": FROM.get(loc, "months in space"),
            "score": score, "level": level, "verdict": verdict, "areas": areas, "body_map": body, "plan": plan(loc, areas),
            "note": "A planning aid from your onboard readings, not a medical clearance. The flight surgeon decides."}
