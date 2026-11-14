"""Quick checks: python -m pytest tests (or python tests/test_smoke.py)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from trix import agents, escalation, protocols, safety  # noqa: E402


def test_emergency_route():
    o = agents.run({"who": "A", "location": "mars", "vitals": {"hr": 132}, "flags": ["irregular_rhythm"], "symptoms": "chest flutter"})
    assert o["urgency"] == "emergency" and o["specialist_plan"]["protocol_id"] == "CARD-ECG-01" and o["decision"]["act"] == "onboard_now"


def test_escalation_location():
    assert escalation.assess("temp", 38.4, location="mars").level == "crew_medical_officer"
    assert "queued" in escalation.assess("bp", {"sys": 165, "dia": 102}, location="mars").route
    assert escalation.assess("bp", {"sys": 165, "dia": 102}, location="iss").route == "live consult now"


def test_protocol_lock():
    s = protocols.Session("CARD-ECG-01")
    s.submit(False)
    assert s.current()["step_id"] == "s1"
    assert not safety.check_plan("CARD-ECG-01", ["s1", "s3"]).allowed


def test_safety():
    assert not safety.check_text("Give 300 mg aspirin").allowed
    assert safety.check_text("Do you have joint pain?").allowed


if __name__ == "__main__":
    for f in [test_emergency_route, test_escalation_location, test_protocol_lock, test_safety]:
        f(); print("ok", f.__name__)
