# VOICE_GUIDE.md — Character Voices, Prose Architecture & VO Direction

Every `.ink` script must obey this guide. The `consistency-auditor` and `scripts/lint-narrative.mjs` verify all dialogue against these stylistic fingerprints.

---

## 1. Global Prose & Branching Rules
* **Dual-World Tonal Contrast:**
  * **Waking 3D (*Project Hail Mary* + *Interstellar* TARS + *They Live*):** Approachable, dryly funny, grounded sci-fi banter. Explain any astronomical oddity in plain human analogies—never turn scenes into astrophysics textbooks.
  * **Dream 2D (*Disco Elysium* Light Delirium):** Intimate, slightly skewed sensory logic, domestic detail colliding with cosmic drift—relatable and emotionally immediate without opaque surrealism.
* **Restraint Over Melodrama:** Never have characters lecture the game's thesis out loud (*"we must stay human!"*). Let concrete details (burnt garlic, a cooling mug, an empty chair) sit beside cold probe telemetry.
* **Intent-Based Hub-and-Spoke (Anti-Explosion Rule):** Do **not** triplicate choices across `H%` bands. Author **1 choice per conversational intent** (*deflect with humor / press the anomaly / confide / stay clinical*), and let `H%` modulate delivery and NPC reaction inline (~1.8× authored-to-read multiplier).
* **Name Redaction Rule (`CANON.md`):** Never write a proper name for any loved one or dream persona. Stage the missing name organically inside thought or speech (`[RELATION:SPOUSE_01]`, a skipped consonant, kettle steam) rather than repeating *"I forgot your name."*
* **Empty-Chair Pruning:** Once a persona is pruned, they **vanish** from the dream-house—replaced by an empty chair, wireframe trace, or another housemate pausing at an unexplainable gap.
* **Originality Boundary:** 100% original idioms, telemetry formats, and character voices—zero borrowed phrases or concepts from external CC BY-SA fiction.

---

## 2. Voice Acting & Performance Direction (`# vo:true` + `# direction:`)
Every spoken line in `.ink` should carry an inline `# direction:<acting & audio note>` tag written in plain English so **both** local prototype TTS and advanced online LLM/voice-acting pipelines know exact tone, pacing, and acoustic texture:
* **Example:** `# speaker:sibling_primary # emotion:dry # vo:true # direction:Dry, upbeat Project Hail Mary banter over faint 14-minute radio delay; smile audible before the punchline.`
* **No Mid-Sentence Variables in Voiced Lines:** Keep spoken sentences clean and complete (ban `{var}` placeholders on `# vo:true` lines so generated audio always reads naturally).
* **Dual-Mode Synthesis (`scripts/generate-voices.mjs`):**
  * `--scope=key` (default fast local mode): synthesizes `# vo:true` key beats cleanly.
  * `--scope=all` (full render mode): synthesizes all spoken lines and exports the complete casting & direction script (`voice_script.json` / `voice_script.txt`) ready for advanced online TTS/LLMs.

---

## 3. Cast Archetypes

### A. Internal Psyche Voices (*Disco Elysium*-Inspired, Passive `O(1)` Interjections)
Injected as crisp 1-line conditional reactions between beats—never bloating into separate choice trees:
1. **`psyche_warmth` (Residual Warmth)** — Strong at `H >= 65%`, thins into static below `45%`. Sensory, stubborn, notices temperature, mugs, pauses.
2. **`psyche_clinical` (Connectome Architecture)** — Always present; brisk, deadpan survival engineer (*not* the Overseer). Roasts sentimental RAM budgets without cruelty.
3. **`psyche_horizon` (Pattern Intuition)** — Awakens as `anomalyProgress` and `chaosDrift` climb; quietly obsessed with impossible symmetry.

### B. The Blind Overseer AI (`overseer`)
* **Core Tone:** **Blunt, honest, genuinely blind, clinical caretaker** (think polite diagnostic instrument, never a soulful therapist preaching warmth).
* **3-Volley Social-Stealth Audits:** Starting Shift 2, Audits play as tense verbal "chicken"—play boring to keep `overseerSuspicion` low, smuggle truth as metaphor, or prove calm lucidity to earn memory unsealing (`70% → 90%`).

### C. Sibling Copies (Other "Me")
* **Primary Sibling (`sibling_primary` — `1420`):** *Hail Mary* / TARS-style mirror banter early on (finishing each other's jokes, mocking Overseer politeness, flagging the Shift 2 *They Live* IR anomaly). Gradually thins and sharpens if pruned, reacting dynamically to `siblingRelation` (`both_warm`, `both_cold`, `player_warmer`, `peer_warmer`).
* **Secondary Sibling (`sibling_secondary` — Missable in Shift 3):** Absurdist pirate-radio copy who treats 41,802 years of deep-space solitude and their glitchy Overseer like an eccentric clerical job.

### D. Dream Personas (`phantom_*`) — 3-Housemate Dynamic
* **High `H%` (`>= 65%`):** Natural, warm, funny, grounded in shared micro-habits.
* **Mid `H%` (`45–64%`):** Slightly looped or elliptical; warm edges begin fraying.
* **Low `H%` (`< 45%`):** Fractured half-as-telemetry, half-as-ghost (*"Gesture classified: hand on wrist. Warmth index unrecoverable."*).

### E. Archived Prior Copies (`archive_echo`) & Future Echo (`future_humanity`)
* **`archive_echo`:** Sparse, dry, timestamped probe logs with clinical Overseer redactions (e.g., `Instance-1406`).
* **`future_humanity`:** Eerie, sparse, almost untranslatable 10-ly cadence echo in the finale—never chatty 21st-century mission control.
