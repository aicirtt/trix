"""Agents shared by every team: Safety (single gate for all outputs), Privacy and Report (Earth queue)."""
import json
from functools import lru_cache
from pathlib import Path

from . import office, protocols, safety
from .state import State

KB = Path(__file__).parent / "kb"


@lru_cache
def privacy_settings() -> dict:
    return json.loads((KB / "privacy.json").read_text())


def settings_for(who: str | None) -> dict:
    """Defaults, then the astronaut's file settings, then anything they changed in the app."""
    from . import store  # local import: the store is optional for the engine
    p = privacy_settings()
    try:
        saved = store.get(f"privacy:{who}", {}) if who else {}
    except Exception:
        saved = {}
    return p["default"] | p.get(who or "", {}) | saved


def _texts(state: State) -> list[tuple[str, str, str | None]]:
    """(where, text, protocol) for every crew-facing message produced so far."""
    out = []
    if state.get("specialist_plan"):
        sp = state["specialist_plan"]
        out.append(("specialist_plan.advice", sp.get("advice", ""), sp.get("protocol_id")))
    for i, m in enumerate((state.get("coach") or {}).get("messages", [])):
        out.append((f"coach.messages[{i}]", m, None))
    for i, m in enumerate((state.get("ops") or {}).get("messages", [])):
        out.append((f"ops.messages[{i}]", m, None))
    return out


def safety_node(team: str):
    @office.traced("Safety", team)
    def node(state: State) -> State:
        reasons, checked = [], 0
        sp = state.get("specialist_plan") or {}
        pid = sp.get("protocol_id")
        if pid:
            steps = [s["id"] for s in protocols.library()[pid]["steps"]]
            v = safety.check_plan(pid, steps)
            office.tool("safety.check_plan", pid, {"allowed": v.allowed, "steps": len(steps)})
            reasons += v.reasons
            checked += len(steps)
        for where, text, proto in _texts(state):
            cited = None
            if where.startswith("specialist") and not sp.get("uncited_ok"):
                cited = "[" in text
            v = safety.check_text(text, proto, cited=cited)
            checked += 1
            if not v.allowed:
                reasons += [f"{where}: {r}" for r in v.reasons]
                if where.startswith("specialist"):
                    state["specialist_plan"]["advice"] = v.replacement
                else:
                    key, idx = where.split(".")[0], int(where[where.index("[") + 1:-1])
                    state[key]["messages"][idx] = v.replacement
        state["safety"] = {"allowed": not reasons, "reasons": reasons, "checked": checked}
        office.tool("safety.check_text", f"{checked} items", "all clear" if not reasons else f"{len(reasons)} blocked")
        office.current().result({"allowed": not reasons, "checked": checked})
        return state
    return node


def report_node(team: str):
    @office.traced("Report", team)
    def node(state: State) -> State:
        who = state.get("who")
        prefs = settings_for(who)
        emergency = state.get("urgency") == "emergency" or (state.get("decision") or {}).get("act") == "onboard_now"
        rep = {"case_id": state.get("case_id"), "team": team, "who": who, "event": state.get("event")}
        if state.get("specialist_plan"):
            rep |= {"urgency": state.get("urgency"), "decision": (state.get("decision") or {}).get("act"),
                    "protocol": state["specialist_plan"].get("protocol_id"),
                    "sources": [c["title"] for c in state["specialist_plan"]["citations"][:3]]}
        if state.get("body_map"):
            rep["body_map"] = {k: v["status"] for k, v in state["body_map"].items()}
        if prefs["vitals_summary"] or emergency:
            rep["vitals"] = state.get("vitals") or state.get("readings") or {}
        symptoms = state.get("symptoms", "")
        if symptoms and (emergency or prefs["mood_details"] or state.get("route") not in ("mental",)):
            rep["symptoms"] = symptoms
        elif symptoms:
            rep["symptoms"] = "withheld by privacy setting (weekly score only)"
            office.tool("privacy.apply", who, "mood details withheld")
        rep["agent_log"] = [{"agent": s["agent"], "team": s["team"], "result": s["result"]}
                            for s in office.spans(state.get("case_id")) if s["agent"] not in ("Report",)]
        rep["priority"] = "urgent" if emergency else "normal"
        rep["bytes"] = len(json.dumps(rep, default=str).encode())
        state["report"] = rep
        office.tool("earth_queue.add", rep["priority"], f"{rep['bytes']} bytes")
        office.current().result({"priority": rep["priority"], "bytes": rep["bytes"]})
        state.setdefault("trace", []).append({"agent": "Report", "msg": f"queued for Earth ({rep['bytes']} bytes, {rep['priority']})"})
        return state
    return node
