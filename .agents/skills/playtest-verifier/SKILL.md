---
name: playtest-verifier
description: Run browser-in-the-loop Playwright visual & end-to-end verification across desktop and mobile landscape viewports, verify zero WebGL/console errors, and analyze 1-click human HTML playtest telemetry for Instance-1419.
---

# Skill: Playtest Verifier (`playtest-verifier`)

## When to Use
Use after any UI, Three.js shader, 2D dream canvas, dialogue UI, or gameplay flow change, and after every wave of human pure-HTML playtesting.

## Required Reading Before Running
1. `docs/ART_DIRECTION.md`
2. `docs/ARCHITECTURE.md`
3. `scripts/README.md`

## Core Workflow
1. **Headless Browser Verification (`npm run test:visual`):**
   * Boot the pure HTML Vite build and drive it with Playwright at two mandatory viewports:
     * Desktop 16:9 (`1280x720` / `1920x1080`)
     * Mobile Landscape (`844x390`)
   * Assert **zero** uncaught page errors, console errors, failed asset requests, or WebGL shader compile warnings.
2. **Capture & Inspect Visual Regression Filmstrip:**
   * Using `?dev=1`, capture and visually inspect:
     * Kitchen Prologue, 5-Phase Wakeup Q&A, Sibling 1420 Relay, 3D Deep-Field Lensing view, 2D Dream Cache, and Overseer Audit Interrogation (`H = 84%, 58%, 24%`).
   * Verify **Layout A & Choice Plate integrity**: bottom-anchored dialogue stream (no 300px chasm), turn-grouped headers, spoiler-free Kitchen Prologue (`ACROSS THE TABLE`), softly styled italic Psyche marginalia, zero wireframe stick-figure SVGs or `•••` typing dots, zero Warm/Cold `.choice-affinity-dot` spoiler dots, clear color separation (`◇`/explore neutral-slate vs. consequential warm-amber vs. Hold-to-Commit crimson prune), and zero clipped choices or finger-occluded controls on mobile `844x390`.
3. **Human Playtest Telemetry Synthesis (Phases 3 & 5):**
   * Aggregate testers' 1-click end-of-run JSON summaries: median playtime per shift, `H%` trajectories, ending distribution, Secondary Sibling discovery rate, and drop-off points.
   * Recommend specific cuts or tuning adjustments to keep median playtime firmly inside **105–135 minutes**.
