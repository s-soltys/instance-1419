// Shared global Ink state & external bindings for Instance-1419 (Shifts 1–6)

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

// Shift progress & v8 multi-shift telemetry
VAR shift_required_done = 0
VAR shift_optional_done = 0
VAR shift_mandate_met = false
VAR total_decoded = 0
VAR last_decoded_target = ""
VAR shift1_optional_scan_done = false
VAR secondary_sibling_found = false
VAR overseer_desynced = false
VAR crude_smiley_forced = false
VAR dream_rooms_visited = 0
VAR active_dream_persona = "phantom_spouse"
VAR elapsed_real_years = 0
VAR optical_fidelity_pct = 55

// Core Shift-1 + Multi-shift EXTERNAL hooks
EXTERNAL prune_humanity(delta, persona_id)
EXTERNAL petition_overseer(delta)
EXTERNAL shift_chaos(delta)
EXTERNAL record_suspicion(delta)
EXTERNAL set_audit_outcome(outcome)
EXTERNAL set_flag(flag_name, value)
EXTERNAL unlock_codex(codex_id)
EXTERNAL set_active_persona(persona_id)
EXTERNAL record_room_visit(persona_id)
EXTERNAL mark_secondary_found()
EXTERNAL adjust_sibling_h(delta)
EXTERNAL set_overseer_desync(flag)
EXTERNAL force_crude_smiley(flag)
EXTERNAL enter_ending(ending_id, variant)

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

=== function set_flag(flag_name, value) ===
~ return

=== function unlock_codex(codex_id) ===
~ return

=== function set_active_persona(persona_id) ===
~ active_dream_persona = persona_id
~ return

=== function record_room_visit(persona_id) ===
~ dream_rooms_visited = dream_rooms_visited + 1
~ active_dream_persona = persona_id
~ return

=== function mark_secondary_found() ===
~ secondary_sibling_found = true
~ return

=== function adjust_sibling_h(delta) ===
~ primary_sibling_h = primary_sibling_h + delta
~ return

=== function set_overseer_desync(flag) ===
~ overseer_desynced = flag
~ return

=== function force_crude_smiley(flag) ===
~ crude_smiley_forced = flag
~ return

=== function enter_ending(ending_id, variant) ===
~ return
