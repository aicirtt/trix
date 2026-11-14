"""Orchestration + agent office tests: python -m pytest tests (or python tests/test_orchestration.py)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from trix import office, orchestrator  # noqa: E402

ALERT = {"event": "alert", "who": "A", "vitals": {"hr": 132}, "flags": ["irregular_rhythm"], "symptoms": "chest flutter"}
CHECKIN = {"event": "checkin", "who": "C", "readings": {"hr": 69, "sleep": 4.9, "fatigue": 19, "mood": 2.9, "temp": 36.7}}
RED_READING = {"event": "reading", "who": "A", "readings": {"hr": 131, "irregular_rhythm": 1, "spo2": 96}}
PHARMACY = {"event": "pharmacy", "who": "B", "request": {"day": 180}}


def _agents(case_id):
    return [s["agent"] for s in office.spans(case_id)]


def test_routes_to_each_team():
    assert orchestrator.run(ALERT)["team"] == "emergency"
    assert orchestrator.run(CHECKIN)["team"] == "daily"
    assert orchestrator.run(PHARMACY)["team"] == "ops"


def test_emergency_words_override_event_type():
    o = orchestrator.run({"event": "checkin", "who": "B", "readings": {"hr": 0}, "symptoms": "he is unresponsive"})
    assert o["team"] == "emergency" and o["decision"]["act"] == "onboard_now"


def test_daily_to_emergency_handoff():
    o = orchestrator.run(RED_READING)
    names = _agents(o["case_id"])
    assert o["handoff"] and "Daily care orchestrator" in names and "Emergency orchestrator" in names
    em = next(s for s in office.spans(o["case_id"]) if s["agent"] == "Emergency orchestrator")
    assert em["trigger"] == "Daily care (hand-off)"


def test_no_handoff_when_not_red():
    o = orchestrator.run(CHECKIN)
    assert not o["handoff"] and "Emergency orchestrator" not in _agents(o["case_id"])


def test_safety_gates_every_team():
    for ev in (ALERT, CHECKIN, PHARMACY):
        o = orchestrator.run(ev)
        safety_spans = [s for s in office.spans(o["case_id"]) if s["agent"] == "Safety"]
        assert safety_spans and "safety" in o


def test_office_log_is_complete_and_linked():
    o = orchestrator.run(RED_READING)
    sp = office.spans(o["case_id"])
    ids = {s["span_id"] for s in sp}
    roots = [s for s in sp if s["parent_id"] is None]
    assert len(roots) == 1 and roots[0]["agent"] == "Mission orchestrator"
    assert all(s["parent_id"] in ids for s in sp if s["parent_id"])
    assert all(s["status"] == "ok" and s["result"] is not None and "ms" in s for s in sp)
    assert any(t["tool"] == "rag.search" for s in sp for t in s["tools"])


def test_parallel_cases_are_separate():
    outs = orchestrator.run_many([ALERT, CHECKIN, PHARMACY])
    ids = [o["case_id"] for o in outs]
    assert len(set(ids)) == 3
    for o in outs:
        assert all(s["case_id"] == o["case_id"] for s in office.spans(o["case_id"]))


def test_privacy_withholds_mood_details():
    o = orchestrator.run({"event": "symptom", "who": "C", "vitals": {"hr": 70}, "symptoms": "I feel lonely and stressed"})
    assert o["report"]["symptoms"].startswith("withheld")


if __name__ == "__main__":
    for name, f in list(globals().items()):
        if name.startswith("test_"):
            f(); print("ok", name)
