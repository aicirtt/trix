"""The onboard API that the web app uses: every endpoint, end to end, on an empty test record."""
import base64
import io

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from trix import store, vision
from trix.api import app

c = TestClient(app)


def b64(img: np.ndarray) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(cv2.imencode(".jpg", img)[1]).decode()


def test_state_and_location_switch():
    s = c.get("/api/state").json()
    assert s["location"] in ("iss", "moon", "mars") and set(s["crew"]) == {"A", "B", "C"}
    for loc in ("iss", "moon", "mars"):
        assert c.post("/api/mission", json={"location": loc}).json()["location"] == loc
    assert c.post("/api/mission", json={"location": "jupiter"}).status_code == 400


def test_today_before_and_after_checkin():
    t = c.get("/api/today/B").json()
    assert t["body_map"] and t["tasks"][0]["title"] == "Morning check-in"
    out = c.post("/api/checkin", json={"who": "B", "readings": {"hr": 66, "spo2": 98, "sys": 115, "dia": 74, "sleep": 4.5}}).json()
    assert out["case_id"] and out["safety"]["allowed"]
    t = c.get("/api/today/B").json()
    assert t["checked_in_today"] and t["tasks"][0]["done"]
    assert t["body_map"]["brain"]["status"] != "green"          # short sleep shows on the body map
    assert c.get("/api/today/Z").status_code == 404
    assert c.post("/api/checkin", json={"who": "Z", "readings": {}}).status_code == 400


def test_single_reading_does_not_hide_the_rest_of_the_body_map():
    c.post("/api/checkin", json={"who": "C", "readings": {"hr": 70, "spo2": 97, "sleep": 7}})
    c.post("/api/event", json={"event": "reading", "who": "C", "readings": {"co2": 3.6}})
    bm = c.get("/api/today/C").json()["body_map"]
    assert bm["lungs"]["status"] == "red" and "heart" in bm


def test_red_reading_creates_emergency_alert():
    out = c.post("/api/event", json={"event": "reading", "who": "A", "readings": {"hr": 131, "irregular_rhythm": 1}}).json()
    assert out["urgency"] == "emergency" and out["specialist_plan"]["protocol_id"] == "CARD-ECG-01"
    alerts = c.get("/api/today/B").json()["alerts"]
    assert any(a["case_id"] == out["case_id"] for a in alerts)


def test_trends_with_band_and_forecast():
    bone = c.get("/api/trend/C/bone?days=240").json()
    assert bone["points"] and bone["forecast"] and bone["band"]
    bp = c.get("/api/trend/A/bp?days=30").json()
    assert all("dia" in p for p in bp["points"])
    assert c.get("/api/trend/A/nothing").json()["points"] == []


def test_ask_is_cited_and_safe():
    r = c.post("/api/ask", json={"question": "How much water should I drink per day?"}).json()
    assert "[1]" in r["answer"] and any(s["cited"] for s in r["sources"]) and r["safety"]["allowed"]
    assert c.post("/api/ask", json={"question": " "}).status_code == 400


@pytest.mark.parametrize("pid", ["CARD-ECG-01", "CPR-MG-01", "US-A4C-01", "GLU-01", "EVA-POST-01", "LAND-01", "O2-01", "RAD-SHELTER-01"])
def test_every_procedure_runs_to_the_end(pid):
    v = c.post("/api/procedure/start", json={"protocol_id": pid, "who": "B", "practice": True}).json()
    n = v["current"]["of"]
    v = c.post(f"/api/procedure/{v['sid']}/submit", json={"passed": False, "detail": "not yet"}).json()
    assert v["current"]["n"] == 1                       # a failed check never advances
    for _ in range(n):
        v = c.post(f"/api/procedure/{v['sid']}/submit", json={"passed": True}).json()
    assert v["done"] and v["score"]["completed_steps"] == n and v["score"]["retries"] == 1
    assert c.post("/api/procedure/start", json={"protocol_id": "NOPE"}).status_code == 404


def test_ecg_camera_check():
    img = np.full((720, 960, 3), 40, np.uint8)
    lm = {11: [620 / 960, 200 / 720], 12: [340 / 960, 200 / 720], 23: [580 / 960, 560 / 720], 24: [380 / 960, 560 / 720]}
    px = {k: [v[0] * 960, v[1] * 720] for k, v in lm.items()}
    cv2.fillConvexPoly(img, np.array([px[12], px[11], px[23], px[24]], np.int32), (120, 150, 200))
    t = vision.electrode_targets(px)["E1"]
    off = img.copy()
    cv2.circle(off, (int(t[0]) + 45, int(t[1])), 14, (245, 245, 245), -1)
    r = c.post("/api/vision/ecg", json={"image": b64(off), "landmarks": lm, "target": "E1"}).json()
    assert r["status"] == "move" and "toward her right" in r["message"]
    good = img.copy()
    cv2.circle(good, (int(t[0]), int(t[1])), 14, (245, 245, 245), -1)
    r = c.post("/api/vision/ecg", json={"image": b64(good), "landmarks": lm, "target": "E1"}).json()
    assert r["passed"] is True
    r = c.post("/api/vision/ecg", json={"image": b64(img), "landmarks": {}, "target": "E1"}).json()
    assert r["status"] == "no_body"


def test_face_fatigue_saves_reading():
    def eye(o):
        h = 10 * o
        return [[0, 0], [10, -h], [20, -h], [30, 0], [20, h], [10, h]]
    frames = [{"t": i * 0.1, "left": eye(1 if i % 10 > 4 else 0.1), "right": eye(1 if i % 10 > 4 else 0.1)} for i in range(250)]
    r = c.post("/api/vision/fatigue", json={"who": "A", "frames": frames}).json()
    assert r["status"] == "red" and any(x["indicator"] == "fatigue" for x in store.live_readings("A"))
    assert c.post("/api/vision/fatigue", json={"who": "A", "frames": []}).json()["ok"] is False


def test_skin_photo_compares_with_last_one():
    skin = np.full((400, 400, 3), (130, 160, 210), np.uint8)
    assert c.post("/api/vision/skin", json={"who": "B", "image": b64(skin)}).json()["status"] == "green"
    cv2.circle(skin, (200, 200), 60, (80, 80, 200), -1)
    r = c.post("/api/vision/skin", json={"who": "B", "image": b64(skin)}).json()
    assert r["status"] == "amber" and r["change"] > 0


def test_food_pouch_qr_and_menu_log():
    png = cv2.imdecode(np.frombuffer(c.get("/api/food/qr/TRIX-F09").content, np.uint8), 1)
    canvas = np.full((500, 700, 3), 200, np.uint8)
    canvas[80:80 + png.shape[0], 200:200 + png.shape[1]] = png
    r = c.post("/api/vision/food", json={"who": "C", "image": b64(canvas)}).json()
    assert r["ok"] and r["items"][0]["id"] == "TRIX-F09"
    f = c.post("/api/food/log", json={"who": "C", "ids": ["TRIX-F12"]}).json()
    assert f["totals"]["fluid_ml"] >= 750 and f["totals"]["calcium_mg"] >= 300
    assert c.post("/api/food/log", json={"who": "C", "ids": ["BAD"]}).status_code == 400
    assert "TRIX-F01" in c.get("/api/food/labels").text


def test_ultrasound_view_quality():
    us = np.zeros((480, 640), np.uint8)
    cv2.ellipse(us, (320, 20), (420, 420), 0, 55, 125, 170, -1)
    noise = np.random.default_rng(0).normal(0, 25, us.shape).astype(int)
    us = np.clip(us.astype(int) + np.where(us > 0, noise, 0), 0, 255).astype(np.uint8)
    for x, y in [(270, 200), (370, 200), (270, 320), (370, 320)]:
        cv2.ellipse(us, (x, y), (38, 48), 0, 0, 360, 10, -1)
    r = c.post("/api/vision/ultrasound", json={"image": b64(cv2.cvtColor(us, cv2.COLOR_GRAY2BGR))}).json()
    assert r["quality"] == "good" and r["chambers"] == 4
    r = c.post("/api/vision/ultrasound", json={"image": b64(np.zeros((200, 200, 3), np.uint8))}).json()
    assert r["quality"] == "poor"
    assert c.post("/api/vision/ultrasound", json={"image": "data:image/jpeg;base64,AAAA"}).status_code == 400


def test_voice_parse_and_transcribe_fallback():
    r = c.post("/api/voice/parse", json={"text": "pulse one hundred and ten, blood pressure 120 over 80, I feel dizzy"}).json()
    assert r["readings"] == {"hr": 110, "sys": 120, "dia": 80} and "dizzy" in r["symptoms"]
    r = c.post("/api/voice/transcribe", files={"audio": ("a.webm", io.BytesIO(b"x"), "audio/webm")}).json()
    assert "ok" in r


def test_device_pairing_and_csv_import():
    c.post("/api/devices/pair", json={"id": "ble-1", "name": "Polar H10", "feeds": ["hr"], "status": "live"})
    assert any(d["name"] == "Polar H10" for d in c.get("/api/ops/devices").json()["ops"]["devices"])
    r = c.post("/api/import", data={"who": "A"}, files={"file": ("e.csv", io.BytesIO(b"hr,spo2\n71,98\n73,97\n"), "text/csv")}).json()
    assert r["imported"] == 4


def test_ops_views_do_not_fill_the_earth_queue():
    before = len(c.get("/api/reports").json()["reports"])
    c.get("/api/ops/pharmacy")
    c.get("/api/ops/devices")
    assert len(c.get("/api/reports").json()["reports"]) == before


def test_privacy_change_persists_and_applies():
    c.post("/api/privacy/A", json={"mood_details": True})
    assert c.get("/api/privacy/A").json()["settings"]["mood_details"] is True
    out = c.post("/api/event", json={"event": "symptom", "who": "A", "symptoms": "I feel lonely and stressed"}).json()
    assert "withheld" not in out["report"]["symptoms"]


def test_reports_send():
    c.post("/api/event", json={"event": "symptom", "who": "B", "symptoms": "headache"})
    assert c.post("/api/reports/send").json()["sent"] >= 1
    assert all(r["status"] == "sent" for r in c.get("/api/reports").json()["reports"])


def test_crew_game_and_buddy():
    g = c.get("/api/crew").json()
    assert 0 <= g["cohesion"]["score"] <= 100 and g["cohesion"]["mood_now"] is not None
    assert len(g["board"]) == 3 and 0 <= g["team_goal"]["pct"] <= 100
    pairs = {b["who"]: b["buddy"] for b in g["buddy"]}
    assert all(a != b for a, b in pairs.items()) and sorted(pairs.values()) == ["A", "B", "C"]
    g = c.post("/api/buddy", json={"who": "A", "buddy": pairs["A"], "status": "concern", "note": "very quiet"}).json()
    assert next(b for b in g["buddy"] if b["who"] == "A")["done"]
    assert any(x["event"] == "symptom" and x["who"] == pairs["A"] for x in c.get("/api/office").json()["cases"])


def test_space_weather_and_landing_offline():
    sw = c.get("/api/feeds/space-weather").json()
    assert sw["status"] in ("green", "amber", "red") and sw["source"]
    land = c.get("/api/feeds/landing?site=gulf").json()
    assert land["windows"] and all("go" in w for w in land["windows"])


def test_space_weather_storm_triggers_shelter():
    from trix import feeds
    storm = feeds.assess_space_weather({"FLR": [], "SEP": [{"eventTime": "2026-11-14T10:00Z"}], "fetched": "2026-11-14T12:00:00+00:00"})
    assert storm["status"] == "red" and storm["reading"] == {"rad_daily": "storm in progress"}
    out = c.post("/api/event", json={"event": "reading", "who": "C", "readings": storm["reading"]}).json()
    assert out["specialist_plan"]["protocol_id"] == "RAD-SHELTER-01"


def test_agent_office_case_tree():
    out = c.post("/api/event", json={"event": "alert", "who": "A", "symptoms": "chest pain"}).json()
    r = c.get(f"/api/office/{out['case_id']}").json()
    agents = [s["agent"] for s in r["spans"]]
    assert agents[0] == "Mission orchestrator" and "Triage" in agents and "Safety" in agents
    assert r["spans"][0]["depth"] == 0 and max(s["depth"] for s in r["spans"]) >= 2


def test_web_app_is_served():
    assert "TRIX" in c.get("/").text
    for f in ("/js/app.js", "/css/app.css", "/js/views/checkin.js", "/js/sensors.js"):
        assert c.get(f).status_code == 200, f


def test_co2_headache_link():
    from trix import insights
    r = c.get("/api/insights/co2-headache").json()
    assert r["ok"] and r["rate_high"] > r["rate_low"] and len(r["bins"]) == 5
    # NASA anchor: ~1% at 2.5 mmHg, odds double per mmHg
    assert abs(insights.nasa_risk(2.5) - 0.01) < 1e-9 and insights.nasa_risk(3.5) > 1.9 * insights.nasa_risk(2.5)
    c.post("/api/event", json={"event": "reading", "who": "B", "readings": {"co2": 3.4}})
    out = c.post("/api/checkin", json={"who": "B", "readings": {"hr": 68}, "symptoms": "bad headache"}).json()
    assert any("CO2" in m for m in out["coach"]["messages"]) and out["safety"]["allowed"]


def test_addons_degrade_gracefully_when_not_installed():
    from trix.addons import echonet, medsiglip
    skin = np.full((300, 300, 3), (130, 160, 210), np.uint8)
    r = c.post("/api/vision/skin", json={"who": "C", "image": b64(skin)}).json()
    assert "ai" in r and (r["ai"]["ok"] or "setup_addons" in r["ai"]["message"])
    r = c.post("/api/vision/ultrasound-clip", files={"clip": ("c.mp4", io.BytesIO(b"not a video"), "video/mp4")}).json()
    assert r["ok"] or "setup_addons" in r["message"] or "too short" in r["message"]
    assert "skin_ai" in c.get("/api/system").json()


def test_echonet_clip_preprocessing(tmp_path):
    from trix.addons import echonet
    path = str(tmp_path / "clip.avi")
    w = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"MJPG"), 30, (160, 120))
    for i in range(70):
        f = np.zeros((120, 160, 3), np.uint8)
        cv2.circle(f, (80, 60), 20 + int(10 * np.sin(i / 5)), (200, 200, 200), -1)
        w.write(f)
    w.release()
    clip = echonet.load_clip(path)
    assert clip.shape == (3, 32, 112, 112) and abs(float(clip.mean())) < 1e-3


def test_voice_biomarkers_learn_then_flag_fatigue():
    from tests_voice_synth import speech
    assert "passage" in c.get("/api/voice/passage").json()
    for i in range(3):
        r = c.post("/api/voice/biomarkers", data={"who": "C"}, files={"audio": ("v.wav", io.BytesIO(speech(seed=i)), "audio/wav")}).json()
        assert r["ok"] and r["status"] == "green"
    tired = speech(rate=3.0, pause_every=3, pause_s=0.6, pitch_var=0.8, seed=9)
    r = c.post("/api/voice/biomarkers", data={"who": "C"}, files={"audio": ("v.wav", io.BytesIO(tired), "audio/wav")}).json()
    assert r["status"] == "amber" and len(r["signs"]) >= 2 and r["baseline"] == "personal"
    r = c.post("/api/voice/biomarkers", data={"who": "C"}, files={"audio": ("v.wav", io.BytesIO(b"junk"), "audio/wav")}).json()
    assert r["ok"] is False and r["message"]


def test_routine_capture_and_insight_loop():
    t = c.get("/api/today/B").json()
    assert {s["id"] for s in t["routine"]["sessions"]} == {"morning", "evening", "weekly"} and "strain" in t
    info = c.get("/api/capture/B/glucose").json()
    assert len(info["howto"]) == 3 and info["why"] and info["in_six"]
    r = c.post("/api/capture", json={"who": "B", "indicator": "glucose", "value": 94}).json()
    assert r["meaning"]["word"] == "GO" and "94" in r["meaning"]["text"] and r["insight"]["line"]
    assert r["ring"]["done"] == r["ring_before"]["done"] + 1 and r["readiness"] >= r["readiness_before"]
    assert "Safety" in r["agents"] and r["next"]["id"] != "glucose"
    r = c.post("/api/capture", json={"who": "B", "indicator": "bp", "sys": 150, "dia": 95}).json()
    assert r["meaning"]["word"] == "WATCH"
    assert c.post("/api/capture", json={"who": "B", "indicator": "hr", "value": 900}).status_code == 400
    assert c.post("/api/capture", json={"who": "B", "indicator": "hr", "value": ""}).status_code == 400
    for ind, v in [("reaction", 310), ("exercise", 95), ("mass", 72.4), ("back_pain", 2), ("mood", 4), ("sleep", 7)]:
        assert c.post("/api/capture", json={"who": "B", "indicator": ind, "value": v}).status_code == 200, ind
    assert c.post("/api/capture", json={"who": "B", "indicator": "reaction", "value": 600}).json()["meaning"]["word"] == "NO-GO"


def test_overview_strain_trend():
    o = c.get("/api/overview/C").json()
    assert len(o["days"]) == 30 == len(o["strain"]) and o["now"]["status"] in ("green", "amber", "red")
    assert any(v is not None for v in o["alertness"])


@pytest.mark.parametrize("text,kind", [
    ("my chest feels tight", "emergency"), ("heart rate 72 and oxygen 98", "log"), ("I drank 500 ml of water", "log"),
    ("start my check-in", "navigate"), ("why is my sleep amber?", "status"), ("how am I doing?", "summary"),
    ("I have a headache", "symptom"), ("How much water should I drink per day?", "ask"), ("", "empty")])
def test_assistant_routes_to_the_right_place(text, kind):
    r = c.post("/api/assistant", json={"who": "C", "text": text}).json()
    assert r["kind"] == kind and r["say"]
    if kind == "emergency":
        assert r["go"].startswith("#/emergency/") and "Emergency team" in r["route"]
    if kind == "log":
        assert r["readings"] and "Logged" in r["say"]
    if kind == "ask":
        assert r["sources"]


def test_simulated_devices_read_and_sync():
    r = c.post("/api/devices/read", json={"who": "A", "indicator": "bp"}).json()
    assert r["simulated"] and 80 < r["values"]["sys"] < 180 and r["device"] == "BP cuff"
    assert c.post("/api/devices/read", json={"who": "A", "indicator": "mood"}).status_code == 404
    s = c.post("/api/devices/sync", json={"who": "A"}).json()
    assert s["synced"] >= 6 and s["simulated"] and s["case_id"]
    six = {x["id"]: x for x in c.get("/api/today/A").json()["six"]}
    assert all(six[k]["measured_today"] for k in ("bp", "hr", "glucose", "temp", "sleep"))
    assert any(x["source"] == "simulated device" for x in store.live_readings("A"))
    assert c.post("/api/devices/sync", json={"who": "A"}).json()["synced"] == 0


# ------------------------------------------------------------------ talk to TRIX in the astronaut's language
@pytest.mark.parametrize("lang,text,kind,go", [
    ("ru", "пульс 70 и кислород 97", "log", None), ("es", "presión arterial 118 sobre 76", "log", None), ("fr", "ouvre mes tendances", "navigate", "#/body"),
    ("de", "starte meinen Check-in", "navigate", "#/checkin"), ("it", "apri l'equipaggio", "navigate", "#/crew"), ("ja", "心拍数 72", "log", None),
    ("zh", "打开地球", "navigate", "#/earth"), ("ko", "체크인 시작", "navigate", "#/checkin"), ("hi", "मेरा चेक-इन शुरू करो", "navigate", "#/checkin"),
    ("en", "measure my blood pressure", "navigate", "#/capture/bp"), ("en", "show my sleep", "navigate", "#/body/sleep"), ("es", "cómo está mi pulso", "status", "#/body/hr"),
])
def test_assistant_understands_other_languages(lang, text, kind, go):
    r = c.post("/api/assistant", json={"who": "C", "text": text, "lang": lang}).json()
    assert r["kind"] == kind, r
    if go:
        assert r["go"] == go
    if kind == "log":
        assert r["readings"]


def test_wake_word_and_localize_helpers():
    from trix import assistant_lang as al
    assert al.strip_wake("Hey TRIX, log heart rate 70") == "log heart rate 70"
    assert al.strip_wake("трикс открой экипаж") == "открой экипаж"
    assert al.strip_wake("log heart rate 70") is None
    assert al.localize("давление 120 на 80", "ru") == "blood pressure 120 over 80"
    assert "over" not in al.localize("спал 7 часов", "ru")                  # "на" is "over" only between two numbers
    assert al.localize("heart rate 70", "en") == "heart rate 70"


def test_planner_only_runs_actions_that_exist():
    from trix import assistant_plan as ap
    v = ap.validate
    assert v({"action": "navigate", "go": "#/body", "say": "Abro tus tendencias."}, "")["kind"] == "navigate"
    assert v({"action": "navigate", "go": "#/capture/bp"}, "")["go"] == "#/capture/bp"
    assert v({"action": "navigate", "go": "#/capture/nothing"}, "") is None and v({"action": "navigate", "go": "https://evil"}, "") is None
    assert v({"action": "log", "readings": {"hr": "70", "spo2": 97, "foo": 1, "sys": 900}}, "pulse 70 oxygen 97 sys 900")["readings"] == {"hr": 70, "spo2": 97}
    assert v({"action": "log", "readings": {"sys": 900}}, "900") is None
    assert v({"action": "log", "readings": {"hr": 72, "sys": 118, "dia": 76}}, "and blood pressure 118 over 76")["readings"] == {"sys": 118, "dia": 76}   # no echo of earlier turns
    assert v({"action": "status", "indicator": "hr"}, "")["kind"] == "status" and v({"action": "status", "indicator": "x"}, "") is None
    assert v({"action": "procedure", "protocol_id": "CPR-MG-01"}, "")["kind"] == "procedure" and v({"action": "procedure", "protocol_id": "NOPE"}, "") is None
    assert v({"action": "emergency"}, "he collapsed")["symptoms"] == "he collapsed"
    assert v({"action": "clarify"}, "")["say"] and v({"action": "launch_missiles"}, "") is None and v("junk", "") is None
    assert ap.plan("hello", "en", []) is None or isinstance(ap.plan("hello", "en", []), dict)   # no model in tests: falls back to None


def test_assistant_can_start_a_procedure_and_clarify():
    from trix import api as A
    r = A._assistant("B", "", {}, {"kind": "procedure", "protocol_id": "GLU-01", "say": ""})
    assert r["kind"] == "procedure" and r["go"].startswith("#/procedure/") and "Blood sugar" in r["say"]
    assert A._assistant("B", "", {}, {"kind": "clarify", "say": "Which one?"})["say"] == "Which one?"


def _person_mask(calf=20, head=34):
    m = np.zeros((720, 480), np.uint8)
    cv2.ellipse(m, (240, 110), (head, 44), 0, 0, 360, 255, -1)
    cv2.rectangle(m, (190, 160), (290, 400), 255, -1)
    for x in (212, 268):
        cv2.line(m, (x, 400), (x, 520), 255, 44)
        cv2.line(m, (x, 520), (x, 650), 255, calf * 2)
    for x0, x1 in ((180, 130), (300, 350)):
        cv2.line(m, (x0, 175), (x1, 380), 255, 26)
    lm = {0: [240, 110], 7: [270, 108], 8: [210, 108], 11: [290, 170], 12: [190, 170], 23: [268, 400], 24: [212, 400], 25: [268, 520], 26: [212, 520], 27: [268, 650], 28: [212, 650]}
    return m, {k: [x / 480, y / 720] for k, (x, y) in lm.items()}


def b64png(img):
    return "data:image/png;base64," + base64.b64encode(cv2.imencode(".png", img)[1]).decode()


def test_body_mirror_scan_and_compare():
    m, lm = _person_mask()
    r = c.post("/api/scan", json={"who": "C", "mask": b64png(m), "landmarks": lm, "photo": b64(np.full((72, 48, 3), 90, np.uint8))}).json()
    assert len(r["scans"]) == 1 and r["current"]["has_photo"] and len(r["current"]["outline"]) > 10
    sid = r["current"]["id"]
    assert c.get(f"/api/scan/C/photo/{sid}").status_code == 200
    m2, lm2 = _person_mask(calf=18, head=37)                 # puffier face, thinner calves
    r = c.post("/api/scan", json={"who": "C", "mask": b64png(m2), "landmarks": lm2}).json()
    ch = {x["id"]: x for x in r["changes"]}
    assert ch["face"]["pct"] > 4 and ch["calf"]["pct"] < -4 and ch["calf"]["status"] == "amber" and abs(ch["shoulders"]["pct"]) < 1
    assert "calf" in r["message"]
    assert c.post("/api/scan", json={"who": "C", "mask": b64png(np.zeros((100, 100), np.uint8)), "landmarks": lm}).status_code == 400
    assert c.post("/api/scan", json={"who": "C", "mask": b64png(m), "landmarks": {}}).status_code == 400
    assert c.post("/api/scan/simulate-day1", json={"who": "A"}).status_code == 400
    c.post("/api/scan", json={"who": "A", "mask": b64png(m), "landmarks": lm})
    r = c.post("/api/scan/simulate-day1", json={"who": "A"}).json()
    assert r["baseline"]["simulated"] and {x["id"]: x for x in r["changes"]}["face"]["pct"] > 4


def test_cut_the_link_changes_decisions_and_holds_reports():
    c.post("/api/mission", json={"location": "iss", "link_cut": True})
    assert c.get("/api/state").json()["link"]["cut"]
    out = c.post("/api/event", json={"event": "alert", "who": "A", "symptoms": "chest pain"}).json()
    assert out["decision"]["act"] == "onboard_now" and "No contact" in out["decision"]["why"]
    assert c.post("/api/reports/send").status_code == 409 and c.post("/api/ground/message", json={"text": "hi"}).status_code == 409
    c.post("/api/mission", json={"link_cut": False})
    out = c.post("/api/event", json={"event": "symptom", "who": "A", "symptoms": "headache"}).json()
    assert out["decision"]["act"] == "consult_live"
    c.post("/api/mission", json={"location": "mars"})


def test_ground_view_gets_reports_after_the_delay_and_can_reply():
    c.post("/api/mission", json={"location": "iss"})
    c.post("/api/event", json={"event": "symptom", "who": "B", "symptoms": "I feel lonely and stressed"})
    c.post("/api/reports/send")
    import time as _t
    _t.sleep(0.7)
    g = c.get("/api/ground").json()
    got = [r for r in g["reports"] if r["arrived"]]
    assert got and got[0]["body"]["case_id"] and any("withheld" in str(r["body"].get("symptoms", "")) for r in got)
    assert c.post("/api/ground/message", json={"to": "B", "text": "Good work. Rest today."}).json()["ok"]
    _t.sleep(0.7)
    assert any("Rest today" in m["text"] for m in c.get("/api/inbox/B").json()["messages"])
    assert not c.get("/api/inbox/A").json()["messages"]
    c.post("/api/mission", json={"location": "mars"})


@pytest.mark.parametrize("sid", ["irregular", "unresponsive", "low_oxygen", "fever", "bad_sleep", "co2", "solar_storm"])
def test_what_if_scenarios(sid):
    r = c.post("/api/sim", json={"scenario": sid, "who": "A"}).json()
    assert r["results"] and all(x["case_id"] for x in r["results"])
    if sid in ("co2", "solar_storm"):
        assert len(r["results"]) == 3
    if sid in ("irregular", "unresponsive", "low_oxygen", "solar_storm"):
        assert r["results"][0]["urgency"] == "emergency" and r["results"][0]["protocol"]
    else:
        assert r["results"][0]["flagged"]


def test_replay_and_language_and_reset():
    r = c.get("/api/replay/C").json()
    assert r["days"] == 240 and len(r["parts"]["bones"]) == 240 and any(r["parts"]["bones"])
    bone = next(e for e in r["events"] if "bone" in e["name"].lower())
    assert bone["trix_day"] is not None
    assert c.post("/api/lang", json={"who": "B", "lang": "ja"}).json()["lang"] == "ja" and c.get("/api/state").json()["langs"]["B"] == "ja"
    assert c.post("/api/lang", json={"who": "B", "lang": "xx"}).status_code == 400
    assert c.post("/api/sim/reset").json()["ok"] and c.get("/api/office").json()["cases"] == []


@pytest.mark.parametrize("words", ["she fainted and won't wake up", "he stopped breathing", "he is unconscious on the floor", "my crewmate collapsed and has no pulse"])
def test_arrest_is_recognised_however_it_is_worded(words):
    out = c.post("/api/event", json={"event": "alert", "who": "B", "vitals": {}, "symptoms": words}).json()
    assert out["urgency"] == "emergency" and out["specialist_plan"]["protocol_id"] == "CPR-MG-01"
    assert c.post("/api/assistant", json={"who": "A", "text": words}).json()["kind"] == "emergency"


def test_sources_and_offline_check():
    s = c.get("/api/sources").json()
    assert len(s["references"]) >= 15 and sum(r["url"].startswith("http") for r in s["references"]) >= len(s["references"]) - 1 and s["simulated"]
    assert len(s["knowledge_notes"]) >= 14 and all(n["title"] for n in s["knowledge_notes"])
    o = c.get("/api/offline-check").json()
    assert o["all_core_offline"] in (True, False) and len(o["checks"]) >= 7
    assert "/js/views/sources.js" and c.get("/js/views/sources.js").status_code == 200


def test_everyday_words_reach_the_right_source():
    from trix import teams
    hits = teams.retriever().search("the air feels stuffy and my head hurts", k=3)
    assert hits[0]["doc_id"] in ("co2", "ind:co2")


# ---------------------------------------------------------------- environments, when-to-tell, open science
def test_four_environments_change_guidance():
    s = c.get("/api/state").json()
    assert set(s["locations"]) == {"iss", "moon", "rover", "mars"}
    seen = {}
    for loc in ("iss", "moon", "rover", "mars"):
        assert c.post("/api/mission", json={"location": loc}).status_code == 200
        st = c.get("/api/state").json()
        assert st["env"]["id"] == loc and len(st["env"]["watch"]) >= 3 and st["env"]["help"]
        seen[loc] = c.get("/api/capture/A/mass").json()["env"]
    assert "spring" in seen["iss"]["note"] and "one sixth" in seen["moon"]["note"]
    assert seen["rover"]["skip"] and not seen["moon"]["skip"]
    assert c.post("/api/mission", json={"location": "venus"}).status_code == 400
    c.post("/api/mission", json={"location": "mars"})


def test_rover_checkin_runs_and_routes_live():
    from trix import escalation
    assert escalation.assess("bp", {"sys": 170, "dia": 105}, location="rover").route == "live consult now"
    c.post("/api/mission", json={"location": "rover"})
    r = c.post("/api/checkin", json={"who": "A", "readings": {"hr": 62, "sys": 118, "dia": 76}})
    assert r.status_code == 200
    c.post("/api/mission", json={"location": "mars"})


def test_capture_says_when_and_who_to_tell():
    from trix import routine
    for ind in routine.HOWTO:
        i = c.get(f"/api/capture/A/{ind}").json()
        assert i["when"]["how_often"] and i["when"]["tell"], ind
        assert i["hazard"] and i["science"]["term"], ind
    bp = c.get("/api/capture/A/bp").json()["when"]["tell"]
    assert any("3 days" in x and "crew medical officer" in x for x in bp) and any("flight surgeon" in x for x in bp)


def test_open_science_list_and_offline_search(monkeypatch, tmp_path):
    from trix import feeds, science
    monkeypatch.setattr(feeds, "CACHE", tmp_path)
    d = c.get("/api/science").json()
    assert len(d["studies"]) == 10 and all(x["id"].startswith("OSD-") and x["url"].endswith(x["id"]) for x in d["studies"])
    assert {x["id"] for x in c.get("/api/science?indicator=skin").json()["studies"]} >= {"OSD-572", "OSD-574"}
    assert c.get("/api/science?indicator=nope").status_code == 404

    def down(url, headers=None):
        raise OSError("no link")
    monkeypatch.setattr(feeds, "_get", down)
    r = c.get("/api/science/search?q=zz-skin-offline").json()
    assert "offline" in r["source"] and r["studies"]
    live = {"hits": {"hits": [{"_source": {"Accession": "OSD-137", "Study Title": "A study", "Study Description": "d", "organism": "Mus musculus"}},
                              {"_source": {"Accession": "GSE1", "Study Title": "not OSDR"}}]}}
    monkeypatch.setattr(feeds, "_get", lambda url, headers=None: live)
    r = c.get("/api/science/search?q=zz-live-test").json()
    assert r["source"] == "live" and [x["id"] for x in r["studies"]] == ["OSD-137"]
    assert set(science.TERM) >= set(__import__("trix.routine", fromlist=["x"]).HOWTO)


def test_sources_list_open_science_and_csa():
    s = c.get("/api/sources").json()
    assert len(s["open_science"]["studies"]) == 10
    assert sum("asc-csa.gc.ca" in (r["url"] or "") for r in s["references"]) == 2
    assert any(d["id"] == "csa_radiation" for d in s["knowledge_notes"])


def test_iss_experiments_linked_to_measurements():
    s = c.get("/api/iss").json()
    assert s["total_experiments"] > 3000 and s["human_research"] == 374
    assert set(s["agencies"]) == {"NASA", "ESA", "ROSCOSMOS", "CSA", "JAXA"}
    for ind in ("bp", "hr", "glucose", "temp", "sleep", "mood"):          # the six the challenge names
        assert s["by_indicator"][ind] > 0, ind
    bone = c.get("/api/iss?indicator=bone").json()
    assert any(x["name"] == "Bone Health" for x in bone["examples"])
    cap = c.get("/api/capture/A/bp").json()["iss"]
    assert cap["count"] >= 20 and len(cap["examples"]) == 4 and cap["examples"][0]["url"].startswith("https://www.nasa.gov/")
    assert c.get("/api/iss?indicator=nope").status_code == 404
    assert c.get("/api/sources").json()["iss"]["human_research"] == 374


# ---------------------------------------------------------------- coming home
def test_coming_home_readiness_and_plan():
    for loc, dest in (("iss", "Earth"), ("moon", "Earth"), ("mars", "the surface of Mars")):
        c.post("/api/mission", json={"location": loc})
        r = c.get("/api/homecoming/C").json()
        assert r["destination"] == dest and 0 <= r["score"] <= 100 and r["level"] in ("green", "amber", "red")
        assert {a["id"] for a in r["areas"]} == {"standing", "bones", "muscle", "balance", "eyes", "radiation", "spine", "sleep"}
        assert [p["phase"] for p in r["plan"]] == ["Before landing", "Landing day", "First week", "Weeks to months"]
        assert all(a["source"] and a["source"]["title"] for a in r["areas"])
    assert any("no ground crew" in s for s in r["plan"][1]["steps"])             # Mars: crewmates help each other
    bones = next(a for a in r["areas"] if a["id"] == "bones")
    assert bones["status"] == "amber" and "89" in bones["why"]                    # simulated C is below the watch level
    rad = next(a for a in r["areas"] if a["id"] == "radiation")
    assert "mSv" in rad["value"] and "600" in rad["value"]
    assert c.get("/api/homecoming/Z").status_code == 404
    c.post("/api/mission", json={"location": "mars"})


def test_coming_home_stand_test_and_landing_day():
    before = c.get("/api/homecoming/B").json()
    st = next(a for a in before["areas"] if a["id"] == "standing")["status"]
    r = c.post("/api/homecoming/B/stand-test", json={"lying_hr": 60, "standing_hr": 66, "lying_sys": 120, "standing_sys": 118}).json()
    assert r["saved"] == {"hr_rise": 6, "sys_drop": 2}
    assert next(a for a in r["areas"] if a["id"] == "standing")["status"] == "green"
    r = c.post("/api/homecoming/B/stand-test", json={"lying_hr": 60, "standing_hr": 98, "lying_sys": 120, "standing_sys": 96}).json()
    a = next(a for a in r["areas"] if a["id"] == "standing")
    assert a["status"] == "red" and "fainting plan" in r["plan"][0]["steps"][0]
    assert r["score"] < 100 and r["level"] == "red"
    assert c.post("/api/homecoming/B/stand-test", json={"lying_hr": 60}).status_code == 400
    assert c.post("/api/homecoming/B/stand-test", json={"lying_hr": 5, "standing_hr": 66, "lying_sys": 120, "standing_sys": 118}).status_code == 400
    assert c.post("/api/homecoming/landing", json={"in_days": 3}).json()["days_to_landing"] == 3
    assert c.get("/api/homecoming/B").json()["days_to_landing"] == 3
    assert c.post("/api/homecoming/landing", json={"in_days": -1}).status_code == 400
    assert c.post("/api/homecoming/landing", json={"in_days": "soon"}).status_code == 400
    assert st in ("due", "green", "amber", "red")


# ---------------------------------------------------------------- messages from home
def _msg(who, sender, rule, data=b"ID3fake-audio", mime="audio/mpeg"):
    return c.post(f"/api/messages/{who}", data={"sender": sender, "relation": "family", "rule": rule}, files={"file": ("m.mp3", data, mime)})


def test_messages_unlock_by_effort_not_numbers():
    who = "A"
    for m in c.get(f"/api/messages/{who}").json()["messages"]:
        c.delete(f"/api/messages/{who}/{m['id']}")
    first = _msg(who, "Mum", "first").json()
    three = _msg(who, "Sam", "streak3").json()
    anytime = _msg(who, "Dad", "any").json()
    assert not first["unlocked"] and not three["unlocked"] and anytime["unlocked"]
    assert c.get(f"/api/messages/{who}/{first['id']}/media").status_code == 404          # locked: no file
    lst = c.get(f"/api/messages/{who}").json()
    assert lst["next"]["sender"] == "Mum" and "1 more check-in day" in lst["next"]["say"]
    # a check-in (any numbers, even bad ones) unlocks "first"; a 3-day rule needs 3 days
    r = c.post("/api/capture", json={"who": who, "indicator": "hr", "value": 118}).json()
    assert [m["sender"] for m in r["home_messages"]] == ["Mum"]
    got = c.get(f"/api/messages/{who}/{first['id']}/media")
    assert got.status_code == 200 and got.content == b"ID3fake-audio"
    lst = c.get(f"/api/messages/{who}").json()
    assert lst["next"]["sender"] == "Sam" and lst["next"]["left"] == 2
    assert c.post(f"/api/messages/{who}/{first['id']}/played").json()["ok"]
    # voice or food logs alone are not a check-in
    c.post("/api/capture", json={"who": who, "indicator": "mood", "value": 4, "source": "voice check"})
    assert c.get(f"/api/messages/{who}").json()["next"]["left"] == 2


def test_messages_comfort_and_low_mood():
    who = "B"
    for m in c.get(f"/api/messages/{who}").json()["messages"]:
        c.delete(f"/api/messages/{who}/{m['id']}")
    assert c.post(f"/api/messages/{who}/comfort").status_code == 404
    a = _msg(who, "Ana", "streak30").json()
    b = _msg(who, "Leo", "streak30").json()
    m = c.post(f"/api/messages/{who}/comfort").json()
    assert m["id"] == a["id"] and m["new"] and m["unlocked"] and m["reason"] == "you asked for one"
    r = c.post("/api/capture", json={"who": who, "indicator": "mood", "value": 2}).json()
    assert any(x["id"] == b["id"] and x["reason"] == "a hard day" for x in r["home_messages"])
    again = c.post(f"/api/messages/{who}/comfort").json()                     # nothing locked: replay one
    assert again["new"] is False and again["unlocked"]


def test_messages_validation_privacy_delete_and_earth(tmp_path):
    who = "C"
    assert _msg(who, "", "first").status_code == 400
    assert _msg(who, "Mum", "never").status_code == 400
    assert _msg(who, "Mum", "first", b"x", "text/plain").status_code == 400
    assert c.post("/api/messages/Z/demo").status_code == 404
    demo = c.post(f"/api/messages/{who}/demo").json()
    assert demo["demo"] and demo["kind"] == "demo"
    m = _msg(who, "Kai", "any").json()
    files = list((store.DB.parent / "companion").glob(f"{who}_{m['id']}"))
    assert files
    assert c.delete(f"/api/messages/{who}/{m['id']}").json()["ok"] and not files[0].exists()
    assert c.delete(f"/api/messages/{who}/{m['id']}").status_code == 404
    # family on Earth: arrives after the delay, then plays without any streak
    c.post("/api/mission", json={"location": "moon"})
    e = c.post("/api/ground/home-message", data={"to": who, "sender": "Grandma", "relation": "grandmother"},
               files={"file": ("v.mp4", b"fake-video", "video/mp4")}).json()
    assert e["from_earth"] and e["arrives_in"] > 0
    lst = c.get(f"/api/messages/{who}").json()
    assert any(x["sender"] == "Grandma" for x in lst["on_the_way"])
    c.post("/api/mission", json={"link_cut": True})
    assert c.post("/api/ground/home-message", data={"to": who, "sender": "X"}, files={"file": ("v.mp4", b"v", "video/mp4")}).status_code == 409
    c.post("/api/mission", json={"link_cut": False, "location": "mars"})
    # never in reports to Earth
    c.post("/api/reports/send", json={})
    assert "Grandma" not in str(c.get("/api/reports").json()) and "Kai" not in str(c.get("/api/reports").json())


# ---------------------------------------------------------------- first-run setup
def test_setup_wizard_saves_everything():
    s = c.get("/api/setup/B").json()
    assert s["done"] is False and s["morning"] in s["slots"] and set(s["locations"]) == {"iss", "moon", "rover", "mars"}
    r = c.post("/api/setup/B", json={"name": "  Ana  ", "morning": "06:30", "location": "rover", "in_days": 21}).json()
    assert r["name"] == "Ana" and r["morning"] == "06:30" and r["location"] == "rover" and r["days_to_landing"] == 21
    assert c.get("/api/state").json()["env"]["id"] == "rover"
    assert c.get("/api/homecoming/B").json()["days_to_landing"] == 21
    assert c.post("/api/setup/B", json={"morning": "03:00"}).status_code == 400
    assert c.post("/api/setup/B", json={"location": "venus"}).status_code == 400
    assert c.post("/api/setup/B", json={"in_days": 999}).status_code == 400
    assert c.post("/api/setup/B", json={"done": True}).json()["done"] is True
    assert c.get("/api/setup/B").json()["name"] == "Ana"                     # kept across calls
    assert c.get("/api/setup/Z").status_code == 404
    c.post("/api/mission", json={"location": "mars"})
