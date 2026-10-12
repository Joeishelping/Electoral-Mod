"""Builds the map's colour font: RP/font/glyph_E1.png .. glyph_F0.png.

Each page is 16x16 cells of 16x16 px. Page E1+r holds red level r; in a page the
row is the green level and the column the blue level (level * 16). One glyph is
one solid map pixel - see engine/mapview.js glyph().
"""
from pathlib import Path
from PIL import Image

out = Path(__file__).resolve().parent.parent / "packs/ElectoralRP/font"
out.mkdir(parents=True, exist_ok=True)
for r in range(16):
    img = Image.new("RGBA", (256, 256))
    px = img.load()
    for g in range(16):
        for b in range(16):
            c = (r * 16, g * 16, b * 16, 255)
            for y in range(16):
                for x in range(16):
                    px[b * 16 + x, g * 16 + y] = c
    img.save(out / f"glyph_{0xE1 + r:02X}.png", optimize=True)
print("wrote", len(list(out.glob("glyph_*.png"))), "pages to", out)
