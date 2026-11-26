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
3. `docs/VOICE_GUIDE.md`
4. `features.json`

## Core Workflow
1. **Preserve Strict Separation:**
   * Keep `src/engine/` completely data-driven—read all narrative content, character definitions, anomalies, and balance constants from `src/content/`.
   * Route all saves, fullscreen, haptics, and achievements through `src/platform/PlatformAdapter.ts` (`localStorage` implementation for Phases 0–5).
2. **Enforce Layout A Dialogue & Style 1 + 4 Choice Plates:**
   * Bottom-anchor `.dialogue-scroll` via `.dialogue-scroll > .dialogue-entry:first-child { margin-top: auto; }` + top `mask-image` fade (never `justify-content: flex-end` on `overflow-y: auto`).
   * Group consecutive lines from the same non-player speaker; keep Kitchen Prologue spoiler-free (`ACROSS THE TABLE`); render Psyche as softly styled italic marginalia (`· warmth`/`· structure`/`· pattern`).
   * Keep transcripts free of inline wireframe stick-figure SVGs, bouncing `•••` typing dots, `border-bottom` hyperlink underlines on `.hl-warm`/`.hl-cold`, and `system-ui` prose fallbacks; show `▶` voice replay on hover only and keep `Continue` in `.prologue-continue-bar`.
   * Render color-coded choice plates (`DialogueFeedView.ts`, `BootView.ts`): neutral-slate `◇ ASK` / `weight:explore` vs. warm-amber `weight:consequential` vs. `→` action vs. crimson Hold-to-Commit `is-tier-permanent` prune (`650ms` hold or 2-click confirm), zero `.choice-affinity-dot` spoiler dots, and `1–6` / `↑↓` / `Enter` keyboard navigation.
3. **Design Touch + Mouse Parity & `?dev=1` Overlay:**
   * Support pointer/touch drag, mouse wheel, and keyboard across 3D optics and minigames (`>= 44x44px` touch targets, `env(safe-area-inset-*)`, legible at `1920x1080` and `844x390`).
   * Keep `?dev=1` Director Overlay jumps, sliders, and JSON telemetry export working after every refactor.
4. **Stay Pure HTML Until Phase 6:**
   * Never add Electron or Capacitor dependencies during Phases 0–5; verify `npm run build` and `node scripts/verify.mjs`.
