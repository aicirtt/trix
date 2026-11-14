"""Crew motivation: check-in streaks, badges, a team goal and the daily buddy check.

Kept light on purpose: points reward doing the checks, never "good" numbers, so nobody is pushed to hide symptoms.
"""
import itertools

from . import store

CREW = {"A": {"name": "Astronaut A", "role": "Flight engineer"},
        "B": {"name": "Astronaut B", "role": "Commander · crew medical officer"},
        "C": {"name": "Astronaut C", "role": "Pilot"}}


def streak(who: str) -> int:
    days = store.checkin_days(who)
    d, n = store.today(), 0
    if d not in days:
        d -= 1           # today's check-in not done yet: count up to yesterday
    while d in days:
        n += 1
        d -= 1
    return n


def _logged_today(who: str) -> set[str]:
    return {r["indicator"] for r in store.live_readings(who, since_day=store.today())}


def badges(who: str) -> list[dict]:
    s = streak(who)
    today = _logged_today(who)
    practice = store.q("select max(score) as best, count(*) as n from practice where who=?", (who,))[0]
    fluid = sum(r["value"] for r in store.live_readings(who, since_day=store.today())
                if r["indicator"] == "fluid" and isinstance(r["value"], (int, float)))
    out = [
        {"id": "streak7", "name": "7-day streak", "got": s >= 7, "how": "Check in 7 days in a row"},
        {"id": "streak30", "name": "30-day streak", "got": s >= 30, "how": "Check in 30 days in a row"},
        {"id": "hydration", "name": "Hydration hero", "got": fluid >= 2000, "how": "Log 2 L of fluid in a day"},
        {"id": "eyes", "name": "Eye on SANS", "got": "vision" in today, "how": "Do the vision grid check"},
        {"id": "practice", "name": "Steady hands", "got": (practice["best"] or 0) >= 90, "how": "Score 90+ in a practice procedure"},
        {"id": "buddy", "name": "Good buddy", "got": bool(store.q("select 1 from buddy where who=? limit 1", (who,))),
         "how": "Check on your buddy"},
    ]
    return out


def points(who: str) -> int:
    return 10 * streak(who) + 25 * sum(b["got"] for b in badges(who))


def team_goal() -> dict:
    """Crew goal: everyone checks in every day this week."""
    t = store.today()
    week = range(t - 6, t + 1)
    done = sum(1 for who in CREW for d in week if d in store.checkin_days(who))
    total = len(CREW) * 7
    return {"name": "Everyone checks in every day this week", "done": done, "total": total,
            "pct": round(100 * done / total)}


def buddy_pairs(day: int | None = None) -> dict:
    """Rotate pairs daily so everyone checks on everyone: A->B->C->A, then reversed the next day."""
    d = store.today() if day is None else day
    crew = sorted(CREW)
    perms = [p for p in itertools.permutations(crew) if all(a != b for a, b in zip(crew, p))]
    p = perms[d % len(perms)]
    return dict(zip(crew, p))


def buddy_log(who: str, buddy: str, status: str, note: str = "") -> dict:
    store.x("insert into buddy(ts, day, who, buddy, status, note) values(strftime('%s','now'),?,?,?,?,?)",
            (store.today(), who, buddy, status, note))
    return {"ok": True}


def buddy_today() -> list[dict]:
    pairs = buddy_pairs()
    logged = {(r["who"]): r for r in store.q("select * from buddy where day=? order by ts", (store.today(),))}
    return [{"who": a, "buddy": b, "done": a in logged, "status": logged.get(a, {}).get("status")} for a, b in pairs.items()]


def board() -> list[dict]:
    return [{"who": w, **CREW[w], "streak": streak(w), "points": points(w), "badges": badges(w)} for w in CREW]


def cohesion() -> dict:
    """Simple crew-cohesion signal for the commander: average mood this week vs last week, plus buddy concerns.
    Crew-level only (no one's details), in line with the privacy settings."""
    t = store.today()
    def mood(lo, hi):
        vals = [p["value"] for w in CREW for p in store.series(w, "mood_raw") + store.series(w, "mood") if lo <= p["day"] <= hi]
        return sum(vals) / len(vals) if vals else None
    now, before = mood(t - 6, t), mood(t - 13, t - 7)
    concerns = store.q("select count(*) as n from buddy where status='concern' and day>=?", (t - 6,))[0]["n"]
    score = 50 if now is None else max(0, min(100, round((now - 1) / 4 * 100) - 10 * concerns))
    trend = None if now is None or before is None else round(now - before, 2)
    status = "green" if score >= 60 and (trend is None or trend > -0.4) else "amber"
    msg = ("Crew mood is steady." if status == "green" else
           "Crew mood is dipping. Plan a shared meal or a call with family, and keep buddy checks going.")
    return {"score": score, "mood_now": None if now is None else round(now, 2), "trend": trend,
            "buddy_concerns": concerns, "status": status, "message": msg}
