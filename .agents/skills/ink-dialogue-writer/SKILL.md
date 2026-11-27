---
name: ink-dialogue-writer
description: Write and refactor Humanity-adaptive Ink (.ink) dialogues for Instance-1419 across Internal Psyche voices, Primary/Secondary Siblings, Overseer AI dream audits, rotating Dream Personas, and archived predecessor logs.
---

# Skill: Ink Dialogue Writer (`ink-dialogue-writer`)

## When to Use
Use when authoring, revising, or polishing `.ink` scripts in `src/content/dialogue/`.

## Required Reading Before Writing (SSOT)
1. `docs/VOICE_GUIDE.md` (canonical 5-role tone bible, burst/choice pacing, native-English checklist, choice tags, VoxCPM2-8bit cadence limits)
2. `docs/CANON.md` & `docs/BEAT_SHEET.md`
3. `docs/HARNESS.md` (Taste Compass & 1-by-1 calibration)
4. `src/content/characters.json` & `src/content/voice_profiles.json`

## Core Workflow
1. **Follow Scene Spec, Burst Pacing & Word Budgets:**
   * Honor the target budgets (`~2,000` words for Intro/Shift 1; `~600–900` words per Dream Persona vignette; `~1,500–2,200` words per shift read-path; `>= 1,200` and `<= 12,000` words per `.ink` file enforced by `lint-narrative.mjs`).
   * Keep uninterrupted spoken bursts to **1–3 lines max** (counting across choice-reply → next-knot jumps) and menus to **≤ 5 total visible options** (`0–3` `◇ ASK` questions + `1–2` consequential replies/actions) per `docs/VOICE_GUIDE.md` §1.
2. **Tag Lines & Choices Cleanly:**
   * Every voiced external line MUST carry a unique `# id:<stable_id>`, `# speaker:<id>`, and `# emotion:<id>` within the `<=160`-char target (`<=190` hard lint ceiling), with **zero** `{var}` interpolations.
   * Tag choices cleanly per `docs/VOICE_GUIDE.md` (`# kind:ask|reply|action|prune`, `# weight:explore|consequential|permanent`, `# hint:<cost>`).
   * Trigger mechanical side effects strictly via bound `EXTERNAL` functions (`prune_humanity`, `petition_overseer`, `shift_chaos`, `record_suspicion`, `set_audit_outcome`).
3. **Mandatory Prose Critic Subagent & Sync Verification:**
   * Invoke an independent read-only Prose & English Critic subagent (`docs/VOICE_GUIDE.md` §1.5: 5-second nitpicker check, physical sanity, anti-LLM-cliché pass, blind voice test) after every substantive `.ink` edit.
   * Run `node scripts/compile-ink.mjs` and `npm run verify:fast` (plus selective `npm run generate:voices` and `VOICE_SYNC_STRICT=1` before merging to `main`).

## Hard Constraints
* Honor `docs/CANON.md` hard boundaries (no proper names for loved ones; never explain volunteer motive or 41,802-yr evolution; zero CC BY-SA overlap).
