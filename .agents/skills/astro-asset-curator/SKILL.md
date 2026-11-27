---
name: astro-asset-curator
description: Fetch, optimize, and license-verify real public astronomy imagery and star catalogs (NASA/STScI JWST, Hubble, ESA Gaia/Hipparcos) for commercial use in Instance-1419, maintaining assets/MANIFEST.json for automated in-game Credits.
---

# Skill: Astronomy Asset Curator (`astro-asset-curator`)

## When to Use
Use when sourcing real cosmic photography, deep-field backgrounds, nebulae, Einstein-ring references, or starfield coordinate catalogs for 3D waking shifts.

## Required Reading Before Work
1. `docs/CANON.md` (§2.5 Hybrid Real-Sky 10-ly Station Rule & §6 Commercial/IP Rules)
2. `docs/ART_DIRECTION.md` (§2.5 15-Plate Mapping & Progressive Sky Density)
3. `docs/ARCHITECTURE.md` (§2.5 `star_catalog_10ly.bin` & `realCatalogRef` Schema)
4. `assets/MANIFEST.json`

## Core Workflow
1. **Verify Commercial-Safe Licensing First:**
   * **Allowed:** NASA / STScI public-domain releases, Public Domain **Yale Bright Star Catalog (BSC5)**, **ESA Hipparcos-2 / Gaia DR3** (`CC BY 3.0 IGO` / `CC BY 4.0` with attribution).
   * **Strictly Rejected:** **HYG Star Database**, **OpenNGC**, or any `CC BY-SA` (ShareAlike), `CC BY-NC` (Non-Commercial), or unclearly licensed source.
2. **Maintain the 10-ly Real-Sky Catalog & 15-Plate Set (`scripts/build-star-catalog.mjs`):**
   * Transform commercial-safe J2000 bright stars (`d < 100 ly` parallax) to the probe's 10.0-ly station offset (placing Sol + Alpha Centauri astern along `sol_centauri_bearing`) and pack into `assets/astro/star_catalog_10ly.bin` (`'I14S'` v1 header + 18,000 8-byte quantized records stratified into `unlockTier: 1..6` matching `shifts.json` `skyRevealTier`).
   * Populate `realCatalogRef` (`catalog`, `designation`, `raJ2000Deg`, `decJ2000Deg`, `distanceLy`, `sourceLicense`) on targets per `docs/HARNESS.md` §1.6 split write ownership.
   * Downscale and convert 15 deep-field/nebula/galaxy textures to WebP (max `2048px`) for pure-HTML load speed and `<= 6` LRU GPU slot VRAM hygiene.
3. **Update `assets/MANIFEST.json` Atomically:**
   * Log every asset (`assets/`, `assets/astro/`, `public/voices/`, `public/music/`) with `path`, `source_url`, `license`, `attribution`, `ai_generated: false`, and `notes`.
   * Verify `npm run verify:fast` confirms zero unregistered files or prohibited licenses.

## Hard Constraints
* Never commit an asset without a verified `assets/MANIFEST.json` entry.
* Never imply NASA or ESA endorsement in UI or credits copy—use standard factual credit lines.
