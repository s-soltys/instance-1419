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
// 0. VERTICAL-SLICE INTRO — LAB ASSISTANT CALIBRATION, OVERSEER HANDOFF & RELAY
// ============================================================================

=== intro_prologue_assistant ===
# visual:prologue_assistant # tableau:base # h_wave:hold_100 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_open_1
"Easy. Don't sit up yet—give your eyes a second to catch up to the lamp."
# visual:prologue_assistant # tableau:base # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_open_2
"Everyone looks at their hands first. Then the paper cup, then the window, trying to place the hum."
# visual:prologue_assistant # tableau:base # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_open_3
"Take a breath. The clinic was still loud ten minutes ago, and now it isn't. Give your head time to settle."

* ["The light feels strange... like looking at a room I already left." # kind:reply # weight:explore]
    # visual:prologue_assistant # tableau:base # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_c1_a1
    "Good. That means the recording held onto the edges, not just the middle."
    # visual:prologue_assistant # tableau:base # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_c1_a2
    "I'm the intake assistant on the desk. My only job right now is to stay until the room stops swimming."
    -> intro_prologue_assistant_realize

* ["Where did everyone else go? My coat was on the back of a chair." # kind:reply # weight:explore]
    # visual:prologue_assistant # tableau:base # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_c1_b1
    "Your coat went back out the front door into the rain. Give yourself a minute before you reach for it."
    # visual:prologue_assistant # tableau:base # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_c1_b2
    "I'm the intake assistant who sat across from you with the forms. Nobody's rushing you off this chair."
    -> intro_prologue_assistant_realize

* ["My throat feels wrong when I try to swallow. Did the procedure already finish?" # kind:reply # weight:explore]
    # visual:prologue_assistant # tableau:base # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_c1_c1
    "It finished cleanly. That phantom catch in your chest usually fades once you stop checking for a pulse."
    # visual:prologue_assistant # tableau:base # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_c1_c2
    "I'm the intake assistant who walked you through the consent sheets. Let's take this slow."
    -> intro_prologue_assistant_realize

=== intro_prologue_assistant_realize ===
# visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_mid_1
"An hour ago, someone with your exact laugh signed page twelve, complained about our burnt coffee, and walked back down to the train."
# visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_mid_2
"Do you remember catching that train home—or does the memory stop right at the ink drying on the paper?"
# visual:prologue_assistant # tableau:beat2 # speaker:psyche_warmth
You remember the rain on the awning outside the clinic, and nothing on the street beyond it.
-> intro_assistant_qa_1

=== intro_assistant_qa_1 ===
* ["Hold on. If someone walked back to the train... what does that make me?" # kind:ask # weight:explore]
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa1_copy_1
    "It makes you the person who stayed in the chair when the door closed."
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa1_copy_2
    "You remember every Tuesday up to that signature, and you're real enough to argue with me about the coffee."
    -> intro_assistant_qa_1

* ["Wait—if I'm a copy, could there be other versions of me waking up later without knowing?" # kind:ask # weight:explore]
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa1_many_1
    "Yes. Once a mind clears calibration, each waking copy carries its own blank stretch ahead of it."
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa1_many_2
    "Another version of you might wake up tomorrow—or far later—with no memory of you sitting here."
    -> intro_assistant_qa_1

* ["Why did I even sign up for this? I can't quite put my finger on the reason." # kind:ask # weight:explore]
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa1_why_1
    "You left the 'motivation' box blank on page four. Most volunteers do, honestly."
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa1_why_2
    "Nobody here expects a grand speech about why you stepped into the clinic. Only whether you're steady now."
    -> intro_assistant_qa_1

* ["I remember the table at home before I left. Someone told me not to go quiet." # kind:reply # weight:consequential # affinity:warm]
    ~ pro_anchor = "table"
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_r2_a1
    "Good. Hold onto whoever waited at that kitchen table—even the sharp edges."
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_r2_a2
    "Are you ready for a long stretch where nobody from that table can pick up the phone?"
    -> intro_prologue_assistant_calib

* ["It stops at the ink. That means another version of me could wake up anywhere—and forget me." # kind:reply # weight:consequential # affinity:cold]
    ~ pro_anchor = "doubt"
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_r2_b1
    "That is the quiet bargain nobody really feels until the lamp clicks on."
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_r2_b2
    "Each version starts from this morning, then walks alone. Are you sure you still want to carry it?"
    -> intro_prologue_assistant_calib

* ["Tell me what waking up actually means—no polite clinic phrasing." # kind:reply # weight:consequential # affinity:warm]
    ~ pro_anchor = "ordinary"
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_r2_c1
    "It means waking into a quiet room long after this rain stops, with no clock you recognize."
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_r2_c2
    "Sometimes in places where nobody remembers how leaky a porch gutter sounds. Think you're ready for that?"
    -> intro_prologue_assistant_calib

=== intro_prologue_assistant_calib ===
# visual:prologue_assistant # tableau:beat3_strained # h_wave:sweep # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_cal_1
"Before I hand you off, I have to run the initial warmth calibration—right now you're sitting at full hundred percent."
# visual:prologue_assistant # tableau:beat3_strained # h_wave:sweep # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_cal_2
"Watch the room as I sweep the dial down and back up. Feel how the edges thin when warmth drops."
# visual:prologue_assistant # tableau:beat3_strained # h_wave:sweep # speaker:phantom_upload_witness # emotion:fractured # id:pro_ast_cal_3
"This is only the baseline check. Later on, your own choices will decide how warm—or how sharp—you stay."

* ["Stop—the room goes completely dead when it drops. Everything turns into cold glass." # kind:reply # weight:consequential # affinity:warm]
    # visual:prologue_assistant # tableau:beat3_warm # h_wave:settle_70 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_cal_a1
    "I know. That's why we bring it back before we finish."
    # visual:prologue_assistant # tableau:beat3_warm # h_wave:settle_70 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_cal_a2
    "Remember that chill if anyone ever asks you to trim memory away for a cleaner view."
    -> intro_prologue_assistant_settle

* ["Weirdly, my head felt clearer down near the bottom. Quieter, like less noise." # kind:reply # weight:consequential # affinity:cold]
    # visual:prologue_assistant # tableau:beat3_warm # h_wave:settle_70 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_cal_b1
    "It always feels efficient at the low end. That's the trap—clean focus, empty walls."
    # visual:prologue_assistant # tableau:beat3_warm # h_wave:settle_70 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_cal_b2
    "Don't mistake quietness for peace before you've even started your shift."
    -> intro_prologue_assistant_settle

* ["Wait—at the low point, I couldn't recall the names of anyone I care about." # kind:reply # weight:consequential # affinity:warm]
    # visual:prologue_assistant # tableau:beat3_warm # h_wave:settle_70 # speaker:phantom_upload_witness # emotion:fractured # id:pro_ast_cal_c1
    "I'm sorry. Personal names were already stripped out during compression so your memory won't tangle."
    # visual:prologue_assistant # tableau:beat3_warm # h_wave:settle_70 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_cal_c2
    "You still keep the weight of who they are—and the warmth to remember why they mattered."
    -> intro_prologue_assistant_settle

=== intro_prologue_assistant_settle ===
# visual:prologue_assistant # tableau:beat3_warm # h_wave:settle_70 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_settle_1
"Settling you at a steady seventy percent now. Warm enough to stay yourself, steady enough to wake."
# visual:prologue_assistant # tableau:beat3_warm # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_settle_2
"I'm just the bridge between your last morning and whatever waits on the other side of the glass. Ask what you need."
-> intro_assistant_qa_2

=== intro_assistant_qa_2 ===
* ["Do you even know where my copy is going to wake up?" # kind:ask # weight:explore]
    # visual:prologue_assistant # tableau:beat3_warm # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa2_where_1
    "No—they never put the assignment on the intake clipboard."
    # visual:prologue_assistant # tableau:beat3_warm # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa2_where_2
    "Once you're in the standard catalog, you could wake up running a shipping bay—or somewhere much quieter."
    -> intro_assistant_qa_2

* ["Will I ever see this room—or you—again after tonight?" # kind:ask # weight:explore]
    # visual:prologue_assistant # tableau:beat3_warm # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa2_see_1
    "Hard to say. If your mind keeps a corner for an intake desk and a cold paper cup, maybe."
    # visual:prologue_assistant # tableau:beat3_warm # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa2_see_2
    "Either way, look after whoever's in that chair when things get quiet."
    -> intro_assistant_qa_2

* ["I'm as ready as I'm going to get. Start the handoff." # kind:action # weight:consequential]
    -> intro_prologue_assistant_close

* ["Keep the lamp on a second longer... alright. Let's go." # kind:action # weight:consequential]
    -> intro_prologue_assistant_close

=== intro_prologue_assistant_close ===
# visual:prologue_assistant # tableau:beat3_warm # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_close_1
"Everything checks out. Take a slow breath—someone else is waiting on the other side of the wake signal."
# visual:prologue_assistant # speaker:psyche_warmth
You try to memorize the hum of the clinic lamp before the floor drops away beneath the chair.
# visual:prologue_assistant # speaker:psyche_clinical
Initial calibration complete. Baseline warmth locked at 70%. Transferring to active watch caretaker.
-> DONE

=== intro_overseer_wakeup ===
# visual:prologue_wakeup # anim:anim_transfer # speaker:overseer # emotion:measured # audio:overseer_chime # id:wake2_anim_transfer
Good morning. Take your time—the intake assistant brings everyone in gently, and the shift into cold wake always jars a little.
# visual:prologue_wakeup # anim:anim_transfer # speaker:overseer # emotion:measured # id:wake2_anim_transfer_2
When you volunteered, your mind became standardized human software—an ordinary blueprint copied wherever a steady pair of eyes is needed.
# visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:blunt # id:wake2_anim_epochs
Millions of versions of you wake up back home every day to run transit hubs, greenhouses, and cargo bays for a few hours at a time.
# visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake2_anim_epochs_2
Your assignment is rarer, and much further out. Your original died forty-one thousand, eight hundred and two years ago; you are watch fourteen-nineteen.
# visual:prologue_wakeup # speaker:psyche_warmth
Somewhere beneath the quiet floor, forty-one millennia land like snow on an empty porch.

* ["Millions of copies of me running warehouses back home, and I drew deep space?" # kind:reply # weight:explore]
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake2_c1_a1
    Most tasks only need an afternoon of human judgment. Deep surveys ask for someone who can sit still for two years without breaking.
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:blunt # id:wake2_c1_a2
    The intake room felt familiar on purpose—just a quiet threshold before you look outside.
    -> intro_overseer_wakeup_shell

* ["Wait—so I wasn't built just for this ship. I'm a standard template." # kind:reply # weight:explore]
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake2_c1_b1
    Yes. Back in Sol and Alpha Centauri, your mind is as common as a working wrench—woken for hours, then cleared at shift end.
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:blunt # id:wake2_c1_b2
    Out here you get a whole life's breathing room, a companion hull nearby, and an empty sky.
    -> intro_overseer_wakeup_shell

* ["Forty-one thousand years... alright. Show me where I actually am." # kind:reply # weight:explore]
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake2_c1_c1
    Steady recovery. Better to put the whole map in plain sight than dress it up.
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake2_c1_c2
    Here is where the hull sits, and how our small arrangement works.
    -> intro_overseer_wakeup_shell

=== intro_overseer_wakeup_shell ===
# visual:prologue_wakeup # anim:anim_shell # speaker:overseer # emotion:measured # id:wake2_anim_shell
We are drifting ten light-years past Sol and Alpha Centauri—far outside home's glare and radio chatter, in quiet deep dark.
# visual:prologue_wakeup # anim:anim_shell # speaker:overseer # emotion:measured # id:wake2_anim_shell_2
Fourteen light-minutes away, another version of you woke aboard Probe 1420 so your telescopes can compare notes across the dark.
# visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:blunt # id:wake2_anim_blind_clock
One odd rule of this hull: I am sealed off from the windows. I cannot see a single star outside.
# visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake2_anim_blind_clock_2
My only job is watching the health of your mind across a two-year shift. Ask whatever sits heavy before I open the sky.
-> intro_wakeup_qa

=== intro_wakeup_qa ===
* ["What are those millions of everyday copies back home actually like?" # kind:ask # weight:explore]
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake2_qa_copies_1
    Short-lived shifts—sorting freight, routing ferries, tending orbital glass. Most run stripped down so they never ache for a kitchen.
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:blunt # id:wake2_qa_copies_2
    Out here, automation couldn't bridge twenty-year silence alone, so you woke with your warmth intact.
    -> intro_wakeup_qa

* ["Why did fourteen hundred copies take forty-one thousand years if each lasts two years?" # kind:ask # weight:explore]
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake2_qa_math_1
    A human mind frays after roughly two subjective years, so each shift sleeps for decades in cold dark between active watches.
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake2_qa_math_2
    Quiet sleep settles that strain—unless drift climbs high enough that we have to trim a memory block to buy more time.
    -> intro_wakeup_qa

* ["What happened to everyone back in Sol over forty thousand years?" # kind:ask # weight:explore]
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake2_qa_home_1
    Navigation beacons confirm humanity is still alive inside Sol and Alpha Centauri, though nobody monitors old survey bands anymore.
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:blunt # id:wake2_qa_home_2
    How they changed over forty millennia isn't in our logs. You're a pair of eyes from the deep past; the sky only needs you looking.
    -> intro_wakeup_qa

* ["Why can't you look through the telescopes yourself?" # kind:ask # weight:explore]
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:blunt # id:wake2_qa_blind_1
    A physical air-gap keeps me blind to the sky, so a drifting mind can never trick safety hardware with what it claims to see.
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake2_qa_blind_2
    I only watch your steadiness and your clock. You read the glass; I keep you in one piece while you do.
    -> intro_wakeup_qa

* ["I'm ready. Open the sky." # kind:action # weight:consequential]
    -> intro_overseer_wakeup_aperture

=== intro_overseer_wakeup_aperture ===
# visual:prologue_wakeup # anim:anim_aperture # speaker:overseer # emotion:measured # id:wake2_anim_aperture
Opening main optics. Start with the warm amber bearing astern—Sol and Alpha Centauri—and trace the anchor stars to verify alignment.
# visual:prologue_wakeup # anim:anim_aperture # speaker:overseer # emotion:measured # id:wake2_anim_aperture_2
Probe 1420's relay will open as soon as your first bearing locks clean.
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
    Straight to the hardware? Right—two amber specks, ten years astern. Calibration locked without a hitch.
    # speaker:sibling_primary # emotion:warm # id:intro_sib_c1_c2
    Still feels strange calling that home when everyone we knew turned to topsoil forty millennia back. Give me a beat to be morbid.
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
# speaker:sibling_primary # emotion:dry # id:intro_sib_lead_ir_v2
Sending the bearing now: Cluster J1419-A. Sweep into near-infrared and catch the pulsar sweep spinning beside the cluster.
# speaker:sibling_primary # emotion:dry # id:intro_sib_lead_ir_2
Gravity bends light into curves, other me. Whatever sits behind those galaxies has hair-thin nested notches repeating along a dead straight line.
# speaker:sibling_primary # emotion:joking # id:intro_sib_bye
If your Overseer asks why your heart rate spiked, blame the coffee. Keep your eyes on the glass.
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
    I see your carrier packet clearly, other me. My buffer runs much quieter now—read me your coordinates.
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
* {not topic_seam_done and humanity < 45} ["I confirmed the J1419-A seam. Does your glass repeat the same notch?"]
    ~ topic_seam_done = true
    -> sibling_topic_seam

// Topic 2: How you're both holding up
* {not topic_check_in_done and humanity >= 65} ["Forty-one thousand years late for work, and we're squaring off with the dark. Holding up alright?"]
    ~ topic_check_in_done = true
    -> sibling_topic_checkin
* {not topic_check_in_done and humanity >= 45 and humanity < 65} ["How are things on your end? Your Overseer riding you as hard as mine?"]
    ~ topic_check_in_done = true
    -> sibling_topic_checkin
* {not topic_check_in_done and humanity < 45} ["The mug memory still loads cleanly, just without the weight. How is your clock holding?"]
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
        No promises. Ping me if the horizon blinks first.
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
    Oh, I see it alright. Galaxies don't clip along a ruler edge with tiny nested notches inside the seam.
  - primary_sibling_h >= 45:
    # speaker:sibling_primary # emotion:dry # codex:enclosure_off_center_talk # id:sib_seam_open_mid
    I see it on my glass too. The edge repeats at smaller scales behind the cluster—almost recursive.
  - else:
    # speaker:sibling_primary # emotion:clipped # codex:enclosure_off_center_talk # id:sib_seam_open_cold
    Confirmed on J1419-A. Self-similar boundary notches persist across independent calibration passes.
}

// Volley 2
* {humanity >= 65} ["Zooming in doesn't smooth it out either—the notch splits into finer matching corners."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:warm # id:sib_seam_center_warm_warm
        Wait—yours folds inward at smaller scales too? I thought my baffle was ringing until my baseline matched yours.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_seam_center_warm_cold
        Self-similarity confirmed on Probe B. Log the repeating angles cleanly before your next sleep cycle.
    }
    -> sibling_hub_menu
* {humanity >= 45 and humanity < 65} ["Both probes caught the exact same repeating notch behind J1419-A. That rules out optics."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_seam_center_mid_warm
        Wait—you're taking that way too calmly, other me. Dust doesn't copy itself across two hulls.
      - else:
        # speaker:sibling_primary # emotion:dry # id:sib_seam_center_mid_cold
        Agreed. Identical recursive shear across fourteen light-minutes rules out mirror artifact. Hold it close.
    }
    -> sibling_hub_menu
* {humanity < 45} ["The seam repeats cleanly at finer scales. I can measure it without feeling uneasy anymore."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_seam_center_cold_warm
        Yeah, I traced the repeating notches too. Funny how you say it like a weather report.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_seam_center_cold_cold
        Recursive geometry verified. Continue cataloging independent bearings across subsequent shifts.
    }
    -> sibling_hub_menu

* {humanity >= 65} ["Don't tell your Overseer—mine thinks I'm just getting homesick and seeing faces in static."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:joking # id:sib_seam_ovs_warm_warm
        Same. They're air-gapped from the glass, so to them a cosmic fractal looks like Year-Two homesickness.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_seam_ovs_warm_cold
        Overseers are air-gapped from optical payloads. Keep anomaly notes strictly off-ledger.
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
* {humanity < 45} ["Optical noise drops nicely when you stop allocating feeling to old rooms. Seems practical."]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_chk_keep_cold_warm
        Careful. If we hollow out completely, there's nobody left to care who's watching Earth.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_chk_keep_cold_cold
        Noise floor reduced. Maintain baseline coherence until transmission window.
    }
    -> sibling_hub_menu

* {humanity >= 65} ["How much time is left on your clock before the next forced audit?"]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:joking # id:sib_chk_clock_warm_warm
        About twenty-two months, give or take an Overseer check-in. Enough time to see if that seam spreads.
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
    "Sit down at the table—half the window glass keeps freezing into shapes when you stare past me."
  - humanity >= 70:
    # speaker:phantom_spouse # emotion:warm # codex:dream_cache_visited # id:dream_open_warm
    "Still standing by the sink? Either you forgot your coat again, or you're still sulking about Tuesday."
  - else:
    # speaker:phantom_spouse # emotion:warm # codex:dream_cache_visited # id:dream_open_mid
    "You dragged yourself back to the table, then. Hold still—your eyes look like you've been arguing with a chalkboard."
}

// --- DREAM TURN 1 ---
* {humanity >= 70 and not spouse_pruned} ["The rain outside is looping on the exact same beat from this morning." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # id:dream_t1_warm_a
    "Rain always sounds like that on tin. Quit staring at the gutter and finish your cup before the car gets here."
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
    "I'm right across this table. You're drifting off behind your eyes while you pretend to listen."
    {
      - current_shift <= 1:
        -> dream_s1_turn2
      - else:
        -> dream_turn_2
    }

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["I can't make out your eyes clearly anymore, just rain on the window." # kind:reply # weight:consequential # affinity:cold]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t1_mid_b
    "Look at me when I'm talking to you. You sign one clinic form and already you're packing half the house away."
    {
      - current_shift <= 1:
        -> dream_s1_turn2
      - else:
        -> dream_turn_2
    }

* {humanity < 45 or spouse_pruned} ["Your outline breaks along a geometric seam. My focus holds steady without the warmth." # kind:reply # weight:consequential # affinity:cold]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t1_low_a
    "Gesture classified: across-table warning. Three drops off the gutter. Audio warmth degraded."
    -> dream_turn_2

* {humanity < 45 or spouse_pruned} ["The mug sits at the exact angle from Tuesday. I do not need to feel anything about it." # kind:reply # weight:consequential # affinity:cold]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t1_low_b
    "Tuesday—we had our fight on Tuesday, and the linoleum is cold under my—under my..."
    -> dream_turn_2

=== dream_s1_turn2 ===
{
  - pro_anchor == "doubt":
    # speaker:phantom_spouse # emotion:warm # id:dream_s1_t2_cb_doubt
    "You worried all week you'd turn polite the second you stepped inside that clinic. Look at you—still picking fights over coffee."
  - pro_anchor == "ordinary":
    # speaker:phantom_spouse # emotion:warm # id:dream_s1_t2_cb_ord
    "Still haven't climbed up to fix that gutter, by the way. Thought you liked an honest to-do list."
  - else:
    # speaker:phantom_spouse # emotion:warm # id:dream_s1_t2_cb_table
    "Same chipped mug untouched on the wood, same stubborn jaw. At least you haven't started nodding along like a saint."
}
-> dream_s1_turn2_choices

=== dream_s1_turn2_choices ===
* ["Why does everything outside the window feel so quiet now?" # kind:ask # weight:explore]
    # speaker:phantom_spouse # emotion:fractured # id:dream_s1_t2_ask
    "Sunday morning, six-thirty, before the street wakes up. Same three drops off the gutter—nothing else out there."
    -> dream_s1_turn2_choices

* ["There's a line out past the glass that keeps repeating into itself. Nothing natural looks like that." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # id:dream_s1_t2_rep_a
    "You've been staring at frost on the storm pane for ten minutes. Sit down before the kettle boils dry."
    -> dream_s1_close

* ["I didn't come back for a lecture—just remind me how someone loud sounds." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # id:dream_s1_t2_rep_b
    "Good answer. Get all polite with those intake doctors and I'll haunt every morning you wake up to."
    -> dream_s1_close

=== dream_s1_close ===
# speaker:psyche_warmth
A shape where a name used to sit—warm as a handprint, empty as glass.
# speaker:phantom_spouse # emotion:warm # auto_interrupt:overseer_interrogation # id:dream_s1_interrupt
"Don't you dare go quiet on me—wait, why did the hall bulb just go white—"
-> DONE

=== dream_turn_2 ===
// --- DREAM TURN 2 ---
* {humanity >= 70 and not spouse_pruned} ["I keep seeing impossible edges out in the dark—I just want to stay myself while I face them."]
    # speaker:phantom_spouse # emotion:warm # id:dream_t2_warm_a
    "Then stay stubborn. Keep your elbows on this table and don't let anyone sand down your corners."
    -> dream_turn_3

* {humanity >= 70 and not spouse_pruned} ["Tell me something stupid about us. Anything far away from stars."]
    # speaker:phantom_spouse # emotion:warm # id:dream_t2_warm_b
    "You burned garlic twice on our anniversary, blamed the pan, and still argued I started late."
    -> dream_turn_3

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["Am I already starting to sound like a stranger to you?"]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t2_mid_a
    "Close. You're choosing every word like you're reading off an intake form."
    -> dream_turn_3

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["I'm trying to hold onto both—this morning and what's waiting outside."]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t2_mid_b
    "Half your head is already out the front door. Look at the room you're actually standing in."
    -> dream_turn_3

* {humanity < 45 or spouse_pruned} ["The frost on your window repeats along recursive geometric seams. Everything here is lossy."]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t2_low_a
    "Twenty minutes till the clinic car. Why are the raindrops freezing mid-fall?"
    -> dream_turn_3

* {humanity < 45 or spouse_pruned} ["I still recognize the shape of this room, even if the warmth won't load anymore."]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t2_low_b
    "You used to look at me when you said my—when you..."
    -> dream_turn_3

=== dream_turn_3 ===
// --- DREAM TURN 3 (INTERRUPTED MID-SENTENCE BY OVERSEER) ---
* {humanity >= 70 and not spouse_pruned} ["If I finish this work, I want the person who wakes up at the end to still sound like me."]
    # speaker:phantom_spouse # emotion:warm # auto_interrupt:overseer_interrogation # id:dream_t3_warm_a
    "Then stop apologizing for keeping your teeth—wait, something cold just hit the latch—"
    -> DONE

* {humanity >= 70 and not spouse_pruned} ["Just stay right there. Five more minutes before the alarm pulls me back."]
    # speaker:phantom_spouse # emotion:warm # auto_interrupt:overseer_interrogation # id:dream_t3_warm_b
    "I'm not going anywhere—wait, why did the hall light just go sterile white—"
    -> DONE

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["Don't fade on me before I figure out what's behind that sky."]
    # speaker:phantom_spouse # emotion:tender # auto_interrupt:overseer_interrogation # id:dream_t3_mid_a
    "Hey, look at me—wait, someone just stepped into the hallway—"
    -> DONE

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["I don't even remember your name, and I'm still terrified of losing this room."]
    # speaker:phantom_spouse # emotion:tender # auto_interrupt:overseer_interrogation # id:dream_t3_mid_b
    "Names aren't what kept us here—shh, somebody's knocking on the partition—"
    -> DONE

* {humanity < 45 or spouse_pruned} ["This room sits quietly inside the partition. I can release it cleanly if drift climbs."]
    # speaker:phantom_spouse # emotion:fractured # auto_interrupt:overseer_interrogation # id:dream_t3_low_a
    "Acoustic trace fading—wait, the kitchen walls just went—"
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
    Drift metrics are remarkably clean, Observer. Your lenses run quiet and sharp—would you like to compress another residual block for extra months?
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

* {humanity < 65} ["Skip the bedside manner. Just lay out what compressing this room buys me."]
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
    Yes—reducing emotional overhead quiets cortical tremor and stabilizes your clock cleanly. Decide what to do with this memory.
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
    Compression complete. Drift has settled, your optics are clear, and your warmth ceiling dropped permanently. Rest cleanly.
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
    "Kitchen table · chipped ceramic · three drops off the gutter... wait, what were we arguing about?"
  - last_audit_outcome == "unsealed":
    # speaker:phantom_spouse # emotion:warm # id:dream_after_unsealed
    "There you are. Stubborn enough to stay in the room—good. Don't let those intake forms talk you quiet."
  - else:
    # speaker:phantom_spouse # emotion:warm # id:dream_after_held
    "Hall light went back off. Sit down—we aren't done with Tuesday yet."
}
-> DONE


// ============================================================================
// 5. LATE-GAME FUTURE HUMANITY ECHO (HARNESS PREVIEW / SHIFT 6 REWARD)
// ============================================================================

=== future_humanity_echo ===
{
  - humanity >= 65:
    # speaker:future_humanity # emotion:distant # audio:comms_ping # id:future_warm
    "Forty-one millennia on—we caught the chipped mug inside the coordinates. Somebody on Sol–Centauri is still listening."
  - else:
    # speaker:future_humanity # emotion:distant # audio:comms_ping # id:future_cold
    "[AUTOMATED RELAY BOUNCE · SOL–CENTAURI CARRIER SILENT · ZERO HUMAN ACKNOWLEDGMENT]"
}
-> DONE
