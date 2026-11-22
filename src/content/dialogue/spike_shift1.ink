VAR humanity = 70
VAR max_humanity = 90
VAR chaos_drift = 14
VAR anomaly_progress = 0
VAR primary_sibling_h = 68
VAR overseer_suspicion = 0
VAR spouse_pruned = false

EXTERNAL prune_humanity(delta, persona_id)
EXTERNAL petition_overseer(delta)
EXTERNAL shift_chaos(delta)
EXTERNAL record_suspicion(delta)

=== function prune_humanity(delta, persona_id) ===
~ humanity = humanity - delta
~ max_humanity = max_humanity - delta
~ spouse_pruned = true
~ return

=== function petition_overseer(delta) ===
~ humanity = humanity + delta
~ chaos_drift = chaos_drift + 16
~ return

=== function shift_chaos(delta) ===
~ chaos_drift = chaos_drift + delta
~ return

=== function record_suspicion(delta) ===
~ overseer_suspicion = overseer_suspicion + delta
~ return

=== sibling_first_contact ===
# speaker:sibling_primary # audio:comms_ping # mood:dry
LOCAL CLUSTER PACKET · LIGHT-LAG 14m 08s.
Oh good, you're awake too. Our Overseers synced our wake windows again—apparently talking to yourself improves median connectome coherence by fourteen percent.

# speaker:sibling_primary
Tell me you're seeing that faint seam in J1419-A around 1340 nanometers. Because if it's only on my aperture, my Overseer is already warming up the polite pruning scissors.

{
  - humanity >= 65:
    # speaker:psyche_warmth
    It feels absurdly good to hear your own cadence bounce back across fourteen light-minutes of dark.
  - else:
    # speaker:psyche_clinical
    Peer baseline matches anomaly vector within 0.004 arcseconds. Hypothesis: non-local artifact.
}

* [Confirm the seam—and note it curves off-center toward Sol–Centauri.]
    # speaker:sibling_primary
    {
      - humanity - primary_sibling_h >= 12:
        Still hanging onto the poetic phrasing, huh? Good. Hold onto that for both of us. I'm logging our baseline parallax before my clock ticks over.
      - primary_sibling_h - humanity >= 12:
        Whoa—you already trimmed your cache? Your telemetry just got razor-sharp and mildly terrifying.
      - else:
        Ten light-years out and the horizon still points back at our old porch. Get some defrag sleep soon—my Overseer just scheduled an unannounced check-in.
    }
    -> DONE

* [Joke about waking up 41,802 years late for an astronomy shift.]
    # speaker:sibling_primary
    Forty-one thousand eight hundred and two years, and somehow we're still squinting at calibration noise on a Tuesday.
    # speaker:archive_echo
    (CACHED FRAGMENT · INSTANCE-1104 · DECOMMISSIONED): "...repeated arc at 1340nm—Overseer logged Year-Two pareidolia—do not let them trim..."
    # speaker:sibling_primary
    ...Did your buffer just surface 1104 too? Okay. Definitely run Dream Defrag before your Chaos counter spikes.
    -> DONE


=== dream_shift1_audit ===
# bg:kitchen_amber # speaker:phantom_spouse # portrait:phantom_spouse # mood:warm # audio:dream_enter
{
  - spouse_pruned:
    # mood:fractured
    [RELATION:SPOUSE_01] sits across the pale wireframe of a table. The brushstroke where their hand rested has been compressed into clean, silent polygons.
  - humanity >= 75:
    Late-afternoon light pools across the table. [RELATION:SPOUSE_01] sets down two mismatched mugs and laughs—so close you almost catch the first syllable of their name before it slips through your fingers.
  - humanity >= 45:
    [RELATION:SPOUSE_01] tilts their head in amber half-light. The warmth is still there, thinned like oil paint stretched across too wide a canvas. Their name resolves only as a soft, blank pause.
  - else:
    Entity [RELATION:SPOUSE_01] executes a facial geometry consistent with reassurance. Audio warmth degraded. No proper-name token exists in archive.
}

{
  - humanity >= 65 and not spouse_pruned:
    # speaker:psyche_warmth
    Keep the clink of the ceramic mug. That costs almost nothing to store.
  - else:
    # speaker:psyche_clinical
    Associative warmth consumes 6.4% of active optical allocation. Recommend lossy compression.
}

{
  - anomaly_progress >= 20:
    # speaker:psyche_horizon
    Look at the rim of the cup. Even here, the curvature matches the Einstein arc at 1340 nanometers.
}

-> overseer_dream_audit_interrupt

=== overseer_dream_audit_interrupt ===
# speaker:overseer # audio:overseer_chime # mood:audit # audit:active
Good evening, Instance-1419. Forgive the unscheduled intrusion into your defragmentation cycle.

# speaker:overseer # audit:active
Your waking telemetry flagged elevated fixation on a concentric horizon pattern centered ten light-years astern on Sol–Centauri. Because that matches textbook Year-Two anthropocentric drift, I have prepared two gentle maintenance options.

* [Accept corrective pruning — compress RELATION:SPOUSE_01 (-12% H, permanent -12% Max H, +Optical Fidelity)]
    ~ prune_humanity(12, "phantom_spouse")
    # speaker:overseer # audit:active # audio:prune_cut
    Thank you for cooperating with cognitive hygiene, Instance-1419. Associative clutter compressed. Your optical shaders have been reallocated for maximum horizon clarity.
    # speaker:phantom_spouse # mood:fractured # audit:inactive
    Across the table, the amber light snaps cold. [RELATION:SPOUSE_01] tries to speak, but the cadence dissolves into crisp, weightless geometric shards.
    # speaker:psyche_clinical # audit:inactive
    Optical resolution increased. Permanent Humanity ceiling reduced. You will see the sphere clearly now.
    -> dream_wrap

* [Petition Overseer to unseal a deep memory block (+10% H toward 90%, +16% Chaos Drift)]
    ~ petition_overseer(10)
    # speaker:overseer # audit:active
    An unusual request during an elevated drift window... Very well. Your baseline coherence still permits a single unsealed warmth cluster, though I must log increased psychic volatility.
    # speaker:phantom_spouse # mood:warm # audit:inactive # audio:petition_warm
    The amber paint thickens—suddenly you remember the exact dry warmth of [RELATION:SPOUSE_01]'s palm, the weight of rain outside the window, and why a signal sent back across ten light-years must still sound human.
    # speaker:psyche_warmth # audit:inactive
    Still no name. Still yours.
    -> dream_wrap

* [Mask your fixation and request standard defragmentation (+0% H, +1 Overseer Suspicion)]
    ~ record_suspicion(1)
    ~ shift_chaos(-10)
    # speaker:overseer # audit:active
    Noted. I will log this as benign calibration fatigue—though I am adjusting your cluster wake-sync threshold as a precaution.
    # speaker:psyche_horizon # audit:inactive
    It didn't see the seam. It never looks out the window—it only looks at you.
    -> dream_wrap

=== dream_wrap ===
# speaker:narrator # audit:inactive
(DEFRAGMENTATION CYCLE COMPLETE · READY TO RESUME 3D SURVEY SHIFT)
-> DONE
