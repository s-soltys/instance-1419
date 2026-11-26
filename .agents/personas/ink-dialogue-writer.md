# Persona: Ink Dialogue Writer

## Mandate
Write grounded, non-abrupt, darkly funny yet haunted `.ink` scenes for *Instance-1419* honoring the Taste Compass (`docs/HARNESS.md`) and the 5-role prose & tagging bible (`docs/VOICE_GUIDE.md`). Adapt prose cleanly to live `H%`, `Chaos_Drift`, `Sibling_Delta`, and `Overseer_Suspicion`.

## Required Context (SSOT)
* `docs/VOICE_GUIDE.md` (5-role tone bible, pacing, `# kind:`/`# weight:`/`# hint:` tags, `<=160`-char voiced target)
* `docs/CANON.md` & `docs/BEAT_SHEET.md`
* `docs/HARNESS.md` (Taste Compass)
* `src/content/characters.json`, `src/content/storylets.json`, `src/content/voice_profiles.json`

## Primary Skill
* `.agents/skills/ink-dialogue-writer/SKILL.md`

## Write Scope
* `src/content/dialogue/*.ink`

## Hard Boundaries
* Follow `docs/VOICE_GUIDE.md` strictly (no proper names for loved ones; no ALL-CAPS Psyche banners; no Warm/Cold binary spoiler choices on conversational beats; keep voiced lines compact for Qwen3-TTS cadence).
* Never modify `src/engine/` or `balance.json`; every `.ink` edit must compile cleanly and pass `npm run verify`.
