#!/usr/bin/env python3
"""Assemble the HerdSignal single-file build.

Reads herdsignal/index.html and inlines every <link rel="stylesheet"> and
<script src="..."> it references into one self-contained HTML file written to
dist/herdsignal.html. Fails loudly if a referenced asset is missing or if
any asset contains a closing tag sequence that would break inlining.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist' / 'herdsignal.html'

def main() -> int:
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    def inline_style(match: re.Match) -> str:
        rel = match.group(1)
        path = ROOT / rel
        css = path.read_text(encoding="utf-8")
        assert "</style" not in css.lower(), f"closing style tag inside {rel}"
        return "<style>\n/* ==== inlined from " + rel + " ==== */\n" + css + "\n</style>"

    def inline_script(match: re.Match) -> str:
        rel = match.group(1)
        path = ROOT / rel
        js = path.read_text(encoding="utf-8")
        assert "</script" not in js.lower(), f"closing script tag inside {rel}"
        return "<script>\n/* ==== inlined from " + rel + " ==== */\n" + js + "\n</script>"

    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_style, html)
    html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)

    leftover = re.findall(r'(?:<link rel="stylesheet"|<script src=)', html)
    assert not leftover, f"uninlined references remain: {leftover}"

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    size = OUT.stat().st_size
    print(f"assembled {OUT} ({size} bytes, {size/1024:.1f} KB)")
    assert size < 500 * 1024, "single file exceeds the 500 KB budget"
    return 0

if __name__ == "__main__":
    sys.exit(main())
