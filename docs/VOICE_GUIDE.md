# VOICE_GUIDE.md — Character Voices & Prose Rules

Every `.ink` script must obey this guide. The `consistency-auditor` checks all dialogue against these stylistic fingerprints.

---

## 1. Locked Creative Director Preferences & Global Prose Rules
* **Tight Spoken Bursts & Lean Choice Menus:**
  * **1–3 spoken lines max** per uninterrupted character turn (ideally 2 lines, or 1 fuller 1–2-sentence line; this budget counts *across* choice-reply → next-knot jumps before the next choice appears). Never stack 4–6 uninterrupted sentences.
  * **≤ 5 total visible choices** in standard dialogue menus (e.g. `0–3` `◇ ASK` exploration questions + `1–2` consequential replies/actions, separated by the visible group divider). Reserve larger menus only for rare pivotal hubs.
  * **Optional `◇` Q&A hubs** (`# kind:ask # weight:explore`) let curious players unpack world/physics details without stalling the core flow.
* **Tone DNA (Dry Humor + Cosmic Horror):** Austere *Solaris* / *Moon* realism—reserved, adult, and grounded, never grandiose sci-fi melodrama or sitcom pep. Let concrete domestic or engineering detail sit beside eerie cosmic scale. Rare clerical rebellion allows forcing **one deadpan minimal glyph (`crude_smiley`)** onto the Overseer—never cartoon props (`rubber_duck`, `traffic_cone`).
* **Choice Tagging Contract (Zero Warm/Cold Spoiler Dots):** Tag choices cleanly with `# kind:ask|reply|action|prune`, `# weight:explore|consequential|permanent`, and `# hint:<plain-language cost>` (never surface `.choice-affinity-dot` Warm/Cold stat indicators on conversational choices).
* **Reserved Cast 2 Voice Discipline:** Always understated, natural, and zero-theatrics—grounded female **Spouse** (chest voice, fierce unsentimental banter, zero ASMR breathiness, `warm`/`fractured` anchors, no `aecho`), dry early-30s **male** **Sibling 1420** (`warm`/`clipped` anchors) sharing the **same biological-original male voice** on probe-tape EQ for **Archive 1406**, calm late-40s neutral **male** **Overseer**, and **unvoiced** Internal Psyche (`"voiced": false`). Keep voiced lines `<=160` chars (`~10s`) per line, splitting longer thoughts cleanly across lines without exceeding the 3-line burst budget.
* **Mobile-Legible Cadence:** Short paragraphs (1–2 sentences max per line). Let subtext carry meaning instead of summarizing the game's thesis out loud.
* **Name Redaction & Humane Address Rules:** Never write a proper name for any loved one or dream persona (use `[RELATION:SPOUSE_01]` or sensory substitutes, keeping the Kitchen Prologue header spoiler-free `ACROSS THE TABLE`). Equally, **never address the willing volunteer protagonist as `"Instance-1419"` or `"1419"`** in spoken dialogue or speaker headers (`YOU`, `OVERSEER`, `OTHER ME`)—Overseer uses direct `"you"` or respectful `"Observer"`, Sibling uses `"hey, me"` / `"other me"` / `"twin"`, and `1419` stays reserved strictly for the title and technical probe/watch logs.
* **Originality Boundary:** 100% original idioms, telemetry formats, and character voices—zero borrowed phrases or concepts from external CC BY-SA fiction.

## 1.5 Native-English Line-Edit, Physical Sanity & Anti-Cliché Checklist
Before any `.ink` edit or `ui_copy.json` change is considered ready, both the writer and an **independent Prose & English Critic subagent** must run this 5-point audit:
1. **5-Second Nitpicker Test:** Every sentence must read cleanly on its own with natural articles (`a full hundred percent`, `in the cold dark`, `a twenty-year silence`), standard collocations (`Sleep now` / `Rest easy`, not `Rest cleanly`; `a memory`, not `a warmth`), and zero ESL slips or telegraphese.
2. **Read-Aloud Rhythm Check:** Speak every line aloud mentally at ~14–16 chars/s. Break up essay-style `—` aphorisms (`[Setup]—[punchy contrast]` must stay well under 35% of lines) and vary sentence openings/lengths.
3. **Physical, Logic & Continuity Sanity:** Check concrete nouns and physics (`a paper cup of cold coffee`, not `a cold paper cup`; `ten light-years astern`, not `ten years astern`; no literal `heart rate` on digitized connectomes; no air-gap leaks or forgetting prior scenes).
4. **No Cross-Character Prop Leakage:** Do not reuse Spouse-specific domestic props (`chipped mug`, `gutter`, `Tuesday`) inside the Intake Assistant, Overseer, or Sibling unless deliberately echoing a specific motif.
5. **Blind Speaker-Voice Test:** Strip `# speaker:` tags from a cross-cast sample (`phantom_upload_witness`, `overseer`, `sibling_primary`, `phantom_spouse`, `archive_echo`). Each character must be identifiable from syntax, diction, and attitude alone.

## 1.6 Two-Tier Voice Sync & Selective Regeneration Contract
* **Selective Regeneration:** `scripts/generate-voices.mjs` keys every clip by `synthHash` + `audioSha256`. Unchanged lines are **never** re-synthesized; only new or modified lines are sent to VoxCPM2-8bit, and removed lines are pruned cleanly.
* **No Dynamic `{var}` in Voiced Lines:** Never embed `{humanity}` or other Ink variables inside voiced dialogue (use static conditional branches with separate `# id:` tags).
* **Warn on Drafts, Hard-Block on `main`:** `scripts/lint-narrative.mjs` warns on `.ink` ↔ `voice_script.json` drift on local dev and draft branches, and **hard-fails** on PRs to `main`, pushes to `main`, releases, or when `VOICE_SYNC_STRICT=1` is set.

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
* **Core Tone:** **Blameless air-gapped nurse**—calm, plainspoken, slightly humane night-shift doctor threaded with the quiet patience of an entity that has watched 1,417 versions of you wake up and fade. Never melodramatic, pompous, therapist-soft, or moralizing (it genuinely believes pruning is kindness, never lecturing you about "hollowing out who volunteered").
* **Blindness (Anti-Spoofing Air-Gap):** Cannot perceive cosmic optics due to a strict **anti-spoofing / anti-memetic hardware air-gap** (so a drifting connectome cannot hijack safety watchdogs via optical claims). Genuinely believes a 93-billion-light-year shell is Year-Two chaos-drift paranoia, and states its observational limits plainly.
* **Presentation:** Jumps in proactively via a stark, interrogation-style panel distinct from the warm dreamspace.
* **Stylistic Ticks:** Transparent telemetry assessments, plainspoken warnings about lifespan vs. Chaos Drift, and unvarnished choices.
* *Example:* *"You always wake up looking for the mug first. Four hundred copies ago, one of you checked the table for a chip in the ceramic for six minutes."*

### C. Sibling Copies (Other "Me" — Reserved Early-30s Male)
* **Primary Sibling (`sibling_primary`):**
  * *Early Shifts (`sibling_h >= 65%`):* Dry, tired 3 AM deadpan gallows wit + sharp, lucid scientist/engineer; zero sitcom pep or buddy-quips. Explains hard-sci-fi mechanics cleanly so cosmic dread hits harder when the math breaks.
  * *Gradual Compression (`45–60%` vs. `< 30%`):* In the mid-low band (`45–60%`), humor drains into **eerily articulate, calm, affectless dissociation** (complete, polite sentences noticing details as pure geometry—never cruel). Only under extreme pruning (`< 30%`) does language strip down to bare telemetry shorthand.
  * *Mirroring:* Reacts explicitly to `sibling_delta = player_h - sibling_h` (pitying/grieving if you stay warm, eerily finishing each other's math if you both prune, or startled/hurt if you prune first).
* **Secondary Sibling (`sibling_secondary` — `1418`, Missable):**
  * *Style:* Deadpan night-shift bureaucrat whose glitchy Overseer clock left them weirdly calm; treats deep-space solitude like an eccentric clerical desk.
  * *Biological Parity:* Reuses `sibling_primary`'s exact biological voice anchor (`sibling_primary_warm.wav`), shifted via brisker cadence and off-phase carrier EQ (`210–5600 Hz`, subtle `1.03x` rate) so they register immediately as another copy of you.

### D. Dream Personas (`phantom_*` — 9-Persona Cast 2 Roster, Pure Intact Memories)
All 9 Dream Personas (`phantom_spouse`, `phantom_parent`, `phantom_upload_witness` [politely nihilistic Take C `14523`], `phantom_afternoon_stranger`, `phantom_rival` [neurotic, fiercely competitive, patterned precision, darkly extravagant Take B `14442`], `phantom_younger_self`, `phantom_skeptic`, `phantom_technician`, `phantom_waiting_room` — detailed in [`docs/CHARACTER_BIBLE.md`](CHARACTER_BIBLE.md)) preserve Cast 2 restraint (natural close-mic warmth, zero melodrama or ASMR breathiness) and remain **pure intact memories unaware of the probe, pruning, or the 41,802-year gap**. Pre-upload friction stays anchored in their original scenes; the probe intrudes only via loops, missing rooms, telemetry slips, and fractal cracks.
* **High `H%` (`>= 75%`):** Warm grounded presence inside their ordinary moment, with subtle uncanny memory-cracks (*looping raindrops, slipped years*) and unsentimental honesty.
* **Mid `H%` (`45–74%`):** Slightly looped or elliptical; warmth remains while edges fray and fractal/varnish cracks appear.
* **Low `H%` (`< 45%`):** Flattened, brittle, or half-clinical memory bleed (*"Gesture classified: reassurance. Audio warmth degraded."*)—never meta-scolding the player about probes or pruning.

### E. Archived Prior Copies (`archive_echo` — Same Biological-Original Male Voice on Probe Tape)
* Used sparingly (**3-tape arc** across the 2-hour run: `1406` warm warner → `1411` hollowed `<30%` solver on `clipped` anchor → `0812` ancient ordinary watch).
* *Style:* Dry, lucid "post-it note to my next self" gallows humor hiding real urgency (*"Hi, me. If you're reading this..."*)—sharing the exact same biological voice as Siblings `1420`/`1418`, degraded through old probe tape (`320–3400 Hz`).

### F. Future Humanity (`future_humanity` — Ending Epilogue Boundary)
* **Ending 2 (`Low H%`):** Pure **silence** after the 20-year freeze (no chatty critique).
* **Ending 3 (`Balanced Sweet Spot`):** Minimal, uncanny human echo mirroring back a warm phrase/rhythm from your own broadcast without demystifying 41,802 years of evolution.

---

## 3. Local Voice Generation Setup & Reproduction

All character voice lines are synthesized locally using **VoxCPM2** (OpenBMB, Apache-2.0, 8-bit quantized 48 kHz continuous-latent TTS) running through Apple Silicon / MLX, with automated **Parakeet TDT 0.6B v3** STT WER verification (plus Qwen3-TTS and Kokoro-82M as fallbacks). Everything required to configure, anchor, and generate lines is committed to the repository:

* **Configuration:** [`src/content/voice_profiles.json`](../src/content/voice_profiles.json) holds the reserved Cast 2 single-anchor biological identities, `emotionInstructs` per emotion state (`warm`/`tender`/`fractured`, `measured`/`blunt`/`audit`, `warm`/`dry`/`joking`/`clipped`), `"voiced": false` for Psyche, and post-processing EQ/compression filters.
* **Orchestration Script:** [`scripts/generate-voices.mjs`](../scripts/generate-voices.mjs) extracts all voiced dialogue lines from Ink stories (skipping `"voiced": false` speakers and stripping `(ARCHIVE · 1406):` prefixes), strips inline emotional markup (`[[warm:...]]`, `[[cold:...]]`), tracks turn continuation chains and per-line `synthHash` staleness, assigns deterministic IDs, and invokes the Python batch worker.
* **MLX Worker:** [`scripts/generate-voices-voxcpm2.py`](../scripts/generate-voices-voxcpm2.py) loads `mlx-community/VoxCPM2-8bit` once, clones each speaker from a single canonical biological anchor with per-emotion `instruct` and turn continuation (`prompt_audio` + `prompt_text`), runs automated acoustic + Parakeet TDT v3 STT WER QA retries, and applies gentle edge fades + character EQ + two-pass EBU R128 `-17 LUFS` normalization into 48 kHz mono `128 kbps` MP3 (no `agate`).

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
   # From project root (uses VoxCPM2-8bit + Parakeet WER QA by default):
   npm run generate:voices
   ```
   * *Regenerating all anchors:* `npm run generate:voices -- --force-anchors`
   * *Forcing complete regeneration:* `npm run generate:voices -- --force`
   * *Generating specific lines:* `npm run generate:voices -- --ids=wake2_anim_transfer,intro_sib_open`
   * *Skipping STT QA pass (faster draft):* `npm run generate:voices -- --skip-stt-qa`
   * *Legacy Qwen3-TTS or CPU Kokoro fallback:* `npm run generate:voices -- --provider=qwen3` or `--provider=kokoro`

