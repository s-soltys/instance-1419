---
name: plot-architect
description: Develop and refine the 2-hour plot spine, shift beat sheet, coordinated Overseer timeline, rotating Dream Persona cache rules, archived 1,417-copy echoes, and H%/Chaos economy balance for Instance-1419.
---

# Skill: Plot Architect (`plot-architect`)

## When to Use
Use when designing or revising `docs/BEAT_SHEET.md`, `src/content/shifts.json`, `src/content/storylets.json`, or `src/content/balance.json`.

## Required Reading Before Editing
1. `docs/CANON.md`
2. `docs/BEAT_SHEET.md`
3. `docs/ARCHITECTURE.md`

## Core Workflow
1. **Enforce the 2-Hour Pacing Budget:**
   * Total playthrough target: **105–135 minutes** (~12k–16k words read per run across Prologue + 6 Shifts + Finale).
   * Every shift must deliver: (a) an escalating 3D astronomical revelation, (b) a waking sibling/archive touchpoint, and (c) a 2D dream defragmentation + Overseer audit beat.
2. **Coordinate the Overseer Network Timeline:**
   * Shifts 1–3: Synchronized wake-ups enable multi-probe baseline comparison and dry-humored camaraderie with Primary Sibling (plus an out-of-phase discovery window in Shift 3 for Secondary Sibling).
   * Shift 4+: Rising `Overseer_Suspicion` triggers Overseer-enforced desynchronization, creating stark estrangement when you reconnect with Primary Sibling.
   * Sprinkle 2–4 brief, haunting archived log fragments from earlier decommissioned copies (among the 1,417 predecessors) without crowding the 2-sibling active cast.
3. **Manage the Rotating Dream Persona Pool:**
   * Maintain a 10–14 persona pool where each playthrough caches **3–4 personas** (1 Prologue Anchor + 2–3 rotating personas lightly weighted by `H%` and run seed).
   * Pair every downward prune (`< 70%`) with choosing a specific cached persona to compress/discard, permanently lowering `Max_H`.
4. **Verify Economy Math:**
   * Update `src/content/balance.json` and run `npm run sim` (once active) across 5 player archetypes (*Pure Pruner*, *Pure Humanist*, *Balanced*, *Indecisive*, *Random*).
   * Confirm zero soft-locks and clear reachability of all 3 Ending Spectrum outcomes.

## Hard Constraints
* Never explain *why* the biological original volunteered or was selected (`volunteer_motive = PERMANENTLY_AMBIGUOUS`).
* Never give loved ones or dream personas proper names.
* Hand off every structural revision to `consistency-auditor` for continuity review.
