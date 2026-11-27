---
name: visual-shader-studio
description: Author Three.js 3D astronomy optics shaders (gravitational lensing, spectral tuning, 93-billion-light-year enclosure), 2D impasto-to-shard H% degradation shaders, and cohesive swappable 2D dream character portraits/tableaus for Instance-1419.
---

# Skill: Visual & Shader Studio (`visual-shader-studio`)

## When to Use
Use when creating or iterating on GLSL shaders in `src/engine/shaders/`, 3D cosmic visuals, 2D dream tableaus, or 2D dream character portraits registered in `src/content/characters.json`.

## Required Reading Before Work
1. `docs/ART_DIRECTION.md` (§2.5 Scale Markers, 15-Plate Lazy Loading, Progressive Real-Sky & Fractal Filigree)
2. `docs/ARCHITECTURE.md` (§2.5 Schemas & `star_catalog_10ly.bin`)
3. `docs/HARNESS.md` (Taste Compass & §1.6 Split Ownership on `anomalies.json`)
4. `assets/MANIFEST.json`

## Core Workflow
1. **3D Astronomy, Scale Markers & Fractal Shell (`Three.js` + GLSL):**
   * Drive `STAR_VERTEX`/`SKY_FRAGMENT`/`ANOMALY_FRAGMENT` from `uSkySurveyTier` (`skyRevealTier` 1–6 + ~30° local sector deepening around decoded targets), `uFractalStage` (`1..6`), `uAnomalyProgress`, and `uSolDir` (20-year phase-lagged 3D spherical recursive fold filigree per `docs/ART_DIRECTION.md` §2.5).
   * Lazy-load all 15 `CosmicPlateId` plates into the bounded (`<= 6`) LRU GPU pool, angularly scaled by `scaleClass`, paired with the 6 diegetic 14px Zeiss SVG scale markers and reticle etches.
   * Keep spatial/optical/catalog fields in `anomalies.json` synced without overwriting `narrative-director` fields.
2. **2D `H%` Painterly Degradation & Voronoi Bleed (`dreamShaders.ts`):**
   * Drive Variant A (`uHumanity`, `uPruned`, `uOverseerActive`) plus `uAnomalyProgress`/`uFractalStage` Voronoi border crack bleed cleanly at 60fps across `H = 90%, 70%, 45%, 20%`.
3. **Cohesive Swappable 2D Dream Characters:**
   * Generate or curate dream character portraits and shared environment tableaus following `docs/ART_DIRECTION.md` §3 so all **9 personas** (`docs/CHARACTER_BIBLE.md`) share one unified oil-impasto look (`x: 0.14–0.55`, dark right third).
   * Register every asset in `src/content/characters.json` AND log its provenance/license/`ai_generated` flag in `assets/MANIFEST.json`.
4. **Two-Speed Visual Verification:**
   * During active dev, run `npm run verify:fast` + targeted Playwright (`npm run test:visual:smoke` or `node scripts/e2e-visual.mjs --flows=sky,dream --mg=...`) across `1280x720` and `844x390` before handing off to `consistency-auditor` (full 21-instrument sweep runs in CI via `npm run test:visual`).

## Hard Constraints
* Never hardcode portrait file paths in engine code—always resolve through `src/content/characters.json`.
* Keep shader complexity mobile-WebGL safe (no heavy multi-pass raymarching loops that throttle phone GPUs).
