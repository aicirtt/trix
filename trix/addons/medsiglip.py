"""MedSigLIP skin screening (optional add-on).

Google's MedSigLIP (google/medsiglip-448) is a medical image-text model. TRIX uses it zero-shot: it scores a skin
photo against a short list of plain descriptions and shows the top matches as a screening hint for the crew medical
officer. It is not a diagnosis. The model is gated on Hugging Face: accept its licence, run `huggingface-cli login`,
then `python scripts/setup_addons.py --medsiglip`.
"""
import os
from functools import lru_cache

MODEL_ID = os.environ.get("TRIX_MEDSIGLIP", "google/medsiglip-448")
LABELS = {
    "healthy skin": "a photo of healthy skin",
    "rash": "a photo of a red skin rash",
    "cold sore": "a photo of a cold sore blister on the lip",
    "cut or scrape": "a photo of a cut or scrape on the skin",
    "burn": "a photo of a skin burn",
    "dry, irritated skin": "a photo of dry irritated skin (dermatitis)",
}


def available() -> tuple[bool, str]:
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
    except ImportError:
        return False, "PyTorch and transformers are not installed (run scripts/setup_addons.py --medsiglip)."
    try:
        from huggingface_hub import try_to_load_from_cache
        if try_to_load_from_cache(MODEL_ID, "config.json") is None:
            return False, "MedSigLIP is not downloaded yet (run scripts/setup_addons.py --medsiglip)."
    except Exception as e:  # noqa: BLE001
        return False, f"Cannot check the model cache: {e}"
    return True, "ready"


@lru_cache(maxsize=1)
def _model():
    from transformers import AutoModel, AutoProcessor
    return AutoModel.from_pretrained(MODEL_ID).eval(), AutoProcessor.from_pretrained(MODEL_ID)


def screen(bgr_image) -> dict:
    ok, why = available()
    if not ok:
        return {"ok": False, "message": why}
    import cv2
    import torch
    from PIL import Image
    model, proc = _model()
    img = Image.fromarray(cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)).resize((448, 448))
    inputs = proc(text=list(LABELS.values()), images=[img], padding="max_length", return_tensors="pt")
    with torch.no_grad():
        probs = model(**inputs).logits_per_image.softmax(dim=1)[0].tolist()
    ranked = sorted(zip(LABELS, probs), key=lambda x: -x[1])
    return {"ok": True, "model": MODEL_ID, "top": [{"label": k, "p": round(p, 3)} for k, p in ranked[:3]],
            "note": "Screening hint for the crew medical officer, not a diagnosis."}
