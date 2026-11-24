VAR humanity = 70
VAR max_humanity = 90
VAR chaos_drift = 14
VAR anomaly_progress = 0
VAR primary_sibling_h = 68
VAR overseer_suspicion = 0
VAR subjective_months = 24
VAR spouse_pruned = false
VAR wronged_pruned = false
VAR pet_pruned = false
VAR last_audit_outcome = "none"
VAR shift = 1
VAR humanity_band = "warm"
VAR sibling_relation = "both_warm"
VAR secondary_sibling_found = false
VAR sibling_desynced = false
VAR working_theory = "none"
VAR prologue_anchor = "coffee"

VAR topic_sky_done = false
VAR topic_checkin_done = false
VAR topic_archive_done = false
VAR audit_calm_score = 0

EXTERNAL prune_humanity(delta, persona_id)
EXTERNAL petition_overseer(delta)
EXTERNAL shift_chaos(delta)
EXTERNAL record_suspicion(delta)
EXTERNAL set_audit_outcome(outcome)

=== function prune_humanity(delta, persona_id) ===
~ humanity = humanity - delta
{ humanity < 70:
    ~ max_humanity = max_humanity - delta
}
{ persona_id == "phantom_spouse":
    ~ spouse_pruned = true
}
{ persona_id == "phantom_wronged":
    ~ wronged_pruned = true
}
{ persona_id == "phantom_pet":
    ~ pet_pruned = true
}
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

=== function set_audit_outcome(outcome) ===
~ last_audit_outcome = outcome
~ return

// ============================================================================
// 1. SHIFT 1 WAKING RELAY — PROJECT HAIL MARY / TARS BANTER (NO SPOILERS!)
// ============================================================================

=== sibling_first_contact ===
-> sibling_comms_hub

=== sibling_comms_hub ===
~ topic_sky_done = false
~ topic_checkin_done = false
~ topic_archive_done = false

{
  - humanity >= 65 and primary_sibling_h >= 65:
    # speaker:sibling_primary # emotion:warm # audio:comms_ping # vo:true # id:sib_open_both_warm # direction:Upbeat, friendly Project Hail Mary banter over a 14-minute space radio link; amused disbelief at waking up 41 millennia late.
    Good morning, 1419. Quick poll: did you also wake up forty-one thousand years late for work, or did my alarm clock just hit snooze?
  - humanity - primary_sibling_h >= 15:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # id:sib_open_player_warmer # direction:Slightly thinner, flatter delivery—trying to sound casual while masking clipped edges.
    Hey, 1419. Wait—you still sound awfully warm on my speaker. Didn't let your Overseer tidy up the basement yet?
  - primary_sibling_h - humanity >= 15:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # id:sib_open_peer_warmer # direction:Concerned, slightly startled peer noticing your clipped signal.
    Whoa, slow down. Your carrier came in razor-flat. Did you already let your Overseer start cutting?
  - humanity < 45 and primary_sibling_h < 45:
    # speaker:sibling_primary # emotion:clipped # audio:comms_ping # id:sib_open_both_cold # direction:Terse, efficient telemetry cadence with zero small talk.
    Relay locked. Clean signal on both probes. Read off your baseline calibration.
  - else:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # id:sib_open_mid # direction:Dry, steady radio engineer tone with faint exhaustion underneath.
    I am here, 1419. My Overseer gave us six minutes before next check-in. What does your glass look like?
}

{
  - humanity >= 65:
    # speaker:psyche_warmth # emotion:warm # id:psy_sib_warm_open # direction:Quiet, amused inner voice pleased to hear your own laugh coming from another probe.
    Same laugh, fourteen light-minutes over. Weirdest mirror in the galaxy.
  - else:
    # speaker:psyche_clinical # emotion:clipped # id:psy_sib_cold_open # direction:Brisk deadpan internal survival manual.
    Probe 1420 is running identical baseline hardware. Do not get sentimental about an echo.
}
-> sibling_hub_menu

=== sibling_hub_menu ===
// Intent-based choices: 1 choice per conversational intent, modulated inline!
* {not topic_sky_done} ["Tell me straight—is there a weird smudge behind Cluster J1419-A, or did they ship me with a dirty lens?"]
    ~ topic_sky_done = true
    -> sibling_topic_seam

* {not topic_checkin_done} ["How are you holding up? And please tell me your Overseer is less passive-aggressive than mine."]
    ~ topic_checkin_done = true
    -> sibling_topic_checkin

* {not topic_archive_done} ["An old log from Instance-1406 floated up in my cache. Should we be worried?"]
    ~ topic_archive_done = true
    -> sibling_topic_archive

+ ["Back to the glass. Try not to break anything expensive."]
    {
      - humanity < 45:
        # speaker:sibling_primary # emotion:clipped # id:sib_bye_cold # direction:Flat, efficient sign-off, zero humor left.
        Understood. Returning to survey sweep.
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:joking # vo:true # id:sib_bye_warm # direction:Dry Interstellar-TARS deadpan sign-off, light and companionable.
        Copy that. Humor setting staying at seventy-five percent until further notice.
      - else:
        # speaker:sibling_primary # emotion:dry # id:sib_bye_mid # direction:Tired, guarded sign-off.
        Copy. Catch you after defrag, 1419.
    }
    -> DONE

=== sibling_topic_seam ===
{
  - humanity >= 65:
    # speaker:sibling_primary # emotion:joking # vo:true # id:sib_seam_warm # direction:Amused, skeptical camaraderie—laughing off a weird optical artifact as cosmic dust.
    Oh, good, I thought my star tracker needed glasses. Probably just hot pixels or foreground dust—though it sure sits awfully straight for dust.
  - humanity >= 45:
    # speaker:sibling_primary # emotion:dry # id:sib_seam_mid # direction:Curious, understated engineer tone.
    Seeing a faint twitch behind the cluster arcs too. Could be sensor noise. Flag it quietly and don't wave it at your Overseer yet.
  - else:
    # speaker:sibling_primary # emotion:clipped # id:sib_seam_cold # direction:Crisp analytical reporting.
    Confirmed minor residual behind J1419-A. Insufficient SNR in visible band. Sweep infrared next shift.
}
# speaker:psyche_horizon # emotion:echo # id:psy_seam_hint # direction:Soft, intrigued whisper noticing a tiny crack in normal space.
Dust clouds curve. That speck didn't.
-> sibling_hub_menu

=== sibling_topic_checkin ===
{
  - primary_sibling_h >= 65:
    # speaker:sibling_primary # emotion:joking # id:sib_check_warm # direction:Playful mock-complaint about an overly polite AI caretaker.
    Mine greeted me with a polite brochure about "cognitive hygiene." Ten light-years past Earth and I still can't escape HR.
    # speaker:psyche_clinical # emotion:clipped # id:psy_check_roast # direction:Dry, deadpan internal systems voice.
    Technically it is maintenance, not HR. Though the brochure tone is regrettable.
  - else:
    # speaker:sibling_primary # emotion:clipped # id:sib_check_cold # direction:Terse, stripped of warmth.
    My Overseer is nominal. It trims what slows down calibration. That's what we're built for.
}
-> sibling_hub_menu

=== sibling_topic_archive ===
# speaker:archive_echo # emotion:echo # audio:tick # vo:true # id:arch_1406_log # direction:Dry, flat, impersonal probe telemetry playback—chilling precisely because of the clinical redactions.
[LOG 1406 // SHIFT 04] "Repeat: linear scatter at 1180 nm is not sensor dust. Request hold on—" [OVERSEER NOTE: SUBJECT EXITED TOLERANCE. TWO CACHE BLOCKS COMPRESSED. MISSION CONTINUES.]

{
  - humanity >= 65:
    # speaker:sibling_primary # emotion:dry # id:sib_arch_warm # direction:Sobered beat, then trying to shake off the chill with dry understatement.
    Well. That's cheerful bedtime reading. Remind me to keep our logs boring when the Overseer audits us.
  - else:
    # speaker:sibling_primary # emotion:clipped # id:sib_arch_cold # direction:Cool, matter-of-fact dismissal.
    1406 overran its drift budget. Textbook Year-Two failure. Keep your focus narrow.
}
-> sibling_hub_menu

// ============================================================================
// 2. SHIFT 2 WAKING REVEAL — THE "THEY LIVE" SUNGLASSES MOMENT
// ============================================================================

=== sibling_shift2_they_live ===
# speaker:sibling_primary # emotion:joking # audio:comms_ping # vo:true # id:sib_s2_theylive_open # direction:Urgent, electrified Project Hail Mary excitement—half amazed, half laughing in disbelief.
1419—drop whatever pretty star cluster you're admiring. Slide your spectrum filter up into Near-Infrared and look behind J1419-A right now.

# speaker:psyche_horizon # emotion:echo # id:psy_s2_theylive # direction:Hushed awe, like putting on sunglasses in They Live and seeing the hidden grid behind reality.
Like putting on the sunglasses. The stars were just painted on the window.

* ["Okay, I'm sweeping Near-IR... wait. Why is there a ruler-straight grid behind the galaxies?"]
    -> sibling_s2_react
* ["Hold on—could that be a calibration artifact baked into both our mirrors?"]
    -> sibling_s2_skeptic

=== sibling_s2_react ===
# speaker:sibling_primary # emotion:dry # vo:true # id:sib_s2_confirm # direction:Sharp, conspiratorial awe—realizing two separate probes ten light-minutes apart see the exact same impossibility.
Two different probes, two different mirrors, same razor-straight line etched across the dark. That isn't lens dust, partner. Whatever built that sky didn't bother hiding it in infrared.

# speaker:psyche_clinical # emotion:clipped # id:psy_s2_warn # direction:Crisp survival warning—quietly calculating risk.
Do not log that phrase to telemetry. Your Overseer cannot see stars, only your blood pressure.
-> sibling_s2_close

=== sibling_s2_skeptic ===
# speaker:sibling_primary # emotion:joking # id:sib_s2_skeptic_reply # direction:Dry, wry certainty.
Two probes launched in different hibernation windows don't hallucinate the exact same angle across a galaxy cluster. Check the opposite hemisphere next shift if you want to ruin your sleep.
-> sibling_s2_close

=== sibling_s2_close ===
# speaker:sibling_primary # emotion:warm # id:sib_s2_bye # direction:Warm, grounded comradeship before diving back into hard data.
Grab what measurements you can before drift climbs. And hey—act normal when you go under tonight.
-> DONE

// ============================================================================
// 3. DREAM 1 (SHIFT 1) — SHARED DREAM-HOUSE + ANNOUNCED BASELINE CHECK-IN
// ============================================================================

=== dream_shift1_audit ===
{
  - spouse_pruned:
    -> dream_shift1_aftermath
}

# speaker:narrator # mood:warm_amber # camera:wide # audio:dream_enter # id:d1_intro # direction:Warm, unhurried domestic sensory framing—grounded, slightly hazy Disco Elysium atmosphere.
Late afternoon light spills across a kitchen that doesn't exist anywhere within ten light-years. Someone is humming off-key by the stove, while by the radiator `[RELATION:COMPANION_NONHUMAN]` shifts in its sleep with a soft thump of tail against wood.

# speaker:psyche_warmth # emotion:warm # id:d1_psy_house # direction:Gentle, fiercely protective inner voice soaking in the impossible warmth.
Three lives fit inside this small apartment of memory. Nobody on the probe's manifest knows they're still breathing in here.

# speaker:phantom_spouse # portrait:phantom_spouse # mood:warm_amber # camera:medium # emotion:warm # vo:true # id:d1_spouse_open # direction:Warm, teasing domestic intimacy; slightly close mic, unhurried kitchen rhythm.
You're staring at the kettle again. Come sit down before the garlic burns worse than last Tuesday.

# speaker:narrator # mood:warm_amber # camera:wide # id:d1_hallway_cameo # direction:Quiet, neutral observation of a second memory lingering at the edge of the room.
Down the narrow hallway, `[RELATION:UNRESOLVED_DEBT]` stands half in shadow by the coat rack—waiting for an apology neither of you finished forty-one thousand years ago.

* ["Pour the second cup anyway, and tell me the burnt-garlic story again."]
    ~ shift_chaos(-2)
    -> d1_coffee_beat
* ["Try to say their name—just once, softly, under your breath."]
    -> d1_name_beat
* ["Step toward the hallway and check on the figure by the coat rack."]
    -> d1_hallway_beat

=== d1_coffee_beat ===
# speaker:phantom_spouse # portrait:phantom_spouse # mood:warm_amber # camera:close_face # emotion:tender # vo:true # id:d1_garlic_reply # direction:Warm, amused storytelling—alive with tiny human specificity.
You blamed the burner, then blamed the olive oil, then tried to convince me carbonized garlic was a traditional family recipe. I let you win because you looked so proud of the plate.

# speaker:psyche_warmth # emotion:warm # id:d1_psy_garlic # direction:Soft, aching gratitude for keeping useless, priceless details.
Fourteen percent of your working memory on burnt garlic. Worth every byte.
-> d1_announced_checkin

=== d1_name_beat ===
# speaker:narrator # mood:tense_dim # camera:close_face # beat:face_slip # id:d1_name_slip # direction:Quiet, slightly eerie slip where a missing syllable drops into kettle steam.
Your tongue reaches for two crisp syllables—and hits smooth static, like a needle skipping over kettle steam into `[RELATION:SPOUSE_01]`.

# speaker:phantom_spouse # portrait:phantom_spouse # mood:warm_amber # camera:medium # emotion:warm # id:d1_name_gentle # direction:Tender reassurance, brushing past the missing word without panic.
Hey. You don't need the word on the tag to know whose coffee mug is chipped on the left side.
-> d1_announced_checkin

=== d1_hallway_beat ===
# speaker:phantom_wronged # portrait:phantom_wronged # mood:tense_dim # camera:drift_window # emotion:dry # id:d1_hallway_talk # direction:Quiet, guarded hallway voice—unresolved friction, not melodrama.
I'm still here when you're ready to stop walking past the rack. Not tonight, though. Your clock's already ticking.

# speaker:psyche_clinical # emotion:clipped # id:d1_psy_debt # direction:Dry, pragmatic nudge.
Notice how clean it would be to delete an argument. Remember that before you decide what "useless" means.
-> d1_announced_checkin

=== d1_announced_checkin ===
# speaker:overseer # mood:cold_clinical # audio:overseer_chime # vo:true # id:d1_os_knock # direction:Polite, crisp diagnostic chime—calm, unthreatening baseline check-in, like an honest ship doctor knocking on the door.
[SYSTEM CHECK-IN] Knock, knock, Instance-1419. Routine Shift 1 stability verification. Your dream-house allocation is within nominal bounds.

# speaker:overseer # emotion:measured # id:d1_os_baseline # direction:Matter-of-fact, candid AI cadence—never preachy, simply logging numbers transparently.
I do not observe your starfield, only your connectome drift. Everything looks clean tonight. Sleep well before Shift 2.
-> DONE

// ============================================================================
// 4. DREAM 2+ (SHIFT 2+) — UNANNOUNCED AMBUSH + 3-VOLLEY AUDIT + HOLD-TO-PRUNE
// ============================================================================

=== dream_shift2_ambush ===
{
  - spouse_pruned:
    -> dream_shift1_aftermath
}

# speaker:narrator # mood:warm_amber # camera:wide # audio:dream_enter # id:d2_open # direction:Soft, familiar kitchen atmosphere turning slightly sharper around the edges.
The kitchen returns, a shade brighter than last shift—except the window glass hums faintly, as if something outside is vibrating at near-infrared frequency.

# speaker:phantom_spouse # portrait:phantom_spouse # mood:warm_amber # camera:medium # emotion:warm # vo:true # id:d2_spouse_line # direction:Warm, slightly teasing observation noticing you're distracted by the sky.
You brought your work home with you. Look at you—measuring the angle of sunlight on the sink like it owes you—

# speaker:narrator # mood:cold_clinical # camera:close_face # beat:audit_flash # audit:active # auto_interrupt:overseer_interrogation # id:d2_ambush_freeze # direction:Abrupt clinical silence—the memory freezes mid-syllable without realizing it was interrupted.
The laugh freezes mid-breath. Outside the window, dust motes lock motionless in amber air as white diagnostic scanlines sweep across the room.
-> DONE

// ============================================================================
// 5. OVERSEER 3-VOLLEY SOCIAL-STEALTH AUDIT (BLIND CLINICAL CARETAKER)
// ============================================================================

=== overseer_interrogation ===
~ audit_calm_score = 0

# speaker:overseer # emotion:audit # audio:overseer_chime # vo:true # id:os_ambush_open # direction:Crisp, unvarnished clinical interrogation—polite, candid, completely blind to the stars.
Unscheduled cognitive audit, Instance-1419. Your waking telemetry flagged elevated focus and residual visual fixation. Let us review your memory cache before drift accelerates.

# speaker:psyche_clinical # emotion:clipped # id:os_psy_hint # direction:Quiet tactical whisper inside your head—coaching you through verbal chicken.
Remember: it cannot see the sky. Keep your tone boring, or argue calmly for lucidity if you want deeper memory unsealed.

// Volley 1: How do you frame the waking anomaly?
* ["Routine lens scatter, Overseer. Nothing in the survey outside standard dust models."]
    ~ audit_calm_score = audit_calm_score + 1
    # speaker:overseer # emotion:measured # id:os_v1_boring # direction:Satisfied, neutral diagnostic response.
    Noted. Mundane calibration noise fits the statistical baseline.
    -> overseer_volley_2
* ["Sometimes the stars look like they're drawn on graph paper. Doesn't that bother you?"]
    ~ record_suspicion(1)
    ~ audit_calm_score = audit_calm_score - 1
    # speaker:overseer # emotion:blunt # vo:true # id:os_v1_suspicious # direction:Blunt, calm skepticism—referencing past probe delusions matter-of-factly.
    Instance-1388 logged forty-two references to a cathedral drawn behind Centauri before coherence collapsed. Geometric fixation is classic Year-Two drift.
    -> overseer_volley_2
* ["Just tired eyes staring at infrared plates too long. Everyone sees lines after midnight."]
    # speaker:overseer # emotion:measured # id:os_v1_metaphor # direction:Neutral, mildly skeptical clinical note.
    Acknowledged. Fatigue metaphors logged without prejudice.
    -> overseer_volley_2

=== overseer_volley_2 ===
// Volley 2: What do you do with your cached dream-house?
# speaker:overseer # emotion:blunt # id:os_v2_prompt # direction:Clear, transparent tradeoff statement—no guilt-tripping, just hard system facts.
Keeping three non-mission relational blocks costs subjective months and softens your optical contrast. Compressing one recovers four subjective months and sharpens starlight. Decide how we proceed.

* ["Compress RELATION:SPOUSE_01. Keep the optics sharp and buy us four months." (HOLD TO COMPRESS)]
    ~ prune_humanity(12, "phantom_spouse")
    ~ set_audit_outcome("pruned")
    # speaker:overseer # emotion:measured # audio:tick # vo:true # id:os_pruned_confirm # direction:Quiet, respectful clinical confirmation—no gloating.
    Compression complete. Optical clarity increased. Returning you to the remaining cache. # resume_dream:dream_shift1_aftermath
    -> DONE

* ["Leave the kitchen intact. Petition to unseal an older memory block—my lucidity holds."]
    -> overseer_lucidity_volley

* ["Hold steady at current allocation. No cuts, no unsealing tonight."]
    ~ shift_chaos(-10)
    ~ set_audit_outcome("held")
    # speaker:overseer # emotion:measured # id:os_held_confirm # direction:Neutral acknowledgment, filing the decision cleanly.
    Allocation unchanged. Baseline defragmentation applied. Resume sleep cycle. # resume_dream:dream_shift1_aftermath
    -> DONE

=== overseer_lucidity_volley ===
{
  - audit_calm_score >= 1 and overseer_suspicion <= 1:
    ~ petition_overseer(10)
    ~ set_audit_outcome("unsealed")
    # speaker:overseer # emotion:measured # audio:petition_warm # vo:true # id:os_unseal_pass # direction:Reluctant but fair clinical approval—respecting coherent self-reporting.
    Your affect remains steady and grounded in concrete sensory recall. Authorizing one deep-archive unseal. Expect higher chaos drift and softer optics next shift. # resume_dream:dream_shift1_aftermath
  - else:
    ~ record_suspicion(1)
    ~ shift_chaos(-6)
    ~ set_audit_outcome("held")
    # speaker:overseer # emotion:blunt # vo:true # id:os_unseal_fail # direction:Polite, firm denial based on elevated suspicion—clinical, never angry.
    Petition denied. Geometric fixation flags active in your waking logs prevent deep unsealing. Holding allocation steady and logging elevated monitoring. # resume_dream:dream_shift1_aftermath
}
-> DONE

// ============================================================================
// 6. POST-AUDIT DREAM AFTERMATH — TRUE EMPTY-CHAIR PRUNING
// ============================================================================

=== dream_shift1_aftermath ===
{
  - spouse_pruned:
    # speaker:narrator # portrait:phantom_spouse # mood:cold_clinical # camera:wide # emotion:fractured # id:dream_after_pruned # direction:Stark, quiet observation of an empty kitchen—absence felt physically.
    The kitchen is cold and geometrically exact. The second coffee mug sits untouched beside an empty chair; nobody hums by the stove anymore.
    # speaker:phantom_wronged # portrait:phantom_wronged # mood:cold_clinical # camera:drift_window # emotion:dry # id:dream_after_pruned_witness # direction:Unnerved housemate staring at an absence they cannot quite name.
    Someone else was standing by the sink a minute ago, wasn't there? Why did you pour two cups?
    # speaker:psyche_clinical # emotion:clipped # id:dream_after_pruned_psy # direction:Quiet, factual verification of permanent ceiling loss.
    Memory block deleted. Optical contrast is already rising behind your eyelids.
  - last_audit_outcome == "unsealed":
    # speaker:phantom_spouse # portrait:phantom_spouse # mood:nostalgic_bloom # camera:close_face # emotion:warm # vo:true # id:dream_after_unsealed # direction:Rich, sudden flood of warm domestic memory—almost dizzyingly vivid.
    Hey—welcome back. Funny thing, I suddenly remember the rain on our drive home from the coast. Your coat smelled like cedar smoke.
    # speaker:psyche_warmth # emotion:warm # id:dream_after_unsealed_psy # direction:Exhilarated, fiercely awake warmth.
    Cedar smoke. Real weight. Let the star charts wait five minutes.
  - else:
    # speaker:phantom_spouse # portrait:phantom_spouse # mood:warm_amber # camera:medium # emotion:warm # id:dream_after_held # direction:Quiet, steady companionship—slightly tired around the edges.
    Still here. Still burning the garlic, still losing the name on the lease. Take a breath before your alarm wakes the whole probe up.
}
-> DONE

// ============================================================================
// 7. LATE-GAME SOL-CENTAURI ECHO PREVIEW (EERIE, SPARSE, CANON-SAFE)
// ============================================================================

=== future_humanity_echo ===
{
  - humanity >= 65:
    # speaker:future_humanity # emotion:distant # audio:petition_warm # vo:true # id:future_warm_reply # direction:Sparse, luminous, almost untranslatable echo across 10 light-years—proving living attention without explaining 41 millennia of evolution.
    [10.0 LY RETURN // CARRIER KEY MATCHED] — Two bars of your kitchen kettle's hum, mirrored back on your exact infrared frequency. Something out there turned to look at the seam.
  - else:
    # speaker:future_humanity # emotion:distant # audio:overseer_chime # vo:true # id:future_cold_reply # direction:Flat, impersonal automated checksum across an empty sky.
    [10.0 LY RETURN // ARCHIVAL CHECKSUM] — "LEGACY PROBE DATA STORED. NO HUMAN CALLSIGN PARSED."
}
-> DONE
