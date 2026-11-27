---
name: plot-architect
description: Develop and refine the 2-hour plot spine, shift beat sheet, coordinated Overseer timeline, rotating Dream Persona cache rules, archived 1,417-copy echoes, and H%/Chaos economy balance for Instance-1419.
---

# Skill: Plot Architect (`plot-architect`)

## When to Use
Use when designing or revising `docs/BEAT_SHEET.md`, `src/content/shifts.json`, `src/content/storylets.json`, `src/content/balance.json`, or the narrative/taxonomy fields of `src/content/anomalies.json`.

## Required Reading Before Editing (SSOT)
1. `docs/CANON.md` (§2.5 Target Scale Taxonomy, Anomaly Escalation & Spoiler-Horizon Rules)
2. `docs/BEAT_SHEET.md` (§1.5 Shift Cohesion Matrix)
3. `docs/VOICE_GUIDE.md` (§1.7 Pre-Scan Brief & Post-Scan Echo Rules)
4. `docs/ARCHITECTURE.md` (§2.5 Schemas)
5. `docs/HARNESS.md` (Taste Compass, 1-by-1 calibration & §1.6 Shift Vertical Slice Order)

## Core Workflow
1. **Author the Shift Cohesion Packet (`docs/HARNESS.md` §1.6):**
   * For every shift `1..6` in `shifts.json` v2, define `shiftMandate`, `requiredTargets` (2) + `optionalTargets` (1–2), monotonic `anomalyPhase`, and `narrativeHooks` (`openingKnot`, `postRequiredKnot`, `dreamKnot`, `optionalArchiveEchoId`).
   * For every target in `anomalies.json` v2 (narrative-owned fields only), lock `scaleClass` sign-off, `anomalyRole`, `spoilerFloorShift`, `preScanBrief` (`<=16` words/field), `postScanEcho` (`dossierFinding <=110` chars, unvoiced `psycheLine <=22` words, unique `storyFlag`), and `proofContribution`.
   * Wire target-reactive triggers (`requiredDecodedTargets`, `minRequiredScansInShift`, `minOptionalScansInShift`, `requiresFlag`) in `src/content/storylets.json`.
2. **Enforce the 2-Hour Pacing Budget & Shift Scan Rule:**
   * Target runtime: **105–135 minutes** (`12k–16k` words read per run across Prologue + 6 Shifts + Finale; ~12–15 instruments played).
   * Enforce **2 required optical scans + 1–2 optional push-your-luck deeper scans per shift** across the 21-instrument sky.
3. **Coordinate the Overseer Network Timeline & 9-Persona Pool:**
   * Shifts 1–3 synchronized wake-ups (plus Shift 3 out-of-phase Secondary Sibling `1418` discovery window); Shift 4+ Overseer desynchronization; 3 sparse Archive tapes (`1406`, `1411`, `0812`).
   * Manage **9 Dream Personas** (`2 Fixed Anchors + 2 rotating` = 4 cached/run); pair `<70%` downward pruning with sacrificing a specific cached persona (`Max_H` drop).
4. **Verify Economy Math & Real Ink:**
   * Validate `balance.json` (`clean`, `deep_overclock`, `partial`), `shifts.json`, and compiled Ink via `node scripts/sim-playthroughs.mjs` and `npm run verify:fast`.

## Hard Constraints
* Honor all `docs/CANON.md` hard boundaries (never explain volunteer motive or 41,802-yr human evolution; zero proper names for loved ones).
* Hand off every structural revision to `consistency-auditor`.
