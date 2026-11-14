"""Protocol-locked procedure engine (also used for Practice mode).

Steps come only from approved YAML protocols. The engine advances only when a step's check passes
(camera / device) or the operator confirms. The LLM may re-word or explain a step but cannot add,
remove or reorder steps.
"""
import time
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml

DIR = Path(__file__).parent / "protocols"


@lru_cache
def library() -> dict:
    return {p["id"]: p for p in (yaml.safe_load(f.read_text()) for f in sorted(DIR.glob("*.yaml")))}


def find(condition: str, specialist: str | None = None) -> list[dict]:
    return [p for p in library().values() if condition in p.get("use_when", []) and (specialist is None or p["specialist"] == specialist)]


@dataclass
class Session:
    protocol_id: str
    helper_skill: str = "crew"          # 'medical_officer' gets short prompts
    practice: bool = False
    i: int = 0
    log: list = field(default_factory=list)
    retries: int = 0
    started: float = field(default_factory=time.time)

    @property
    def protocol(self) -> dict:
        return library()[self.protocol_id]

    @property
    def done(self) -> bool:
        return self.i >= len(self.protocol["steps"])

    def current(self) -> dict | None:
        if self.done:
            return None
        s = self.protocol["steps"][self.i]
        text = s["say"] if self.helper_skill == "medical_officer" else f"{s['say']} {s['why']}"
        return {"step_id": s["id"], "n": self.i + 1, "of": len(self.protocol["steps"]), "say": text, "check": s["check"]}

    def submit(self, passed: bool, detail: str = "") -> dict:
        """Report the result of the current step's check. Only a pass advances."""
        s = self.protocol["steps"][self.i]
        self.log.append({"t": round(time.time() - self.started, 1), "step": s["id"], "passed": passed, "detail": detail})
        if passed:
            self.i += 1
        else:
            self.retries += 1
        return {"advanced": passed, "next": self.current(), "feedback": detail or ("Good." if passed else "Not yet, try again.")}

    def score(self) -> dict:
        """Practice-mode score: completion, retries and time."""
        steps = len(self.protocol["steps"])
        completion = self.i / steps
        penalty = min(0.5, 0.05 * self.retries)
        return {"protocol": self.protocol_id, "completed_steps": self.i, "of": steps, "retries": self.retries,
                "seconds": round(time.time() - self.started, 1), "score": round(100 * max(0.0, completion - penalty))}
