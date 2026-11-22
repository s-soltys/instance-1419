# Harness Verification & Curation Scripts Contract

These scripts implement mechanical enforcement for *Instance-1419* (implemented in Phase 0/1):

1. **`verify.ts` (`npm run verify`)** — Master verification gate:
   * Runs `tsc --noEmit`
   * Compiles all `src/content/dialogue/*.ink` files via `inkjs`
   * Runs `sim-playthroughs.ts` (500 simulated playthroughs across 5 archetypes)
   * Runs `lint-narrative.ts` (canon/name/tag/word-budget/IP checks)
   * Verifies 100% of files under `assets/` are registered with commercial-safe licenses in `assets/MANIFEST.json`
2. **`sim-playthroughs.ts` (`npm run sim`)** — Headless Node simulator driving `StateStore` + `storylets.json` + compiled Ink to guarantee zero soft-locks, permanent `Max_H` drops, and reachability of all 3 endings.
3. **`lint-narrative.ts`** — Deterministic linter catching:
   * Proper names accidentally assigned to dream personas/loved ones
   * Missing or unregistered `# speaker:` / `# portrait:` tags
   * Per-shift word-budget overruns (protecting the 2-hour target)
   * Disallowed IP overlap terms
4. **`fetch-astro-assets.ts`** — Fetches verified public-domain NASA/JWST/Hubble imagery & ESA star catalog data, optimizes textures for WebGL/mobile, and updates `assets/MANIFEST.json`.
5. **`visual-eval.spec.ts` (`npm run test:visual`)** — Playwright suite capturing desktop (`1920x1080`) and mobile landscape (`844x390`) filmstrips across 3D optics, boot log, and 2D dreams at `H = 90%, 70%, 45%, 20%`, asserting zero console or WebGL errors.
