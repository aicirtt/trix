"""Onboard record: one SQLite file holds every reading, case, report, procedure run and buddy check.

Simulated history (data/synthetic_daily.csv, mission days 0-239) is the past; anything the crew logs through the
app is stored here and appended after it. Works fully offline.
"""
import json
import sqlite3
import threading
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "trix.db"
CSV = ROOT / "data" / "synthetic_daily.csv"
_lock = threading.Lock()

SCHEMA = """
create table if not exists readings (id integer primary key, ts real, day integer, who text, indicator text,
  value text, source text);
create table if not exists cases (case_id text primary key, ts real, who text, event text, team text, urgency text,
  summary text, result text);
create table if not exists reports (id integer primary key, ts real, case_id text, who text, priority text,
  bytes integer, body text, status text);
create table if not exists practice (id integer primary key, ts real, who text, protocol text, score integer,
  retries integer, seconds real);
create table if not exists buddy (id integer primary key, ts real, day integer, who text, buddy text, status text,
  note text);
create table if not exists settings (key text primary key, value text);
create table if not exists photos (id integer primary key, ts real, who text, kind text, result text);
"""


def _conn():
    DB.parent.mkdir(exist_ok=True)
    c = sqlite3.connect(DB, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


_C = None


def conn():
    global _C
    if _C is None:
        _C = _conn()
        _C.executescript(SCHEMA)
    return _C


def reset(path: Path | None = None):
    """Start an empty record (tests use a temporary file)."""
    global _C, DB
    if path is not None:
        DB = path
    if _C is not None:
        _C.close()
    _C = None
    if DB.exists():
        DB.unlink()
    conn()


def q(sql: str, args=()) -> list[dict]:
    with _lock:
        return [dict(r) for r in conn().execute(sql, args).fetchall()]


def x(sql: str, args=()) -> int:
    with _lock:
        cur = conn().execute(sql, args)
        conn().commit()
        return cur.lastrowid


# ---------- mission settings ----------
def get(key: str, default=None):
    r = q("select value from settings where key=?", (key,))
    return json.loads(r[0]["value"]) if r else default


def put(key: str, value):
    x("insert into settings(key, value) values(?, ?) on conflict(key) do update set value=excluded.value",
      (key, json.dumps(value)))


# ---------- history ----------
_HIST = None


def history_csv() -> pd.DataFrame:
    global _HIST
    if _HIST is None:
        _HIST = pd.read_csv(CSV) if CSV.exists() else pd.DataFrame(columns=["day", "who"])
    return _HIST


def first_live_day() -> int:
    h = history_csv()
    return int(h["day"].max()) + 1 if len(h) else 0


def today() -> int:
    """Mission day for new logs: the day after the simulated history, moved on by the demo clock if set."""
    return int(get("mission_day", first_live_day()))


def add_readings(who: str, readings: dict, source: str = "manual", day: int | None = None) -> int:
    d = today() if day is None else day
    ts = time.time()
    n = 0
    for k, v in readings.items():
        if v is None or v == "":
            continue
        x("insert into readings(ts, day, who, indicator, value, source) values(?,?,?,?,?,?)",
          (ts, d, who, k, json.dumps(v), source))
        n += 1
    return n


def live_readings(who: str | None = None, since_day: int | None = None) -> list[dict]:
    sql, args = "select * from readings where 1=1", []
    if who:
        sql += " and who=?"
        args.append(who)
    if since_day is not None:
        sql += " and day>=?"
        args.append(since_day)
    rows = q(sql + " order by ts", args)
    for r in rows:
        r["value"] = json.loads(r["value"])
    return rows


def latest(who: str) -> dict:
    """Most recent value of every indicator: logged ones first, else the last simulated day."""
    out = {}
    h = history_csv()
    if len(h):
        hw = h[h.who == who].sort_values("day")
        for col in hw.columns:
            if col in ("day", "who"):
                continue
            s = hw[col].dropna()
            if len(s):
                out[col] = {"value": float(s.iloc[-1]), "day": int(hw.loc[s.index[-1], "day"]), "source": "history"}
    for r in live_readings(who):
        out[r["indicator"]] = {"value": r["value"], "day": r["day"], "source": r["source"]}
    return out


def series(who: str, column: str) -> list[dict]:
    """Daily values for one column: simulated history plus the daily mean of logged values."""
    pts = []
    h = history_csv()
    if len(h) and column in h:
        hw = h[h.who == who][["day", column]].dropna()
        pts = [{"day": int(d), "value": float(v), "source": "history"} for d, v in zip(hw["day"], hw[column])]
    by_day: dict[int, list] = {}
    for r in live_readings(who):
        if r["indicator"] == column and isinstance(r["value"], (int, float)):
            by_day.setdefault(r["day"], []).append(float(r["value"]))
    for d, vals in sorted(by_day.items()):
        pts.append({"day": d, "value": sum(vals) / len(vals), "source": "logged"})
    return pts


def checkin_days(who: str) -> set[int]:
    days = {r["day"] for r in q("select distinct day from readings where who=? and source != 'history'", (who,))}
    h = history_csv()
    if len(h):
        days |= set(int(d) for d in h[h.who == who]["day"])
    return days


# ---------- cases and reports ----------
def save_case(out: dict):
    rep = out.get("report") or {}
    summary = _summary(out)
    x("insert or replace into cases(case_id, ts, who, event, team, urgency, summary, result) values(?,?,?,?,?,?,?,?)",
      (out.get("case_id"), time.time(), out.get("who"), out.get("event"), out.get("team"), out.get("urgency"),
       summary, json.dumps(_slim(out), default=str)))
    if rep:
        x("insert into reports(ts, case_id, who, priority, bytes, body, status) values(?,?,?,?,?,?,?)",
          (time.time(), out.get("case_id"), out.get("who"), rep.get("priority", "normal"), rep.get("bytes", 0),
           json.dumps(rep, default=str), "queued"))


def _summary(out: dict) -> str:
    ev = out.get("event")
    if out.get("specialist_plan"):
        p = out["specialist_plan"]
        return f"{(out.get('urgency') or '').replace('_', ' ')} · {p.get('specialist', '')} · {p.get('protocol_id') or 'advice'}"
    if out.get("body_map"):
        flagged = [k for k, v in out["body_map"].items() if v["status"] != "green"]
        return "flagged: " + ", ".join(flagged) if flagged else "all normal"
    if out.get("ops"):
        return f"{ev}: {len(out['ops'].get('messages', []))} messages"
    return ev or ""


def _slim(out: dict) -> dict:
    keep = ("case_id", "event", "who", "location", "team", "handoff", "urgency", "route", "findings", "assessments",
            "body_map", "coach", "reminder", "specialist_plan", "decision", "procedure", "safety", "report", "ops",
            "baseline", "readings", "symptoms")
    return {k: out[k] for k in keep if k in out}


def cases(limit: int = 50) -> list[dict]:
    return q("select case_id, ts, who, event, team, urgency, summary from cases order by ts desc limit ?", (limit,))


def case(case_id: str) -> dict | None:
    r = q("select * from cases where case_id=?", (case_id,))
    if not r:
        return None
    r[0]["result"] = json.loads(r[0]["result"])
    return r[0]


def reports() -> list[dict]:
    rows = q("select id, ts, case_id, who, priority, bytes, status from reports order by "
             "case when priority='urgent' then 0 else 1 end, ts desc limit 40")
    return rows


def report_body(rid: int) -> dict | None:
    r = q("select body from reports where id=?", (rid,))
    return json.loads(r[0]["body"]) if r else None


def mark_sent(ids: list[int]):
    for i in ids:
        x("update reports set status='sent' where id=?", (i,))
