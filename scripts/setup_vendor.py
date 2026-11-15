"""Download the on-device MediaPipe models, three.js and the 3D avatar models into web/vendor so the app works with no internet.

Needs npm (comes with Node.js). Run once:  python scripts/setup_vendor.py
Without this step the app loads the same files from public CDNs when online.

Avatar model: readyplayer.me.glb from the three.js examples (a Ready Player Me avatar; the repository
is MIT-licensed). It is downloaded, not committed.
"""
import urllib.request
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
            subprocess.run([shutil.which("npm") or "npm", "pack", spec, "--silent"], cwd=tmp, check=True, capture_output=True)
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


THREE = "three@0.170.0"
THREE_FILES = {"build/three.module.min.js": "three.module.min.js", "examples/jsm/loaders/GLTFLoader.js": "addons/GLTFLoader.js",
               "examples/jsm/utils/BufferGeometryUtils.js": "utils/BufferGeometryUtils.js", "examples/jsm/utils/SkeletonUtils.js": "addons/SkeletonUtils.js",
               "examples/jsm/controls/OrbitControls.js": "addons/OrbitControls.js"}
MODELS = ["readyplayer.me"]
MODEL_URL = "https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/{}.glb"


def three():
    """three.js + the loaders the avatar uses; bare 'three' imports are rewritten to a relative path (no import map needed)."""
    out = ROOT / "web" / "vendor" / "three"
    shutil.rmtree(out, ignore_errors=True)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([shutil.which("npm") or "npm", "pack", THREE, "--silent"], cwd=tmp, check=True, capture_output=True)
        with tarfile.open(next(Path(tmp).glob("three-*.tgz"))) as t:
            for src, dst in THREE_FILES.items():
                data = t.extractfile(f"package/{src}").read().decode()
                if dst != "three.module.min.js":
                    data = data.replace("from 'three'", "from '../three.module.min.js'")
                    data = data.replace("from '../utils/BufferGeometryUtils.js'", "from '../utils/BufferGeometryUtils.js'")
                f = out / dst
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text(data)
    print(f"three: {sum(p.stat().st_size for p in out.rglob('*') if p.is_file()) / 1e6:.1f} MB -> {out}")
    av = ROOT / "web" / "vendor" / "avatar"
    av.mkdir(parents=True, exist_ok=True)
    for m in MODELS:
        urllib.request.urlretrieve(MODEL_URL.format(m), av / f"{m}.glb")
    print(f"avatar models: {', '.join(MODELS)} -> {av}")


if __name__ == "__main__":
    main()
    three()
