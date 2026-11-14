"""Loads the indicator knowledge base and escalation ladder."""
import json
from functools import lru_cache
from pathlib import Path

KB_DIR = Path(__file__).parent / "kb"


@lru_cache
def indicators() -> dict:
    data = json.loads((KB_DIR / "indicators.json").read_text())
    return {i["id"]: i for i in data["indicators"]}


@lru_cache
def sources() -> dict:
    return json.loads((KB_DIR / "indicators.json").read_text())["sources"]


@lru_cache
def ladder() -> dict:
    return json.loads((KB_DIR / "escalation.json").read_text())


def level(key: str) -> dict:
    for lv in ladder()["levels"]:
        if lv["key"] == key:
            return lv
    raise KeyError(key)


def cite(indicator_id: str) -> list[dict]:
    src = sources()
    return [src[s] | {"id": s} for s in indicators()[indicator_id]["sources"]]
