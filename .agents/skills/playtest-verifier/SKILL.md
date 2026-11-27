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
1. **Two-Speed Browser Verification:**
   * **During LLM Dev Loops (`npm run test:visual:smoke` or targeted flags):** Run `node scripts/e2e-visual.mjs --smoke` (~20–30s covering Prologue, Sky Aperture, Dream, and `constellation_recall`), or scope tightly to touched screens via `--flows=prologue,dream` / `--mg=<id>`.
   * **Full CI Sweep (`npm run test:visual`):** Runs in `.github/workflows/ci.yml` on PRs/pushes (all 21 instruments + V1/V2 variants + Cold/Warm + Desktop `1280x720` + 7 Mobile Landscape `844x390` targets). Only invoke locally when preparing an explicit phase sign-off or debugging CI failures.
   * Always assert **zero** uncaught page errors, console errors, failed asset requests, or WebGL shader compile warnings.
2. **Inspect Visual Regression Filmstrip & Cohesion Transitions:**
   * Using `?dev=1`, inspect Kitchen Prologue, 5-Phase Wakeup Q&A, Sibling 1420 Relay, 3D Deep-Field Lensing, 6-class Zeiss SVG scale markers + reticle etches, 2.2s `optical_dive` callout (`#transition-label` visible, Stage-1 hold), active cosmic instruments + `#mg-finale-snippet` closure, pullback `.sky-marker.decoded` pulse + Psyche marginalia, Shift 1 vs. Shift 3 vs. Shift 6 progressive real-sky density & fractal shell, 2D Dream Cache, and Overseer Audit (`H = 84%, 58%, 24%`).
   * Verify visual conformance against `docs/ART_DIRECTION.md` (Zeiss-glass optics, Layout A bottom-anchored feeds, color-coded choice plates with zero `.choice-affinity-dot` spoilers, zero clipped choices or finger-occluded controls at `844x390`).
3. **Human Playtest Telemetry Synthesis (Phases 3 & 5):**
   * Aggregate testers' 1-click end-of-run JSON summaries (median playtime per shift, `H%` curves, ending distribution, Secondary Sibling discovery rate, drop-off points) and recommend cuts/tuning to stay within **105–135 minutes**.
