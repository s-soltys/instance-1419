# ART_DIRECTION.md — Dual-Reality Visual & Diegetic UI Spec

The defining aesthetic of *Instance-1419* is the **visceral contrast between cold, authentic deep-space astrophotography (3D)** and **full-bleed, degrading expressionist oil impasto memory (2D)**—with **zero generic HTML dashboard chrome**.

---

## 1. Anti-HTML UI Philosophy (Locked Direction)
* **No rounded pill chips, no boxed sidebar cards, no browser `<input type="range">` sliders, no rigid CSS split-pane dividers.**
* Subtle full-viewport photographic film grain (`3–4%`) ties WebGL canvases and typography into one unified optical surface.
* All controls are **diegetic** (etched onto telescope lens glass in 3D waking mode) or **editorial** (numbered *Disco Elysium* literary choices floating on a feathered ink-wash ribbon in 2D dream mode).

## 2. 3D Mode: Diegetic Deep-Space Observatory (JWST / Hubble Astrophotography)
* **Visual Grounding:** Authentic public-domain NASA/STScI astrophotography (`jwst_smacs0723.webp`, `hubble_udf.webp`) feathered seamlessly into a 16,000-star blackbody skyfield with JWST-inspired 6-point diffraction spikes—pitch-black void, amber-gold & sapphire dust clouds, never neon sci-fi.
* **Diegetic Lens Glass Overlay:**
  * 90% unobstructed cosmos with subtle circular lens vignette.
  * Live scrolling RA azimuth ruler (top) and DEC elevation ruler (left) synced directly to camera panning.
  * Curved optical vernier reticle with etched circular lock-integration arc.
  * Projected 3D diamond markers directly on celestial coordinates + whisper-thin bare typographic bearing links.
  * **Custom Pointer-Draggable Spectral Vernier** (`400–1800 nm`) with calibrated ruler ticks and true-spectrum hairline thread.
* **Core Shaders (`src/engine/shaders/opticsShaders.ts`):**
  1. Authentic JWST/Hubble deep-field plates with near-IR exposure reveal (`uWavelengthMatch`, `uZoomFactor`).
  2. **Growing Fractal Anomaly (Dual-Reality Contamination):** Escalates across Shifts 1–6 via a 3D spherical recursive fold shader (`SKY_FRAGMENT`) and `ANOMALY_FRAGMENT` (`uFractalStage`, `uAnomalyProgress`), bleeding into 2D dream Voronoi cracks (`DREAM_FRAGMENT`) as `Anomaly_Progress` climbs or `H%` drops.

## 2.5 Target Scale Markers, Progressive Real-Sky, Fractal Filigree & Scan Closure UX
* **6 Diegetic 14px Zeiss SVG Scale Markers & Reticle Etches:** Replace the uniform `.diamond` sky marker with 6 bare etched SVG glyphs mapped 1:1 to `scaleClass` (`docs/CANON.md` §2.5), paired with matching reticle inner ring etches (`AU · PLANETARY`, `LY · STELLAR`, `KLY · NEBULAR`, `MLY · GALACTIC`, `GLY · DEEP FIELD`, `93 BLY · HORIZON`):
  * `planet`: circle + tilted orbital arc & transit dot.
  * `star_system`: 4-point optical star + twin binary offset dot.
  * `nebula`: 3 nested dashed organic cloud arcs.
  * `galaxy`: twin logarithmic spiral arms.
  * `galaxy_cluster`: 3 clustered dots inside a split lensing ring.
  * `horizon_anomaly`: recursive nested double-hairline hexagon.
  * **Marker & Pullback States:** Unscanned (open hairline) → Locked (muted amber fill + rotating tick) → **`.sky-marker.decoded`** (mint hairline check-dot dimmed to `0.42` opacity after a **1.2s arrival confirmation pulse** on pullback) → Anomaly-Coupled (hairline outer hex tick in Shifts 3–6). Also distinguish Shift Mandate (**solid ring**) vs. Optional Push-Your-Luck (**dashed ring**) pips in the HUD and mini Horizon Arc Ring.
* **15 NASA/ESA Plate Lazy-Loading & Angular Scaling:** `OpticsScene` maps every target's `plateId` across all 15 commercial-safe `CosmicPlateId` textures via a bounded LRU GPU pool (`<= 6` active WebGL textures for mobile VRAM hygiene), scaled in angular diameter by `scaleClass` (`planet`/`star_system` `10–14°`, `galaxy` `18–24°`, `galaxy_cluster` `26–32°`, `nebula` `30–38°`).
* **Progressive Real-Sky Density + Lateral Outward & ~35° Sector Deepening:** Single `THREE.Points` draw call (`star_catalog_10ly.bin`) opens Shift 1 with a lush multi-band visible starfield (~8,500+ stars globally and full 18,000-star depth across the active initial swath + ~35° decoded cones), then expands outward laterally (`uSurveyCosEdge`) across Shifts 1–6 up to full 360° 18,000-star depth while faint outer-flank next-shift plates (`~0.26` ambient silhouette) preview incoming sectors as you pan.
* **Razor-Thin Mathematical Filigree 6-Stage Fractal Shell + 2D Voronoi Crack Bleed:** `SKY_FRAGMENT` renders a branch-free 3D spherical recursive fold in Sol–Centauri's rest frame (`uSolDir`) with 20-year causal phase-lag wave modulation (`sin(uTime * 0.45 + dot(d, uSolDir) * PI - ...)`): invisible on wide sky in Shift 1 (`opacity: 0.0`), antipodal IR hairlines in Shift 2, pulsing geodesic seams in Shifts 3–4, and a delicate Zeiss-etched 5-octave crystalline filigree shell preserving deep-space blackness by Shifts 5–6, paired with matching hairline Voronoi border bleed in `DREAM_FRAGMENT`.
* **Persistent Right-Side Zeiss Schematic Brief (~7.5s Auto-Engage), Smooth ~3.6s `optical_dive` Handover & Quiet Codex:**
  * On reticle lock, dock `#reticle-brief` as a translucent Zeiss-glass briefing panel on the upper right of the viewport with why we are scanning (`preScanBrief.whyNow`), a full-width hairline SVG schematic/graph (`src/ui/InstrumentSchematics.ts`), 1-word goal badge + legible instruction + control hint, and a **7.5s** auto-engage countdown (pausable via `HOLD`, cancellable by panning away, or instant via click/`Space`).
  * `optical_dive` (**3.6s**, pure visual iris zoom without a duplicate center card) carries the same right-side brief seamlessly across into the minigame (`briefingHoldMs: 2600` gates Stage-1 timers and input until dive settle), holds it in `handover` state (`2.6s`) while initial animations such as `constellation_recall` playback begin, and gently dissolves it (`1.6s`).
  * On completion, un-hide `#mg-finale-snippet` with `postScanEcho.dossierFinding` (`CLEAN LOCK` / `DEEP OVERCLOCK` / `PARTIAL`), show Mandate vs. Optional status, and float unvoiced `psyche_*` marginalia (`postScanEcho.psycheLine`) on the 3D sky glass for ~5s after pullback.
  * **Quiet Optional Codex:** Keep `CODEX` understated in the sky HUD without screaming unread counts or post-scan Codex buttons—playable end-to-end without opening it.
  * **Unhurried Dream & Overseer Cadence:** `dream_submerge` (~4.2s) and `DreamCanvas` 3s glaze reveal settle calmly (`2.6s`) before dream dialogue begins; Overseer audits wait for spouse VO completion + a `1.6s` beat before slicing in smoothly.

## 3. 2D Mode: Full-Bleed Expressionist Oil Impasto (*Disco Elysium* Aesthetic)
* **Art Style:** Bold palette-knife oil impasto brushwork—warm ochre, burnt sienna, and amber window highlights contrasting against deep Prussian blue and umber shadows. Softly obscured faces reinforce permanently lost names.
* **Full-Bleed Composition & Dark-Right-Third Rule:** Every 16:9 oil painting (`1280×720` WebP) places its primary figure, symbolic object, and key light in **`x: 0.14–0.55`** (`coverUv` anchor `0.36`) while keeping the **right third (`x > 0.62`)** in deep low-luminance Prussian/umber shadow (`lum < 0.18`) for crisp Layout A typography legibility.
* **Swappable Character & Branching Tableau Contract (`src/content/characters.json`):** Every Dream Persona resolves through `characters.json` + `assets/MANIFEST.json` with a `tableaus` map (6 paintings per Fixed Anchor: `base`, `beat2_a`, `beat2_b`, `beat3_warm`, `beat3_strained`, `farewell`; 4 paintings per Rotating Persona: `base`, `beat2`, `beat3_warm`, `beat3_strained`) and calibrated per-tableau `faceAnchor` UV `[x, y]`.
* **Procedural Gradual `H%` Degradation Shader (`src/engine/shaders/dreamShaders.ts`):**
  * Uses the **Variant A ("Protected Core, Cohesive Silhouette")** curve rescaled so `~78%` clarity maps to `100%` (`hA = clamp(hRaw * 0.78 - uPruned * 0.12, 0.0, 1.0)`):
  * **`H = 100%` (`hA = 0.78`):** Warm golden oil glaze with subtle varnish craquelure, gentle facial haze, and light outer rim aging while keeping the face clear and warm.
  * **`H = 70%` (`hA = 0.55`):** Richer peripheral stained-glass fracture and dream haze around the room margins while `faceProtect` shields facial anatomy and retains relatively warm skin/room tones so the speaker reads clearly as a person.
  * **`H = 45–60%`:** Protection fades (`faceProtect` drops steeply below ~55%), cooling shadows and primary Voronoi shards cross onto shoulders and face.
  * **`H = 20–30%` / Pruned:** 2-ring 17-tap facial obliteration melts eyes/nose/mouth away completely while cohesive small-offset Voronoi shards (`max 0.032` UV) and outer-weighted Sobel contours preserve the character's head/shoulders posture silhouette.
  * **Eyelid / Focus Wake-Up (`uWakeProgress` + `uHeadTilt`):** Smooth curved eyelid-opening mask with radial out-of-focus blur, drowsy ~2° head-tilt breathing, and warm-to-clear focus settle for the Prologue wake-up.
  * **Overseer Audit Interrupt:** Crisp clinical white-cyan hairlines slice across top/bottom of the painting while a sterile monochrome header cuts over the dialogue ribbon.

## 3.5 Leading Color & Bespoke SVG Icon Grammar
* **Orthogonal Choice-Plate Spectrum (Sacred):** Explore (`#8ea7be` Slate), Consequential (`#ebb062` Burnished Amber everywhere, including Comms), Permanent Prune (`#e27880` Crimson Hold-to-Commit). Never render `.choice-affinity-dot`.
* **Waking & Internal SVG Icons (`src/ui/SpeakerAvatar.ts`):**
  * `overseer` (`#d8ecfa`): Eye-less broken caliper reticle (`reticle_default` / `accommodate` / `fractured`) plus rare deadpan minimal glyph (`crude_smiley`) inside untouched clinical chrome (zero cartoon props).
  * `sibling_primary` (`#6fd6b6`) & `sibling_secondary` (`#b8d474`): Reactive Twin-Arc Phase Waveforms (canted `22°` for `1418`; desaturates and steps into square waves when pruned `<45%`).
  * `archive_echo` (`#a89f91`): Fragmented black-box decaying bars inside `[ ]` brackets.
  * `future_humanity` (`#fff0c2`): 6-point JWST diffraction flare + radio ripple.
  * `psyche_*` (`#d98c6c` warmth · `#7ab6d6` structure · `#b996e8` pattern): Whisper marginalia in dialogue + distinct 14px emblems in Codex/Studio.
  * **Dream Personas (9):** Each carries an individual muted oil pigment + a **16px etched object micro-glyph** (chipped mug, wire-rimmed glasses, paper cup, transit ticket, calipers, wristwatch, lowball glass, wrench, vending coin) for dialogue headers, Prune plates, and Shift 6 cards—see [`docs/CHARACTER_BIBLE.md`](CHARACTER_BIBLE.md).

## 4. Dialogue Feed & Choice Presentation (Locked Layout A + Style 1 & 4)
* **Layout A (Bottom-Anchored Right Column):** Keep the feathered right-hand reading column alongside the 2D painting, Zeiss Wake-Up schematic, and 3D starfield, **bottom-anchored** (`.dialogue-scroll > .dialogue-entry:first-child { margin-top: auto; }` + soft top `mask-image` fade—never `justify-content: flex-end` on `overflow-y: auto`) so choices always sit directly beneath the latest spoken line with zero empty chasm.
* **Anti-Chat-Widget Rules:**
  * Group consecutive lines from the same non-player speaker under a single speaker header.
  * Keep Kitchen Prologue spoiler-free (`ACROSS THE TABLE` / `SUNDAY MORNING · BEFORE THE CLINIC`, never `[RELATION:SPOUSE_01]` before wake-up).
  * No inline stick-figure wireframe SVGs in dialogue transcripts—use subtle `.voice-live-dot` pulse indicators and hover-only borderless `▶` replay buttons.
  * No bouncing `•••` typing dots, no `border-bottom` hyperlink underlines on `.hl-warm`/`.hl-cold` (use soft glow/weight shift), no `system-ui` fallback in narrative prose (serif for human/Sibling, crisp mono for Overseer/Archive), and a dedicated `.prologue-continue-bar` separate from `.choice-line`.
  * **Soft Internal Psyche Marginalia:** Occasional, indented italic thoughts with a whisper-quiet lowercase cue (`· warmth`, `· structure`, `· pattern`)—never ALL-CAPS stat banners.
* **Color-Coded Consequence Choice Plates (Style 1 + 4, Zero Warm/Cold Spoiler Dots):**
  * Render full spoken lines inside translucent tactile plates (`1–6`, `↑/↓`, `Enter`, `translateX` hover without padding reflow). Never render `.choice-affinity-dot` Warm/Cold spoiler dots.
  * **Non-consequential / optional exploration (`# weight:explore`, `# kind:ask`):** Calm neutral-slate register (`◇` + `ASK` badge, separated above consequential replies by a subtle divider).
  * **Consequential (`# weight:consequential`):** Distinct luminous warm-amber/gold register (`01.`, `02.`, `→` for `# kind:action`).
  * **Irreversible permanent pruning (`# kind:prune # weight:permanent`):** Crimson **Hold-to-Commit** plate (`650ms` hold or click-to-arm + confirm) with plain-language cost whisper (`# hint:...`).

## 5. Responsive Landscape Ergonomics (Verified by Playwright)
* Verified at Desktop (`1280×720` / `1920×1080`) and Mobile Landscape (`844×390`, honoring `safe-area-inset-*`).
* Touch drag, pinch-to-zoom, and pointer-draggable vernier work identically on mouse and mobile touchscreens.
