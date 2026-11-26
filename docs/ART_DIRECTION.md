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
  2. **Growing Fractal Anomaly (Dual-Reality Contamination):** Across Shifts 1–6, the enclosure manifests visually as an escalating animated mathematical fractal—starting in Shifts 1–2 as hair-thin recursive seams in 3D deep fields (`uOpticalFidelity`), expanding across opposing sectors in Shifts 3–4, and blooming into an unmistakable animated fractal shell enclosing the 3D horizon by Shifts 5–6 (while subtly bleeding recursive patterns into 2D dream Voronoi cracks/windows as `Anomaly_Progress` climbs or `H%` drops).

## 3. 2D Mode: Full-Bleed Expressionist Oil Impasto (*Disco Elysium* Aesthetic)
* **Art Style:** Bold palette-knife oil impasto brushwork—warm ochre, burnt sienna, and amber window highlights contrasting against deep Prussian blue and umber shadows. Softly obscured faces reinforce permanently lost names.
* **Full-Bleed Composition & Dark-Right-Third Rule:** Every 16:9 oil painting (`1280×720` WebP) places its primary figure, symbolic object, and key light in **`x: 0.14–0.55`** (`coverUv` anchor `0.36`) while keeping the **right third (`x > 0.62`)** in deep low-luminance Prussian/umber shadow (`lum < 0.18`) for crisp Layout A typography legibility.
* **Swappable Character & Branching Tableau Contract (`src/content/characters.json`):** Every Dream Persona resolves through `characters.json` + `assets/MANIFEST.json` with a `tableaus` map (6 paintings per Fixed Anchor: `base`, `beat2_a`, `beat2_b`, `beat3_warm`, `beat3_strained`, `farewell`; 4 paintings per Rotating Persona: `base`, `beat2`, `beat3_warm`, `beat3_strained`) and calibrated per-tableau `faceAnchor` UV `[x, y]`.
* **Procedural Gradual `H%` Degradation Shader (`src/engine/shaders/dreamShaders.ts`):**
  * **`H = 90–100%`:** Luminous golden oil highlight bloom, rich saturated glaze, organic brushwork breathing, zero haze/craquelure.
  * **`H = 74–89%`:** Bloom fades, early facial haze, fine varnish craquelure web, split-tone shadow cooling, and tighter memory-edge vignette (clearly distinct from 100%).
  * **`H = 52–73%`:** Analog horizontal memory-echo ghosting, localized chromatic aberration, and subtle margin paint-flaking.
  * **`H = 32–51%`:** Voronoi stained-glass faceting, selective warm-ember shard retention, and 4-tap Sobel luminance contour etching.
  * **`H < 32%` / Pruned:** Cryo-cyan wireframe telemetry bleed, refractive fracture cracks (contaminated by subtle recursive fractal echoes at high `Anomaly_Progress`), and clinical monochrome drain.
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
