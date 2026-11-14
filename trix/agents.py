"""Multi-agent agentic RAG with LangGraph.

Triage -> (Cardiac | First aid | Mental health | Radiation | General) -> Flight Surgeon -> Safety -> Report

- Each specialist retrieves from the knowledge base (cited) and chooses a protocol from the approved library.
- The Flight Surgeon agent decides: act onboard now, or consult Earth (depends on urgency and link delay).
- The Safety agent checks the plan and every message; if anything fails it falls back to rules/protocol text.
- The Report agent writes a compact summary queued for Earth.
Agents decide which tools to call (vitals, retrieval, protocol library), which makes the RAG 'agentic'.
"""
import json
import time
from typing import TypedDict

from langgraph.graph import END, StateGraph

from . import escalation, kb, llm, protocols, rag, safety

_R = None


def retriever() -> rag.Retriever:
    global _R
    if _R is None:
        _R = rag.Retriever()
    return _R


class Case(TypedDict, total=False):
    who: str
    location: str
    vitals: dict           # e.g. {"hr": 132, "spo2": 96, "temp": 36.8}
    flags: list            # e.g. ["irregular_rhythm"]
    symptoms: str          # what the person said
    helper: str            # crewmate chosen to help
    helper_skill: str
    # filled by agents
    trace: list
    urgency: str
    route: str
    specialist_plan: dict
    decision: dict
    safety: dict
    report: dict


def _log(state, agent, msg, **extra):
    state.setdefault("trace", []).append({"t": time.strftime("%H:%M:%S"), "agent": agent, "msg": msg} | extra)


def triage(state: Case) -> Case:
    flags, v, text = set(state.get("flags", [])), state.get("vitals", {}), state.get("symptoms", "").lower()
    assessments = []
    if "hr" in v:
        assessments.append(escalation.assess("hr", v["hr"], flags=flags & {"irregular_rhythm"}, location=state.get("location", "mars")))
    if "spo2" in v:
        assessments.append(escalation.assess("spo2", v["spo2"], location=state.get("location", "mars")))
    if "temp" in v:
        assessments.append(escalation.assess("temp", v["temp"], location=state.get("location", "mars")))
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
    _log(state, "Triage", f"urgency={urgency}, route={route}", reasons=[r for a in assessments for r in a.reasons])
    return state


def _specialist(state: Case, name: str, condition_map: dict) -> Case:
    flags, text = set(state.get("flags", [])), state.get("symptoms", "").lower()
    cond = next((c for c, keys in condition_map.items() if flags & keys or any(k in text for k in keys)), None)
    candidates = protocols.find(cond) if cond else []
    query = f"{name} {text} {' '.join(flags)}"
    hits = retriever().search(query, k=4)
    answer = llm.get_llm().answer(f"What should the crew do for: {text or ', '.join(flags)}?", hits)
    plan = {"specialist": name, "condition": cond, "protocol_id": candidates[0]["id"] if candidates else None,
            "advice": answer, "citations": [{"n": n, "title": h["title"], "url": h["url"]} for n, h in enumerate(hits, 1)]}
    state["specialist_plan"] = plan
    _log(state, name, f"condition={cond}, protocol={plan['protocol_id']}", citations=[c["title"] for c in plan["citations"][:2]])
    return state


def cardiac(state):
    return _specialist(state, "Cardiac", {"cardiac_arrest": {"unresponsive", "no pulse", "not breathing"},
                                         "irregular_rhythm": {"irregular_rhythm", "flutter", "palpitation", "irregular"},
                                         "chest_symptoms": {"chest"}})


def first_aid(state):
    return _specialist(state, "First aid", {"post_eva": {"spacewalk", "eva"}})


def mental(state):
    return _specialist(state, "Mental health", {})


def radiation(state):
    return _specialist(state, "Radiation", {})


def general(state):
    return _specialist(state, "General", {"glucose_due": {"sugar", "glucose", "shaky"}})


def flight_surgeon(state: Case) -> Case:
    loc = kb.ladder()["locations"][state.get("location", "mars")]
    urgent = state["urgency"] == "emergency" or state.get("route") == "cardiac" and "irregular_rhythm" in state.get("flags", [])
    rtt_min = 2 * loc["one_way_delay_s"] / 60
    if urgent:
        decision = {"act": "onboard_now", "why": f"High risk; Earth reply takes ~{rtt_min:.0f} min round trip." if not loc["live_consult"]
                    else "High risk; act now and connect the flight surgeon live."}
    elif loc["live_consult"]:
        decision = {"act": "consult_live", "why": "Link delay is short enough for a live consult."}
    else:
        decision = {"act": "self_care_and_queue", "why": "Not urgent; follow advice and send to Earth in the next window."}
    state["decision"] = decision
    _log(state, "Flight Surgeon", decision["act"], why=decision["why"])
    return state


def safety_check(state: Case) -> Case:
    plan = state["specialist_plan"]
    pid = plan.get("protocol_id")
    steps = [s["id"] for s in protocols.library()[pid]["steps"]] if pid else []
    v_plan = safety.check_plan(pid, steps) if pid else safety.Verdict(True)
    v_text = safety.check_text(plan["advice"], pid, cited="[" in plan["advice"])
    ok = v_plan.allowed and v_text.allowed
    if not v_text.allowed:
        plan["advice"] = v_text.replacement
    state["safety"] = {"allowed": ok, "reasons": v_plan.reasons + v_text.reasons, "checked_steps": len(steps)}
    _log(state, "Safety", "all clear" if ok else "blocked and replaced", reasons=state["safety"]["reasons"])
    return state


def report(state: Case) -> Case:
    plan = state["specialist_plan"]
    rep = {"case_for": state.get("who"), "urgency": state["urgency"], "route": state["route"], "decision": state["decision"]["act"],
           "protocol": plan.get("protocol_id"), "vitals": state.get("vitals", {}), "symptoms": state.get("symptoms", ""),
           "agent_trace": [{"agent": t["agent"], "msg": t["msg"]} for t in state.get("trace", [])],
           "sources": [c["title"] for c in plan["citations"][:3]]}
    size = len(json.dumps(rep).encode())
    rep["priority"] = "urgent" if state["urgency"] == "emergency" or state["decision"]["act"] == "onboard_now" else "normal"
    rep["bytes"] = size
    state["report"] = rep
    _log(state, "Report", f"queued for Earth ({size} bytes, {rep['priority']})")
    return state


def build():
    g = StateGraph(Case)
    for name, fn in [("triage", triage), ("cardiac", cardiac), ("first_aid", first_aid), ("mental", mental),
                     ("radiation", radiation), ("general", general), ("flight_surgeon", flight_surgeon),
                     ("safety", safety_check), ("report", report)]:
        g.add_node(name, fn)
    g.set_entry_point("triage")
    g.add_conditional_edges("triage", lambda s: s["route"],
                            {k: k for k in ("cardiac", "first_aid", "mental", "radiation", "general")})
    for k in ("cardiac", "first_aid", "mental", "radiation", "general"):
        g.add_edge(k, "flight_surgeon")
    g.add_edge("flight_surgeon", "safety")
    g.add_edge("safety", "report")
    g.add_edge("report", END)
    return g.compile()


def run(case: Case) -> Case:
    return build().invoke(case)
