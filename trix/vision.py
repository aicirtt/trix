"""Camera checks that run on the onboard computer (OpenCV, no internet).

- Face fatigue: eye landmarks from MediaPipe Face Mesh (runs in the tablet browser) -> PERCLOS, blink rate.
- ECG placement: body landmarks from MediaPipe Pose (tablet) + the camera frame -> where each sticker should go,
  where the sticker is, and how far to move it.
- Skin photo: redness map in Lab colour space, compared with the astronaut's last photo.
- Food pouch: reads the pouch's QR / barcode and looks it up in the onboard menu.
- Ultrasound: view-quality check for the apical 4-chamber view (sector, brightness, sharpness, chambers).

These are screening aids that tell the crew what to fix or re-check. None of them diagnoses anything.
"""
import base64
import json
import math
from pathlib import Path

import cv2
import numpy as np

KB = Path(__file__).parent / "kb"
SHOULDER_CM = 38.0   # typical adult shoulder width, used to turn pixels into centimetres


def decode_image(data: bytes | str) -> np.ndarray:
    """Accept raw bytes, or a base64 / data-URL string from the browser."""
    if isinstance(data, str):
        data = base64.b64decode(data.split(",", 1)[-1])
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not read the image.")
    return img


# ------------------------------------------------------------------ face fatigue
LEFT_EYE = [33, 160, 158, 133, 153, 144]     # Face Mesh indices: corner, top, top, corner, bottom, bottom
RIGHT_EYE = [362, 385, 387, 263, 373, 380]


def ear(pts: list) -> float:
    """Eye aspect ratio from 6 (x, y) points: open eye ~0.25-0.35, closed < ~0.15."""
    p = [np.array(a[:2], float) for a in pts]
    v = np.linalg.norm(p[1] - p[5]) + np.linalg.norm(p[2] - p[4])
    h = 2 * np.linalg.norm(p[0] - p[3])
    return float(v / h) if h else 0.0


def fatigue(frames: list[dict]) -> dict:
    """frames: [{"t": seconds, "left": [[x,y]*6], "right": [[x,y]*6]}] sampled for ~20-60 s.

    PERCLOS = share of time the eyes are mostly (>80%) closed, the standard drowsiness measure.
    """
    frames = [f for f in frames if f.get("left") and f.get("right")]
    if len(frames) < 10:
        return {"ok": False, "message": "Not enough face frames. Keep your face in the oval for 20 seconds."}
    t = np.array([f["t"] for f in frames], float)
    e = np.array([(ear(f["left"]) + ear(f["right"])) / 2 for f in frames])
    open_ear = float(np.percentile(e, 90))           # this person's eyes-open level
    closed = e < 0.55 * open_ear                     # eyes more than about half shut
    dur = max(t[-1] - t[0], 1e-6)
    dt = np.diff(t, append=t[-1])
    perclos = float((dt * closed).sum() / dur * 100)
    blinks, long_blinks, i = 0, 0, 0
    while i < len(closed):
        if closed[i]:
            j = i
            while j < len(closed) and closed[j]:
                j += 1
            blinks += 1
            if t[min(j, len(t) - 1)] - t[i] > 0.45:  # normal blinks last 0.1-0.4 s
                long_blinks += 1
            i = j
        else:
            i += 1
    rate = blinks / dur * 60
    level = "red" if perclos >= 30 else "amber" if perclos >= 15 or long_blinks >= 3 else "green"
    msg = {"green": "Eyes look alert.",
           "amber": "Signs of tiredness. Avoid critical tasks in the next 2 hours and take a short rest.",
           "red": "Very tired. Do not start critical tasks; tell the crew medical officer."}[level]
    return {"ok": True, "perclos": round(perclos, 1), "blinks_per_min": round(float(rate), 1), "long_blinks": long_blinks,
            "seconds": round(float(dur), 1), "status": level, "message": msg, "reading": {"fatigue": round(perclos, 1)}}


# ------------------------------------------------------------------ ECG placement
# MediaPipe Pose landmark ids (patient's own left/right)
L_SH, R_SH, L_HIP, R_HIP = 11, 12, 23, 24
ELECTRODES = {
    "E1": "below the right collarbone",
    "E2": "below the left collarbone",
    "E3": "on the lower left ribs",
    "E4": "on the lower right ribs",
    "E5": "just right of the breastbone",
}


def electrode_targets(lm: dict) -> dict:
    """lm: {id: [x, y]} in pixels for the shoulders and hips. Returns target pixel points for E1-E5."""
    ls, rs, lh, rh = (np.array(lm[k][:2], float) for k in (L_SH, R_SH, L_HIP, R_HIP))
    across = ls - rs                        # from her right shoulder to her left shoulder
    mid_sh, mid_hip = (ls + rs) / 2, (lh + rh) / 2
    down = mid_hip - mid_sh                 # down the torso
    t = {
        "E1": rs + 0.18 * across + 0.12 * down,
        "E2": ls - 0.18 * across + 0.12 * down,
        "E3": ls + 0.62 * (lh - ls) - 0.12 * across,
        "E4": rs + 0.62 * (rh - rs) + 0.12 * across,
        "E5": mid_sh - 0.07 * across + 0.36 * down,
    }
    return {k: [float(v[0]), float(v[1])] for k, v in t.items()}


def find_stickers(img: np.ndarray, lm: dict) -> list[list[float]]:
    """Round, bright, low-colour blobs (foam ECG electrodes) inside the torso."""
    ls, rs, lh, rh = (np.array(lm[k][:2], float) for k in (L_SH, R_SH, L_HIP, R_HIP))
    sw = float(np.linalg.norm(ls - rs))
    torso = np.array([rs, ls, lh, rh], np.int32)
    mask = np.zeros(img.shape[:2], np.uint8)
    cv2.fillConvexPoly(mask, torso, 255)
    mask = cv2.dilate(mask, np.ones((int(sw * 0.1) | 1, int(sw * 0.1) | 1), np.uint8))
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, (0, 0, 185), (180, 70, 255))
    white = cv2.bitwise_and(white, mask)
    white = cv2.morphologyEx(white, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, _, stats, cents = cv2.connectedComponentsWithStats(white)
    r_min, r_max = sw * 0.025, sw * 0.12
    out = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        r = math.sqrt(area / math.pi)
        if r_min <= r <= r_max and 0.6 <= w / max(h, 1) <= 1.6 and area / (w * h) > 0.55:
            out.append([float(cents[i][0]), float(cents[i][1])])
    return out


def _direction(dx_across: float, dy_down: float) -> str:
    parts = []
    if abs(dx_across) >= 1:
        parts.append(f"{abs(dx_across):.0f} cm toward her {'left' if dx_across > 0 else 'right'} side")
    if abs(dy_down) >= 1:
        parts.append(f"{abs(dy_down):.0f} cm {'down toward her waist' if dy_down > 0 else 'up toward her shoulders'}")
    return " and ".join(parts)


def ecg_check(img: np.ndarray | None, landmarks: list | dict, target: str, placed: dict | None = None,
              tolerance_cm: float = 2.5) -> dict:
    """Is the sticker for `target` (E1-E5) in the right place? landmarks: Pose output, normalized or pixels."""
    if target not in ELECTRODES:
        return {"ok": False, "message": f"Unknown electrode {target}."}
    if isinstance(landmarks, list):
        landmarks = {i: p for i, p in enumerate(landmarks)}
    landmarks = {int(k): v for k, v in landmarks.items()}
    if any(k not in landmarks for k in (L_SH, R_SH, L_HIP, R_HIP)):
        return {"ok": False, "status": "no_body", "message": "I can't see her shoulders and hips. Move the tablet back so her whole chest is in view."}
    h, w = (img.shape[:2] if img is not None else (1, 1))
    lm = {}
    for k, p in landmarks.items():
        x, y = float(p[0]), float(p[1])
        if x <= 1.5 and y <= 1.5 and img is not None:  # normalized coordinates from MediaPipe
            x, y = x * w, y * h
        lm[k] = [x, y]
    sw = float(np.linalg.norm(np.array(lm[L_SH]) - np.array(lm[R_SH])))
    if sw < 20:
        return {"ok": False, "status": "too_far", "message": "Her chest is too small in the picture. Bring the tablet closer."}
    cm = SHOULDER_CM / sw
    targets = electrode_targets(lm)
    tgt = np.array(targets[target])
    result = {"ok": True, "target": target, "where": ELECTRODES[target], "targets": targets,
              "targets_norm": {k: [v[0] / w, v[1] / h] for k, v in targets.items()}, "cm_per_px": cm}
    if img is None:
        return result | {"status": "no_image", "message": f"Put the sticker {ELECTRODES[target]}."}
    others = [np.array(v) for k, v in (placed or {}).items() if k != target]
    stickers = [s for s in find_stickers(img, lm)
                if all(np.linalg.norm(np.array(s) - o) * cm > 3 for o in others)]
    result["stickers"] = stickers
    result["stickers_norm"] = [[s[0] / w, s[1] / h] for s in stickers]
    if not stickers:
        return result | {"status": "not_found", "message": f"I can't see the new sticker yet. Put it {ELECTRODES[target]}."}
    best = min(stickers, key=lambda s: np.linalg.norm(np.array(s) - tgt))
    d = np.array(best) - tgt
    dist = float(np.linalg.norm(d) * cm)
    across = np.array(lm[L_SH]) - np.array(lm[R_SH])
    across /= np.linalg.norm(across)
    down = np.array([-across[1], across[0]])
    if np.dot(down, (np.array(lm[L_HIP]) + np.array(lm[R_HIP])) / 2 - (np.array(lm[L_SH]) + np.array(lm[R_SH])) / 2) < 0:
        down = -down
    move_across, move_down = -float(np.dot(d, across)) * cm, -float(np.dot(d, down)) * cm
    result |= {"found": best, "found_norm": [best[0] / w, best[1] / h], "off_cm": round(dist, 1)}
    if dist <= tolerance_cm:
        return result | {"status": "good", "passed": True, "message": f"Sticker {target[1]} is in the right place."}
    return result | {"status": "move", "passed": False,
                     "message": f"Sticker {target[1]} is {dist:.0f} cm off. Slide it {_direction(move_across, move_down)}."}


# ------------------------------------------------------------------ skin photo
def skin(img: np.ndarray, previous: dict | None = None) -> dict:
    """Redness (erythema) map: Lab a* channel well above this person's normal skin in the same photo."""
    small = cv2.resize(img, (min(480, img.shape[1]), int(img.shape[0] * min(480, img.shape[1]) / img.shape[1])))
    ycc = cv2.cvtColor(small, cv2.COLOR_BGR2YCrCb)
    skin_mask = cv2.inRange(ycc, (0, 133, 77), (255, 180, 135)) > 0
    lab = cv2.cvtColor(small, cv2.COLOR_BGR2LAB).astype(float)
    a = lab[..., 1]
    if skin_mask.sum() < 0.05 * skin_mask.size:
        return {"ok": False, "message": "I can't see enough skin. Fill the frame with the area and use the flash."}
    base = np.median(a[skin_mask])
    mad = np.median(np.abs(a[skin_mask] - base)) + 1e-6
    # look for redness anywhere on the skin area, including red patches the skin filter itself rejects
    cnts, _ = cv2.findContours(skin_mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    region = np.zeros(skin_mask.shape, np.uint8)
    cv2.fillPoly(region, [cv2.convexHull(max(cnts, key=cv2.contourArea))], 1)
    red = (a > base + max(6.0, 4 * mad)) & (region > 0)
    red = cv2.morphologyEx(red.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(red)
    areas = sorted((int(s[4]) for s in stats[1:]), reverse=True)
    red_pct = 100 * float(red.sum()) / float(skin_mask.sum() + red.sum())
    spots = sum(1 for x in areas if x > 30)
    status = "amber" if red_pct >= 3 or spots >= 3 else "green"
    msg = ("Red area found. TRIX saved the photo for the crew medical officer. If you also have a fever, tell them now."
           if status == "amber" else "No clear red area in this photo.")
    change = None
    if previous and previous.get("red_pct") is not None:
        change = round(red_pct - previous["red_pct"], 1)
        if change >= 2:
            msg += f" It is larger than your last photo (+{change} points)."
    return {"ok": True, "red_pct": round(red_pct, 1), "spots": spots, "largest_px": areas[0] if areas else 0,
            "change": change, "status": status, "message": msg,
            "reading": {"skin": "red area" if status == "amber" else "none"}, "note": "Screening aid, not a diagnosis."}


# ------------------------------------------------------------------ food pouch
def menu() -> dict:
    return {m["id"]: m for m in json.loads((KB / "menu.json").read_text())["items"]}


def read_codes(img: np.ndarray) -> list[str]:
    found = []
    try:
        ok, texts, _, _ = cv2.QRCodeDetector().detectAndDecodeMulti(img)
        if ok:
            found += [t for t in texts if t]
    except Exception:
        pass
    if not found:
        t, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
        if t:
            found.append(t)
    try:
        ok, texts, _types, _ = cv2.barcode.BarcodeDetector().detectAndDecodeWithType(img)
        if ok:
            found += [t for t in texts if t]
    except Exception:
        pass
    return list(dict.fromkeys(found))


def food(img: np.ndarray) -> dict:
    items = menu()
    codes = read_codes(img)
    hits = [items[c] for c in codes if c in items] + [m for m in items.values() if m.get("barcode") in codes]
    if not hits:
        return {"ok": False, "codes": codes,
                "message": "I couldn't read the pouch label. Turn the QR code toward the camera, or pick the food from the menu."}
    return {"ok": True, "items": hits, "message": f"Logged {', '.join(h['name'] for h in hits)}.", "totals": totals(hits)}


def totals(items: list[dict]) -> dict:
    keys = ("kcal", "fluid_ml", "calcium_mg", "vitamin_d_iu", "sodium_mg", "protein_g")
    return {k: round(sum(float(i.get(k, 0)) for i in items), 1) for k in keys}


def qr_png(text: str, size: int = 240) -> bytes:
    enc = cv2.QRCodeEncoder.create()
    q = enc.encode(text)
    q = cv2.resize(q, (size, size), interpolation=cv2.INTER_NEAREST)
    q = cv2.copyMakeBorder(q, 16, 16, 16, 16, cv2.BORDER_CONSTANT, value=255)
    return cv2.imencode(".png", q)[1].tobytes()


# ------------------------------------------------------------------ ultrasound view quality
def ultrasound(img: np.ndarray) -> dict:
    """Is this a usable apical 4-chamber view? Checks the scan sector, brightness, sharpness and dark chambers."""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    g = cv2.resize(g, (480, int(g.shape[0] * 480 / g.shape[1])))
    sector = (cv2.GaussianBlur(g, (21, 21), 0) > 12).astype(np.uint8)
    cnts, _ = cv2.findContours(sector, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return {"ok": False, "quality": "poor", "message": "No ultrasound image. Check the probe is switched on and touching the skin with gel."}
    c = max(cnts, key=cv2.contourArea)
    m = np.zeros_like(g)
    cv2.drawContours(m, [c], -1, 255, -1)
    m = cv2.erode(m, np.ones((15, 15), np.uint8))
    area = float((m > 0).sum())
    cover = area / g.size
    inside = g[m > 0]
    bright = float(np.percentile(inside, 90)) if inside.size else 0
    sharp = float(cv2.Laplacian(g, cv2.CV_64F)[m > 0].var()) if inside.size else 0
    dark = ((g < max(25, 0.35 * bright)) & (m > 0)).astype(np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    n, _, stats, cents = cv2.connectedComponentsWithStats(dark)
    chambers = [(stats[i], cents[i]) for i in range(1, n) if stats[i][4] > 0.006 * area and stats[i][4] < 0.25 * area]
    tips, score = [], 100
    if cover < 0.15:
        tips.append("Press the probe more firmly and add gel: most of the picture is black.")
        score -= 35
    if bright < 90:
        tips.append("The picture is dark: turn the gain up.")
        score -= 20
    if sharp < 40:
        tips.append("The picture is blurred: hold the probe still and brace your elbow.")
        score -= 20
    if len(chambers) < 4:
        tips.append(f"I see {len(chambers)} of 4 chambers: tilt the probe slightly toward her right shoulder.")
        score -= 15 * (4 - len(chambers))
    elif len(chambers) > 5:
        tips.append("Too many dark areas: you may be between ribs. Slide the probe one rib space down.")
        score -= 15
    score = max(0, score)
    quality = "good" if score >= 75 else "fair" if score >= 45 else "poor"
    msg = "Good 4-chamber view. Hold still and record 3 heartbeats." if quality == "good" else tips[0]
    return {"ok": True, "quality": quality, "score": score, "chambers": len(chambers), "brightness": round(bright),
            "sharpness": round(sharp), "coverage": round(cover, 2), "tips": tips, "message": msg,
            "chamber_boxes": [[int(s[0]), int(s[1]), int(s[2]), int(s[3])] for s, _ in chambers],
            "size": [g.shape[1], g.shape[0]],
            "note": "View-quality check only. Pumping strength (ejection fraction) needs the EchoNet model, which is not installed here."}
