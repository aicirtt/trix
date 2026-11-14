"""TRIX onboard server: the web app talks to the agents, the record and the camera checks through this API.

Run:  python app.py   (then open http://localhost:8000)
Everything runs on the onboard computer. Only the optional live feeds (NASA DONKI, Meteomatics) use the network,
and they fall back to the last cached reply when there is none.
"""
import json
import math
import os
import shutil
import tempfile
import time
import uuid
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import detect, escalation, feeds, game, insights, kb, llm, office, orchestrator, protocols, rag, safety, store, teams, vision, voice

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
app = FastAPI(title="TRIX onboard API", version="1.0")

LOCATIONS = {
    "iss": {"label": "ISS", "one_way_s": 0.5, "delay": "< 1 s", "round": "< 2 s", "live": True},
    "moon": {"label": "Moon", "one_way_s": 1.3, "delay": "1.3 s", "round": "2.6 s", "live": True},
    "mars": {"label": "Mars", "one_way_s": 1188, "delay": "19m 48s", "round": "~40 min", "live": False},
}


def _clean(o):
    """JSON-safe copy (numpy numbers, NaN)."""
    if isinstance(o, dict):
        return {str(k): _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, set)):
        return [_clean(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        f = float(o)
        return None if math.isnan(f) or math.isinf(f) else f
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def location() -> str:
    return store.get("location", "mars")


def run(event: dict, save: bool = True) -> dict:
    """Run the agents. save=False for read-only views (no case, no Earth report)."""
    ev = {"location": location()} | event
    out = orchestrator.run(ev)
    if save:
        store.save_case(out)
    return _clean(store._slim(out) | {"team": out.get("team")})


# ------------------------------------------------------------------ mission
@app.get("/api/state")
def state():
    loc = location()
    sw = feeds.space_weather()
    return _clean({"location": loc, "link": LOCATIONS[loc], "locations": LOCATIONS, "day": store.today(),
                   "crew": game.CREW, "space_weather": {k: sw[k] for k in ("status", "message", "source")},
                   "ai": system_status()})


@app.post("/api/mission")
def set_mission(body: dict = Body(...)):
    if "location" in body:
        if body["location"] not in LOCATIONS:
            raise HTTPException(400, "location must be iss, moon or mars")
        store.put("location", body["location"])
    if "day" in body:
        store.put("mission_day", int(body["day"]))
    return state()


def system_status() -> dict:
    m = llm.get_llm()
    try:
        import faster_whisper  # noqa: F401
        whisper = True
    except ImportError:
        whisper = False
    from .addons import echonet, medsiglip
    return {"llm": m.name, "llm_offline": True, "skin_ai": "MedSigLIP" if medsiglip.available()[0] else "redness check (MedSigLIP add-on not installed)",
            "ultrasound_ai": "EchoNet-Dynamic" if echonet.available()[0] else "view quality (EchoNet add-on not installed)", "speech": "faster-whisper (offline)" if whisper else "tablet speech recognition",
            "face": "MediaPipe Face Mesh (on tablet)", "pose": "MediaPipe Pose (on tablet)",
            "vision": "OpenCV checks (onboard)", "reminders": "Thompson-sampling bandit (learning)"}


@app.get("/api/system")
def system():
    return system_status()


# ------------------------------------------------------------------ knowledge
@app.get("/api/indicators")
def indicators():
    return {"indicators": list(kb.indicators().values()), "sources": kb.sources()}


@app.post("/api/ask")
def ask(body: dict = Body(...)):
    question = (body.get("question") or "").strip()
    if not question:
        raise HTTPException(400, "question is empty")
    hits = teams.retriever().search(question, k=3)
    answer = llm.get_llm().answer(question, hits)
    cited = [int(c) for c in __import__("re").findall(r"\[(\d)\]", answer)]
    check = safety.check_text(answer, None, bool(cited) or answer.startswith(llm.NO_MATCH))
    if not check.allowed:
        answer = "I can't give that advice safely. Please ask the crew medical officer."
    used = sorted(set(cited))
    return _clean({"answer": answer, "sources": [{"n": i + 1, "title": h["title"], "url": h["url"], "doc_id": h["doc_id"],
                                                  "cited": (i + 1) in used} for i, h in enumerate(hits)],
                   "safety": {"allowed": check.allowed, "reasons": check.reasons}})


# ------------------------------------------------------------------ check-ins and events
def _numeric(readings: dict) -> dict:
    out = {}
    for k, v in (readings or {}).items():
        if v in (None, ""):
            continue
        if isinstance(v, str):
            try:
                v = float(v)
            except ValueError:
                pass
        out[k] = v
    return out


@app.post("/api/checkin")
def checkin(body: dict = Body(...)):
    who = body.get("who")
    if who not in game.CREW:
        raise HTTPException(400, "who must be A, B or C")
    readings = _numeric(body.get("readings"))
    store.add_readings(who, readings, body.get("source", "manual"))
    ev = {"event": body.get("event", "checkin"), "who": who, "readings": readings | {"day": store.today()}}
    if body.get("symptoms"):
        ev["symptoms"] = body["symptoms"]
    out = run(ev)
    # the Reminder agent learns: today's reminder slot got a response
    slot = body.get("reminder_slot") or teams._BANDIT.best(who)["slot"]
    teams._BANDIT.update(who, slot, True)
    return out


@app.post("/api/event")
def event(body: dict = Body(...)):
    """reading (device push), symptom, alert, pharmacy, devices, privacy, report."""
    ev = dict(body)
    if ev.get("event") == "reading" and ev.get("who") in game.CREW:
        store.add_readings(ev["who"], _numeric(ev.get("readings")), ev.get("source", "device"))
        ev["readings"] = _numeric(ev.get("readings")) | {"day": store.today()}
    return run(ev)


@app.get("/api/today/{who}")
def today(who: str):
    if who not in game.CREW:
        raise HTTPException(404, "unknown astronaut")
    res = _merged_view(who)
    latest = store.latest(who)
    reminder = teams._BANDIT.best(who)
    tasks = _tasks(who, res, reminder)
    alerts = [_clean({"case_id": c["case_id"], "who": c["who"], "summary": c["summary"], "urgency": c["urgency"], "ts": c["ts"]})
              for c in store.cases(30) if c["urgency"] == "emergency" and time.time() - c["ts"] < 6 * 3600]
    return _clean({"who": who, "crew": game.CREW[who], "day": store.today(), "body_map": res.get("body_map", {}),
                   "assessments": res.get("assessments", []), "coach": res.get("coach", {}), "latest": latest,
                   "reminder": reminder, "tasks": tasks, "streak": game.streak(who), "alerts": alerts,
                   "buddy": game.buddy_pairs()[who], "checked_in_today": store.today() in store.checkin_days(who)})


_BASE_CACHE: dict = {}


def _merged_view(who: str) -> dict:
    """Start from the last full check-in (or the simulated history), then lay later readings on top,
    so a single device reading or solar alert updates its own body part without hiding the rest."""
    rows = store.q("select case_id, event from cases where who=? and event in ('checkin','reading') order by ts", (who,))
    base = None
    for r in rows:
        if r["event"] == "checkin":
            base = r["case_id"]
    view = dict(store.case(base)["result"]) if base else dict(_baseline_view(who))
    view = {"body_map": dict(view.get("body_map", {})), "assessments": list(view.get("assessments", [])),
            "coach": view.get("coach", {})}
    later = [r["case_id"] for r in rows[[x["case_id"] for x in rows].index(base) + 1:]] if base else [r["case_id"] for r in rows]
    for cid in later:
        res = store.case(cid)["result"]
        view["body_map"].update(res.get("body_map", {}))
        new = {a["indicator"]: a for a in res.get("assessments", [])}
        view["assessments"] = [a for a in view["assessments"] if a["indicator"] not in new] + list(new.values())
        if res.get("coach", {}).get("messages") and any(a["status"] != "green" for a in new.values()):
            view["coach"] = res["coach"]
    return view


def _baseline_view(who: str) -> dict:
    """Body map from the last simulated day, before anyone has logged anything in the app."""
    if who in _BASE_CACHE:
        return _BASE_CACHE[who]
    h = store.history_csv()
    last = h[h.who == who].sort_values("day").iloc[-1]
    r = {k: float(last[c]) for k, c in (("hr", "hr"), ("hrv", "hrv"), ("spo2", "spo2"), ("temp", "temp"), ("sleep", "sleep"),
                                         ("mood", "mood_raw"), ("fatigue", "fatigue"), ("sys", "sys"), ("dia", "dia"),
                                         ("fluid", "fluid"), ("calcium", "calcium"), ("co2", "co2"))
         if c in last and not pd.isna(last[c])}
    assessed = []
    for ind in ("hr", "hrv", "spo2", "temp", "sleep", "mood", "fatigue", "fluid", "calcium", "co2"):
        if ind in r:
            assessed.append(escalation.assess(ind, r[ind], location=location()))
    if "sys" in r:
        assessed.append(escalation.assess("bp", {"sys": r["sys"], "dia": r.get("dia")}, location=location()))
    res = {"body_map": escalation.combine(assessed), "assessments": [
        {"indicator": a.indicator, "status": a.status, "level": a.level, "reasons": a.reasons} for a in assessed],
        "coach": {"messages": ["Morning check-in is due. Start it when you're ready."], "learn": []}}
    _BASE_CACHE[who] = _clean(res)
    return _BASE_CACHE[who]


def _tasks(who, res, reminder):
    done_today = {r["indicator"] for r in store.live_readings(who, since_day=store.today())}
    t = [{"time": reminder["slot"], "title": "Morning check-in", "kind": "checkin", "done": bool(done_today & {"hr", "spo2", "sys", "temp"}),
          "why": f"Best time learned for you ({int((reminder['p_respond'] or 0) * 100)}% response)"}]
    for a in res.get("assessments", []):
        if a["status"] != "green":
            ind = kb.indicators()[a["indicator"]]
            t.append({"time": "Today", "title": ind["actions"][0], "kind": a["indicator"], "done": False,
                      "why": f"{ind['name']}: {(a.get('reasons') or [''])[0]}"})
    t.append({"time": "12:30", "title": "Log lunch and water", "kind": "food", "done": "food" in done_today, "why": "Fluid and calcium targets"})
    if store.today() % 7 == 0 or "vision" not in done_today:
        t.append({"time": "13:00", "title": "Weekly vision grid check", "kind": "vision", "done": "vision" in done_today, "why": "Eye changes (SANS) start slowly"})
    t.append({"time": "Any time", "title": f"Check on your buddy, Astronaut {game.buddy_pairs()[who]}", "kind": "buddy",
              "done": bool(store.q("select 1 from buddy where who=? and day=?", (who, store.today()))), "why": "Daily buddy check"})
    return t


@app.post("/api/reminder/respond")
def reminder_respond(body: dict = Body(...)):
    teams._BANDIT.update(body["who"], body["slot"], bool(body.get("responded", True)))
    return teams._BANDIT.best(body["who"])


# ------------------------------------------------------------------ trends
@app.get("/api/trend/{who}/{indicator}")
def trend(who: str, indicator: str, days: int = 90):
    col = {"mood": "mood_raw", "bp": "sys"}.get(indicator, indicator)
    pts = store.series(who, col)
    if indicator in ("fluid", "calcium"):
        pts = [p for p in pts if p["source"] == "history"] + food_series(who, indicator)
    if indicator == "bp":
        dia = {p["day"]: p["value"] for p in store.series(who, "dia")}
        for p in pts:
            p["dia"] = dia.get(p["day"])
    if not pts:
        return {"points": [], "indicator": indicator}
    s = pd.Series({p["day"]: p["value"] for p in pts}).sort_index()
    end = int(s.index.max())
    lo = end - days
    band = []
    for d in s.index[s.index >= lo]:
        hist = s.loc[max(0, d - 30):d - 1].dropna()
        if len(hist) < 5:  # weekly measures (bone): use the last 6 readings instead
            hist = s.loc[:d - 1].dropna().tail(6)
        if len(hist) >= 5:
            med = float(hist.median())
            mad = float((hist - med).abs().median()) * 1.4826 or 1e-6
            band.append({"day": int(d), "median": med, "lo": med - 3 * mad, "hi": med + 3 * mad})
    ind = kb.indicators().get(indicator, {})
    out = {"indicator": indicator, "name": ind.get("name", indicator), "unit": ind.get("unit", ""),
           "points": [p for p in pts if p["day"] >= lo], "band": band, "limits": ind.get("absolute", {})}
    if indicator == "bone":
        lvl = ind["absolute"]["forecast_watch_level"]
        cross = detect.forecast_cross(s, end, lvl)
        b, a = np.polyfit(s.loc[end - 42:end].index, s.loc[end - 42:end].values, 1)
        out["forecast"] = [{"day": d, "value": float(a + b * d)} for d in range(end, end + 61, 5)]
        out["forecast_cross_day"] = cross
    return _clean(out)


@app.get("/api/insights/co2-headache")
def co2_headache(who: str | None = None):
    return _clean(insights.co2_headache(who))


# ------------------------------------------------------------------ procedures
SESSIONS: dict = {}


@app.get("/api/protocols")
def list_protocols():
    return {"protocols": [{"id": p["id"], "title": p["title"], "specialist": p["specialist"], "steps": len(p["steps"]),
                           "equipment": p.get("equipment", []), "use_when": p.get("use_when", []), "note": p.get("note")}
                          for p in protocols.library().values()]}


@app.post("/api/procedure/start")
def proc_start(body: dict = Body(...)):
    pid = body.get("protocol_id")
    if pid not in protocols.library():
        raise HTTPException(404, "unknown protocol")
    s = protocols.Session(pid, body.get("helper_skill", "crew"), bool(body.get("practice")))
    sid = uuid.uuid4().hex[:8]
    SESSIONS[sid] = {"s": s, "who": body.get("who"), "patient": body.get("patient"), "case_id": body.get("case_id")}
    return _proc_view(sid)


def _proc_view(sid):
    if sid not in SESSIONS:
        raise HTTPException(404, "no such procedure session")
    s = SESSIONS[sid]["s"]
    p = s.protocol
    return _clean({"sid": sid, "protocol": {"id": p["id"], "title": p["title"], "equipment": p.get("equipment", []),
                                            "note": p.get("note"), "steps": [{"id": x["id"], "say": x["say"], "check": x["check"]} for x in p["steps"]]},
                   "current": s.current(), "done": s.done, "practice": s.practice, "log": s.log,
                   "score": s.score() if s.done or s.practice else None})


@app.get("/api/procedure/{sid}")
def proc_get(sid: str):
    return _proc_view(sid)


@app.post("/api/procedure/{sid}/submit")
def proc_submit(sid: str, body: dict = Body(...)):
    if sid not in SESSIONS:
        raise HTTPException(404, "no such procedure session")
    s = SESSIONS[sid]["s"]
    if s.done:
        return _proc_view(sid)
    fb = s.submit(bool(body.get("passed")), body.get("detail", ""))
    v = _proc_view(sid)
    v["feedback"] = fb["feedback"]
    if s.done and s.practice and SESSIONS[sid].get("who"):
        sc = s.score()
        store.x("insert into practice(ts, who, protocol, score, retries, seconds) values(?,?,?,?,?,?)",
                (time.time(), SESSIONS[sid]["who"], s.protocol_id, sc["score"], sc["retries"], sc["seconds"]))
    return v


# ------------------------------------------------------------------ camera checks
@app.post("/api/vision/ecg")
def vision_ecg(body: dict = Body(...)):
    img = vision.decode_image(body["image"]) if body.get("image") else None
    return _clean(vision.ecg_check(img, body.get("landmarks") or {}, body.get("target", "E1"), body.get("placed")))


@app.post("/api/vision/fatigue")
def vision_fatigue(body: dict = Body(...)):
    r = vision.fatigue(body.get("frames") or [])
    if r.get("ok") and body.get("who") in game.CREW and body.get("save", True):
        store.add_readings(body["who"], r["reading"], "tablet camera")
    return _clean(r)


@app.post("/api/vision/skin")
def vision_skin(body: dict = Body(...)):
    who = body.get("who")
    prev = store.q("select result from photos where who=? and kind='skin' order by ts desc limit 1", (who,))
    img = vision.decode_image(body["image"])
    r = vision.skin(img, json.loads(prev[0]["result"]) if prev else None)
    from .addons import medsiglip
    if r.get("ok"):
        r["ai"] = medsiglip.screen(img)          # optional add-on; says how to install it when missing
    if r.get("ok") and who in game.CREW:
        store.x("insert into photos(ts, who, kind, result) values(?,?,?,?)", (time.time(), who, "skin", json.dumps(_clean(r))))
        store.add_readings(who, r["reading"], "tablet camera")
    return _clean(r)


@app.post("/api/vision/ultrasound")
def vision_ultrasound(body: dict = Body(...)):
    return _clean(vision.ultrasound(vision.decode_image(body["image"])))


@app.post("/api/vision/ultrasound-clip")
async def ultrasound_clip(clip: UploadFile = File(...)):
    """Pumping strength from a short 4-chamber video (EchoNet-Dynamic add-on)."""
    from .addons import echonet
    with tempfile.NamedTemporaryFile(suffix=Path(clip.filename or "c.mp4").suffix, delete=False) as f:
        shutil.copyfileobj(clip.file, f)
        path = f.name
    try:
        ok, why = echonet.available()
        if not ok:
            return {"ok": False, "message": why}
        return _clean(echonet.ejection_fraction(path))
    except ValueError as e:
        return {"ok": False, "message": str(e)}
    finally:
        os.unlink(path)


@app.post("/api/vision/food")
def vision_food(body: dict = Body(...)):
    r = vision.food(vision.decode_image(body["image"]))
    if r.get("ok") and body.get("who") in game.CREW and body.get("log", True):
        food_log({"who": body["who"], "ids": [i["id"] for i in r["items"]]})
    return _clean(r)


@app.get("/api/menu")
def menu():
    return {"items": list(vision.menu().values())}


@app.post("/api/food/log")
def food_log(body: dict = Body(...)):
    who, ids = body.get("who"), body.get("ids") or []
    items = vision.menu()
    bad = [i for i in ids if i not in items]
    if bad:
        raise HTTPException(400, f"unknown menu items {bad}")
    for i in ids:
        store.add_readings(who, {"food": i}, "food log")
    return food_today(who)


@app.get("/api/food/today/{who}")
def food_today(who: str):
    items = vision.menu()
    eaten = [items[r["value"]] for r in store.live_readings(who, since_day=store.today())
             if r["indicator"] == "food" and r["value"] in items]
    t = vision.totals(eaten)
    return {"items": eaten, "totals": t, "targets": {"fluid_ml": 2500 if who == "A" else 2100, "calcium_mg": 1000,
                                                     "vitamin_d_iu": 1000}}


def food_series(who, indicator):
    key = {"fluid": "fluid_ml", "calcium": "calcium_mg"}[indicator]
    items = vision.menu()
    by_day: dict = {}
    for r in store.live_readings(who):
        if r["indicator"] == "food" and r["value"] in items:
            by_day[r["day"]] = by_day.get(r["day"], 0) + items[r["value"]][key]
        elif r["indicator"] == indicator and isinstance(r["value"], (int, float)):
            by_day[r["day"]] = max(by_day.get(r["day"], 0), r["value"])
    return [{"day": d, "value": v, "source": "logged"} for d, v in sorted(by_day.items())]


@app.get("/api/food/qr/{item_id}")
def food_qr(item_id: str):
    if item_id not in vision.menu():
        raise HTTPException(404)
    return Response(vision.qr_png(item_id), media_type="image/png")


@app.get("/api/food/labels", response_class=HTMLResponse)
def food_labels():
    cards = "".join(f'<div class="c"><img src="/api/food/qr/{m["id"]}" alt="QR code for {m["name"]}"><b>{m["name"]}</b>'
                    f'<span>{m["id"]} · {m["kcal"]} kcal</span></div>' for m in vision.menu().values())
    return ("<!doctype html><title>TRIX pouch labels</title><style>body{font-family:Inter,system-ui,sans-serif;margin:24px}"
            ".g{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.c{border:1px dashed #999;padding:10px;display:flex;"
            "flex-direction:column;align-items:center;gap:4px}.c img{width:150px}span{font-size:12px;color:#555}</style>"
            "<h1>Print and stick on food pouches</h1><p>The Food check-in reads these with the tablet camera.</p>"
            f"<div class='g'>{cards}</div>")


# ------------------------------------------------------------------ voice
@app.post("/api/voice/parse")
def voice_parse(body: dict = Body(...)):
    return voice.parse(body.get("text", ""))


@app.post("/api/voice/transcribe")
async def voice_transcribe(audio: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(suffix=Path(audio.filename or "a.webm").suffix, delete=False) as f:
        shutil.copyfileobj(audio.file, f)
        path = f.name
    try:
        r = voice.transcribe(path)
    finally:
        os.unlink(path)
    if r.get("ok"):
        r |= voice.parse(r["text"])
    return r


# ------------------------------------------------------------------ devices and import
@app.post("/api/devices/pair")
def pair(body: dict = Body(...)):
    live = [d for d in store.get("devices:live", []) if d["id"] != body["id"]]
    live.append({"id": body["id"], "name": body.get("name", body["id"]), "status": body.get("status", "connected"),
                 "feeds": body.get("feeds", [])})
    store.put("devices:live", live)
    return {"devices": live}


@app.post("/api/import")
async def import_csv(who: str = Form(...), file: UploadFile = File(...)):
    """Device export as CSV: either columns indicator,value or one column per indicator (hr, spo2, sys, ...)."""
    import io
    df = pd.read_csv(io.BytesIO(await file.read()))
    known = set(kb.indicators()) | {"sys", "dia", "irregular_rhythm"}
    n = 0
    if {"indicator", "value"} <= set(df.columns):
        for _, r in df.iterrows():
            if r["indicator"] in known:
                n += store.add_readings(r.get("who", who) if "who" in df else who, {r["indicator"]: _numeric({"v": r["value"]})["v"]}, "file import")
    else:
        for _, r in df.iterrows():
            vals = {c: float(r[c]) for c in df.columns if c in known and not pd.isna(r[c])}
            n += store.add_readings(r["who"] if "who" in df else who, vals, "file import")
    return {"imported": n}


# ------------------------------------------------------------------ operations
@app.get("/api/ops/{kind}")
def ops(kind: str, who: str | None = None):
    if kind not in ("pharmacy", "devices"):
        raise HTTPException(404)
    ev = {"event": kind, "who": who or "B"}
    if kind == "pharmacy":
        ev["request"] = {"day": store.today()}
    return run(ev, save=False)


@app.get("/api/privacy/{who}")
def privacy_get(who: str):
    from .shared import settings_for
    return {"who": who, "settings": settings_for(who), "rules": json.loads((kb.KB_DIR / "privacy.json").read_text())["rules"]}


@app.post("/api/privacy/{who}")
def privacy_set(who: str, body: dict = Body(...)):
    return run({"event": "privacy", "who": who, "request": {"set": body}})


@app.get("/api/reports")
def reports():
    loc = location()
    rows = store.reports()
    window = LOCATIONS[loc]["live"] or (time.gmtime().tm_min % 30 < 10)
    return _clean({"reports": rows, "link": LOCATIONS[loc], "window_open": window,
                   "next_window": "now" if window else f"in {30 - time.gmtime().tm_min % 30 - 0} min"})


@app.get("/api/reports/{rid}")
def report(rid: int):
    r = store.report_body(rid)
    if r is None:
        raise HTTPException(404)
    return r


@app.post("/api/reports/send")
def send_reports():
    rows = [r for r in store.reports() if r["status"] == "queued"]
    store.mark_sent([r["id"] for r in rows])
    return {"sent": len(rows), "link": LOCATIONS[location()]}


# ------------------------------------------------------------------ crew
@app.get("/api/crew")
def crew():
    return _clean({"board": game.board(), "team_goal": game.team_goal(), "buddy": game.buddy_today(),
                   "cohesion": game.cohesion()})


@app.post("/api/buddy")
def buddy(body: dict = Body(...)):
    game.buddy_log(body["who"], body["buddy"], body.get("status", "ok"), body.get("note", ""))
    if body.get("status") == "concern":
        run({"event": "symptom", "who": body["buddy"], "symptoms": f"Buddy check by {body['who']}: {body.get('note') or 'concern'}"})
    return crew()


# ------------------------------------------------------------------ live feeds
@app.get("/api/feeds/space-weather")
def space_weather():
    return _clean(feeds.space_weather())


@app.post("/api/feeds/space-weather/apply")
def space_weather_apply():
    """Send the DONKI result to the crew: a solar storm triggers the Emergency team for everyone."""
    sw = feeds.space_weather()
    if not sw["reading"]:
        return {"applied": False, "message": sw["message"]}
    outs = [run({"event": "reading", "who": w, "readings": sw["reading"] | {"day": store.today()}}) for w in game.CREW]
    return _clean({"applied": True, "message": sw["message"], "cases": [o["case_id"] for o in outs]})


@app.get("/api/feeds/landing")
def landing(site: str = "pacific"):
    return _clean(feeds.landing_weather(site))


# ------------------------------------------------------------------ agent office
@app.get("/api/office")
def office_cases():
    return _clean({"cases": store.cases(60)})


def _spans_for(case_id):
    sp = office.spans(case_id)
    if sp:
        return sp
    if office.LOG_FILE.exists():  # after a restart, read the log file
        out = []
        with office.LOG_FILE.open() as f:
            for line in f:
                if f'"{case_id}"' in line:
                    out.append(json.loads(line))
        return out
    return []


@app.get("/api/office/{case_id}")
def office_case(case_id: str):
    sp = _spans_for(case_id)
    kids: dict = {}
    for s in sp:
        kids.setdefault(s["parent_id"], []).append(s)
    ordered, depth = [], {}

    def walk(pid, d):
        for s in sorted(kids.get(pid, []), key=lambda s: s["started"]):
            depth[s["span_id"]] = d
            ordered.append(s | {"depth": d})
            walk(s["span_id"], d + 1)
    walk(None, 0)
    c = store.case(case_id)
    return _clean({"case_id": case_id, "spans": ordered, "case": c})


# ------------------------------------------------------------------ web app
@app.get("/", include_in_schema=False)
def index():
    return FileResponse(WEB / "index.html")


if WEB.exists():
    app.mount("/", StaticFiles(directory=WEB), name="web")


@app.exception_handler(ValueError)
async def bad_value(_, exc: ValueError):
    return JSONResponse({"detail": str(exc)}, status_code=400)
