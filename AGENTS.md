# AGENTS.md — Operating Map for *Instance-1419*

Read this first every session. Keep this file `<80` lines; deeper specs live in `docs/`.

## 1. Mission & Stack
* **Game:** *Instance-1419* — a **2-hour**, single-arc narrative & astronomy indie game (pure HTML through Phase 5; Steam Electron + Mobile Capacitor packaging in Phase 6).
* **Stack:** `Vite` + strict `TypeScript` + `Three.js` (GLSL) + `inkjs` (Hybrid Storylet JSON + `.ink`) + CSS UI + Web Audio.
* **Workflow:** Creative Director steers taste, pacing, and editorial sign-off; agents execute code, shaders, scripts, asset pipelines, and verification.

## 2. System of Record (Single Source of Truth — Load On Demand)
* [`docs/CANON.md`](docs/CANON.md) — Locked lore, physics, persona-pool & scan rules, and **Do Not Violate** boundaries.
* [`docs/BEAT_SHEET.md`](docs/BEAT_SHEET.md) — 2-hour pacing spine (Prologue + 6 Shifts + 3 Endings + Dream Persona pool).
* [`docs/VOICE_GUIDE.md`](docs/VOICE_GUIDE.md) — 5-role prose bible, choice-tag contract, and Cast 2 Qwen3-TTS pipeline.
* [`docs/ART_DIRECTION.md`](docs/ART_DIRECTION.md) — 3D/2D lookdev, Zeiss-glass optics, Layout A dialogue & choice-plate UI rules.
* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Engine vs. Content isolation, 3-Axis contract, `VoiceEngine`, & `?dev=1` spec.
* [`docs/HARNESS.md`](docs/HARNESS.md) — Taste Compass, 1-by-1 calibration protocol, SSOT map, personas, & skills.
* [`docs/ROADMAP.md`](docs/ROADMAP.md) & [`docs/ORIGINAL_CONCEPT.md`](docs/ORIGINAL_CONCEPT.md) — Stage gates & unmodified original concept.

## 3. Agent Personas & Modular Skills
* **Personas (`.agents/personas/`):** `showrunner`, `narrative-director`, `ink-dialogue-writer`, `visual-shader-director`, `game-systems-engineer`, `consistency-auditor`.
* **Skills (`.agents/skills/<name>/SKILL.md`):** `plot-architect`, `ink-dialogue-writer`, `visual-shader-studio`, `astro-asset-curator`, `audio-atmosphere-designer`, `engine-builder`, `consistency-auditor`, `playtest-verifier`.
* **Creator vs. Critic Rule:** The agent that writes code, prose, or shaders never self-approves a milestone—always run `consistency-auditor` and `playtest-verifier` before marking any feature `"passing"`.

## 4. Non-Negotiable Boundaries
1. **No Loved-One Names:** Personal names are permanently redacted (`[RELATION:*]`). Never invent proper names for family/dream personas.
2. **Stay Ambiguous Where Locked:** Never explain *why* the biological original volunteered/was selected, or *how* Sol–Centauri humanity evolved over 41,802 years.
3. **Permanent Pruning Ceiling:** Pruning below 70% `H%` permanently lowers `Max_H` for the entire run.
4. **IP & Commercial License Hygiene:** 100% original prose/characters/lore (zero overlap with *Lena* or CC BY-SA sources). Every file under `assets/` MUST be logged with commercial-safe license metadata in `assets/MANIFEST.json`.
5. **Engine vs. Content Isolation:** Never hardcode prose or balance constants inside `src/engine/`. Keep saves/platform calls behind `src/platform/PlatformAdapter.ts`.
6. **Pure HTML First:** Do not add Electron or Capacitor dependencies until Phase 6.
7. **Taste Compass & Presentation (SSOT):** Honor `docs/HARNESS.md` (Taste Compass + 1-by-1 calibration), `docs/VOICE_GUIDE.md` (5-role tone, `◇` Q&A hubs, reserved Cast 2 voices), and `docs/ART_DIRECTION.md` (Zeiss-glass optics, Layout A, color-coded choice plates with zero Warm/Cold spoiler dots).

## 5. Session Protocol (Every Run)
1. Read `PROGRESS.md`, `features.json`, and recent `git log -n 5`.
2. Pick **one** pending item in `features.json` (do not boil the ocean).
3. Load only the relevant SSOT `docs/*.md` and `.agents/skills/*/SKILL.md` for that task.
4. Implement cleanly and verify during dev with `npm run verify:fast` (Gates 1–8) + targeted Playwright (`npm run test:visual:smoke` or `--flows=...`) only for UI/shader changes; full 21-instrument + mobile matrix runs in CI (`.github/workflows/ci.yml`).
5. Update `features.json` and append a concise entry to `PROGRESS.md` **in the same atomic milestone commit**.

## 6. CLI Commands
* `npm run dev` — Local Vite dev server (`?dev=1` enables Director Overlay).
* `npm run build` — Static pure-HTML production bundle (`dist/`).
* `npm run verify:fast` — Fast LLM dev gates 1–8 (~5s: `compile-ink`, `tsc`, `vitest`, `sim`, `lint`, `hygiene`, `MANIFEST`, `vite build`).
* `npm run verify:smoke` — Fast gates + compact Playwright smoke check (`prologue`, `sky`, `constellation_recall`, `dream`).
* `npm run verify` — Full 9-gate CI verification including full `test:visual` (21 instruments + 7 mobile viewports).
* `npm run test:visual:smoke` — Targeted Chromium Playwright check (also supports `--flows=<csv>` / `--mg=<csv>`).
