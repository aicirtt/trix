"""Voice logging: turn what an astronaut says into readings.

Speech-to-text runs on the tablet: the browser's speech recognition when available, or faster-whisper on the
onboard computer (offline) when it is installed. This module parses the transcript, so it works with either.
"""
import re

ONES = {"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
        "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
        "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19}
TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90}
_NUMWORD = "|".join(list(ONES) + list(TENS) + ["hundred", "a"])


def _words_to_number(m: re.Match) -> str:
    """'one hundred twenty' -> '120', 'ninety seven' -> '97', 'thirty six' -> '36'."""
    total, cur = 0, 0
    for w in m.group(0).split():
        if w in ONES:
            cur += ONES[w]
        elif w in TENS:
            cur += TENS[w]
        elif w == "hundred":
            cur = (cur or 1) * 100
        elif w == "a":
            cur = cur or 1
    return f" {total + cur} "
NUM = r"(\d+(?:\.\d+)?)"

# (indicator, patterns) - the first number after the phrase is the value
PATTERNS = [
    ("bp", [rf"(?:blood pressure|bp|pressure)\D{{0,20}}?{NUM}\s*(?:over|/|and)\s*{NUM}"]),
    ("hr", [rf"(?:heart ?rate|pulse|hr|heartbeat)\D{{0,15}}?{NUM}"]),
    ("spo2", [rf"(?:oxygen|spo2|sp o2|saturation|sats)\D{{0,15}}?{NUM}"]),
    ("temp", [rf"(?:temperature|temp|fever of)\D{{0,15}}?{NUM}"]),
    ("glucose", [rf"(?:blood sugar|glucose|sugar)\D{{0,15}}?{NUM}"]),
    ("sleep", [rf"slept\D{{0,10}}?{NUM}(?:\s*(?:and a half|\.5))?", rf"sleep\D{{0,15}}?{NUM}"]),
    ("mood", [rf"mood\D{{0,15}}?{NUM}"]),
    ("fatigue", [rf"(?:fatigue|tiredness|tired)\D{{0,15}}?{NUM}"]),
    ("fluid", [rf"(?:drank|drink|water|fluid)\D{{0,15}}?{NUM}\s*(?:ml|millilit|milliliters|l\b|litre|liter)?"]),
    ("hrv", [rf"(?:hrv|variability)\D{{0,15}}?{NUM}"]),
]
SYMPTOM_WORDS = ("pain", "headache", "dizzy", "nause", "rash", "tingl", "numb", "short of breath", "breathless",
                 "chest", "blurry", "blur", "cough", "itch", "lonely", "stress", "tired", "fever", "vomit", "sore")


def _norm(text: str) -> str:
    t = " " + text.lower().replace(",", " ").replace("percent", "").replace("%", "") + " "
    t = re.sub(r"\b(\d+) point (\d+)\b", r"\1.\2", t)
    t = re.sub(rf"\b(?:(?:{'|'.join(list(ONES) + list(TENS))}|hundred)\b\s*(?:and\s+(?=(?:{'|'.join(list(ONES) + list(TENS))})\b))?)+",
               _words_to_number, t)
    t = re.sub(r"\b(\d+)\s+point\s+(\d+)\b", r"\1.\2", t)
    t = re.sub(r"\b(\d+) and a half\b", lambda m: str(int(m.group(1)) + 0.5), t)
    return t


def parse(text: str) -> dict:
    """'Heart rate 72, blood pressure 118 over 76, slept 6 and a half hours' -> readings + symptoms."""
    t = _norm(text)
    out: dict = {}
    for ind, pats in PATTERNS:
        for p in pats:
            m = re.search(p, t)
            if not m:
                continue
            if ind == "bp":
                out["sys"], out["dia"] = float(m.group(1)), float(m.group(2))
            else:
                v = float(m.group(1))
                if ind == "fluid" and re.search(rf"{re.escape(m.group(1))}\s*(l\b|litre|liter)", t):
                    v *= 1000
                if ind == "temp" and v > 50:  # said in Fahrenheit
                    v = round((v - 32) * 5 / 9, 1)
                out[ind] = v
            break
    if "irregular" in t or "skipping" in t or "flutter" in t:
        out["irregular_rhythm"] = 1
    symptoms = [w.strip() for w in re.split(r"[;,]|\.(?!\d)| and | but ", text)
                if any(k in w.lower() for k in SYMPTOM_WORDS)]
    return {"readings": {k: (int(v) if isinstance(v, float) and v.is_integer() else v) for k, v in out.items()},
            "symptoms": "; ".join(symptoms), "transcript": text.strip()}


def transcribe(audio_path: str) -> dict:
    """Offline speech-to-text with faster-whisper if installed (model 'base.en' cached on first use)."""
    try:
        from faster_whisper import WhisperModel  # optional dependency
    except ImportError:
        return {"ok": False, "error": "faster-whisper is not installed on this computer. Use the tablet's speech "
                "button, or install it with: pip install faster-whisper"}
    try:
        model = WhisperModel("base.en", device="cpu", compute_type="int8")
        segs, _ = model.transcribe(audio_path, beam_size=1)
        return {"ok": True, "text": " ".join(s.text for s in segs).strip()}
    except Exception as e:  # model not downloaded yet, bad audio...
        return {"ok": False, "error": f"Speech model could not run: {e}"}
