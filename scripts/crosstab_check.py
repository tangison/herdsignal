#!/usr/bin/env python3
"""Cross-tab live sync check: farmer submits in tab A; the vet queue in tab B
must update via the storage event without a reload."""
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = (ROOT / "dist" / "herdsignal.html").as_uri()

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 900, "height": 700})
    f, v = ctx.new_page(), ctx.new_page()
    for pg in (f, v):
        pg.set_default_timeout(8000)
    f.goto(URL)
    f.wait_for_selector("text=Report a sick animal")
    v.goto(URL)
    v.locator(".role-switch button", has_text="Vet").click()
    v.wait_for_selector("text=Cases needing attention")
    before = v.locator("a.v-vet-card").count()
    f.click("text=Report a sick animal")
    f.wait_for_selector("textarea", timeout=6000)
    sp = f.get_by_label(re.compile("animal", re.I)).first
    try:
        sp.select_option(value="goats")
    except Exception:
        sp.select_option(label=re.compile("goats", re.I))
    print("selects after choice:", f.locator("select").evaluate_all(
        "els => els.map(e => e.id + '=' + (e.options[e.selectedIndex] || {text: '?'}).text)"))
    f.locator("input[type=number]").nth(0).fill("2")
    f.get_by_role("button", name=re.compile("not eating", re.I)).first.click()
    f.locator("textarea").first.fill("Cross-tab sync probe case.")
    f.get_by_role("button", name=re.compile("send report", re.I)).first.click()
    try:
        f.wait_for_selector("text=Do this while you wait", timeout=6000)
    except Exception:
        print("SUBMIT DID NOT REACH TRIAGE. Visible form errors:")
        print(f.inner_text("body")[:900].replace("\n", " | "))
        raise
    v.wait_for_timeout(1200)  # no reload — storage event must re-render
    after = v.locator("a.v-vet-card").count()
    goats_new = "Goats" in v.inner_text("body") and after == before + 1
    print(f"vet queue cards before={before} after={after} (no reload) | new goats case in queue: {goats_new}")
    assert after == before + 1, "cross-tab live sync failed"
    print("CROSS-TAB SYNC OK")
    b.close()
