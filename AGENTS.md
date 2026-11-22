# AGENTS.md — Operating Map for *Instance-1419*

Read this first every session. Keep this file short (<80 lines); deeper knowledge lives in `docs/`.

## 1. Mission & Stack
* **Game:** *Instance-1419* — a **2-hour**, single-arc narrative & astronomy indie game (pure HTML through Phase 5; Steam Electron + Mobile Capacitor packaging in Phase 6).
* **Stack:** `Vite` + strict `TypeScript` + `Three.js` (GLSL) + `inkjs` (Hybrid Storylet JSON + `.ink`) + CSS UI + Web Audio.
* **Workflow:** Humans steer taste, pacing, and editorial sign-off; agents execute code, shaders, scripts, asset pipelines, and verification.

## 2. System of Record (Load On Demand)
* [`docs/CANON.md`](docs/CANON.md) — Locked lore, plot decisions, and explicit **Do Not Violate** boundaries.
* [`docs/ORIGINAL_CONCEPT.md`](docs/ORIGINAL_CONCEPT.md) — Unmodified original concept document.
* [`docs/BEAT_SHEET.md`](docs/BEAT_SHEET.md) — 2-hour pacing spine (Prologue + 6 Shifts + 3 Endings + Dream Persona pool).
* [`docs/VOICE_GUIDE.md`](docs/VOICE_GUIDE.md) — Voice rules for Psyche, Siblings, Overseer AI, Dream Personas, and archive echoes.
* [`docs/ART_DIRECTION.md`](docs/ART_DIRECTION.md) — 3D optics lookdev, 2D impasto-to-shard `H%` decay, swappable portraits.
* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Engine vs. Content vs. `PlatformAdapter` boundaries & `?dev=1` spec.
* [`docs/ROADMAP.md`](docs/ROADMAP.md) & [`docs/HARNESS.md`](docs/HARNESS.md) — Stage-gated milestones, personas, and skills.

## 3. Agent Personas & Modular Skills
* **Personas (`.agents/personas/`):** `showrunner`, `narrative-director`, `ink-dialogue-writer`, `visual-shader-director`, `game-systems-engineer`, `consistency-auditor`.
* **Skills (`.agents/skills/<name>/SKILL.md`):** `plot-architect`, `ink-dialogue-writer`, `visual-shader-studio`, `astro-asset-curator`, `audio-atmosphere-designer`, `engine-builder`, `consistency-auditor`, `playtest-verifier`.
* **Creator vs. Critic Rule:** The agent that writes code, prose, or shaders never self-approves a milestone—always run `consistency-auditor` and `playtest-verifier` before marking any feature `"passing"`.

## 4. Non-Negotiable Boundaries
1. **No Loved-One Names:** Personal names are permanently redacted (`[RELATION:*]`). Never invent proper names for family/dream personas.
2. **Volunteer Mystery Stays Ambiguous:** Never explain *why* the biological original volunteered or was selected.
3. **Permanent Pruning Ceiling:** Pruning below 70% `H%` permanently lowers `Max_H` for the entire run.
4. **IP & Commercial License Hygiene:** 100% original prose/characters/lore (zero overlap with *Lena* or CC BY-SA sources). Every file under `assets/` MUST be logged with commercial-safe license metadata in `assets/MANIFEST.json`.
5. **Engine vs. Content Isolation:** Never hardcode prose or balance constants inside `src/engine/`. Keep saves/platform calls behind `src/platform/PlatformAdapter.ts`.
6. **Pure HTML First:** Do not add Electron or Capacitor dependencies until Phase 6.

## 5. Session Protocol (Every Run)
1. Read `PROGRESS.md`, `features.json`, and recent `git log -n 5`.
2. Pick **one** pending item in `features.json` (do not boil the ocean).
3. Load only the relevant `docs/*.md` and `.agents/skills/*/SKILL.md` for that task.
4. Implement cleanly and verify via `npm run verify` (once Phase 0 scaffold exists) + Playwright visual check for UI/shader work.
5. Update `features.json` status and append a concise entry to `PROGRESS.md`, then commit cleanly.

## 6. CLI Commands (Activated in Phase 0/1)
* `npm run dev` — Local Vite dev server (`?dev=1` enables Director Overlay).
* `npm run build` — Static pure-HTML production bundle (`dist/`).
* `npm run verify` — Master gate (`tsc` + Ink compile + `sim-playthroughs` + `lint-narrative` + `MANIFEST` check).
* `npm run test:visual` — Playwright screenshots across 16:9 desktop & 20:9 mobile landscape.
