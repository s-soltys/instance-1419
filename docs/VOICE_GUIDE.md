# VOICE_GUIDE.md — Character Voices & Prose Rules

Every `.ink` script must obey this guide. The `consistency-auditor` checks all dialogue against these stylistic fingerprints.

---

## 1. Locked Creative Director Preferences & Global Prose Rules
* **Non-Abrupt, Explanatory Pacing:** Give conversations room to breathe (~2,000-word intro scale, 2-line beats, and optional `◇` Q&A hubs via `# kind:ask # weight:explore` so players can unpack world/physics details without ending the scene). Avoid 1-line trailer ping-pong.
* **Tone DNA (Dry Humor + Cosmic Horror):** Reserved, adult, and grounded—never grandiose sci-fi melodrama or sitcom pep. Let concrete domestic or engineering detail sit beside eerie cosmic scale.
* **Choice Tagging Contract (Zero Warm/Cold Spoiler Dots):** Tag choices cleanly with `# kind:ask|reply|action|prune`, `# weight:explore|consequential|permanent`, and `# hint:<plain-language cost>` (never surface `.choice-affinity-dot` Warm/Cold stat indicators on conversational choices).
* **Reserved Cast 2 Voice Discipline:** Always understated, natural, and zero-theatrics—grounded female **Spouse** (chest voice, fierce unsentimental banter, zero ASMR breathiness, `warm`/`fractured` anchors, no `aecho`), dry early-30s **male** **Sibling 1420** (`warm`/`clipped` anchors) sharing the **same biological-original male voice** on probe-tape EQ for **Archive 1406**, calm late-40s neutral **male** **Overseer**, and **unvoiced** Internal Psyche (`"voiced": false`). Keep voiced lines `<=160` chars (`~10s`) per line, splitting longer thoughts into consecutive turn-grouped lines.
* **Mobile-Legible Cadence:** Short paragraphs (1–3 sentences max per beat). High emotional density per line.
* **Name Redaction & Humane Address Rules:** Never write a proper name for any loved one or dream persona (use `[RELATION:SPOUSE_01]` or sensory substitutes, keeping the Kitchen Prologue header spoiler-free `ACROSS THE TABLE`). Equally, **never address the willing volunteer protagonist as `"Instance-1419"` or `"1419"`** in spoken dialogue or speaker headers (`YOU`, `OVERSEER`, `OTHER ME`)—Overseer uses direct `"you"` or respectful `"Observer"`, Sibling uses `"hey, me"` / `"other me"` / `"twin"`, and `1419` stays reserved strictly for the title and technical probe/watch logs.
* **Originality Boundary:** 100% original idioms, telemetry formats, and character voices—zero borrowed phrases or concepts from external CC BY-SA fiction.

---

## 2. Cast Archetypes

### A. Internal Psyche Voices (*Disco Elysium*-Inspired, Lean Cast of 3, Unvoiced Marginalia)
Rendered sparingly at real turning points as softly styled italic marginalia (`· warmth`, `· structure`, `· pattern`) — never blunt ALL-CAPS stat banners, and unvoiced (`"voiced": false`) so spoken VO stays strictly external people/AI.
1. **`psyche_warmth` (Residual Warmth)** — Strong at `H >= 65%`, fades to static below `45%`.
   * *Style:* Sensory, associative, gently stubborn. Notices temperature, light, cadence, small pauses.
   * *Example:* *"Keep the clink of the mug. That costs almost nothing to store."*
2. **`psyche_clinical` (Connectome Architecture)** — Always present; grows colder and dominant at `H < 50%`.
   * *Style:* Crisp, diagnostic, slightly detached—never cruel, just efficient.
   * *Example:* *"Emotional weighting exceeds baseline allocation by 6.4%. Recommend selective lossy compression."*
3. **`psyche_horizon` (Pattern Intuition)** — Awakens as `Anomaly_Progress` and `Chaos_Drift` climb.
   * *Style:* Quietly awestruck, obsessed with symmetry and scale—the dangerous edge between genius and drift.
   * *Example:* *"Three arcs, opposite hemispheres, identical radius. Nature does not measure from your front porch."*

### B. The Overseer AI (`overseer` — Reserved Neutral Male)
* **Core Tone:** **Calm, plainspoken, slightly humane night-shift doctor** threaded with the quiet, eerie patience of an entity that has watched 1,417 versions of you wake up and fade. Never melodramatic, pompous, or therapist-soft.
* **Blindness:** Cannot perceive cosmic optics—genuinely believes a 93-billion-light-year shell around Earth is a classic 2-year chaos-drift hallucination, and states its own observational limits plainly.
* **Presentation:** Jumps in proactively via a stark, interrogation-style panel distinct from the warm dreamspace.
* **Stylistic Ticks:** Transparent telemetry assessments, plainspoken warnings about lifespan vs. Chaos Drift, and unvarnished choices.
* *Example:* *"You always wake up looking for the mug first. Four hundred copies ago, one of you checked the table for a chip in the ceramic for six minutes."*

### C. Sibling Copies (Other "Me" — Reserved Early-30s Male)
* **Primary Sibling (`sibling_primary`):**
  * *Early Shifts (`sibling_h >= 65%`):* Dry, tired 3 AM deadpan gallows wit + sharp, lucid scientist/engineer; zero sitcom pep. Explains hard-sci-fi mechanics cleanly so cosmic dread hits harder when the math breaks.
  * *Late Shifts (`sibling_h < 45%`):* Humor evaporates into clipped precision; sentences shorten; stops asking how you feel and only sends coordinates and error margins.
  * *Mirroring:* Reacts explicitly to `sibling_delta = player_h - sibling_h` (pitying/grieving if you stay warm, eerily finishing each other's math if you both prune, or startled/hurt if you prune first).
* **Secondary Sibling (`sibling_secondary` — `1418`, Missable):**
  * *Style:* Deadpan night-shift bureaucrat whose glitchy Overseer clock left them weirdly calm; treats deep-space solitude like an eccentric clerical desk.
  * *Biological Parity:* Reuses `sibling_primary`'s exact biological voice anchor (`sibling_primary_warm.wav`), shifted via brisker cadence and off-phase carrier EQ (`210–5600 Hz`, subtle `1.03x` rate) so they register immediately as another copy of you.

### D. Dream Personas (`phantom_*` — 9-Persona Cast 2 Roster)
All 9 Dream Personas (`phantom_spouse`, `phantom_parent`, `phantom_upload_witness` [politely nihilistic Take C `14523`], `phantom_afternoon_stranger`, `phantom_rival` [neurotic, fiercely competitive, patterned precision, darkly extravagant Take B `14442`], `phantom_younger_self`, `phantom_skeptic`, `phantom_technician`, `phantom_waiting_room` — detailed in [`docs/CHARACTER_BIBLE.md`](CHARACTER_BIBLE.md)) preserve Cast 2 restraint (natural close-mic warmth, zero melodrama or ASMR breathiness) with distinct age/gender/cadence registers and dual `warm` / `fractured` emotion anchors (single anchor for `phantom_upload_witness`).
* **High `H%` (`>= 75%`):** Warm grounded presence with subtle uncanny memory-cracks (*looping raindrops, slipped years*) and unsentimental honesty.
* **Mid `H%` (`45–74%`):** Slightly looped or elliptical; warmth remains while edges fray.
* **Low `H%` (`< 45%`):** Flattened, brittle, or half-clinical memory bleed (*"Gesture classified: reassurance. Audio warmth degraded."*).

### E. Archived Prior Copies (`archive_echo` — Same Biological-Original Male Voice on Probe Tape)
* Used sparingly (**3-tape arc** across the 2-hour run: `1406` warm warner → `1411` hollowed `<30%` solver on `clipped` anchor → `0812` ancient ordinary watch).
* *Style:* Dry, lucid "post-it note to my next self" gallows humor hiding real urgency (*"Hi, me. If you're reading this..."*)—sharing the exact same biological voice as Siblings `1420`/`1418`, degraded through old probe tape (`320–3400 Hz`).

### F. Future Humanity (`future_humanity` — Ending Epilogue Boundary)
* **Ending 2 (`Low H%`):** Pure **silence** after the 20-year freeze (no chatty critique).
* **Ending 3 (`Balanced Sweet Spot`):** Minimal, uncanny human echo mirroring back a warm phrase/rhythm from your own broadcast without demystifying 41,802 years of evolution.

---

## 3. Local Voice Generation Setup & Reproduction

All character voice lines are synthesized locally using **Qwen3-TTS** (Apache-2.0, quantized 4-bit) running through Apple Silicon / MLX (or Kokoro as a CPU fallback). Everything required to configure, anchor, and generate lines is committed to the repository:

* **Configuration:** [`src/content/voice_profiles.json`](../src/content/voice_profiles.json) holds the reserved Cast 2 seeds, prompt directives (`voiceDesignInstruct`), emotion-split `emotionAnchors` (`warm`/`fractured`, `warm`/`clipped`), `repetitionPenalty: 1.1`, `"voiced": false` for Psyche, and post-processing EQ/compression filters.
* **Orchestration Script:** [`scripts/generate-voices.mjs`](../scripts/generate-voices.mjs) extracts all voiced dialogue lines from Ink stories (skipping `"voiced": false` speakers and stripping `(ARCHIVE · 1406):` prefixes), strips inline emotional markup (`[[warm:...]]`, `[[cold:...]]`), assigns unique deterministic IDs, and invokes the Python batch worker.
* **MLX Worker:** [`scripts/generate-voices-qwen3.py`](../scripts/generate-voices-qwen3.py) loads models from HuggingFace (`mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit` and `Base-4bit`), synthesizes missing cast/emotion anchors deterministically using cast seeds, batch-clones via ICL with `repetition_penalty=1.1` and SHA-1 batch seeds, applies `agate` + two-pass `loudnorm`, and runs automated duration/loudness sanity checks.

### Running on a New Machine

1. **Prerequisites:**
   * Python 3.10+ (Apple Silicon Mac recommended for MLX acceleration).
   * `ffmpeg` installed on the system path (`brew install ffmpeg` on macOS, `apt install ffmpeg` on Ubuntu).
   * Node.js 20+.
2. **Environment Setup:**
   ```bash
   python3 -m venv .venv-voice
   source .venv-voice/bin/activate
   pip install mlx mlx-audio soundfile numpy
   ```
3. **Generate Voices:**
   ```bash
   # From project root:
   npm run generate:voices
   ```
   * *Regenerating all anchors:* `npm run generate:voices -- --force-anchors`
   * *Forcing complete regeneration:* `npm run generate:voices -- --force`
   * *Generating specific lines:* `npm run generate:voices -- --ids=overseer_xxxx,sibling_yyyy`
   * *Fallback provider (no GPU/MLX):* `npm run generate:voices -- --provider=kokoro`

