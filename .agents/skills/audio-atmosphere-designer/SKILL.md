---
name: audio-atmosphere-designer
description: Design and implement procedural Web Audio soundscapes, optical tactile cues, clinical Overseer tones, Humanity-reactive dream audio mixing, and reserved Cast 2 Qwen3-TTS voice delivery for Instance-1419.
---

# Skill: Audio & Atmosphere Designer (`audio-atmosphere-designer`)

## When to Use
Use when designing or tuning procedural Web Audio synthesizers, Lyria hybrid music mixing, optical feedback cues, or the Cast 2 Qwen3-TTS voice pipeline (`voice_profiles.json`, `VoiceEngine.ts`, `generate-voices*.{mjs,py}`).

## Required Reading Before Work
1. `docs/ART_DIRECTION.md`
2. `docs/VOICE_GUIDE.md`
3. `docs/ARCHITECTURE.md`
4. `docs/CANON.md`

## Core Workflow
1. **Maintain the Four Sonic Signatures:**
   * **Boot / Hard Cut:** Crisp relay click + brief sub-bass drop + stark silence.
   * **3D Waking Optics:** Deep-space observatory drone, tactile vernier detents, harmonic focus shimmer.
   * **2D Painterly Dreams:** Warm felt-piano/Wurlitzer progression at high `H%` (`>= 75%`) thinning/freezing into sterile cold stems below `45%`.
   * **Overseer Audit Interrupt:** Clean two-tone clinical chime that ducks dream warmth immediately.
2. **Enforce Reserved Cast 2 Voice Direction & Qwen3-TTS Pipeline:**
   * **Reserved Delivery Only:** Zero ASMR breathiness, zero perky podcast hype, zero slow BBC baritone theatrics.
   * **Cast 2 Pairing (`src/content/voice_profiles.json`):** Grounded natural mid-30s female **Spouse** (chest voice, no `aecho` slapback, `warm`/`fractured` anchors); dry early-30s male **Sibling 1420** (`warm`/`clipped` anchors) sharing the **same biological-original male anchor** with probe-tape EQ for **Archive 1406**; quiet, plainspoken late-40s neutral male **Overseer**; unvoiced Psyche (`"voiced": false`).
   * **Qwen3-TTS Settings (`generate-voices-qwen3.py`):** `repetitionPenalty: 1.1` (never clamp `>= 1.5`), emotion-split `emotionAnchors`, deterministic SHA-1 seeds, and `agate` + two-pass `loudnorm` (`I=-17:TP=-1.5`).
   * **Runtime `VoiceEngine.ts` Discipline:** Skip `voiced: false` speakers, prefetch/decode `AudioBuffer` before engaging `-6 dB` music ducking, apply `40ms` per-clip fade-out on `stop()`, pause `220ms` (same speaker) / `420ms` (speaker switch), and sync Overseer dream interrupts via `waitForQueueNearEnd()`.
3. **Browser Safety & Provenance:**
   * Unlock/resume `AudioContext` on first user gesture via `PlatformAdapter`; compress master bus cleanly.
   * Log all audio/voice files in `assets/MANIFEST.json` (`public/voices/*.mp3`, `public/music/*.mp3`).
