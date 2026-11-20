# HerdSignal

**Livestock care, connected — Namibia.** HerdSignal connects livestock farmers
with veterinary professionals: a farmer reports a sick animal in under two
minutes, the report is triaged instantly (urgency + first-aid guidance while
they wait), a covering vet responds from a live queue, and clustered reports
raise area-level outbreak signals for the veterinary authority.

This is a **self-contained demonstration build**: plain HTML/CSS/JavaScript,
no framework, no build step required to run it, no backend, no accounts. All
data lives in the browser (localStorage) and never leaves it.

> The guidance shown in the app is generic first aid, not veterinary advice.
> Everything in it — cases, vets, farms — is synthetic demonstration data.

## Quick start

Open the built file directly — it runs fully offline:

```
open dist/herdsignal.html      # or just double-click it
```

Try the round trip: report a sick animal as **Farmer**, open a second browser
tab on the same file, switch to **Vet**, and take the case — the first tab
updates live (cross-tab sync through a storage event).

## Rebuild the single file

`dist/herdsignal.html` is assembled from the sources in `app/`:

```
python3 scripts/assemble.py
```

This inlines every stylesheet, script, font and image into one HTML file and
fails loudly if anything is missing.

## Development

```
node --test              # domain test suite (from the repo root)
python3 scripts/capture_ui.py   # Playwright UI captures into evidence/
python3 scripts/crosstab_check.py  # cross-tab sync smoke test
```

Requirements: Node 18+, Python 3, Playwright (for captures only).

### Source layout

| Path | What it is |
| --- | --- |
| `app/domain.js` | Domain core: triage scoring, vet matching, outbreak clustering. No dependencies; UMD-style (Node tests + browser). |
| `app/shell.js` | App shell: routing, header, role switch, persistence and cross-tab sync, About. |
| `app/ui-farmer.js`, `app/ui-vet.js`, `app/ui-dashboard.js` | The three role views. |
| `app/seed.js` | Synthetic demonstration dataset. |
| `app/*.css` | Design system: tokens in `shell.css`, views, world layer in `polish.css`. |
| `app/API.md` | Frozen domain API reference. |
| `scripts/` | Build + QA scripts (assembly, capture, smoke tests, asset tools). |
| `assets/` | Source photographs for the hero images. |
| `test/` | Node test suite for the domain core. |

The visual design system is documented in [`DESIGN.md`](DESIGN.md).

## Assets and licenses

- Code: MIT (see [LICENSE](LICENSE)).
- [Figtree](https://fonts.google.com/specimen/Figtree) — SIL Open Font License,
  embedded as base64 woff2 subsets in `app/fonts.css` (regenerate with
  `scripts/make_fonts.py`).
- Hero photographs: StockCake free stock photography, cropped copies in
  `assets/` (regenerate `app/hero.js` with `scripts/make_hero.py`).
