"""Render Payvoke's Osaka Jade pixel field as a local, deterministic hero image.

Omarchy's homepage uses a live canvas, not a downloadable background image.
This asset adapts its ordered-dither pixel language and DESIGN.md palette for
Payvoke's static first paint. The interactive wordmark is rendered separately.
"""

from math import cos, hypot, sin
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw


WIDTH, HEIGHT = 1920, 1120
CELL = 12
BACKGROUND = "#090f0d"
DIM = "#1e372c"
MID = "#35614d"
LIT = "#509475"

BAYER = (
    (0, 48, 12, 60, 3, 51, 15, 63),
    (32, 16, 44, 28, 35, 19, 47, 31),
    (8, 56, 4, 52, 11, 59, 7, 55),
    (40, 24, 36, 20, 43, 27, 39, 23),
    (2, 50, 14, 62, 1, 49, 13, 61),
    (34, 18, 46, 30, 33, 17, 45, 29),
    (10, 58, 6, 54, 9, 57, 5, 53),
    (42, 26, 38, 22, 41, 25, 37, 21),
)


def render() -> None:
    rng = Random(0x509475)
    canvas = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(canvas)

    for row in range((HEIGHT + CELL - 1) // CELL):
        for col in range((WIDTH + CELL - 1) // CELL):
            x = (col + 0.5) * CELL / WIDTH
            y = (row + 0.5) * CELL / HEIGHT

            # Broad ink clouds and a quiet center leave room for the wordmark.
            swells = (
                0.52
                + 0.21 * sin(x * 15.5 + sin(y * 7.8) * 2.2)
                + 0.16 * cos(y * 16.2 - x * 7.8)
                + 0.11 * sin((x + y) * 24.5)
            )
            edge = min(1.0, hypot((x - 0.5) * 1.32, (y - 0.46) * 1.05))
            lower = max(0.0, y - 0.48) * 0.2
            density = max(0.0, swells * (0.20 + edge * 0.62 + lower))
            threshold = 0.76 * (BAYER[row % 8][col % 8] + 0.5) / 64
            threshold += 0.24 * rng.random()
            if density <= threshold:
                continue

            # Squares touch the lattice; one-pixel seams give a printed feel.
            ink = LIT if density - threshold > 0.36 else MID if density - threshold > 0.17 else DIM
            left, top = col * CELL, row * CELL
            draw.rectangle((left, top, left + CELL - 2, top + CELL - 2), fill=ink)

    target = Path(__file__).resolve().parents[1] / "public/images/payvoke-hero-field.webp"
    canvas.save(target, "WEBP", quality=88, method=6)
    print(f"Wrote {target} ({target.stat().st_size:,} bytes)")


if __name__ == "__main__":
    render()
