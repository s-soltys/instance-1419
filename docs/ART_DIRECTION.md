# ART_DIRECTION.md — Dual-Reality Visual & Shader Spec

The defining aesthetic of *Instance-1419* is the **visceral contrast between cold, photorealistic cosmic scale (3D)** and **intimate, degrading painterly memory (2D)**.

---

## 1. 3D Mode: Waking Exploration (Photorealistic Optics)
* **Visual Grounding:** Real astronomy—JWST/Hubble deep-field nebulae, Gaia starfield catalogs, realistic blackbody star temperatures (blue-white O/B stars to warm amber K/M giants), subtle optical bloom and diffraction spikes.
* **Camera & Feel:** You are a sensor probe, not a pilot. Slow, damped angular inertia; tactile aperture framing; ultra-clean minimalist optical HUD (hairline reticles, wavelength nanometer readout, subtle telemetry at screen edges).
* **Core Shaders (`src/engine/shaders/`):**
  1. `lensing.glsl`: Physically inspired Einstein-ring gravitational distortion driven by aperture alignment (`uLensOffset`, `uEinsteinRadius`, `uFidelity` scaled by `H%`/pruning).
  2. `spectral.glsl`: Smooth band-pass reveal from optical → infrared → microwave, separating natural dust/galaxies from impossible geometric horizon leaks.
  3. `enclosure.glsl`: Progressive celestial-sphere projection culminating in Shift 5/6's haunting, razor-thin geometric curvature enclosing Sol–Centauri at 93 billion light-years.

## 2. 2D Mode: Painterly Dreams & `H%` Visual Degradation
* **Style Target:** Warm, tactile oil/impasto brushwork inspired by *Disco Elysium*—expressive faces with softened edges, rich ochre/umber/amber memory lighting contrasted against cool indigo shadows.
* **Swappable Character Asset Contract (`src/content/characters.json`):**
  * Every Dream Persona has 1 cohesive portrait slot (+ optional mood variant) and shares 1 of 5–6 dream environment tableaus (kitchen table, rain-streaked window, night porch, hospital/transfer room, quiet shoreline, dim hallway).
  * Assets are **completely swappable**—draft/generated painterly bases can be replaced at any time without modifying code or `.ink` scripts.
* **Procedural `H%` Degradation Shader (`dream_degrade.glsl`):**
  * **`H = 85–90%` (Unsealed Warmth):** Rich impasto texture, warm golden-amber LUT, gentle organic brush breathing, soft vignette.
  * **`H = 65–75%` (Starting Baseline):** Warm-neutral palette, slight edge canvas bleed, subtle chromatic memory softness.
  * **`H = 40–60%` (Thinned / Pruned):** Desaturated cool slate/cerulean shift, brushstroke thinning exposing raw canvas/grid beneath, occasional horizontal telemetry scanline glitches.
  * **`H < 35%` (Hollow / Fractured):** Voronoi shard fragmentation, cold cyan-white clinical monochrome, portrait partially dissolving into clean wireframe/vector bounding boxes.
* **Overseer Audit Visual Shift:** When the Overseer interrupts a dream, a crisp monochrome clinical frame slices cleanly across the painterly canvas—never subtle, always jarring.

## 3. Hard-Cut Transitions
* **Warm 2D → Boot Log → 3D Void:** Instantaneous hard cut (zero cozy fade) into stark monospace terminal text on true black (`#05070A`), accompanied by a sterile relay click, before snapping open to the vast 3D deep field.

## 4. Responsive Landscape Ergonomics (Desktop + Mobile)
* **Primary Viewports Verified by Playwright:**
  * Desktop 16:9 (`1920×1080`)
  * Mobile Landscape (`844×390`, accounting for safe-area insets)
* **Dialogue Layout:** Side-column scrolling prose log (*Disco Elysium* right-hand column, ~36–42% width on desktop, ~45% on mobile landscape) leaving 55–64% of the screen unobstructed for the painterly dream tableau and character portrait.
* **Touch Targets:** Minimum `44×44px` hit areas; drag/scrub optical controls placed in thumb-friendly zones so fingers never obscure the central lensing target.
