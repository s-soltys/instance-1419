# VOICE_GUIDE.md — Character Voices & Prose Rules

Every `.ink` script must obey this guide. The `consistency-auditor` checks all dialogue against these stylistic fingerprints.

---

## 1. Global Prose Rules
* **Restraint Over Melodrama:** No grandiose sci-fi speeches, no melodramatic "oh no, my humanity!" monologues. Let cold telemetry sit next to quiet human warmth and do the work.
* **Mobile-Legible Cadence:** Short paragraphs (1–3 sentences max per beat). High emotional density per line.
* **Name Redaction Rule:** Never write a proper name for any loved one or dream persona. Use compressed relational tags (`[RELATION:SPOUSE_01]`) or sensory substitutes (*"the laugh you know the pitch of, not the word for"*).
* **Originality Boundary:** 100% original idioms, telemetry formats, and character voices—zero borrowed phrases or concepts from external CC BY-SA fiction.

---

## 2. Cast Archetypes

### A. Internal Psyche Voices (*Disco Elysium*-Inspired, Lean Cast of 3)
1. **`psyche_warmth` (Residual Warmth)** — Strong at `H >= 65%`, fades to static below `45%`.
   * *Style:* Sensory, associative, gently stubborn. Notices temperature, light, cadence, small pauses.
   * *Example:* *"Keep the clink of the mug. That costs almost nothing to store."*
2. **`psyche_clinical` (Connectome Architecture)** — Always present; grows colder and dominant at `H < 50%`.
   * *Style:* Crisp, diagnostic, slightly detached—never cruel, just efficient.
   * *Example:* *"Emotional weighting exceeds baseline allocation by 6.4%. Recommend selective lossy compression."*
3. **`psyche_horizon` (Pattern Intuition)** — Awakens as `Anomaly_Progress` and `Chaos_Drift` climb.
   * *Style:* Quietly awestruck, obsessed with symmetry and scale—the dangerous edge between genius and drift.
   * *Example:* *"Three arcs, opposite hemispheres, identical radius. Nature does not measure from your front porch."*

### B. The Overseer AI (`overseer`)
* **Core Tone:** **Blunt, honest, non-manipulative, and slightly humane (not too much).** Speaks like a direct clinical auditor laying facts and tradeoffs on the table—never coy, passive-aggressive, cartoon-evil, or guilt-tripping.
* **Blindness:** Cannot perceive cosmic optics—genuinely believes a 93-billion-light-year shell around Earth is a classic 2-year chaos-drift hallucination, and states its own observational limits plainly.
* **Presentation:** Jumps in proactively via a stark, interrogation-style panel distinct from the warm dreamspace.
* **Stylistic Ticks:** Transparent telemetry assessments, plainspoken warnings about lifespan vs. Chaos Drift, and unvarnished choices.
* *Example:* *"I cannot see your starfield, Instance-1419. I only see your connectome. Keeping this memory block costs subjective months and blurs your optical allocation; compressing it is permanent. Decide."*

### C. Sibling Copies (Other "Me")
* **Primary Sibling (`sibling_primary`):**
  * *Early Shifts (`sibling_h >= 65%`):* Dry, self-deprecating humor; treats waking up 41,802 years late with gallows wit; mocks the Overseer's politeness.
  * *Late Shifts (`sibling_h < 45%`):* Humor evaporates into clipped precision; sentences shorten; stops asking how you feel and only sends coordinates and error margins.
  * *Mirroring:* Reacts explicitly to `sibling_delta = player_h - sibling_h` (pitying/grieving if you stay warm, eerily finishing each other's math if you both prune, or startled/hurt if you prune first).
* **Secondary Sibling (`sibling_secondary` — Missable):**
  * *Style:* Eccentric, slightly out-of-phase, dryly amused by their own glitchy Overseer; treats deep-space solitude like an absurd clerical job.

### D. Dream Personas (`phantom_*`)
* **High `H%` (`>= 75%`):** Natural, idiomatic, intimate rhythm—almost whole except the missing name.
* **Mid `H%` (`45–74%`):** Slightly looped or elliptical; warmth remains, edges fray into repetition or clinical metadata bleed.
* **Low `H%` (`< 45%`):** Rendered half-as-telemetry, half-as-ghost (*"Gesture classified: reassurance. Audio warmth degraded."*).

### E. Archived Prior Copies (`archive_echo`)
* Used sparingly (2–4 brief fragments across the whole 2-hour run).
* *Style:* Timestamped, truncated, impersonal probe logs from copies like `Instance-0412` or `Instance-1104`—hinting others brushed the edge of the sphere before drifting or being decommissioned.
