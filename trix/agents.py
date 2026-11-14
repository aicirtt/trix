"""Emergency team: Triage -> (Cardiac | First aid | Mental health | Radiation | General) -> Flight Surgeon
-> Procedure -> Safety (shared) -> Report (shared, Operations).

- Each specialist retrieves from the knowledge base (cited) and chooses a protocol from the approved library.
- The Flight Surgeon agent decides: act onboard now, or consult Earth (depends on urgency and link delay).
- The Procedure agent opens a step-locked session for the helper (detail level depends on their training).
- Every node is traced to the agent office (trigger, tools used, result, time).
"""
import time

from langgraph.graph import END, StateGraph

from . import escalation, kb, llm, office, protocols, rag
from .state import State

TEAM = "Emergency"
_R = None


def retriever() -> rag.Retriever:
    global _R
    if _R is None:
        _R = rag.Retriever()
    return _R


def _log(state, agent, msg, **extra):
    state.setdefault("trace", []).append({"t": time.strftime("%H:%M:%S"), "agent": agent, "msg": msg} | extra)


@office.traced("Triage", TEAM)
def triage(state: State) -> State:
    flags, v, text = set(state.get("flags", [])), state.get("vitals", {}), state.get("symptoms", "").lower()
    loc = state.get("location", "mars")
    assessments = []
    for ind, key in (("hr", "hr"), ("spo2", "spo2"), ("temp", "temp")):
        if key in v:
            a = escalation.assess(ind, v[key], flags=flags & {"irregular_rhythm"} if ind == "hr" else set(), location=loc)
            office.tool("escalation.assess", {ind: v[key]}, {"status": a.status, "level": a.level})
            assessments.append(a)
    top = max(assessments, key=lambda a: a.rank) if assessments else None
    urgency = top.level if top else "self_care"
    if any(k in text for k in ("unresponsive", "not breathing", "no pulse")):
        urgency, route = "emergency", "cardiac"
    elif "irregular_rhythm" in flags or any(k in text for k in ("chest", "flutter", "palpitation", "heart")):
        route = "cardiac"
    elif "solar_event" in flags:
        route = "radiation"
    elif any(k in text for k in ("cut", "burn", "bleed", "hit my", "spacewalk", "eva")):
        route = "first_aid"
    elif any(k in text for k in ("sad", "anxious", "can't cope", "hopeless", "lonely", "stress")):
        route = "mental"
    else:
        route = "general"
    state["urgency"], state["route"] = urgency, route
    office.current().result({"urgency": urgency, "route": route})
    _log(state, "Triage", f"urgency={urgency}, route={route}", reasons=[r for a in assessments for r in a.reasons])
    return state


def _specialist(state: State, name: str, condition_map: dict) -> State:
    flags, text = set(state.get("flags", [])), state.get("symptoms", "").lower()
    cond = next((c for c, keys in condition_map.items() if flags & keys or any(k in text for k in keys)), None)
    candidates = protocols.find(cond) if cond else []
    office.tool("protocols.find", cond, [p["id"] for p in candidates])
    query = f"{name} {text} {' '.join(flags)}"
    hits = retriever().search(query, k=4)
    office.tool("rag.search", query[:80], [h["doc_id"] for h in hits])
    model = llm.get_llm()
    answer = model.answer(f"What should the crew do for: {text or ', '.join(flags)}?", hits)
    office.tool(f"llm.answer ({model.name})", "cited sources", answer[:80])
    plan = {"specialist": name, "condition": cond, "protocol_id": candidates[0]["id"] if candidates else None,
            "advice": answer, "citations": [{"n": n, "title": h["title"], "url": h["url"]} for n, h in enumerate(hits, 1)]}
    state["specialist_plan"] = plan
    office.current().result({"protocol": plan["protocol_id"], "sources": len(hits)})
    _log(state, name, f"condition={cond}, protocol={plan['protocol_id']}", citations=[c["title"] for c in plan["citations"][:2]])
    return state


@office.traced("Cardiac", TEAM)
def cardiac(state):
    return _specialist(state, "Cardiac", {"cardiac_arrest": {"unresponsive", "no pulse", "not breathing"},
                                         "irregular_rhythm": {"irregular_rhythm", "flutter", "palpitation", "irregular"},
                                         "chest_symptoms": {"chest"}})


@office.traced("First aid", TEAM)
def first_aid(state):
    return _specialist(state, "First aid", {"post_eva": {"spacewalk", "eva"}})


@office.traced("Mental health", TEAM)
def mental(state):
    return _specialist(state, "Mental health", {})


@office.traced("Radiation", TEAM)
def radiation(state):
    return _specialist(state, "Radiation", {})


@office.traced("General", TEAM)
def general(state):
    return _specialist(state, "General", {"glucose_due": {"sugar", "glucose", "shaky"}})


@office.traced("Flight Surgeon", TEAM)
def flight_surgeon(state: State) -> State:
    loc = kb.ladder()["locations"][state.get("location", "mars")]
    office.tool("ladder.location", state.get("location", "mars"), {"delay_s": loc["one_way_delay_s"], "live": loc["live_consult"]})
    urgent = state["urgency"] == "emergency" or (state.get("route") == "cardiac" and "irregular_rhythm" in state.get("flags", []))
    rtt_min = 2 * loc["one_way_delay_s"] / 60
    if urgent:
        decision = {"act": "onboard_now", "why": f"High risk; Earth reply takes ~{rtt_min:.0f} min round trip." if not loc["live_consult"]
                    else "High risk; act now and connect the flight surgeon live."}
    elif loc["live_consult"]:
        decision = {"act": "consult_live", "why": "Link delay is short enough for a live consult."}
    else:
        decision = {"act": "self_care_and_queue", "why": "Not urgent; follow advice and send to Earth in the next window."}
    state["decision"] = decision
    office.current().result(decision)
    _log(state, "Flight Surgeon", decision["act"], why=decision["why"])
    return state


@office.traced("Procedure", TEAM)
def procedure(state: State) -> State:
    pid = state["specialist_plan"].get("protocol_id")
    if not pid:
        state["procedure"] = {"protocol_id": None}
        office.current().result("no procedure needed")
        return state
    sess = protocols.Session(pid, helper_skill=state.get("helper_skill", "crew"))
    first = sess.current()
    office.tool("protocols.Session", {"protocol": pid, "skill": sess.helper_skill}, {"steps": first["of"]})
    state["procedure"] = {"protocol_id": pid, "helper": state.get("helper"), "steps": first["of"], "first_step": first["say"]}
    office.current().result({"protocol": pid, "steps": first["of"], "helper": state.get("helper")})
    _log(state, "Procedure", f"{pid} ready for {state.get('helper') or 'crewmate'}")
    return state


def build():
    from .shared import report_node, safety_node
    g = StateGraph(State)
    for name, fn in [("triage", triage), ("cardiac", cardiac), ("first_aid", first_aid), ("mental", mental),
                     ("radiation", radiation), ("general", general), ("flight_surgeon", flight_surgeon),
                     ("procedure", procedure), ("safety", safety_node(TEAM)), ("report", report_node(TEAM))]:
        g.add_node(name, fn)
    g.set_entry_point("triage")
    g.add_conditional_edges("triage", lambda s: s["route"], {k: k for k in ("cardiac", "first_aid", "mental", "radiation", "general")})
    for k in ("cardiac", "first_aid", "mental", "radiation", "general"):
        g.add_edge(k, "flight_surgeon")
    g.add_edge("flight_surgeon", "procedure")
    g.add_edge("procedure", "safety")
    g.add_edge("safety", "report")
    g.add_edge("report", END)
    return g.compile()


def run(case: dict) -> dict:
    """Run the emergency team directly (the orchestrator is the normal entry point)."""
    from . import orchestrator
    return orchestrator.run(case | {"event": case.get("event", "alert")})
