#!/usr/bin/env python3
"""Capture HerdSignal UI evidence for the visual-verification receipt.
Walks the real flows in headless Chromium at desktop + mobile sizes and saves
PNG captures (hashed later by the receipt builder). Usage:
    python3 scripts/capture_ui.py before|after
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

from playwright.sync_api import sync_playwright

FILE_URL = (ROOT / "dist" / "herdsignal.html").as_uri()
OUT = ROOT / "evidence"
OUT.mkdir(parents=True, exist_ok=True)
TAG = sys.argv[1] if len(sys.argv) > 1 else "after"
log = []


def cap(page, name):
    # Evidence hygiene: clear transient toasts and unstick the header so
    # full-page stitching does not paint it mid-scroll (capture-only style).
    page.evaluate("""() => {
      const t = document.getElementById('toaster');
      if (t) t.innerHTML = '';
      if (!document.getElementById('cap-style')) {
        const s = document.createElement('style');
        s.id = 'cap-style';
        s.textContent = '.app-header { position: static !important; } ' +
          '*, *::before, *::after { animation-duration: 0.01ms !important; ' +
          'transition-duration: 0.01ms !important; }';;
        document.head.appendChild(s);
      }
    }""")
    path = OUT / f"{TAG}-{name}.png"
    page.screenshot(path=str(path), full_page=True)
    log.append(f"captured {path.name} {page.viewport_size}")


def attempt(name, fn):
    try:
        fn()
        log.append(f"OK {name}")
    except Exception as exc:  # noqa: BLE001
        log.append(f"FAIL {name}: {type(exc).__name__} {str(exc)[:160]}")


def fill_report(page):
    page.click("text=Report a sick animal")
    page.wait_for_selector("textarea", timeout=6000)
    # species
    sel = page.get_by_label(re.compile("animal", re.I)).first
    try:
        sel.select_option(value="cattle")
    except Exception:
        sel.select_option(label=re.compile("cattle", re.I))
    # counts
    for pattern, val in ((r"\bsick\b", "3"), (r"\bdead\b", "1"), (r"at risk", "5")):
        loc = page.get_by_label(re.compile(pattern, re.I)).first
        if loc.count():
            loc.fill(val)
    nums = page.locator("input[type=number]")
    if nums.count() >= 4:
        nums.nth(0).fill("3"); nums.nth(1).fill("1"); nums.nth(2).fill("5"); nums.nth(3).fill("2")
    elif nums.count() == 1:
        nums.first.fill("2")
    page.get_by_role("button", name=re.compile("salivating", re.I)).first.click()
    page.get_by_role("button", name=re.compile("not eating", re.I)).first.click()
    page.locator("textarea").first.fill("Two oxen drooling thick saliva and refusing feed since yesterday.")
    # duration unit if present
    unit = page.get_by_label(re.compile("unit|days or|how long", re.I))
    if unit.count():
        try:
            unit.first.select_option(value="days")
        except Exception:
            pass


def submit(page):
    page.get_by_role("button", name=re.compile("send|submit|report it|report now", re.I)).first.click()
    page.wait_for_selector("text=Do this while you wait", timeout=6000)


def role(page, name):
    page.locator(".role-switch button", has_text=re.compile(name, re.I)).first.click()
    page.wait_for_timeout(500)


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        d = browser.new_context(viewport={"width": 1024, "height": 800})
        m = browser.new_context(viewport={"width": 360, "height": 740})
        pd, pm = d.new_page(), m.new_page()
        for pg in (pd, pm):
            pg.set_default_timeout(8000)

        # farmer home
        pd.goto(FILE_URL); pd.wait_for_selector("text=Report a sick animal", timeout=6000)
        cap(pd, "farmer-home-desktop")
        attempt("mobile farmer home", lambda: (pm.goto(FILE_URL),
                                               pm.wait_for_selector("text=Report a sick animal", timeout=6000),
                                               cap(pm, "farmer-home-mobile")))

        # report form
        attempt("report form", lambda: (fill_report(pd), cap(pd, "report-form-desktop")))
        attempt("mobile report form", lambda: (pm.click("text=Report a sick animal"),
                                               pm.wait_for_selector("textarea", timeout=6000),
                                               cap(pm, "report-form-mobile")))

        # submit -> triage
        attempt("triage feedback", lambda: (submit(pd), cap(pd, "triage-feedback-desktop")))

        # my reports
        attempt("my reports", lambda: (pd.click("text=My reports"),
                                       pd.wait_for_timeout(600), cap(pd, "my-reports-desktop")))

        # vet queue + case
        attempt("vet queue", lambda: (role(pd, "Vet"), pd.wait_for_timeout(400), cap(pd, "vet-queue-desktop")))
        attempt("filter chip toggled", lambda: (pd.get_by_role("button", name=re.compile("^cattle$", re.I)).first.click(),
                                                pd.wait_for_timeout(300), cap(pd, "vet-queue-filtered-desktop")))
        attempt("vet case", lambda: (pd.locator("a.v-vet-card").first.click(),
                                     pd.wait_for_timeout(600), cap(pd, "vet-case-desktop")))
        attempt("take over", lambda: (pd.get_by_role("button", name=re.compile("take over", re.I)).first.click(),
                                      pd.wait_for_timeout(500)))

        # dashboard
        attempt("dashboard", lambda: (role(pd, "Authority"), pd.wait_for_timeout(500), cap(pd, "dashboard-desktop")))

        # about
        attempt("about", lambda: (pd.click("text=How it works"), pd.wait_for_timeout(400), cap(pd, "about-desktop")))

        # mobile vet queue
        attempt("mobile vet queue", lambda: (role(pm, "Vet"), pm.wait_for_timeout(400), cap(pm, "vet-queue-mobile")))

        browser.close()


run()
print("\n".join(log))
