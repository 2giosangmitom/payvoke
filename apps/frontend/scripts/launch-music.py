"""Instrumental bed for the launch video, synthesised so it has no licence.

100 BPM, Fmaj7 - Am7 - Cmaj7 - G6, warm pads, sub bass, a soft pluck arpeggio
and light drums. Sections: intro (pads), groove (+ drums, arp), break (pads
and arp), lift (everything), outro (pads fade). Writes
remotion-public/launch/music.wav (48 kHz stereo) and the bar grid to
src/remotion/launch/music.json so cuts can land on the beat.

    uv run --with numpy --with scipy python scripts/launch-music.py   # from apps/frontend
"""

import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parent.parent
SR = 48_000
BPM = 100
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(3)

# Bars per section; 2.4 s a bar.
SECTIONS = [("intro", 4), ("groove", 16), ("break", 8), ("lift", 28), ("groove", 20), ("outro", 10)]
BARS = sum(n for _, n in SECTIONS)
N = int(BARS * BAR * SR) + SR * 4

CHORDS = [  # MIDI notes
    [41, 57, 60, 64, 69],  # Fmaj7
    [45, 57, 60, 64, 67],  # Am7
    [48, 55, 59, 64, 67],  # Cmaj7
    [43, 55, 59, 62, 64],  # G6
]


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def lowpass(x, cutoff, order=2):
    return sosfilt(butter(order, cutoff, fs=SR, output="sos"), x)


def highpass(x, cutoff, order=2):
    return sosfilt(butter(order, cutoff, "high", fs=SR, output="sos"), x)


def env(n, a, r, sustain=1.0):
    e = np.full(n, sustain)
    ai, ri = int(a * SR), int(r * SR)
    e[:ai] = np.linspace(0, sustain, ai)
    if ri:
        e[-ri:] *= np.linspace(1, 0, ri)
    return e


def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    ph = rng.random()
    return 2 * ((t * f * (1 + detune) + ph) % 1) - 1


def section_at(bar):
    for name, count in SECTIONS:
        if bar < count:
            return name
        bar -= count
    return "outro"


left, right = np.zeros(N), np.zeros(N)


def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    j = min(N, i + len(sig))
    left[i:j] += sig[: j - i] * gain * (1 - max(0, pan))
    right[i:j] += sig[: j - i] * gain * (1 + min(0, pan))


grid = []
for bar in range(BARS):
    name = section_at(bar)
    t0 = bar * BAR
    grid.append({"bar": bar, "t": round(t0, 4), "section": name})
    chord = CHORDS[bar % 4]
    # Pad: detuned saws, low-passed, slow attack.
    n = int(BAR * SR * 1.15)
    pad = sum(saw(hz(note), n, d) for note in chord[1:] for d in (-0.004, 0.004))
    pad = lowpass(pad, 1400 if name in ("lift",) else 900) * env(n, 0.6, 0.9, 1.0)
    pad_gain = {"intro": 0.05, "groove": 0.045, "break": 0.06, "lift": 0.05, "outro": 0.05}[name]
    add(pad, t0, pad_gain, -0.15)
    add(np.roll(pad, 600), t0, pad_gain, 0.15)
    # Sub bass on beats 1 and 3 (sine plus a little second harmonic).
    if name not in ("intro", "break", "outro"):
        for beat in (0, 2, 2.5):
            nb = int(BEAT * 0.95 * SR)
            tt = np.arange(nb) / SR
            f = hz(chord[0] - 12 + 12)
            b = np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(4 * np.pi * f * tt)
            add(b * env(nb, 0.01, 0.2), t0 + beat * BEAT, 0.16)
    # Pluck arpeggio in eighths.
    if name in ("groove", "break", "lift"):
        pattern = [1, 2, 3, 4, 3, 2, 4, 3]
        for k, idx in enumerate(pattern):
            nb = int(0.5 * SR)
            tt = np.arange(nb) / SR
            f = hz(chord[idx] + 12)
            p = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(6 * np.pi * f * tt)) * np.exp(-tt * 9)
            add(p, t0 + k * BEAT / 2, 0.045 if name != "lift" else 0.055, 0.35 if k % 2 else -0.35)
    # Drums.
    if name in ("groove", "lift"):
        for beat in range(4):
            if beat in (0, 2):  # soft kick
                nb = int(0.35 * SR)
                tt = np.arange(nb) / SR
                f = 120 * np.exp(-tt * 30) + 45
                k = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9)
                add(k, t0 + beat * BEAT, 0.33)
            if beat in (1, 3):  # rim/clap: filtered noise
                nb = int(0.18 * SR)
                c = highpass(rng.standard_normal(nb), 1500) * np.exp(-np.arange(nb) / SR * 28)
                add(c, t0 + beat * BEAT, 0.045 if name == "groove" else 0.06, 0.1)
        for h in range(8):  # hats
            nb = int(0.06 * SR)
            hat = highpass(rng.standard_normal(nb), 7000) * np.exp(-np.arange(nb) / SR * 70)
            add(hat, t0 + h * BEAT / 2, 0.03 if h % 2 else 0.018, -0.2)

# Gentle swell into each section, a little room, and a master limiter.
mix = np.stack([left, right])
room = np.zeros_like(mix)
for delay, g in ((0.031, 0.25), (0.067, 0.18), (0.113, 0.12), (0.173, 0.08)):
    d = int(delay * SR)
    room[:, d:] += mix[:, :-d] * g
mix = mix + lowpass(room, 4000)
end = BARS * BAR
t = np.arange(N) / SR
mix *= np.clip((end + 2 - t) / 6, 0, 1)  # outro fade
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
mix /= np.abs(mix).max() / 0.8

out = ROOT / "remotion-public/launch/music.wav"
out.parent.mkdir(parents=True, exist_ok=True)
wavfile.write(out, SR, (mix.T * 32767).astype(np.int16))
(ROOT / "src/remotion/launch/music.json").write_text(
    json.dumps({"bpm": BPM, "bar": BAR, "bars": grid}, indent=1) + "\n"
)
print(f"{out} {N / SR:.1f}s, {BARS} bars")
