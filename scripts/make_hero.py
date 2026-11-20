#!/usr/bin/env python3
"""Crop/optimize the two hero photographs and emit app/hero.js with base64
image data URIs so the single-file build stays fully offline.
Photos: StockCake free stock photography (assets/hero-a.jpg, hero-b.jpg)."""
import base64
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "hero-a.jpg"
OUT = ROOT / "app" / "hero.js"

im = Image.open(SRC).convert("RGB")
w, h = im.size  # 1456x816
# Banner crop: keep the herd band (middle ~62% of height), 2.9:1
crop_top, crop_bottom = int(h * 0.26), int(h * 0.88)
im = im.crop((0, crop_top, w, crop_bottom))
target_w = 880
im = im.resize((target_w, int(im.height * target_w / im.width)), Image.LANCZOS)
im.save(ROOT / "assets" / "hero-opt.jpg", quality=70, optimize=True, progressive=True)

data = base64.b64encode(Path(ROOT / "assets" / "hero-opt.jpg").read_bytes()).decode()

# Second photograph for the About page: the golden-hour waterhole (hero-b).
im2 = Image.open(ROOT / "assets" / "hero-b.jpg").convert("RGB")
w2, h2 = im2.size
im2 = im2.crop((0, int(h2 * 0.30), w2, int(h2 * 0.88)))
target_w2 = 900
im2 = im2.resize((target_w2, int(im2.height * target_w2 / im2.width)), Image.LANCZOS)
im2.save(ROOT / "assets" / "hero2-opt.jpg", quality=70, optimize=True, progressive=True)
data2 = base64.b64encode(Path(ROOT / "assets" / "hero2-opt.jpg").read_bytes()).decode()

OUT.write_text(
    "/* Hero photographs: cattle herds at savanna waterholes (Namibia setting).\n"
    "   Sourced via image-search, rehosted copies inlined as base64 so the demo\n"
    "   stays fully offline. Origin: StockCake free stock photography;\n"
    "   source copies ship in assets/hero-a.jpg and assets/hero-b.jpg. */\n"
    "window.HS_HERO = 'data:image/jpeg;base64," + data + "';\n"
    "window.HS_HERO2 = 'data:image/jpeg;base64," + data2 + "';\n",
    encoding="utf-8",
)
kb = OUT.stat().st_size / 1024
print(f"hero-opt.jpg: {im.size}, file {Path('/home/z/my-project/scripts/assets/hero-opt.jpg').stat().st_size/1024:.1f} KB; hero2-opt.jpg: {im2.size}, file {Path('/home/z/my-project/scripts/assets/hero2-opt.jpg').stat().st_size/1024:.1f} KB; hero.js {kb:.1f} KB")
