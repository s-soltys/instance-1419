---
name: visual-shader-studio
description: Author Three.js 3D astronomy optics shaders (gravitational lensing, spectral tuning, 93-billion-light-year enclosure), 2D impasto-to-shard H% degradation shaders, and cohesive swappable 2D dream character portraits/tableaus for Instance-1419.
---

# Skill: Visual & Shader Studio (`visual-shader-studio`)

## When to Use
Use when creating or iterating on GLSL shaders in `src/engine/shaders/`, 3D cosmic visuals, 2D dream tableaus, or 2D dream character portraits registered in `src/content/characters.json`.

## Required Reading Before Work
1. `docs/ART_DIRECTION.md`
2. `docs/ARCHITECTURE.md`
3. `assets/MANIFEST.json`

## Core Workflow
1. **3D Astronomy Shaders (`Three.js` + GLSL):**
   * Implement uniform-driven optical shaders (`uLensOffset`, `uEinsteinRadius`, `uWavelengthNm`, `uOpticalFidelity`, `uEnclosureReveal`) so gameplay state and `?dev=1` sliders update visuals smoothly at 60fps on both desktop and mobile WebGL.
   * Ground starfields and nebulae in real astronomy textures from `astro-asset-curator`.
2. **2D `H%` Painterly Degradation Shader (`dream_degrade.glsl`):**
   * Drive a single parameterized pipeline from `uHumanity` (`0.0..1.0`) and `uOverseerActive` (`0.0..1.0`):
     * `>= 0.75`: warm ochre/amber impasto LUT, soft organic motion.
     * `0.45–0.74`: cooler neutral shift, thinning brushstrokes, subtle scanline bleed.
     * `< 0.45`: Voronoi shard dispersion, cold cyan-white clinical desaturation, wireframe/telemetry bleed.
3. **Cohesive Swappable 2D Dream Characters:**
   * Generate or curate dream character portraits and shared environment tableaus following the exact palette, brushstroke texture, and framing rules in `docs/ART_DIRECTION.md` so all 10–14 personas share one unified hand-painted look.
   * Register every asset in `src/content/characters.json` AND log its provenance/license/`ai_generated` flag in `assets/MANIFEST.json`.
4. **Visual Verification:**
   * Run `npm run test:visual` (Playwright) to inspect rendered filmstrips at `H = 90%, 70%, 45%, 20%` on both `1920x1080` and `844x390` before handing off to `consistency-auditor`.

## Hard Constraints
* Never hardcode portrait file paths in engine code—always resolve through `src/content/characters.json`.
* Keep shader complexity mobile-WebGL safe (no heavy multi-pass raymarching loops that throttle phone GPUs).
