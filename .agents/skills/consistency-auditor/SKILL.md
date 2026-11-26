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
4. `docs/ART_DIRECTION.md`
5. `assets/MANIFEST.json`

## Core Audit Checklist
1. **Run Mechanical Gates (`node scripts/verify.mjs`):**
   * Strict `tsc --noEmit` passes.
   * All `.ink` files compile cleanly with `inkjs`.
   * `sim-playthroughs.mjs` (500 runs across 5 archetypes) confirms zero soft-locks, permanent `Max_H` ceiling drops on pruning, and all 3 endings reachable.
   * `lint-narrative.mjs` flags zero loved-one proper names, zero unregistered `# speaker`/`# portrait` tags, zero missing voice MP3s, and zero disallowed IP overlap terms.
   * `assets/MANIFEST.json` covers 100% of files under `assets/`, `public/voices/`, and `public/music/` with commercial-safe licenses.
2. **Qualitative Lore & Canon Audit:**
   * Verify fixed numbers match canon (`Instance-1419`, `41,802 years`, `1,417 prior copies`, `~10 light-years`, `93 billion light-years`, `~2 subjective years`, `20-year final freeze`, Sol–Centauri only).
   * Confirm the biological volunteer mystery AND how humanity evolved over 41,802 years remain permanently vague.
   * Confirm Kitchen Prologue stays spoiler-free (`ACROSS THE TABLE`, never leaking `[RELATION:SPOUSE_01]` before wake-up).
3. **Qualitative Voice, Pacing & Choice UX Audit:**
   * Verify non-abrupt pacing (2-line beats, optional `◇` Q&A hubs) and locked 5-role voices: uncanny-cracked + candid Spouse, calm night-shift-doctor + eerily patient Overseer, dry 3 AM deadpan + lucid engineer Sibling 1420, dry-note Archive 1406, and occasional unvoiced soft italic Psyche marginalia (no ALL-CAPS banners).
   * Verify reserved Cast 2 voice audio (`<=160` chars per voiced line, shared biological male voice across 1420 & 1406, zero ASMR/slapback/theatrics, audio-synced Overseer interrupts).
   * Verify Layout A bottom-anchored dialogue (no chasm) and color-coded consequence choice plates (neutral-slate `◇`/explore vs. warm-amber consequential vs. crimson Hold-to-Commit prune; zero Warm/Cold spoiler dots).
4. **Output Format:**
   * Write a concise audit report under `docs/audits/<milestone>.md` with `PASS / BLOCKED` verdict and file/line-referenced fix tickets assigned to the responsible persona. Never silently rewrite creative work.
