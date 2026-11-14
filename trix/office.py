"""Agent office: structured log of what every agent did, why it was triggered, and what it returned.

Each agent step is a *span*: {case_id, span_id, parent_id, agent, team, trigger, inputs, tools, result, status,
started, ms}. Spans nest (orchestrator -> team -> agent -> tool calls), so the log can be shown as a live timeline
or as a call tree. Spans are appended to logs/agent_office.jsonl and kept in memory for the current process.
Thread-safe; parallel cases get separate case_ids.
"""
import contextvars
import json
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parents[1] / "logs"
LOG_FILE = LOG_DIR / "agent_office.jsonl"
_lock = threading.Lock()
_spans: list[dict] = []
_stack: contextvars.ContextVar[tuple] = contextvars.ContextVar("trix_span_stack", default=())
_case: contextvars.ContextVar[str | None] = contextvars.ContextVar("trix_case", default=None)
_current: contextvars.ContextVar = contextvars.ContextVar("trix_current_span", default=None)


def _short(x, n: int = 300):
    try:
        s = json.dumps(x, default=str)
    except Exception:
        s = str(x)
    return json.loads(s) if len(s) <= n else s[:n] + "…"


def new_case(event: dict) -> str:
    cid = "C-" + uuid.uuid4().hex[:6].upper()
    _case.set(cid)
    _stack.set(())
    return cid


def set_case(cid: str):
    _case.set(cid)


class Span:
    def __init__(self, rec: dict):
        self.rec = rec

    def tool(self, name: str, args=None, result=None):
        self.rec["tools"].append({"tool": name, "args": _short(args, 160), "result": _short(result, 200)})

    def result(self, value, status: str = "ok"):
        self.rec["result"] = _short(value)
        self.rec["status"] = status


@contextmanager
def span(agent: str, team: str, trigger: str, inputs=None, case_id: str | None = None, parent_id: str | None = None):
    """parent_id: pass explicitly when crossing threads (LangGraph may run nodes in worker threads)."""
    cid = case_id or _case.get() or "C-NONE"
    parent = parent_id if parent_id is not None else (_stack.get()[-1] if _stack.get() else None)
    rec = {"case_id": cid, "span_id": uuid.uuid4().hex[:8], "parent_id": parent, "agent": agent, "team": team,
           "trigger": trigger, "inputs": _short(inputs), "tools": [], "result": None, "status": "running",
           "started": time.strftime("%H:%M:%S"), "t0": time.perf_counter()}
    token = _stack.set(_stack.get() + (rec["span_id"],))
    sp = Span(rec)
    ctok = _current.set(sp)
    try:
        yield sp
        if rec["status"] == "running":
            rec["status"] = "ok"
    except Exception as e:
        rec["status"], rec["result"] = "error", repr(e)
        raise
    finally:
        rec["ms"] = round((time.perf_counter() - rec.pop("t0")) * 1000, 1)
        _stack.reset(token)
        _current.reset(ctok)
        with _lock:
            _spans.append(rec)
            LOG_DIR.mkdir(exist_ok=True)
            with LOG_FILE.open("a") as f:
                f.write(json.dumps(rec, default=str) + "\n")


def current() -> "Span | None":
    return _current.get()


def tool(name: str, args=None, result=None):
    """Record a tool call on the current span (no-op outside a span)."""
    sp = _current.get()
    if sp is not None:
        sp.tool(name, args, result)


def spans(case_id: str | None = None) -> list[dict]:
    with _lock:
        out = [s for s in _spans if case_id is None or s["case_id"] == case_id]
    return sorted(out, key=lambda s: (s["case_id"], s["started"]))


def clear():
    with _lock:
        _spans.clear()


def timeline(case_id: str) -> str:
    rows = sorted(spans(case_id), key=lambda s: s["started"])
    order = {s["span_id"]: i for i, s in enumerate(_tree_order(case_id))}
    rows = sorted(rows, key=lambda s: order.get(s["span_id"], 0))
    lines = [f"{'time':<9}{'team':<12}{'agent':<26}{'triggered by':<26}{'returned':<62}{'ms':>7}"]
    by_id = {s["span_id"]: s for s in rows}
    for s in rows:
        trig = s["trigger"]
        res = s["result"] if isinstance(s["result"], str) else json.dumps(s["result"], default=str)
        tools = f" [{', '.join(t['tool'] for t in s['tools'])}]" if s["tools"] else ""
        lines.append(f"{s['started']:<9}{s['team']:<12}{s['agent'][:25]:<26}{trig[:25]:<26}{(str(res) + tools)[:61]:<62}{s['ms']:>7}")
    return "\n".join(lines)


def _tree_order(case_id: str) -> list[dict]:
    rows = spans(case_id)
    kids: dict = {}
    for s in rows:
        kids.setdefault(s["parent_id"], []).append(s)
    out = []

    def walk(pid):
        for s in kids.get(pid, []):
            out.append(s)
            walk(s["span_id"])
    walk(None)
    return out


def tree(case_id: str) -> str:
    rows = spans(case_id)
    kids: dict = {}
    for s in rows:
        kids.setdefault(s["parent_id"], []).append(s)
    lines = [case_id]

    def walk(pid, pre):
        items = kids.get(pid, [])
        for i, s in enumerate(items):
            last = i == len(items) - 1
            res = s["result"] if isinstance(s["result"], str) else json.dumps(s["result"], default=str)
            lines.append(f"{pre}{'└─ ' if last else '├─ '}{s['agent']} ({s['team']}) {s['status']} · {s['ms']} ms → {str(res)[:70]}")
            for t in s["tools"]:
                lines.append(f"{pre}{'   ' if last else '│  '}   · tool {t['tool']}: {str(t['result'])[:60]}")
            walk(s["span_id"], pre + ("   " if last else "│  "))
    walk(None, "")
    return "\n".join(lines)


def traced(agent: str, team: str):
    """Decorator for LangGraph nodes. Reads case_id/_parent/_prev from state; records a span; sets _prev."""
    def deco(fn):
        def wrapper(state):
            keep = {k: state.get(k) for k in ("who", "event", "route", "urgency") if state.get(k) is not None}
            with span(agent, team, trigger=state.get("_prev") or "event", inputs=keep,
                      case_id=state.get("case_id"), parent_id=state.get("_parent")) as sp:
                out = fn(state)
                if sp.rec["result"] is None:
                    sp.result("done")
            out["_prev"] = agent
            return out
        wrapper.__name__ = fn.__name__
        return wrapper
    return deco
