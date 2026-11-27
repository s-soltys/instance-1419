---
name: engine-builder
description: Implement pure-HTML TypeScript runtime systems for Instance-1419 including Vite setup, StateStore, Storylet Scheduler, inkjs integration, responsive landscape UI (desktop + mobile touch), PlatformAdapter, and the ?dev=1 Director Overlay.
---

# Skill: Engine Builder (`engine-builder`)

## When to Use
Use when scaffolding or updating TypeScript modules under `src/engine/`, `src/platform/`, or `src/ui/`.

## Required Reading Before Work (SSOT)
1. `docs/ARCHITECTURE.md` (Engine/Content isolation, §2.5 `supportedScales` & `anomalyBleed`, `StoryletScheduler`, `star_catalog_10ly.bin`, `VoiceEngine`, `StateStore`, `PlatformAdapter`)
2. `docs/ART_DIRECTION.md` (Zeiss-glass optics, §2.5 scale markers, 2.2s optical-dive callout, `#mg-finale-snippet`, `.sky-marker.decoded`, Layout A & choice-plate UI)
3. `docs/VOICE_GUIDE.md` & `docs/HARNESS.md` (Taste Compass & §1.6 Shift Vertical Slice Order)
4. `features.json`

## Core Workflow
1. **Preserve Strict Separation, Scale Coupling & 3-Axis + Bleed Contract:**
   * Keep `src/engine/` completely data-driven—read narrative content, `shifts.json` v2, `anomalies.json` v2, `storylets.json`, and `balance.json` from `src/content/`, and load `assets/astro/star_catalog_10ly.bin` via `OpticsScene`.
   * Route saves, fullscreen, haptics, and achievements through `src/platform/PlatformAdapter.ts`.
   * Declare `supportedScales` & `supportsAnomalyBleed` on `MinigameRegistry`, plumb `anomalyBleed` (`0..1`) + `fractalStage` into `MinigameStateVector`, support Stage-3 Anomaly Overclock (`deep_overclock` alongside `clean`/`partial`), and respond cleanly to live `updateState()` calls without resetting stage progress.
   * Wire extended `StoryletScheduler` preconditions (`requiredDecodedTargets`, `minRequiredScansInShift`, `minOptionalScansInShift`, `requiresFlag`, etc.) and sync target flags into `DialogueRunner`; flip finished shifts to `status: "implemented"` in Step 4 of `docs/HARNESS.md` §1.6.
2. **Enforce Optical-Dive Briefing, Closure & Layout A UI (`docs/ART_DIRECTION.md`):**
   * Render the 6 diegetic 14px SVG scale markers, on-glass reticle pre-scan intent, seamless skippable 2.2s `optical_dive` callout (`briefingHoldSec` gate), `.mg-top-left` target breadcrumb, un-hidden `#mg-finale-snippet` + Mandate/Optional pips, and pullback `.sky-marker.decoded` pulse + unvoiced Psyche marginalia.
   * Implement Layout A bottom-anchored feeds, Style 1 + 4 color-coded choice plates, and anti-chat-widget rules (zero `.choice-affinity-dot`, zero `<input type="range">`), with mouse/wheel/keyboard (`1–6`, `↑↓`, `Enter`) and touch parity (`>= 44x44px` at `844x390`).
   * Keep `?dev=1` Director Overlay jumps, sliders, and JSON telemetry export working cleanly.
3. **Verify Without Zombies:**
   * Never add Electron or Capacitor dependencies until Phase 6; run `npm run verify:fast` + targeted Playwright (`npm run test:visual:smoke` / `--flows=`) before handoff.
