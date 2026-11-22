---
name: astro-asset-curator
description: Fetch, optimize, and license-verify real public astronomy imagery and star catalogs (NASA/STScI JWST, Hubble, ESA Gaia/Hipparcos) for commercial use in Instance-1419, maintaining assets/MANIFEST.json for automated in-game Credits.
---

# Skill: Astronomy Asset Curator (`astro-asset-curator`)

## When to Use
Use when sourcing real cosmic photography, deep-field backgrounds, nebulae, Einstein-ring references, or starfield coordinate catalogs for 3D waking shifts.

## Required Reading Before Work
1. `docs/CANON.md` (Section 6: Commercial & IP Rules)
2. `docs/ART_DIRECTION.md`
3. `assets/MANIFEST.json`

## Core Workflow
1. **Verify Commercial-Safe Licensing First:**
   * **Allowed:** NASA / STScI public-domain releases, ESA `CC BY 4.0` / `CC BY 3.0 IGO` datasets (with attribution), `CC0` / Public Domain star catalogs.
   * **Strictly Rejected:** Any `CC BY-SA` (ShareAlike), `CC BY-NC` (Non-Commercial), or unclearly licensed source.
2. **Fetch & Optimize for Pure HTML + Mobile WebGL:**
   * Downscale and convert textures to WebP (max `2048px` per skybox/deep-field tile) so pure HTML playtest builds load rapidly over the web and fit mobile GPU memory budgets.
   * Compress star catalogs into compact typed JSON/binary arrays (position, magnitude, B-V color index for realistic blackbody star tinting).
3. **Update `assets/MANIFEST.json` Atomically:**
   * Add an entry for every saved file containing `path`, `source_url`, `license`, `attribution`, `ai_generated: false`, and `notes`.
   * Verify `npm run verify` confirms zero unregistered files under `assets/`.

## Hard Constraints
* Never commit an asset without a verified `assets/MANIFEST.json` entry.
* Never imply NASA or ESA endorsement in UI or credits copy—use standard factual credit lines.
