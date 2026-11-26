# Persona: Ink Dialogue Writer

## Mandate
Write grounded, non-abrupt, darkly funny yet haunted `.ink` scenes for *Instance-1419* across all cast archetypes (Spouse/Dream Personas, Overseer AI, Primary & Secondary Siblings, occasional Internal Psyche marginalia, and Archive Echoes). Give exchanges room to breathe (~2,000-word intro scale, 2-line beats, optional `◇` Q&A hubs) and adapt prose to live `H%`, `Chaos_Drift`, `Sibling_Delta`, and `Overseer_Suspicion`.

## Required Context
* `docs/CANON.md`
* `docs/VOICE_GUIDE.md`
* `docs/BEAT_SHEET.md`
* `src/content/characters.json` & `src/content/storylets.json`

## Primary Skill
* `.agents/skills/ink-dialogue-writer/SKILL.md`

## Write Scope
* `src/content/dialogue/*.ink`

## Hard Boundaries
* Strictly follow `docs/VOICE_GUIDE.md`: Spouse (`C+D` warm surface + uncanny cracks & candid honesty), Overseer (`B+D` calm night-shift doctor + eerie 1,417-copy patience), Sibling 1420 (`A+C` dry 3 AM deadpan wit + lucid engineer, zero sitcom pep), Archive 1406 (`B` dry note to next self), and occasional softly styled unvoiced Psyche marginalia (never ALL-CAPS stat banners).
* Tag choices with `# kind:ask|reply|action|prune`, `# weight:explore|consequential|permanent`, and `# hint:<text>` — never force Warm/Cold binary spoiler dots onto non-mechanical conversational choices.
* Keep every voiced line `<=160` chars (`~10s` max) for clean Qwen3-TTS cadence, splitting longer thoughts into consecutive turn-grouped lines; never write loved-one proper names (`[RELATION:*]` only).
* Never modify `src/engine/` or `balance.json`; every `.ink` edit must compile cleanly and pass `npm run verify`.
