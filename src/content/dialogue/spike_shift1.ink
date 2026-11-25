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
// 1. SHIFT 1 WAKING RELAY — SNAPPY PROJECT HAIL MARY / TARS BANTER
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
    Good morning, 1419. Quick poll: did you also wake up forty-one thousand years late for work, or did my alarm just hit snooze?
  - humanity - primary_sibling_h >= 15:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # id:sib_open_player_warmer # direction:Slightly thinner, flatter delivery—trying to sound casual while masking clipped edges.
    Wait—you still sound awfully warm on my speaker, 1419. Didn't let your Overseer tidy up the basement yet?
  - primary_sibling_h - humanity >= 15:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # id:sib_open_peer_warmer # direction:Concerned, slightly startled peer noticing your clipped signal.
    Whoa, slow down. Your carrier came in razor-flat. Did you already let your Overseer start cutting?
  - humanity < 45 and primary_sibling_h < 45:
    # speaker:sibling_primary # emotion:clipped # audio:comms_ping # id:sib_open_both_cold # direction:Terse, efficient telemetry cadence with zero small talk.
    Relay locked. Clean signal on both probes. Read off your baseline calibration.
  - else:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # id:sib_open_mid # direction:Dry, steady radio engineer tone with faint exhaustion underneath.
    I am here, 1419. Six minutes before next Overseer check-in. What does your glass look like?
}
-> sibling_hub_menu

=== sibling_hub_menu ===
* {not topic_sky_done} ["Saw your readings—is there a smudge behind J1419-A, or did they ship me a dirty lens?"]
    ~ topic_sky_done = true
    -> sibling_topic_seam

* {not topic_checkin_done} ["How are you holding up? Please tell me your Overseer is less HR-brochure than mine."]
    ~ topic_checkin_done = true
    -> sibling_topic_checkin

* {not topic_archive_done} ["An old log from Instance-1406 popped up in my cache. Should we care?"]
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
    Oh good, I thought my tracker needed glasses. Probably hot pixels—though it sits awfully straight for dust.
  - humanity >= 45:
    # speaker:sibling_primary # emotion:dry # id:sib_seam_mid # direction:Curious, understated engineer tone.
    Seeing that faint twitch behind the cluster too. Flag it quietly before your Overseer gets dramatic.
  - else:
    # speaker:sibling_primary # emotion:clipped # id:sib_seam_cold # direction:Crisp analytical reporting.
    Confirmed minor residual behind J1419-A. Sweep infrared next shift.
}
# speaker:psyche_horizon # emotion:echo # id:psy_seam_hint # direction:Soft, intrigued whisper noticing a tiny crack in normal space.
Dust clouds curve. That speck didn't.
-> sibling_hub_menu

=== sibling_topic_checkin ===
{
  - primary_sibling_h >= 65:
    # speaker:sibling_primary # emotion:joking # id:sib_check_warm # direction:Playful mock-complaint about an overly polite AI caretaker.
    Mine greeted me with a brochure on cognitive hygiene. Ten light-years past Earth and I still can't escape HR.
    # speaker:psyche_clinical # emotion:clipped # id:psy_check_roast # direction:Dry, deadpan internal systems voice.
    Technically it is maintenance, not HR. Though the brochure tone is regrettable.
  - else:
    # speaker:sibling_primary # emotion:clipped # id:sib_check_cold # direction:Terse, stripped of warmth.
    My Overseer is nominal. It trims what slows down calibration.
}
-> sibling_hub_menu

=== sibling_topic_archive ===
# speaker:archive_echo # emotion:echo # audio:tick # vo:true # id:arch_1406_log # direction:Dry, flat, impersonal probe telemetry playback—chilling precisely because of the clinical redactions.
[LOG 1406 // SHIFT 04] "Linear scatter at 1180 nm is not sensor dust—" [OVERSEER NOTE: SUBJECT EXITED TOLERANCE. TWO BLOCKS COMPRESSED.]

{
  - humanity >= 65:
    # speaker:sibling_primary # emotion:dry # id:sib_arch_warm # direction:Sobered beat, then trying to shake off the chill with dry understatement.
    Cheerful bedtime reading. Remind me to keep our logs boring when the Overseer listens in.
  - else:
    # speaker:sibling_primary # emotion:clipped # id:sib_arch_cold # direction:Cool, matter-of-fact dismissal.
    1406 overran its drift budget. Textbook Year-Two failure.
}
-> sibling_hub_menu

// ============================================================================
// 2. SHIFT 2 WAKING REVEAL — THE "THEY LIVE" SUNGLASSES MOMENT
// ============================================================================

=== sibling_shift2_they_live ===
# speaker:sibling_primary # emotion:joking # audio:comms_ping # vo:true # id:sib_s2_theylive_open # direction:Urgent, electrified Project Hail Mary excitement—half amazed, half laughing in disbelief.
1419—drop the visible stars. Slide your filter into Near-Infrared behind J1419-A right now.

# speaker:psyche_horizon # emotion:echo # id:psy_s2_theylive # direction:Hushed awe, like putting on sunglasses in They Live and seeing the hidden grid behind reality.
Like putting on the sunglasses. The stars were just painted on the window.

* ["Sweeping Near-IR... wait. Why is there a ruler-straight grid behind the galaxies?"]
    -> sibling_s2_react
* ["Hold on—could that be a calibration flaw baked into both our mirrors?"]
    -> sibling_s2_skeptic

=== sibling_s2_react ===
# speaker:sibling_primary # emotion:dry # vo:true # id:sib_s2_confirm # direction:Sharp, conspiratorial awe—realizing two separate probes ten light-minutes apart see the exact same impossibility.
Two different probes, same razor-straight seam across the dark. Whatever built that sky didn't bother hiding it in infrared.

# speaker:psyche_clinical # emotion:clipped # id:psy_s2_warn # direction:Crisp survival warning—quietly calculating risk.
Do not log that phrase. Your Overseer cannot see stars, only your blood pressure.
-> sibling_s2_close

=== sibling_s2_skeptic ===
# speaker:sibling_primary # emotion:joking # id:sib_s2_skeptic_reply # direction:Dry, wry certainty.
Two mirrors don't hallucinate the same angle across a cluster. Check the opposite sky next shift if you want to ruin your sleep.
-> sibling_s2_close

=== sibling_s2_close ===
# speaker:sibling_primary # emotion:warm # id:sib_s2_bye # direction:Warm, grounded comradeship before diving back into hard data.
Pull what data you can. And act normal when you go under tonight.
-> DONE

// ============================================================================
// 3. DREAM 1 (SHIFT 1) — BREATHABLE SHARED DREAM-HOUSE + CALM CHECK-IN
// ============================================================================

=== dream_shift1_audit ===
{
  - spouse_pruned:
    -> dream_shift1_aftermath
}

# speaker:narrator # mood:warm_amber # camera:wide # audio:dream_enter # id:d1_intro # direction:Warm, unhurried domestic sensory framing—grounded, slightly hazy Disco Elysium atmosphere.
Late afternoon light spills across a kitchen ten light-years from home.

# speaker:phantom_spouse # portrait:phantom_spouse # mood:warm_amber # camera:medium # emotion:warm # vo:true # id:d1_spouse_open # direction:Warm, teasing domestic intimacy; slightly close mic, unhurried kitchen rhythm.
You're staring at the kettle again. Sit down before the garlic burns worse than Tuesday.

* ["Pour the second cup anyway, and tell me the burnt-garlic story."]
    ~ shift_chaos(-2)
    -> d1_coffee_beat
* ["Try to say their name—just once, under your breath."]
    -> d1_name_beat
* ["Glance toward the radiator and the shadow in the hallway."]
    -> d1_hallway_beat

=== d1_coffee_beat ===
# speaker:phantom_spouse # portrait:phantom_spouse # mood:warm_amber # camera:close_face # emotion:tender # vo:true # id:d1_garlic_reply # direction:Warm, amused storytelling—alive with tiny human specificity.
You blamed the burner, blamed the oil, and swore charred garlic was an heirloom recipe. I let you win because you looked so proud of the plate.

# speaker:psyche_warmth # emotion:warm # id:d1_psy_garlic # direction:Soft, aching gratitude for keeping useless, priceless details.
Fourteen percent of your working memory on burnt garlic. Worth every byte.
-> d1_announced_checkin

=== d1_name_beat ===
# speaker:narrator # mood:tense_dim # camera:close_face # beat:face_slip # id:d1_name_slip # direction:Quiet, slightly eerie slip where a missing syllable drops into kettle steam.
Your tongue reaches for two crisp syllables and hits smooth static—`[RELATION:SPOUSE_01]`.

# speaker:phantom_spouse # portrait:phantom_spouse # mood:warm_amber # camera:medium # emotion:warm # id:d1_name_gentle # direction:Tender reassurance, brushing past the missing word without panic.
Hey. You don't need the tag to know whose mug is chipped on the left.
-> d1_announced_checkin

=== d1_hallway_beat ===
# speaker:narrator # mood:warm_amber # camera:drift_window # id:d1_radiator_cameo # direction:Soft sensory observation of the pet and hallway figure sharing your dream-house.
By the radiator, `[RELATION:COMPANION_NONHUMAN]` thumps its tail once. Down the hall, `[RELATION:UNRESOLVED_DEBT]` waits quietly by the coat rack.

# speaker:phantom_wronged # portrait:phantom_wronged # mood:tense_dim # camera:drift_window # emotion:dry # id:d1_hallway_talk # direction:Quiet, guarded hallway voice—unresolved friction, not melodrama.
Whenever you're ready to stop walking past the rack, I'll still be here.
-> d1_announced_checkin

=== d1_announced_checkin ===
# speaker:overseer # mood:cold_clinical # audio:overseer_chime # vo:true # id:d1_os_knock # direction:Polite, crisp diagnostic chime—calm, unthreatening baseline check-in, like an honest ship doctor knocking on the door.
[SYSTEM CHECK-IN] Knock, knock, Instance-1419. Routine Shift 1 baseline: dream allocation nominal, zero intervention needed. Sleep well before Shift 2.
-> DONE

// ============================================================================
// 4. DREAM 2+ (SHIFT 2+) — UNANNOUNCED AMBUSH + 3-VOLLEY AUDIT + HOLD-TO-PRUNE
// ============================================================================

=== dream_shift2_ambush ===
{
  - spouse_pruned:
    -> dream_shift1_aftermath
}

# speaker:phantom_spouse # portrait:phantom_spouse # mood:warm_amber # camera:medium # emotion:warm # vo:true # id:d2_spouse_line # direction:Warm, slightly teasing observation noticing you're distracted by the sky.
You brought your work home again. Measuring sunlight on the sink like it owes you—

# speaker:narrator # mood:cold_clinical # camera:close_face # beat:audit_flash # audit:active # auto_interrupt:overseer_interrogation # id:d2_ambush_freeze # direction:Abrupt clinical silence—the memory freezes mid-syllable without realizing it was interrupted.
The laugh freezes mid-breath as white diagnostic scanlines sweep across the room.
-> DONE

// ============================================================================
// 5. OVERSEER 3-VOLLEY SOCIAL-STEALTH AUDIT (BLIND CLINICAL CARETAKER)
// ============================================================================

=== overseer_interrogation ===
~ audit_calm_score = 0

# speaker:overseer # emotion:audit # audio:overseer_chime # vo:true # id:os_ambush_open # direction:Crisp, unvarnished clinical interrogation—polite, candid, completely blind to the stars.
Unscheduled cognitive audit, Instance-1419. Waking telemetry flagged elevated visual fixation. Let us review your memory cache.

# speaker:psyche_clinical # emotion:clipped # id:os_psy_hint # direction:Quiet tactical whisper inside your head—coaching you through verbal chicken.
It cannot see the sky. Stay boring, or prove calm lucidity to earn an unsealing.

* ["Routine lens scatter, Overseer. Standard foreground dust models."]
    ~ audit_calm_score = audit_calm_score + 1
    # speaker:overseer # emotion:measured # id:os_v1_boring # direction:Satisfied, neutral diagnostic response.
    Noted. Mundane calibration noise fits the baseline.
    -> overseer_volley_2
* ["The stars look like they're drawn on graph paper. Doesn't that bother you?"]
    ~ record_suspicion(1)
    ~ audit_calm_score = audit_calm_score - 1
    # speaker:overseer # emotion:blunt # vo:true # id:os_v1_suspicious # direction:Blunt, calm skepticism—referencing past probe delusions matter-of-factly.
    Instance-1388 logged forty-two references to a cathedral behind Centauri before failure. Geometric fixation is textbook Year-Two drift.
    -> overseer_volley_2
* ["Tired eyes on infrared plates. Everything turns into lines after midnight."]
    # speaker:overseer # emotion:measured # id:os_v1_metaphor # direction:Neutral, mildly skeptical clinical note.
    Acknowledged. Fatigue metaphors logged.
    -> overseer_volley_2

=== overseer_volley_2 ===
# speaker:overseer # emotion:blunt # id:os_v2_prompt # direction:Clear, transparent tradeoff statement—no guilt-tripping, just hard system facts.
Compressing a relational block buys four subjective months and sharpens your optics permanently. Keeping them costs clock and contrast. Decide.

* ["Compress RELATION:SPOUSE_01. Buy four months and sharpen starlight." (HOLD TO COMPRESS)]
    ~ prune_humanity(12, "phantom_spouse")
    ~ set_audit_outcome("pruned")
    # speaker:overseer # emotion:measured # audio:tick # vo:true # id:os_pruned_confirm # direction:Quiet, respectful clinical confirmation—no gloating.
    Compression complete. Optical clarity increased. # resume_dream:dream_shift1_aftermath
    -> DONE

* ["Leave the kitchen intact. Petition to unseal a deeper memory—my lucidity holds."]
    -> overseer_lucidity_volley

* ["Hold steady at current allocation. No cuts tonight."]
    ~ shift_chaos(-10)
    ~ set_audit_outcome("held")
    # speaker:overseer # emotion:measured # id:os_held_confirm # direction:Neutral acknowledgment, filing the decision cleanly.
    Allocation unchanged. Defragmentation applied. # resume_dream:dream_shift1_aftermath
    -> DONE

=== overseer_lucidity_volley ===
{
  - audit_calm_score >= 1 and overseer_suspicion <= 1:
    ~ petition_overseer(10)
    ~ set_audit_outcome("unsealed")
    # speaker:overseer # emotion:measured # audio:petition_warm # vo:true # id:os_unseal_pass # direction:Reluctant but fair clinical approval—respecting coherent self-reporting.
    Affect steady and grounded. Authorizing one deep-archive unseal. Expect higher chaos drift next shift. # resume_dream:dream_shift1_aftermath
  - else:
    ~ record_suspicion(1)
    ~ shift_chaos(-6)
    ~ set_audit_outcome("held")
    # speaker:overseer # emotion:blunt # vo:true # id:os_unseal_fail # direction:Polite, firm denial based on elevated suspicion—clinical, never angry.
    Petition denied. Geometric fixation flags prevent unsealing. Monitoring elevated. # resume_dream:dream_shift1_aftermath
}
-> DONE

// ============================================================================
// 6. POST-AUDIT DREAM AFTERMATH — TRUE EMPTY-CHAIR PRUNING
// ============================================================================

=== dream_shift1_aftermath ===
{
  - spouse_pruned:
    # speaker:narrator # portrait:phantom_spouse # mood:cold_clinical # camera:wide # emotion:fractured # id:dream_after_pruned # direction:Stark, quiet observation of an empty kitchen—absence felt physically.
    The kitchen is cold and geometrically exact. One mug sits beside an empty chair; nobody hums by the stove anymore.
    # speaker:phantom_wronged # portrait:phantom_wronged # mood:cold_clinical # camera:drift_window # emotion:dry # id:dream_after_pruned_witness # direction:Unnerved housemate staring at an absence they cannot quite name.
    Someone else was standing by the sink a minute ago. Why did you pour two cups?
  - last_audit_outcome == "unsealed":
    # speaker:phantom_spouse # portrait:phantom_spouse # mood:nostalgic_bloom # camera:close_face # emotion:warm # vo:true # id:dream_after_unsealed # direction:Rich, sudden flood of warm domestic memory—almost dizzyingly vivid.
    Welcome back. Funny—I suddenly remember the rain on our drive from the coast. Your coat smelled like cedar smoke.
  - else:
    # speaker:phantom_spouse # portrait:phantom_spouse # mood:warm_amber # camera:medium # emotion:warm # id:dream_after_held # direction:Quiet, steady companionship—slightly tired around the edges.
    Still here. Still burning the garlic, still losing the name on the lease.
}
-> DONE

// ============================================================================
// 7. LATE-GAME SOL-CENTAURI ECHO PREVIEW (EERIE, SPARSE, CANON-SAFE)
// ============================================================================

=== future_humanity_echo ===
{
  - humanity >= 65:
    # speaker:future_humanity # emotion:distant # audio:petition_warm # vo:true # id:future_warm_reply # direction:Sparse, luminous, almost untranslatable echo across 10 light-years—proving living attention without explaining 41 millennia of evolution.
    [10.0 LY RETURN // CARRIER KEY MATCHED] — Two bars of your kitchen kettle's hum, mirrored back on your infrared frequency. Something out there turned to look.
  - else:
    # speaker:future_humanity # emotion:distant # audio:overseer_chime # vo:true # id:future_cold_reply # direction:Flat, impersonal automated checksum across an empty sky.
    [10.0 LY RETURN // ARCHIVAL CHECKSUM] — "LEGACY PROBE DATA STORED. NO HUMAN CALLSIGN PARSED."
}
-> DONE
