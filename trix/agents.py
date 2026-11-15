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


NEED_INFO = "Tell TRIX what's wrong, or start a quick check-in so TRIX can look at your readings."
# words that say nothing medical on their own ("I just feel a bit off today")
GENERIC = {"feel", "feeling", "feels", "just", "bit", "little", "today", "kind", "kinda", "sort", "weird", "strange", "general",
           "cardiac", "aid", "mental", "health", "radiation", "maybe", "think", "really", "lot", "bad", "good", "right", "fine"}
RANK = escalation.RANK


def _max(a: str, b: str) -> str:
    return a if RANK[a] >= RANK[b] else b


ARREST = __import__("re").compile(r"unresponsive|unconscious|not breathing|stopped breathing|isn'?t breathing|no pulse|collapsed|lifeless|cardiac arrest|"
                                r"(won'?t|doesn'?t|does not|will not|not|can'?t) (wake|respond|responding|waking|react)|passed out")


@office.traced("Triage", TEAM)
def triage(state: State) -> State:
    flags, v, text = set(state.get("flags", [])), state.get("vitals", {}) or {}, (state.get("symptoms") or "").lower()
    loc = state.get("location", "mars")
    assessments = []
    for ind in ("hr", "spo2", "temp"):
        if v.get(ind) is not None:
            a = escalation.assess(ind, v[ind], flags=flags & {"irregular_rhythm"} if ind == "hr" else set(), location=loc)
            office.tool("escalation.assess", {ind: v[ind]}, {"status": a.status, "level": a.level})
            assessments.append(a)
    findings = [kb.indicators()[a.indicator]["name"] for a in assessments if a.status != "green"]
    if any(a.indicator == "spo2" and a.status != "green" for a in assessments):
        flags.add("low_oxygen")
    urgency = max((a.level for a in assessments), key=lambda k: RANK[k], default="self_care")
    has = lambda *ws: any(w in text for w in ws)  # noqa: E731
    if not text and not flags and not findings:
        route = "general"
        flags.add("need_info")
    elif ARREST.search(text):
        urgency, route = "emergency", "cardiac"
        flags.add("unresponsive")      # however it was worded, the Cardiac agent treats it as a possible arrest
    elif has("chest pain", "chest tight", "chest pressure", "crushing"):
        urgency, route = "emergency", "cardiac"
        flags.add("chest_symptoms")
    elif "irregular_rhythm" in flags or has("chest", "flutter", "palpitation", "heart", "irregular", "skipping"):
        route = "cardiac"
        if "irregular_rhythm" in flags or has("irregular", "flutter", "skipping", "uneven", "palpitation", "racing"):
            flags.add("irregular_rhythm")
            urgency = _max(urgency, "crew_medical_officer")
            if has("dizz", "faint", "light-headed", "lightheaded", "chest", "short of breath", "breathless", "passed out"):
                urgency = "emergency"  # irregular rhythm with dizziness or chest symptoms is an emergency (NASA CVL)
                findings.append("Irregular heartbeat with dizziness or chest symptoms")
    elif "solar_event" in flags or has("solar storm", "flare", "radiation storm", "particle event"):
        urgency, route = "emergency", "radiation"
        flags.add("solar_event")
    elif "low_oxygen" in flags or has("can't breathe", "short of breath", "breathless"):
        route = "general"
        flags.add("low_oxygen")
        urgency = _max(urgency, "crew_medical_officer")
    elif has("spacewalk", "eva"):
        route = "first_aid"
        if has("tingl", "joint", "numb", "itch", "pain"):
            urgency = _max(urgency, "crew_medical_officer")  # possible decompression sickness
            findings.append("Possible decompression sickness symptoms")
    elif has("cut", "burn", "bleed", "hit my"):
        route = "first_aid"
    elif has("sad", "anxious", "can't cope", "hopeless", "lonely", "stress"):
        route = "mental"
    else:
        route = "general"
    state["urgency"], state["route"], state["flags"], state["findings"] = urgency, route, sorted(flags), findings
    office.current().result({"urgency": urgency, "route": route, "findings": findings})
    _log(state, "Triage", f"urgency={urgency}, route={route}", reasons=[r for a in assessments for r in a.reasons])
    return state


def _specialist(state: State, name: str, condition_map: dict) -> State:
    flags, text = set(state.get("flags", [])), (state.get("symptoms") or "").lower()
    if "need_info" in flags:
        state["specialist_plan"] = {"specialist": name, "condition": None, "protocol_id": None, "advice": NEED_INFO,
                                    "citations": [], "uncited_ok": True}
        office.current().result("asked for more information")
        return state
    cond = next((c for c, keys in condition_map.items() if flags & keys or any(k in text for k in keys)), None)
    candidates = protocols.find(cond) if cond else []
    pid = candidates[0]["id"] if candidates else None
    office.tool("protocols.find", cond, [p["id"] for p in candidates])
    query = " ".join([name, (cond or "").replace("_", " "), *state.get("findings", []), text,
                      *[f.replace("_", " ") for f in flags if f != "need_info"]]).strip()
    hits = [h for h in retriever().search(query, k=8) if not h["doc_id"].startswith("proto:")][:3]
    office.tool("rag.search", query[:80], [h["doc_id"] for h in hits])
    meaningful = set(rag.tok(query)) - GENERIC
    best = set(rag.tok(hits[0]["title"] + " " + hits[0]["text"])) if hits else set()
    model = llm.get_llm()
    relevant = bool(meaningful & best)
    if not relevant:
        hits = []
        office.tool("relevance.check", sorted(meaningful)[:6], "no medical match in knowledge base")
        # no protocol either: ask for a check-in rather than guess; with a protocol: give the protocol only
        answer = "" if pid else llm.NO_MATCH
    else:
        answer = model.answer(f"What should the crew do for: {query}?", hits)
        if pid and answer.startswith(llm.NO_MATCH):
            answer, hits = "", []
    office.tool(f"llm.answer ({model.name})", "cited sources", answer[:80])
    citations = [{"n": n, "title": h["title"], "url": h["url"]} for n, h in enumerate(hits, 1)]
    if pid:  # the procedure's first step always comes from the approved protocol, never from the model
        first = protocols.library()[pid]["steps"][0]["say"]
        n = len(citations) + 1
        answer = f"{answer} First step ({pid}): {first} [{n}]".strip()
        citations.append({"n": n, "title": f"Protocol {pid}: {protocols.library()[pid]['title']}", "url": f"trix/protocols/{pid}.yaml"})
    plan = {"specialist": name, "condition": cond, "protocol_id": pid, "advice": answer, "citations": citations,
            "uncited_ok": answer.startswith(llm.NO_MATCH)}
    state["specialist_plan"] = plan
    office.current().result({"protocol": pid, "sources": len(citations)})
    _log(state, name, f"condition={cond}, protocol={pid}", citations=[c["title"] for c in citations[:2]])
    return state


@office.traced("Cardiac", TEAM)
def cardiac(state):
    return _specialist(state, "Cardiac", {"cardiac_arrest": {"unresponsive", "no pulse", "not breathing"},
                                         "irregular_rhythm": {"irregular_rhythm", "flutter", "palpitation", "irregular"},
                                         "chest_symptoms": {"chest_symptoms", "chest"}})


@office.traced("First aid", TEAM)
def first_aid(state):
    return _specialist(state, "First aid", {"post_eva": {"spacewalk", "eva"}})


@office.traced("Mental health", TEAM)
def mental(state):
    return _specialist(state, "Mental health", {})


@office.traced("Radiation", TEAM)
def radiation(state):
    return _specialist(state, "Radiation", {"solar_event": {"solar_event"}})


@office.traced("General", TEAM)
def general(state):
    return _specialist(state, "General", {"low_oxygen": {"low_oxygen"}, "glucose_due": {"sugar", "glucose", "shaky"}})


@office.traced("Flight Surgeon", TEAM)
def flight_surgeon(state: State) -> State:
    loc = kb.ladder()["locations"][state.get("location", "mars")]
    office.tool("ladder.location", state.get("location", "mars"), {"delay_s": loc["one_way_delay_s"], "live": loc["live_consult"]})
    urgent = state["urgency"] == "emergency" or (state.get("route") == "cardiac" and "irregular_rhythm" in state.get("flags", []))
    rtt_min = 2 * loc["one_way_delay_s"] / 60
    if state.get("link_cut"):
        decision = ({"act": "onboard_now", "why": "No contact with Earth. Act on board now; the report is held until the link returns."} if urgent else
                    {"act": "self_care_and_queue", "why": "No contact with Earth. Follow the advice; the report is held until the link returns."})
        state["decision"] = decision
        office.current().result(decision)
        _log(state, "Flight Surgeon", decision["act"], why=decision["why"])
        return state
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
