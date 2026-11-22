---
name: audio-atmosphere-designer
description: Design and implement procedural Web Audio soundscapes, optical tactile cues, clinical Overseer tones, and Humanity-reactive dream audio mixing for Instance-1419.
---

# Skill: Audio & Atmosphere Designer (`audio-atmosphere-designer`)

## When to Use
Use when designing or tuning procedural Web Audio synthesizers, UI/optical feedback cues, dream ambience, or `H%`-reactive mixing in `src/engine/audio/`.

## Required Reading Before Work
1. `docs/ART_DIRECTION.md`
2. `docs/ARCHITECTURE.md`
3. `docs/CANON.md`

## Core Workflow
1. **Define Four Sonic Signatures:**
   * **Boot Log / Hard Cut:** Crisp relay click + brief sub-bass drop + stark silence.
   * **3D Waking Optics:** Subtle deep-space probe hum, delicate tactile detents when sweeping spectral wavelengths, harmonic shimmer when an Einstein arc locks into geometric focus.
   * **2D Painterly Dreams:** Warm, muffled low-pass acoustic/pad warmth at high `H%` (`>= 75%`) that progressively thins into sparse, sterile sine intervals and faint static as `H%` drops below `45%`.
   * **Overseer Audit Interrupt:** Clean, polite, unmistakable clinical two-tone chime that ducks dream warmth immediately.
2. **Browser & Mobile Safari Safety:**
   * Lazily initialize/resume `AudioContext` on the first user pointer/key gesture through `PlatformAdapter`.
   * Provide clean mute + master/SFX/ambience sliders and zero audio clipping (`DynamicsCompressorNode` on master bus).
3. **Asset Provenance:**
   * Prefer pure procedural Web Audio to keep HTML bundle tiny; if any external CC0 audio stems are used, log them in `assets/MANIFEST.json`.
