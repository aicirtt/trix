"""Live data feeds with an offline fallback.

- NASA DONKI (space weather): solar flares (FLR) and solar energetic particle events (SEP) from the last 7 days.
  Free key from api.nasa.gov (NASA_API_KEY); DEMO_KEY works with a low rate limit.
- Meteomatics (landing-site weather): wind, waves, temperature and rain for the splashdown zone.
  Needs a Meteomatics account (METEOMATICS_USER / METEOMATICS_PASSWORD; free hackathon access via Space Apps).

Every successful call is cached in data/cache/. With no network (deep space, or this demo offline), TRIX uses the
last cached reply, then a bundled sample, and always says which one it used.
"""
import base64
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "cache"
SAMPLES = Path(__file__).parent / "kb" / "samples"
TIMEOUT = 6


def _get(url: str, headers: dict | None = None):
    req = urllib.request.Request(url, headers={"User-Agent": "TRIX/1.0"} | (headers or {}))
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode() or "null")


def _cached(name: str, fetch, max_age_s: int):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{name}.json"
    if f.exists() and time.time() - f.stat().st_mtime < max_age_s:
        return json.loads(f.read_text()), "cache", None
    try:
        data = fetch()
        f.write_text(json.dumps(data))
        return data, "live", None
    except Exception as e:
        err = f"{type(e).__name__}: {e}"[:160]
        if f.exists():
            return json.loads(f.read_text()), "cache (offline)", err
        return json.loads((SAMPLES / f"{name}.json").read_text()), "sample (offline)", err


# ---------------------------------------------------------------- DONKI
def space_weather(days: int = 7) -> dict:
    key = os.environ.get("NASA_API_KEY", "DEMO_KEY")
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=days)
    base = "https://api.nasa.gov/DONKI"

    def fetch():
        qs = urllib.parse.urlencode({"startDate": start.isoformat(), "endDate": end.isoformat(), "api_key": key})
        return {"FLR": _get(f"{base}/FLR?{qs}") or [], "SEP": _get(f"{base}/SEP?{qs}") or [],
                "fetched": datetime.now(timezone.utc).isoformat()}

    data, source, err = _cached("donki", fetch, 30 * 60)
    return assess_space_weather(data) | {"source": source, "error": err}


def _flare_rank(cls: str) -> float:
    if not cls:
        return 0
    scale = {"A": 0.01, "B": 0.1, "C": 1, "M": 10, "X": 100}.get(cls[0].upper(), 0)
    try:
        return scale * float(cls[1:] or 1)
    except ValueError:
        return scale


def assess_space_weather(data: dict) -> dict:
    flares = sorted(data.get("FLR") or [], key=lambda f: f.get("peakTime") or f.get("beginTime") or "", reverse=True)
    seps = sorted(data.get("SEP") or [], key=lambda s: s.get("eventTime") or "", reverse=True)
    biggest = max(flares, key=lambda f: _flare_rank(f.get("classType", "")), default=None)
    ref = data.get("fetched")
    now = datetime.fromisoformat(ref.replace("Z", "+00:00")) if ref else datetime.now(timezone.utc)

    def hours_ago(ts):
        try:
            return (now - datetime.fromisoformat(ts.replace("Z", "+00:00"))).total_seconds() / 3600
        except Exception:
            return 1e9

    recent_sep = [s for s in seps if hours_ago(s.get("eventTime", "")) <= 48]
    big_recent = [f for f in flares if _flare_rank(f.get("classType", "")) >= 10 and hours_ago(f.get("peakTime") or f.get("beginTime", "")) <= 24]
    if recent_sep:
        level, msg, reading = "red", "Solar particle event in progress. Go to the storm shelter and follow RAD-SHELTER-01.", "storm in progress"
    elif big_recent:
        level, msg, reading = "amber", f"Strong flare ({big_recent[0]['classType']}) in the last 24 h. Particles may follow: plan to shelter and avoid spacewalks.", "SEP alert"
    else:
        level, msg, reading = "green", "No solar particle event. Normal activities.", None
    return {"status": level, "message": msg, "reading": {"rad_daily": reading} if reading else {},
            "flares": [{"class": f.get("classType"), "peak": f.get("peakTime"), "region": f.get("activeRegionNum"),
                        "link": f.get("link")} for f in flares[:6]],
            "sep": [{"time": s.get("eventTime"), "link": s.get("link")} for s in seps[:4]],
            "biggest": biggest.get("classType") if biggest else None, "count": {"flares": len(flares), "sep": len(seps)}}


# ---------------------------------------------------------------- Meteomatics
SITES = {
    "pacific": {"name": "Pacific splashdown zone (off San Diego)", "lat": 32.5, "lon": -117.6, "sea": True},
    "gulf": {"name": "Gulf of Mexico splashdown zone (off Pensacola)", "lat": 29.9, "lon": -87.3, "sea": True},
    "kazakhstan": {"name": "Soyuz landing zone (Kazakhstan steppe)", "lat": 47.4, "lon": 69.6, "sea": False},
}
LIMITS = {"wind_ms": 10.0, "wave_m": 2.0, "precip_mm": 5.0}  # simplified go / no-go limits for the demo


def landing_weather(site: str = "pacific") -> dict:
    s = SITES.get(site, SITES["pacific"])
    user, pw = os.environ.get("METEOMATICS_USER"), os.environ.get("METEOMATICS_PASSWORD")
    params = "t_2m:C,wind_speed_10m:ms,wind_gusts_10m_1h:ms,precip_1h:mm" + (",significant_height_wind_waves:m" if s["sea"] else "")
    t0 = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    span = f"{t0.strftime('%Y-%m-%dT%H:%M:%SZ')}--{(t0 + timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%SZ')}:PT3H"

    def fetch():
        if not (user and pw):
            raise RuntimeError("METEOMATICS_USER / METEOMATICS_PASSWORD not set")
        auth = base64.b64encode(f"{user}:{pw}".encode()).decode()
        return _get(f"https://api.meteomatics.com/{span}/{params}/{s['lat']},{s['lon']}/json",
                    {"Authorization": f"Basic {auth}"})

    data, source, err = _cached(f"meteomatics_{site}" if (user and pw) else "meteomatics", fetch, 60 * 60)
    return assess_landing(data, s) | {"source": source, "error": err, "site": s["name"]}


def assess_landing(data: dict, site: dict) -> dict:
    series = {}
    for p in data.get("data", []):
        name = p["parameter"].split(":")[0]
        series[name] = [(d["date"], d["value"]) for d in p["coordinates"][0]["dates"]]
    times = [t for t, _ in series.get("wind_speed_10m", [])]
    rows = []
    for i, t in enumerate(times):
        wind = series["wind_speed_10m"][i][1]
        gust = series.get("wind_gusts_10m_1h", [(t, wind)] * len(times))[i][1]
        wave = series.get("significant_height_wind_waves", [(t, 0)] * len(times))[i][1] if site.get("sea") else 0
        rain = series.get("precip_1h", [(t, 0)] * len(times))[i][1]
        temp = series.get("t_2m", [(t, None)] * len(times))[i][1]
        why = []
        if wind > LIMITS["wind_ms"]:
            why.append(f"wind {wind} m/s")
        if wave > LIMITS["wave_m"]:
            why.append(f"waves {wave} m")
        if rain > LIMITS["precip_mm"]:
            why.append(f"rain {rain} mm/h")
        rows.append({"time": t, "wind_ms": wind, "gust_ms": gust, "wave_m": wave, "rain_mm": rain, "temp_c": temp,
                     "go": not why, "why": why})
    go = [r for r in rows if r["go"]]
    msg = (f"Weather is within limits for {len(go)} of {len(rows)} windows in the next 24 h." if rows
           else "No forecast available.")
    return {"windows": rows, "message": msg, "limits": LIMITS}
