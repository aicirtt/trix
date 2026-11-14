"""EchoNet-Dynamic pumping strength (optional add-on).

EchoNet-Dynamic (Ouyang et al., Nature 2020) estimates left-ventricle ejection fraction (EF) from an apical
4-chamber ultrasound video with an R(2+1)D video network. TRIX feeds it 32 frames (every 2nd frame) at 112x112.
Weights: github.com/echonet/dynamic releases (r2plus1d_18_32_2_pretrained.pt, 250 MB).
Install with `python scripts/setup_addons.py --echonet`. Not validated by the TRIX team: show results to the crew
medical officer as a second opinion only.
"""
from functools import lru_cache
from pathlib import Path

import numpy as np

WEIGHTS = Path(__file__).resolve().parents[2] / "data" / "models" / "r2plus1d_18_32_2_pretrained.pt"
URL = "https://github.com/echonet/dynamic/releases/download/v1.0.0/r2plus1d_18_32_2_pretrained.pt"
FRAMES, PERIOD, SIZE = 32, 2, 112


def available() -> tuple[bool, str]:
    try:
        import torch  # noqa: F401
        import torchvision  # noqa: F401
    except ImportError:
        return False, "PyTorch is not installed (run scripts/setup_addons.py --echonet)."
    if not WEIGHTS.exists():
        return False, "EchoNet weights are not downloaded yet (run scripts/setup_addons.py --echonet)."
    return True, "ready"


def load_clip(path: str) -> np.ndarray:
    """Video file -> float array (3, 32, 112, 112), normalised per clip like EchoNet's training data."""
    import cv2
    cap = cv2.VideoCapture(path)
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(cv2.resize(f, (SIZE, SIZE), interpolation=cv2.INTER_AREA))
    cap.release()
    if len(frames) < 8:
        raise ValueError("The clip is too short: record at least 2 heartbeats (about 3 seconds).")
    v = np.stack(frames).astype(np.float32)[..., ::-1]            # T, H, W, RGB
    idx = np.arange(FRAMES) * PERIOD
    idx = np.minimum(idx, len(v) - 1)
    clip = v[idx].transpose(3, 0, 1, 2)                           # C, T, H, W
    mean = clip.reshape(3, -1).mean(1)[:, None, None, None]
    std = clip.reshape(3, -1).std(1)[:, None, None, None] + 1e-6
    return (clip - mean) / std


@lru_cache(maxsize=1)
def _model():
    import torch
    import torchvision
    m = torchvision.models.video.r2plus1d_18(weights=None)
    m.fc = torch.nn.Linear(m.fc.in_features, 1)
    state = torch.load(WEIGHTS, map_location="cpu")
    state = state.get("state_dict", state)
    m.load_state_dict({k.replace("module.", ""): v for k, v in state.items()})
    return m.eval()


def ejection_fraction(path: str) -> dict:
    ok, why = available()
    if not ok:
        return {"ok": False, "message": why}
    import torch
    clip = torch.from_numpy(load_clip(path)).unsqueeze(0)
    with torch.no_grad():
        ef = float(_model()(clip).item())
    band = "normal (about 50-70%)" if 50 <= ef <= 75 else "lower than normal" if ef < 50 else "higher than usual"
    return {"ok": True, "ef": round(ef, 1), "band": band,
            "message": f"Estimated pumping strength (ejection fraction) {ef:.0f}%: {band}. Show this to the crew medical officer.",
            "note": "EchoNet-Dynamic estimate, second opinion only."}
