"""Messages from home: real recorded messages from family and friends, unlocked by doing health checks.

Isolation and distance from Earth are two of NASA's five spaceflight hazards. A message from someone you love
is a reward that means something, so TRIX uses it for motivation, with three rules:
- rewards follow effort (check-in days, the weekly routine), never "good" numbers, so nobody hides a bad reading;
- comfort is never locked away: a low mood or "I need a message from home" unlocks one straight away;
- unlocked messages stay unlocked when a streak breaks.
Files stay on the onboard computer and never go into reports to Earth.
"""
from __future__ import annotations

import time
from pathlib import Path

from . import routine, store



def _dir() -> Path:
    return store.DB.parent / "companion"       # next to the onboard record (a temp folder in tests)


MAX_BYTES = 25 * 1024 * 1024
KINDS = {"audio": "audio", "video": "video"}

# rule -> (label, check-in days needed after the message was added; None = special)
RULES = {"first": ("your next check-in", 1), "streak3": ("3 check-in days", 3), "streak7": ("7 check-in days", 7),
         "streak30": ("30 check-in days", 30), "weekly": ("finishing your weekly checks", None), "any": ("any time", 0)}

SCHEMA = """create table if not exists home_msgs (id integer primary key, ts real, who text, sender text, relation text,
  kind text, file text, mime text, text text, rule text, added_day integer, deliver_ts real, unlocked_ts real,
  reason text, played_ts real, from_earth integer default 0, demo integer default 0)"""
_ready = False


def _db():
    global _ready
    if not _ready or not store.q("select name from sqlite_master where name='home_msgs'"):
        store.x(SCHEMA)
        _ready = True


def _live_days(who: str, since_ts: float) -> set[int]:
    """Check-in days with vitals logged after a moment (voice, camera and food logs alone do not count)."""
    side = ("voice check", "tablet camera", "food log", "history", "stand test")
    return {r["day"] for r in store.q(f"select distinct day from readings where who=? and ts>=? and source not in ({','.join('?' * len(side))})",
                                      (who, since_ts, *side))}


def _progress(who: str, m: dict) -> tuple[bool, int, int]:
    """(met, done, needed) for a message's unlock rule."""
    rule = m["rule"]
    if rule == "any":
        return True, 0, 0
    if rule == "weekly":
        week = routine._done_week(who)
        since = {r["indicator"] for r in store.q("select indicator from readings where who=? and ts>=?", (who, m["ts"]))}
        done = sum(i in week and i in since for i in routine.WEEKLY)
        return done == len(routine.WEEKLY), done, len(routine.WEEKLY)
    need = RULES[rule][1]
    done = len(_live_days(who, m["ts"]))
    return done >= need, min(done, need), need


def _public(m: dict, now: float) -> dict:
    out = {k: m[k] for k in ("id", "sender", "relation", "kind", "rule", "reason", "from_earth", "demo")}
    out["rule_label"] = RULES[m["rule"]][0]
    out["arrived"] = (m["deliver_ts"] or 0) <= now
    out["arrives_in"] = max(0, round((m["deliver_ts"] or 0) - now))
    out["unlocked"] = bool(m["unlocked_ts"])
    out["played"] = bool(m["played_ts"])
    if out["unlocked"]:
        out["text"] = m["text"]
        out["mime"] = m["mime"]
    return out


def _rows(who: str) -> list[dict]:
    _db()
    return store.q("select * from home_msgs where who=? order by id", (who,))


def evaluate(who: str) -> list[dict]:
    """Unlock every message whose rule is now met. Returns the newly unlocked ones."""
    now, new = time.time(), []
    for m in _rows(who):
        if m["unlocked_ts"] or (m["deliver_ts"] or 0) > now:
            continue
        met, _, _ = _progress(who, m)
        if met:
            reason = "from Earth" if m["from_earth"] else RULES[m["rule"]][0]
            store.x("update home_msgs set unlocked_ts=?, reason=? where id=?", (now, reason, m["id"]))
            new.append(_public(m | {"unlocked_ts": now, "reason": reason}, now))
    return new


def comfort(who: str, why: str = "you asked for one") -> dict | None:
    """Unlock the next locked message now, no streak needed. Falls back to replaying one already unlocked."""
    now = time.time()
    rows = [m for m in _rows(who) if (m["deliver_ts"] or 0) <= now]
    locked = [m for m in rows if not m["unlocked_ts"]]
    if locked:
        m = locked[0]
        store.x("update home_msgs set unlocked_ts=?, reason=? where id=?", (now, why, m["id"]))
        return _public(m | {"unlocked_ts": now, "reason": why}, now) | {"new": True}
    if rows:
        m = min(rows, key=lambda r: r["played_ts"] or 0)
        return _public(m, now) | {"new": False}
    return None


def listing(who: str) -> dict:
    evaluate(who)
    now = time.time()
    rows = _rows(who)
    msgs = [_public(m, now) for m in rows]
    nxt = None
    for m in rows:
        if not m["unlocked_ts"] and (m["deliver_ts"] or 0) <= now:
            met, done, need = _progress(who, m)
            left = need - done
            if nxt is None or left < nxt["left"]:
                what = "weekly check" if m["rule"] == "weekly" else "check-in day"
                nxt = {"id": m["id"], "sender": m["sender"], "relation": m["relation"], "left": left,
                       "say": f"{left} more {what}{'s' if left != 1 else ''} to unlock a message from {m['sender']}"}
    return {"messages": msgs, "next": nxt, "unlocked": sum(x["unlocked"] for x in msgs), "total": len(msgs),
            "rules": [{"id": k, "label": v[0]} for k, v in RULES.items()],
            "on_the_way": [x for x in msgs if not x["arrived"]]}


def add(who: str, sender: str, relation: str, rule: str, data: bytes | None, mime: str, from_earth: bool = False,
        delay_s: float = 0, text: str | None = None, demo: bool = False) -> dict:
    _db()
    sender = (sender or "").strip()[:40]
    if not sender:
        raise ValueError("enter who the message is from")
    if rule not in RULES:
        raise ValueError("unknown unlock rule")
    kind = "demo" if demo else KINDS.get((mime or "").split("/")[0])
    if not kind:
        raise ValueError("the message must be an audio or video file")
    if data is not None and len(data) > MAX_BYTES:
        raise ValueError("the file is too big (25 MB at most)")
    if not demo and not data:
        raise ValueError("the file is empty")
    now = time.time()
    mid = store.x("insert into home_msgs(ts, who, sender, relation, kind, mime, text, rule, added_day, deliver_ts, from_earth, demo) "
                  "values(?,?,?,?,?,?,?,?,?,?,?,?)",
                  (now, who, sender, (relation or "").strip()[:40], kind, mime if not demo else None, text, rule, store.today(),
                   now + max(0.0, delay_s), int(from_earth), int(demo)))
    if data:
        _dir().mkdir(parents=True, exist_ok=True)
        f = _dir() / f"{who}_{mid}"
        f.write_bytes(data)
        store.x("update home_msgs set file=? where id=?", (f.name, mid))
    evaluate(who)
    return _public(store.q("select * from home_msgs where id=?", (mid,))[0], time.time())


def add_demo(who: str) -> dict:
    return add(who, "Demo message", "sample", "first", None, "", text="This is where a message from home would play. "
               "Before launch, your family records short messages, and TRIX unlocks them as you keep up your health checks.", demo=True)


def media(who: str, mid: int) -> tuple[Path, str] | None:
    r = store.q("select * from home_msgs where id=? and who=?", (mid, who))
    if not r or not r[0]["unlocked_ts"] or not r[0]["file"]:
        return None
    return _dir() / r[0]["file"], r[0]["mime"]


def played(who: str, mid: int) -> bool:
    _db()
    return bool(store.x("update home_msgs set played_ts=? where id=? and who=? and unlocked_ts is not null", (time.time(), mid, who)) is not None)


def delete(who: str, mid: int) -> bool:
    _db()
    r = store.q("select file from home_msgs where id=? and who=?", (mid, who))
    if not r:
        return False
    if r[0]["file"]:
        (_dir() / r[0]["file"]).unlink(missing_ok=True)
    store.x("delete from home_msgs where id=? and who=?", (mid, who))
    return True
