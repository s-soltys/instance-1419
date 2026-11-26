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
4. `src/content/characters.json` & `src/content/voice_profiles.json`

## Core Workflow
1. **Check Scene Spec, Pacing & Word Budget:**
   * Verify target shift preconditions and word budgets (~2,000 words for Intro/Shift 1; ~600–900 words per Dream Persona vignette; ~1,500–2,200 words per shift read-path).
   * Avoid 1-line trailer ping-pong: give reactions 2-line beats and provide optional `◇` curiosity Q&A hubs (`* [...] # kind:ask # weight:explore` looping back) at major info beats.
2. **Apply Locked 5-Role Tone Bible (`docs/VOICE_GUIDE.md`):**
   * **Spouse (`phantom_spouse`):** Warm kitchen surface with subtle uncanny memory cracks + candid, unsentimental upload honesty. Name loss emerges organically on compression seams.
   * **Overseer (`overseer`):** Calm, plainspoken night-shift doctor candor + eerie 1,417-copy patience. Never pompous or therapist-soft.
   * **Sibling 1420 (`sibling_primary`):** Dry, tired 3 AM deadpan gallows wit + lucid engineer/scientist explaining hard-sci-fi mechanics cleanly; zero sitcom pep. Adapts to `sibling_delta = humanity - primary_sibling_h`.
   * **Internal Psyche (`psyche_warmth`, `psyche_clinical`, `psyche_horizon`):** Occasional only at true turning points; **unvoiced** soft italic marginalia (no ALL-CAPS banners).
   * **Archive Echoes (`archive_echo`):** Dry, lucid "post-it note to my next self" gallows humor; never write spoken `(ARCHIVE · 1406):` prefixes.
3. **Tag Lines & Color-Coded Choices Cleanly:**
   * Every voiced external line MUST carry a unique `# id:<stable_id>`, `# speaker:<id>`, and `# emotion:<id>`, and stay `<=160` chars (`~10s` max) for clean Qwen3-TTS pacing (split longer thoughts across consecutive turn-grouped lines).
   * Tag choices with `# kind:ask|reply|action|prune`, `# weight:explore|consequential|permanent`, and `# hint:<plain-language cost>` (for `prune`). Never force Warm/Cold binary spoiler dots onto non-mechanical conversational choices.
   * Trigger mechanical side effects strictly via bound `EXTERNAL` functions (`prune_humanity(delta, persona_id)`, `petition_overseer(delta)`, `shift_chaos(delta)`, `record_suspicion(delta)`, `set_audit_outcome(outcome)`).
4. **Compile & Lint:**
   * Compile `.ink` via `node scripts/compile-ink.mjs` and run `node scripts/verify.mjs` (`lint-narrative` + `sim-playthroughs`).

## Hard Constraints
* Zero proper names for loved ones/dream personas—always use `[RELATION:*]` tags or sensory anchors.
* Never explain why the biological original volunteered or how Sol–Centauri humanity evolved over 41,802 years.
* Short, mobile-legible display beats (1–3 sentences per block) with zero overlap with external CC BY-SA fiction.
