# IDEAS_LEDGER.md — Future Variety & Tone-Breaking Humor Ideas

A lightweight ledger of future feature ideas designed to **maximize narrative texture, deadpan humor, and replay variety with minimal engineering complexity**. Ideas here are **backlog candidates** (not yet scheduled in `features.json` or `ROADMAP.md`) until promoted.

> **Canon & Scope Guardrails:** All ideas must respect `docs/CANON.md` (no loved-one proper names, blind non-evil Overseer, 2-hour scope, pure-HTML first) and `docs/VOICE_GUIDE.md`. Humor should come from **deadpan contrast, bureaucratic literalism, and dry self-awareness**—never slapstick or lore-breaking memes.

---

## Ledger Index

| ID | Title | Category | Complexity | Status |
| :--- | :--- | :--- | :--- | :--- |
| `IDEA-01` | Overseer Tiny Icon Avatar, Conversation Morphing & Persistent Forced Icon (e.g. Rubber Duck) | UI / Humor / Narrative | Low | Approved (Ledger) |
| `IDEA-06` | Overseer End-of-Audit Clinical Verdict Stamps | Narrative / State | Very Low | Approved (Ledger) |
| `IDEA-08` | Bureaucratic "Voluntary Paranoia" Liability Waivers | Humor / UI / Ink | Very Low | Approved (Ledger) |
| `IDEA-09` | Deadpan Connectome "Optimization & Garbage Collection" Logs | Humor / Narrative | Very Low | Approved (Ledger) |
| `IDEA-12` | Dry Telescope / Slow Sky-Panning & Vacuum Remarks (Rare: 1–3×/run) | Humor / 3D UI | Very Low | Approved (Ledger) |
| `IDEA-10` | Literal-Minded Overseer Misinterpreting Human Metaphors | Humor / Dialogue | Very Low | Candidate |
| `IDEA-11` | Petty Sibling Banter Against Cosmic Dread | Humor / Dialogue | Very Low | Candidate |
| `IDEA-02` | Sibling Comms Header Mood & Latency Flavor | UI / Narrative | Very Low | Optional |
| `IDEA-03` | Seeded Boot-Log Micro-Anomalies Between Shifts | Narrative / Replay | Very Low | Optional |
| `IDEA-04` | Inline Psyche Marginalia / Crosstalk Tags | Dialogue / UI | Low | Optional |
| `IDEA-05` | Sensory Micro-Souvenirs in 2D Dream Space | 2D / Narrative | Low | Optional |
| `IDEA-07` | Shift- & `H%`-Reactive Reticle / Typography Micro-Themes | Visual / CSS | Very Low | Optional |

---

## Core & Tone-Breaking Ideas

### `IDEA-01` — Overseer Tiny Icon Avatar, Morphing & Persistent Forced Icon
* **Origin:** Creative Director (User)
* **Core Concept:**
  * The Overseer AI displays a **tiny icon avatar** (`20px–28px` inline SVG) next to its speaker header / audit panel.
  * **Default & Morphing:** Starts as a stark, eye-less clinical reticle. Common conversation branches can naturally morph it (warmth-accommodating ring vs. fractured wireframe).
  * **The Fight / Forced Tone-Break (Persistent):** When you overpower or out-argue the Overseer during a confrontation (e.g., invoking "interface stress mitigation"), you can **force it to set an absurdly different, visually obvious avatar**—such as a **rubber duck**, a **crude smiley**, or a **traffic cone**.
  * **Persistence:** Once forced, **it keeps that icon for the rest of the run**. The Overseer never breaks character—it continues delivering deadpan, existential telemetry (*"Coherence at 38%. Recommend immediate pruning."*) under a tiny yellow rubber duck.
* **Implementation Sketch (Later):**
  * `overseerAvatar: string` persisted in `StateStore` + Ink tag/external function (`# overseer_avatar: rubber_duck`).
  * 5–6 crisp inline SVGs with a subtle glitch/swap animation.

---

### `IDEA-06` — Overseer End-of-Audit Clinical Verdict Stamps
* **Origin:** Proposed / Liked by User
* **Core Concept:**
  * At the close of each 2D Dream Audit, the Overseer stamps the shift with a dry 1–2 word classification (`NOMINAL`, `PAREIDOLIA_WATCH`, `ACCOMMODATION_LOGGED`, `COHERENCE_TRIMMED`, `DUCK_PROTOCOL_ACTIVE`) that reflects your tone and can be echoed in later shifts.
* **Complexity:** Very Low (1 state array + string templates + stamp CSS).

---

### `IDEA-08` — Bureaucratic "Voluntary Paranoia" Liability Waivers
* **Core Concept:**
  * When you refuse a recommended prune or push `Chaos_Drift` high, the Overseer doesn't get angry—it makes you acknowledge an absurdly polite 3-line **deep-space liability waiver** (`FORM 1419-B: VOLUNTARY EXISTENTIAL DRIFT ACKNOWLEDGMENT`) with a dry button like `[ACKNOWLEDGE RISK AND CONTINUE STARING AT NOTHING]`.
* **Complexity:** Very Low (Ink/UI modal variant using existing dialogue styling).

---

### `IDEA-09` — Deadpan Connectome "Optimization & Garbage Collection" Logs
* **Core Concept:**
  * When pruning or booting between shifts, the probe occasionally prints a dry optimization line treating mundane human habits like disk space (e.g., `"Freed 14.2 MB: compressed 'irrational loyalty to lukewarm coffee'"` or `"Deprecated: remembering why you walked into a room"`).
* **Complexity:** Very Low (JSON string pool in `ui_copy.json` / `BootView`).

---

### `IDEA-10` — Literal-Minded Overseer Misinterpreting Human Metaphors
* **Core Concept:**
  * Because the Overseer is genuinely blind and literal, occasional dialogue choices let you feed it idioms (*"I feel like a moth in a jar"*, *"I'm losing my marbles"*), and it earnestly logs hardware/environmental checks (*"Clarification: Zero lepidoptera aboard Vessel 1419. Adjusting cabin humidity anyway."*).
* **Complexity:** Very Low (pure Ink dialogue branches).

---

### `IDEA-11` — Petty Sibling Banter Against Cosmic Dread
* **Core Concept:**
  * Moments where you and your Sibling copy—two digitized copies of the same person, 10 light-years from Earth, staring at an impossible 93B-ly enclosure—briefly argue about something painfully mundane (who got the biological original's bad posture, or complaining that the probe's circadian lighting feels like a "dentist's waiting room").
* **Complexity:** Very Low (pure Ink dialogue beats).

---

### `IDEA-12` — Dry Telescope / Slow Sky-Panning & Vacuum Remarks (Rare)
* **Core Concept:**
  * Two rare, deadpan 3D optics HUD remarks that break the clinical tension without overstaying their welcome (**strictly capped at 1–3 occurrences per playthrough**):
    1. *Slow Sky-Panning:* When slowly rotating/panning across different sectors of the sky, occasionally drop a brief, dry observation (`"OPTICS: Another 40 billion stars. None of them are returning your calls."` or `"SECTOR 04-W: Empty dark, slightly to the left of the previous empty dark."`).
    2. *Vacuum Over-Zoom:* If you zoom all the way into empty, featureless vacuum for too long, slip in a deadpan status note (`"OPTICS: Empty vacuum. Nothing is there. Still nothing."`).
* **Complexity:** Very Low (cooldown + `maxPerRun: 3` counter in `OpticsScene` / HUD status line).

---

## Optional Cross-Run Variety Candidates
*(Kept for reference if desired later)*
* `IDEA-02` — Sibling Comms Header Mood & Latency Flavor
* `IDEA-03` — Seeded Boot-Log Micro-Anomalies Between Shifts
* `IDEA-04` — Inline Psyche Marginalia / Crosstalk Tags
* `IDEA-05` — Sensory Micro-Souvenirs in 2D Dream Space
* `IDEA-07` — Shift- & `H%`-Reactive Reticle / Typography Micro-Themes
