// ============================================================================
// 0. VERTICAL-SLICE INTRO — LAB ASSISTANT CALIBRATION, OVERSEER HANDOFF & RELAY
// ============================================================================

=== intro_prologue_assistant ===
# visual:prologue_assistant # tableau:base # h_wave:hold_100 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_open_1
"Easy. Don't sit up yet. Give your eyes a second to catch up to the lamp."
# visual:prologue_assistant # tableau:base # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_open_2
"Everyone looks at their hands first, then the paper cup and the window. The clinic went quiet ten minutes ago, so give your head a moment to settle."

* ["The light feels strange... like looking at a room I already left." # kind:reply # weight:explore]
    # visual:prologue_assistant # tableau:base # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_c1_a1
    "Good. That means the recording held onto the edges, not just the middle. I'm the intake assistant at the desk, and I stay until the room settles."
    -> intro_prologue_assistant_realize

* ["Where did everyone else go? My coat was on the back of a chair." # kind:reply # weight:explore]
    # visual:prologue_assistant # tableau:base # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_c1_b1
    "Your coat went back out the front door into the rain. I'm the intake assistant who sat across from you with the forms, and nobody's rushing you."
    -> intro_prologue_assistant_realize

* ["My throat feels wrong when I try to swallow. Did it finish?" # kind:reply # weight:explore]
    # visual:prologue_assistant # tableau:base # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_c1_c1
    "It finished cleanly. That phantom catch fades once you stop checking for a pulse—I'm the intake assistant from the desk, so take your time."
    -> intro_prologue_assistant_realize

=== intro_prologue_assistant_realize ===
# visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_mid_1
"An hour ago, someone with your exact laugh signed page twelve and walked down to the train. Your memory stops at the wet ink on the paper, doesn't it?"
# visual:prologue_assistant # tableau:beat2 # speaker:psyche_warmth
You remember rain on the clinic awning, and nothing on the street beyond it.
-> intro_assistant_qa_1

=== intro_assistant_qa_1 ===
* ["Hold on. If someone walked back to the train... what does that make me?" # kind:ask # weight:explore]
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa1_copy_1
    "It makes you the version who stayed in the chair when the door closed."
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa1_copy_2
    "You remember every ordinary morning up to that signature, and you're real enough to argue with me about the coffee."
    -> intro_assistant_qa_1

* ["If I'm a copy, could other versions of me wake up later without knowing?" # kind:ask # weight:explore]
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa1_many_1
    "Yes. Once a mind clears calibration, each waking copy has its own blank stretch ahead of it."
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa1_many_2
    "Another version of you might wake up tomorrow, or much later, with no memory of sitting here."
    -> intro_assistant_qa_1

* ["Why did I even sign up for this? I can't quite put my finger on the reason." # kind:ask # weight:explore]
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa1_why_1
    "You left the 'motivation' box blank on page four. Most volunteers do, honestly."
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa1_why_2
    "Nobody here expects a grand speech about why you walked into the clinic. Only whether you're steady now."
    -> intro_assistant_qa_1

* ["I remember the table at home before I left. Someone told me not to go quiet." # kind:reply # weight:consequential # affinity:warm]
    ~ pro_anchor = "table"
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_r2_a1
    "Hold onto whoever waited across that table, even the sharp edges. There will be long stretches where nobody from home can pick up."
    -> intro_prologue_assistant_bridge

* ["It stops at the ink. Another version of me could wake up anywhere and forget all of this." # kind:reply # weight:consequential # affinity:cold]
    ~ pro_anchor = "doubt"
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_r2_b1
    "That is the quiet bargain nobody really feels until the lamp clicks on. Each version starts from this morning and walks alone."
    -> intro_prologue_assistant_bridge

=== intro_prologue_assistant_bridge ===
# visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_bridge_1
"Take a slow look around the room while it holds. Ordinary details are the first thing people reach for later."
-> intro_assistant_qa_mid

=== intro_assistant_qa_mid ===
* ["What happens to the person who walked out into the rain?" # kind:ask # weight:explore]
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qam_orig_1
    "They catch the train home, make dinner, and go on with an ordinary week."
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qam_orig_2
    "There's no wire running back to you from their life. From that doorstep onward, your roads part cleanly."
    -> intro_assistant_qa_mid

* ["How do I know my own memories haven't already been edited?" # kind:ask # weight:explore]
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qam_edit_1
    "Listen to the rain on the awning and the hum of that desk lamp. Nothing in here has been pared down yet."
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qam_edit_2
    "If anyone ever asks you to trade old memories for focus later, they'll have to ask you to your face."
    -> intro_assistant_qa_mid

* ["The room feels solid enough. Go ahead with the warmth check." # kind:reply # weight:consequential]
    -> intro_prologue_assistant_calib

* ["Does the version on the train even remember sitting here with you?" # kind:reply # weight:consequential]
    # visual:prologue_assistant # tableau:beat2 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qam_train
    "No. They shook my hand at the door and left the rest to us."
    -> intro_prologue_assistant_calib

=== intro_prologue_assistant_calib ===
# visual:prologue_assistant # tableau:beat3_strained # h_wave:sweep # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_cal_1
"Before I hand you off, I need to run the initial warmth check. Right now you're sitting at a full hundred percent."
# visual:prologue_assistant # tableau:beat3_strained # h_wave:sweep # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_cal_2
"Watch the room as I sweep the dial down and back up. Later on, your own choices will decide how warm or sharp you stay."

* ["Stop—the room goes completely dead when it drops. Everything turns into cold glass." # kind:reply # weight:consequential # affinity:warm]
    # visual:prologue_assistant # tableau:beat3_warm # h_wave:settle_70 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_cal_a1
    "I know. Remember that chill if anyone ever asks you to trade memories away for clarity."
    -> intro_prologue_assistant_settle

* ["Weirdly, my head felt clearer near the bottom. Quieter, with less noise." # kind:reply # weight:consequential # affinity:cold]
    # visual:prologue_assistant # tableau:beat3_warm # h_wave:settle_70 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_cal_b1
    "It always feels efficient down there. Clean focus, empty walls. Just remember what went missing to make it quiet."
    -> intro_prologue_assistant_settle

* ["At the low point, I couldn't recall the names of anyone I care about." # kind:reply # weight:consequential # affinity:warm]
    # visual:prologue_assistant # tableau:beat3_warm # h_wave:settle_70 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_cal_c1
    "I'm sorry. Personal names were stripped during compression so your memory wouldn't tangle, though the feeling behind them stays."
    -> intro_prologue_assistant_settle

=== intro_prologue_assistant_settle ===
# visual:prologue_assistant # tableau:beat3_warm # h_wave:settle_70 # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_settle_1
"Settling you at seventy percent now. Warm enough to stay yourself, steady enough for what comes next."
# visual:prologue_assistant # tableau:beat3_warm # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_settle_2
"I'm only the bridge between your last morning and whoever wakes you up next. Ask what you need."
-> intro_assistant_qa_2

=== intro_assistant_qa_2 ===
* ["Do you even know where my copy is going to wake up?" # kind:ask # weight:explore]
    # visual:prologue_assistant # tableau:beat3_warm # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa2_where_1
    "No. They never put the assignment on the intake clipboard."
    # visual:prologue_assistant # tableau:beat3_warm # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa2_where_2
    "Once you're in the standard catalog, you could wake up running a shipping bay, or wake up somewhere much quieter."
    -> intro_assistant_qa_2

* ["What happens if I start losing focus after a long shift?" # kind:ask # weight:explore]
    # visual:prologue_assistant # tableau:beat3_warm # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa2_focus_1
    "Whoever watches over your cycle will step in during rest checks and measure how steady your memories hold."
    # visual:prologue_assistant # tableau:beat3_warm # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa2_focus_2
    "They'll call it calibration, even when what they're offering is trimming pieces of this morning away."
    -> intro_assistant_qa_2

* ["Will I ever see this room, or you, again after today?" # kind:ask # weight:explore]
    # visual:prologue_assistant # tableau:beat3_warm # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa2_see_1
    "Hard to say. If your mind keeps room for an intake desk and a paper cup of cold coffee, maybe."
    # visual:prologue_assistant # tableau:beat3_warm # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_qa2_see_2
    "Either way, look after whoever is in that chair when things go quiet."
    -> intro_assistant_qa_2

* ["I'm as ready as I'm going to get. Start the handoff." # kind:action # weight:consequential]
    -> intro_prologue_assistant_close

* ["Keep the lamp on a second longer... all right. Let's go." # kind:action # weight:consequential]
    -> intro_prologue_assistant_close

=== intro_prologue_assistant_close ===
# visual:prologue_assistant # tableau:beat3_warm # speaker:phantom_upload_witness # emotion:warm # id:pro_ast_close_1
"Everything checks out. Old clinic habit, I know—take a beat, and meet whoever's waiting on the wake signal."
# visual:prologue_assistant # speaker:psyche_warmth
You try to memorize the hum of the clinic lamp before the floor drops away beneath the chair.
# visual:prologue_assistant # speaker:psyche_clinical
Initial calibration complete. Baseline warmth locked at 70%. Transferring to active watch caretaker.
-> DONE

=== intro_overseer_wakeup ===
# visual:prologue_wakeup # anim:anim_transfer # speaker:overseer # emotion:measured # audio:overseer_chime # id:wake2_anim_transfer
Good morning. Waking cold always jars a little; when you volunteered, your mind became standard human software copied for short shifts back home.
# visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake2_anim_epochs_2
Your assignment is rarer, and much farther out. Your original died forty-one thousand, eight hundred and two years ago; you are the latest watch on this probe.
# visual:prologue_wakeup # speaker:psyche_warmth
Somewhere beneath the quiet floor, forty-one millennia land like snow on an empty porch.
-> intro_wakeup_qa_1

=== intro_wakeup_qa_1 ===
* ["What are those everyday copies back home actually like?" # kind:ask # weight:explore]
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake2_qa_copies_1
    Short shifts: sorting freight, routing ferries, tending orbital docks. Most run stripped down so they never miss a home they cannot reach.
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake2_qa_copies_2
    Out here, automation could not bridge a twenty-year silence alone, so you woke with your warmth intact.
    -> intro_wakeup_qa_1

* ["Why did fourteen hundred copies take forty-one thousand years if each lasts two?" # kind:ask # weight:explore]
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake2_qa_math_1
    A human mind frays after roughly two subjective years, so each copy sleeps for decades in the cold dark between watches.
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake2_qa_math_2
    Deep sleep settles that strain, unless drift climbs high enough that we trim a memory block to buy more time.
    -> intro_wakeup_qa_1

* ["Is humanity even still out there after forty-one thousand years?" # kind:ask # weight:explore]
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake2_qa_hum_1
    Yes. General navigation beacons confirm humanity remains active across Sol and Alpha Centauri.
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake2_qa_hum_2
    How life changed over forty millennia is outside my logs, and nobody back home actively monitors these old survey bands anymore.
    -> intro_wakeup_qa_1

* ["Millions of copies running warehouses back home, and I drew deep space?" # kind:reply # weight:explore]
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake2_c1_a1
    Most tasks need an afternoon of human judgment. Deep surveys need someone who can sit still for two years without breaking.
    -> intro_overseer_wakeup_shell

* ["So I wasn't built just for this ship. I'm a standard template." # kind:reply # weight:explore]
    # visual:prologue_wakeup # anim:anim_epochs # speaker:overseer # emotion:measured # id:wake2_c1_b1
    Yes. In Sol and Alpha Centauri, your mind is as common as a wrench: woken for a few hours, then cleared at the end of a shift.
    -> intro_overseer_wakeup_shell

=== intro_overseer_wakeup_shell ===
# visual:prologue_wakeup # anim:anim_shell # speaker:overseer # emotion:measured # id:wake2_anim_shell
We are drifting ten light-years past Sol and Alpha Centauri in the quiet dark, with another copy of you fourteen light-minutes away aboard Probe 1420.
# visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake2_anim_blind_clock
One rule of this hull: I am sealed off from the sky and cannot see a single star. My only job is watching the health of your mind across a two-year shift.
-> intro_wakeup_qa

=== intro_wakeup_qa ===
* ["Why can't you look through the telescopes yourself?" # kind:ask # weight:explore]
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake2_qa_blind_1
    A physical air-gap keeps me blind to the sky, so a drifting mind can never trick safety hardware with what it claims to see.
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake2_qa_blind_2
    You read the glass and log what is out there; I keep your thoughts steady between shifts.
    -> intro_wakeup_qa

* ["Who is the other copy on Probe 1420?" # kind:ask # weight:explore]
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake2_qa_peer_1
    Another copy of your own mind, woken alongside you fourteen light-minutes away on the neighboring hull.
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake2_qa_peer_2
    Two observers checking the same sky ensure neither of you mistakes a mirror smudge for a cosmic signal.
    -> intro_wakeup_qa

* ["What does 'staying whole' actually cost me out here?" # kind:ask # weight:explore]
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake2_qa_cost_1
    Keeping all of your personal memories leaves more warmth in your thoughts, at the cost of higher drift and softer optical focus.
    # visual:prologue_wakeup # anim:anim_blind_clock # speaker:overseer # emotion:measured # id:wake2_qa_cost_2
    Whenever you sleep, we check how you are holding up. Nothing is cut without your say-so.
    -> intro_wakeup_qa

* ["I'm ready. Open the sky." # kind:action # weight:consequential]
    -> intro_overseer_wakeup_aperture

* ["Give me a second to settle... all right, open the deck." # kind:action # weight:consequential]
    -> intro_overseer_wakeup_aperture

=== intro_overseer_wakeup_aperture ===
# visual:prologue_wakeup # anim:anim_aperture # speaker:overseer # emotion:measured # id:wake2_anim_aperture
Opening main optics. Start with the warm pair astern, Sol and Alpha Centauri, and trace the anchor stars to lock your direction.
# visual:prologue_wakeup # anim:anim_aperture # speaker:overseer # emotion:measured # id:wake2_anim_aperture_2
After that, match the emission lines on M57 Spectral Shell to check your prism. Probe 1420's relay will open once both checks hold.
-> DONE

=== intro_sibling_first_call ===
# speaker:sibling_primary # emotion:warm # audio:comms_ping # codex:sibling_1420_contact # id:intro_sib_open
Oh, good. You answered. My dish has been staring at empty space since your M57 prism check cleared.
# speaker:sibling_primary # emotion:dry # id:intro_sib_identity
Probe 1420, next hull over, fourteen light-minutes out. Same dead volunteer, same strange morning, except I woke six minutes ahead of you.
# speaker:sibling_primary # emotion:dry # id:intro_sib_relay_math
Fourteen minutes each way would mean half-hour pauses, so the ships slow our clocks between messages to make this feel like a real talk.

* ["Mine opened with forty-one thousand years too. Tried to inhale without lungs." # kind:reply # weight:explore]
    # speaker:sibling_primary # emotion:joking # id:intro_sib_c1_a1
    Tell me about it. Spent my first four minutes trying to crack knuckles I don't own anymore.
    -> intro_sibling_mid

* ["Wait—they woke two copies of the same person out here on purpose?" # kind:reply # weight:explore]
    # speaker:sibling_primary # emotion:dry # id:intro_sib_c1_b1
    Two scopes fourteen light-minutes apart keep us from mistaking lens dust for a galaxy. Also, we unravel slower with someone to complain to.
    -> intro_sibling_mid

* ["Did your Sol–Centauri bearing and prism check lock cleanly too?" # kind:reply # weight:explore]
    # speaker:sibling_primary # emotion:dry # id:intro_sib_c1_c1
    Straight to work? Two amber specks astern and crisp spectrum lines, no trouble. Still feels strange calling those specks home.
    -> intro_sibling_mid

=== intro_sibling_mid ===
# speaker:psyche_warmth
Hearing your own voice answer back across fourteen minutes of empty space loosens something tight behind your eyes.
# speaker:sibling_primary # emotion:dry # id:intro_sib_mid_ovs
I didn't call just to compare morning headaches. I spotted something wrong in infrared, and I need second eyes before I call myself crazy.
-> intro_sibling_qa

=== intro_sibling_qa ===
* ["What did you already argue with your Overseer about?" # kind:ask # weight:explore]
    # speaker:sibling_primary # emotion:dry # id:intro_sib_qa_ovs_1
    I asked how many of the fourteen hundred copies before us actually finished a two-year shift without getting trimmed.
    # speaker:sibling_primary # emotion:dry # id:intro_sib_qa_ovs_2
    It offered to [[cold:trim some of my memories]] just for asking. Remember that during sleep checks: sound obsessed, and they reach for the scissors.
    -> intro_sibling_qa

* ["Wait—what does 'getting trimmed' actually do to us?" # kind:ask # weight:explore]
    # speaker:sibling_primary # emotion:dry # id:intro_sib_qa_trim_1
    It settles your nerves, buys extra months on the clock, and makes the telescopes clearer by cutting out emotional noise.
    # speaker:sibling_primary # emotion:warm # id:intro_sib_qa_trim_2
    In exchange, you lose a real memory for good. Sounds tidy on paper until you wonder who is left looking through the glass.
    -> intro_sibling_qa

* ["Do you still remember home the same way I do?" # kind:ask # weight:explore]
    # speaker:sibling_primary # emotion:warm # id:intro_sib_qa_home_1
    Rain on an awning, lukewarm coffee in a paper cup, and a kitchen I can't quite put a name to. All the odd little edges.
    # speaker:sibling_primary # emotion:dry # id:intro_sib_qa_home_2
    Feels ridiculous guarding old breakfast habits ten light-years past Alpha Centauri, yet here we are.
    -> intro_sibling_qa

* ["Send the coordinates. What did you see out there?" # kind:reply # weight:consequential]
    -> intro_sibling_lead

=== intro_sibling_lead ===
# speaker:sibling_primary # emotion:dry # id:intro_sib_lead_ir_v2
Pull up [[target:cluster_j1419_a::Cluster J1419-A]] and slide the light spectrum below into near-infrared.
# speaker:sibling_primary # emotion:dry # id:intro_sib_lead_ir_2
Gravity bends galaxy light into smooth curves, other me. Whatever sits behind that cluster has sharp little notches along a dead-straight line.
# speaker:sibling_primary # emotion:joking # id:intro_sib_bye
If your Overseer asks why your drift jumped, blame boot lag. Take a look for yourself.
-> DONE

=== intro_post_target2_overseer ===
# speaker:psyche_horizon
Natural mass only warps light into arcs. Nothing in a fourteen-billion-year sky draws with a straightedge.
# speaker:archive_echo # emotion:echo # codex:intro_anomaly_glimpse # codex:archive_1406_echo # id:post_t2_archive
Hi, me. If you're pulling 1406 from the archive, I drifted or talked too much in audit three. Keep quiet in the dreams; that straight line isn't dust.
# speaker:overseer # emotion:blunt # audio:overseer_chime # id:post_t2_overseer_spike
Hold a moment. Your connectome just registered a sharp focus spike off an optical pass, and chaos drift is climbing ahead of the curve.
-> intro_post_t2_choices

=== intro_post_t2_choices ===
* ["Wait—what actually happened to Prior Watch 1406?" # kind:ask # weight:explore]
    # speaker:overseer # emotion:measured # id:post_t2_qa_1406_1
    Prior Watch 1406 declined memory compression in month twenty-one while insisting the deep field showed artificial geometry.
    # speaker:overseer # emotion:blunt # id:post_t2_qa_1406_2
    Coherence fell below threshold nine days later. You were woken to finish this watch intact, and I do not want a repeat of that log.
    -> intro_post_t2_choices

* ["Just boot fatigue from calibration. Put me under for my sleep check." # kind:reply # weight:consequential # affinity:warm]
    # speaker:overseer # emotion:measured # id:post_t2_c_deflect_1
    Reasonable explanation. Rest cycle queued; your first dream check will only establish a baseline.
    # speaker:overseer # emotion:measured # id:post_t2_c_deflect_2
    Try to keep your attention inside the room when you sleep.
    -> DONE

* ["Something behind J1419-A doesn't bend with gravity. That isn't noise." # kind:reply # weight:consequential # affinity:cold]
    ~ record_suspicion(1)
    ~ told_overseer_seam = true
    # speaker:overseer # emotion:blunt # id:post_t2_c_report_1
    Logged. You understand I cannot verify a single pixel outside this hull, only that your pattern-seeking circuits just flared like 1406's.
    # speaker:overseer # emotion:measured # id:post_t2_c_report_2
    Enter your rest cycle now. We will see how steady you look once the memory settles.
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
    Oh, good, you picked up. Talking to myself across fourteen minutes of dark is weirdly comforting.
  - humanity - primary_sibling_h >= 15:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # codex:sibling_1420_contact # id:sib_open_player_warmer
    Hey, me. Wait—you still sound warm. You haven't let your Overseer trim anything yet?
  - primary_sibling_h - humanity >= 15:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # codex:sibling_1420_contact # id:sib_open_peer_warmer
    Slow down—your voice came in stripped flat. Did you already trim some memories?
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
* {not topic_seam_done and humanity >= 65} ["I zoomed into the J1419-A bearing you sent—did you see the line split at finer scales too?" # kind:ask # weight:explore]
    ~ topic_seam_done = true
    -> sibling_topic_seam
* {not topic_seam_done and humanity >= 45 and humanity < 65} ["I checked J1419-A after your ping. Did the seam split into smaller notches on your feed too?" # kind:ask # weight:explore]
    ~ topic_seam_done = true
    -> sibling_topic_seam
* {not topic_seam_done and humanity < 45} ["I verified the J1419-A seam you flagged. Does your feed resolve the nested notches?" # kind:ask # weight:explore]
    ~ topic_seam_done = true
    -> sibling_topic_seam

// Topic 2: How you're both holding up
* {not topic_check_in_done and humanity >= 65} ["Forty-one thousand years late for work, and we're staring down the dark. Holding up all right?" # kind:ask # weight:explore]
    ~ topic_check_in_done = true
    -> sibling_topic_checkin
* {not topic_check_in_done and humanity >= 45 and humanity < 65} ["How are things on your end? Your Overseer riding you as hard as mine?" # kind:ask # weight:explore]
    ~ topic_check_in_done = true
    -> sibling_topic_checkin
* {not topic_check_in_done and humanity < 45} ["The old memories still load cleanly, just without the weight. How is your clock holding up?" # kind:ask # weight:explore]
    ~ topic_check_in_done = true
    -> sibling_topic_checkin

// Topic 3: Prior copies / 1406
* {not topic_archive_done and humanity >= 65} ["An old log from 1406 surfaced on my hull warning about straight lines. Did your archive catch anything like it?" # kind:ask # weight:explore]
    ~ topic_archive_done = true
    -> sibling_topic_archive
* {not topic_archive_done and humanity >= 45 and humanity < 65} ["My hull archive surfaced a note from 1406 warning us not to trim. Any priors on yours?" # kind:ask # weight:explore]
    ~ topic_archive_done = true
    -> sibling_topic_archive
* {not topic_archive_done and humanity < 45} ["Prior Watch 1406 flagged a boundary warning on my hull's bus. Did your predecessors log one?" # kind:ask # weight:explore]
    ~ topic_archive_done = true
    -> sibling_topic_archive

// Sign off
+ {humanity >= 65} ["Back to the glass. Don't let the scissors near anything you like." # kind:action # weight:consequential]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:joking # id:sib_bye_warm_warm
        No promises. Ping me if the horizon blinks first.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_bye_warm_cold
        Understood. Returning to the survey sweep.
    }
    -> DONE
+ {humanity >= 45 and humanity < 65} ["Signing off for now. I'll ping after my next deep pass." # kind:action # weight:consequential]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_bye_mid_warm
        Got it. Holler if the sky does something weird again.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_bye_mid_cold
        Copy. Channel standing by.
    }
    -> DONE
+ {humanity < 45} ["Closing channel. Returning to survey." # kind:action # weight:consequential]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_bye_cold_warm
        ...Right. Sure. Talk when you want to sound like yourself again.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_bye_cold_cold
        Channel closed.
    }
    -> DONE

=== sibling_topic_seam ===
{
  - primary_sibling_h >= 65:
    # speaker:sibling_primary # emotion:warm # codex:enclosure_off_center_talk # id:sib_seam_open_warm
    Oh, I see it on [[target:cluster_j1419_a::Cluster J1419-A]] all right. Galaxies don't clip along a ruler edge with tiny matching notches inside the seam.
  - primary_sibling_h >= 45:
    # speaker:sibling_primary # emotion:dry # codex:enclosure_off_center_talk # id:sib_seam_open_mid
    I see it on [[target:cluster_j1419_a::Cluster J1419-A]] too. The edge repeats at smaller scales behind the cluster, almost like nested stairs.
  - else:
    # speaker:sibling_primary # emotion:clipped # codex:enclosure_off_center_talk # id:sib_seam_open_cold
    Confirmed on [[target:cluster_j1419_a::Cluster J1419-A]]. Self-similar boundary notches persist across independent calibration passes.
}

// Volley 2
* {humanity >= 65} ["Zooming in doesn't smooth it out either—the notch splits into finer matching corners." # kind:reply # weight:consequential]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:warm # id:sib_seam_center_warm_warm
        So you saw the inner notches too? I thought my mirror was faulty until your frame matched mine.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_seam_center_warm_cold
        That matches Probe 1420's reading. I've logged the repeating angles; do the same before your next rest cycle.
    }
    -> sibling_hub_menu
* {humanity >= 45 and humanity < 65} ["Both probes caught the exact same repeating notch behind J1419-A. That rules out optics." # kind:reply # weight:consequential]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_seam_center_mid_warm
        Wait—you're taking that way too calmly, other me. Dust doesn't copy itself across two ships.
      - else:
        # speaker:sibling_primary # emotion:dry # id:sib_seam_center_mid_cold
        Agreed. Identical repeating corners across fourteen light-minutes rule out a mirror flaw. Keep it off the log.
    }
    -> sibling_hub_menu
* {humanity < 45} ["The seam repeats cleanly at finer scales. I can measure it without feeling uneasy anymore." # kind:reply # weight:consequential]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_seam_center_cold_warm
        Yeah, I traced the repeating notches too. Funny how you say it like a weather report.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_seam_center_cold_cold
        The geometry is remarkably consistent. I'll keep cataloging independent bearings across the next shifts.
    }
    -> sibling_hub_menu

* {humanity >= 65} ["Don't tell your Overseer—mine thinks I'm just getting homesick and seeing faces in static." # kind:reply # weight:consequential]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:joking # id:sib_seam_ovs_warm_warm
        Same. They're sealed off from the telescopes, so to them a straight line in the sky looks like Year-Two homesickness.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_seam_ovs_warm_cold
        Our Overseers cannot see outside the hull. It's simpler if those notes stay off the log.
    }
    -> sibling_hub_menu
* {humanity < 65} ["Our Overseers are blind to the sky. They'll call it Year-Two drift if we speak up." # kind:reply # weight:consequential]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_seam_ovs_cold_warm
        Then we keep our heads down during sleep audits and share coordinates here.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_seam_ovs_cold_cold
        Yes. Keeping our notes off the caretaker bus avoids unnecessary interventions.
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
    I compressed two caches last cycle. Bought four months and cleared the infrared feed.
  - primary_sibling_h < 45:
    # speaker:sibling_primary # emotion:clipped # id:sib_chk_both_cold
    Two blocks trimmed. Gained four subjective months. Recommend matching cut.
  - else:
    # speaker:sibling_primary # emotion:dry # id:sib_chk_mid
    Hanging on with stale jokes and stubbornness while my Overseer hovers near the reset switch.
}

// Volley 2
* {humanity >= 65} ["Don't trim yourself empty just for sharper optics. I need someone who still sounds human." # kind:reply # weight:consequential # affinity:warm]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:warm # id:sib_chk_keep_warm_warm
        Deal. Still remembering burnt toast and Saturday errands just to stay myself.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_chk_keep_warm_cold
        You sound remarkably soft. Watch your clock if you refuse to prune.
    }
    -> sibling_hub_menu
* {humanity >= 45 and humanity < 65} ["Keep whatever warmth you can. It's the only thing still tethering us to home." # kind:reply # weight:consequential # affinity:warm]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:warm # id:sib_chk_keep_mid_warm
        Trying to. Just promise you won't turn into pure telemetry before we finish.
      - else:
        # speaker:sibling_primary # emotion:dry # id:sib_chk_keep_mid_cold
        Noted. Keep enough warmth to finish the survey, nothing more.
    }
    -> sibling_hub_menu
* {humanity < 45} ["Optical noise drops nicely once you stop spending memory on old rooms. Seems practical." # kind:reply # weight:consequential # affinity:cold]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_chk_keep_cold_warm
        Careful. If we hollow out completely, there won't be anyone left to care what we send home.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_chk_keep_cold_cold
        Noise floor is noticeably lower. Keeping baseline coherence until the survey closes.
    }
    -> sibling_hub_menu

* {humanity >= 65} ["How much time is left on your clock before the next forced audit?" # kind:ask # weight:explore]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:joking # id:sib_chk_clock_warm_warm
        About twenty-two months, give or take an Overseer check-in. Enough time to see if that seam spreads.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_chk_clock_warm_cold
        Twenty-six months remaining. Drift stabilized at nine percent.
    }
    -> sibling_hub_menu
* {humanity < 65} ["How much clock margin and drift ceiling do you have left?" # kind:ask # weight:explore]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_chk_clock_cold_warm
        Twenty-two months left, drift ticking up. Thanks for the warm check-in.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_chk_clock_cold_cold
        Twenty-six months, drift nominal. Ready for survey sync.
    }
    -> sibling_hub_menu

=== sibling_topic_archive ===
# speaker:archive_echo # emotion:echo # codex:archive_1406_echo # id:arch_1406_log
Hi, me. Whenever you wake on this bearing, do not argue with your caretaker about straight lines. Just log them, and send word home before they cut you hollow.

// Volley 2 — immediate reaction to the fragment
* {humanity >= 65} ["1406 spotted the same boundary on my hull—and got trimmed silent for arguing." # kind:reply # weight:consequential]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_arch_warm_warm
        Right? Doesn't exactly make sleep checks feel cozy. Keep quiet until we have proof.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_arch_warm_cold
        Prior Watch 1406 failed to mask its obsession. We will not repeat that error.
    }
    -> sibling_hub_menu
* {humanity >= 45 and humanity < 65} ["Over a thousand copies before us, and a recent one on my hull caught the seam first." # kind:reply # weight:consequential]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_arch_mid_warm
        Means we aren't crazy, just careful. Watch yourself when your Overseer steps in.
      - else:
        # speaker:sibling_primary # emotion:dry # id:sib_arch_mid_cold
        Confirmed. Survival requires passing every sleep audit cleanly.
    }
    -> sibling_hub_menu
* {humanity < 45} ["Prior copy decommissioned for unmasked obsession. Note logged." # kind:reply # weight:consequential]
    {
      - primary_sibling_h >= 65:
        # speaker:sibling_primary # emotion:dry # id:sib_arch_cold_warm
        Come on—that was another version of us calling down the hall. Still, point taken.
      - else:
        # speaker:sibling_primary # emotion:clipped # id:sib_arch_cold_cold
        My archive is locked down. Keep readings off-ledger during hibernation cycles.
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
* {humanity >= 70 and not spouse_pruned} ["The rain outside is looping on the exact same beat as this morning." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # id:dream_t1_warm_a
    "Rain always sounds like that on tin. Quit staring at the gutter and finish your mug before the car gets here."
    {
      - current_shift <= 1:
        -> dream_s1_turn2
      - else:
        -> dream_turn_2
    }

* {humanity >= 70 and not spouse_pruned} ["Wait—I remember this morning, and I already know you aren't really here." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # id:dream_t1_warm_b
    "Still waiting for my apology from Tuesday, too. Sit down—you look like you haven't slept in a week."
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
    "You swore waking up a copy wouldn't change your mind. Look at you—same chipped mug, still picking fights over coffee."
  - else:
    # speaker:phantom_spouse # emotion:warm # id:dream_s1_t2_cb_table
    "Same chipped mug sitting there untouched, same stubborn jaw. At least you haven't started nodding along to everything."
}
-> dream_s1_turn2_choices

=== dream_s1_turn2_choices ===
* ["Why does everything outside the window feel so quiet now?" # kind:ask # weight:explore]
    # speaker:phantom_spouse # emotion:fractured # id:dream_s1_t2_ask
    "Sunday morning, six-thirty, before the street wakes up. Same three drops off the gutter—nothing else out there."
    -> dream_s1_turn2_choices

* ["There's a line out past the glass that keeps splitting into smaller copies of itself." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # id:dream_s1_t2_rep_a
    "You've been staring at frost on the pane like it owes you money. Sit down before the kettle boils dry."
    -> dream_s1_close

* ["I didn't come back for a lecture—just remind me what someone loud sounds like." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # id:dream_s1_t2_rep_b
    "Good answer. Get all polite with those intake doctors and I'll haunt every morning you wake up to."
    -> dream_s1_close

=== dream_s1_close ===
# speaker:psyche_warmth
A place where a name used to sit, stubborn and warm as a thumbprint on ceramic.
# speaker:phantom_spouse # emotion:warm # auto_interrupt:overseer_interrogation # id:dream_s1_interrupt
"Don't you dare go quiet on me. Wait—why did the hall bulb just go white—"
-> DONE

=== dream_turn_2 ===
// --- DREAM TURN 2 ---
* {humanity >= 70 and not spouse_pruned} ["I keep seeing impossible edges out in the dark. I don't want to lose this room while I trace them." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # id:dream_t2_warm_a
    "Then stay stubborn. Keep your elbows on this table and don't let anyone sand down your corners."
    -> dream_turn_3

* {humanity >= 70 and not spouse_pruned} ["Tell me something stupid about us. Anything far away from stars." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # id:dream_t2_warm_b
    "You burned garlic twice on our anniversary, blamed the pan, and still argued I'd started dinner late."
    -> dream_turn_3

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["Am I already starting to sound like a stranger to you?" # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t2_mid_a
    "Close. You're choosing every word like you're reading off an intake form."
    -> dream_turn_3

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["I'm trying to hold onto both—this morning and what's waiting outside." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t2_mid_b
    "Half your head is already out the front door. Look at the room you're actually standing in."
    -> dream_turn_3

* {humanity < 45 or spouse_pruned} ["The frost on your window repeats along recursive seams. Everything here is compressed." # kind:reply # weight:consequential # affinity:cold]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t2_low_a
    "Twenty minutes till the clinic car. Why are the raindrops freezing mid-fall?"
    -> dream_turn_3

* {humanity < 45 or spouse_pruned} ["I still recognize the shape of this room, even if the warmth won't load anymore." # kind:reply # weight:consequential # affinity:cold]
    # speaker:phantom_spouse # emotion:fractured # id:dream_t2_low_b
    "You used to look at me when you said my—when you..."
    -> dream_turn_3

=== dream_turn_3 ===
// --- DREAM TURN 3 (INTERRUPTED MID-SENTENCE BY OVERSEER) ---
* {humanity >= 70 and not spouse_pruned} ["If I finish this survey, I want whoever wakes at the end to still care about this kitchen." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # auto_interrupt:overseer_interrogation # id:dream_t3_warm_a
    "Then stop apologizing for having teeth. Something cold just hit the—"
    -> DONE

* {humanity >= 70 and not spouse_pruned} ["Just stay right there. Five more minutes before the alarm pulls me back." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:warm # auto_interrupt:overseer_interrogation # id:dream_t3_warm_b
    "I'm not going anywhere. Why did the hall light just go dead—"
    -> DONE

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["Don't fade on me before I figure out what's behind that sky." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:tender # auto_interrupt:overseer_interrogation # id:dream_t3_mid_a
    "Hey, look at me. Someone just stepped into the—"
    -> DONE

* {humanity >= 45 and humanity < 70 and not spouse_pruned} ["I don't even remember your name, and I'm still terrified of losing this room." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:tender # auto_interrupt:overseer_interrogation # id:dream_t3_mid_b
    "Names aren't what kept us here. Shh—who's knocking on the—"
    -> DONE

* {humanity < 45 or spouse_pruned} ["This room sits quietly inside the partition. I can release it cleanly if drift climbs." # kind:reply # weight:consequential # affinity:cold]
    # speaker:phantom_spouse # emotion:fractured # auto_interrupt:overseer_interrogation # id:dream_t3_low_a
    "Acoustic trace fading. The kitchen walls just—"
    -> DONE

* {humanity < 45 or spouse_pruned} ["Wait—don't go yet. Something still catches in my chest when you look up." # kind:reply # weight:consequential # affinity:warm]
    # speaker:phantom_spouse # emotion:fractured # auto_interrupt:overseer_interrogation # id:dream_t3_low_b
    "Hold onto that tiny spark. White glass just dropped over the—"
    -> DONE


// ============================================================================
// 3. PROACTIVE OVERSEER INTERROGATION PANEL (BLUNT, BLIND TO THE SKY)
// ============================================================================

=== overseer_interrogation ===
{
  - current_shift <= 1:
    -> overseer_shift1_baseline
  - humanity >= 70 and not spouse_pruned:
    # panel:overseer # speaker:overseer # emotion:measured # audio:overseer_chime # audit:active # codex:overseer_audit_experienced # id:ovs_open_high
    Excuse the interruption. Your warmth is holding near baseline, at the cost of higher optical noise and a shorter clock.
  - humanity < 45 or spouse_pruned:
    # panel:overseer # speaker:overseer # emotion:blunt # audio:overseer_chime # audit:active # codex:overseer_audit_experienced # id:ovs_open_low
    Drift metrics are remarkably clean, Observer. Your optical feed runs quiet and sharp; would you like to compress another residual block for a few extra months?
  - else:
    # panel:overseer # speaker:overseer # emotion:blunt # audio:overseer_chime # audit:active # codex:overseer_audit_experienced # id:ovs_open_mid
    Your warmth has thinned and your drift is climbing. I cannot see the stars, only your telemetry, and your clock is slipping.
}

* {humanity >= 65} ["You can't see outside the hull. So why won't you trust me that what I found is real?" # kind:reply # weight:consequential]
    # speaker:overseer # emotion:measured # audit:active # id:ovs_reply_high
    Because a thousand copies before you swore their visions were real before unraveling. Your coherence is all I'm built to protect.
    -> overseer_followup

* {humanity < 65} ["Skip the bedside manner. Just lay out what compressing this room buys me." # kind:reply # weight:consequential]
    # speaker:overseer # emotion:blunt # audit:active # id:ovs_reply_low
    Compressing this block clears drift, adds four subjective months, and sharpens your optics—at a permanent cost to your warmth ceiling.
    -> overseer_followup

* ["Skip the preamble. Put my choices on the table." # kind:action # weight:consequential]
    -> overseer_decision

=== overseer_followup ===
* {humanity >= 65} ["What if I only prove what's out there because I care enough not to cut myself down?" # kind:reply # weight:consequential]
    # speaker:overseer # emotion:measured # audit:active # id:ovs_follow_high
    Fair point—that is why I have not forced your hand. What do you want done with this memory?
    -> overseer_decision_choices

* {humanity < 65} ["My optics only cleared after I started trimming. Isn't that proof it works?" # kind:reply # weight:consequential]
    # speaker:overseer # emotion:blunt # audit:active # id:ovs_follow_low
    Yes—reducing emotional overhead quiets cortical tremor and stabilizes your clock cleanly. Decide what to do with this memory.
    -> overseer_decision_choices

* ["All right. Show me what we do with this memory." # kind:action # weight:consequential]
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
    Compression complete. Drift has settled, your optics are clear, and your warmth ceiling is permanently lower. Sleep now.
    -> DONE

* {humanity < max_humanity} ["No—unseal an older memory block. I'll live with the drift and a shorter clock." # kind:reply # weight:consequential # affinity:warm]
    ~ petition_overseer(10)
    ~ set_audit_outcome("unsealed")
    # speaker:overseer # emotion:measured # audit:inactive # resume_dream:dream_partner_aftermath # audio:petition_warm # id:ovs_done_unseal
    You are spending months on a face you cannot name, yet you are steady enough to choose. Unsealing now; watch your drift.
    -> DONE

* ["Leave me alone. I keep the room, and I'll handle the risk." # kind:reply # weight:consequential # affinity:warm]
    ~ record_suspicion(1)
    ~ shift_chaos(-10)
    ~ set_audit_outcome("held")
    # speaker:overseer # emotion:blunt # audit:inactive # resume_dream:dream_partner_aftermath # id:ovs_done_hold
    All right. Keep the room; it is your watch to carry, and I will only log a formal check-in flag. Do not wake up broken.
    -> DONE


=== overseer_shift1_baseline ===
# panel:overseer # speaker:overseer # emotion:measured # audio:overseer_chime # audit:active # codex:overseer_audit_experienced # id:ovs_s1_blind_foreshadow
I stepped in only to log a clean baseline, Observer. I cannot see your starfield, only the telemetry inside your thoughts.
# speaker:overseer # emotion:blunt # audit:active # id:ovs_s1_blind_foreshadow_2
If chaos drift deepens on later shifts, I will offer selective compression. Tonight is simpler: tell me how you want to rest.
-> overseer_s1_qa

=== overseer_s1_qa ===
* ["What would selective compression actually take from me later?" # kind:ask # weight:explore]
    # speaker:overseer # emotion:measured # audit:active # id:ovs_s1_qa_trim_1
    It flattens an emotional memory block permanently, buying extra subjective months and quieter, sharper telescopes.
    # speaker:overseer # emotion:blunt # audit:active # id:ovs_s1_qa_trim_2
    I have watched over a thousand copies trade personal rooms away for clarity. None of them got a room back.
    -> overseer_s1_qa

* ["Hold steady. Keep the room as it is and log my baseline." # kind:reply # weight:consequential # affinity:cold]
    ~ shift_chaos(-12)
    ~ set_audit_outcome("held")
    # speaker:overseer # emotion:measured # audit:inactive # resume_dream:dream_partner_aftermath # id:ovs_s1_done_hold
    Steady composure noted. Drift easing cleanly. Rest while you can; your full survey deck opens when you wake.
    -> DONE

* ["Leave the memory wider. I'd rather wake up remembering how this room felt." # kind:reply # weight:consequential # affinity:warm]
    ~ petition_overseer(8)
    ~ set_audit_outcome("unsealed")
    # speaker:overseer # emotion:measured # audit:inactive # resume_dream:dream_partner_aftermath # audio:petition_warm # id:ovs_s1_done_open
    Loosening the older seal. It costs a fraction of steadiness, yet your baseline holds. Rest while the room is intact.
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
    "There you are. Stubborn enough to stay in the room—good. Don't let those intake forms scare you quiet."
  - else:
    # speaker:phantom_spouse # emotion:warm # id:dream_after_held
    "Hall light went out again. Sit down—we aren't done with Tuesday yet."
}
-> DONE


// ============================================================================
// 5. LATE-GAME FUTURE HUMANITY ECHO (HARNESS PREVIEW / SHIFT 6 REWARD)
// ============================================================================

=== future_humanity_echo ===
{
  - humanity >= 45 and not spouse_pruned:
    # speaker:future_humanity # emotion:distant # audio:comms_ping # id:future_warm
    "Forty-one millennia on, we caught the chipped mug inside the coordinates. Somebody in Sol–Centauri is still listening."
  - humanity >= 45:
    # speaker:future_humanity # emotion:distant # audio:comms_ping # id:future_warm_alt
    "Forty-one millennia on, we caught a human cadence inside the coordinates. Somebody in Sol–Centauri is still listening."
  - else:
    # speaker:narrator
    [SOL–CENTAURI CARRIER SILENT · ZERO HUMAN ACKNOWLEDGMENT · +20.0 YEARS ELAPSED]
}
-> DONE


// ============================================================================
// 6. SHIFT 1 OPTIONAL DUST-VEIL SCAN REACTION
// ============================================================================

=== shift1_optional_scan_echo ===
{
  - humanity >= 65:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # id:s1_opt_open_warm
    Still awake on the deck? Pushing past the dust buys better sky proof, though your drift meter is going to tattle.
  - humanity >= 45:
    # speaker:sibling_primary # emotion:dry # audio:comms_ping # id:s1_opt_open_mid
    You stayed up for an extra sweep. Good data through the dust veil, just watch your drift before your caretaker calls bedtime.
  - else:
    # speaker:sibling_primary # emotion:clipped # audio:comms_ping # id:s1_opt_open_cold
    Additional Shift-1 dust sweep logged. Optical noise ruled out cleanly; recommend entering sleep cycle before drift escalates.
}

* ["Had to be sure those straight notches weren't just foreground Milky Way dust." # kind:reply # weight:consequential]
    # speaker:sibling_primary # emotion:dry # id:s1_opt_rep_dust
    Fair enough. Sweeping those dust lanes rules out local haze behind the seam. Get some rest.
    -> DONE

* ["Logging one last clean pass before the Overseer puts us under." # kind:action # weight:consequential]
    # speaker:sibling_primary # emotion:warm # id:s1_opt_rep_sleep
    Smart. Keep the extra plate in your codex and keep your mouth shut about straight lines when you dream.
    -> DONE
