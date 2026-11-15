"""Talk to TRIX with the local model as the planner.

Any sentence, in any of the app's languages, plus the last few turns of the conversation, goes to the local Ollama
model with the list of things the app can do. The model answers with one JSON action; `validate` checks every field
against what really exists (screens, measurements, protocols, ranges) before the API runs it, so the model can only
choose, never invent. Without a local model the rule-based parser in routine.intent is used instead.
"""
import json
import re

from . import assistant_lang, kb, llm, protocols, routine

SCREENS = {"#/today": "mission deck (home)", "#/checkin": "check-in form (several readings, face and voice, vision, symptoms and food)",
           "#/body": "trends and body map", "#/care": "procedures, medicines, landing readiness", "#/crew": "crew, buddy check, privacy",
           "#/earth": "Earth link and report queue", "#/office": "agent tree (what the agents decided)", "#/emergency": "emergency screen"}
ACTIONS = ("navigate", "log", "status", "summary", "procedure", "emergency", "symptom", "answer", "clarify")


def _system(lang: str) -> str:
    inds = ", ".join(f"{i} ({kb.indicators()[i]['name'].split(' (')[0]})" for i in routine.HOWTO)
    protos = ", ".join(f"{p['id']} ({p['title']})" for p in protocols.library().values())
    return f"""You are the planner for TRIX, an onboard health assistant for astronauts far from Earth. The astronaut speaks {assistant_lang.NAMES.get(lang, 'English')}.
Turn the last message into exactly one action for the app. Reply with JSON only, with these fields:
"action": one of {list(ACTIONS)}
"go": for navigate: one of {list(SCREENS)} or "#/capture/<measurement>" (guided measurement screen) or "#/body/<measurement>" (that measurement's record and trend)
"readings": for log: numbers the astronaut gave, keys among {list(routine.RANGE)} (blood pressure is sys and dia; sleep in hours; temp in °C; mood 1-5; back_pain 0-10)
"indicator": for status: one of {list(routine.ALIAS.values())}
"protocol_id": for procedure: one of the protocol ids
"symptoms": for symptom or emergency: what is wrong, in English
"question": for answer: the question in English
"say": one short sentence to speak back, in {assistant_lang.NAMES.get(lang, 'English')}
Screens: {SCREENS}
Measurements: {inds}
Protocols: {protos}
Rules: "log" only when the LAST message itself contains numbers for readings; never repeat readings from earlier turns, they are already saved. "status" when they ask how one measurement is. "summary" when they ask how they are overall.
"emergency" for anyone unresponsive, not breathing, chest pain, heavy bleeding, or a solar storm. "procedure" when they ask to start or be walked through a protocol.
"answer" for general or medical knowledge questions. "clarify" when you cannot tell what they want; then put the question for them in "say"."""


def validate(plan: dict, text: str) -> dict | None:
    """Turn the model's JSON into an intent the API already knows how to run; None if anything is not real."""
    if not isinstance(plan, dict) or plan.get("action") not in ACTIONS:
        return None
    a, say = plan["action"], str(plan.get("say") or "").strip()[:300]
    if a == "navigate":
        go = str(plan.get("go") or "").strip()
        m = re.fullmatch(r"#/(capture|body)/([a-z_0-9]+)", go)
        ok = go in SCREENS or (m and (m.group(2) in routine.HOWTO if m.group(1) == "capture" else m.group(2) in kb.indicators()))
        return {"kind": "navigate", "go": go, "say": say or "Opening."} if ok else None
    if a == "log":
        r = {}
        for k, v in (plan.get("readings") or {}).items():
            try:
                v = float(v)
            except (TypeError, ValueError):
                continue
            said = re.search(rf"(?<![\d.]){v:g}(?![\d.])", text) or re.search(rf"(?<![\d.]){int(v)}(?![\d.])", text)   # only numbers in this very message
            if k in routine.RANGE and routine.RANGE[k][0] <= v <= routine.RANGE[k][1] and said:
                r[k] = int(v) if v.is_integer() else v
        return {"kind": "log", "readings": r, "symptoms": str(plan.get("symptoms") or "")} if r else None
    if a == "status":
        ind = plan.get("indicator")
        return {"kind": "status", "indicator": ind} if ind in routine.ALIAS.values() else None
    if a == "summary":
        return {"kind": "summary"}
    if a == "procedure":
        pid = plan.get("protocol_id")
        return {"kind": "procedure", "protocol_id": pid, "say": say} if pid in protocols.library() else None
    if a == "emergency":
        return {"kind": "emergency", "symptoms": str(plan.get("symptoms") or text)}
    if a == "symptom":
        return {"kind": "symptom", "symptoms": str(plan.get("symptoms") or text)}
    if a == "answer":
        return {"kind": "ask", "question": str(plan.get("question") or text)}
    return {"kind": "clarify", "say": say or "What would you like me to do?"}


def plan(text: str, lang: str, history: list) -> dict | None:
    """Ask the local model; None when it is not available or its answer does not validate."""
    msgs = [{"role": "system", "content": _system(lang)}]
    for h in (history or [])[-6:]:
        if h.get("role") in ("user", "assistant") and h.get("text"):
            msgs.append({"role": h["role"], "content": str(h["text"])[:400]})
    msgs.append({"role": "user", "content": text[:500]})
    raw = llm.chat_json(msgs)
    if raw is None:
        return None
    try:
        return validate(json.loads(raw), text)
    except (json.JSONDecodeError, TypeError):
        return None
