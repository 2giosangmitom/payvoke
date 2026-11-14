# Word timestamps for the song, so the lyrics can follow the vocal.
#
#   uv run --with faster-whisper --with nvidia-cublas-cu12 --with nvidia-cudnn-cu12 \
#     python scripts/transcribe.py ../frontend/public/audio/a-litte-idea.opus scripts/words.json
#   node scripts/align-lyrics.mjs scripts/words.json
#
# Falls back to the CPU when CUDA is not available (slower, same output).
import json
import subprocess
import sys

import numpy as np


def preload_cuda():
    """Load cuBLAS/cuDNN from the pip `nvidia-*` wheels, which are not on the
    loader path, so CTranslate2 finds them."""
    import ctypes
    import glob
    import os

    try:
        import nvidia
    except ImportError:
        return
    for root in nvidia.__path__:
        for pattern in ("cublas/lib/libcublasLt.so.*", "cublas/lib/libcublas.so.*", "cudnn/lib/libcudnn*.so.*"):
            for lib in sorted(glob.glob(os.path.join(root, pattern))):
                try:
                    ctypes.CDLL(lib, mode=ctypes.RTLD_GLOBAL)
                except OSError:
                    pass


preload_cuda()

from faster_whisper import WhisperModel  # noqa: E402

src, target = sys.argv[1], sys.argv[2]
prompt = "Lyrics: I was stuck with an idea in my head. Payvoke. Powered by Avalanche."

try:
    model = WhisperModel("medium.en", device="cuda", compute_type="int8_float16")
except Exception as error:  # no GPU or no CUDA libraries
    print("cpu fallback:", error, flush=True)
    model = WhisperModel("medium.en", device="cpu", compute_type="int8")

# Decode with ffmpeg ourselves: faster-whisper's own decoder depends on a
# PyAV version that drifts.
pcm = subprocess.run(
    ["ffmpeg", "-v", "error", "-i", src, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
    check=True,
    capture_output=True,
).stdout
audio = np.frombuffer(pcm, dtype=np.float32)

segments, _ = model.transcribe(
    audio,
    word_timestamps=True,
    initial_prompt=prompt,
    condition_on_previous_text=False,
)
out = []
for s in segments:
    print(f"{s.start:7.2f} {s.end:7.2f} {s.text}", flush=True)
    out.append(
        {
            "start": s.start,
            "end": s.end,
            "text": s.text,
            "words": [{"w": w.word, "s": w.start, "e": w.end} for w in (s.words or [])],
        }
    )
with open(target, "w") as f:
    json.dump(out, f, indent=1)
