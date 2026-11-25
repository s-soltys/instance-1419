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
