---
name: ink-dialogue-writer
description: Write and refactor Humanity-adaptive Ink (.ink) dialogues for Instance-1419 across Internal Psyche voices, Primary/Secondary Siblings, Overseer AI dream audits, rotating Dream Personas, and archived predecessor logs.
---

# Skill: Ink Dialogue Writer (`ink-dialogue-writer`)

## When to Use
Use when authoring, revising, or polishing `.ink` scripts in `src/content/dialogue/`.

## Required Reading Before Writing (SSOT)
1. `docs/VOICE_GUIDE.md` (canonical 5-role tone bible, pacing, choice tags, Qwen3-TTS cadence limits)
2. `docs/CANON.md` & `docs/BEAT_SHEET.md`
3. `docs/HARNESS.md` (Taste Compass & 1-by-1 calibration)
4. `src/content/characters.json` & `src/content/voice_profiles.json`

## Core Workflow
1. **Follow Scene Spec, Pacing & Word Budgets:**
   * Honor the target budgets (`~2,000` words for Intro/Shift 1; `~600–900` words per Dream Persona vignette; `~1,500–2,200` words per shift read-path; `>= 1,200` and `<= 12,000` words per `.ink` file enforced by `lint-narrative.mjs`).
   * Keep exchanges unhurried (`◇` Q&A hubs via `# kind:ask # weight:explore`; avoid 1-line trailer ping-pong) and match each role's voice rules in `docs/VOICE_GUIDE.md`.
2. **Tag Lines & Choices Cleanly:**
   * Every voiced external line MUST carry a unique `# id:<stable_id>`, `# speaker:<id>`, and `# emotion:<id>` within the `<=160`-char target (`<=190` hard lint ceiling).
   * Tag choices cleanly per `docs/VOICE_GUIDE.md` (`# kind:ask|reply|action|prune`, `# weight:explore|consequential|permanent`, `# hint:<cost>`).
   * Trigger mechanical side effects strictly via bound `EXTERNAL` functions (`prune_humanity`, `petition_overseer`, `shift_chaos`, `record_suspicion`, `set_audit_outcome`).
3. **Compile & Verify:**
   * Run `node scripts/compile-ink.mjs` and `npm run verify`.

## Hard Constraints
* Honor `docs/CANON.md` hard boundaries (no proper names for loved ones; never explain volunteer motive or 41,802-yr evolution; zero CC BY-SA overlap).
