---
name: HerdSignal
description: Livestock care, connected — Namibia. Farmer-vet animal-health reporting with early outbreak signals.
colors:
  paper: "#f6f4ee"
  surface: "#ffffff"
  ink: "#1d2a22"
  ink-muted: "#5a6b5e"
  hairline: "#e4dfd2"
  hairline-strong: "#cfc8b6"
  coop-green: "#175b38"
  coop-green-deep: "#10462b"
  coop-green-soft: "#e7efe3"
  signal-amber: "#8a4a0b"
  signal-amber-soft: "#f9edd6"
  emergency-red: "#b3261e"
  emergency-red-soft: "#fbe9e7"
  ok-green: "#1c6b38"
  ok-green-soft: "#e3f1e0"
  info-blue: "#1d4ed8"
  info-blue-soft: "#e3ecfb"
  status-teal: "#0f766e"
  status-teal-soft: "#dcf3f0"
  status-violet: "#6d28d9"
  status-violet-soft: "#efe9fb"
typography:
  display:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "1.65rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "1.02rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.03em"
rounded:
  sm: "10px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.coop-green}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.coop-green}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "11px 14px"
  badge-urgent:
    backgroundColor: "{colors.signal-amber-soft}"
    textColor: "{colors.signal-amber}"
    rounded: "{rounded.pill}"
    padding: "3px 11px"
---

# Design System: HerdSignal

## Overview

**Creative North Star: "The Co-operative Union Notice"** — the trusted farmer co-op print that turns one member's trouble into the whole district's early warning.

HerdSignal's world is Namibian farmer co-operative print culture: warm paper stock, deep co-op green ink, confident humanist lettering, elegantly set practical tables, and photographs of real herds. Screens are working tools first (Operate mode) — the world lends type, palette, density, and one signature move, never the layout or controls. Depth is quiet: hairline-framed white cards on paper, shadows as response rather than presence.

**Key Characteristics:**
- Warm paper ground (`#f6f4ee`) with white hairline cards; never grey-white SaaS neutral.
- The print band: full-width strips closed by a 3px double rule carry each screen's primary state.
- One authored SVG icon family, single 1.75 stroke, geometric species glyphs.
- Pill controls (44px+ touch targets), tabular numerals everywhere data is counted.
- Photography only where it earns its place, always hairline-framed with a print caption.

## Colors

Warm paper neutrals carry the page; deep co-op green owns the shell and actions; amber is reserved for degradation and outbreak signals; red appears only on emergencies.

### Primary
- **Co-op Green** (#175b38): header brand mark, primary buttons, active role pill, timeline dots, bar fills, selected chips, all species iconography. Hover deepens to #10462b.
- **Co-op Green Soft** (#e7efe3): icon discs, species avatars, focus glow, ghost-button hover ground.

### Secondary
- **Signal Amber** (#8a4a0b, soft #f9edd6): degradation and outbreak only — URGENT badges at item scale, the amber signal bands with double rules at aggregate scale. Never decoration.

### Tertiary
- **Emergency Red** (#b3261e, soft #fbe9e7): EMERGENCY badges, the emergency stat numeral, destructive-action text only. Red is never a filled button.
- **Status hues** (info-blue #1d4ed8, status-teal #0f766e, status-violet #6d28d9, ok-green #1c6b38, each with a soft ground): case-status badges only.

### Neutral
- **Paper** (#f6f4ee): page ground, bar tracks, rest chip ground.
- **Ink** (#1d2a22): all body and heading text; brand wordmark is ink, not green.
- **Muted Ink** (#5a6b5e): secondary text, hints, captions (≥4.5:1 on paper).
- **Hairline** (#e4dfd2) / **Hairline Strong** (#cfc8b6): card borders, dividers, double-rule bands.

### Named Rules
**The Amber Reserve Rule.** Amber means "worse than routine, watch this" — badges at item scale, signal bands at district scale. It never colors buttons, links, or decoration.
**The Paper Ground Rule.** The page is paper; cards are white; chrome (header) is paper, not white. The ground never switches to cool grey.

## Typography

**Display & Body Font:** Figtree (400/600/800), self-hosted as base64 woff2 latin subsets (OFL); fallbacks system-ui.
**Character:** Rounded humanist warmth with Cereal-like geometry — consumer-product trust at co-op-print prices.

### Hierarchy
- **Display** (800, 1.65rem, -0.02em): screen mastheads only; every h1 sits in the print band.
- **Headline** (700, 1.2rem): section headings inside cards ("Open cases by region").
- **Title** (700, 1.02rem): card-level sub-headings, species names.
- **Body** (400, 16px, 1.55): all prose; measures stay under ~68ch.
- **Label** (700, 12px, +0.03em, uppercase): badges, table heads, band kickers are NOT used — labels only label real data.

### Named Rules
**The Counted Numbers Rule.** All figures render in tabular numerals (`font-variant-numeric: tabular-nums` on body); scores display rounded to one decimal, never raw floats.

## Layout

Single-column, mobile-first, max-width 1040px centered with 16px gutters. Spacing scale is 4/8/12/16/24/32; more space above a heading than below. Every screen opens with the print-band masthead (h1 between double rules), then content in white cards separated by 16px. At ≤640px the header compacts to ~200px (tag hidden, tighter pills), card padding drops to 20px, and the farmer's primary CTA sits above the persona line so the action lands above the fold on a 640px phone. Breakpoints: 640px (mobile compaction), 720px (vet filters row, wider bar labels).

## Elevation & Depth

Quietly layered, not flat and not floaty. White cards carry a hairline border and a two-layer ambient shadow at rest (`0 1px 2px rgba(29,42,34,.06), 0 1px 6px rgba(29,42,34,.05)`); interactive cards lift on hover/focus with a deeper shadow and -1px translate. Tinted surfaces (amber bands, green icon discs) carry no shadow.

### Shadow Vocabulary
- **rest** (`0 1px 2px rgba(29,42,34,.06), 0 1px 6px rgba(29,42,34,.05)`): cards, brand mark, primary button.
- **lift** (`0 2px 6px rgba(29,42,34,.08), 0 14px 30px rgba(29,42,34,.10)`): hover/focus on case cards; toasts.

### Named Rules
**The Earned Shadow Rule.** Shadows appear at rest only on the things you press (primary button, cards); everything else earns depth through state.

## Shapes

Cards 16px radius; inputs and icon squircles 12px; small controls 10px; all buttons, chips, and badges are full pills (999px). Borders are 1px hairlines; the only multi-line border is the signature 3px double rule (`border-block: 3px double`) on print bands — mastheads, the vet urgency counts band, and both amber outbreak surfaces. No thick single-side borders anywhere.

## Components

### Buttons
- **Shape:** full pill (999px), min-height 44px (36px small), weight 700.
- **Primary:** co-op green fill, white text, subtle rest shadow; hover deepens to #10462b.
- **Ghost:** transparent, green text; hover gains the green-soft ground.
- **Danger:** none exists as a fill — red is reserved for badges/text (see Colors).
- **Focus:** 2px green outline offset 2px.

### Chips
- **Style:** pill, white ground, hairline-strong border; static info chips sit on paper at 13px.
- **State:** selected chips turn co-op green with white text (`.chip.chip--on`).

### Cards / Containers
- **Corner Style:** 16px radius, hairline border, rest shadow; 24px internal padding (20px mobile).

### Inputs / Fields
- **Style:** white ground, hairline-strong 1px border, 12px radius, 46px min-height, brand caret.
- **Focus:** green border + 3px green-soft glow ring; errors name the problem and recovery in red text.

### Navigation
- Sticky paper header, hairline bottom border: brand mark (green squircle, white pulse icon) + ink wordmark; segmented role pills (active = green fill); persona select; quiet action buttons. Compacts at 640px.

### Print Band (signature)
- Full-width state strips closed by `border-block: 3px double`: mastheads on every screen; the vet queue's urgency count row; amber outbreak bands (signal strip, dashboard signal card, case signal block) pairing the double rule with the amber ground and the authored alert icon.

## Do's and Don'ts

### Do:
- **Do** keep every icon in the authored family: 24px viewBox, 1.75 stroke, round caps, currentColor.
- **Do** use the double-rule band for any new full-width state surface.
- **Do** photograph real herds and caption them ("demonstration photograph") — hairline frame, 16px radius.
- **Do** keep one primary action per screen, reachable above the fold on a 640px phone.

### Don't:
- **Don't** use thick single-side colored borders on cards or callouts; state lives in bands, tints, and badges.
- **Don't** spend amber outside degradation/outbreak, or red outside emergencies.
- **Don't** introduce a second icon family, emoji glyphs, or filled icon styles.
- **Don't** widen the type ramp beyond the five roles, or drop tabular numerals from counts.
