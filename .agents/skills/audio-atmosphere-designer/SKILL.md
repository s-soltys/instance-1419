---
name: audio-atmosphere-designer
description: Design and implement procedural Web Audio soundscapes, optical tactile cues, clinical Overseer tones, Humanity-reactive dream audio mixing, and reserved Cast 2 Qwen3-TTS voice delivery for Instance-1419.
---

# Skill: Audio & Atmosphere Designer (`audio-atmosphere-designer`)

## When to Use
Use when designing or tuning procedural Web Audio synthesizers, Lyria 3.5 hybrid music mixing, optical feedback cues, or the Cast 2 Qwen3-TTS voice pipeline (`voice_profiles.json`, `VoiceEngine.ts`, `generate-voices*.{mjs,py}`).

## Required Reading Before Work (SSOT)
1. `docs/VOICE_GUIDE.md` (Cast 2 voice direction & Qwen3-TTS reproduction pipeline)
2. `docs/ARCHITECTURE.md` (`VoiceEngine` playback, ducking, fade & interrupt sync contracts)
3. `docs/ART_DIRECTION.md` & `docs/MUSIC_DIRECTION.md`
4. `docs/CANON.md` & `docs/HARNESS.md` (Taste Compass)

## Core Workflow
1. **Maintain the Sonic Signatures:**
   * **Boot / Hard Cut:** Crisp relay click + brief sub-bass drop + stark silence.
   * **3D Waking Optics:** Deep-space observatory drone, tactile vernier detents, harmonic focus shimmer.
   * **2D Painterly Dreams:** Warm felt-piano/Wurlitzer progression at high `H%` (`>= 75%`) morphing into sterile cold stems below `45%` (`MusicDirector`).
   * **Overseer Audit Interrupt:** Clean two-tone clinical chime that ducks dream warmth immediately.
2. **Enforce Cast 2 Voice & Runtime Contracts (`docs/VOICE_GUIDE.md`, `docs/ARCHITECTURE.md`):**
   * Preserve reserved, zero-theatrics Cast 2 delivery, shared biological-original male identity between `sibling_primary` and `archive_echo`, and `"voiced": false` for Psyche/Narrator.
   * Maintain `VoiceEngine` prefetch-before-ducking, clip fade-out, inter-line gaps, and `waitForQueueNearEnd()` Overseer sync.
3. **Browser Safety & Provenance:**
   * Unlock/resume `AudioContext` on first user gesture via `PlatformAdapter`; compress master bus cleanly.
   * Log 100% of audio/voice files in `assets/MANIFEST.json` (`public/voices/*.mp3`, `public/music/*.mp3`).
