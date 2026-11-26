---
name: plot-architect
description: Develop and refine the 2-hour plot spine, shift beat sheet, coordinated Overseer timeline, rotating Dream Persona cache rules, archived 1,417-copy echoes, and H%/Chaos economy balance for Instance-1419.
---

# Skill: Plot Architect (`plot-architect`)

## When to Use
Use when designing or revising `docs/BEAT_SHEET.md`, `src/content/shifts.json`, `src/content/storylets.json`, or `src/content/balance.json`.

## Required Reading Before Editing (SSOT)
1. `docs/CANON.md`
2. `docs/BEAT_SHEET.md`
3. `docs/ARCHITECTURE.md`
4. `docs/HARNESS.md` (Taste Compass & 1-by-1 calibration)

## Core Workflow
1. **Enforce the 2-Hour Pacing Budget & Shift Scan Rule:**
   * Target runtime: **105–135 minutes** (`12k–16k` words read per run across Prologue + 6 Shifts + Finale).
   * Enforce **2 required optical scans + 1–2 optional push-your-luck deeper scans per shift** across the 21-instrument sky in `src/content/shifts.json` (~12–15 instruments played in a typical 2-hour run).
   * Every shift delivers: (a) an escalating astronomical revelation, (b) a waking sibling/archive touchpoint, and (c) a 2D dream defragmentation + Overseer audit beat.
2. **Coordinate the Overseer Network Timeline:**
   * Shifts 1–3: Synchronized wake-ups enable multi-probe baseline comparison and dry-humored camaraderie with Primary Sibling (plus an out-of-phase Shift 3 discovery window for Secondary Sibling).
   * Shift 4+: Rising `Overseer_Suspicion` triggers Overseer-enforced desynchronization, creating stark estrangement when reconnecting with Primary Sibling.
   * Place 2–4 brief archived log fragments from earlier decommissioned copies without crowding the 2-sibling active cast.
3. **Manage the 8–12 Dream Persona Pool:**
   * Curate **8–12 Dream Personas**, surfacing **4 per run (`2 Fixed Anchors + 2 rotating personas` weighted by `H%` and seed)**.
   * Pair downward pruning (`< 70%`) with choosing a specific cached persona to compress/discard, permanently lowering `Max_H`.
4. **Verify Economy Math & Real Ink:**
   * Validate `balance.json` and `shifts.json` via `node scripts/sim-playthroughs.mjs` (500-run economy simulation + compiled Ink traversal).

## Hard Constraints
* Honor all `docs/CANON.md` hard boundaries (never explain volunteer motive or 41,802-yr human evolution; zero proper names for loved ones).
* Hand off every structural revision to `consistency-auditor`.
