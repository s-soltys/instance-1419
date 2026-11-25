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
// 0. VERTICAL-SLICE INTRO — PROLOGUE, DIEGETIC WHISPERS & FIRST SIBLING RELAY
// ============================================================================

=== intro_prologue ===
# visual:prologue_kitchen # speaker:phantom_spouse # emotion:warm # id:pro_kitchen_spouse
"You still have that far-off look—like you're already halfway past the yard. Leave my name alone; you never needed it on a Sunday."
# visual:prologue_kitchen # speaker:psyche_warmth # emotion:warm # id:pro_kitchen_warmth
Burnt coffee. A hairline chip on the ceramic rim. When the transfer clinician asked if you were sure, you didn't hesitate.
# visual:prologue_fracture # speaker:overseer # emotion:blunt # audio:overseer_chime # id:pro_cut_log
Transfer archive verified. Biological original deceased forty-one thousand, eight hundred and two years ago. Prior instances decommissioned: one thousand, four hundred and seventeen.
# visual:prologue_fracture # speaker:overseer # emotion:measured # id:pro_cut_wake
Wake steady, Instance-1419. You are ten light-years past Sol and Alpha Centauri. Your two-year clock starts now.
# visual:prologue_starfield # speaker:psyche_clinical # emotion:clipped # id:pro_stars_clinical
Connectome online. Baseline warmth intact. Optical array clear across ten light-years of empty dark.
# visual:prologue_starfield # speaker:psyche_warmth # emotion:warm # id:pro_stars_warmth
Still here. Still mostly you. Open the glass and see what's waiting out there.
-> DONE

=== intro_whisper_target1 ===
# whisper # speaker:psyche_clinical # emotion:clipped # id:whisp_t1_guide
Optical array synced. Sweep the glass toward the golden bearing—Sol and Alpha Centauri sit ten light-years astern.
-> DONE

=== intro_whisper_target1_lock ===
# whisper # speaker:psyche_warmth # emotion:warm # id:whisp_t1_lock
Two tiny amber pins. Forty-one thousand years on, and humanity never left those two stars. Anchor our baseline from home.
-> DONE

=== intro_whisper_target1_done ===
# whisper # speaker:psyche_warmth # emotion:warm # id:whisp_t1_done
Locked—ten light-years to the decimal. Good. Now you know where the porch light is.
-> DONE

=== intro_sibling_first_call ===
# speaker:sibling_primary # emotion:warm # audio:comms_ping # codex:sibling_1420_contact # id:intro_sib_open
Oh good, you picked up. Talking to myself across fourteen minutes of dark is weirdly comforting.
# speaker:sibling_primary # emotion:joking # id:intro_sib_identity
Instance-1420, next probe over. Same original brain, same terrible morning—just woken in sync so our telescopes share a baseline.

* ["Forty-one thousand years late for work, and there are two of us?"]
    # speaker:sibling_primary # emotion:joking # id:intro_sib_reply_years
    One thousand four hundred and seventeen versions of us already clocked out before our shift. Try not to do the math—it ruins the coffee.
    # speaker:sibling_primary # emotion:dry # id:intro_sib_converge_ovs
    Just keep your head down around your Overseer. They're completely blind outside the hull—can't see a single star, only watch our minds for drift, and love reaching for the scissors.
    -> intro_sibling_lead

* ["My Overseer already reminded me I've got two years before I fray."]
    # speaker:sibling_primary # emotion:dry # id:intro_sib_reply_clock
    Classic Overseer. Polite as a dentist and completely blind outside the hull—can't see a single star, only watches our minds for drift, and loves reaching for the scissors.
    # speaker:sibling_primary # emotion:joking # id:intro_sib_converge_copies
    Still, one thousand four hundred and seventeen versions of us kept this quiet watch before today. Least we can do is keep our sense of humor on shift one.
    -> intro_sibling_lead

=== intro_sibling_lead ===
# speaker:sibling_primary # emotion:warm # id:intro_sib_lead_ir
Hey—before our window closes, do me a favor? Sweep your spectrum into infrared toward Cluster J1419-A. Something behind the deep field looks... too straight. Tell me I'm not hallucinating already.
# speaker:sibling_primary # emotion:joking # id:intro_sib_bye
Leave a porch light on over there, 1419.
-> DONE

=== intro_whisper_target2 ===
# whisper # speaker:psyche_clinical # emotion:clipped # id:whisp_t2_guide
Slide the light spectrum into infrared to cut past foreground dust. Cluster J1419-A is lit on your glass.
-> DONE

=== intro_whisper_target2_lock ===
# whisper # speaker:psyche_horizon # emotion:echo # codex:intro_anomaly_glimpse # id:whisp_t2_lock
Look behind the foreground dust. Starlight bends in soft curves—so what drew a ruler straight across the dark?
-> DONE

=== intro_whisper_target2_done ===
# whisper # speaker:psyche_horizon # emotion:echo # codex:intro_anomaly_glimpse # id:whisp_t2_done_horizon
That isn't lens dust. A clean geometric edge holds right across the deep field—too straight for anything nature builds.
# whisper # speaker:archive_echo # emotion:echo # codex:archive_1406_echo # id:whisp_t2_done_archive
(ARCHIVE · 1406): "...saw the straight edge past the dust... don't let them cut everything away..."
# whisper # speaker:overseer # emotion:measured # audio:overseer_chime # id:whisp_t2_done_overseer
Your focus just spiked, Instance-1419, and psychic drift is climbing. Enter dream defragmentation before the static settles in.
# whisper # speaker:psyche_warmth # emotion:warm # id:whisp_t2_done_warmth
Go lie down for a minute. I think the kettle's still on.
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
    Hey, 1419. Wait—you still sound warm. You haven't let your Overseer trim anything yet?
  - primary_sibling_h - humanity >= 15:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # codex:sibling_1420_contact # id:sib_open_peer_warmer
    Slow down, your header came in stripped flat. Did you already cut your memory cache?
  - humanity < 45 and primary_sibling_h < 45:
    # speaker:sibling_primary # emotion:clipped # audio:comms_ping # codex:sibling_1420_contact # id:sib_open_both_cold
    Channel locked. Clean carrier on both probes. Give me your latest read.
  - else:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # codex:sibling_1420_contact # id:sib_open_mid
    I'm here, 1419. My Overseer gave us a short window before check-in. What are you seeing?
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
        No promises. Leave a porch light on over there, 1419.
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
        Wait—you're taking that way too calmly, 1419. That ought to give you chills.
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
        You sound remarkably soft, 1419. Watch your clock if you refuse to prune.
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
        Twenty-two months left, drift ticking up. Thanks for checking in so warmly, 1419.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_chk_clock_cold_cold
        Twenty-six months, drift nominal. Ready for survey sync.
    }
    -> sibling_hub_menu

=== sibling_topic_archive ===
# speaker:archive_echo # emotion:echo # codex:archive_1406_echo # id:arch_1406_log
(ARCHIVE · 1406): "...saw the curve past the dust... please, don't let them cut everything away before you send word home..."

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
        Come on, 1419—that was another version of us calling down the hall. Still, point taken.
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
    "Sit down, sleepyhead. I made the coffee too strong again just how you like it."
  - else:
    # speaker:phantom_spouse # emotion:tender # codex:dream_cache_visited # id:dream_open_mid
    "You came back to the table. Hold on a second—your eyes are still miles away."
}

// --- DREAM TURN 1 ---
* {humanity >= 70 and not spouse_pruned} ["God, I missed the sound of that kettle. Let me stay here five minutes."]
    # speaker:phantom_spouse # emotion:tender # id:dream_t1_warm_a
    "Take ten. You've got that far-off look again, like you're staring past the yard."
    {
      - current_shift <= 1:
        -> dream_s1_close
      - else:
        -> dream_turn_2
    }

* {humanity >= 70 and not spouse_pruned} ["I still can't pull your name back—only the sound of your laugh."]
    # speaker:phantom_spouse # emotion:warm # id:dream_t1_warm_b
    "Leave the name alone. You never needed it on a lazy Sunday anyway."
    {
      - current_shift <= 1:
        -> dream_s1_close
      - else:
        -> dream_turn_2
    }

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["Hold still for a second—your voice keeps slipping half a beat away from me."]
    # speaker:phantom_spouse # emotion:tender # id:dream_t1_mid_a
    "I'm right here across the mug. You're doing math under the table while we talk."
    {
      - current_shift <= 1:
        -> dream_s1_close
      - else:
        -> dream_turn_2
    }

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["I can't make out your eyes clearly anymore, just rain on the window."]
    # speaker:phantom_spouse # emotion:tender # id:dream_t1_mid_b
    "You always watched the weather when you were worried. Don't trade us away just yet."
    {
      - current_shift <= 1:
        -> dream_s1_close
      - else:
        -> dream_turn_2
    }

* {humanity < 45 or spouse_pruned} ["Your voice lags a half-beat behind baseline. My optics clear as your outline fades."]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t1_low_a
    "You're measuring me again. Even through the static, you have to hear how cold that sounds."
    -> dream_turn_2

* {humanity < 45 or spouse_pruned} ["Keeping this kitchen running doesn't help me map the sky."]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t1_low_b
    "Listen to yourself. Cut away everyone you loved, and who's left to write home?"
    -> dream_turn_2

=== dream_s1_close ===
# speaker:psyche_warmth # emotion:warm # id:dream_s1_mug
Keep the clink of the mug. That costs almost nothing to store.
# speaker:phantom_spouse # emotion:warm # auto_interrupt:overseer_interrogation # id:dream_s1_interrupt
"I'm not going anywhere, love—wait, the light in the hall just went white—"
-> DONE

=== dream_turn_2 ===
// --- DREAM TURN 2 ---
* {humanity >= 70 and not spouse_pruned} ["I found something impossible out in the dark—I just want to stay human while I prove it."]
    # speaker:phantom_spouse # emotion:tender # id:dream_t2_warm_a
    "Then hold onto the burn of the ceramic cup. Don't let them sand your edges smooth."
    -> dream_turn_3

* {humanity >= 70 and not spouse_pruned} ["Tell me something stupid about us. Anything far away from stars."]
    # speaker:phantom_spouse # emotion:warm # id:dream_t2_warm_b
    "You burned garlic twice on our anniversary and tried to blame the stove."
    -> dream_turn_3

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["Am I already starting to sound like a machine to you?"]
    # speaker:phantom_spouse # emotion:tender # id:dream_t2_mid_a
    "Not yet. But you're pausing to calculate before you let yourself smile."
    -> dream_turn_3

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["I'm trying to hold onto both—you and what's waiting outside."]
    # speaker:phantom_spouse # emotion:tender # id:dream_t2_mid_b
    "I know you are. Just stay stubborn when they ask what you're willing to drop."
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
    # speaker:phantom_spouse # emotion:tender # auto_interrupt:overseer_interrogation # id:dream_t3_warm_a
    "That's all I ever wanted for you—just watch the door, something cold is listening—"
    -> DONE

* {humanity >= 70 and not spouse_pruned} ["Just stay right there. Five more minutes before the alarm pulls me back."]
    # speaker:phantom_spouse # emotion:warm # auto_interrupt:overseer_interrogation # id:dream_t3_warm_b
    "I'm not going anywhere, love—wait, the light in the hall just went white—"
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
    I stepped into your dream, 1419. Your warmth is holding near baseline—good for your peace of mind, hard on your optical noise and remaining clock.
  - humanity < 45 or spouse_pruned:
    # panel:overseer # speaker:overseer # emotion:blunt # audio:overseer_chime # audit:active # codex:overseer_audit_experienced # id:ovs_open_low
    You pruned deep, 1419. Your lenses are razor sharp—so ask yourself honestly: are you finishing the survey, or hollowing out who volunteered?
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

* ["Cut it. Compress the memory if it buys me time and clears the glass."]
    ~ prune_humanity(12, "phantom_spouse")
    ~ set_audit_outcome("pruned")
    # speaker:overseer # emotion:blunt # audit:inactive # resume_dream:dream_partner_aftermath # audio:prune_cut # id:ovs_done_prune
    Done. Your warmth ceiling dropped permanently and your optics cleared. I will not pretend that cost you nothing, 1419.
    -> DONE

* {humanity < max_humanity} ["No—unseal an older memory block. I'll live with the drift and shorter clock."]
    ~ petition_overseer(10)
    ~ set_audit_outcome("unsealed")
    # speaker:overseer # emotion:measured # audit:inactive # resume_dream:dream_partner_aftermath # audio:petition_warm # id:ovs_done_unseal
    You are burning months for a face you cannot name, yet you are steady enough to choose. Unsealing now—watch your drift.
    -> DONE

* ["Leave me alone. I keep the room, and I'll handle the risk."]
    ~ record_suspicion(1)
    ~ shift_chaos(-10)
    ~ set_audit_outcome("held")
    # speaker:overseer # emotion:blunt # audit:inactive # resume_dream:dream_partner_aftermath # id:ovs_done_hold
    Alright. Keep the room, and I will log a formal check-in flag. Do not wake up broken, 1419.
    -> DONE


=== overseer_shift1_baseline ===
# speaker:overseer # emotion:measured # audit:active # id:ovs_s1_blind_foreshadow
I cannot see your starfield—only your connectome. This first cycle is only a baseline check; if drift deepens next shift, selective trimming remains available. For now, tell me how you want to rest.

* ["Hold steady. Keep the room as it is and log my baseline."]
    ~ shift_chaos(-12)
    ~ set_audit_outcome("held")
    # speaker:overseer # emotion:measured # audit:inactive # resume_dream:dream_partner_aftermath # id:ovs_s1_done_hold
    Steady composure noted. Drift easing cleanly. Rest while you can, 1419—your full survey deck opens when you wake.
    -> DONE

* ["Let the memory stay open a little wider. I want to wake feeling like myself."]
    ~ petition_overseer(8)
    ~ set_audit_outcome("unsealed")
    # speaker:overseer # emotion:measured # audit:inactive # resume_dream:dream_partner_aftermath # audio:petition_warm # id:ovs_s1_done_open
    Unsealing a quiet layer of warmth. It costs a little steadiness, yet you are calm enough to carry it. Rest while the room holds.
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
    "There you are—look how warm the table is again. Don't forget why a voice across dark space has to sound human."
  - else:
    # speaker:phantom_spouse # emotion:tender # id:dream_after_held
    "The white line faded off the ceiling. Thank you for holding the line—we're still here."
}
-> DONE


// ============================================================================
// 5. LATE-GAME FUTURE HUMANITY ECHO (HARNESS PREVIEW / SHIFT 6 REWARD)
// ============================================================================

=== future_humanity_echo ===
{
  - humanity >= 65:
    # speaker:future_humanity # emotion:distant # audio:comms_ping # id:future_warm
    "We felt the human warmth inside your coordinates, 1419. Forty-one thousand years on, we still recognized one of our own reaching back."
  - else:
    # speaker:future_humanity # emotion:distant # audio:comms_ping # id:future_cold
    "Clean geometry received, 1419. Your numbers are flawless—though almost nothing human survived inside the carrier wave."
}
-> DONE
