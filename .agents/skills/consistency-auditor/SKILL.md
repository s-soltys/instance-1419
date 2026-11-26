---
name: consistency-auditor
description: Independently audit Instance-1419 across lore canon, character voice fidelity, 2-hour pacing, H%/Chaos economy math, IP originality, and commercial asset licensing—producing deterministic checks and line-referenced fix tickets.
---

# Skill: Consistency Auditor (`consistency-auditor`)

## When to Use
Run at the end of every feature or milestone before marking anything `"passing"` in `features.json`. Always execute from an independent critic perspective (never self-approving work you just wrote).

## Required Reading Before Auditing (SSOT)
1. `docs/CANON.md`
2. `docs/BEAT_SHEET.md`
3. `docs/VOICE_GUIDE.md`
4. `docs/ART_DIRECTION.md`
5. `docs/HARNESS.md` (Taste Compass) & `assets/MANIFEST.json`

## Core Audit Checklist
1. **Run Fast Mechanical Gates + Targeted Visual Check (`npm run verify:fast` + `--smoke`/`--flows=`):**
   * `compile-ink.mjs` & strict `tsc --noEmit`.
   * `vitest run` (including 21-game solvability & 3-axis contract tests).
   * `sim-playthroughs.mjs` (500-run economy simulation + compiled Ink knot traversal, `Max_H` ceiling drops, 3 endings reachable).
   * `lint-narrative.mjs` (name redaction, IP terms, word floor/ceiling, choice tag enums, zero `.choice-affinity-dot`, VO char cap & unvoiced isolation, 1420/1406 voice parity, 6-shift/21-instrument integrity).
   * `check-hygiene.mjs` (zero orphaned `.ts`/`.json` files, zero retired zombie symbols).
   * `assets/MANIFEST.json` 100% coverage & commercial-safe licenses, `vite build`, and targeted `e2e-visual.mjs` (`--smoke` or `--flows=...`). Full 21-instrument + mobile matrix runs automatically in `.github/workflows/ci.yml` (or via `npm run verify` on final phase sign-off).
2. **Qualitative SSOT Review:**
   * Audit lore & hard numbers against `docs/CANON.md` (`Instance-1419`, `41,802 years`, `1,417 prior copies`, `~10 ly`, `93B ly`, `~2 subjective years`, `20-year freeze`, `2 required + optional` shift scans, `8–12` Dream Personas with `2 Fixed Anchors + 2 rotating`).
   * Audit prose, choice UX, layout, and Cast 2 VO fidelity against `docs/VOICE_GUIDE.md`, `docs/ART_DIRECTION.md`, and the 4-point Taste Compass (`docs/HARNESS.md`).
3. **Output Format:**
   * Write concise audit reports under `docs/audits/<milestone>.md` with `PASS / BLOCKED` verdict and file/line-referenced fix tickets. Never silently rewrite creative work.
