---
name: ink-dialogue-writer
description: Write and refactor Humanity-adaptive Ink (.ink) dialogues for Instance-1419 across Internal Psyche voices, Primary/Secondary Siblings, Overseer AI dream audits, rotating Dream Personas, and archived predecessor logs.
---

# Skill: Ink Dialogue Writer (`ink-dialogue-writer`)

## When to Use
Use when authoring, revising, or polishing `.ink` scripts in `src/content/dialogue/`.

## Required Reading Before Writing
1. `docs/CANON.md`
2. `docs/VOICE_GUIDE.md`
3. `docs/BEAT_SHEET.md`
4. `src/content/characters.json` (for valid `# speaker:` and `# portrait:` IDs)

## Core Workflow
1. **Check Scene Spec & Word Budget:**
   * Verify the target shift/storylet preconditions, word budget (~600–900 words per Dream Persona vignette; ~1,500–2,200 words per shift read-path), and required state hooks.
2. **Draft with Live `H%` Adaptation:**
   * Use Ink conditional blocks (`humanity >= 75`, `humanity >= 45`, `else`) to shift prose warmth, sensory precision, and clinical bleed.
   * Gate `psyche_warmth`, `psyche_clinical`, and `psyche_horizon` interjections on `humanity`, `chaos_drift`, and `anomaly_progress`.
   * For Primary Sibling scenes, read `sibling_delta = humanity - primary_sibling_h` to express *Shared Humor*, *One-Sided Grief*, *Eerie Sync*, or *Role Reversal*.
3. **Tag Cleanly for Engine & Shaders:**
   * Emit explicit tags on speaker/visual shifts: `# bg:<id> # speaker:<id> # portrait:<id> # mood:<id> # audio:<cue>`.
   * Trigger mechanical side effects strictly via bound `EXTERNAL` functions (`prune_humanity(delta, persona_id)`, `petition_overseer()`, `shift_chaos(delta)`, `set_anomaly_progress(val)`).
4. **Enforce Overseer Interrupt Pattern:**
   * Use Ink tunnels/diverts (`-> overseer_audit_interrupt ->`) so the Overseer slices abruptly and politely into warm 2D dream beats without warning.
5. **Compile & Lint:**
   * Compile `.ink` via `inkjs` and run `npm run verify` (`lint-narrative` + `sim-playthroughs`).

## Hard Constraints
* Zero proper names for loved ones/dream personas—always use `[RELATION:*]` tags or sensory anchors.
* Never make the Overseer sinister or cartoon-evil; keep it calm, clinical, and tragically banal.
* Short, mobile-legible beats (1–3 sentences per display block).
* Zero overlap with external CC BY-SA fiction (100% original phrasing and lore).
