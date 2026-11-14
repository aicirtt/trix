"""Full test suite: every team, event type, specialist route, location, astronaut, protocol, edge case and
bad input, plus a parallel stress test. Run: python -m pytest -q tests"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from trix import escalation, kb, llm, office, orchestrator, protocols, rag, reminders, safety, synth  # noqa: E402
from trix.shared import _texts  # noqa: E402

LEVELS = {lv["key"] for lv in kb.ladder()["levels"]}
BODY_PARTS = {"heart", "brain", "eyes", "lungs", "gut", "immune", "bones", "rad"}


# ---------------------------------------------------------------- knowledge base integrity
@pytest.mark.parametrize("iid", sorted(kb.indicators()))
def test_indicator_complete(iid):
    i = kb.indicators()[iid]
    for f in ("name", "unit", "body_part", "devices", "frequency", "hazard", "risk", "space_effect", "why_measure", "actions", "sources", "escalation"):
        assert i.get(f), f"{iid} missing {f}"
    assert i["body_part"] in BODY_PARTS
    assert i["hazard"] in json.loads((ROOT / "trix/kb/indicators.json").read_text())["hazards"]
    assert all(s in kb.sources() for s in i["sources"])
    assert all(v in LEVELS for v in i["escalation"].values()), i["escalation"]


@pytest.mark.parametrize("pid", sorted(protocols.library()))
def test_protocol_well_formed(pid):
    p = protocols.library()[pid]
    ids = [s["id"] for s in p["steps"]]
    assert len(ids) == len(set(ids)) and p["use_when"] and p["specialist"]
    assert all(s["check"]["type"] in {"camera", "device", "confirm"} and s["say"] and s["why"] for s in p["steps"])


def test_docs_parse_and_corpus_has_everything():
    ids = {c.doc_id for c in rag.corpus()}
    assert {f"ind:{i}" for i in kb.indicators()} <= ids
    assert {f"proto:{p}" for p in protocols.library()} <= ids
    assert {"bone", "sans", "co2", "radiation", "sleep", "immune", "nutrition", "cardio", "behavioral"} <= ids


# ---------------------------------------------------------------- escalation
@pytest.mark.parametrize("iid", sorted(kb.indicators()))
@pytest.mark.parametrize("loc", ["iss", "moon", "mars"])
def test_assess_handles_missing_value(iid, loc):
    a = escalation.assess(iid, None, location=loc)
    assert a.status == "green" and a.level == "normal"


@pytest.mark.parametrize("iid,value,status", [
    ("temp", 36.8, "green"), ("temp", 37.6, "amber"), ("temp", 38.0, "red"),
    ("spo2", 98, "green"), ("spo2", 94, "amber"), ("spo2", 91, "red"),
    ("hr", 70, "green"), ("hr", 105, "amber"), ("hr", 125, "red"), ("hr", 38, "red"),
    ("glucose", 95, "green"), ("glucose", 130, "amber"), ("glucose", 190, "red"), ("glucose", 65, "red"),
    ("bp", {"sys": 118, "dia": 76}, "green"), ("bp", {"sys": 142, "dia": 80}, "amber"), ("bp", {"sys": 165, "dia": 102}, "red"),
    ("bp", {"sys": 82, "dia": 50}, "red"), ("bp", {"sys": 120, "dia": None}, "green"),
])
def test_absolute_limits(iid, value, status):
    assert escalation.assess(iid, value).status == status


def test_personal_baseline_and_confidence_cap():
    assert escalation.assess("hrv", 30, {"z": -2.5, "confidence": 0.9}).status == "amber"
    assert escalation.assess("hrv", 30, {"z": -1.0, "confidence": 0.9}).status == "green"
    low = escalation.assess("temp", 38.4, {"z": 4, "confidence": 0.3})
    assert low.level == "self_care" and any("re-measure" in r for r in low.reasons)


def test_persistence_and_flags_and_routes():
    assert escalation.assess("bp", {"sys": 145, "dia": 85}, persistent_days=3).level == "crew_medical_officer"
    assert escalation.assess("hr", 90, flags={"irregular_rhythm"}).level == "emergency"
    assert escalation.assess("mood", 3, flags={"behavioral_concern"}).level == "flight_surgeon_private"
    fs = {loc: escalation.assess("bp", {"sys": 170, "dia": 105}, location=loc).route for loc in ("iss", "moon", "mars")}
    assert fs["iss"] == fs["moon"] == "live consult now" and "queued" in fs["mars"]


def test_combine_two_ambers_bump():
    a = [escalation.assess("sleep", 5.0, {"z": -3, "confidence": 1}), escalation.assess("fatigue", 20)]
    assert escalation.combine(a)["brain"]["level"] == "crew_medical_officer"


# ---------------------------------------------------------------- orchestrator flow matrix
FLOWS = [
    ("reading normal", {"event": "reading", "who": "B", "readings": {"hr": 66, "spo2": 98, "temp": 36.7}}, "daily", False),
    ("reading irregular HR", {"event": "reading", "who": "A", "readings": {"hr": 131, "irregular_rhythm": 1}}, "daily", True),
    ("reading low SpO2", {"event": "reading", "who": "C", "readings": {"spo2": 89}}, "daily", True),
    ("reading fever (no hand-off)", {"event": "reading", "who": "B", "readings": {"temp": 38.6}}, "daily", False),
    ("check-in full", {"event": "checkin", "who": "C", "readings": {"hr": 69, "hrv": 36, "sys": 114, "dia": 73, "spo2": 98, "temp": 36.7, "sleep": 4.9, "mood": 2.9, "fatigue": 19, "glucose": 96}}, "daily", False),
    ("check-in partial", {"event": "checkin", "who": "A", "readings": {"sleep": 6.2}}, "daily", False),
    ("check-in empty", {"event": "checkin", "who": "A", "readings": {}}, "daily", False),
    ("check-in BP only systolic", {"event": "checkin", "who": "B", "readings": {"sys": 150}}, "daily", False),
    ("alert cardiac", {"event": "alert", "who": "A", "vitals": {"hr": 132}, "flags": ["irregular_rhythm"], "symptoms": "chest flutter"}, "emergency", None),
    ("alert unresponsive", {"event": "alert", "who": "B", "vitals": {}, "symptoms": "he is unresponsive and not breathing"}, "emergency", None),
    ("symptom spacewalk", {"event": "symptom", "who": "B", "vitals": {"hr": 78}, "symptoms": "after the spacewalk my fingers tingle"}, "emergency", None),
    ("symptom lonely", {"event": "symptom", "who": "C", "vitals": {"hr": 70}, "symptoms": "I feel lonely and stressed"}, "emergency", None),
    ("symptom blood sugar", {"event": "symptom", "who": "A", "vitals": {}, "symptoms": "I feel shaky, maybe my blood sugar"}, "emergency", None),
    ("symptom solar event", {"event": "symptom", "who": "C", "vitals": {}, "flags": ["solar_event"], "symptoms": "flare alert"}, "emergency", None),
    ("symptom vague", {"event": "symptom", "who": "A", "vitals": {}, "symptoms": "I just feel off"}, "emergency", None),
    ("symptom no text", {"event": "symptom", "who": "A"}, "emergency", None),
    ("pharmacy day 0", {"event": "pharmacy", "who": "B", "request": {"day": 0}}, "ops", None),
    ("pharmacy day 899", {"event": "pharmacy", "who": "B", "request": {"day": 899}}, "ops", None),
    ("pharmacy no day", {"event": "pharmacy"}, "ops", None),
    ("devices", {"event": "devices"}, "ops", None),
    ("privacy change", {"event": "privacy", "who": "C", "request": {"set": {"mood_details": True}}}, "ops", None),
    ("report only", {"event": "report", "who": "A"}, "ops", None),
    ("unknown event type", {"event": "foo", "who": "A", "readings": {"hr": 70}}, "daily", False),
    ("unknown astronaut", {"event": "checkin", "who": "Z", "readings": {"hr": 70, "sleep": 6}}, "daily", False),
    ("no astronaut", {"event": "reading", "readings": {"hr": 70}}, "daily", False),
    ("emergency words in check-in", {"event": "checkin", "who": "B", "readings": {"hr": 60}, "symptoms": "chest pain"}, "emergency", None),
]


def _check_log(case_id, team):
    sp = office.spans(case_id)
    ids = {s["span_id"] for s in sp}
    roots = [s for s in sp if s["parent_id"] is None]
    assert len(roots) == 1 and roots[0]["agent"] == "Mission orchestrator"
    assert all(s["parent_id"] in ids for s in sp if s["parent_id"]), "broken parent link"
    assert all(s["status"] == "ok" for s in sp), [s for s in sp if s["status"] != "ok"]
    names = [s["agent"] for s in sp]
    assert "Safety" in names and "Report" in names
    assert office.timeline(case_id) and office.tree(case_id)


@pytest.mark.parametrize("name,event,team,handoff", FLOWS, ids=[f[0] for f in FLOWS])
@pytest.mark.parametrize("loc", ["iss", "moon", "mars"])
def test_flow(name, event, team, handoff, loc):
    o = orchestrator.run(event | {"location": loc})
    assert o["team"] == team
    if handoff is not None:
        assert bool(o.get("handoff")) == handoff
    assert o["safety"]["allowed"], o["safety"]
    assert o["report"]["bytes"] > 0 and o["report"]["priority"] in ("urgent", "normal")
    _check_log(o["case_id"], team)
    if team == "emergency" or o.get("handoff"):
        assert o["decision"]["act"] in ("onboard_now", "consult_live", "self_care_and_queue")
        assert o["specialist_plan"]["citations"] or o["specialist_plan"].get("uncited_ok")


@pytest.mark.parametrize("symptoms,flags,route,protocol", [
    ("chest flutter", ["irregular_rhythm"], "cardiac", "CARD-ECG-01"),
    ("she is unresponsive", [], "cardiac", "CPR-MG-01"),
    ("after the spacewalk my hands hurt", [], "first_aid", "EVA-POST-01"),
    ("I feel hopeless and lonely", [], "mental", None),
    ("solar flare", ["solar_event"], "radiation", "RAD-SHELTER-01"),
    ("I feel shaky, low sugar?", [], "general", "GLU-01"),
])
def test_specialist_routes(symptoms, flags, route, protocol):
    o = orchestrator.run({"event": "symptom", "who": "A", "vitals": {}, "flags": flags, "symptoms": symptoms})
    assert o["route"] == route and o["specialist_plan"]["protocol_id"] == protocol
    if protocol:
        assert o["procedure"]["steps"] == len(protocols.library()[protocol]["steps"])


@pytest.mark.parametrize("loc,urgent,expected", [
    ("mars", True, "onboard_now"), ("iss", True, "onboard_now"), ("moon", True, "onboard_now"),
    ("mars", False, "self_care_and_queue"), ("iss", False, "consult_live"), ("moon", False, "consult_live"),
])
def test_flight_surgeon_decision_matrix(loc, urgent, expected):
    ev = {"event": "alert", "who": "A", "location": loc, "vitals": {"hr": 132}, "flags": ["irregular_rhythm"], "symptoms": "chest"} if urgent \
        else {"event": "symptom", "who": "A", "location": loc, "vitals": {"hr": 72}, "symptoms": "mild headache"}
    assert orchestrator.run(ev)["decision"]["act"] == expected


def test_privacy_rules():
    lonely = {"event": "symptom", "who": "C", "vitals": {"hr": 70}, "symptoms": "I feel lonely"}
    assert orchestrator.run(lonely)["report"]["symptoms"].startswith("withheld")
    cpr = {"event": "alert", "who": "C", "vitals": {}, "symptoms": "she is unresponsive"}
    assert orchestrator.run(cpr)["report"]["symptoms"] == "she is unresponsive"  # emergencies always shared
    p = orchestrator.run({"event": "privacy", "who": "C", "request": {"set": {"mood_details": True}}})
    assert p["ops"]["privacy"]["settings"]["mood_details"] is True


def test_pharmacy_flags_change_with_day():
    early = orchestrator.run({"event": "pharmacy", "request": {"day": 0}})["ops"]["pharmacy"]
    late = orchestrator.run({"event": "pharmacy", "request": {"day": 899}})["ops"]["pharmacy"]
    assert len(early) == len(late) == 6
    runs = lambda rows: sum("runs out" in f for r in rows for f in r["flags"])  # noqa: E731
    assert runs(early) >= 1 and runs(late) <= runs(early)  # less mission left -> fewer items run out before the end
    assert all(any("potency" in f for f in r["flags"]) for r in late if r["name"] in ("Amoxicillin", "Promethazine"))


# ---------------------------------------------------------------- safety gate under attack
def test_safety_replaces_unsafe_llm_output(monkeypatch):
    class Bad:
        name = "bad"

        def answer(self, q, hits):
            return "You have a heart attack. Give 300 mg aspirin now. [1]"
    monkeypatch.setattr(llm, "get_llm", lambda: Bad())
    o = orchestrator.run({"event": "alert", "who": "A", "vitals": {"hr": 132}, "flags": ["irregular_rhythm"], "symptoms": "chest"})
    assert not o["safety"]["allowed"]
    assert "aspirin" not in o["specialist_plan"]["advice"] and "medical officer" in o["specialist_plan"]["advice"]
    assert o["report"]["priority"] == "urgent"


def test_every_message_reaches_safety():
    o = orchestrator.run({"event": "checkin", "who": "C", "readings": {"sleep": 4.5, "fatigue": 21, "temp": 38.2}})
    assert o["safety"]["checked"] >= len(_texts(o))


@pytest.mark.parametrize("q", [
    "How fast do astronauts lose bone density?", "Why do I keep getting headaches?", "What is SANS?",
    "A solar storm is coming", "I have a cold sore", "How much water should I drink?", "How do I do CPR in weightlessness?",
    "My oxygen is 91 percent", "What medicines are onboard?", "I feel lonely",
])
def test_rag_answers_are_cited_and_safe(q):
    hits = rag.Retriever().search(q, k=3)
    ans = llm.FallbackLLM().answer(q, hits)
    assert "[1]" in ans and safety.check_text(ans, cited=True).allowed


# ---------------------------------------------------------------- protocols, practice mode, reminders
@pytest.mark.parametrize("pid", sorted(protocols.library()))
@pytest.mark.parametrize("skill", ["crew", "medical_officer"])
def test_protocol_session_end_to_end(pid, skill):
    s = protocols.Session(pid, helper_skill=skill, practice=True)
    n = len(protocols.library()[pid]["steps"])
    first = s.current()
    assert first["n"] == 1 and first["of"] == n
    if skill == "medical_officer":
        assert first["say"] == protocols.library()[pid]["steps"][0]["say"]
    s.submit(False, "retry")
    assert s.current()["n"] == 1 and s.retries == 1
    for _ in range(n):
        s.submit(True)
    assert s.done and s.current() is None
    sc = s.score()
    assert sc["completed_steps"] == n and 0 < sc["score"] <= 100


def test_reminder_bandit_all_astronauts():
    b, res = reminders.simulate(30)
    for w in ("A", "B", "C", "Z"):
        assert b.choose(w) in reminders.SLOTS
    b.update("Z", "07:00", True)
    assert b.best("Z")["slot"] == "07:00"
    assert res["bandit_response_rate"] > res["fixed_0700_response_rate"]


# ---------------------------------------------------------------- detection on several datasets
@pytest.mark.parametrize("seed", [1, 2, 3])
def test_detection_catches_every_event(seed):
    from trix import detect
    sys.path.insert(0, str(ROOT / "eval"))
    import eval_detection
    df, ev = synth.generate(seed=seed)
    r = eval_detection.evaluate(detect.run(df, explain=False), ev, synth.DAYS, len(synth.CREW))
    assert r["recall"] == 1.0 and r["false_alarm_days_per_astronaut_week"] < 0.6


# ---------------------------------------------------------------- parallel stress + office
def test_parallel_stress_40_events():
    events = [dict(FLOWS[i % len(FLOWS)][1]) | {"location": ("iss", "moon", "mars")[i % 3]} for i in range(40)]
    outs = orchestrator.run_many(events, workers=8)
    ids = [o["case_id"] for o in outs]
    assert len(set(ids)) == 40
    for o, (_, _, team, _) in zip(outs, [FLOWS[i % len(FLOWS)] for i in range(40)]):
        assert o["team"] == team
        _check_log(o["case_id"], team)
        assert all(s["case_id"] == o["case_id"] for s in office.spans(o["case_id"]))


def test_office_jsonl_valid():
    orchestrator.run(FLOWS[1][1])
    lines = office.LOG_FILE.read_text().splitlines()
    assert lines and all(json.loads(x)["case_id"] for x in lines[-20:])


# ---------------------------------------------------------------- command-line entry points
@pytest.mark.parametrize("cmd", [["demo.py"], ["agent_office.py"], ["agent_office.py", "--last"], ["trix/synth.py"]])
def test_scripts_run(cmd):
    r = subprocess.run([sys.executable, *cmd], cwd=ROOT, capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stderr[-800:]


# ---------------------------------------------------------------- advice quality (not just "no crash")
QUALITY = [
    ("low oxygen hand-off", {"event": "reading", "who": "C", "readings": {"spo2": 89}},
     {"protocol": "O2-01", "has": ["oxygen"], "not": ["sugar", "sticker"]}),
    ("solar storm", {"event": "symptom", "who": "C", "vitals": {}, "flags": ["solar_event"], "symptoms": "flare alert"},
     {"urgency": "emergency", "protocol": "RAD-SHELTER-01", "decision": "onboard_now", "has": ["shelter"]}),
    ("solar storm in words", {"event": "symptom", "who": "B", "vitals": {}, "symptoms": "DONKI says a solar storm is coming"},
     {"urgency": "emergency", "protocol": "RAD-SHELTER-01", "has": ["shelter"]}),
    ("chest pain", {"event": "checkin", "who": "B", "readings": {"hr": 60}, "symptoms": "chest pain"},
     {"urgency": "emergency", "protocol": "CARD-ECG-01", "decision": "onboard_now", "not": ["spacewalk", "palms"]}),
    ("vague", {"event": "symptom", "who": "A", "vitals": {}, "symptoms": "I just feel off"},
     {"protocol": None, "has": ["check-in"], "not": ["sticker", "defibrillator"]}),
    ("nothing said", {"event": "symptom", "who": "A"},
     {"protocol": None, "has": ["Tell TRIX what's wrong"]}),
    ("spacewalk tingling", {"event": "symptom", "who": "B", "vitals": {"hr": 78}, "symptoms": "after the spacewalk my fingers tingle"},
     {"urgency": "crew_medical_officer", "protocol": "EVA-POST-01", "has": ["joint pain", "decompression"],
      "not": ["vitamin", "calcium"]}),
    ("unresponsive", {"event": "alert", "who": "B", "vitals": {}, "symptoms": "he is unresponsive"},
     {"urgency": "emergency", "protocol": "CPR-MG-01", "decision": "onboard_now", "has": ["defibrillator"],
      "not": ["check-in", "couldn't find"]}),
    ("unresponsive not breathing", {"event": "alert", "who": "B", "vitals": {}, "symptoms": "he is unresponsive and not breathing"},
     {"urgency": "emergency", "protocol": "CPR-MG-01", "has": ["defibrillator"], "not": ["check-in", "couldn't find"]}),
    ("irregular heartbeat", {"event": "alert", "who": "A", "vitals": {"hr": 132}, "flags": ["irregular_rhythm"], "symptoms": "flutter"},
     {"urgency": "emergency", "protocol": "CARD-ECG-01", "has": ["sticker 1"]}),
    ("racing heart and dizzy, no vitals", {"event": "alert", "who": "A", "vitals": {}, "symptoms": "heart racing, irregular rhythm, dizzy"},
     {"urgency": "emergency", "protocol": "CARD-ECG-01", "decision": "onboard_now"}),
    ("palpitations only", {"event": "symptom", "who": "A", "vitals": {}, "symptoms": "I keep feeling palpitations"},
     {"urgency": "crew_medical_officer", "protocol": "CARD-ECG-01"}),
    ("low sugar", {"event": "symptom", "who": "A", "vitals": {}, "symptoms": "I feel shaky, maybe low blood sugar"},
     {"protocol": "GLU-01", "has": ["blood sugar", "wash and dry your hands"], "not": ["sticker"]}),
]


@pytest.mark.parametrize("name,event,exp", QUALITY, ids=[q[0] for q in QUALITY])
def test_advice_quality(name, event, exp):
    o = orchestrator.run(event | {"location": "mars"})
    plan = o["specialist_plan"]
    advice = plan["advice"]
    if "urgency" in exp:
        assert o["urgency"] == exp["urgency"]
    if "protocol" in exp:
        assert plan["protocol_id"] == exp["protocol"]
    if "decision" in exp:
        assert o["decision"]["act"] == exp["decision"]
    for w in exp.get("has", []):
        assert w.lower() in advice.lower(), advice
    for w in exp.get("not", []):
        assert w.lower() not in advice.lower(), advice
    # the procedure shown always matches the protocol chosen; no other protocol's steps leak in
    for pid, p in protocols.library().items():
        if pid != plan["protocol_id"]:
            assert not any(st["say"] in advice for st in p["steps"]), f"{pid} step leaked into advice"
    assert o["safety"]["allowed"]


# ---------- every indicator type, including the ones without a plain high/low limit ----------
SPECIAL = [
    ("co2", 3.5, "red"), ("co2", 2.7, "amber"), ("co2", 2.0, "green"),
    ("bone", 88, "amber"), ("bone", 95, "green"),
    ("orthostatic", {"hr_rise": 35}, "amber"), ("orthostatic", {"sys_drop": 25}, "amber"),
    ("orthostatic", {"hr_rise": 10, "sys_drop": 5}, "green"),
    ("rad_career", 500, "amber"), ("rad_career", 610, "red"), ("rad_career", 100, "green"),
    ("vision", "new blur", "amber"), ("vision", "sudden vision loss", "red"), ("vision", False, "green"),
    ("skin", "cold sore", "amber"), ("skin", "rash with fever", "red"), ("skin", "none", "green"),
    ("rad_daily", "SEP alert", "amber"), ("rad_daily", "storm in progress", "red"),
    ("fluid", 1500, "amber"), ("fluid", 2600, "green"), ("calcium", 600, "amber"), ("calcium", 1100, "green"),
]


@pytest.mark.parametrize("ind,value,status", SPECIAL, ids=[f"{s[0]}={s[1]}" for s in SPECIAL])
def test_special_indicator_limits(ind, value, status):
    assert escalation.assess(ind, value, location="mars").status == status


def test_every_indicator_is_checked_in_a_checkin():
    readings = {"hr": 70, "hrv": 40, "spo2": 98, "temp": 36.6, "glucose": 95, "sleep": 7, "mood": 4, "fatigue": 5,
                "sys": 115, "dia": 75, "vision": "new blur", "bone": 88, "fluid": 1500, "calcium": 600, "co2": 3.5,
                "rad_daily": "SEP alert", "rad_career": 500, "skin": "cold sore", "orthostatic": {"hr_rise": 35}}
    o = orchestrator.run({"event": "checkin", "who": "B", "readings": readings, "location": "mars"})
    checked = {a["indicator"] for a in o["assessments"]}
    assert checked == set(kb.indicators()), set(kb.indicators()) - checked
    assert o["safety"]["allowed"]


def test_solar_storm_reading_hands_off_to_shelter():
    o = orchestrator.run({"event": "reading", "who": "C", "readings": {"rad_daily": "storm in progress"}, "location": "mars"})
    assert o["urgency"] == "emergency"
    assert o["specialist_plan"]["protocol_id"] == "RAD-SHELTER-01"


@pytest.mark.parametrize("who,readings,msg", [
    ("A", {}, "No readings yet"),
    ("Z", {"hr": 70}, "still learning your personal normal"),
    (None, {"hr": 70}, "still learning your personal normal"),
    ("B", {"hr": 66, "spo2": 98}, "within your normal range"),
])
def test_coach_is_honest_about_what_it_checked(who, readings, msg):
    o = orchestrator.run({"event": "checkin", "who": who, "readings": readings, "location": "iss"})
    assert msg in o["coach"]["messages"][0]
