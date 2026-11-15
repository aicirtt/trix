"""Real ISS human research experiments behind each TRIX indicator (NASA Space Station Research Explorer).

Built from NASA's All Experiments Report by scripts/build_iss_experiments.py. Answers the challenge question
"Which measurements can be performed in space?" with the experiments that already measured them on the station."""
import json
from collections import Counter
from pathlib import Path

D = json.loads((Path(__file__).parent / "kb" / "iss_experiments.json").read_text())
SEARCH = D["source"]["explorer"] + "search/#q={}&i=&p=&c="


def _row(r: dict) -> dict:
    return r | {"url": SEARCH.format(r["name"].replace(" ", "%20"))}


def for_indicator(ind: str, n: int = 4) -> dict:
    rows = [D["experiments"][i] for i in D["by_indicator"].get(ind, [])]
    agencies = Counter(r["agency"] for r in rows)
    return {"count": len(rows), "agencies": dict(agencies.most_common()), "examples": [_row(r) for r in rows[:n]],
            "explorer": D["source"]["explorer"]}


def summary() -> dict:
    return {"source": D["source"], "note": D["note"], "total_experiments": D["total_experiments"], "human_research": D["human_research"],
            "agencies": D["agencies"], "by_indicator": {k: len(v) for k, v in D["by_indicator"].items() if v}}
