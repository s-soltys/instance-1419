---
name: engine-builder
description: Implement pure-HTML TypeScript runtime systems for Instance-1419 including Vite setup, StateStore, Storylet Scheduler, inkjs integration, responsive landscape UI (desktop + mobile touch), PlatformAdapter, and the ?dev=1 Director Overlay.
---

# Skill: Engine Builder (`engine-builder`)

## When to Use
Use when scaffolding or updating TypeScript modules under `src/engine/`, `src/platform/`, or `src/ui/`.

## Required Reading Before Work
1. `docs/ARCHITECTURE.md`
2. `docs/ART_DIRECTION.md`
3. `features.json`

## Core Workflow
1. **Preserve Strict Separation:**
   * Keep `src/engine/` completely data-driven—read all narrative content, character definitions, anomalies, and balance constants from `src/content/`.
   * Route all saves, fullscreen, haptics, and achievements through `src/platform/PlatformAdapter.ts` (`localStorage` implementation for Phases 0–5).
2. **Design Touch + Mouse Parity from Day 1:**
   * Support both pointer/touch drag and mouse wheel/keyboard for 3D optical controls.
   * Enforce `>= 44x44px` touch targets, `env(safe-area-inset-*)` padding, and clean readability at both `1920x1080` and `844x390` (mobile landscape).
3. **Maintain the `?dev=1` Director Overlay:**
   * Keep jump-to-shift, live `H%`/`Chaos` sliders, portrait switcher, Overseer interrupt trigger, and 1-click JSON telemetry export working after every refactor.
4. **Stay Pure HTML Until Phase 6:**
   * Never add Electron or Capacitor dependencies during Phases 0–5.
   * Verify `npm run build` produces a zero-error static `dist/` bundle and passes `npm run verify`.
