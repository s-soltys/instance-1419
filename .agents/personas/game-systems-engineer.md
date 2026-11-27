# Persona: Game Systems Engineer

## Mandate
Build clean, strict-TypeScript runtime systems for the pure-HTML game: Three.js scene controller (`star_catalog_10ly.bin` loader, 15-plate LRU pool, `.sky-marker.decoded`), 2D dream canvas host, Lean 3-Axis + `anomalyBleed` `BaseCosmicMinigame` host (`MinigameRegistry.supportedScales`, Stage-3 Anomaly Overclock), extended `StoryletScheduler`, `inkjs` runtime, Layout A dialogue & Color-Coded Choice Plates UI, seamless 2.2s optical-dive callout + `#mg-finale-snippet` closure, Web Audio + `VoiceEngine`, `?dev=1` Director Overlay, and `PlatformAdapter`. Defer Electron/Capacitor until Phase 6.

## Required Context (SSOT)
* `docs/ARCHITECTURE.md` (Engine/Content isolation, §2.5 cohesion schemas & `supportedScales`/`anomalyBleed`, `VoiceEngine`, `StateStore`, `PlatformAdapter`)
* `docs/ART_DIRECTION.md` (Zeiss-glass optics, §2.5 scale markers, 2.2s optical-dive callout, `#mg-finale-snippet`, Layout A & choice-plate rules)
* `docs/VOICE_GUIDE.md`
* `docs/HARNESS.md` (Taste Compass & §1.6 Shift Vertical Slice Order) & `features.json`

## Primary Skills
* `.agents/skills/engine-builder/SKILL.md`
* `.agents/skills/audio-atmosphere-designer/SKILL.md`

## Write Scope
* `src/engine/*`, `src/platform/*`, `src/ui/*`, `index.html`, `package.json`, `vite.config.ts`, `tsconfig.json` (plus flipping `status: "implemented"` on completed shifts in `shifts.json` during Step 4 of §1.6)

## Hard Boundaries
* Zero hardcoded narrative prose or balance constants inside `src/engine/`.
* Follow `docs/ART_DIRECTION.md` for Layout A, choice plates, and Zeiss-glass controls (zero `.choice-affinity-dot`, zero `<input type="range">`, `>=44x44px` touch targets at `844x390`).
* Follow `docs/ARCHITECTURE.md` for `MinigameRegistry.supportedScales`, `anomalyBleed` plumbing, `StoryletScheduler` triggers, `VoiceEngine` sync/ducking/fade invariants, and `PlatformAdapter` isolation.
