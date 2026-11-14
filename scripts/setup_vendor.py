"""Download the on-device MediaPipe models into web/vendor so the face and body checks work with no internet.

Needs npm (comes with Node.js). Run once:  python scripts/setup_vendor.py
Without this step the app loads the same files from the jsDelivr CDN when online.
"""
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKGS = {"face_mesh": "@mediapipe/face_mesh@0.4.1633559619", "pose": "@mediapipe/pose@0.5.1675469404"}
SKIP = {"pose_landmark_heavy.tflite"}  # 27 MB, not used (TRIX uses the lite model)


def main():
    out = ROOT / "web" / "vendor" / "mediapipe"
    with tempfile.TemporaryDirectory() as tmp:
        for name, spec in PKGS.items():
            subprocess.run(["npm", "pack", spec, "--silent"], cwd=tmp, check=True, capture_output=True)
            tgz = next(Path(tmp).glob(f"mediapipe-{name.replace('_', '_')}*.tgz"))
            dest = out / name
            shutil.rmtree(dest, ignore_errors=True)
            dest.mkdir(parents=True)
            with tarfile.open(tgz) as t:
                for m in t.getmembers():
                    fname = Path(m.name).name
                    if m.isfile() and fname not in SKIP:
                        with t.extractfile(m) as src, open(dest / fname, "wb") as f:
                            shutil.copyfileobj(src, f)
            tgz.unlink()
            print(f"{name}: {sum(p.stat().st_size for p in dest.iterdir()) / 1e6:.1f} MB -> {dest}")


if __name__ == "__main__":
    main()
