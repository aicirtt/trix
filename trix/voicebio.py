"""Voice check-in biomarkers: how you speak, not what you say.

The astronaut reads the same short passage each day (about 15 s). From the audio TRIX measures:
- speech rate (syllables per second, from peaks in the loudness envelope),
- pauses (share of time silent between words, and long pauses over 0.5 s),
- pitch (median and variation in semitones: a flat, monotone voice goes with fatigue),
and compares them with that astronaut's own earlier recordings. Slower speech, more pauses and a flatter pitch
together are signs of fatigue or low mood (used in fatigue research and in NASA-funded speech studies). It is a
screening signal for the Coach, never a diagnosis. Raw audio is analysed and discarded unless the astronaut allows
keeping recordings (privacy settings).
"""
import io
import json
import wave

import numpy as np

from . import store

PASSAGE = ("The crew woke at six thirty. After breakfast we checked the oxygen system, logged our water, "
           "and started two hours of exercise before the science work began.")
# priors until we have 3 of the astronaut's own recordings (typical adult read speech)
PRIOR = {"rate": (4.2, 0.6), "pause": (0.22, 0.07), "pitch_var": (2.6, 0.8)}
FEATURES = ("rate", "pause", "pitch_var", "pitch", "long_pauses")


def read_wav(data: bytes) -> tuple[np.ndarray, int]:
    with wave.open(io.BytesIO(data)) as w:
        sr, n, ch, sw = w.getframerate(), w.getnframes(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError("Expected 16-bit audio.")
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    if ch > 1:
        x = x.reshape(-1, ch).mean(1)
    return x, sr


def _pitch(frame: np.ndarray, sr: int) -> float | None:
    """Autocorrelation pitch in 75-400 Hz, None if unvoiced."""
    f = frame - frame.mean()
    if np.sqrt((f ** 2).mean()) < 1e-3:
        return None
    ac = np.correlate(f, f, "full")[len(f) - 1:]
    lo, hi = int(sr / 400), int(sr / 75)
    if hi >= len(ac):
        return None
    lag = lo + int(np.argmax(ac[lo:hi]))
    return sr / lag if ac[lag] > 0.3 * ac[0] else None


def features(x: np.ndarray, sr: int) -> dict:
    hop, win = int(0.01 * sr), int(0.03 * sr)
    if len(x) < sr * 3:
        raise ValueError("The recording is too short. Read the whole passage (about 15 seconds).")
    n = 1 + (len(x) - win) // hop
    frames = np.stack([x[i * hop:i * hop + win] for i in range(n)])
    energy = np.sqrt((frames ** 2).mean(1))
    db = 20 * np.log10(energy + 1e-9)
    floor, top = np.percentile(db, 10), np.percentile(db, 95)
    if top - floor < 12:
        raise ValueError("I can't hear speech clearly. Move closer to the tablet and read again.")
    voiced = db > floor + 0.35 * (top - floor)
    idx = np.flatnonzero(voiced)
    span = voiced[idx[0]:idx[-1] + 1]                     # from first to last spoken frame
    pause = float(1 - span.mean())
    # long pauses: silent runs over 0.5 s inside the speech span
    runs, cur = [], 0
    for v in span:
        if not v:
            cur += 1
        elif cur:
            runs.append(cur)
            cur = 0
    long_pauses = sum(1 for r in runs if r * 0.01 > 0.5)
    # syllable nuclei: peaks of the smoothed loudness envelope, at least 0.1 s apart and clearly above the dips
    env = np.convolve(db, np.ones(5) / 5, "same")
    peaks, last = 0, -100
    for i in range(2, len(env) - 2):
        if voiced[i] and env[i] == env[i - 2:i + 3].max() and env[i] - env[max(0, i - 12):i + 13].min() > 3 and i - last >= 10:
            peaks += 1
            last = i
    dur = len(span) * 0.01
    pitches = [p for i in idx[::3] if (p := _pitch(frames[i], sr))]
    if len(pitches) < 5:
        raise ValueError("I couldn't find a steady voice. Read the passage again in a normal voice.")
    semis = 12 * np.log2(np.array(pitches) / np.median(pitches))
    med = float(np.median(pitches))
    if (float(np.std(semis)) < 0.3 and peaks < 0.5 * dur) or med >= 390 or med <= 77:
        raise ValueError("That sounded like a steady tone, not speech. Read the passage aloud.")
    return {"rate": round(peaks / dur, 2), "pause": round(pause, 3), "long_pauses": long_pauses,
            "pitch": round(float(np.median(pitches)), 1), "pitch_var": round(float(np.std(semis)), 2),
            "seconds": round(dur, 1)}


def baseline(who: str) -> tuple[dict, int]:
    rows = [r["value"] for r in store.live_readings(who) if r["indicator"] == "voice"]
    if len(rows) < 3:
        return {k: PRIOR[k] for k in PRIOR}, len(rows)
    out = {}
    for k in PRIOR:
        v = np.array([r[k] for r in rows[-30:]], float)
        out[k] = (float(np.median(v)), max(float(np.median(np.abs(v - np.median(v)))) * 1.4826, PRIOR[k][1] / 2))
    return out, len(rows)


def assess(who: str, f: dict, save: bool = True) -> dict:
    base, n = baseline(who)
    z = {k: (f[k] - base[k][0]) / base[k][1] for k in base}
    signs = []
    if z["rate"] <= -1.5:
        signs.append("speaking more slowly than usual")
    if z["pause"] >= 1.5:
        signs.append("more pauses than usual")
    if z["pitch_var"] <= -1.5:
        signs.append("flatter voice than usual")
    status = "amber" if len(signs) >= 2 else "green"
    if status == "amber":
        msg = f"Your voice shows signs of tiredness ({', '.join(signs)}). Take it easy on critical tasks today and rest if you can."
    elif signs:
        msg = f"One small change ({signs[0]}). Nothing to act on alone."
    else:
        msg = "Your voice sounds like your usual self."
    if save and who:
        store.add_readings(who, {"voice": f}, "voice check")
    learning = n < 3
    return {"ok": True, "features": f, "z": {k: round(v, 2) for k, v in z.items()}, "signs": signs, "status": status,
            "message": msg + (f" TRIX is still learning your normal voice ({n + 1 if save else n} of 3 recordings)." if learning else ""),
            "baseline": "personal" if not learning else "typical adult (learning yours)",
            "note": "Screening signal only. Audio is analysed on board and not kept."}


def analyse(who: str, wav: bytes, save: bool = True) -> dict:
    try:
        x, sr = read_wav(wav)
        f = features(x, sr)
    except (ValueError, wave.Error, EOFError) as e:
        return {"ok": False, "message": str(e) if isinstance(e, ValueError) and str(e) else "Could not read the recording. Please try again."}
    return assess(who, f, save)
