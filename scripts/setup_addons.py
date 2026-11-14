"""Install the optional AI add-ons on the onboard computer (needs internet once).

  python scripts/setup_addons.py --medsiglip   # PyTorch + transformers + MedSigLIP (accept the licence on Hugging Face and run `huggingface-cli login` first)
  python scripts/setup_addons.py --echonet     # PyTorch + torchvision + EchoNet-Dynamic weights (250 MB)
"""
import argparse
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def pip(*pkgs):
    subprocess.run([sys.executable, "-m", "pip", "install", *pkgs], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--medsiglip", action="store_true")
    ap.add_argument("--echonet", action="store_true")
    a = ap.parse_args()
    if not (a.medsiglip or a.echonet):
        ap.print_help()
        return
    if a.medsiglip:
        pip("torch", "transformers", "huggingface_hub", "sentencepiece", "pillow")
        from huggingface_hub import snapshot_download
        from trix.addons import medsiglip
        snapshot_download(medsiglip.MODEL_ID)
        print("MedSigLIP ready:", medsiglip.available())
    if a.echonet:
        pip("torch", "torchvision")
        from trix.addons import echonet
        echonet.WEIGHTS.parent.mkdir(parents=True, exist_ok=True)
        if not echonet.WEIGHTS.exists():
            print("Downloading EchoNet-Dynamic weights (250 MB)...")
            urllib.request.urlretrieve(echonet.URL, echonet.WEIGHTS)
        print("EchoNet ready:", echonet.available())


if __name__ == "__main__":
    main()
