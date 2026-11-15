"""Narration for the launch video (src/remotion/launch).

Reads src/remotion/launch/script.json, speaks each beat's `say` text with
VieNeu-TTS, speeds it up with ffmpeg's atempo (pitch kept), normalises the
loudness and writes remotion-public/launch/vo/<id>.wav. Line lengths go to
src/remotion/launch/narration.json, which sets the video's timeline. Lines
whose text, voice and tempo did not change are not spoken again.

    uv run --python 3.12 --with vieneu python scripts/launch-voice.py   # from apps/frontend
"""

import hashlib
import json
import subprocess
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "src/remotion/launch/script.json"
TIMING = ROOT / "src/remotion/launch/narration.json"
OUT = ROOT / "remotion-public/launch/vo"


def seconds(path: Path) -> float:
    with wave.open(str(path)) as file:
        return file.getnframes() / file.getframerate()


def main() -> None:
    script = json.loads(SCRIPT.read_text())
    voice, tempo = script["voice"], script["tempo"]
    OUT.mkdir(parents=True, exist_ok=True)
    old = json.loads(TIMING.read_text()) if TIMING.exists() else {"lines": {}}
    only = set(sys.argv[1:])
    tts = speaker = None
    lines = {}
    beats = script["beats"]
    for line in beats:
        key = hashlib.sha1(f"{voice}|{tempo}|{line['say']}".encode()).hexdigest()[:12]
        target = OUT / f"{line['id']}.wav"
        cached = old["lines"].get(line["id"])
        if cached and cached["key"] == key and target.exists() and line["id"] not in only:
            lines[line["id"]] = cached
            continue
        if tts is None:
            from vieneu import Vieneu

            tts = Vieneu()
            speaker = tts.get_preset_voice(voice)
        raw = OUT / f"{line['id']}.raw.wav"
        tts.save(tts.infer(text=line["say"], voice=speaker), str(raw))
        # Faster, trimmed at both ends, at -16 LUFS like spoken-word video.
        subprocess.run(
            [
                "ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-af",
                f"silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
                f"silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
                f"atempo={tempo},loudnorm=I=-16:TP=-1.5:LRA=11",
                "-ar", "48000", "-ac", "1", str(target),
            ],
            check=True,
        )
        raw.unlink()
        lines[line["id"]] = {"key": key, "seconds": round(seconds(target), 3)}
        print(f"{line['id']:8s} {lines[line['id']]['seconds']:5.2f}s  {line['text']}", flush=True)
    # Drop clips of beats that left the script.
    for stale in OUT.glob("*.wav"):
        if stale.stem not in lines:
            stale.unlink()
    TIMING.write_text(json.dumps({"voice": voice, "tempo": tempo, "lines": lines}, indent=2) + "\n")
    total = sum(line["seconds"] for line in lines.values())
    print(f"{len(lines)} lines, {total:.1f}s of speech")


if __name__ == "__main__":
    main()
