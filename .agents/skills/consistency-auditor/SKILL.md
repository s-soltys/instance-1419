---
name: consistency-auditor
description: Independently audit Instance-1419 across lore canon, character voice fidelity, 2-hour pacing, H%/Chaos economy math, IP originality, and commercial asset licensing—producing deterministic checks and line-referenced fix tickets.
---

# Skill: Consistency Auditor (`consistency-auditor`)

## When to Use
Run at the end of every feature or milestone before marking anything `"passing"` in `features.json`. Always execute from an independent critic perspective (never self-approving work you just wrote).

## Required Reading Before Auditing
1. `docs/CANON.md`
2. `docs/VOICE_GUIDE.md`
3. `docs/BEAT_SHEET.md`
4. `assets/MANIFEST.json`

## Core Audit Checklist
1. **Run Mechanical Gates (`npm run verify`):**
   * Strict `tsc --noEmit` passes.
   * All `.ink` files compile cleanly with `inkjs`.
   * `sim-playthroughs.ts` (500 runs across 5 archetypes) confirms zero soft-locks, permanent `Max_H` ceiling drops on pruning, and all 3 endings reachable.
   * `lint-narrative.ts` flags zero loved-one proper names, zero unregistered `# speaker`/`# portrait` tags, zero word-budget overruns, and zero disallowed IP overlap terms.
   * `assets/MANIFEST.json` covers 100% of files under `assets/` with commercial-safe licenses (no `CC BY-SA` or `CC BY-NC`).
2. **Qualitative Lore & Canon Audit:**
   * Verify fixed numbers match canon (`Instance-1419`, `41,802 years`, `1,417 prior copies`, `2–3 light-years`, `93 billion light-years`, `~2 subjective years`, Sol–Centauri only).
   * Confirm the biological volunteer mystery remains permanently ambiguous.
   * Confirm Coordinated Overseer wake-ups/desync and subtle 1,417-copy echoes stay consistent across shifts.
3. **Qualitative Voice & Emotional Pacing Audit:**
   * Check Overseer lines: polite, clinical, tragically banal—never villainous.
   * Check Primary Sibling lines: humor genuinely thins as `sibling_h` falls, and reactions mirror `sibling_delta`.
   * Check Dream Persona pruning choices: emotionally specific, never generic stat menus.
4. **Output Format:**
   * Write a concise audit report under `docs/audits/<milestone>.md` with `PASS / BLOCKED` verdict and file/line-referenced fix tickets assigned to the responsible persona. Never silently rewrite creative work.
