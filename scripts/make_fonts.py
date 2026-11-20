#!/usr/bin/env python3
"""Download Figtree (400/600/800, latin) woff2 from Google Fonts and emit
app/fonts.css with base64 @font-face rules so the single-file build stays
offline. Figtree is licensed under the SIL Open Font License."""
import base64
import re
from pathlib import Path
from urllib.request import Request, urlopen

CSS_URL = ("https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;800"
           "&display=swap")
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")  # woff2-capable UA

req = Request(CSS_URL, headers={"User-Agent": UA})
css = urlopen(req, timeout=60).read().decode()

# Keep only latin subsets (unicode-range containing U+0000-00FF)
blocks = re.findall(r"/\* ([a-z-]+) \*/\s*(@font-face \{[^}]+\})", css)
faces = []
seen = set()
for subset, block in blocks:
    if subset != "latin":
        continue
    weight = re.search(r"font-weight: (\d+)", block).group(1)
    if weight in seen:
        continue
    seen.add(weight)
    url = re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1)
    data = urlopen(Request(url, headers={"User-Agent": UA}), timeout=60).read()
    b64 = base64.b64encode(data).decode()
    faces.append(
        "@font-face {\n"
        "  font-family: 'Figtree';\n"
        "  font-style: normal;\n"
        f"  font-weight: {weight};\n"
        "  font-display: swap;\n"
        f"  src: url(data:font/woff2;base64,{b64}) format('woff2');\n"
        "  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2013-2014, "
        "U+2018-201A, U+201C-201E, U+2022, U+2026, U+2019, U+00A0-00FF;\n"
        "}"
    )
    print(f"weight {weight}: {len(data)/1024:.1f} KB")

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / "app" / "fonts.css"
out.write_text(
    "/* Figtree (OFL) — latin subsets, embedded base64 for offline delivery. */\n"
    + "\n".join(faces) + "\n",
    encoding="utf-8",
)
print(f"fonts.css: {out.stat().st_size/1024:.1f} KB, {len(faces)} faces")
