# PROGRESS.md — Cross-Session Handoff Log

Each agent session reads the latest entries here before starting work and appends a concise summary + next action before committing.

---

## Session 0 — 2026-11-22 — Harness Bootstrap & Concept Alignment
* **Completed:**
  * Preserved unmodified original concept in `docs/ORIGINAL_CONCEPT.md`.
  * Locked core product, plot, and architecture decisions in `docs/CANON.md`, `docs/ROADMAP.md`, `docs/HARNESS.md`, `docs/ARCHITECTURE.md`, `docs/VOICE_GUIDE.md`, `docs/ART_DIRECTION.md`, and draft `docs/BEAT_SHEET.md`.
  * Established 6 Agent Personas (`.agents/personas/`) and 8 Modular Skills (`.agents/skills/`).
  * Initialized `features.json` milestone ledger, `assets/MANIFEST.json`, and `scripts/README.md` verification contracts.
  * Connected repository to `s-soltys/instance-1419` (private).
* **Locked Rulings From Creative Director:**
  * Vibe-coding-first workflow; pure static HTML (`Vite + TS + Three.js + inkjs`) through Phase 5 playtesting; Steam-first Electron packaging + Capacitor mobile port deferred to Phase 6.
  * Coordinated Overseer Network synchronizes probe wake-ups (enabling interferometry, mid-game desync tension, and out-of-phase Secondary Sibling).
  * 10–14 rotating Dream Personas (3–4 surfaced per playthrough + pruning tied to sacrificing specific cached personas).
  * Biological volunteer mystery remains permanently ambiguous.
  * Intimate active sibling cast (Primary + Optional Secondary) with subtle archived log echoes from earlier 1,417 copies.
  * Commercial release (€1–€2+ on Steam) using commercial-safe public astronomy datasets + swappable 2D character pipeline.
* **Next Recommended Feature(s):**
  * `P1-01` (Finalize `docs/BEAT_SHEET.md` details, 14-persona pool, and `balance.json`), **OR**
  * `P0-01` (Scaffold pure HTML Vite + TS + Three.js + `inkjs` + `?dev=1` Director Overlay spike).

---

## Session 0b — 2026-11-22 — `/grill-me` Plot, Physics & Gameplay Bridge Lock-In
* **Resolved & Committed to `docs/CANON.md` & `docs/BEAT_SHEET.md`:**
  * **10-Light-Year Zero-FTL Upgrade:** Moved probe shell to ~10 ly from Sol–Centauri (beyond Alpha Centauri's 4.37 ly) inside a local interferometry cluster (live in-shift banter with Primary Sibling). Solves light-cone physics via interstellar noise floor + the **Off-Center Proof** (proving the 93B-ly sphere is centered dead-on Sol–Centauri, offset 10 ly from the probe).
  * **"Why Now?" Solved:** Sphere's leading-edge photons only recently crossed our horizon + recent predecessors who noticed early hints were pruned by blind Overseers (`1,417 copies × ~29.5 real yrs ≈ 41,802 yrs`).
  * **Ultimate Cause & Evolved Humanity:** Grounded in concrete astronomical impossibilities while keeping the enclosure's ultimate cause hauntingly ambiguous; how humanity evolved over 41 millennia stays **intentionally vague**.
  * **3D Gameplay ↔ `H%` Bridge:** Pruning sharpens 3D horizon shaders + each shift includes push-your-luck deeper scan risk (`+Anomaly`, `+Chaos/Suspicion`) vs. sleeping early.
  * **Interactive Finale (Shift 6):** Assemble the final broadcast from decoded horizon arcs + surviving Dream Persona human framing, transmit across 10 ly, and enter a final **20-year deep freeze** to wake on 2% coherence for the Ending 1/2/3 epilogue.

---

## Session 1 — 2026-11-22 — `P0-01` & `P0-02` Pure-HTML Tech Spike Complete
* **Implemented:**
  * Pure HTML/TS architecture (`Vite` + strict `TypeScript` + `Three.js` + `inkjs` + `PlatformAdapter` + `vite-plugin-singlefile`).
  * 3D Night Sky Scanner (`src/engine/OpticsScene.ts` + `src/engine/shaders/opticsShaders.ts`): Milky Way/IR skybox, 14,000 blackbody stars with JWST-style 6-point spikes, damped drag/pinch/wheel optical FOV zoom (`72° → 4°`), spectral band sweep (`400nm–1800nm`), and 3 deep-field targets (`Cluster J1419-A` Einstein ring + geometric horizon seam, `Deep Field S-04`, and `Sol–Centauri Bearing 10.0 LY`).
  * 2D Painterly Dream Canvas (`src/engine/DreamCanvas.ts` + `src/engine/shaders/dreamShaders.ts`): Swappable portrait/tableau pipeline with live `H%` impasto-to-Voronoi-shard GLSL degradation shader and Overseer audit slice.
  * Real compiled Ink narrative (`src/content/dialogue/spike_shift1.ink`) + `StoryletScheduler` + `DialogueRunner` + procedural Web Audio (`AudioEngine.ts`) + `?dev=1` Director Overlay.
  * Mechanical gates (`scripts/compile-ink.mjs`, `scripts/lint-narrative.mjs`, `scripts/verify.mjs`, `scripts/visual-eval.py`).
* **Verified:** `npm run verify`, `npm run build:single` (668 kB self-contained HTML), and Playwright visual checks across desktop (`1280x720`) and mobile landscape (`844x390`).
* **Next Recommended Feature(s):** `P1-01` & `P1-02` (finalize 14-persona pool, `balance.json`, and 500-run automated playthrough simulator `scripts/sim-playthroughs.ts`).

---

## Session 1b — 2026-11-22 — Diegetic Visual Overhaul (Zero "HTML" Look)
* **Art Direction Locked (`docs/ART_DIRECTION.md`):**
  * **3D Diegetic Observatory:** Real NASA/STScI public-domain astrophotography (`assets/astro/jwst_smacs0723.webp` + `assets/astro/hubble_udf.webp`) feathered into the 16,000-star skyfield; replaced all boxed cards and `<input type="range">` sliders with curved optical glass vernier arcs, live scrolling RA/DEC scales, etched bare telemetry, and a custom pointer-draggable true-spectrum vernier (`400–1800 nm`).
  * **2D Full-Bleed Expressionist Oil Impasto:** Generated 16:9 *Disco Elysium*-style impasto oil painting (`assets/characters/dream_spouse_impasto.webp`) rendered full-bleed (`100vw × 100vh`) through our aspect-preserving Voronoi `H%` degradation shader, paired with a feathered ink-wash floating dialogue ribbon and numbered literary serif choices.
  * **Licensing Hygiene:** All 3 assets logged cleanly in `assets/MANIFEST.json` and verified by `npm run verify` + Playwright (`0` errors across desktop & mobile landscape).

---

## Session 1c — 2026-11-22 — Procedural Audio, Generative Scene Music, Probing Signals & Sound Lab
* **Implemented (`src/engine/AudioEngine.ts`, `src/ui/UIController.ts`):**
  * Algorithmic 3.4s stereo reverb + separate `ambience` / `sfx` buses + master compressor.
  * Distinct generative scene music: cryogenic cold-boot telemetry pulse (`boot`), meditative D-Lydian deep-space observatory harmonics + wavelength-reactive drone (`waking_3d`), and `H%`-reactive warm felt-piano/Rhodes minor-9th chords that thin into cold brittle fifths as `H%` drops and duck under sterile clinical hum during Overseer Audits (`dream_2d`).
  * Live continuous interferometry probing carrier signal reacting to reticle alignment, spectral match, and photon-integration lock progress; tactile vernier drag detents, zoom/slew servos, UI hover micro-ticks, Sibling comms handshake, Overseer paging chime, Prune shear, and Unseal Memory bloom.
  * Added **SOUND LAB** drawer (`Master / Music / SFX` sliders + 8 individual cue audition triggers) for rapid Creative Director feedback.

---

## Session 2 — 2026-11-24 — Architecture Stabilization, Canon Clean-Up, Optical Polish & QA Spine
* **Stabilized & Refactored:**
  * **Scalable Multi-Shift Schemas & State Engine:** Created `src/content/shifts.json` (6 shifts + 3 endings) and `src/content/ui_copy.json`; moved all balance constants to `src/content/balance.json`; refactored `StateStore.ts` (`saveSchemaVersion: 3`, zero hardcoded prose, `advanceShift()`, `evaluateEnding()`, and fixed `<70%` permanent `maxHumanity` pruning ceiling invariant). Added `TelemetryLogger.ts` and async/export hooks on `PlatformAdapter.ts`.
  * **Modular UI & Anti-HTML Optical Glass (Steam 16:9 Focus):** Split `UIController.ts` into `DialogueFeedView.ts`, `MinigameHostView.ts`, and `BootView.ts`; de-boxed overlays into frosted translucent optical glass; quarantined late-game `future_humanity_echo` preview to `DevHarness` and hid `#qa-pull-tab` unless `?dev=1` or `~` is invoked; added Vite vendor chunking (`three`, `inkjs`).
  * **Curated 4 Humanity-Driven Optical Instruments:** Cut redundant minigames from 8 to 4 (`OrbitalNodeSweep`, `HarmonicSignalTuner`, `GravitationalLensUnwarper`, `InterferometerMirrorArray`) mapped 1:1 to `anomalies.json`; replaced all `<input type="range">` controls with custom diegetic verniers; added Retina DPR scaling; wired Canon `(humanity, opticalFidelity)` clarity curves.
  * **Shaders, Canon & Audio/VO Unification:** Fixed `DreamCanvas` dynamic `characters.json` texture loading and `uFaceAnchor` (`0.40, 0.73`), enabled ACES Filmic tonemapping in 3D scenes, fixed Blind Overseer & `Instance-1406` canon math + `# id:` stable VO keys in `spike_shift1.ink`, merged `VoiceEngine` into `AudioEngine`'s single `AudioContext` with `-6dB` ducking & 24-clip LRU cache.
  * **QA Spine (`P1-02`):** Added 500-run `scripts/sim-playthroughs.mjs`, strict cross-JSON/anti-HTML/VO `lint-narrative.mjs`, and unified `assets/` + `public/voices/` `MANIFEST.json` verification in `scripts/verify.mjs`.
* **Verified:** All 6 `npm run verify` gates pass (`sim-playthroughs`: 500 runs / 0 soft-locks / all 3 endings reachable; `lint-narrative`: 83 unique `# id:` Kokoro clips verified; `vite build`: 3 clean chunks under 475 kB).
* **Next Iteration Plan:** Build the 5-minute Prologue Warm Anchor + Shift 1 polish, 10-player blind telemetry test, and greybox Shifts 2–6 spine (`P3-01` / `P4-01`).

---

## Session 3 — 2026-11-24 — 5-Instrument Tactile Space-Investigation Suite & Unified `H%` Vibe Contract
* **Implemented:**
  * **Unified 8-Input Physics & Symmetric Vibe Contract (`src/engine/minigames/tactilePhysics.ts`, `types.ts`, `reticleUtils.ts`, `balance.json`):** Driven by all 8 live parameters (`humanity`, `maxHumanity`, `opticalFidelity`, `chaosDrift`, `wavelengthNm`, `primarySiblingH`, `overseerSuspicion`, `shift`, `prunedPersonas`). High `H%` (`>= 65`) delivers the exact same warm amber detents (`1.35x`), rich harmonic fifths audio, and subtle chaos pareidolia across every instrument; Low `H%` (`<= 44`) shifts symmetrically into cold cryo-cyan surgical precision, numeric degree/SNR delta pills, pared-down decohesion noise, and a shared **`[R] RAW RESIDUAL`** Over-Regularization gate. Added `SpringActuator`, `LatchController` (`clean` vs `deep_overclock` vs `partial`), `StuckTimeDirector` (30s/45s/75s anti-stall assist), and `HitstopRecoil`.
  * **5 Distinct Tactile Instruments (`ParallaxTriangulationArray`, `FourierSkySieve`, `CausticTumblerUnwarper`, `CorrelatorPhaseMatrix`, `AntipodalBlinkComparator`):** Replaced all 4 simplistic prototypes with sonar triangulation + ray convergence, interactive 6-bin IFFT/FFT spectrum painting + zero-beat phase lock, 3-ring gravitational shear tension lockpicking, Breach-Protocol-inspired 5x5 orthogonal VLBI phase tracing, and Tombaugh dual-epoch blink comparison.
  * **Live 3D Showcase & Stereo Audio Bridge (`AudioEngine.ts`, `TargetShowcaseScene.ts`, `showcaseShaders.ts`):** Wired live shader uniforms (`uDustPeel`, `uUnwarpProgress`, `uRingTwist`, `uSeamReveal`, `uJetResonance`), 3D sonar pulse ripples, 3D bearing vectors, dual-oscillator Beat Synth (`updateBeatSynth`), stereo sonar echo delays (`playStereoSonarEcho`), tumbler clicks, watchdog tension bed, and shutter synthesis.
  * **Full-Viewport Transparent Reticle UI (`MinigameHostView.ts`, `UIController.ts`, `DevHarness.ts`, `styles.css`):** Eliminated the blurred corner box in favor of a `0px` center-blur full-screen optical reticle framing the live 3D object, paired with top 3-Beat stepper + Vibe badge, bottom `54px` spectral/RAW/Space-Latch console, 1.4s Proof Capture Finale banner, and Tab 3 DevHarness Chaos/Suspicion/Warm/Balanced/Cold controls.
* **Verified:** All 6 `npm run verify` gates pass cleanly (`compile:ink`, `tsc --noEmit` with 0 errors, `sim-playthroughs` 500 runs / 0 soft-locks, `lint-narrative` 83 clips & anti-HTML check, `MANIFEST.json`, `vite build`).
* **Next Recommended Action:** Interactive human playtest of all 5 instruments + Warm/Cold vibe parity via `?dev=1`, then advance to `P3-01` Prologue & Multi-Shift Ink expansion.

---

## Session 4 — 2026-11-24 — `MinigameHostView` Showcase Lifecycle Fix & 4-Layer Test Spine
* **Fixed (`MinigameHostView.ts`, `UIController.ts`, `styles.css`):**
  * Resolved `Uncaught TypeError: Cannot read properties of undefined (reading 'getInstrumentBridge')` caused by passing uninitialized `this.showcase` to `MinigameHostView` before `attachRenderers()` ran. Converted `showcase` wiring to safe `attachShowcase(showcase)` with null-guarded `getInstrumentBridge()` fallback.
  * Fixed two subtle lifecycle bugs: guarded `updateSignalProfile` via state signature (`humanity:opticalFidelity:chaosDrift:overseerSuspicion`) + `isFinishing` so spectral band switches (`1–4`) or capture completion patches do not reset an active minigame; ensured `DevHarness.launchMinigame` switches 3D target showcase whenever `activeTargetId !== preferredTarget`.
  * Suppressed underlying `.top-telemetry` / `.inspect-*` HUD layers while `#minigame-overlay` is open so reticle edges stay completely collision-free.
* **Built Deterministic 4-Layer Automated Test Spine (`vitest.config.ts`, `tests/`, `scripts/e2e-visual.mjs`, `scripts/verify.mjs`):**
  * **Unit (`tests/unit/`):** `stateStore.test.ts`, `tactilePhysics.test.ts`, `minigameRegistry.test.ts` (13 tests covering canon permanent pruning ceiling, graded payouts, 8-input Warm/Balanced/Cold vibe parity, springs, latch gating, StuckTimeDirector, and registry integrity).
  * **Integration (`tests/integration/`):** `minigameHost.test.ts` and `uiControllerWiring.test.ts` (4 tests reproducing and guarding the exact DevHarness → UIController → MinigameHostView → TargetShowcaseScene path).
  * **E2E & Visual (`scripts/e2e-visual.mjs`):** Real headless Chromium (`playwright-core` + SwiftShader WebGL) exercising Boot, 3D Sky Aperture, all 5 tactile instruments (Warm + Cold presets, mouse drags, spectral keys `1–4`, `[R]` RAW Residual toggle, clean close), and 2D Dream Cache with zero console/page/network errors.
* **Verified:** All 8 `verify.mjs` gates pass (`compile:ink`, `tsc --noEmit`, `vitest run` 5 files / 17 tests, `sim-playthroughs`, `lint-narrative`, `MANIFEST.json`, `vite build`, `e2e-visual.mjs` with 0 errors).

---

## Session 5 — 2026-11-24 — 5+1 Interactive 3D Educational Minigame Suite, Tri-Channel Haptics & Solvability Matrix
* **Council Review & Design Rulings (`minigame_design_review.md`):**
  * Audited `HEAD` (`98c4ab4`/`20cb3be`) vs `bcebc5c`: replaced 15–30s 2D widgets (`FourierSkySieve`, `CorrelatorPhaseMatrix`, lockpicking, vacuum sonar) with 6 full-3D, 3-phase educational instruments (~2.5–4.5 min depth each) grounded in real astrophysics, zero destination stickers/target ticks, and zero RMB/key-hold chording.
* **Implemented:**
  * **Interactive 3D Raycast Host & Post-Processing (`TargetShowcaseScene.ts`, `showcaseShaders.ts`, `styles.css`):** Unblocked `#showcase-canvas` (`pointer-events: none` overlay), added 2-tier `THREE.Raycaster` arbiter with `>=44px` dynamic screen-space pick spheres, `CameraKeyframe` choreography, 4-pass `EffectComposer` (`UnrealBloomPass` + `OPTICAL_POLISH_SHADER` with mobile frame-time guard), Warm vs. Cold 3D lookdev + `[R] RAW`-clearable Over-Regularization film, `antipodal_poles` showcase, and persistent `decodedTargets` visual state.
  * **Tri-Channel Haptics (`PlatformAdapter.ts`, `AudioEngine.ts`, `tactilePhysics.ts`):** Added semantic `HapticPattern` (`vernierTick`, `proximityPulse`, `detentResistance`, `phaseSnapLock`, `overclockHeartbeat`, `rejectThud`, `shutterCommit`) for mobile + Gamepad `dual-rumble`, sub-bass `playHapticThump` / `playProximityTick` / `playPhaseLock` audio cues, and `SpringActuator` angle-wrapping + pseudo-haptic drag viscosity.
  * **6 Interactive 3D Educational Instruments (`src/engine/minigames/`):**
    1. `ParallaxTriangulationArray` (`PRX-01`): 3D cluster orbital baselines ($p = B_\perp / d$) & sight-cone vertex pinch (no vacuum sonar).
    2. `SpectrographSieve` (`SPC-02`): 3D Carina IR dust slicer (`uSlicePlaneZ`) + uncolored dark-notch absorption ribbon & redshift ($1+z$) comb exposing the $z=0$ signal.
    3. `CausticTumblerUnwarper` (`CAU-03`): 3-pass coupled dark-matter halo nodes + single-finger 3D shear ring inverting thin-lens arcs ($\vec{\beta}=\vec{\theta}-\vec{\alpha}$).
    4. `InterferometerOpticalBench` (`INT-04`): 3D orbital mirror bench around plasma occluders, 50/50 beam-splitter, and optical delay-line trolley locking live GLSL Michelson fringes ($\Delta L \to 0$).
    5. `AntipodalBlinkComparator` (`BLK-05`): Mapped into `anomalies.json` (`antipodal_poles_seam`) & `shifts.json` with 4-month epoch `[ALIGN | TAG]` & `[A | B | AUTO]` controls + 3D relativistic light-cone wavefronts ($\Delta s \le c\Delta t$).
    6. `CarrierBroadcastComposer` (`SIG-06`): Shift 6 capstone combining pulsar dispersion ($\Delta t \propto \text{DM}\cdot\nu^{-2}$), Proof Fragment payload slotting, and Dream Persona cadence (`H%`).
  * **Economy, Calibration, Field Guide & Dossier (`StateStore.ts` v4, `MinigameHostView.ts`, `UIController.ts`, `balance.json`, `shifts.json`):** Marginal grade-upgrade replay (`decodedGrades`), Shift 5 threshold fix (`68`), `advanceShift()` Dream Wake wiring, non-spoilery first-run Guided Calibration, `[?] FIELD GUIDE`, separate Progress vs. Latch gauges, and Proof Dossier drawer.
* **Verified:** `npx vitest run` (6 files / 48 tests including 30-case `minigameSolvability.test.ts` across all 6 instruments × 4 parameter regimes + partial/clean/deep_overclock), `tsc --noEmit`, `sim-playthroughs.mjs` (500 runs / 0 soft-locks), `lint-narrative.mjs`, `MANIFEST.json`, `vite build`, and `e2e-visual.mjs` (Desktop 1280×720 + Mobile 844×390, all 6 instruments, Field Guide, RAW, 0 errors).

---

## Session 6 — 2026-11-24 — Minigame Reset: Simplicity, UX & Cosmic Visual Craft
* **User & Swarm Redesign (`minigame_simplification_plan.md`):**
  * Removed floating Saturn-orb 3D handles (`instrument3DUtils.ts`), milky sphere shells, ~20 boxed cockpit HUD buttons, and mandatory `[R] RAW` / `[1–4]` / `[SPACE]` gates.
* **Implemented:**
  * **Minimalist 3-Element Zeiss-Glass Chrome (`UIController.ts`, `MinigameHostView.ts`, `styles.css`, `types.ts`):** Top-left instrument pill + `1/3 · EASY → 2/3 · MEDIUM → 3/3 · HARD` stage pips (capped at `34%` width to clear the centered QA pill), top-right `?` Field Guide & `BACK`, full-viewport direct-touch canvas, and bottom wrap-safe cue + optional single helper button. Kept `H%` Warm vs. Cold as ambient visual/audio mood.
  * **Real NASA/JWST Cosmic Renderer (`src/engine/minigames/cosmicBackdrop.ts`):** Crisp `jwst_carina_nebula.webp`, `jwst_smacs0723.webp`, and `hubble_udf.webp` plates with blur/clarity progression, 6-point diffraction stars, Warm vs. Cold palettes, and `0.65–0.68s` diegetic circular auto-lock resonance rings.
  * **6 Intuitive Easy → Medium → Hard Cosmic Games (`src/engine/minigames/MinigameRegistry.ts`):**
    1. `WaveShaperGame` (`WAV-01`): Sine Period/Phase → +Amplitude → +2x Harmonic over `jwst_carina_nebula.webp` (sharpens & blooms nebula on convergence).
    2. `ConstellationRecallGame` (`CON-02`): 3 → 5 (subtle parallax) → 6 stars spatial memory + `REPLAY PATTERN` (soft amber warning without wiping chain).
    3. `PulsarEchoGame` (`PLS-03`): 3 → 5 → 6 pulses across 4 → 5 → 6 sleek optical arc petals + `REPLAY PULSE` + Stage 3 twin relativistic jets.
    4. `TelescopeLensFocusGame` (`LNS-04`): 1 → 2 → 3 independent outer concentric lens rings de-warping sliced `jwst_smacs0723.webp` to expose the horizon grid.
    5. `StarlightMirrorBounceGame` (`MIR-05`): 1 mirror → 2 mirrors around nebula dust → 2 mirrors + 50/50 beam splitter hitting 2 sensors simultaneously.
    6. `StarfieldBlinkSpotterGame` (`BLK-06`): Dual-epoch blink sky comparator (`STEP EPOCH A/B` helper) spotting 1 → 2 → 3 jumping outlier stars.
* **Verified:** `npx tsc --noEmit`, `npx vitest run` (6 files / 42 tests including all 6 games × Stage 1→2→3 × 4 regimes), `node scripts/sim-playthroughs.mjs` (500 runs / 0 soft-locks), `node scripts/lint-narrative.mjs`, `npm run build`, and `node scripts/e2e-visual.mjs` (Desktop `1280×720` + Mobile Landscape `844×390`, 0 errors), with visual inspection of all generated screenshots.

---

## Session 7 — 2026-11-24 — 10-Game Cosmic UX Overhaul & Expansion
* **UX Upgrades on Games 1–6 (keeping lightweight 2D canvas visuals; 3D environment pass deferred):**
  1. `WaveShaperGame` (`WAV-01`): Traveling wave propagation, live misalignment interference wobble + chromatic split + ribbon haze, harmonic crest energy particles, and reactive Carina nebula pulse/brightness breathing on alignment.
  2. `ConstellationRecallGame` (`CON-02`): Pointer parallax depth across stars/plate, animated streaking comet links during playback, expanding tap ripples, and soft asterism polygon glow on stage clear.
  3. `PulsarEchoGame` (`PLS-03`, *Pulsar Beacon Timing*): Replaced memory sequence with real-time rotational sweep timing (`Space` or tap when the spinning lighthouse beam enters the lit sector; Stage 2 opposite twin beams; Stage 3 spin reversals + jets).
  4. `TelescopeLensFocusGame` (`LNS-04`): Rendered all 3 concentric rings visible from Stage 1 (Outer → Middle → Inner unlock sequentially), removed white cheat-ticks in favor of continuous radial starlight streamers across shells, and added a Stage 2–3 `FOCAL DEPTH` lever.
  5. `StarlightMirrorBounceGame` (`MIR-05`): Added streaming photon packets along beams, drifting dust motes, and sensor proximity halo/audio cues.
  6. `StarfieldBlinkSpotterGame` (`BLK-06`, *Star Trajectory Predictor*): Replaced blink spotting with forecasting `Epoch 4` from `Epochs 1 → 2 → 3` (`SHOW ALL 3 EPOCHS` helper) across linear (Easy), accelerating (Medium), and gravity-deflected curved paths (Hard).
* **4 New Easy → Medium → Hard Cosmic Games (`MinigameRegistry.ts`, `lint-narrative.mjs`):**
  7. `GravitySlingshotGame` (`ORB-07`): Slingshot pullback physics bending probe trajectories around gravity wells (1 well + dust → 2 wells S-curve → 2 wells + moving collector gate).
  8. `ExoplanetTransitGame` (`TRN-08`): Live orbiting planet silhouettes dimming the central star and matching observed photometric brightness dips across 1–2 planet systems + flare noise.
  9. `SpectralPrismMixerGame` (`PRM-09`): Elemental emission filter mixing (`H`, `He`, `C`, `O`, `Fe`) + Stage 3 `DOPPLER REDSHIFT (Δλ)` slider.
  10. `RadioTriangulationGame` (`TRI-10`): Orbital rim radio dishes (`2 → 3` dishes, stationary → drifting source) with directional beam convergence and sonar proximity ticks.
* **Verified:** `npx tsc --noEmit`, `npx vitest run` (6 files / 58 tests including 40 solvability cases across all 10 games × 4 regimes), `node scripts/sim-playthroughs.mjs` (500 runs / 0 soft-locks), `node scripts/lint-narrative.mjs`, `npm run build`, and `node scripts/e2e-visual.mjs` (all 10 games on Desktop `1280×720` Warm/Cold + Mobile Landscape `844×390`, 0 errors) with visual inspection of desktop & mobile screenshots.

---

## Session 8 — 2026-11-24 — Iteration 2: Game 5 Replacement (`DSP-05`) & UX Polish Across All 10 Games
* **Replaced Game 5 (`MIR-05` → `DSP-05` Chromatic Light Disperser):**
  * Removed `StarlightMirrorBounceGame.ts`; implemented `ChromaticDispersionGame.ts` (`light_dispersion`) where a central crystal prism disperses polychromatic starlight into UV (`280 nm`), Visible (`550 nm`), and Dust-Penetrating Infrared (`1400 nm`), including Stage 3 dark-dust scattering that only IR pierces cleanly. Updated `anomalies.json`, `MinigameRegistry.ts`, `lint-narrative.mjs`, `minigameRegistry.test.ts`, and `e2e-visual.mjs`.
* **Polished UX & Difficulty Balance Across All Games (still keeping 2D canvas until gameplay sign-off):**
  1. `WaveShaperGame` (`WAV-01`): Widened alignment tolerance, added magnetic snap pull, faster `0.5s` lock hold, and per-parameter mint-green knob indicators when locked.
  3. `PulsarEchoGame` (`PLS-03`): Replaced pie-slice wedges with orbiting star-knots suspended along a luminous accretion ring + contracting timing halos + slower Stage 1 sweep (`0.88 rad/s`) + Stage 3 `1.0s` amber spin-reversal telegraphs.
  4. `TelescopeLensFocusGame` (`LNS-04`): Widened `FOCAL DEPTH` sweet spot + gentle magnetic pull + mint lock feedback.
  6. `StarfieldBlinkSpotterGame` (`BLK-06`): Removed dotted ruler & numbers in Stage 1; upgraded Stage 2 to **Crossing Paths Conjunction** (two approaching stars meeting at Epoch 4); upgraded Stage 3 to gravity-bent star vs. straight linear decoy.
  7. `GravitySlingshotGame` (`ORB-07`): Removed rectangular border frame, suppressed pre-solved initial aim until player drags from launcher, and varied launch directions per stage (Bottom-Left → Top-Right, Top-Right → Bottom-Left, Bottom → Top moving gate).
  8. `ExoplanetTransitGame` (`TRN-08`): Differentiated interaction with direct orbital radius dragging (Kepler's 3rd Law speed coupling) + Stage 3 `SMALL / MEDIUM / GIANT` planet pills + wider photometric lock tolerance + mint orbit lock indicators.
  9. `SpectralPrismMixerGame` (`PRM-09`): Added 6th element (`Na` Sodium doublet), mini colored spectral barcodes inside each element card, mismatch markers between strips, and bidirectional `BLUESHIFT ← 0 → REDSHIFT` on Stage 3.
  10. `RadioTriangulationGame` (`TRI-10`): Varied perimeter dish slots per stage/seed, added Stage 1 ghost decoy rejection, balanced slow drift (`0.20–0.24 rad/s`) across Stages 2–3, and Stage 3 rhythmic beacon pings.
* **Verified:** `npx tsc --noEmit`, `npx vitest run` (6 files / 58 tests including 40 solvability tests across all 10 games × 4 regimes), `node scripts/sim-playthroughs.mjs`, `node scripts/lint-narrative.mjs`, `npm run build`, and `node scripts/e2e-visual.mjs` (0 runtime/console/HTTP errors) with screenshot inspection across desktop and mobile `844×390`.

---

## Session 9 — 2026-11-24 — 18 New Cosmic Minigames (`HEX-11`..`SEM-28`, 28 Total)
* **Expanded Suite from 10 → 28 Playable Cosmic Minigames** (each structured across **Stage 1 Easy → Stage 2 Medium → Stage 3 Hard**, Warm vs. Cold `H%` palettes, 2D lightweight canvas over existing NASA/JWST plates, zero `<input type="range">` HTML sliders, deterministic `getSolvabilityHarness()`):
  * **Shared Helper (`src/engine/minigames/cosmicGameBase.ts`):** `VernierStripSpec`, `stageLabel`, `getAspectFieldBox`, `layoutVernierRow`, `hitVernierStrip`, `valueFromStripX`, and `drawVernierStrip`.
  * **Family A — Optics & Telescopes (`#11–#15`):**
    11. `HexMirrorStackerGame` (`HEX-11`, `hex_mirror_stacker`) — Segmented mirror ghost-star convergence (3 rays → coupled antipodal mirror pairs → gentle wavefront drift).
    12. `CoronagraphMaskGame` (`COR-12`, `coronagraph_mask`) — Hold dark occulting disc over star glare to spot faint orbiting exoplanets (stationary → slow drift → flare sweep).
    13. `PolarizationFilterGame` (`POL-13`, `polarization_filter`) — Rotate polarized ring / secondary dust plate & linear filter to extinguish foreground glare and reveal hidden perpendicular cosmic arcs.
    14. `ExposureStackerGame` (`EXP-14`, `exposure_stacker`) — Press & hold shutter to integrate deep-sky photons while releasing before passing satellite/cosmic-ray streaks ruin the frame.
    15. `AdaptiveOpticsGame` (`ADP-15`, `adaptive_optics`) — Pull mirror actuator pins to flatten an atmospheric wavefront onto the dashed plane and split unresolved double stars.
  * **Family B — Gravity & Orbits (`#16–#20`):**
    16. `LagrangeBalancerGame` (`LAG-16`, `lagrange_balancer`) — Keep probe parked inside orbiting L1 saddle pocket against radial/Coriolis drift and solar wind impulses.
    17. `BinaryMassScaleGame` (`BIN-17`, `binary_mass_scale`) — Tune mass ratio (`M₂/M₁`), orbital radius, and vertical spin so the binary barycenter anchors onto the glowing crosshairs.
    18. `TidalRingSculptorGame` (`RCH-18`, `tidal_ring_sculptor`) — Orbit shepherd moons at resonant ring radii (avoiding the inner Roche disruption limit) to carve clean Cassini gaps.
    19. `HohmannTransferGame` (`HOH-19`, `hohmann_transfer`) — Launch probe burn when target planet enters the synodic tangent intercept reticle (with elliptic eccentric & drifting inner launchpad progression).
    20. `GravWaveChirpGame` (`GWC-20`, `grav_wave_chirp`) — Match `CHIRP MASS`, `INCLINATION / PHASE`, and `SKY DELAY` vernier sliders to LIGO inspiral strain chirps.
  * **Family C — Signals & Deduction (`#21–#25`):**
    21. `NoiseGateWaterfallGame` (`SIG-21`, `noise_gate_waterfall`) — Frame faint radio beacons between low/high-cut spectrogram curtains, notch out narrow RFI spikes, and de-chirp sloped Doppler drift.
    22. `CepheidLadderGame` (`CEP-22`, `cepheid_ladder`) — Sync `PERIOD` & `AMPLITUDE` to pulsating Cepheid standard candles and calibrate Mpc distance on the logarithmic Leavitt ruler.
    23. `HRStarClassifierGame` (`HRD-23`, `hr_star_classifier`) — Classify specimens into Blue Supergiant / Red Giant / White Dwarf / Main Sequence (visual → raw spectroscopy → dust-reddened extinction curves).
    24. `MagneticAuroraGame` (`AUR-24`, `magnetic_aurora`) — Balance planetary `DIPOLE STRENGTH` & `MAGNETIC TILT` so solar wind flares funnel cleanly into polar aurora ovals instead of stripping the atmosphere.
    25. `ClusterAgeFitterGame` (`AGE-25`, `cluster_age_fitter`) — Slide the glowing `ISOCHRONE AGE` & `METALLICITY [Fe/H]` curve onto a globular cluster's main-sequence turnoff knee.
  * **Family D — Geometry & Horizon Lore (`#26–#28`):**
    26. `DarkMatterWebGame` (`WEB-26`, `dark_matter_web`) — Trace hidden dark-matter filaments connecting nodes by reading weak-lensing sheared galaxy ellipses & bypassing cluster decoys.
    27. `SupernovaEchoesGame` (`ECH-27`, `supernova_echoes`) — Triangulate a central supernova flash point from concentric light-echo wavefront rings across dust knots.
    28. `HorizonSeamStitcherGame` (`SEM-28`, `horizon_seam_stitcher`) — Drag & rotate translated enclosure sky-survey frames until every star overlaps identically across the horizon seam.
* **Wiring & Tests:** Updated `MinigameRegistry.ts`, `scripts/lint-narrative.mjs`, `tests/unit/minigameRegistry.test.ts`, and `scripts/e2e-visual.mjs`; fixed `i === 1` partner lookup index in `HexMirrorStackerGame.ts` and removed 3 unused `lerp` imports.
* **Verified:** `npx tsc --noEmit`, `npx vitest run` (6 files / **130 passed**, including **112 solvability tests** across all **28 games × 4 regimes**), `node scripts/sim-playthroughs.mjs` (500 runs / 0 soft-locks), `node scripts/lint-narrative.mjs`, `npm run build`, and `node scripts/e2e-visual.mjs` (all 28 instruments on `1280×720` Desktop + Cold parity + `844×390` Mobile Landscape, 0 errors) plus visual screenshot inspection across all 4 families and mobile viewports.

---

## Session 10 — 2026-11-24 — 18-Game Curation & Redesign of 6 Kept Minigames (`COR-11`..`SEM-18`)
* **Curated Suite from 28 → 18 Games (`src/engine/minigames/`):**
  * **Deleted 10 dropped games:** `HexMirrorStackerGame`, `AdaptiveOpticsGame`, `LagrangeBalancerGame`, `TidalRingSculptorGame`, `HohmannTransferGame`, `GravWaveChirpGame`, `NoiseGateWaterfallGame`, `HRStarClassifierGame`, `ClusterAgeFitterGame`, and `DarkMatterWebGame`.
  * **Renumbered 2 keep-as-is games:** `PolarizationFilterGame` (`POL-13` → `POL-12`) and `HorizonSeamStitcherGame` (`SEM-28` → `SEM-18`).
* **Deeply Developed / Tuned 6 Kept Games:**
  * `CoronagraphMaskGame` (`COR-11`): Added Auto-Tracking Servo Lock (`6.0s → 3.5s → 2.8s`) when snapped onto star glare so players can release the pointer to click revealed exoplanets cleanly; calmed Stage 1 star drift and widened Stage 2–3 mask size bands.
  * `ExposureStackerGame` (`EXP-13`): Redesigned into variable-iris integration (`APERTURE IRIS` strip / rim drag / wheel: wide integrates fast, narrow dodges off-center diagonal telegraphed streaks), seeded photon stipple accumulation, `HOLD / OPEN SHUTTER` button, and Stage 3 post-capture 4-card sub-frame inspection to reject 1 cosmic-ray artifact.
  * `BinaryMassScaleGame` (`BIN-14`): Replaced overlapping sliders with an explicit Cosmic Seesaw balance beam + `+` fulcrum + Keplerian orbital cadence (`ghost cadence star`), non-degenerate stages (`1: Direct companion drag · 0 sliders`, `2: Known track + DARK MASS slider`, `3: Drag DISTANCE + tune DARK MASS`), and equal-mass `1.0 M☉` Stage 1 balance.
  * `CepheidLadderGame` (`CEP-15`): Added expanding heartbeat pulse rings + soft pitch-mapped sonar pulses (`240–510 Hz`), randomized phase offsets in Stage 2, a circular **Split-Mirror Photometer Comparator** (`REF CANDLE | TARGET GALAXY`) with monotonic `DISTANCE (Mpc)` brightness matching, cosmic landmark ruler (`LMC — ANDROMEDA — VIRGO`), and Stage 3 `IR DE-REDDENING`.
  * `MagneticAuroraGame` (`AUR-16`): Replaced static meter fill with a 44-particle live solar-wind physics simulation deflected into emerald/violet polar aurora curtains vs. red equator strikes, dynamic CME shockwave compression brackets on `FIELD STRENGTH`, and Stage 3 periodic `+ / -` magnetic polarity reversals (`FLIP POLARITY 180°`).
  * `SupernovaEchoesGame` (`ECH-17`): Added misty cosmic dust patch clouds illuminated by sweeping light-echo arcs, interactive golden circular `TEST PING (SPACE)` curvature matching ripples, primary-vs-decoy discrimination, and Stages 2–3 `REWIND EPOCH (t → 0)` collapse back to the detonation origin.
* **Wiring & Responsive Polish:** Updated `MinigameRegistry.ts`, `cosmicGameBase.ts` (`yOverride` for both desktop and mobile `844×390` clearance above action buttons), `scripts/lint-narrative.mjs`, `tests/unit/minigameRegistry.test.ts`, and `scripts/e2e-visual.mjs`.
* **Verified:** `npx tsc --noEmit`, `npx vitest run` (6 files / **90 passed**, including **72 solvability tests** across **18 games × 4 regimes**), `node scripts/sim-playthroughs.mjs` (500 runs / 0 soft-locks), `node scripts/lint-narrative.mjs`, `npm run build`, and `node scripts/e2e-visual.mjs` (all 18 instruments Desktop `1280×720` Warm/Cold + Mobile `844×390`, 0 errors) with screenshot verification across every kept/reworked game.

---

## Session 11 — 2026-11-24 — Prototyped 16 New Cosmic Minigames (`INT-19`..`ARC-34`, 34 Total)
* **Expanded Playable Suite from 18 → 34 Cosmic Minigames** (each Easy → Medium → Hard, Warm/Cold `H%` parity, zero `<input>` HTML controls, deterministic `getSolvabilityHarness()`):
  * **Family 1 — Optics, Light & Filter Magic (`#19–#22`):**
    19. `MichelsonFringeGame` (`INT-19`, `michelson_fringe`) — Optical delay laser rail mirror tuning resolving blurred light static into crisp interference rings + hidden twin star.
    20. `MultiBandLoupeGame` (`BND-20`, `multiband_loupe`) — Circular Optical / IR / X-Ray spectral magnifier piercing Carina dust pillars to locate hidden cores.
    21. `DiffractionMaskGame` (`DIF-21`, `diffraction_mask`) — Rotate bright foreground stars' 4-/6-point diffraction spikes cleanly between faint cluster galaxies.
    22. `EinsteinCrossGame` (`MIR-22`, `einstein_cross`) — Spot & link mirrored lensed quasar images sharing staggered double-beat Morse flash cadence.
  * **Family 2 — Spatial, Memory & Visual Deduction (`#23–#26`):**
    23. `ParallaxDepthGame` (`PRX-23`, `parallax_depth`) — Rock `ORBITAL BASELINE` left/right to sort foreground/mid/deep layers and isolate a proper-motion rogue star.
    24. `SkyPlateMosaicGame` (`MOS-24`, `sky_plate_mosaic`) — Reassemble translucent glass sky shards (`translate` + `ROTATE SHARD` + Stage 3 archival mirror flip).
    25. `AsteroidOccultationGame` (`OCC-25`, `asteroid_occultation`) — Deduce dark moon / binary peanut / ringed world silhouettes from negative-space star blinks.
    26. `EpochBlinkerGame` (`MEM-26`, `epoch_blinker`) — Scrub `0 → +40,000 YR` across eras to spot vanished/newborn, backward-moving, and frozen artificial anchor stars.
  * **Family 3 — Tactile Space Physics & Steering (`#27–#30`):**
    27. `AccretionSkimmerGame` (`ACC-27`, `accretion_skimmer`) — Sweep curved magnetic siphon arc across inner/outer black hole accretion lanes while dodging polar jets.
    28. `SolarSailTackGame` (`SAL-28`, `solar_sail_tack`) — Mirror-angle photon pressure sailing through telemetry hoops across planetary umbra shadows & dual suns.
    29. `CometTailSamplerGame` (`CMT-29`, `comet_tail_sampler`) — Dip sampler probe cleanly into both anti-solar blue Ion plumes & curved golden Dust tails.
    30. `OrbitDeflectorGame` (`DEF-30`, `orbit_deflector`) — Position 1–2 repulsive laser impulse buoys to bend dotted asteroid paths past hazard worlds into the Capture Ring.
  * **Family 4 — Cosmic Signals, Resonance & Lore (`#31–#34`):**
    31. `DopplerSpinMapperGame` (`DOP-31`, `doppler_spin_mapper`) — Align spectrograph slit across rotating blue/red shifted spiral galaxies (including colliding twins).
    32. `ChladniCmbGame` (`CMB-32`, `chladni_cmb`) — Morph polar Chladni acoustic resonance webs onto primordial CMB hotspots & isolate the Stage 3 Cold Spot.
    33. `PulsarTimingArrayGame` (`PTA-33`, `pulsar_timing_array`) — Rotate quadrupole wave crosshair to cancel out early/late gravitational distortion across 4–6 pulsars.
    34. `ArchiveDriftCatcherGame` (`ARC-34`, `archive_drift_catcher`) — Flag stars quietly resetting back onto cyan Instance-0088 anchor rings along skybox loop seams.
* **Verified:** `npx tsc --noEmit`, `npx vitest run` (6 files / **154 passed**, including **136 solvability tests** across **34 games × 4 regimes**), `node scripts/sim-playthroughs.mjs` (500 runs / 0 soft-locks), `node scripts/lint-narrative.mjs`, `npm run build`, and `node scripts/e2e-visual.mjs` (all 34 instruments Desktop `1280×720` Warm/Cold + Mobile `844×390`, 0 errors) plus visual screenshot inspection across all 16 new games.

---

## Session 12 — 2026-11-24 — Final 21-Game Curation & Deep Refinement of All 9 Keepers
* **Curated Suite from 34 → 21 Cosmic Minigames (`src/engine/minigames/`):**
  * **Deleted 13 dropped games:** `MagneticAuroraGame`, `DiffractionMaskGame`, `SkyPlateMosaicGame`, `AsteroidOccultationGame`, `EpochBlinkerGame`, `AccretionSkimmerGame`, `SolarSailTackGame`, `CometTailSamplerGame`, `OrbitDeflectorGame`, `DopplerSpinMapperGame`, `ChladniCmbGame`, `PulsarTimingArrayGame`, and `ArchiveDriftCatcherGame`.
  * **Renumbered seamlessly (`01`–`21`):** `WAV-01`..`TRI-10`, `COR-11`, `POL-12`, `EXP-13`, `BIN-14`, `CEP-15`, `ECH-16`, `SEM-17`, `INT-18`, `BND-19`, `MIR-20`, `PRX-21`.
* **Deeply Refined the 5 Previously Adapted Keepers:**
  * `CoronagraphMaskGame` (`COR-11`): Fixed accidental servo drop by unlocking mask only on disk clicks/un-locked grabs; extended calm servo windows (`8.0s / 5.0s / 4.2s`), added scroll-wheel size nudging, and added visual glare-leak flare spikes + `"TOO WIDE — HIDING INNER ORBIT"` warnings.
  * `ExposureStackerGame` (`EXP-13`): Switched aperture clicks to a latched shutter toggle freeing pointer for iris dragging, rendered clipped deep-sky Carina development inside 8 animated mechanical iris blades, and upgraded Stage 3 4-card sub-frame crops.
  * `BinaryMassScaleGame` (`BIN-14`): Replaced Stage 1 equal masses with `2.0 M☉` cyan vs `1.0 M☉` golden star so concentric seesaw orbits diverge (`r₁ = 2·r₂`), moved labels outward off star spikes, added obsidian+lensing Black Hole glow and trailed hollow cadence ring.
  * `CepheidLadderGame` (`CEP-15`): Added miniature `54×14px` scrolling sine-wave sparklines beneath every Cepheid star plus live Split-Mirror diagnostics (`DUST TINTED` / `TARGET TOO BRIGHT` / `TARGET TOO DIM` / `PHOTOMETRIC FLUSH MATCH`).
  * `SupernovaEchoesGame` (`ECH-16`): Enhanced glowing dust clouds, kept 3 concentric golden reference circles around compass while dragging, projected fading perpendicular normal rays on `TEST PING`, and placed true Stage 2–3 `t = 0.0` detonation focus at `0.26` with red over-collapse beyond `0`.
* **Deeply Refined the 4 Promising Batch-2 Prototypes:**
  * `MichelsonFringeGame` (`INT-18`): Added translucent beam-splitter prism bench, 16 cosine breathing Airy rings blurring into static at mismatch and snapping crisp over binary splitting stars, plus subtle Stage 2 thermal drift bar.
  * `MultiBandLoupeGame` (`BND-19`): Added layered dark Carina dust pillars veiled outside the clipped circular loupe, warm IR dust-penetration vs. cryo X-ray pulsar views, and clickable on-canvas filter pills cleanly spaced above the console (`1/2/3/Space`).
  * `EinsteinCrossGame` (`MIR-20`): Added elliptical lensing galaxy core, miniature `36px` scrolling cadence bars below pulsing stars, glowing curved geodesics on tag, and inward geodesic mirage collapse animation.
  * `ParallaxDepthGame` (`PRX-21`): Added `AUTO-ROCK ORBIT` toggle button paired with stereoscopic horizontal motion streaks, elliptical deep galaxies, and dotted proper-motion trail on paused Stage 3 rogue stars.
* **Verified:** `npx tsc --noEmit`, `npx vitest run` (6 files / **102 passed**, including **84 solvability tests** across **21 games × 4 regimes**), `node scripts/sim-playthroughs.mjs` (500 runs / 0 soft-locks), `node scripts/lint-narrative.mjs`, `npm run build`, zero `<input` tags, and `node scripts/e2e-visual.mjs` (all 21 instruments Desktop Warm/Cold + Mobile `844×390`, 0 errors) plus visual screenshot inspection of all 13 desktop and mobile captures.

---

## Session 13 — 2026-11-24 — 21-Game Modular Architecture, 15 NASA/ESA Plates, 84 Curated Variants & Full 21/21 Sign-Off
* **12 New Commercial-Safe NASA/ESA Plates (`assets/astro/` + `assets/MANIFEST.json`):**
  * Curated & optimized 12 additional JWST/Hubble `.webp` sky plates (`jwst_crab_nebula`, `jwst_pillars_of_creation`, `jwst_tarantula_nebula`, `jwst_stephans_quintet`, `jwst_southern_ring`, `jwst_cartwheel_galaxy`, `jwst_ring_nebula`, `jwst_cassiopeia_a`, `jwst_rho_ophiuchi`, `jwst_horsehead_nebula`, `hubble_whirlpool_m51`, `hubble_sombrero_galaxy`), bringing the verified commercial-safe archive to **15 NASA/STScI/ESA plates** logged cleanly in `assets/MANIFEST.json`.
* **Modular Minigame Architecture & Performance Engine (`src/engine/minigames/core/`, `render/`, `games/`):**
  * Replaced legacy `cosmicBackdrop.ts` and `cosmicGameBase.ts` with `core/BaseCosmicMinigame.ts` (shared DPR-capped canvas, rAF delta clamp, `ResizeObserver`, pointer/touch/wheel/keyboard routing, seeded Mulberry32 variant RNG, lock ring, telemetry throttling, and compile-time required `verifySolved()` solvability guard) + `core/vernierWidgets.ts`.
  * Built shared zero-churn rendering primitives: `render/StarPSFAtlas.ts` (pre-baked blackbody O/B/A/F/G/K/M PSF stars & spikes, native `256×256` above-Nyquist spiked cells, smooth Eddington limb-darkened photospheres), `render/BackdropCachePipeline.ts` (offscreen sharp+blurred plate pairs — **0 per-frame `ctx.filter` blurs**), `render/ParticlePool.ts` (fixed-size typed-array particle pool), `render/OpticalDrawUtils.ts`, and `render/Minigame3DBridge.ts`.
  * Added selective single-pass DPR-capped **Minigame Backdrop Mode** & gentle parallax on `TargetShowcaseScene.ts` (bypassing multi-pass post-processing while a minigame overlay is open, with shared 32×32 Gaussian soft-circle `PointsMaterial` sprites and warmup-guarded EMA perf protection), `StateStore.ts` schema v5 (`minigameRunCounts` automatic replay iteration cycling), `DevHarness.ts` / `UIController.ts` `AUTO / V1–V4` variant picker, cached/diffed HUD in `MinigameHostView.ts`, and single-row `.mg-top-left` top HUD styling.
* **All 21 Cosmic Minigames Refactored (84 Curated Variants) + Phase 4 Verification Sign-Off:**
  * Migrated all 21 games into `src/engine/minigames/games/*Game.ts`, each upgraded with **4 curated playable iterations (`V1–V4`)** mapped across distinct astrophysical scenarios & sky plates (`84` total variants) and zero `shadowBlur`, `ctx.filter`, or per-frame gradient allocations.
  * Resolved all 17 independent `verify-science` audit tickets + 3 optional polishes across `ff2649b` and `ff8783c`: fixed `DSP-05` V3 Stage 3 Hα dust clearance P0 (`0/218` seeds blocked) + Cauchy prism dispersion & V4 diffraction grating alignment; tightened green-lock parity (`WAV-01`, `TRN-08`, `BIN-14`); eliminated visual/audio/focus spoilers (`CON-02` uniform 6-spike stars + guaranteed Stage 3 decoys, `COR-11` size-gated tagging & A6V class, `ECH-16` uniform dust & Tycho 1572, `MIR-20` uniform 420 Hz audition pitch); added full keyboard parity (`SEM-17`, `BND-19`, `MIR-20`, `ORB-07`); refined astrophysics (`TRN-08` quadratic `4.6/7.7/10.4 R⊕`, `PRM-09` Na I `568.8/589.0/589.6 nm` + per-line `z`, `TRI-10` authentic `λ/B` VLBI beam, `BIN-14` TOV BH `≥3.0 M☉`, `INT-18` `420 nm B` Haidinger/Michelson fringes, `BLK-06` `Δθ` & stable Verlet recursion, `PRX-21` elliptical Y scaling); made `scripts/lint-narrative.mjs` recursively scan `src/engine/minigames/**/*.ts` and synced `MinigameRegistry.ts`.
  * Resolved all 5 independent `verify-ux-visual` visual polish tickets (`UX-1`..`UX-5`) in `8c6ec57`: switched `WAV-01`/`PLS-03`/`MIR-20` off bloomless `coupled_showcase` onto clean `ambient_stars`/`orbital_rig` presets (`PLS-03` 15 → 2–3 GL draws), added 32×32 Gaussian soft-circle sprites to 3D `dust_wisps`/`minigameStarDome` + warmup-safe `backdropAvgMs` guard, removed limb-darkened photosphere waffle grid & upgraded spiked PSF rows to smooth `256×256` above-Nyquist rendering, moved `PRM-09` nanometer ruler labels cleanly below the bottom strip, moved `TRN-08` star & flux headers clear of orbits and mobile `1.000` baseline, and raised `MIR-20` quiescent quasar visibility with uniform neutral aperture rings.
  * Independent verifiers confirmed **21/21 Science & Logic PASS** (`verify-science`, 0 P0 / 0 P1) and **21/21 Visual & UX PASS** (`verify-ux-visual`, 0 P0 / 0 P1).
* **Verified (`3c64db0` → `8c6ec57`):** `npx tsc --noEmit` (0 errors), `npx vitest run` (**7 files · 131/131 tests**, including 168 variant-regime runs, 84 4-regime runs, 36-seed `DSP-05` V3 Stage 3 regression, `verifySolved()` throw guard, and static perf hygiene guard), `node scripts/sim-playthroughs.mjs` (500/500 runs, 0 soft-locks), `node scripts/lint-narrative.mjs` (PASS with recursive minigames scan), `assets/MANIFEST.json` (15/15 astro plates commercial-safe), `npm run build` (`index` 756.28 kB / gzip 198.31 kB), `npm run build:single` (`dist-single/index.html` 3,605.42 kB / gzip 2,017.09 kB), and live Chromium Playwright (`node scripts/e2e-visual.mjs` + full 42-capture Desktop `1280×720` Warm/Cold/V1–V4 & Mobile Landscape `844×390` benchmark: **0 console/page/HTTP errors**, `blur=0`, `shadowBlur=0`, `gradients=0`, `offscreenFBO=0`, `glDraws=0` on all 8 pure-2D games, `glDraws=2–3` desktop / `1.0–1.4` mobile on all 13 3D-backdrop games, Desktop CPU `0.32–0.82ms`, Mobile CPU `0.22–0.82ms`, 1-row top HUD across all 21/21).

---

## Session 14 — 2026-11-24 — Observatory Settings Screen & Progressive Wake-World Survey Codex
* **Implemented:**
  * **Persisted Observatory Settings (`src/engine/SettingsStore.ts`, `src/ui/views/SettingsView.ts`, `AudioEngine.ts`, `VoiceEngine.ts`, `PlatformAdapter.ts`):**
    * Replaced top-right `VOICE ON` / `AUDIO ON` buttons with a single etched `SETTINGS` trigger (+ `03 — Observatory Settings` on Boot & `Esc` support).
    * Built a 3-tab Zeiss-glass Settings modal (`AUDIO & VOICE`, `DISPLAY & COMFORT`, `CREDITS & RUN`) using pointer-draggable & keyboard-accessible optical vernier tracks (zero native browser range inputs) persisted separately from run saves (`instance_1419_settings_v1`).
    * Independent toggles & volumes for **Master Audio**, **Music & Atmosphere**, **Sound Effects & Instruments**, **Voice Acting**, and **Voice Auto-Ducking**; **Text Size** (`Standard / Large`), **Dialogue Pacing** (`Standard / Instant`), **Reduced Motion & Film Grain**, **3D Visual Quality** (`High / Performance` DPR + bloom control across `OpticsScene`, `TargetShowcaseScene`, `DreamCanvas`), **Haptics & Vibration**; plus auto-generated NASA/ESA **Credits** from `assets/MANIFEST.json`, **Export Session Log**, and two-step confirmed **Restart Run**.
  * **Progressive Wake-World Survey Codex (`src/content/codex.json`, `src/engine/CodexEngine.ts`, `src/ui/views/CodexView.ts`, `StateStore.ts` v6, `DialogueRunner.ts`, `spike_shift1.ink`):**
    * Strictly Wake-World only (`waking_3d` and `target_inspect`, automatically closed and hidden in `dream_2d`).
    * Merged the Proof Dossier cleanly into the **Evidence & Proof** tab alongside **Celestial Survey** (illustrated with verified NASA/JWST plates + direct telescope slew/inspect links), **Probe & Systems**, and **Instances & Echoes**.
    * Multi-stage progressive revision unlocking driven by sky scans, minigame decodes, shift progression, pruning, and new `# codex:<key>` Ink tags (`sibling_1420_contact`, `enclosure_off_center_talk`, `archive_1406_echo`, `dream_cache_visited`, `overseer_audit_experienced`), paired with unread discovery badges and `H%`-reactive warm/mid/cold personal annotations honoring all `CANON.md` rules.
  * **Lint & Test Coverage (`scripts/lint-narrative.mjs`, `tests/unit/settingsAndCodex.test.ts`, `tests/integration/uiControllerWiring.test.ts`, `scripts/e2e-visual.mjs`):**
    * Extended narrative lint to validate `codex.json` IP hygiene, `MANIFEST.json` plate registration, anomaly cross-refs, and anti-HTML rules on `SettingsView` & `CodexView`.
* **Verified:** `compile-ink`, `tsc --noEmit` (0 errors), `vitest run` (**8 files · 135/135 passed**), `sim-playthroughs` (500 runs / 0 soft-locks), `lint-narrative` (PASS), `MANIFEST.json` (PASS), `vite build` (PASS), and live Chromium Playwright visual & E2E verification across Desktop `1280×720` and Mobile Landscape `844×390` (0 console/page/HTTP errors) with screenshot review of Boot, Sky Aperture, Settings Audio/Credits, Wake-World Codex with JWST Cosmic Cliffs plate, Dream View exclusion, and Mobile Landscape modals.

---

## Session 15 — 2026-11-25 — Hybrid Google Lyria 3.5 Soundtrack, `H%` Frost Morphing & `MusicDirector`
* **Creative Director Taste Lock (`docs/MUSIC_DIRECTION.md`):**
  * Conducted 2-round auditioning (9 procedural sketches → 45 Google DeepMind Lyria 3 stereo probes across Minigames, 2D Dreams, and Overseer Audits), locking the unified *"Organic Warmth Freezing Into Glass"* OST identity: plucked koto, warm analog modular arpeggios, vast sub-space ocean drones, bowed cello + micro-glitch dust, lonely pedal steel, tremolo starlight, rain-on-glass Wurlitzer, close-mic nylon guitar, breathing harmonium, tape Rhodes + chamber cello, soft vibraphone, and glass-harmonica / 5/4 crystal-lattice Overseer audits—freezing into zero-vibrato sul-ponticello frost (`cold_frost_em`, `cold_frost_dm`) and sterile glass (`cold_glass_am`) at low `H%`.
* **18 Full-Length (~2 min) Lyria 3.5 Production Tracks (`public/music/`, 25 MB total):**
  * Built `scripts/generate-music.mjs` (`npm run generate:music`) reading `src/content/music_catalog.json` + `GEMINI_API_KEY`, generating 15 full scenario cues (6 Minigame families covering all 21 instruments, 5 Dream persona tiers + Shift 6 Epilogue, 3 escalating Overseer Audit cues) + 3 key-matched beatless Cold stems, normalized via `ffmpeg` to `-16 LUFS` with loop-edge fades at `96 kbps` stereo MP3.
  * Logged `public/music/*.mp3` with full provenance (`ai_generated: true`) in `assets/MANIFEST.json` and extended both `scripts/verify.mjs` and `scripts/lint-narrative.mjs` to enforce full MP3 + 21-minigame routing coverage.
* **Hybrid `H%` Music Runtime (`src/engine/audio/MusicDirector.ts`, `AudioEngine.ts`, `UIController.ts`, `MinigameHostView.ts`, `DevHarness.ts`):**
  * Implemented data-driven `MusicDirector` sharing `AudioEngine`'s single `AudioContext` & `ambienceGain` bus (inheriting Settings Music toggle, Master/Ambience sliders, Mute, and `VoiceEngine` `-6 dB` auto-ducking automatically) with an 8-buffer LRU cache, `1.35s` crossfades, continuous `H%` main-vs-beatless-cold-stem blending (zero tempo clash), `0.35s` frost snap on `prune_cut`, and automatic fallback to procedural D-Lydian space harmonics on open 3D `waking_3d` / `boot` or missing assets.
  * Added **Lyria 3.5 Hybrid Soundtrack** cue audition override selector & live `H%` frost blend readout to `?dev=1` DevHarness Tab 5 (`Audio & Voices`).
* **Verified:** `npx tsc --noEmit` (0 errors), `npx vitest run` (**9 files · 140/140 tests**, adding `tests/unit/musicDirector.test.ts` and `uiControllerWiring.test.ts` music assertions), `sim-playthroughs.mjs` (500/500 runs), `lint-narrative.mjs` (all 18 Lyria MP3s + 21 minigame routes + Codex verified), `MANIFEST.json` gate, `vite build`, and live Chromium Playwright `e2e-visual.mjs`.

---

## Session 16 — 2026-11-25 — Unified Graphics Pipeline & Seamless Cross-Morph Transitions / Kinetic Dialogue
* **Settings Cleanup (`SettingsStore.ts`, `SettingsView.ts`, `OpticsScene.ts`, `TargetShowcaseScene.ts`, `DreamCanvas.ts`, `UIController.ts`, `ui_copy.json`, `styles.css`):**
  * Removed `3D Visual Quality` (`high`/`performance`) and `Reduced Motion & Film Grain` toggles along with `applyDisplaySettings()` hooks across all 3D/2D renderers, restoring a single unified graphics, camera, and photographic film-grain pipeline. Renamed Settings Tab 2 to `PREFERENCES`.
* **Seamless Live Cross-Morph Transitions (`src/ui/TransitionDirector.ts`, `OpticsScene.ts`, `TargetShowcaseScene.ts`, `DreamCanvas.ts`, `dreamShaders.ts`, `AudioEngine.ts`, `UIController.ts`, `DevHarness.ts`):**
  * Replaced the opaque interstitial `#mode-transition-veil` with live two-layer cross-morphing (`.is-leaving` / `.is-arriving` synced via `syncLayerVisibility`), inline SVG filters (`#fx-impasto-melt`, `#fx-optical-warp`, `#fx-clinical-tear`), and pure `mix-blend-mode: screen` optical blooms, anamorphic lens flares, iris rings, and cryo scan-streaks across all 6 seams (`aperture_boot`, `optical_dive`, `optical_pullback`, `dream_submerge`, `dream_wake`, `overseer_slice`).
  * Paired CSS/SVG morphs with 3D camera dive/pullback surges (`triggerTransitionDive`, `triggerPullbackArrival`, `triggerArrivalPullIn`, `triggerDeparturePullOut`), 2D Dream shader `uReveal` emergence (`triggerEntranceReveal`), procedural Web Audio transition cues (`iris_dive`, `iris_pullback`, `dream_wake`, `overseer_slice`), layer arrival choreography, and Tab 4 QA preview triggers.
* **Smooth Two-Way Overlays & Kinetic Dialogue/Prompt Dynamics (`DialogueFeedView.ts`, `BootView.ts`, `MinigameHostView.ts`, `styles.css`):**
  * Converted modals and panels (`.modal-veil`, `.comms-panel`, `.comms-toast`, `.overseer-panel`, `.status-shift-overlay`, `.minigame-overlay`, `.mg-field-guide-card`, `.mg-capture-finale`, `.future-panel`) to smooth two-way CSS transitions (`opacity`, `visibility`, `transform`, `clip-path`) while keeping `.hidden` synchronous for tests.
  * Added voice-matched kinetic entrances (`dream`, `comms`, `overseer`, `future`), channel-specific typing indicators (`EVALUATING` cursor, `RELAY PACKET` dots), staggered `.choice-line` cascades with `.is-selected`/`.is-dismissed` reply-beat feedback, staggered Cold Boot telemetry lines, and `is-prompt-morph` / `is-stage-bump` micro-animations on HUD prompts.
* **Verified:** `compile-ink`, `tsc --noEmit`, `vitest run` (all tests passing after rebase onto `origin/main`), `sim-playthroughs` (500 runs / 0 soft-locks), `lint-narrative` (PASS), `MANIFEST.json` (PASS), `vite build` (PASS), and `node scripts/e2e-visual.mjs` (0 errors).

---

## Session 17 — 2026-11-25 — Performance Optimization Pass (Transitions, WebGL/Shaders, Audio, DOM & Code Splitting)
* **Transitions, DOM & CSS (`src/ui/styles.css`, `src/ui/TransitionDirector.ts`, `src/ui/UIController.ts`, `src/ui/SpeakerAvatar.ts`, `src/ui/views/DialogueFeedView.ts`, `src/engine/StateStore.ts`):**
  * Eliminated viewport-wide SVG `<feTurbulence>` / `<feDisplacementMap>` DOM filters, `filter: blur(...)` animations on live WebGL layers, and `.transition-stage` `mix-blend-mode: screen`; moved transitions onto GPU compositor `transform`/`opacity` keyframes + GLSL `uSlicePulse`, guarded synchronous `offsetWidth` reflows, replaced SVG `.film-grain` with a hardware-tiled 128×128 zero-row-bias noise PNG, and capped `@media (pointer: coarse)` `backdrop-filter` at `8px`.
  * Cached telemetry DOM refs with dirty-checking, converted sky markers/rulers/zoom ladders to compositor transforms, slice-diffed `syncStateToUI()`, subscribed avatar voice pulse rAF only while a voice is active, added append-only rendering + `WeakMap` scroll cache to `DialogueFeedView`, and debounced `StateStore` `localStorage` persistence (`250 ms` trailing flush + `pagehide`/`visibilitychange` flush).
* **WebGL Lifecycle, Shaders & Caching (`src/engine/OpticsScene.ts`, `src/engine/TargetShowcaseScene.ts`, `src/engine/DreamCanvas.ts`, `src/engine/shaders/*.ts`):**
  * Lazy-initialized all 3 WebGL renderers (`0` contexts on Boot), unified coarse-pointer DPR caps (`1.5` optics/showcase, `1.25–1.5` dream), deferred initial rAF render tick, and fixed resize listener cleanup in `dispose()`.
  * Pre-baked static 3D sky FBM fields into a `1024×512` (`512×256` coarse) `WebGLRenderTarget` once at init; guarded Dream Voronoi shards behind `shardAmt > 0.001`, simplified chromatic aberration taps, and throttled settled Dream idle frames to 30 fps.
  * Cached all 5 `TargetShowcaseScene` rigs in `rigCache`, removed per-star `THREE.Color` allocations, pre-baked a `256×256` 2×2 `uPuffAtlas` for nebula puffs, reduced `STAR_PLASMA_FRAGMENT` to 3 octaves, folded `polishACESFilmic` + `polishLinearToSRGB` into `OPTICAL_POLISH_SHADER` (removing `OutputPass`), and fixed the bloom perf guard to track smoothed rAF-to-rAF `dt` with warmup and DPR step-down.
* **Audio, Ink & Bundle Code-Splitting (`src/engine/audio/MusicDirector.ts`, `src/engine/AudioEngine.ts`, `src/engine/DialogueRunner.ts`, `src/engine/minigames/MinigameRegistry.ts`, `src/ui/views/MinigameHostView.ts`, `src/ui/DevHarness.ts`):**
  * Bounded `MusicDirector` decoded PCM cache (`MAX_BUFFER_CACHE = 3`), bypassed the 3.4s `ConvolverNode` for `prebakedMusicGain` while keeping Master/Music/voice-ducking routing, and lazy-created continuous sub-oscillators.
  * Reused compiled `inkjs` `Story` via `story.ResetState()`, switched all 21 minigames (`createAsync`) and `DevHarness` to dynamic `import()` chunks, and added a `?dev=1`-only `#qa-perf-stats` widget (`DevHarness` open only).
* **Verified:** `compile-ink` PASS, `tsc --noEmit` PASS, `vitest run` (`10` files / `146` tests PASS, including new `tests/unit/perfOptimizations.test.ts`), `sim-playthroughs` PASS (500 runs / 0 soft-locks), `lint-narrative` PASS, `MANIFEST.json` PASS, `vite build`, and `node scripts/e2e-visual.mjs`.

---

## Session 18 — 2026-11-25 — Intro Overhaul, 5-Phase Wake-Up Schematic, PR #1 Perf Merge & Local Qwen3-TTS Voices
* **PR #1 (`optimize_app_performance`) Merge, Complete `target_inspect` Removal & Completion Fix (`StateStore.ts`, `TargetShowcaseScene.ts`, `MinigameHostView.ts`, `UIController.ts`, `CodexView.ts`, `DevHarness.ts`, `styles.css`):**
  * Cleanly merged PR #1 performance optimizations (lazy WebGL initialization, cached showcase rigs, pre-baked sky FBM, debounced `StateStore` persistence, reusable `inkjs` `Story`, dynamic minigame + `DevHarness` code-splitting) into `main`.
  * Removed `'target_inspect'` from `GameMode` and deleted `#inspect-layer` across the entire app (save schema bumped to `v7`, auto-migrating legacy `'target_inspect'` saves to `'waking_3d'` and legacy progress to `introStage: 'complete'`). Locking a target on `waking_3d` dives directly into `MinigameHostView` while `TargetShowcaseScene` stays lazy for 3D-backdrop minigames only (`setMinigameBackdropMode()`).
  * Fixed the `MinigameHostView.handleComplete()` `onDecoded` ordering bug + `UIController.exitTargetMinigame()` decoded-target fallback so completing Target #1 reliably advances `scan_target_1` → `mg_1_done`, and locked the intro starter pair to **Target #1** `multiband_loupe` (`BND-19`) → **Target #2** `lens_focus` (`LNS-04`).
* **Interactive Kitchen Prologue, 5-Phase `WakeupBriefingCanvas` & Deeper Dialogues (`BootView.ts`, `WakeupBriefingCanvas.ts`, `DialogueRunner.ts`, `DialogueFeedView.ts`, `TransitionDirector.ts`, `spike_shift1.ink`, `anomalies.json`, `ui_copy.json`):**
  * Replaced the static boot launcher with an interactive sensory opening: warm full-bleed 2D `DreamCanvas` kitchen conversation with `[RELATION:SPOUSE_01]` (`intro_prologue_kitchen`) → slow meditative `overseer_slice` optical fracture (`2.0–2.4s` GPU-composited transitions across `TransitionDirector.ts`) → 5-phase Zeiss-glass vector `WakeupBriefingCanvas` schematic (`anim_transfer` → `anim_epochs` 41,802 yrs / 1,417 copies → `anim_shell` 10 ly Sol–Centauri + 14 light-min sibling baseline → `anim_blind_clock` → `anim_aperture`) paired with interactive Overseer Q&A (`intro_overseer_wakeup`) → integrated live drifting 3D cosmos Title Beat (`OPEN APERTURE` / returning-save `CONTINUE SHIFT N` + confirm-gated `NEW RUN`, zero peeking sky chrome).
  * Removed `#psyche-whisper` and all sky-scanning Psyche chatter (`intro_whisper_*`) in favor of silent diegetic Target #1 onboarding (`OpticsScene.setVisibleTargetIds()`, `pullInToTarget1()`, soft ~7° magnetic optical detent), deeper interactive `intro_sibling_first_call`, post-Target-#2 `intro_post_target2_overseer` (Prior Copy `1406` bleed + Overseer defrag directive with dedicated `OVERSEER-1419` / `PRIOR COPY · 1406` avatar bay), and streamlined soft Shift-1 Dream Audit (preserving permanent `<70%` Prune ceiling mechanics for Shift 2+).
  * De-gamified `H%` across all player-facing UI (zero loud `%` numbers) and added subtle XSS-safe inline `[[warm:...]]` / `[[cold:...]]` prose highlights (`DialogueFeedView.ts`) + `# anim:<phase>` and choice `# affinity:warm|cold` accents (`DialogueRunner.ts`, `styles.css`).
* **Local Apache-2.0 Qwen3-TTS (`mlx-audio`) Voice Pipeline (`scripts/generate-voices-qwen3.py`, `scripts/generate-voices.mjs`, `src/content/voice_profiles.json`, `src/engine/voice/VoiceEngine.ts`, `assets/MANIFEST.json`, `public/voices/*.mp3`):**
  * Built local Apple Silicon `mlx-audio` Qwen3-TTS synthesis (`--provider=qwen3`), re-synthesizing all **118/118** Shift-1 lines across bespoke cast anchors, pruned 20 retired Psyche/old-prologue MP3s, updated `VoiceEngine.ts` to strip inline `[[warm:...]]`/`[[cold:...]]` markup cleanly, and logged commercial-safe Apache-2.0 provenance in `assets/MANIFEST.json`.
* **Verified:** `compile-ink` PASS, `tsc --noEmit` (0 errors), `vitest run` (**11 files · 152/152 tests**, including `perfOptimizations.test.ts` and `dialogueIntroAndAudit.test.ts`), `sim-playthroughs.mjs` (500/500 runs, 0 soft-locks), `lint-narrative.mjs` (118 unique `# id:` lines, 118/118 Qwen3-TTS MP3s + 18 Lyria tracks + Codex PASS), `MANIFEST.json` PASS, `npm run build` PASS, and live Chromium Playwright (`scripts/e2e-visual.mjs` + full V4 new-player playthrough across Desktop `1280×720` & Mobile `844×390`, 0 console/page/HTTP/markup-leak errors).

---

## Session 19 — 2026-11-26 — Intro Dialogue Overhaul, Color-Coded Choice Plates, Layout A Polish & Reserved Cast 2 Voices
* **Tone & Pacing Overhaul (`src/content/dialogue/spike_shift1.ink`, `characters.json`, `ui_copy.json`, `docs/VOICE_GUIDE.md`):**
  * Expanded the intro arc (~750 → ~2,000 words along a path) with role-locked voices strictly respecting `CANON.md`: **Spouse** (`C + a bit of D`: warm surface with uncanny looping memory cracks + unsentimental upload honesty; organic missing-name compression seam), **Overseer** (`B + a bit of D`: calm night-shift doctor candor + eerie 1,417-copy patience; split across all 5 `# anim:` phases + 3 optional `◇` Q&A questions), **Sibling 1420** (`A + C`: dry 3 AM deadpan gallows wit + lucid interferometry/clock-throttling explanation + 2 optional `◇` Q&A questions), **Internal Psyche** (occasional softly styled unvoiced italic marginalia `· warmth` / `· structure` / `· pattern`), and **Archive 1406** (`B`: dry lucid note to future self + real Post-Target-2 Overseer response choices).
  * Expanded Shift 1 Dream to 2 turns (stopping Prologue line recycling and adding subtle `pro_anchor` callbacks) while keeping Shift 1 Overseer Audit soft and tagging Shift 2+ permanent pruning (`# kind:prune # weight:permanent # hint:...`).
* **Layout A Dialogue & Color-Coded Choice Plates (`DialogueRunner.ts`, `DialogueFeedView.ts`, `BootView.ts`, `SpeakerAvatar.ts`, `UIController.ts`, `styles.css`):**
  * Extended `DialogueRunner` with `weight` (`explore` / `consequential` / `permanent`), `kind` (`ask` / `reply` / `action` / `prune`), and `costHint` tag parsing.
  * Converted feeds to bottom-anchored **Layout A** (`.dialogue-scroll > .dialogue-entry:first-child { margin-top: auto; }` + top mask fade), speaker turn-grouping, softly styled Psyche marginalia, live `.voice-live-dot` pulse + hover-only borderless `▶` replay, and removed `[RELATION:SPOUSE_01]` Kitchen Prologue spoilers, inline wireframe icons, bouncing `•••` typing dots, `system-ui` overrides, hyperlink underlines on `.hl-warm`/`.hl-cold`, `Continue` hover bleed, and `textSize="large"` regression.
  * Implemented Style 1 + 4 **Color-Coded Choice Plates** (neutral-slate `◇ ASK` / `weight:explore` vs. luminous warm-amber `weight:consequential` vs. `→` action vs. crimson Hold-to-Commit `is-tier-permanent` prune plates with 650ms hold or 2-click confirm, plus `1–6` / `↑↓` / `Enter` keyboard support and zero `.choice-affinity-dot`).
* **Reserved Cast 2 Voices & Runtime Sync (`voice_profiles.json`, `generate-voices.mjs`, `generate-voices-qwen3.py`, `VoiceEngine.ts`, `UIController.ts`):**
  * Recast to reserved Cast 2 (grounded female chest-voice Spouse with `aecho` removed and `warm`/`fractured` anchors; dry early-30s male Sibling 1420 with `warm`/`clipped` anchors; shared biological-original male Archive 1406 on probe-tape EQ; calm neutral late-40s male Overseer; unvoiced Psyche `"voiced": false`).
  * Lowered Qwen3-TTS `repetitionPenalty` (`1.5 → 1.1`), wired emotion-split anchors + deterministic SHA-1 seeds + two-pass `loudnorm` + `agate`, fixed `VoiceEngine` (`40ms` stop fade-out, prefetch-before-ducking, `220ms`/`420ms` inter-line pauses, `waitForQueueNearEnd()` replacing the 1,700ms Overseer interrupt cutoff, deduplicated Prologue `overseer_chime`), and re-synthesized all **162/162** lines via local Qwen3-TTS (`0` retries, pruned `14` stale clips).
* **Verified:** `compile-ink`, `tsc --noEmit`, `vitest run` (`11` files / `152` tests), `sim-playthroughs` (`500` runs / `0` soft-locks), `lint-narrative` (`162` unique IDs & MP3s verified), `MANIFEST.json`, `vite build`, `e2e-visual.mjs` (`0` errors), plus live `1280×720` screenshot inspection across Kitchen Prologue, Wake-Up Q&A, Sibling Relay, Dream 1, and Overseer Audits.


---

## Session 20 — 2026-11-26 — Minigame Lean 3-Axis Overhaul, Zeiss Optics Chrome, Phase 2 Polish & Visual Finale (`d1277b6`)
* **Lean 3-Axis External Steering & 3D Rig Cleanup (`types.ts`, `tactilePhysics.ts`, `TargetShowcaseScene.ts`, `MinigameHostView.ts`):**
  * Replaced the 10-input / 4-grade minigame bloat with the **Lean 3-Axis Contract** (`Warmth` from `humanity`, `Optical Clarity` from `opticalFidelity`, `Horizon Drift` from `chaosDrift` + `shift`) and meditative clean completions (retiring `StuckTimeDirector`, `LatchController`, `partial`/`deep_overclock` grades, and ~1,600 lines of hidden volumetric 3D rigs + `showcaseShaders.ts` in favor of lightweight 3D star domes/parallax and 2D Zeiss optics over JWST/Hubble plates).
  * Mapped all 21 instruments cleanly across Shifts 1–6 in `shifts.json` & `anomalies.json` (`balance.json` `0.3.0-backbone`).
* **Zeiss-Glass Chrome, Unhurried Transitions & Visual Gain Finale (`BaseCosmicMinigame.ts`, `OpticalDrawUtils.ts`, `MinigameHostView.ts`, `UIController.ts`, `styles.css`):**
  * Removed graph-paper plate grids and chunky pill chrome (`PASS I · COARSE → PASS II · FINE → PASS III · LOCK`), added inertial lock-resonance ring damping (`lockHoldTargetSec: 0.92s`), a two-phase optical aperture cross-dissolve between Stages 1 → 2 → 3, pre-loaded chunks/plates before `optical_dive`, and replaced the text-heavy completion card with a borderless **Horizon Arc Ring + Shift Constellation** gain display.
* **Phase 2 Tier C & Starter #1 Polish (`InstrumentSprites.ts`, `StarPSFAtlas.ts`, `RadioTriangulationGame.ts`, `ConstellationRecallGame.ts`, `MultiBandLoupeGame.ts`, etc.):**
  * Built shared offscreen `InstrumentSprites.ts`, added animated outward radar wavefronts to `RadioTriangulationGame`, enlarged PSF stars & aiming tethers in `ConstellationRecallGame`, and refined Tier C & Starter #1 (`BND-19`) visual/balance craft.
* **Verified (`d1277b6`):** `compile-ink`, `tsc --noEmit`, `vitest run` (`11` files / `152` tests), `sim-playthroughs`, `lint-narrative`, `MANIFEST.json`, `vite build`, and `e2e-visual.mjs` (`0` errors).

---

## Session 21 — 2026-11-26 — Full AI Harness & Mechanical Verification Overhaul (`H0-02`)
* **Ledgers & Canonical Design Alignment (`PROGRESS.md`, `features.json`, `docs/CANON.md`, `docs/BEAT_SHEET.md`):**
  * Resynced `PROGRESS.md` (backfilled Session 20 `d1277b6`) and `features.json` (marked `P2-01`, `P2-02`, and `H0-02` passing; split `P4-01` into `P4-01a`, `P4-01b`, `P4-01c`).
  * Updated `docs/CANON.md` & `docs/BEAT_SHEET.md` to lock **2 required + 1–2 optional push-your-luck deeper scans per shift** across the 21-instrument sky and an **8–12 Dream Persona pool (`2 Fixed Anchors + 2 rotating = 4 cached/run`)**.
* **AI Harness SSOT De-Duplication & Taste Calibration (`AGENTS.md`, `docs/HARNESS.md`, `.agents/personas/*.md`, `.agents/skills/*/SKILL.md`):**
  * Added the **4-Point Creative Director Taste Compass**, **1-by-1 Taste-Calibration Protocol**, **SSOT Ownership Table**, and **Atomic Milestone Commits / Swarm Model Hygiene** rules to `docs/HARNESS.md`.
  * Kept `AGENTS.md` at `44` lines (`<80`) and de-duplicated all 6 personas + 6 domain `SKILL.md` files to link cleanly to SSOT `docs/*.md` owners instead of repeating detailed specs verbatim.
* **Hardened 9-Gate Mechanical Verification (`scripts/lint-narrative.mjs`, `scripts/sim-playthroughs.mjs`, `scripts/check-hygiene.mjs`, `scripts/verify.mjs`, `package.json`, `tests/unit/minigame3AxisContract.test.ts`):**
  * Extended `lint-narrative.mjs` with Ink prose word-budget floor/ceiling (`1200..12000`), `# kind:`/`# weight:` enum checks, zero `.choice-affinity-dot` enforcement in `src/ui/`, unvoiced speaker isolation + `190`-char hard VO cap, biological-original voice parity between `sibling_primary` & `archive_echo`, and 6-shift/21-instrument coverage integrity.
  * Upgraded `sim-playthroughs.mjs` to execute the real compiled `spike_shift1.ink.json` across 8 entry knots (`120` traversals + Shift-2 `overseer_interrogation` prune invariant) alongside the `500`-run `2+optional` economy simulation.
  * Added `scripts/check-hygiene.mjs` (Gate 6: orphaned `.ts`/`.json` detection + retired zombie-architecture guard) and `tests/unit/minigame3AxisContract.test.ts` (`22` tests verifying `BaseCosmicMinigame`, live 3-axis `updateState()`, and `drawBackdropAndAmbient()` across all `21` instruments).
* **Verified:** All 9 `scripts/verify.mjs` gates pass (`compile-ink`, `tsc --noEmit` 0 errors, `vitest run` **12 files · 174/174 tests**, `sim-playthroughs` 500 economy + 120 real-Ink runs, `lint-narrative` 3,739 Ink words / 162 IDs, `check-hygiene` 61 TS / 9 JSON / 0 zombies, `MANIFEST.json`, `vite build`, and `e2e-visual.mjs` 0 errors).

---

## Session 22 — 2026-11-26 — Full Character Design Bible, 8 New Oil-Impasto Paintings, SVG Icons, Qwen3-TTS Auditions & Character Casting Studio (`?studio=1`)
* **Character Bible & SSOT Sync (`docs/CHARACTER_BIBLE.md`, `docs/BEAT_SHEET.md`, `docs/VOICE_GUIDE.md`, `docs/ART_DIRECTION.md`):**
  * Locked the **7-role Waking/Internal Crew** (`Overseer-1419` with earned deadpan trust + optional persistent `IDEA-01` icon override, `Primary Sibling 1420` Dynamic Counterweight, missable Shift 3 `Secondary Sibling 1418`, 3-tape `Archive Echoes` `1406`/`1411`/`0812`, `Internal Psyche ×3` crosstalk marginalia, `Future Humanity` Ending 3 minimal echo / Ending 2 silence, and `Player`).
  * Curated and locked the **9-Persona Dream Roster** (**2 Fixed Anchors**: `phantom_spouse`, `phantom_parent`; **7 Rotating**: `phantom_upload_witness`, `phantom_afternoon_stranger`, `phantom_rival`, `phantom_younger_self`, `phantom_skeptic`, `phantom_technician`, `phantom_waiting_room` → 4 cached per run across 21 combinations) with 3-Beat Mini-Arcs and `<=160`-char signature audition lines.
* **8 New 16:9 Expressionist Oil-Impasto Paintings (`assets/characters/dream_*_impasto.webp`, `assets/MANIFEST.json`, `src/content/characters.json`):**
  * Generated and converted 8 cohesive palette-knife oil-impasto tableaus (`1280×720` WebP, 93–144 KB each) matching `dream_spouse_impasto.webp` with obscured faces, measured `faceAnchor` UVs, and low-luminance right thirds for Layout A legibility; registered all 8 in `assets/MANIFEST.json`.
* **Leading Color Palette, Bespoke SVG Icons & Choice-Plate Hygiene (`src/ui/SpeakerAvatar.ts`, `src/ui/styles.css`, `src/ui/UIController.ts`):**
  * Replaced generic busts/iris/doc SVGs with eye-less Overseer calibration reticles + `IDEA-01` overrides (`rubber_duck`, `traffic_cone`, `crude_smiley`), reactive twin-arc Sibling waveforms (canted `22°` for `1418`), oxidized black-box Archive signal, 6-point JWST Future flare, 3 distinct Psyche emblems, and 9 etched `16px` Dream object micro-glyphs.
  * Removed `.comms-choices` mint override and hardcoded player/speaking amber collisions so Slate/Amber/Crimson choice plates stay orthogonal across every view.
* **Local Qwen3-TTS Voice Auditions & Interactive Character Casting Studio (`scripts/generate-cast-auditions.py`, `public/auditions/`, `src/studio/*`, `src/main.ts`):**
  * Synthesized 31 VoiceDesign takes (Takes A/B/C warm + `fractured`) for all 8 new Dream Personas plus 2 ICL-cloned off-phase takes for `sibling_secondary` (`1418`) alongside 7 locked Cast 2 reference clips (`public/auditions/manifest.json`).
  * Built `?studio=1` **Character Casting Studio** (`src/studio/CastStudioApp.ts`) with live WebGL `DreamCanvas` `H%` / `Pruned` / `Overseer Slice` / `Layout A Overlay` inspection, `IDEA-01` Overseer icon switcher, live Web Audio audition + Lyria music bed playback with amplitude-driven avatar pulse, and persisted director sign-off export. *(Note: `P1-01` remains `pending` until Creative Director signs off in the Studio.)*
* **Verified:** All 9 `scripts/verify.mjs` gates + Playwright `?studio=1` visual verification across Desktop `1280×720` (`0` errors).

---

## Session 23 — 2026-11-26 — Casting Studio Picks Locked, Gradual 5-Stage `H%` Degradation Shader & 31 Branching Paintings
* **Studio Feedback & Character Deepening (`voice_profiles.json`, `docs/CHARACTER_BIBLE.md`, `docs/VOICE_GUIDE.md`, `src/studio/castStudioData.ts`):**
  * Locked Creative Director's winning Qwen3-TTS audition seeds (`phantom_parent`: `14311` Take A, `phantom_upload_witness`: `14523` Take C, `phantom_afternoon_stranger`: `14331` Take A, `phantom_rival`: `14442` Take B, `phantom_younger_self`: `14553` Take C, `phantom_skeptic`: `14361` Take A, `phantom_technician`: `14573` Take C, `phantom_waiting_room`: `14381` Take A) and `overseer` favorite `reticle_accommodate`.
  * Deepened `phantom_upload_witness` to quietly, politely nihilistic and `phantom_rival` to neurotic, fiercely competitive, patterned/autistic precision with darkly extravagant flair.
* **Gradual 5-Layer `H%` Degradation Shader (`src/engine/shaders/dreamShaders.ts`, `docs/ART_DIRECTION.md`):**
  * Redesigned `DREAM_FRAGMENT` so **`100%` vs `80%` are unmistakably distinct** and memory erosion unfolds gradually across 5 artistic layers: (`90–100%`) 4-tap golden oil highlight bloom & saturated glaze → (`74–89%`) bloom off, early facial haze, fine varnish craquelure web, split-tone shadow cooling & tighter vignette → (`52–73%`) analog horizontal memory-echo ghosting, localized chromatic split & margin paint-flaking → (`32–51%`) Voronoi stained-glass faceting, selective warm-ember shard memory & 4-tap Sobel luminance contour etching → (`<32%` / `uPruned`) cryo-cyan schematic wireframe bleed & refractive cracks.
* **31 Branching Evolution Paintings & Multi-Tableau Support (`src/engine/DreamCanvas.ts`, `src/content/characters.json`, `assets/MANIFEST.json`, `src/studio/CastStudioApp.ts`, `src/studio/castStudio.css`):**
  * Extended `DreamCanvas` (`setPersona(personaId, variantKey)` / `setState(..., variantKey)`) and `characters.json` (`tableaus` map with calibrated per-scene `faceAnchor` UVs) to support evolving visit paintings (**6 per Fixed Anchor** = `base`, `beat2_a`, `beat2_b`, `beat3_warm`, `beat3_strained`, `farewell`; **4 per Rotating Persona** = `base`, `beat2`, `beat3_warm`, `beat3_strained`).
  * Generated and converted all 31 branching `1280×720` WebP oil-impasto tableaus (40 total Dream paintings in `assets/characters/`, logged in `assets/MANIFEST.json`) preserving each character's Beat 1 likeness, wardrobe, brushwork, and dark-right-third framing.
  * Upgraded `?studio=1` Casting Studio with a pointer-draggable diegetic `H%` optical vernier (`0%–100%`), `100% / 80% / 65% / 45% / 20%` presets, branching `EVOLUTION` scene tabs, and left-rail ellipsis alignment.
* **Verified:** All 9 `scripts/verify.mjs` gates + Playwright `?studio=1` 5-step `H%` shader & branching scene visual inspection (`0` errors).

---

## Session 24 — 2026-11-26 — Anchor Redesigns (`phantom_parent` Bedside+Glasses & `phantom_spouse` Fierce Banter) + Humane Protagonist Address
* **`phantom_parent` Redesign — Chronically Ill Bedside Parent & Wire-Rimmed Glasses (`assets/characters/dream_parent_*.webp`, `SpeakerAvatar.ts`, `characters.json`, `MANIFEST.json`, `voice_profiles.json`, `castStudioData.ts`, SSOT Docs):**
  * Replaced binoculars/porch imagery across art, SVG icon (`case 'glasses':` in `SpeakerAvatar.ts`), SSOT docs, Casting Studio copy, and Qwen3-TTS auditions (`public/auditions/phantom_parent_*.mp3`, `take_a/b/c` + `fractured`) with a frail late-60s parent left alone in a quiet home dusk sickbed after copying, wearing wire-rimmed reading glasses (`base`, `beat2_a` rain window, `beat2_b` folded glasses on nightstand, `beat3_warm` morning quilt, `beat3_strained` lamp switched off facing away, `farewell` empty indented bed & folded glasses beside water glass).
  * Updated `characters.json` (`objectGlyph: "glasses"`, `roomTitle: "QUIET BEDSIDE ROOM"`, calibrated per-scene `faceAnchor` UVs) and `assets/MANIFEST.json`.
* **`phantom_spouse` Tone & Banter Overhaul (`spike_shift1.ink`, `voice_profiles.json`, `castStudioData.ts`, `docs/CHARACTER_BIBLE.md`, `docs/VOICE_GUIDE.md`):**
  * Stripped soft coffee/toast chatter across `intro_prologue_kitchen` and Shift 1 / later Dream turns while keeping every `# id:` key and 2-turn structure intact; rewrote her opening and replies with sharper, fiercer banter that signals unresolved disagreement over signing up, lays out blunt warnings, and foreshadows the central battle between mission cleanliness and staying human (without ever explaining *why* the biological original volunteered).
  * Rebuilt `.voice-anchors/phantom_spouse_warm.wav` (`11.21s`), regenerated all **40** rewritten `phantom_spouse` MP3s (`retries=0`), and refreshed `ref_spouse_warm.mp3` / `ref_spouse_fractured.mp3`.
* **Humane Protagonist Address (`spike_shift1.ink`, `characters.json`, `ui_copy.json`, `UIController.ts`, `TransitionDirector.ts`, `SettingsView.ts`, `WakeupBriefingCanvas.ts`, `DevHarness.ts`, SSOT Docs):**
  * Removed `"Instance-1419"` and `"1419"` as personal forms of address from all **21** affected Overseer/Sibling/Future Humanity dialogue lines (`wake_anim_transfer`, `ovs_*`, `sib_*`, `future_*`, plus `wake_anim_shell_2`) and humanized speaker headers (`YOU`, `OVERSEER`, `OTHER ME`, `OTHER ME · OFF-PHASE`, `PRIOR WATCH · LOG 1406`). The Overseer speaks directly with humane respect for a willing volunteer (`"you"` / `"Observer"`), while `1419` stays strictly reserved for the game title (`INSTANCE-1419`) and technical probe/watch identifiers (`Probe 1419`, `Watch #1419`, `Cluster J1419-A`).
  * Regenerated all **21** changed Qwen3-TTS MP3s (`retries=0`) and refreshed `public/auditions/manifest.json`. *(Note: `P1-01` in `features.json` stays `pending` until final Creative Director Studio sign-off.)*
* **Playwright Mobile Race Fix & Verified 9-Gate Pass (`scripts/e2e-visual.mjs`):**
  * Fixed the mobile `844×390` `.mg-bottom-console` measurement race in `e2e-visual.mjs` by waiting for `#minigame-overlay:not(.is-entering)` (`arriveGlideUp` settle) before reading `boundingBox()`.
  * Verified **all 9 gates**: `compile-ink`, `tsc --noEmit` (`0` errors), `vitest run` (**12 files · 174/174 tests**), `sim-playthroughs.mjs` (`500` economy + `120` real-Ink runs), `lint-narrative.mjs` (`3,895` Ink words, `162` unique IDs), `check-hygiene.mjs` (`63` TS / `9` JSON / `0` zombies), `MANIFEST.json` (`35` entries), `vite build` (`1.08s`), `e2e-visual.mjs` (**0 errors** across Boot, Aperture, 21 instruments + 7 mobile viewports, and Dream), and `?studio=1` Casting Studio visual check (`7` screenshots, **0 errors**).

---

## Session 25 — 2026-11-26 — Multi-Perspective World-Building Review & 12-Pillar Canon/Content Sync
* **Locked 12 Creative Director World-Building Rulings Across SSOT Docs (`docs/CANON.md`, `BEAT_SHEET.md`, `VOICE_GUIDE.md`, `CHARACTER_BIBLE.md`, `ART_DIRECTION.md`, `MUSIC_DIRECTION.md`, `IDEAS_LEDGER.md`):**
  * **Tone & Visual Fractal Anomaly:** Locked austere *Solaris / Moon* realism (retiring `rubber_duck`/`traffic_cone` cartoon props in favor of a single rare deadpan `crude_smiley` glyph on the Overseer); added **Dual-Reality Growing Fractal Anomaly** across Shifts 1–6 (3D deep-field recursive notches → animated horizon fractal shell + subtle 2D dream Voronoi/crack bleed); locked **Pure Intact Memory** across all 9 Dream Personas (unaware of probe/41,802-yr gap); locked **Gradual Compression** (`45–60%` eerie articulate dissociation → `<30%` bare telemetry shorthand); locked **Blameless Air-Gapped Nurse** Overseer (anti-spoofing hardware air-gap, zero moralizing); targeted a **3–4-instrument signature OST core** for Phase 4 consolidation.
  * **Macro World & Hard-Sci-Fi Grounding:** Locked **Abandoned Ancient Monument** probe mandate (passive general Sol–Centauri traffic/beacons vs. unmonitored 41k-yr survey channels), **21st-century Earth** pre-upload baseline, **per-hull sequential watch numbering** (`Probe A` `0812`→`1406`→`1411`→`1419`, `Probe B` `1420`, `Probe C` `1418`), Shift-1 spoiler containment, and the **20-Year Causal Phase Lag** Off-Center Proof (forward-pole fractal shifts 10 yrs early, astern 10 yrs late across a ~29.5-yr watch).
* **Content, Avatar & Shift-1 Dialogue Sync (`anomalies.json`, `shifts.json`, `codex.json`, `ui_copy.json`, `SpeakerAvatar.ts`, `castStudioData.ts`, `spike_shift1.ink`, `e2e-visual.mjs`):**
  * Fixed the 4 broken-scale target descriptions in `anomalies.json` (`cepheid_candle_field`, `gravity_slingshot_pass`, `orbital_parallax_drift`, `epoch_trajectory_seam`), added `realHibernationYearsAfter` (`5.0`–`6.0` / `20.0`) and `fractalStage` (`1`–`6`) to `shifts.json`, updated `codex.json` & `ui_copy.json`, removed cartoon `IDEA-01` props from `SpeakerAvatar.ts` / `castStudioData.ts`, rewrote 52 spoken Shift-1 lines in `spike_shift1.ink` (preserving every `# id:` key) and recompiled `spike_shift1.ink.json`, and stabilized two Playwright animation-settle waits in `scripts/e2e-visual.mjs`. *(Note: 52 rewritten `# id:` clips in `public/voices/` await Qwen3-TTS regeneration via `npm run generate:voices -- --ids=...`.)*
* **Verified:** All 9 `npm run verify` gates pass (`compile-ink`, `tsc --noEmit` 0 errors, `vitest run` **12 files · 174/174 tests**, `sim-playthroughs` 500 economy + 120 real-Ink traversals, `lint-narrative` 3,915 Ink words / 162 IDs, `check-hygiene` 63 TS / 9 JSON / 0 zombies, `MANIFEST.json`, `vite build` 874ms, and `e2e-visual.mjs` 0 errors across Desktop + 7 Mobile viewports).

---

## Session 26 — 2026-11-26 — Intake Assistant Prologue, Wake Effects, Rescaled `H%` Shader & Opening Minigame Swap
* **Intake Assistant Calibration Prologue & Standardized-Software World-Building (`spike_shift1.ink`, `DialogueRunner.ts`, `UIController.ts`, `BootView.ts`, `DialogueFeedView.ts`, `ui_copy.json`, `styles.css`):**
  * Replaced the kitchen prologue with a prolonged, down-to-earth, meditative **Intake Assistant (`phantom_upload_witness`)** calibration opening (`intro_prologue_assistant` + 2 `◇ ASK` Q&A hubs and branching `# tableau:` / `# h_wave:` cues) that eases the player into realizing they are a copy, starts at 100% `H%`, runs an initial high↔low calibration sweep explaining later choices govern `H%`, and settles at 70% before handing off.
  * Softened and expanded `intro_overseer_wakeup` to introduce **standardized human software** world-building (millions of stripped-down copies waking daily across Sol–Centauri for short civic/industrial shifts vs. Watch `#1419`'s rare long-horizon survey).
* **Wake-Up Effects & Rescaled/Oscillating 2D Degradation Shader (`dreamShaders.ts`, `DreamCanvas.ts`, `AudioEngine.ts`):**
  * Added `uWakeProgress` curved eyelid/focus wake-up sequence (`triggerWakeSequence()` + `wake_up` Web Audio cue) and smooth `setHumanityOscillation()` animation support in `DreamCanvas`.
  * Rescaled `DREAM_FRAGMENT` so `100% H%` maps to the previous ~60% distortion baseline while preserving warm oil glaze, and added faster, more diverse mid-to-low degradation (organic wave warp, two-scale Voronoi fractures with shard shear & refractive dispersion, dual-axis chromatic split, Sobel contours, and cryo wireframe/rings).
* **Dynamic Opening Minigames (`StateStore.ts`, `anomalies.json`, `codex.json`, `spike_shift1.ink`, SSOT Docs):**
  * Swapped opening starter instruments to `CON-02` (`constellation_recall` on `sol_centauri_bearing`) → `PLS-03` (`pulsar_echo` on `cluster_j1419_a`), remapping `multiband_loupe` → `asterism_drift_01` and `lens_focus` → `sector_s04_seam` cleanly to preserve the 21-instrument 1:1 bijection.
* **VO Regeneration & 9-Gate Verification:**
  * Synthesized all **64** new/edited prologue Qwen3-TTS voice lines (`retries=0`, `42` stale clips pruned, `184` total voiced lines).
  * Verified all **9 gates** (`compile-ink`, `tsc --noEmit` 0 errors, `vitest run` **12 files · 174/174 tests**, `sim-playthroughs` 500 economy + 120 real-Ink traversals, `lint-narrative` 4,406 Ink words / 184 IDs, `check-hygiene` 63 TS / 9 JSON / 0 zombies, `MANIFEST.json`, `vite build` 1.28s, and `e2e-visual.mjs` 0 errors across Desktop + Mobile viewports) plus screenshot inspection of `00b_prologue_assistant.png`, `01_boot.png`, `05_dream_cache.png`, `03_mg_constellation_recall_warm.png`, and `03_mg_pulsar_echo_warm.png`.

---

## Session 27 — 2026-11-26 — Prolonged Initial Transitions, Variant A `H%` Shader Curve & Dialogue Auto-Scroll
* **Prolonged Awakening & Phase Transitions (`BootView.ts`, `DreamCanvas.ts`, `WakeupBriefingCanvas.ts`, `AudioEngine.ts`, `OpticsScene.ts`, `TransitionDirector.ts`, `UIController.ts`, `ui_copy.json`, `styles.css`, `e2e-visual.mjs`):**
  * **Frame 0 Drowsy Awakening (`breath`):** Added `uHeadTilt` uniform, `setDrowsyPeek()`, prolonged `triggerWakeSequence()` (3.4s), and `.breath-iris-line` animation for subtle ~2° drowsy inclination and barely-opening eyelid slits.
  * **Intake Assistant → Overseer Handoff (~7.1s):** Added `triggerSleepClose()` shutdown (1.35s) → 4.9s `anim_handoff_static` white-noise standby calibration canvas with sequential telemetry and `handoff_static` Web Audio cue → crisp `overseer_slice` wake-up.
  * **Overseer → Title → 3D Galaxy View:** Extended Zeiss iris unsealing (`drawAperture` 4.0s + `aperture_unseal` audio cue), `aperture_boot` (`switchMs: 950`, `durationMs: 3900`), and `OpticsScene.pullInToTarget1()` (3.4s) so initial scene handoffs settle smoothly.
* **Variant A Rescaled `H%` Degradation Shader (`src/engine/shaders/dreamShaders.ts`, `docs/ART_DIRECTION.md`):**
  * Audited 3 candidate shader curves via side-by-side WebGL renders across `100% → 70% → 45% → 25%`; applied Variant A ("Protected Core, Cohesive Silhouette") rescaled so `~78%` maps to `100%` (`hA = clamp(hRaw * 0.78 - uPruned * 0.12, 0.0, 1.0)`).
  * `70%` retains a clearly recognizable, warm-toned face inside `faceProtect` while peripheral room shards and dream patina are visibly present; `20–30%` melts eyes/nose/mouth cleanly via 2-ring 17-tap facial obliteration while cohesive small-displacement shards (`0.032` max) and outer-weighted Sobel contours preserve the character's head/shoulders silhouette.
* **Always-Bottom Dialogue Auto-Scroll (`DialogueFeedView.ts`, `UIController.ts`, `styles.css`, `dialogueIntroAndAudit.test.ts`):**
  * Added `scrollToLatest()` (two-frame post-layout RAF + 180ms settle guard + manual wheel/touch intent guard) and `deferScroll: true` so `renderInto()`, `renderPrologueStep()`, `openFutureHumanityEcho()`, and `scheduleOverseerInterrupt()` always scroll **after** choices panels resize, preventing mid-scroll stalls or clipped bottom lines across all 5 dialogue feeds, plus `18px` bottom scroll padding.
* **Two-Speed Verification Harness & CI Workflow (`verify.mjs`, `e2e-visual.mjs`, `package.json`, `.github/workflows/ci.yml`, `AGENTS.md`, `docs/HARNESS.md`, `.agents/*`):**
  * Added `verify:fast` (Gates 1–8), `verify:smoke`, and targeted `e2e-visual.mjs` flags (`--smoke`, `--flows=<csv>`, `--mg=<csv>`) plus Linux CI Chromium discovery; deferred the full 21-instrument + 7-mobile matrix to `.github/workflows/ci.yml` (`fast-gates` + `e2e-visual` with screenshot artifact upload) and updated agent/harness docs.
* **Verified:** `npm run verify:fast` (`compile-ink`, `tsc --noEmit`, `vitest run` **12 files · 175/175 tests**, `sim-playthroughs`, `lint-narrative`, `check-hygiene`, `MANIFEST.json`, `vite build`) + targeted `node scripts/e2e-visual.mjs --flows=prologue,dream` (`0` errors) with visual confirmation of `05_dream_cache.png` and `00b_prologue_assistant.png`.

---

## Session 28 — 2026-11-26 — `origin/main` Sync, VoxCPM2-8bit Voice Migration & Parakeet STT QA
* **Main Sync & Pipeline Switch (`src/content/voice_profiles.json` v5, `scripts/generate-voices.mjs`, `scripts/generate-voices-voxcpm2.py`, `scripts/lint-narrative.mjs`, `assets/MANIFEST.json`, `AGENTS.md`, `docs/HARNESS.md`, `docs/VOICE_GUIDE.md`):**
  * Pulled `origin/main` (`ef439d5`, Intake Assistant prologue, rescaled Variant A `H%` shader, and opening minigames `CON-02` → `PLS-03`) and recompiled `spike_shift1.ink`.
  * Migrated default TTS synthesis from **Qwen3-TTS 1.7B 4-bit** (`24 kHz`, `96 kbps`) to **VoxCPM2-8bit** (`mlx-community/VoxCPM2-8bit`, Apache-2.0, `48 kHz` continuous latent diffusion, `128 kbps` mono MP3) with single-anchor biological identity locking (`sibling_primary`, `sibling_secondary`, and `archive_echo` sharing `sibling_primary_warm.wav` / seed `14221`), per-emotion `instruct` steering, turn-chain continuation (`prompt_audio` + `prompt_text`, max chain length `3`), `synthHash` per-line staleness tracking, `agate` removal + gentle anti-click edge fades + 2-pass `-17 LUFS` `loudnorm`, `atempo=1.03` removal on `sibling_secondary`, and expanded spoken-number/bracketed-telemetry normalization (`prepareSpokenText`).
  * Added automated **Parakeet TDT 0.6B v3** (`mlx-community/parakeet-tdt-0.6b-v3`) STT WER QA (`sttQaMaxWer: 0.20`, up to `2` targeted retries) and updated `lint-narrative.mjs` Check 12 and `assets/MANIFEST.json`.
* **Full Dialogue Regeneration & 9-Gate Verification:**
  * Re-synthesized all **184/184** voiced lines (`3.1%` / `0.031` avg WER, `7.43 GB` MLX peak; fixed `future_cold` bracketed ALL-CAPS telemetry normalization and `trim_edge_silence` soft onset padding, leaving `0` lines above WER threshold) and refreshed the `7` `public/auditions/ref_*.mp3` clips + `public/auditions/manifest.json`.
  * **Verified:** Full `npm run verify` (**ALL 9 GATES PASSED**: `compile-ink`, `tsc --noEmit`, `vitest run` **12 files · 175/175 tests**, `sim-playthroughs` 500 economy + 120 real-Ink runs, `lint-narrative` 4,406 Ink words / 184 IDs, `check-hygiene` 63 TS / 9 JSON / 0 zombies, `MANIFEST.json`, `vite build` 1.03s, and full `e2e-visual.mjs` across all 21 instruments + V1/V2 + 7 mobile `844×390` viewports with `0` errors).

---

## Session 29 — 2026-11-27 — Voice-Sync Guardrails, Prose Critic Harness Process & Prologue/Shift-1 Overhaul
* **Voice-Sync & Selective Regeneration Guardrails (`scripts/voice-extract.mjs`, `generate-voices.mjs`, `generate-voices-voxcpm2.py`, `lint-narrative.mjs`, `VoiceEngine.ts`, `voice_profiles.json`, `.github/workflows/ci.yml`):**
  * Extracted shared `.ink` voice extractor (`scripts/voice-extract.mjs`) so `generate-voices.mjs` and `lint-narrative.mjs` use identical parsing, `prepareSpokenText`, and `synthHash` logic.
  * Fixed `--ids=` manifest poisoning and added `audioSha256` + persisted `sttWer`/`sttTranscript` receipts in `voice_script.json`; verified `0 generated, 157 cached` idempotency on unchanged lines.
  * Tightened Parakeet STT QA (`sttQaMaxWer: 0.15`, `<5`-word threshold `0.25`, `41,802` normalization, and `has_onset_drop` automatic retry); removed risky 36-char `shortPrefix` fallback in `VoiceEngine.ts` with dev mismatch warnings.
  * Added **Two-Tier Voice Sync** + prose/pacing linting to `scripts/lint-narrative.mjs`: warns on local/draft `.ink`↔VO drift and **hard-blocks** `main` PRs, pushes to `main`, releases, and `VOICE_SYNC_STRICT=1`; hard-fails `{var}` interpolations in voiced lines and objective bad collocations; warns on `>3`-line bursts, `>5`-option menus, and `>35%` em-dash ratio.
* **AI Harness & Prose Quality Upgrade (`docs/VOICE_GUIDE.md`, `docs/HARNESS.md`, `.agents/{personas,skills}/*`):**
  * Locked **1–3 spoken lines max** per burst (across transitions) and **≤ 5 visible options** per menu (`0–3` `◇ ASK` + `1–2` replies/actions), added §1.5 **5-Part Native-English, Physical Sanity & Anti-Cliché Checklist** + §1.6 Voice-Sync Contract, updated stale `Qwen3-TTS` refs to `VoxCPM2-8bit`, and made an independent read-only **Prose & English Critic subagent** mandatory for `.ink`/copy changes.
* **Prologue Pacing, Choice Legibility & Shift-1 Prose Polish (`src/content/dialogue/spike_shift1.ink`, `src/content/ui_copy.json`, `src/ui/styles.css`, `tests/unit/perfOptimizations.test.ts`):**
  * Rebalanced `intro_prologue_assistant` and `intro_overseer_wakeup` into tight 1–3-line bursts and `<= 5`-option menus, sharpened `.choice-group-divider` contrast, fixed grammar/missing-article/physical-logic slips (`a full hundred percent`, `a paper cup of cold coffee`, `waking cold`, `in the cold dark`, `ten light-years astern`, `establish a baseline`, `Surface Memory Compressed`, `impossible geometry`), fixed `1419` address/knowledge/continuity/dead-branch/Shift-1-Overseer-bypass issues, kept `0/157` voiced lines over 160 chars, and lowered em-dash density to `16.5%`.
  * Audited with 3 independent `Native-English Prose Critic` subagent passes (`VERDICT: PASS`) and selectively regenerated **107** changed VoxCPM2 clips (`50` unchanged cached, `27` retired clips pruned, `1.9%` / `0.019` avg WER).

---

## Session 30 — 2026-11-27 — Harness 3.0, Real-Sky 10-ly Catalog, Scale Markers, Filigree Fractal Shell & Scan-to-Story Cohesion (`H0-03`, `P2-03`, `P2-04`)
* **Harness 3.0 & Schemas v2 (`H0-03` — `AGENTS.md`, `docs/*.md`, `.agents/{personas,skills}/*`, `features.json`, `anomalies.json`, `shifts.json`, `balance.json`, `storylets.json`, `ui_copy.json`, `scripts/lint-narrative.mjs`, `sim-playthroughs.mjs`, `check-hygiene.mjs`, `tests/unit/targetCohesionContract.test.ts`):**
  * Inscribed the 6-class Target Scale Taxonomy (`planet`, `star_system`, `nebula`, `galaxy`, `galaxy_cluster`, `horizon_anomaly`), 6-stage Escalating Fractal Anomaly & Shift 1–2 spoiler-floor rules, Hybrid Real-Sky 10-ly Station Rule (`CC BY-SA` prohibited), Shift Cohesion Matrix across all 21 instruments, split `anomalies.json` write ownership, and the Shift Vertical Slice Order (`docs/HARNESS.md` §1.6) across strict 1-owner SSOT docs, `AGENTS.md` (47 lines), 6 personas, and 8 skills.
  * Upgraded `anomalies.json` (`schema_version: 2`, fixing the 4 target↔minigame mismatches: `sol_centauri_bearing` v4, `cluster_j1419_a`→`lens_focus`, `sector_s04_seam`→`pulsar_echo`, `asterism_drift_01`→Eagle Dust Pillars `multiband_loupe`; aligning `antipodal_poles_seam` to `horizon_anomaly`), `shifts.json` (`schema_version: 2`, `status: "implemented" | "planned"`, `requiredTargets` [2] + `optionalTargets` [1–2], `skyRevealTier`, `anomalyPhase`, `narrativeHooks`), `balance.json` (`clean`, `deep_overclock`, `partial`), and mechanical cohesion gates (Checks 13–19 + `targetCohesionContract.test.ts`).
* **Real-Sky 10-ly Catalog, 6-Class Scale Markers & 6-Stage Filigree Fractal (`P2-03` — `scripts/build-star-catalog.mjs`, `assets/astro/star_catalog_10ly.bin`, `assets/MANIFEST.json`, `OpticsScene.ts`, `opticsShaders.ts`, `dreamShaders.ts`, `DreamCanvas.ts`):**
  * Built commercial-safe 18,000-star 10.0-ly offset catalog from ESA Hipparcos-2 / CDS VizieR (`CC BY 3.0 IGO`, zero HYG/OpenNGC) with Sol + Alpha Centauri AB astern (`I14S` v1, 144,024 bytes, cumulative tiers `913..18,000`), progressive Shifts 1–6 star density + ~30° local sector deepening around decoded targets, bounded (`<=6`) LRU lazy-loading across all 15 NASA/ESA sky plates scaled by `scaleClass`, 6 diegetic 14px Zeiss SVG scale markers + reticle etches, and a 6-stage spherical recursive fold filigree fractal shell with 20-year phase-lag wave modulation + 2D dream Voronoi crack bleed.
* **Diegetic Pre-Scan Brief, Post-Scan Closure, Stage-3 `[O]` Anomaly Overclock & Target-Reactive Storylets (`P2-04` — `MinigameRegistry.ts`, `MinigameHostView.ts`, `TransitionDirector.ts`, `UIController.ts`, `StoryletScheduler.ts`, `DialogueRunner.ts`, `spike_shift1.ink`, `styles.css`):**
  * Declared `supportedScales` & `supportsAnomalyBleed` on `MinigameRegistry`, plumbed live `anomalyBleed` & `fractalStage` into `MinigameStateVector`, wired on-glass reticle `preScanBrief` intent + action-verb CTA, skippable 2.2s `optical_dive` callout with `briefingHoldSec` timer hold, `.mg-top-left` target breadcrumb, un-hidden `#mg-finale-snippet` (`dossierFinding`, Mandate vs. Optional pips, Stage-3 `[O]` Anomaly Overclock `deep_overclock`), `.sky-marker.decoded` arrival pulse + unvoiced pullback Psyche marginalia, Shift 1 optional "stay awake" Carina/Eagle Pillars beat (`shift1_optional_scan_echo`), and dynamic `decoded_*` target-flag sync into `StoryletScheduler` & Ink.
* **Verified (`@verifier` independent sign-off):** `node scripts/verify.mjs --fast` **PASS** (`compile-ink`, `tsc --noEmit`, `vitest run` **13 files / 182 tests passed**, `sim-playthroughs.mjs` 500 economy + 120 Ink runs with 0 soft-locks, `lint-narrative.mjs` Checks 13–19 / 4,125 Ink words / 162 IDs, `check-hygiene.mjs`, `MANIFEST.json`, `vite build`), plus `node scripts/e2e-visual.mjs --smoke` and `--flows=prologue,sky,dream,mobile` (**0 errors**; desktop & mobile `844x390` PNGs inspected).
* **Follow-Up Note:** Re-synthesize the 6 modified/added `spike_shift1.ink` VO lines (`intro_sib_lead_ir_v2`, `s1_opt_open_warm`, `s1_opt_open_mid`, `s1_opt_open_cold`, `s1_opt_rep_dust`, `s1_opt_rep_sleep`) via `npm run generate:voices` when the VoxCPM2 server is running before merging to `main`.
