"""Two-level orchestration.

Level 1, Mission orchestrator: classifies each incoming event and routes it to a team.
Level 2, Team orchestrators (each a LangGraph sub-graph):
    Daily care   check-in -> detection -> coach -> reminder -> safety -> report
    Emergency    triage -> specialist -> flight surgeon -> procedure -> safety -> report
    Operations   router -> pharmacy | devices | privacy -> safety -> report
Escalation is a hand-off between teams: if Daily care finds a red reading it passes the case to Emergency.
One Safety agent (trix/shared.py) gates the output of every team. Every step is logged to the agent office.
Independent events (e.g. different astronauts) run in parallel with run_many().
"""
from concurrent.futures import ThreadPoolExecutor

from langgraph.graph import END, StateGraph

from . import agents, office, teams
from .state import State

ROUTES = {"reading": "daily", "checkin": "daily", "alert": "emergency", "symptom": "emergency",
          "pharmacy": "ops", "devices": "ops", "privacy": "ops", "report": "ops"}
_SUB = {}


def _sub(name):
    if name not in _SUB:
        _SUB[name] = {"daily": teams.build_daily, "emergency": agents.build, "ops": teams.build_ops}[name]()
    return _SUB[name]


def mission(state: State) -> State:
    """Level 1: classify the event. Emergency words always win."""
    with office.span("Mission orchestrator", "Mission", trigger=state.get("event", "event"),
                     inputs={"event": state.get("event"), "who": state.get("who")}, case_id=state["case_id"]) as sp:
        text = (state.get("symptoms") or "").lower()
        team = ROUTES.get(state.get("event"), "daily")
        if any(k in text for k in ("unresponsive", "not breathing", "no pulse", "chest pain")):
            team = "emergency"
        state["team"] = team
        state["_parent"] = sp.rec["span_id"]
        sp.result({"team": team})
    return state


def _team_node(name: str, label: str):
    def node(state: State) -> State:
        root = state.get("_parent")
        trigger = "Daily care (hand-off)" if (name == "emergency" and state.get("handoff")) else "Mission orchestrator"
        with office.span(f"{label} orchestrator", label, trigger=trigger, inputs={"who": state.get("who")},
                         case_id=state["case_id"], parent_id=root) as sp:
            sub_in = dict(state) | {"_parent": sp.rec["span_id"], "_prev": f"{label} orchestrator"}
            out = _sub(name).invoke(sub_in)
            res = {"daily": lambda o: {"handoff": o.get("handoff"), "flagged": [k for k, v in (o.get("body_map") or {}).items() if v["status"] != "green"]},
                   "emergency": lambda o: {"decision": (o.get("decision") or {}).get("act"), "protocol": (o.get("procedure") or {}).get("protocol_id")},
                   "ops": lambda o: {"messages": len((o.get("ops") or {}).get("messages", []))}}[name](out)
            sp.result(res)
        out["_parent"] = root
        return out
    return node


def build():
    g = StateGraph(State)
    g.add_node("mission", mission)
    g.add_node("daily", _team_node("daily", "Daily care"))
    g.add_node("emergency", _team_node("emergency", "Emergency"))
    g.add_node("ops", _team_node("ops", "Operations"))
    g.set_entry_point("mission")
    g.add_conditional_edges("mission", lambda s: s["team"], {"daily": "daily", "emergency": "emergency", "ops": "ops"})
    g.add_conditional_edges("daily", lambda s: "emergency" if s.get("handoff") else "end", {"emergency": "emergency", "end": END})
    g.add_edge("emergency", END)
    g.add_edge("ops", END)
    return g.compile()


_G = None


def run(event: dict) -> dict:
    global _G
    if _G is None:
        _G = build()
    case_id = office.new_case(event)
    out = _G.invoke({"location": "mars", "trace": []} | event | {"case_id": case_id})
    return out


def run_many(events: list[dict], workers: int = 4) -> list[dict]:
    """Run independent events in parallel (e.g. an emergency for A while B and C check in)."""
    _sub("daily"), _sub("emergency"), _sub("ops")
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(run, events))
