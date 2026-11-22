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
  2. Ultra-delicate geometric horizon seams that emerge in near/mid-IR and sharpen as `H%` is pruned (`uOpticalFidelity`).

## 3. 2D Mode: Full-Bleed Expressionist Oil Impasto (*Disco Elysium* Aesthetic)
* **Art Style:** Bold palette-knife oil impasto brushwork—warm ochre, burnt sienna, and amber window highlights contrasting against deep Prussian blue and umber shadows. Softly obscured faces reinforce permanently lost names.
* **Full-Bleed Composition:** The oil painting fills **`100vw × 100vh`** (aspect-preserved `cover` UV in GLSL, anchored left-of-center so the figure stays framed beside the dialogue ribbon).
* **Floating Ink-Washed Dialogue Ribbon:** Right-edge feathered charcoal-indigo gradient dissolving softly into the painting's dark Prussian shadow—zero sharp split border, with numbered literary serif choices (`1. — ...`) and gilded-amber hover rules.
* **Swappable Character Contract (`src/content/characters.json`):** Every Dream Persona resolves through `characters.json` + `assets/MANIFEST.json`.
* **Procedural `H%` Degradation Shader (`src/engine/shaders/dreamShaders.ts`):**
  * **`H = 75–90%`:** Rich warm impasto glow, subtle organic breathing.
  * **`H = 45–74%`:** Muted patina, cooling highlights, faint memory thinning.
  * **`H < 45%` / Pruned:** Voronoi glass shard fracturing, cold cyan-silver monochrome drain, wireframe telemetry grid bleeding through.
  * **Overseer Audit Interrupt:** Crisp clinical white-cyan hairlines slice across top/bottom of the painting while a sterile monochrome header cuts over the dialogue ribbon.

## 4. Responsive Landscape Ergonomics (Verified by Playwright)
* Verified at Desktop (`1280×720` / `1920×1080`) and Mobile Landscape (`844×390`, honoring `safe-area-inset-*`).
* Touch drag, pinch-to-zoom, and pointer-draggable vernier work identically on mouse and mobile touchscreens.
