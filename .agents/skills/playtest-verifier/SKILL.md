---
name: playtest-verifier
description: Run browser-in-the-loop Playwright visual & end-to-end verification across desktop and mobile landscape viewports, verify zero WebGL/console errors, and analyze 1-click human HTML playtest telemetry for Instance-1419.
---

# Skill: Playtest Verifier (`playtest-verifier`)

## When to Use
Use after any UI, Three.js shader, 2D dream canvas, dialogue UI, or gameplay flow change, and after every wave of human pure-HTML playtesting.

## Required Reading Before Running (SSOT)
1. `docs/ART_DIRECTION.md`
2. `docs/ARCHITECTURE.md`
3. `docs/HARNESS.md` (Taste Compass)
4. `scripts/README.md`

## Core Workflow
1. **Headless Browser Verification (`npm run test:visual`):**
   * Boot the pure HTML Vite build and drive it with Playwright at Desktop 16:9 (`1280x720` / `1920x1080`) and Mobile Landscape (`844x390`).
   * Assert **zero** uncaught page errors, console errors, failed asset requests, or WebGL shader compile warnings.
2. **Inspect Visual Regression Filmstrip:**
   * Using `?dev=1`, inspect Kitchen Prologue, 5-Phase Wakeup Q&A, Sibling 1420 Relay, 3D Deep-Field Lensing, active cosmic instruments + visual gain finale, 2D Dream Cache, and Overseer Audit (`H = 84%, 58%, 24%`).
   * Verify visual conformance against `docs/ART_DIRECTION.md` (Zeiss-glass optics, Layout A bottom-anchored feeds, color-coded choice plates with zero `.choice-affinity-dot` spoilers, zero clipped choices or finger-occluded controls at `844x390`).
3. **Human Playtest Telemetry Synthesis (Phases 3 & 5):**
   * Aggregate testers' 1-click end-of-run JSON summaries (median playtime per shift, `H%` curves, ending distribution, Secondary Sibling discovery rate, drop-off points) and recommend cuts/tuning to stay within **105–135 minutes**.
