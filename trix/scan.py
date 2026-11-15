"""Body mirror: a personal outline from a camera scan, and how it changes between scans.

The tablet runs MediaPipe Pose with segmentation and sends the person mask plus a few landmarks. Here we take the
outline and five widths (face, shoulders, waist, thigh, calf), all divided by body height so distance to the camera
matters less. In weightlessness fluid moves to the head and the legs thin ("puffy face, bird legs"); comparing a
scan with the first one shows that trend. It is a 2D camera comparison, not a medical measurement.
"""
import json
import time
from pathlib import Path

import cv2
import numpy as np

from . import store

DIR = store.ROOT / "data" / "scans"
NOSE, L_EAR, R_EAR, L_SH, R_SH, L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANK, R_ANK = 0, 7, 8, 11, 12, 23, 24, 25, 26, 27, 28
NEED = (NOSE, L_SH, R_SH, L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANK, R_ANK)
LABEL = {"face": "Face width", "shoulders": "Shoulders", "waist": "Waist", "thigh": "Thigh width", "calf": "Calf width"}
NOTE = {("face", 1): "Fluid shifts toward the head in weightlessness. Expected; keep up the weekly vision check.",
        ("calf", -1): "Leg muscle is shrinking. Add leg resistance work.", ("thigh", -1): "Leg muscle is shrinking. Add squats to the resistance session.",
        ("waist", -1): "You may be eating too little. Check the food log.", ("waist", 1): "Small change. Keep the exercise plan."}
WATCH_PCT = 4.0


def _run(row: np.ndarray, x: int) -> int:
    """Width of the filled run that contains column x (0 if x is not on the body)."""
    x = int(np.clip(x, 0, len(row) - 1))
    if not row[x]:
        near = np.flatnonzero(row)
        if not len(near):
            return 0
        x = int(near[np.argmin(np.abs(near - x))])
    lo = hi = x
    while lo > 0 and row[lo - 1]:
        lo -= 1
    while hi < len(row) - 1 and row[hi + 1]:
        hi += 1
    return hi - lo + 1


def measure(mask: np.ndarray, lm: dict) -> dict:
    """mask: HxW (person > 0). lm: {id: [x, y]} normalized 0-1. Returns metrics (per body height) and the outline."""
    if mask.ndim == 3:
        mask = mask[..., :3].max(axis=2)
    m = (mask > 127).astype(np.uint8)
    h, w = m.shape
    lm = {int(k): (float(v[0]) * w, float(v[1]) * h) for k, v in lm.items()}
    if any(k not in lm for k in NEED):
        raise ValueError("I can't see your whole body. Step back until your head and feet are both in the frame.")
    height = (lm[L_ANK][1] + lm[R_ANK][1]) / 2 - lm[NOSE][1]
    if height < 0.35 * h:
        raise ValueError("You are too far away or not fully in view. Fill the green outline.")
    if m.sum() < 0.03 * m.size:
        raise ValueError("I can't separate you from the background. Stand in front of a plain wall with more light.")
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cnts, key=cv2.contourArea)
    c = cv2.approxPolyDP(c, 0.003 * cv2.arcLength(c, True), True)[:, 0, :]
    hip = ((lm[L_HIP][0] + lm[R_HIP][0]) / 2, (lm[L_HIP][1] + lm[R_HIP][1]) / 2)
    sh_y = (lm[L_SH][1] + lm[R_SH][1]) / 2
    face_y = lm[NOSE][1] if L_EAR not in lm else (lm[L_EAR][1] + lm[R_EAR][1]) / 2

    def leg(top, bottom, frac=0.5):
        out = []
        for a, b in ((lm[top[0]], lm[bottom[0]]), (lm[top[1]], lm[bottom[1]])):
            y = int(a[1] + frac * (b[1] - a[1]))
            out.append(_run(m[min(max(y, 0), h - 1)], int(a[0] + frac * (b[0] - a[0]))))
        return float(np.mean(out))
    px = {"face": _run(m[int(np.clip(face_y, 0, h - 1))], int(lm[NOSE][0])),
          "shoulders": abs(lm[L_SH][0] - lm[R_SH][0]),
          "waist": _run(m[int(np.clip(sh_y + 0.72 * (hip[1] - sh_y), 0, h - 1))], int(hip[0])),
          "thigh": leg((L_HIP, R_HIP), (L_KNEE, R_KNEE)), "calf": leg((L_KNEE, R_KNEE), (L_ANK, R_ANK), 0.4)}
    metrics = {k: round(float(v) / height, 4) for k, v in px.items()}
    outline = [[round((x - hip[0]) / height, 4), round((y - hip[1]) / height, 4)] for x, y in c.tolist()]
    return {"metrics": metrics, "outline": outline, "anchor": {"hip": [hip[0] / w, hip[1] / h], "height": height / h, "aspect": w / h},
            "knee_y": round(((lm[L_KNEE][1] + lm[R_KNEE][1]) / 2 - hip[1]) / height, 4), "shoulder_y": round((sh_y - hip[1]) / height, 4),
            "leg_x": [round((lm[L_KNEE][0] - hip[0]) / height, 4), round((lm[R_KNEE][0] - hip[0]) / height, 4)]}


def save(who: str, res: dict, photo: bytes | None = None, simulated: bool = False, day: int | None = None) -> dict:
    scans = store.get(f"scans:{who}", [])
    sid = int(time.time() * 1000) + len(scans)
    rec = {"id": sid, "day": store.today() if day is None else day, "ts": time.time(), "simulated": simulated,
           "has_photo": bool(photo), **{k: res[k] for k in ("metrics", "outline", "anchor", "knee_y", "shoulder_y", "leg_x")}}
    if photo:
        DIR.mkdir(parents=True, exist_ok=True)
        (DIR / f"{who}_{sid}.jpg").write_bytes(photo)
    scans.append(rec)
    scans.sort(key=lambda s: (s["day"], s["ts"]))
    store.put(f"scans:{who}", scans)
    return rec


def photo_path(who: str, sid: int) -> Path:
    return DIR / f"{who}_{sid}.jpg"


def simulate_day1(who: str) -> dict | None:
    """Demo helper: build a 'day 1' scan from the newest real one by undoing the expected spaceflight changes
    (face 6% narrower, calves 4% wider, thighs 2% wider). Clearly marked simulated."""
    scans = [s for s in store.get(f"scans:{who}", []) if not s["simulated"]]
    if not scans:
        return None
    cur = scans[-1]
    f = {"face": 1 / 1.06, "calf": 1 / 0.96, "thigh": 1 / 0.98, "waist": 1 / 0.99, "shoulders": 1.0}
    out = []
    for x, y in cur["outline"]:
        if y < cur["shoulder_y"] - 0.02:                      # head
            x *= f["face"]
        elif y > cur["knee_y"]:                               # lower legs
            cx = min(cur["leg_x"], key=lambda c: abs(c - x))
            x = cx + (x - cx) * f["calf"]
        elif y > 0.02:                                        # thighs
            cx = min(cur["leg_x"], key=lambda c: abs(c - x))
            x = cx + (x - cx) * f["thigh"]
        out.append([round(x, 4), y])
    res = dict(cur, outline=out, metrics={k: round(v * f[k], 4) for k, v in cur["metrics"].items()})
    store.put(f"scans:{who}", [s for s in store.get(f"scans:{who}", []) if not s["simulated"]])
    return save(who, res, None, simulated=True, day=1)


def compare(who: str) -> dict:
    scans = store.get(f"scans:{who}", [])
    if not scans:
        return {"scans": [], "changes": [], "message": "No scan yet. Scan yourself to get your personal body map."}
    base, cur = scans[0], scans[-1]
    changes = []
    if len(scans) > 1:
        for k in ("face", "calf", "thigh", "waist", "shoulders"):
            pct = round(100 * (cur["metrics"][k] / base["metrics"][k] - 1), 1) if base["metrics"][k] else 0.0
            watch = abs(pct) >= WATCH_PCT and k != "shoulders"
            note = NOTE.get((k, 1 if pct > 0 else -1), "Stable.") if abs(pct) >= 1.5 else "Stable."
            changes.append({"id": k, "label": LABEL[k], "pct": pct, "status": "amber" if watch else "green", "note": note})
    top = next((c for c in changes if c["status"] == "amber" and c["id"] in ("calf", "thigh")), None)
    msg = ("First scan saved. Scan again next week to see how you are changing." if len(scans) == 1 else
           "Add 2 sets of calf raises to today's exercise block." if top else "No change that needs action. Keep the exercise plan.")
    slim = [{k: s[k] for k in ("id", "day", "simulated", "has_photo", "outline", "anchor", "metrics")} for s in scans]
    return {"scans": slim, "baseline": slim[0], "current": slim[-1], "changes": changes, "message": msg,
            "note": "2D camera comparison: a trend to act on early, not a medical measurement. Photos stay on board and are never sent to Earth."}
