"""Daily care and Operations teams.

Daily care:  Check-in -> Detection -> Coach -> Reminder -> Safety  (-> handoff to Emergency if anything is red)
Operations:  Ops router -> (Pharmacy | Devices | Privacy) -> Safety -> Report
"""
import json
from pathlib import Path

import pandas as pd
from langgraph.graph import END, StateGraph

from . import detect, escalation, kb, office, rag, reminders
from .shared import report_node, safety_node, settings_for
from .state import State

KB = Path(__file__).parent / "kb"
DATA = Path(__file__).resolve().parents[1] / "data" / "synthetic_daily.csv"
_BANDIT, _ = reminders.simulate(days=30)
_R = None


def retriever():
    global _R
    if _R is None:
        _R = rag.Retriever()
    return _R


def _history(who: str | None) -> pd.DataFrame | None:
    """Past daily data for this astronaut, or None (new or unknown crew member: absolute limits only)."""
    if not who or not DATA.exists():
        return None
    df = pd.read_csv(DATA)
    h = df[df.who == who].set_index("day").sort_index()
    return h if len(h) else None


# ---------------- Daily care ----------------
DC = "Daily care"


@office.traced("Check-in", DC)
def checkin(state: State) -> State:
    r = state.get("readings") or {}
    devices = {d["id"]: d for d in json.loads((KB / "devices.json").read_text())["devices"]}
    feeds = sorted({d["name"] for d in devices.values() for f in d["feeds"] if f in r or (f == "bp" and "sys" in r)})
    office.tool("devices.read", sorted(r), feeds)
    office.current().result({"readings": len(r), "devices": len(feeds)})
    return state


@office.traced("Detection", DC)
def detection(state: State) -> State:
    who, r, loc = state.get("who"), state.get("readings") or {}, state.get("location", "mars")
    hist = _history(who)
    day = int(r.get("day", hist.index.max() + 1 if hist is not None else 0))
    out = []
    for ind, col in (("hr", "hr"), ("hrv", "hrv"), ("spo2", "spo2"), ("temp", "temp"), ("sleep", "sleep"),
                     ("mood", "mood_raw"), ("fatigue", "fatigue"), ("glucose", "glucose")):
        key = "mood" if ind == "mood" else ind
        if key not in r:
            continue
        personal = None
        if hist is not None and col in hist:
            s = pd.concat([hist[col], pd.Series({day: r[key]})]).rename(ind)
            sc = detect.RobustBaseline(s, ind).score(day)
            personal = {"z": sc.z, "confidence": sc.confidence} if sc.z is not None else None
        flags = {"irregular_rhythm"} if (ind == "hr" and r.get("irregular_rhythm")) else set()
        a = escalation.assess(ind, r[key], personal, flags=flags, location=loc)
        out.append(a)
    if "sys" in r:
        out.append(escalation.assess("bp", {"sys": r["sys"], "dia": r.get("dia")}, location=loc))
    # the other indicators (vision, skin, fluid, calcium, CO2, bone, radiation, stand test) use fixed limits
    done = {"hr", "hrv", "spo2", "temp", "sleep", "mood", "fatigue", "glucose", "bp"}
    for ind in kb.indicators():
        if ind not in done and ind in r:
            out.append(escalation.assess(ind, r[ind], location=loc))
    if not r:
        state["baseline"] = "no readings"
    elif hist is None:
        state["baseline"] = "standard limits only"  # new or unknown crew member: no personal history yet
    else:
        state["baseline"] = "personal"
    office.tool("detect.RobustBaseline + escalation.assess", len(out), {a.indicator: a.status for a in out if a.status != "green"})
    state["assessments"] = [{"indicator": a.indicator, "status": a.status, "level": a.level, "reasons": a.reasons,
                             "confidence": a.confidence, "route": a.route} for a in out]
    state["body_map"] = escalation.combine(out)
    worst = max((a.rank for a in out), default=0)
    state["handoff"] = worst >= escalation.RANK["emergency"] or any(a.status == "red" for a in out if a.indicator in ("hr", "spo2"))
    if state["handoff"]:
        state["vitals"] = {k: r[k] for k in ("hr", "spo2", "temp") if k in r}
        state["flags"] = (["irregular_rhythm"] if r.get("irregular_rhythm") else []) + \
            (["solar_event"] if any(a.indicator == "rad_daily" and a.status == "red" for a in out) else [])
    flagged = {k: v["status"] for k, v in state["body_map"].items() if v["status"] != "green"}
    office.current().result({"flagged": flagged, "handoff_to_emergency": state["handoff"]})
    return state


@office.traced("Coach", DC)
def coach(state: State) -> State:
    msgs, learn = [], []
    for a in state.get("assessments", []):
        if a["status"] == "green":
            continue
        from . import kb
        ind = kb.indicators()[a["indicator"]]
        msgs.append(f"{ind['name']}: {ind['actions'][0]}.")
        hits = retriever().search(f"{ind['name']} {ind['space_effect']}", k=1)
        office.tool("rag.search", ind["name"], hits[0]["doc_id"] if hits else None)
        if hits:
            learn.append({"indicator": a["indicator"], "text": hits[0]["text"][:220], "source": hits[0]["title"], "url": hits[0]["url"]})
    if not msgs:
        base = state.get("baseline")
        if base == "no readings":
            msgs = ["No readings yet. Start your check-in so TRIX can look at today's numbers."]
        elif base == "standard limits only":
            msgs = ["Within standard limits. TRIX is still learning your personal normal, so keep checking in."]
        else:
            msgs = ["Everything is within your normal range today."]
    state["coach"] = {"messages": msgs, "learn": learn}
    office.current().result({"tips": len(msgs), "learn_cards": len(learn)})
    return state


@office.traced("Reminder", DC)
def reminder(state: State) -> State:
    who = state.get("who")
    best = _BANDIT.best(who) if who in reminders.TRUE_P else {"slot": "07:00", "p_respond": None, "observations": 0}
    office.tool("ReminderBandit.best", who, best)
    state["reminder"] = {"next_checkin": best["slot"], "learned_from_days": best["observations"] // 1, "p_respond": best["p_respond"]}
    office.current().result(state["reminder"])
    return state


def build_daily():
    g = StateGraph(State)
    for name, fn in [("checkin", checkin), ("detection", detection), ("coach", coach), ("reminder", reminder),
                     ("safety", safety_node(DC)), ("report", report_node(DC))]:
        g.add_node(name, fn)
    g.set_entry_point("checkin")
    g.add_edge("checkin", "detection")
    g.add_edge("detection", "coach")
    g.add_edge("coach", "reminder")
    g.add_edge("reminder", "safety")
    g.add_edge("safety", "report")
    g.add_edge("report", END)
    return g.compile()


# ---------------- Operations ----------------
OPS = "Operations"


@office.traced("Ops router", OPS)
def ops_router(state: State) -> State:
    office.current().result({"route": state.get("event")})
    return state


@office.traced("Pharmacy", OPS)
def pharmacy(state: State) -> State:
    data = json.loads((KB / "pharmacy.json").read_text())
    today = (state.get("request") or {}).get("day", 180)
    end = data["mission_end_day"]
    rows, msgs = [], []
    for it in data["items"]:
        runs_out = None if it["daily_use"] == 0 else today + it["stock"] / it["daily_use"]
        flags = []
        if runs_out is not None and runs_out < end:
            flags.append(f"runs out ~day {int(runs_out)}")
        if it["expiry_day"] < end:
            flags.append(f"label expiry day {it['expiry_day']}")
        if it["radiation_sensitive"]:
            flags.append("check potency (radiation)")
        rows.append({"name": it["name"], "stock": it["stock"], "flags": flags})
        if flags:
            msgs.append(f"{it['name']}: {'; '.join(flags)}. Tell the crew medical officer.")
    state["ops"] = {"pharmacy": rows, "messages": msgs}
    office.tool("pharmacy.forecast", f"{len(rows)} items to day {end}", f"{len(msgs)} flagged")
    office.current().result({"items": len(rows), "flagged": len(msgs)})
    return state


@office.traced("Devices", OPS)
def devices(state: State) -> State:
    d = json.loads((KB / "devices.json").read_text())["devices"]
    from . import store
    d = d + store.get("devices:live", [])  # e.g. a Bluetooth heart-rate strap paired in the app
    state["ops"] = {"devices": [{"id": x.get("id"), "name": x["name"], "status": x["status"], "feeds": x.get("feeds", [])} for x in d],
                    "messages": []}
    office.current().result({"devices": len(d), "offline": sum(x["status"] == "offline" for x in d)})
    return state


@office.traced("Privacy", OPS)
def privacy(state: State) -> State:
    who = state.get("who")
    req = (state.get("request") or {}).get("set", {})
    cur = settings_for(who) | req
    if req and who:
        from . import store
        store.put(f"privacy:{who}", store.get(f"privacy:{who}", {}) | req)
        office.tool("store.put", f"privacy:{who}", sorted(req))
    state["ops"] = {"privacy": {"who": who, "settings": cur}, "messages": []}
    office.current().result({"who": who, "changed": sorted(req)})
    return state


def build_ops():
    g = StateGraph(State)
    for name, fn in [("router", ops_router), ("pharmacy", pharmacy), ("devices", devices), ("privacy", privacy),
                     ("safety", safety_node(OPS)), ("report", report_node(OPS))]:
        g.add_node(name, fn)
    g.set_entry_point("router")
    # every path, including a plain report request, goes through the shared Safety gate
    g.add_conditional_edges("router", lambda s: {"pharmacy": "pharmacy", "devices": "devices", "privacy": "privacy"}.get(s.get("event"), "safety"),
                            {"pharmacy": "pharmacy", "devices": "devices", "privacy": "privacy", "safety": "safety"})
    for k in ("pharmacy", "devices", "privacy"):
        g.add_edge(k, "safety")
    g.add_edge("safety", "report")
    g.add_edge("report", END)
    return g.compile()
