---
name: engine-builder
description: Implement pure-HTML TypeScript runtime systems for Instance-1419 including Vite setup, StateStore, Storylet Scheduler, inkjs integration, responsive landscape UI (desktop + mobile touch), PlatformAdapter, and the ?dev=1 Director Overlay.
---

# Skill: Engine Builder (`engine-builder`)

## When to Use
Use when scaffolding or updating TypeScript modules under `src/engine/`, `src/platform/`, or `src/ui/`.

## Required Reading Before Work (SSOT)
1. `docs/ARCHITECTURE.md` (Engine/Content isolation, 3-Axis contract, `DialogueRunner`, `VoiceEngine`, `PlatformAdapter`)
2. `docs/ART_DIRECTION.md` (Zeiss-glass optics, Layout A dialogue & Style 1+4 choice-plate UI specs)
3. `docs/VOICE_GUIDE.md` & `docs/HARNESS.md` (Taste Compass)
4. `features.json`

## Core Workflow
1. **Preserve Strict Separation & 3-Axis Contract:**
   * Keep `src/engine/` completely data-driven—read narrative content, anomalies, and balance constants from `src/content/`.
   * Route saves, fullscreen, haptics, and achievements through `src/platform/PlatformAdapter.ts`.
   * Extend `BaseCosmicMinigame` for all cosmic instruments, wire `drawBackdropAndAmbient()`, and respond cleanly to live `updateState()` calls across all 3 axes (`Warmth`, `Optical Clarity`, `Horizon Drift`) without resetting stage progress.
2. **Enforce Layout A Dialogue & Zeiss-Glass UI (`docs/ART_DIRECTION.md`):**
   * Implement Layout A bottom-anchored feeds, Style 1 + 4 color-coded choice plates, and anti-chat-widget rules exactly as specified in `docs/ART_DIRECTION.md` (zero `.choice-affinity-dot`, zero `<input type="range">`).
   * Support mouse, wheel, keyboard (`1–6`, `↑↓`, `Enter`), and touch parity (`>= 44x44px` targets, `env(safe-area-inset-*)`, legible at `1920x1080`, `1280x720`, and `844x390`).
   * Keep `?dev=1` Director Overlay jumps, sliders, and JSON telemetry export working cleanly.
3. **Verify Without Zombies:**
   * Never add Electron or Capacitor dependencies until Phase 6; verify `npm run verify` passes cleanly (including `check-hygiene.mjs` and 3-axis contract tests).
