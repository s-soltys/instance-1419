# MUSIC_DIRECTION.md — Hybrid Soundtrack & `H%` Reactivity Spec

This document locks the musical identity, cue architecture, Humanity (`H%`) reactivity, and AI-audio production pipeline for *Instance-1419* (approved across Round 1 & Round 2 Creative Director auditions).

---

## 1. Core Sonic Identity ("Organic Warmth Freezing Into Glass")

Every musical element in *Instance-1419* tracks the central emotional trade-off between **human warmth** and **clinical optical precision**:

* **Open 3D Sky & Boot (`waking_3d`, `boot`) — Procedural Web Audio Bed:** Preserves [AudioEngine.ts](../src/engine/AudioEngine.ts)'s live generative D-Lydian observatory harmonics and wavelength-reactive drone so sweeping the `200–1800 nm` spectral vernier always feels tactile and alive.
* **Minigames (`mg_*`) — Organic Cosmic Wonder & Vast Scale:** Plucked koto constellations, warm analog modular arpeggios, deep sub-space ocean drones, bowed cello with delicate micro-glitch dust, lonely pedal steel, and luminous tremolo starlight—never generic lo-fi beats or rushed chiptune loops.
* **2D Dream Sequences (`dream_*`) — Textural, Intimate Warmth (Zero 3/4 Waltz Cliché):** Rain-on-glass Wurlitzer, close-mic nylon guitar, breathing wooden harmonium, velvety guitar swells, warm tape Rhodes + chamber cello, and soft motor vibraphone.
* **Overseer Audits (`overseer_*`) — Immaculate, Polite, Unsettling Clarity:** Pure glass harmonica corridors, off-balance 5/4 crystal lattices as suspicion/chaos climbs, and a clinical pendulum paired with a single fragile bowed cello on persona-sacrifice ultimatums.
* **Low `H%` / Pruned State (`cold_*`) — Vibrato Dies Into Frost:** Warm acoustic instruments never turn into cartoonish robotic beeps; instead, human vibrato and warmth recede into **beatless, key-matched frozen sul-ponticello string harmonics (`cold_frost_em`, `cold_frost_dm`)** and **sterile glass harmonica (`cold_glass_am`)**.

---

## 2. Hybrid `H%` Reactivity Architecture (Zero Tempo/Chord Clash)

Mixing two independent rhythmic AI tracks at `H = 55%` causes rhythmic clashing. Instead, `MusicDirector` (`src/engine/audio/MusicDirector.ts`) uses a **Hybrid Warm-Main + Beatless Key-Matched Cold-Stem** graph:

1. **Main Scenario Track (`mainBus` → `warmEqFilter`):** Full-length (~2 min) stereo loop for the active minigame, dream persona, or Overseer audit state.
   * At **`H >= 70%`**: `100%` main gain, warm filter fully open (`18 kHz`), soft saturation headroom.
   * As **`H` drops `70% → 20%`**: Main track gently recedes (`1.0 → 0.32`), low-end warmth thins via a gentle high-pass (`20 Hz → 260 Hz`), and high-mid glassy clarity sharpens.
2. **Key-Matched Beatless Cold Stem (`coldBus`):** One of 3 shared beatless harmonic frost/glass beds (`cold_frost_em`, `cold_frost_dm`, `cold_glass_am`), matched to the tonal center of the main cue.
   * At **`H >= 70%`**: Silent (`0.0001`).
   * At **`45% <= H < 70%`**: Gently bleeds underneath (`0.08 → 0.42`) as a frosty halo.
   * At **`H < 45%` / Pruned**: Rises to primary dominance (`0.55 → 0.92`), creating the auditory mirror of the Voronoi glass-shard shader.
3. **Prune Shear Snap:** Calling `prune_humanity` fires the mechanical `prune_cut` SFX and snaps the `mainBus ↔ coldBus` balance over `0.35s` so the permanent loss of warmth is immediately felt.
4. **Coexistence with Procedural Bed & Kokoro VO:**
   * When a pre-generated cue activates, [AudioEngine.ts](../src/engine/AudioEngine.ts) smoothly ducks its generative phrase scheduler (`1.1s` crossfade) while keeping tactile SFX, probing carriers, and sub-floor alive.
   * `MusicDirector` routes through `AudioEngine`'s `ambienceGain` bus, inheriting **Master / Ambience sliders**, **Mute**, and **`VoiceEngine` `-6 dB` speech ducking** automatically.
   * If a music file is unavailable (e.g., offline `build:single` ultra-light mode or headless tests), `AudioEngine` seamlessly falls back to procedural generation with zero console errors.

---

## 3. Master Cue Sheet (15 Scenario Cues + 3 Beatless Cold Stems)

All mappings live strictly in data ([src/content/music_catalog.json](../src/content/music_catalog.json)).

### Beatless Cold Stems (Shared Across Cues by Key Center)
| Stem ID | Tonal Center | Sonic Character |
| :--- | :--- | :--- |
| `cold_frost_em` | E minor / G major | Frozen zero-vibrato sul-ponticello high string harmonics + crystal air |
| `cold_frost_dm` | D minor / F major / C minor | Frozen zero-vibrato string frost + hollow deep cryo sub-resonance |
| `cold_glass_am` | A minor / C major | Pure sustained glass harmonica + immaculate sterile corridor air |

### Minigame Cues (All 21 Instruments Mapped)
| Cue ID | Cold Stem | Instruments | Sonic Character |
| :--- | :--- | :--- | :--- |
| `mg_constellation_koto` | `cold_frost_em` | `constellation_recall`, `parallax_depth`, `blink_spotter`, `coronagraph_mask` | Delicate plucked koto + translucent glass constellations (E Dorian) |
| `mg_modular_pulse` | `cold_frost_dm` | `wave_shaper`, `pulsar_echo`, `radio_triangulation`, `michelson_fringe` | Hypnotic warm analog modular arpeggio + soft sub pulse (C Dorian) |
| `mg_ocean_gravity` | `cold_frost_dm` | `lens_focus`, `einstein_cross`, `gravity_slingshot`, `binary_mass_scale` | Vast sub-space analog ocean drone + distant cosmic bells (D minor) |
| `mg_cello_glitch` | `cold_frost_em` | `light_dispersion`, `polarization_filter`, `spectral_prism`, `multiband_loupe` | Expressive bowed cello ostinato + delicate micro-glitch dust (E minor) |
| `mg_pedal_void` | `cold_frost_em` | `exoplanet_transit`, `exposure_stacker`, `cepheid_ladder` | Lonely ambient pedal-steel swells across pitch-black void (G major) |
| `mg_starlight_horizon` | `cold_frost_em` | `supernova_echoes`, `horizon_seam_stitcher` | Luminous delay-tremolo starlight guitar + restrained horizon swell (E minor/major) |

### 2D Dream Sequence Cues (All 14 Personas + Epilogue)
| Cue ID | Cold Stem | Personas / Beats | Sonic Character |
| :--- | :--- | :--- | :--- |
| `dream_wurlitzer_rain` | `cold_frost_dm` | `phantom_spouse`, `spouse`, `child` | Intimate rain-on-glass Wurlitzer 9th chords + warm air (F major) |
| `dream_nylon_sunbeam` | `cold_glass_am` | `pet`, `afternoon_stranger`, `best_friend` | Close-mic nylon guitar fingerpicking with warm room breath (C major) |
| `dream_harmonium_breath` | `cold_frost_dm` | Prologue Anchor, `parent`, `unpaid_grace`, `young_romance`, `love_interest` | Breathing reed harmonium + velvet guitar wash (D major/minor) |
| `dream_rhodes_cello` | `cold_frost_em` | `wronged_person`, `upload_witness`, `younger_self`, Shift 4–5 | Warm tape Rhodes + aching impressionist cello & viola elegy (E minor) |
| `dream_vibraphone_nocturne` | `cold_frost_dm` | `old_teacher`, `rival` | Soft motor vibraphone chords in dark lush hall reverb (C Dorian) |
| `dream_epilogue_dawn` | `cold_frost_dm` | Shift 6 Post-20-Year Freeze (Endings 1–3) | Fragile warm Rhodes & solo cello blooming out of quiet space static (F major) |

### Overseer Audit Cues (Escalating With Suspicion, Chaos & Shift)
| Cue ID | Cold Stem | Trigger Rule | Sonic Character |
| :--- | :--- | :--- | :--- |
| `overseer_glass_corridor` | `cold_glass_am` | Baseline audits (`suspicion < 2`, `chaos < 35`) | Pure glass harmonica sustained tones + faint clinical relay clicks (A minor) |
| `overseer_drift_lattice` | `cold_frost_em` | Elevated scrutiny (`suspicion >= 2` or `chaos >= 35`) | Subtle 5/4 interlocking crystal bell & rim-click cognitive lattice (E minor) |
| `overseer_cello_ultimatum` | `cold_frost_dm` | High-stakes ultimatum (`suspicion >= 3` or `shift >= 4` or pruned) | Immaculate glass pendulum + single fragile bowed cello on a knife-edge (D minor) |

---

## 4. Production Pipeline & Commercial Hygiene

* **Generator CLI:** `npm run generate:music` (`scripts/generate-music.mjs`) calls Google DeepMind `lyria-3.5` (via `GEMINI_API_KEY` env var — never committed), normalizes loudness to **`-16 LUFS`** with `ffmpeg` (`loudnorm`), applies clean loop-edge micro-fades, and encodes **`96 kbps` 44.1 kHz stereo MP3** into `public/music/`.
* **Provenance & Steam AI Disclosure:** All files under `public/music/` are verified by `scripts/verify.mjs` against [assets/MANIFEST.json](../assets/MANIFEST.json) with `ai_generated: true`, exact model provenance (`lyria-3.5`), and commercial-rights review notes for Steam release (migrate final commercial masters to Google Cloud Vertex AI / ElevenLabs Music terms prior to Steam store launch).
