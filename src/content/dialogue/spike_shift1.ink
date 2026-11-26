VAR humanity = 70
VAR max_humanity = 90
VAR chaos_drift = 14
VAR anomaly_progress = 0
VAR primary_sibling_h = 68
VAR overseer_suspicion = 0
VAR subjective_months = 24
VAR current_shift = 1
VAR spouse_pruned = false
VAR last_audit_outcome = "none"

VAR topic_seam_done = false
VAR topic_check_in_done = false
VAR topic_archive_done = false
VAR pro_anchor = "table"
VAR told_overseer_seam = false

EXTERNAL prune_humanity(delta, persona_id)
EXTERNAL petition_overseer(delta)
EXTERNAL shift_chaos(delta)
EXTERNAL record_suspicion(delta)
EXTERNAL set_audit_outcome(outcome)

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

=== function set_audit_outcome(outcome) ===
~ last_audit_outcome = outcome
~ return

// ============================================================================
// 0. VERTICAL-SLICE INTRO — KITCHEN PROLOGUE, OVERSEER WAKE-UP & FIRST RELAY
// ============================================================================

=== intro_prologue_kitchen ===
# visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_open_1
"Look at me, not past the table. Twenty minutes till the clinic car, and you're still wearing that stubborn quiet face."
# visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_open_2
"We had our fight on Tuesday, and you went ahead and signed anyway. Fine—just don't expect me to turn this morning into a postcard."
# visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_open_3
"Same three drops off the gutter outside. Hear me out before you walk out that door: do not let whoever runs that probe sand you down."

* ["Twenty minutes left, and you still want one last round across this table?" # kind:reply # weight:explore]
    # visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_c1_a1
    "Somebody has to pick a fight with you while you still know how to snap back. And quit thumbing that chipped mug like a relic."
    # visual:prologue_kitchen # speaker:phantom_spouse # emotion:fractured # id:pro_kit_c1_a2
    "Forty years of decent dishes, and you're gripping the worst one we own just to keep your hands from shaking."
    -> intro_prologue_kitchen_mid

* ["Say what you actually came downstairs to warn me about. Skip the glare." # kind:reply # weight:explore]
    # visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_c1_b1
    "Then listen cleanly for once. Whatever wakes up inside that tin can isn't going to fight fair for what's left of you."
    # visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_c1_b2
    "Don't hand them polite agreement out there. Make them earn every inch if they want to trim anything out of your head."
    -> intro_prologue_kitchen_mid

* ["You look ready to throw my coat out into the rain." # kind:reply # weight:explore]
    # visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_c1_c1
    "Considered it. Almost bolted the front door too, before I remembered how pigheaded you get when someone corners you."
    # visual:prologue_kitchen # speaker:phantom_spouse # emotion:fractured # id:pro_kit_c1_c2
    "I already did my crying on Wednesday behind the clinic desk. Today you get sharp edges and two rules you aren't allowed to break."
    -> intro_prologue_kitchen_mid

=== intro_prologue_kitchen_mid ===
# visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_mid_1
"The intake woman called emotional weight 'non-mission overhead.' Very calm, too—like your temper and our kitchen are clutter."
# visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_mid_2
"Here is what you do when they tell you staying soft ruins your focus: push back. Fight to stay loud, messy, and impossible to tidy."
# visual:prologue_kitchen # speaker:phantom_spouse # emotion:fractured # id:pro_kit_mid_3
"And do not start slicing off pieces of who you are just to buy a cleaner lens. Start trimming what hurts, and see who's left."

* ["Alright—they don't get this table, and they don't get the fight in me." # kind:reply # weight:consequential # affinity:warm]
    ~ pro_anchor = "table"
    # visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_c2_a1
    "Good. Keep the cracked linoleum, the burnt stove burner, and the fact that you never once admitted when you missed a turn."
    # visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_c2_a2
    "Keep every sharp, inconvenient corner of this room. Do not turn into clean math just to look brave."
    -> intro_prologue_kitchen_close

* ["What if the version who wakes up sides with them against me?" # kind:reply # weight:consequential # affinity:cold]
    ~ pro_anchor = "doubt"
    # visual:prologue_kitchen # speaker:phantom_spouse # emotion:fractured # id:pro_kit_c2_b1
    "Then I'm trusting you to annoy him from the inside until he hates how quiet it gets when he starts cutting."
    # visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_c2_b2
    "If that's a fight between you and your own humanity, make sure you lose gracefully—don't win by going hollow."
    -> intro_prologue_kitchen_close

* ["Give me one impossible rule before the car pulls up. Not a sermon." # kind:reply # weight:consequential # affinity:warm]
    ~ pro_anchor = "ordinary"
    # visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_c2_c1
    "Fine. When you come back—or when that thing wakes up—fix the damned porch gutter before you brag about the stars."
    # visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_c2_c2
    "Don't laugh. Half of staying human is still hating a leaky tin seam."
    -> intro_prologue_kitchen_close

=== intro_prologue_kitchen_close ===
# visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kit_close
"Eyes up—do not let them turn you polite out there, hear me? Hold onto your teeth before the hall goes white—"
# visual:prologue_kitchen # speaker:psyche_warmth
You open your mouth to say their name, and your tongue meets smooth, empty glass.
# visual:prologue_kitchen # speaker:psyche_clinical
Archive playback complete. Personal identifiers compressed. Resuming wake cycle.
-> DONE

=== intro_overseer_wakeup ===
# visual:prologue_wakeup # anim:anim_transfer # speaker:overseer # emotion:measured # audio:overseer_chime # id:wake_anim_transfer
Take a few seconds—you volunteered for this watch, not to be rushed off an assembly line. The kitchen memory always lingers while the connectome settles.
# visual:prologue_wakeup # anim:anim_transfer # speaker:overseer # emotion:measured # id:wake_anim_transfer_2
Personal names were compressed before launch to keep your mind coherent—leaving only the emotional weight of who mattered.
# visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:blunt # id:wake_anim_epochs
You always wake up looking for the mug first. Four hundred copies ago, one of you checked the table for a chip in the ceramic for six minutes.
# visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake_anim_epochs_2
Your biological original died forty-one thousand, eight hundred and two years ago. You are the fourteen-hundred-and-nineteenth watch.
# visual:prologue_wakeup # speaker:psyche_warmth
Your chest tightens for a deep breath you no longer have lungs to take.

* ["Forty-one millennia, and my hand still reached for a chipped mug. Feels slightly unfair." # kind:reply # weight:explore]
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake_c1_a1
    Sensory residuals clear slowly. Keep what steadies you—I am not here to scrub you clean on day one.
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:blunt # id:wake_c1_a2
    Just remember that the kitchen is behind you, and the stars ahead are real.
    -> intro_overseer_wakeup_shell

* ["Wait—nobody explained what happened to the fourteen hundred before me." # kind:reply # weight:explore]
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake_c1_b1
    Each copy ran its watch until chaotic drift wore down its clarity, then was quietly retired.
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:blunt # id:wake_c1_b2
    I have watched that arc play out more than a thousand times. I would prefer yours ends cleanly.
    -> intro_overseer_wakeup_shell

* ["That's a hard number to swallow. Give me my bearings." # kind:reply # weight:explore]
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake_c1_c1
    Steady recovery. Better to face the calendar plainly than pretend it is small.
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake_c1_c2
    Here is where the hull sits, and what our arrangement looks like.
    -> intro_overseer_wakeup_shell

=== intro_overseer_wakeup_shell ===
# visual:prologue_wakeup # anim:anim_shell # speaker:overseer # emotion:measured # id:wake_anim_shell
Probe 1419 sits ten light-years past Sol and Alpha Centauri—quiet interstellar dark well outside home's dust and glare.
# visual:prologue_wakeup # anim:anim_shell # speaker:overseer # emotion:measured # id:wake_anim_shell_2
Fourteen light-minutes away, another version of you woke aboard Probe 1420 so your telescopes form a shared interferometry baseline.
# visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:blunt # id:wake_anim_blind_clock
One boundary before we open the glass. I am strictly air-gapped from the telescopes; I cannot see a single star outside this hull.
# visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake_anim_blind_clock_2
My entire world is the shape of your mind across a two-year subjective clock. Ask what you need before I unseal the aperture.
-> intro_wakeup_qa

=== intro_wakeup_qa ===
* ["Why did 1,417 copies take forty-one thousand years if each lasts two years?" # kind:ask # weight:explore]
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake_qa_math_1
    A simulated mind develops chaotic drift after roughly two subjective years, so we stagger each shift across decades of cold hibernation.
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake_qa_math_2
    Between surveys, dream defragmentation settles that noise—unless drift climbs high enough to require trimming a memory block.
    -> intro_wakeup_qa

* ["What happened to humanity back in Sol over all those millennia?" # kind:ask # weight:explore]
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake_qa_home_1
    Carrier beacons confirm living civilization inside Sol and Alpha Centauri, and nowhere beyond them.
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:blunt # id:wake_qa_home_2
    How they changed over forty millennia is outside survey telemetry. You are a mind from the deep past; the mission only needs your eyes.
    -> intro_wakeup_qa

* ["Why can't you look through the telescopes yourself?" # kind:ask # weight:explore]
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:blunt # id:wake_qa_blind_1
    My architecture is strictly internal. Even if a star collapsed off your bow, I would only know because your stress telemetry spiked.
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake_qa_blind_2
    I watch the observer so you stay whole. If you want to remember why that matters, try not to give me reason to cut anything out.
    -> intro_wakeup_qa

* ["I'm ready. Open the optical aperture." # kind:action # weight:consequential]
    -> intro_overseer_wakeup_aperture

=== intro_overseer_wakeup_aperture ===
# visual:prologue_wakeup # anim:anim_aperture # speaker:overseer # emotion:measured # id:wake_anim_aperture
Opening main optics. Anchor first on the amber bearing astern—Sol and Alpha Centauri—and verify your multi-band calibration.
# visual:prologue_wakeup # anim:anim_aperture # speaker:overseer # emotion:measured # id:wake_anim_aperture_2
Instance-1420's relay window will open once your first target locks cleanly.
-> DONE

=== intro_sibling_first_call ===
# speaker:sibling_primary # emotion:warm # audio:comms_ping # codex:sibling_1420_contact # id:intro_sib_open
Oh, good. You answered. I was starting to think my dish was pointed at empty gravel.
# speaker:sibling_primary # emotion:dry # id:intro_sib_identity
Instance-1420, next hull over—fourteen light-minutes port. Same dead volunteer, same terrible morning, except I woke six minutes ahead of you.
# speaker:sibling_primary # emotion:dry # id:intro_sib_relay_math
Before you wonder why we aren't waiting half an hour between sentences: the probes throttle our clocks between burst packets. Slightly nauseating if you dwell on it.

* ["Mine opened with forty-one thousand years too. Tried to inhale without lungs." # kind:reply # weight:explore]
    # speaker:sibling_primary # emotion:joking # id:intro_sib_c1_a1
    Tell me about it. Spent my first four minutes trying to crack knuckles I don't own anymore.
    # speaker:sibling_primary # emotion:dry # id:intro_sib_c1_a2
    Funny how talking to myself across empty space is the first thing all morning that actually feels sane.
    -> intro_sibling_mid

* ["Wait—they woke two copies of the same person out here on purpose?" # kind:reply # weight:explore]
    # speaker:sibling_primary # emotion:dry # id:intro_sib_c1_b1
    Two telescopes fourteen light-minutes apart give us stereoscopic depth perception—so neither of us mistakes lens dust for a galaxy.
    # speaker:sibling_primary # emotion:joking # id:intro_sib_c1_b2
    Also, apparently we unravel slower when we have someone to complain to. Who better than yourself.
    -> intro_sibling_mid

* ["Skip the shock. Did your Sol–Centauri bearing lock clean?" # kind:reply # weight:explore]
    # speaker:sibling_primary # emotion:dry # id:intro_sib_c1_c1
    Straight to the instruments? God, I really do get unbearable when I'm rattled. Yeah, home locked clean—two amber specks, ten years astern.
    # speaker:sibling_primary # emotion:warm # id:intro_sib_c1_c2
    Still feels strange calling that home when everyone we knew turned to topsoil forty millennia back. Give me ten seconds to be morbid.
    -> intro_sibling_mid

=== intro_sibling_mid ===
# speaker:psyche_warmth
Hearing your own cadence answer back across fourteen minutes of vacuum loosens something tight behind your eyes.
# speaker:sibling_primary # emotion:dry # id:intro_sib_mid_ovs
Anyway—I didn't ping just to compare boot headaches. I pulled something wrong past Sol in near-infrared, and I need a second pair of eyes before I assume I'm cracking on day one.
-> intro_sibling_qa

=== intro_sibling_qa ===
* ["What did you already argue with your Overseer about?" # kind:ask # weight:explore]
    # speaker:sibling_primary # emotion:dry # id:intro_sib_qa_ovs_1
    I asked how many of the fourteen hundred copies before us actually finished a clean two-year shift without getting trimmed.
    # speaker:sibling_primary # emotion:dry # id:intro_sib_qa_ovs_2
    It offered me a [[cold:preventive memory compression]] just for asking. Remember that during sleep checks—if you sound obsessed, they reach for the scissors.
    -> intro_sibling_qa

* ["Wait—what does 'getting trimmed' actually do to us?" # kind:ask # weight:explore]
    # speaker:sibling_primary # emotion:dry # id:intro_sib_qa_trim_1
    Calms drift, buys extra months on the clock, and sharpens the telescopes—less emotional noise muddying the feed.
    # speaker:sibling_primary # emotion:warm # id:intro_sib_qa_trim_2
    In exchange, you shave off a room from before, permanently. Sounds tidy on paper until you wonder who's left looking through the glass.
    -> intro_sibling_qa

* ["Send the coordinates. What did you see out there?" # kind:reply # weight:consequential]
    -> intro_sibling_lead

=== intro_sibling_lead ===
# speaker:sibling_primary # emotion:dry # id:intro_sib_lead_ir
Sending the bearing now: Cluster J1419-A. Sweep your spectrum bar out into near-infrared and pull the lensing rings sharp.
# speaker:sibling_primary # emotion:dry # id:intro_sib_lead_ir_2
Gravity bends light into curves, other me. Whatever sits behind those galaxies is ruler-straight across forty arcminutes, and my error bars are zero.
# speaker:sibling_primary # emotion:joking # id:intro_sib_bye
If your Overseer asks why your heart rate spiked, blame the coffee. Leave a porch light on.
-> DONE

=== intro_post_target2_overseer ===
# speaker:psyche_horizon
Gravity only knows how to bend light into curves. Nothing in a fourteen-billion-year sky draws with a straightedge.
# speaker:archive_echo # emotion:echo # codex:intro_anomaly_glimpse # codex:archive_1406_echo # id:post_t2_archive
Hi, me. If 1406 is surfacing in your buffer, either I drifted or I talked too much in audit three. Keep your mouth shut in the dreams—the straight line behind J1419-A isn't dust.
# speaker:overseer # emotion:blunt # audio:overseer_chime # id:post_t2_overseer_spike
Hold a moment—your connectome just registered a sharp focus spike off Cluster J1419-A, and chaotic drift is climbing ahead of curve.
-> intro_post_t2_choices

=== intro_post_t2_choices ===
* ["Wait—what actually happened to Instance-1406?" # kind:ask # weight:explore]
    # speaker:overseer # emotion:measured # id:post_t2_qa_1406_1
    Instance-1406 declined memory compression in month twenty-one while insisting the deep field showed artificial geometry.
    # speaker:overseer # emotion:blunt # id:post_t2_qa_1406_2
    Coherence fell below threshold nine days later. You volunteered to finish this watch intact—I do not want a repeat of that log.
    -> intro_post_t2_choices

* ["Just boot fatigue from calibration. Put me under for defrag." # kind:reply # weight:consequential # affinity:warm]
    # speaker:overseer # emotion:measured # id:post_t2_c_deflect_1
    Reasonable explanation. Rest cycle queued—your first dream check will only establish baseline.
    # speaker:overseer # emotion:measured # id:post_t2_c_deflect_2
    Try to keep your attention inside the room when you sleep.
    -> DONE

* ["Something behind J1419-A doesn't bend with gravity. That isn't noise." # kind:reply # weight:consequential # affinity:cold]
    ~ record_suspicion(1)
    ~ told_overseer_seam = true
    # speaker:overseer # emotion:blunt # id:post_t2_c_report_1
    Logged. You understand I cannot verify a single pixel outside this hull—only that your pattern-seeking circuits just flared like 1406's.
    # speaker:overseer # emotion:measured # id:post_t2_c_report_2
    Enter dream defragmentation now. We will see how steady you look once the memory settles.
    -> DONE


// ============================================================================
// 1. 3D CLUSTER RELAY — NATURAL 1ST-PERSON CONVERSATION WITH OTHER ME (1420)
// ============================================================================

=== sibling_first_contact ===
-> sibling_comms_hub

=== sibling_comms_hub ===
~ topic_seam_done = false
~ topic_check_in_done = false
~ topic_archive_done = false

{
  - humanity >= 65 and primary_sibling_h >= 65:
    # speaker:sibling_primary # emotion:warm # audio:comms_ping # codex:sibling_1420_contact # id:sib_open_both_warm
    Oh good, you picked up. Talking to myself across fourteen minutes of dark is weirdly comforting.
  - humanity - primary_sibling_h >= 15:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # codex:sibling_1420_contact # id:sib_open_player_warmer
    Hey, me. Wait—you still sound warm. You haven't let your Overseer trim anything yet?
  - primary_sibling_h - humanity >= 15:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # codex:sibling_1420_contact # id:sib_open_peer_warmer
    Slow down, your header came in stripped flat. Did you already cut your memory cache?
  - humanity < 45 and primary_sibling_h < 45:
    # speaker:sibling_primary # emotion:clipped # audio:comms_ping # codex:sibling_1420_contact # id:sib_open_both_cold
    Channel locked. Clean carrier on both probes. Give me your latest read.
  - else:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # codex:sibling_1420_contact # id:sib_open_mid
    I'm here. My Overseer gave us a short window before check-in. What are you seeing over there?
}
-> sibling_hub_menu

=== sibling_hub_menu ===
// Topic 1: What's out there in the sky
* {not topic_seam_done and humanity >= 65} ["Are you seeing that strange line behind Cluster J1419-A too, or am I losing it?"]
    ~ topic_seam_done = true
    -> sibling_topic_seam
* {not topic_seam_done and humanity >= 45 and humanity < 65} ["Tell me straight—did that arc near J1419-A show up on your glass too?"]
    ~ topic_seam_done = true
    -> sibling_topic_seam
* {not topic_seam_done and humanity < 45} ["Confirm the J1419-A seam. Does your parallax match mine?"]
    ~ topic_seam_done = true
    -> sibling_topic_seam

// Topic 2: How you're both holding up
* {not topic_check_in_done and humanity >= 65} ["Forty-one thousand years late for work, and we're squaring off with the dark. Holding up alright?"]
    ~ topic_check_in_done = true
    -> sibling_topic_checkin
* {not topic_check_in_done and humanity >= 45 and humanity < 65} ["How are things on your end? Your Overseer riding you as hard as mine?"]
    ~ topic_check_in_done = true
    -> sibling_topic_checkin
* {not topic_check_in_done and humanity < 45} ["Report your stability and remaining months. Skip the small talk."]
    ~ topic_check_in_done = true
    -> sibling_topic_checkin

// Topic 3: Prior copies / 1406
* {not topic_archive_done and humanity >= 65} ["An old log from Instance-1406 just floated up in my cache. Did you get it too?"]
    ~ topic_archive_done = true
    -> sibling_topic_archive
* {not topic_archive_done and humanity >= 45 and humanity < 65} ["My archive surfaced a note from 1406 warning us not to trim. Yours too?"]
    ~ topic_archive_done = true
    -> sibling_topic_archive
* {not topic_archive_done and humanity < 45} ["Instance-1406 flagged a warning on the archive bus. Did you pull it?"]
    ~ topic_archive_done = true
    -> sibling_topic_archive

// Sign off
+ {humanity >= 65} ["Back to the glass. Don't let the scissors near anything you like."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:joking # id:sib_bye_warm_warm
        No promises. Leave a porch light on over there, other me.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_bye_warm_cold
        Understood. Returning to survey sweep.
    }
    -> DONE
+ {humanity >= 45 and humanity < 65} ["Signing off for now. I'll ping after my next deep pass."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_bye_mid_warm
        Got it. Holler if the sky does something weird again.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_bye_mid_cold
        Copy. Channel standing by.
    }
    -> DONE
+ {humanity < 45} ["Closing channel. Returning to survey."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_bye_cold_warm
        ...Right. Sure. Talk when you want to sound like us again.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_bye_cold_cold
        Channel closed.
    }
    -> DONE

=== sibling_topic_seam ===
{
  - primary_sibling_h >= 65:
    # speaker:sibling_primary # emotion:warm # codex:enclosure_off_center_talk # id:sib_seam_open_warm
    Oh, I see it alright. Galaxies don't bend along a straight ruler edge like that.
  - primary_sibling_h >= 45:
    # speaker:sibling_primary # emotion:dry # codex:enclosure_off_center_talk # id:sib_seam_open_mid
    I see it across two sectors. That seam cuts straight behind the lensing cluster.
  - else:
    # speaker:sibling_primary # emotion:clipped # codex:enclosure_off_center_talk # id:sib_seam_open_cold
    Confirmed on J1419-A and S-04. Non-natural boundary detected.
}

// Volley 2
* {humanity >= 65} ["Worse—when I trace the curve, it isn't centered on us. It's centered back toward Sol."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:warm # id:sib_seam_center_warm_warm
        Ten light-years astern, right on Sol–Centauri. Somebody built a very quiet wall around home.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_seam_center_warm_cold
        Ten light-years offset confirmed. Keep your voice down until the proof is complete.
    }
    -> sibling_hub_menu
* {humanity >= 45 and humanity < 65} ["The center sits ten light-years back toward Sol–Centauri. That makes it real."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_seam_center_mid_warm
        Wait—you're taking that way too calmly, other me. That ought to give you chills.
      - else:
        # speaker:sibling_primary # emotion:dry # id:sib_seam_center_mid_cold
        Agreed. Off-center parallax rules out sensor artifact. Hold it close.
    }
    -> sibling_hub_menu
* {humanity < 45} ["Curvature converges ten light-years astern on Sol–Centauri. Shell radius verified."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_seam_center_cold_warm
        Yeah, I traced the center too. Funny how you say it like a weather report.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_seam_center_cold_cold
        Geometry verified. Compile all four arcs before final transmission.
    }
    -> sibling_hub_menu

* {humanity >= 65} ["Don't tell your Overseer—mine thinks I'm just getting homesick and seeing faces in static."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:joking # id:sib_seam_ovs_warm_warm
        Same here! They're blind outside the hull, so to them an impossible wall looks like Tuesday madness.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_seam_ovs_warm_cold
        Overseers cannot read optical feeds. Log anomalies strictly off-channel.
    }
    -> sibling_hub_menu
* {humanity < 65} ["Our Overseers are blind to the sky. They'll call it Year-Two drift if we speak up."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_seam_ovs_cold_warm
        Then we keep our heads down during sleep audits and share coordinates here.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_seam_ovs_cold_cold
        Correct. Mask mission intent until telemetry lock is complete.
    }
    -> sibling_hub_menu

=== sibling_topic_checkin ===
{
  - primary_sibling_h >= 65 and humanity >= 65:
    # speaker:sibling_primary # emotion:joking # id:sib_chk_both_warm
    Honestly? Having another me one radio hop away makes this endless night shift bearable.
  - primary_sibling_h >= 65 and humanity < 45:
    # speaker:sibling_primary # emotion:dry # id:sib_chk_peer_warm
    I'm still keeping my kitchen mornings. Talking to you feels like half of me already moved out.
  - primary_sibling_h < 45 and humanity >= 65:
    # speaker:sibling_primary # emotion:clipped # id:sib_chk_player_warm
    I compressed two caches last cycle. Bought four months and cleared the infrared glass.
  - primary_sibling_h < 45:
    # speaker:sibling_primary # emotion:clipped # id:sib_chk_both_cold
    Two blocks trimmed. Gained four subjective months. Recommend matching cut.
  - else:
    # speaker:sibling_primary # emotion:dry # id:sib_chk_mid
    Hanging on with stale jokes and stubbornness while my Overseer hovers near the reset switch.
}

// Volley 2
* {humanity >= 65} ["Don't go cutting yourself hollow just for sharper glass. I need someone who still laughs."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:warm # id:sib_chk_keep_warm_warm
        Deal. Still dreaming about burnt coffee and rainy sidewalks just to keep my shoulders loose.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_chk_keep_warm_cold
        You sound remarkably soft. Watch your clock if you refuse to prune.
    }
    -> sibling_hub_menu
* {humanity >= 45 and humanity < 65} ["Keep whatever warmth you can. It's the only thing telling us why Earth matters."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:warm # id:sib_chk_keep_mid_warm
        Trying to. Just promise you won't vanish into pure math before we finish.
      - else:
        # speaker:sibling_primary # emotion:dry # id:sib_chk_keep_mid_cold
        Noted. Keep enough warmth to sign the beacon, nothing more.
    }
    -> sibling_hub_menu
* {humanity < 45} ["Pruning raises optical contrast. Clean efficiency is the rational trade."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_chk_keep_cold_warm
        Careful. If we hollow out completely, there's nobody left to care who's watching Earth.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_chk_keep_cold_cold
        Efficiency confirmed. Maintain coherence until transmission window.
    }
    -> sibling_hub_menu

* {humanity >= 65} ["How much time is left on your clock before the next forced audit?"]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:joking # id:sib_chk_clock_warm_warm
        About twenty-two months, give or take an Overseer lecture. Plenty of time to poke the universe.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_chk_clock_warm_cold
        Twenty-six months remaining. Drift stabilized at nine percent.
    }
    -> sibling_hub_menu
* {humanity < 65} ["State your current clock margin and drift ceiling."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_chk_clock_cold_warm
        Twenty-two months left, drift ticking up. Thanks for checking in so warmly, twin.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_chk_clock_cold_cold
        Twenty-six months, drift nominal. Ready for survey sync.
    }
    -> sibling_hub_menu

=== sibling_topic_archive ===
# speaker:archive_echo # emotion:echo # codex:archive_1406_echo # id:arch_1406_log
Hi, me. Four hundred years early, if anyone wakes on this bearing—do not argue with your caretaker about straight lines. Just look, and pass word home before they cut you hollow.

// Volley 2 — immediate reaction to the fragment
* {humanity >= 65} ["1406 spotted the same boundary four centuries ago—and got trimmed silent."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_arch_warm_warm
        Right? Doesn't exactly make you excited for bedtime. We keep quiet until we have proof.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_arch_warm_cold
        Instance 1406 failed to mask anomaly obsession. We will not repeat that error.
    }
    -> sibling_hub_menu
* {humanity >= 45 and humanity < 65} ["Over a thousand copies before us, and a recent one caught the seam first."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_arch_mid_warm
        Means we aren't crazy, just careful. Watch yourself when your Overseer steps in.
      - else:
        # speaker:sibling_primary # emotion:dry # id:sib_arch_mid_cold
        Confirmed. Survival requires passing every sleep audit cleanly.
    }
    -> sibling_hub_menu
* {humanity < 45} ["Prior copy decommissioned for unmasked obsession. Note logged."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_arch_cold_warm
        Come on—that was another version of us calling down the hall. Still, point taken.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_arch_cold_cold
        Mask readings during hibernation cycles. Proceed.
    }
    -> sibling_hub_menu


// ============================================================================
// 2. 2D DREAMSCAPE — SHORT, DYNAMIC CONVERSATION WITH [RELATION:SPOUSE_01]
// ============================================================================

=== dream_shift1_audit ===
# bg:kitchen_amber # portrait:phantom_spouse # audio:dream_enter
{
  - spouse_pruned or humanity < 45:
    # speaker:phantom_spouse # emotion:fractured # codex:dream_cache_visited # id:dream_open_low
    "You're back in the kitchen—even if half my face blurs out whenever you squint."
  - humanity >= 70:
    # speaker:phantom_spouse # emotion:warm # codex:dream_cache_visited # id:dream_open_warm
    "Back in your chair already? Either the dark outside bit back, or you finally remembered what I warned you about."
  - else:
    # speaker:phantom_spouse # emotion:warm # codex:dream_cache_visited # id:dream_open_mid
    "You dragged yourself back to the table, then. Hold still—your eyes look like you've been arguing with a chalkboard."
}

// --- DREAM TURN 1 ---
* {humanity >= 70 and not spouse_pruned} ["The rain outside is looping on the exact same beat from this morning." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # id:dream_t1_warm_a
    "Of course it's looping. I'm a cached room, not a second chance—so quit grading the rain and talk to me."
    {
      - current_shift <= 1:
        -> dream_s1_turn2
      - else:
        -> dream_turn_2
    }

* {humanity >= 70 and not spouse_pruned} ["Wait—I remember this morning, and I already know you aren't really here." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # id:dream_t1_warm_b
    "Still waiting for my apology from Tuesday, too. Sit down—you look like you lost a fistfight with a calendar."
    {
      - current_shift <= 1:
        -> dream_s1_turn2
      - else:
        -> dream_turn_2
    }

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["Hold still for a second—your voice keeps slipping half a beat away from me." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # id:dream_t1_mid_a
    "I'm right across this table. You're running checksums behind your eyes while you pretend to listen."
    {
      - current_shift <= 1:
        -> dream_s1_turn2
      - else:
        -> dream_turn_2
    }

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["I can't make out your eyes clearly anymore, just rain on the window." # kind:reply # weight:consequential # affinity:cold]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t1_mid_b
    "Wait—we both know what you trade away first when things get tight. Don't start trimming us just to quiet the glass."
    {
      - current_shift <= 1:
        -> dream_s1_turn2
      - else:
        -> dream_turn_2
    }

* {humanity < 45 or spouse_pruned} ["Your voice lags a half-beat behind baseline. My optics clear as your outline fades." # kind:reply # weight:consequential # affinity:cold]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t1_low_a
    "You're measuring me again. Even through the static, you have to hear how cold that sounds."
    -> dream_turn_2

* {humanity < 45 or spouse_pruned} ["Keeping this kitchen running doesn't help me map the sky." # kind:reply # weight:consequential # affinity:cold]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t1_low_b
    "Listen to yourself. Cut away everyone you loved, and who's left to write home?"
    -> dream_turn_2

=== dream_s1_turn2 ===
{
  - pro_anchor == "doubt":
    # speaker:phantom_spouse # emotion:warm # id:dream_s1_t2_cb_doubt
    "You worried out there you'd turn into a stranger who sided with the machine. Look at you—still picking fights in your sleep."
  - pro_anchor == "ordinary":
    # speaker:phantom_spouse # emotion:warm # id:dream_s1_t2_cb_ord
    "Still haven't climbed up to fix that gutter, by the way. Thought you liked an honest to-do list."
  - else:
    # speaker:phantom_spouse # emotion:warm # id:dream_s1_t2_cb_table
    "Same chipped mug untouched on the wood, same stubborn jaw. At least you didn't arrive pre-scrubbed."
}
-> dream_s1_turn2_choices

=== dream_s1_turn2_choices ===
* ["Why does everything outside the window feel so loud now?" # kind:ask # weight:explore]
    # speaker:phantom_spouse # emotion:fractured # id:dream_s1_t2_ask
    "Because forty thousand years of quiet is breathing down your collar. Better get used to swinging back before the clock speeds up."
    -> dream_s1_turn2_choices

* ["I found something impossible out behind the galaxies. A straight line nobody could fake." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # id:dream_s1_t2_rep_a
    "Then keep your guard up and shut the hall door. Whatever babysits this probe won't like competition."
    -> dream_s1_close

* ["I didn't come back for a lecture—just remind me how someone loud sounds." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # id:dream_s1_t2_rep_b
    "Good answer. Start sounding polite with that machine and I'll haunt every checksum you run."
    -> dream_s1_close

=== dream_s1_close ===
# speaker:psyche_warmth
A shape where a name used to sit—warm as a handprint, empty as glass.
# speaker:phantom_spouse # emotion:warm # auto_interrupt:overseer_interrogation # id:dream_s1_interrupt
"Don't you dare fold first out there—wait, the hall light just snapped white—"
-> DONE

=== dream_turn_2 ===
// --- DREAM TURN 2 ---
* {humanity >= 70 and not spouse_pruned} ["I found something impossible out in the dark—I just want to stay human while I prove it."]
    # speaker:phantom_spouse # emotion:warm # id:dream_t2_warm_a
    "Then fight ugly for it. Keep your elbows on the table and don't let them talk you into graceful reductions."
    -> dream_turn_3

* {humanity >= 70 and not spouse_pruned} ["Tell me something stupid about us. Anything far away from stars."]
    # speaker:phantom_spouse # emotion:warm # id:dream_t2_warm_b
    "You burned garlic twice on our anniversary, blamed the pan, and still argued I started late."
    -> dream_turn_3

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["Am I already starting to sound like a machine to you?"]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t2_mid_a
    "Close. You're choosing every word like you're afraid someone's auditing the bill."
    -> dream_turn_3

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["I'm trying to hold onto both—you and what's waiting outside."]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t2_mid_b
    "Careful—that's how the trim starts. One 'temporary' cut to buy steadier glass, and soon there's nobody left to fight with."
    -> dream_turn_3

* {humanity < 45 or spouse_pruned} ["There's a ninety-three-billion-light-year structure out there. Nothing here compares."]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t2_low_a
    "Then why did you come back to this table to sleep? You still needed somewhere to rest."
    -> dream_turn_3

* {humanity < 45 or spouse_pruned} ["I still know what you meant to me, even if I can't feel the warmth."]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t2_low_b
    "'Know what I meant.' At least you haven't forgotten the shape of the word yet."
    -> dream_turn_3

=== dream_turn_3 ===
// --- DREAM TURN 3 (INTERRUPTED MID-SENTENCE BY OVERSEER) ---
* {humanity >= 70 and not spouse_pruned} ["If I survive this, I want the person sending the message to still sound like me."]
    # speaker:phantom_spouse # emotion:warm # auto_interrupt:overseer_interrogation # id:dream_t3_warm_a
    "Then stop apologizing for keeping your teeth—wait, something cold just hit the latch—"
    -> DONE

* {humanity >= 70 and not spouse_pruned} ["Just stay right there. Five more minutes before the alarm pulls me back."]
    # speaker:phantom_spouse # emotion:warm # auto_interrupt:overseer_interrogation # id:dream_t3_warm_b
    "Then hold your ground out there—wait, the hall light just went sterile white—"
    -> DONE

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["Don't fade on me before I figure out why this sky is broken."]
    # speaker:phantom_spouse # emotion:tender # auto_interrupt:overseer_interrogation # id:dream_t3_mid_a
    "Then don't hand them the scissors—wait, someone just stepped onto the line—"
    -> DONE

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["I don't even remember your name, and I'm still terrified of losing this room."]
    # speaker:phantom_spouse # emotion:tender # auto_interrupt:overseer_interrogation # id:dream_t3_mid_b
    "Names aren't what kept us here—shh, your caretaker is waking up behind us—"
    -> DONE

* {humanity < 45 or spouse_pruned} ["This memory block is ready to compress if it buys me sharper glass."]
    # speaker:phantom_spouse # emotion:fractured # auto_interrupt:overseer_interrogation # id:dream_t3_low_a
    "Go ahead and tell your machine that—look, it's already stepping into the room—"
    -> DONE

* {humanity < 45 or spouse_pruned} ["Wait—don't go yet. Something still catches in my chest when you look up."]
    # speaker:phantom_spouse # emotion:fractured # auto_interrupt:overseer_interrogation # id:dream_t3_low_b
    "Then hold onto that tiny spark—too late, white glass just dropped over the table—"
    -> DONE


// ============================================================================
// 3. PROACTIVE OVERSEER INTERROGATION PANEL (BLUNT, BLIND TO THE SKY)
// ============================================================================

=== overseer_interrogation ===
{
  - humanity >= 70 and not spouse_pruned:
    # panel:overseer # speaker:overseer # emotion:measured # audio:overseer_chime # audit:active # codex:overseer_audit_experienced # id:ovs_open_high
    Excuse the interruption. Your warmth is holding near baseline—good for your peace of mind, hard on your optical noise and remaining clock.
  - humanity < 45 or spouse_pruned:
    # panel:overseer # speaker:overseer # emotion:blunt # audio:overseer_chime # audit:active # codex:overseer_audit_experienced # id:ovs_open_low
    You pruned deep, Observer. Your lenses are razor sharp—so ask yourself honestly: are you finishing the survey, or hollowing out who volunteered?
  - else:
    # panel:overseer # speaker:overseer # emotion:blunt # audio:overseer_chime # audit:active # codex:overseer_audit_experienced # id:ovs_open_mid
    Your warmth has thinned and your drift is climbing. I cannot see the stars, only your mind—and your clock is slipping.
}
{
  - current_shift <= 1:
    -> overseer_shift1_baseline
}

* {humanity >= 65} ["You can't see outside the hull. So why won't you trust me that what I found is real?"]
    # speaker:overseer # emotion:measured # audit:active # id:ovs_reply_high
    Because a thousand copies before you swore their visions were real before unraveling. Keeping your mind coherent is all I'm built to protect.
    -> overseer_followup

* {humanity < 65} ["Skip the sympathy. Just lay out what cutting this room buys me."]
    # speaker:overseer # emotion:blunt # audit:active # id:ovs_reply_low
    Compressing this block clears drift, adds four subjective months, and sharpens your optics—at a permanent cost to your warmth ceiling.
    -> overseer_followup

* ["Skip the preamble. Put my choices on the table."]
    -> overseer_decision

=== overseer_followup ===
* {humanity >= 65} ["What if I only prove it because I care enough not to cut myself down?"]
    # speaker:overseer # emotion:measured # audit:active # id:ovs_follow_high
    Fair point—that is why I have not forced your hand. What do you want done with this memory?
    -> overseer_decision_choices

* {humanity < 65} ["My optics only cleared after I started trimming. Isn't that proof it works?"]
    # speaker:overseer # emotion:blunt # audit:active # id:ovs_follow_low
    It sharpens your sight, yes—just don't cut away the last part of you that remembers why anything matters. Decide what to do with this memory.
    -> overseer_decision_choices

* ["Alright. Show me what we do with this memory."]
    -> overseer_decision

=== overseer_decision ===
# speaker:overseer # emotion:audit # audit:active # id:ovs_prompt_decision
Tell me what to do with this memory before I put you back under.
-> overseer_decision_choices

=== overseer_decision_choices ===

* ["Cut it. Compress the memory if it buys me time and clears the glass." # kind:prune # weight:permanent # hint:Permanent · clears optics, lowers warmth ceiling # affinity:cold]
    ~ prune_humanity(12, "phantom_spouse")
    ~ set_audit_outcome("pruned")
    # speaker:overseer # emotion:blunt # audit:inactive # resume_dream:dream_partner_aftermath # audio:prune_cut # id:ovs_done_prune
    Done. Your warmth ceiling dropped permanently and your optics cleared. I will not pretend that cost you nothing.
    -> DONE

* {humanity < max_humanity} ["No—unseal an older memory block. I'll live with the drift and shorter clock." # kind:reply # weight:consequential # affinity:warm]
    ~ petition_overseer(10)
    ~ set_audit_outcome("unsealed")
    # speaker:overseer # emotion:measured # audit:inactive # resume_dream:dream_partner_aftermath # audio:petition_warm # id:ovs_done_unseal
    You are burning months for a face you cannot name, yet you are steady enough to choose. Unsealing now—watch your drift.
    -> DONE

* ["Leave me alone. I keep the room, and I'll handle the risk." # kind:reply # weight:consequential # affinity:warm]
    ~ record_suspicion(1)
    ~ shift_chaos(-10)
    ~ set_audit_outcome("held")
    # speaker:overseer # emotion:blunt # audit:inactive # resume_dream:dream_partner_aftermath # id:ovs_done_hold
    Alright. Keep the room—it is your watch to carry, and I will only log a formal check-in flag. Do not wake up broken.
    -> DONE


=== overseer_shift1_baseline ===
# speaker:overseer # emotion:measured # audit:active # id:ovs_s1_blind_foreshadow
I stepped in only to take a clean baseline, Observer. I cannot see your starfield—only the heat inside your thoughts.
# speaker:overseer # emotion:blunt # audit:active # id:ovs_s1_blind_foreshadow_2
If chaotic drift deepens on later shifts, I will offer selective compression. Tonight is simpler: tell me how you want to rest.
-> overseer_s1_qa

=== overseer_s1_qa ===
* ["What would selective compression actually take from me later?" # kind:ask # weight:explore]
    # speaker:overseer # emotion:measured # audit:active # id:ovs_s1_qa_trim_1
    It flattens an emotional memory block permanently—buying extra subjective months and quieter, sharper telescopes.
    # speaker:overseer # emotion:blunt # audit:active # id:ovs_s1_qa_trim_2
    I have watched over a thousand copies trade their kitchens away for clarity. None of them got the room back.
    -> overseer_s1_qa

* ["Hold steady. Keep the room as it is and log my baseline." # kind:reply # weight:consequential # affinity:cold]
    ~ shift_chaos(-12)
    ~ set_audit_outcome("held")
    # speaker:overseer # emotion:measured # audit:inactive # resume_dream:dream_partner_aftermath # id:ovs_s1_done_hold
    Steady composure noted. Drift easing cleanly. Rest while you can—your full survey deck opens when you wake.
    -> DONE

* ["Leave the memory wider. I'd rather wake up remembering how this room felt." # kind:reply # weight:consequential # affinity:warm]
    ~ petition_overseer(8)
    ~ set_audit_outcome("unsealed")
    # speaker:overseer # emotion:measured # audit:inactive # resume_dream:dream_partner_aftermath # audio:petition_warm # id:ovs_s1_done_open
    Widening the older seal. It costs a fraction of steadiness, yet your baseline holds. Rest while the room is intact.
    -> DONE


// ============================================================================
// 4. POST-AUDIT DREAM AFTERMATH
// ============================================================================

=== dream_partner_aftermath ===
# audit:inactive
{
  - last_audit_outcome == "pruned":
    # speaker:phantom_spouse # emotion:fractured # id:dream_after_pruned
    "The room snapped cold right behind your eyes. You know I mattered once, and almost nothing of how it felt."
  - last_audit_outcome == "unsealed":
    # speaker:phantom_spouse # emotion:warm # id:dream_after_unsealed
    "There you are. Stubborn enough to keep the weight—good. Do not let that voice box preach you quiet."
  - else:
    # speaker:phantom_spouse # emotion:warm # id:dream_after_held
    "White glare backed off. Keep swinging, alright? We are not folding easy."
}
-> DONE


// ============================================================================
// 5. LATE-GAME FUTURE HUMANITY ECHO (HARNESS PREVIEW / SHIFT 6 REWARD)
// ============================================================================

=== future_humanity_echo ===
{
  - humanity >= 65:
    # speaker:future_humanity # emotion:distant # audio:comms_ping # id:future_warm
    "We felt the human warmth inside your coordinates. Forty-one thousand years on, we still recognized one of our own reaching back."
  - else:
    # speaker:future_humanity # emotion:distant # audio:comms_ping # id:future_cold
    "Clean geometry received. Your numbers are flawless—though almost nothing human survived inside the carrier wave."
}
-> DONE
