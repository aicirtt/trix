"""NASA Open Science Data Repository (OSDR): real spaceflight biology studies behind each health indicator.

A short verified list ships with TRIX so it works with no link to Earth. When there is a link, search() asks the
OSDR Search API for more studies. TRIX uses these as evidence and reading, never as alert limits."""
import json
import urllib.parse
from pathlib import Path

from . import feeds

KB = json.loads((Path(__file__).parent / "kb" / "osdr.json").read_text())
STUDY_URL = "https://osdr.nasa.gov/bio/repo/data/studies/{}"
SEARCH_URL = "https://osdr.nasa.gov/osdr/data/search?term={}&from=0&size={}&type=cgene"
# what to look up in the repository for each indicator
TERM = {"bp": "cardiovascular", "hr": "heart", "hrv": "stress", "spo2": "hypoxia", "temp": "immune", "glucose": "insulin", "sleep": "circadian",
        "mood": "behavior", "fatigue": "sleep deprivation", "vision": "retina", "bone": "bone loss", "fluid": "kidney", "calcium": "calcium",
        "co2": "carbon dioxide", "rad_daily": "radiation", "rad_career": "radiation", "skin": "skin", "orthostatic": "cardiovascular",
        "reaction": "cognition", "exercise": "muscle atrophy", "mass": "nutrition", "back_pain": "intervertebral disc"}


def _row(s: dict) -> dict:
    return {"id": s["id"], "title": s["title"], "what": s.get("what", ""), "url": STUDY_URL.format(s["id"]), "organism": s.get("organism", "Human")}


def bundled() -> list[dict]:
    return [_row(s) | {"indicators": s["indicators"]} for s in KB["studies"]]


def for_indicator(ind: str) -> dict:
    """Studies linked to one indicator, and the search term for more."""
    return {"term": TERM.get(ind, ind), "studies": [_row(s) for s in KB["studies"] if ind in s["indicators"]]}


def _first(v):
    return v[0] if isinstance(v, list) and v else v


def _parse(data: dict) -> list[dict]:
    out = []
    for h in ((data or {}).get("hits") or {}).get("hits") or []:
        s = h.get("_source") or {}
        acc = _first(s.get("Accession") or s.get("Study Identifier") or "")
        if not str(acc).startswith("OSD-"):
            continue
        out.append({"id": acc, "title": str(_first(s.get("Study Title")) or acc), "what": str(_first(s.get("Study Description")) or "")[:260],
                    "organism": str(_first(s.get("organism")) or ""), "url": STUDY_URL.format(acc)})
    return out


def search(term: str, size: int = 8) -> dict:
    """Live OSDR search, kept for a day; if Earth cannot be reached, the bundled studies that match."""
    term = (term or "").strip()[:60] or "astronaut"
    key = "osdr_" + "".join(c if c.isalnum() else "_" for c in term.lower())
    try:
        data, source, err = feeds._cached(key, lambda: feeds._get(SEARCH_URL.format(urllib.parse.quote(term), size)), 86400)
        rows = _parse(data)
        if rows:
            return {"term": term, "source": source, "studies": rows[:size], "error": err}
    except Exception as e:                       # no cache and no bundled sample for this term
        err = f"{type(e).__name__}: {e}"[:160]
    t = term.lower()
    hit = [_row(s) for s in KB["studies"] if t in s["title"].lower() or t in s["what"].lower() or any(t in x or x in t for x in s["terms"])]
    return {"term": term, "source": "bundled list (offline)", "studies": hit or [_row(s) for s in KB["studies"]][:size], "error": err}
