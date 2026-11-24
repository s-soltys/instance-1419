# ART_DIRECTION.md — Dual-Reality Visual & Cinematic Staging Spec

The defining aesthetic of *Instance-1419* is the **visceral contrast between cold, authentic deep-space astrophotography (3D)** and **full-bleed, degrading expressionist oil impasto memory (2D)**—with **zero generic HTML dashboard chrome**.

---

## 1. Anti-HTML UI Philosophy (Locked Direction)
* **No chat-app or SaaS artifacts:** Zero bouncing typing-indicator dots, zero per-line geometric SVG avatars or boxed `▶` replay buttons, zero duplicate HUD meters, zero rounded pill badges, zero browser `<input type="range">` sliders, and zero literal `"MINIGAME"` labels.
* **Editorial Typography & Film Grain:** Self-hosted literary serif + engraved monospace typography paired with subtle full-viewport photographic film grain (`3–4%`) so canvases and words share one optical surface.
* **Zero-Tutorial Diegetic Sightlines:**
  1. Single hairline `H%` margin gauge in dreams displaying a **visible locked `Max_H` ceiling notch** that previews cracking during Hold-to-Prune.
  2. Off-band radio-static flicker on the Shift 3 vernier teasing the out-of-phase Secondary Sibling.
  3. Subtle clinical scanline pulse when risking deep/overclock scans.

## 2. Full Pure-HTML Cinematic Suite (Transitions & Setpieces)
All transitions run pure-HTML (Three.js + single-pass GLSL + CSS choreography + Web Audio), always interruptible under `?dev=1` for rapid testing:
1. **Prologue Warm Anchor → Cold-Boot Whiplash → 6-Blade Hexagonal JWST Iris:** Launch directly into a zero-HUD warm 2D domestic moment → trying to say the loved one's name smears `uFaceAnchor` and hard-cuts via white-cyan flash + brief dead silence into cold telemetry over a closed **6-blade hexagonal JWST iris shutter** → pressing `OPEN APERTURE` mechanically opens the blades onto the live 3D starfield.
2. **Shader 3D ↔ 2D Dissolves & Optical Target Dives:** Replace flat black SPA fade veils with FOV widening + FBM oil-wash shader dissolve (`uDissolve`) entering dreams, crisp horizontal cyan sensor-slit wake-ups, and rapid `fovDeg` telescope dives from Sky Overview into 3D Target Inspect.
3. **Unannounced Overseer Ambush (Zero Modal Popup, Zero Telegraphed Warning):** Mid-sentence freeze of painting motion (`uTime` lock), slicing `7vh` clinical anamorphic letterbox bars, a silver-cyan GLSL scanner sweep (`uAuditSweep`) draining warm ochre behind it, reverb hard-cut to dead silence, and sterile clinical dialogue staging right beside the frozen painting.
4. **Hold-to-Prune Visceral Amputation:** Pruning choices require **Press & Hold (`0.75s`)** with live Voronoi fracture preview (`uPruneShock`) as you hold (releasing cancels). Committing clears the ribbon, fires a radial glass-shear shockwave from `uFaceAnchor` + 3-stage Web Audio pressure/sub-thump/vacuum drop, and stamps the permanent `Max_H` ceiling drop directly into the void.
5. **Shift Time-Skip Montage & Finale Climax:** Star-trail RA slew + dual `1419/1420` phase-drifting oscilloscope hairlines across shifts; Shift 2 *They Live* visible sky-seam ignition in Near-IR; Shift 5 360° off-center sphere reveal; Shift 6 broadcast launch + 20-year iris freeze.

## 3. 3D Mode: Diegetic Deep-Space Observatory (JWST / Hubble Astrophotography)
* Authentic NASA/STScI/ESA astrophotography feathered into a 16,000-star blackbody skyfield (`opticsShaders.ts`), curved optical glass vernier reticle, scrolling RA/DEC scales, and custom pointer-draggable spectral vernier (`200–1800 nm`).
* Starting Shift 2 (*They Live* reveal), Near-IR sweeping visibly ignites the artificial geometric horizon seams (`uAnomalyProgress` + `uOpticalFidelity`).

## 4. 2D Mode: Living Painterly Dream Tableaus (4–5 Shared Room Paintings)
* **Full-Bleed Composition (`100vw × 100vh`):** Aspect-preserved `cover` UV in GLSL (`dreamShaders.ts`), feathered charcoal-indigo `.dream-ribbon` (`<=38vw` desktop), dimmed older history beats, and italicized margin-indented Psyche whispers.
* **Ink-Tag Stage Bus (`#mood`, `#camera`, `#beat`, `#portrait`):** Ink tags smoothly drive shader camera zoom/pan (`uCamZoom`, `uCamPan`), lighting mood (`uMoodWarmth`, `uMoodDim`), and beat pulses (`uBeatPulse` for face-slips/shudders).
* **Zero-Asset Procedural Living Life:** Pointer/breathing parallax around `uFaceAnchor`, floating sunlit dust motes at high `H%`, and Voronoi shards + faint cyan horizon wireframe bleeding into the upper dream ceiling at low `H%` (shared cleanly across 4–5 base room paintings; tactile Ink micro-actions replace clickable painting hotspots).

## 5. Responsive Landscape Ergonomics
* Verified across Desktop `1280×720` / `1920×1080` and Mobile Landscape `844×390` (`safe-area-inset-*`, touch drag, pinch-to-zoom, and hold-to-prune via unified Pointer Events).
