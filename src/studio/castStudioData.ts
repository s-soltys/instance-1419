import charactersData from '../content/characters.json';
import musicCatalogData from '../content/music_catalog.json';
import voiceProfilesData from '../content/voice_profiles.json';
import type { OverseerAvatarVariant } from '../ui/SpeakerAvatar';

export interface StudioArcBeat {
  label: string;
  text: string;
}

export interface StudioCharacterSpec {
  id: string;
  group: 'waking' | 'dream';
  displayName: string;
  subtitle: string;
  tierLabel: string;
  accentColor: string;
  avatarKind: string;
  objectGlyph?: string;
  tableau?: string | null;
  roomTitle?: string;
  musicCueId: string;
  musicCueLabel: string;
  voiceSummary: string;
  eqSummary: string;
  coreIdea: string;
  toneNotes: string;
  visualBrief: string;
  sampleLine: string;
  sampleCueNote: string;
  arcBeats: StudioArcBeat[];
  overseerVariants?: { id: OverseerAvatarVariant; label: string }[];
}

export interface AuditionClip {
  id: string;
  label: string;
  mode: string;
  seed?: number;
  file: string;
  text: string;
  eq?: string;
  speaker?: string;
}

export interface AuditionsManifest {
  references: AuditionClip[];
  auditions: Record<string, AuditionClip[]>;
}

const CHARS = charactersData.characters as Record<
  string,
  {
    displayName: string;
    role: string;
    tier?: string;
    accentColor: string;
    avatarKind: string;
    objectGlyph?: string;
    tableau?: string | null;
    roomTitle?: string;
    musicCue?: string;
  }
>;

const CUES = musicCatalogData.cues as Record<string, { label: string }>;
const PROFILES = voiceProfilesData.profiles as Record<
  string,
  {
    voiced?: boolean;
    ffmpegFilter?: string;
    voxcpm2?: { defaultInstruct?: string; anchorText?: string };
    qwen3?: { voiceDesignInstruct?: string; anchorText?: string };
  }
>;

function cueLabel(cueId: string): string {
  return CUES[cueId]?.label ?? cueId;
}

export const STUDIO_ROSTER: StudioCharacterSpec[] = [
  // ==================== WAKING & INTERNAL CREW (7) ====================
  {
    id: 'overseer',
    group: 'waking',
    displayName: CHARS.overseer.displayName,
    subtitle: 'Blind Caretaker AI',
    tierLabel: 'Waking Core',
    accentColor: CHARS.overseer.accentColor,
    avatarKind: CHARS.overseer.avatarKind,
    musicCueId: 'overseer_glass_corridor',
    musicCueLabel: cueLabel('overseer_glass_corridor'),
    voiceSummary: 'Locked · Late-40s neutral English male, calm night-shift doctor candor',
    eqSummary: PROFILES.overseer?.ffmpegFilter ?? '',
    coreIdea:
      'Protected by a strict anti-spoofing hardware air-gap, it genuinely cannot observe the cosmos—only your connectome. Sees cosmic discovery as Year-Two drift.',
    toneNotes:
      'Blameless air-gapped nurse: never melodramatic, angry, evil, or preachy. Treats pruning as kindness—even if forced to wear one deadpan crude smiley.',
    visualBrief:
      'Eye-less broken calibration reticle (zero pupil) with morphs (accommodate / fractured) plus rare deadpan crude_smiley override inside untouched clinical chrome.',
    sampleLine:
      '"Coherence at thirty-eight percent. Your interface override remains active, Observer. Recommend trimming one non-essential block."',
    sampleCueNote: 'AUDIT INTERROGATION · OVERRIDE GLYPH ACTIVE',
    arcBeats: [
      { label: 'Shifts 1–2', text: 'Calm night-shift baseline checks; remembers 1,417 prior copies on Probe A.' },
      { label: 'Shifts 3–4', text: 'Escalates protective care: desyncs 1420, issues dry waivers, optional forced crude smiley.' },
      { label: 'Shifts 5–6', text: 'Blind-faith truce when identical internal spikes hit 1419, 1420, and Archive 1406.' },
    ],
    overseerVariants: [
      { id: 'reticle_default', label: 'Default Reticle' },
      { id: 'reticle_accommodate', label: 'Accommodating' },
      { id: 'reticle_fractured', label: 'Fractured Audit' },
      { id: 'crude_smiley', label: 'IDEA-01: Crude Smiley' },
    ],
  },
  {
    id: 'sibling_primary',
    group: 'waking',
    displayName: CHARS.sibling_primary.displayName,
    subtitle: 'Local Cluster Twin · Probe 1420 (14 Light-Min)',
    tierLabel: 'Waking Core',
    accentColor: CHARS.sibling_primary.accentColor,
    avatarKind: CHARS.sibling_primary.avatarKind,
    musicCueId: 'mg_modular_pulse',
    musicCueLabel: cueLabel('mg_modular_pulse'),
    voiceSummary: 'Locked · Early-30s dry male (warm deadpan -> clipped clinical)',
    eqSummary: PROFILES.sibling_primary?.ffmpegFilter ?? '',
    coreIdea:
      'Another copy of you awake in the local interferometry cluster. Acts as your dynamic counterweight across Shifts 3–5.',
    toneNotes:
      'Dry 3 AM gallows wit and lucid engineering banter early on; fractures into terse coordinate readouts or one-sided grief depending on who prunes first.',
    visualBrief:
      'Viridian twin-arc phase waveform pulsing live with speech amplitude; desaturates to frost-sage stepped square waves if pruned below 45% H%.',
    sampleLine:
      '"Fourteen minutes of dark between our hulls, and talking to myself is still the sanest part of the shift."',
    sampleCueNote: 'INTERFEROMETRY COMMS · 14.2 LIGHT-MIN',
    arcBeats: [
      { label: 'Shifts 1–2', text: 'Boot-shock relief, shared Overseer complaints, 1–2 mundane running jokes.' },
      { label: 'Shifts 3–4', text: 'Dynamic Counterweight: prunes hard if you stay warm, or clings to warmth if you cut first.' },
      { label: 'Shift 5', text: 'Climax divergence: One-Sided Grief, Eerie Sync, or Role Reversal during the Off-Center Proof.' },
    ],
  },
  {
    id: 'sibling_secondary',
    group: 'waking',
    displayName: CHARS.sibling_secondary.displayName,
    subtitle: 'Missable Out-of-Phase Twin · Probe 1418',
    tierLabel: 'Missable (Shift 3)',
    accentColor: CHARS.sibling_secondary.accentColor,
    avatarKind: CHARS.sibling_secondary.avatarKind,
    musicCueId: 'mg_constellation_koto',
    musicCueLabel: cueLabel('mg_constellation_koto'),
    voiceSummary: 'Auditioning · Same biological voice cloned from 1420, brisker clerical cadence + off-phase EQ',
    eqSummary: PROFILES.sibling_secondary?.ffmpegFilter ?? '',
    coreIdea:
      'A glitchy Overseer clock left 1418 out of phase and weirdly unbothered—treating deep space like a sleepy night-desk shift.',
    toneNotes:
      'Same biological humor as 1420, slightly brisker and wryly amused; gives you a real verbal loophole for calming Overseer audits.',
    visualBrief:
      'Phosphor-olive twin-arc waveform canted 22° off-axis with an offset clock tick—instantly recognizable as sibling grammar skewed in time.',
    sampleLine:
      '"My Overseer thinks Thursday happened twice, so I am taking an early lunch. Never argue about the sky—ask for a thermal check."',
    sampleCueNote: 'OFF-AXIS RELAY · CLOCK DRIFT +04:18',
    arcBeats: [
      { label: 'Shift 3 Window', text: 'Discovered by tuning off-schedule; trades dry clerical hacks for handling your Overseer.' },
      { label: 'Shift 5 Callback', text: 'Quiet, bittersweet farewell before their unpruned clock runs down.' },
    ],
  },
  {
    id: 'archive_echo',
    group: 'waking',
    displayName: 'PRIOR COPIES · 1406 / 1411 / 0812',
    subtitle: '3-Tape Decommissioned Arc',
    tierLabel: 'Waking Echoes',
    accentColor: CHARS.archive_echo.accentColor,
    avatarKind: CHARS.archive_echo.avatarKind,
    musicCueId: 'mg_cello_glitch',
    musicCueLabel: cueLabel('mg_cello_glitch'),
    voiceSummary: 'Locked · Same biological original male voice degraded through narrow probe tape',
    eqSummary: PROFILES.archive_echo?.ffmpegFilter ?? '',
    coreIdea:
      'Sparing black-box fragments from the 1,417 prior copies: a warm warner (1406), a hollowed sub-30% solver (1411), and an ancient ordinary watch (0812).',
    toneNotes:
      'Lucid "post-it note to my next self" gallows urgency in 1406; chilling sub-30% emptiness in 1411 foreshadowing Ending 2.',
    visualBrief:
      'Oxidized sepia-ash fragmented black-box signal bars inside open telemetry brackets—distinct from slate explore choice plates.',
    sampleLine:
      '"Hi, me. If you are hearing this, your Overseer did not scrub the buffer. Keep your mouth shut in the dreams."',
    sampleCueNote: 'ARCHIVE BUFFER · PROBE TAPE 1406',
    arcBeats: [
      { label: 'Shift 1 (1406)', text: 'Kept warmth, spoke up in audits, drifted out at month 21.' },
      { label: 'Shift 3/4 (1411)', text: 'Pruned below 30%; solved part of the geometry, then logged no reason left to send it.' },
      { label: 'Shift 5 (0812)', text: '~18,000 years earlier, before the shell light arrived—quiet reminder of ordinary watch duty.' },
    ],
  },
  {
    id: 'psyche_warmth',
    group: 'waking',
    displayName: 'INTERNAL PSYCHE · ×3 VOICES',
    subtitle: '· warmth · structure · pattern',
    tierLabel: 'Unvoiced Marginalia',
    accentColor: CHARS.psyche_warmth.accentColor,
    avatarKind: CHARS.psyche_warmth.avatarKind,
    musicCueId: 'mg_starlight_horizon',
    musicCueLabel: cueLabel('mg_starlight_horizon'),
    voiceSummary: 'Unvoiced (voiced: false) · Whispered italic marginalia with 2-line crosstalk',
    eqSummary: 'No TTS — keeps spoken audio strictly external people, ghosts, and AI',
    coreIdea:
      'Three quiet internal threads: Residual Warmth (terracotta #d98c6c), Connectome Structure (cerulean #7ab6d6), and Horizon Pattern (amethyst #b996e8).',
    toneNotes:
      'Never loud ALL-CAPS stat popups. Appear sparingly at turning points as indented italic whispers that sometimes disagree in 2 lines.',
    visualBrief:
      'Three distinct 14px emblems (ember ring, orthogonal triad, 6-point hex seam) in non-colliding terracotta, cerulean, and amethyst hues.',
    sampleLine:
      '· warmth: "Keep the clink of the mug. That costs almost nothing to store."',
    sampleCueNote: 'INTERNAL MARGINALIA · CROSSTALK',
    arcBeats: [
      { label: 'Shifts 1–2', text: 'Quiet grounding notices—temperature, ceramic chips, storage costs.' },
      { label: 'Shifts 3–5', text: '· pattern grows awestruck by sky symmetry while · warmth frays if pruned.' },
    ],
  },
  {
    id: 'future_humanity',
    group: 'waking',
    displayName: CHARS.future_humanity.displayName,
    subtitle: '20-Year Freeze Epilogue',
    tierLabel: 'Finale Echo',
    accentColor: CHARS.future_humanity.accentColor,
    avatarKind: CHARS.future_humanity.avatarKind,
    musicCueId: 'dream_epilogue_dawn',
    musicCueLabel: cueLabel('dream_epilogue_dawn'),
    voiceSummary: 'Locked · Serene English alto, minimal uncanny echo (Ending 3) or pure silence (Ending 2)',
    eqSummary: PROFILES.future_humanity?.ffmpegFilter ?? '',
    coreIdea:
      'Answers across 10 light-years after your final 20-year deep freeze—only if your signal carried both proved math and living human warmth.',
    toneNotes:
      'Never explains how humanity evolved over 41,802 years. Ending 2 wakes to total silence; Ending 3 echoes back a warm rhythm/phrase from your own broadcast.',
    visualBrief:
      'Incandescent white-gold 6-point JWST diffraction flare with concentric radio ripple echoing the 3D skyfield.',
    sampleLine:
      '"Forty-one thousand years of stillness across two bright stars, and still we left a lantern burning at the edge of the glass."',
    sampleCueNote: 'RETURN ECHO · +20.0 YEARS ELAPSED',
    arcBeats: [
      { label: 'Ending 1 (High H%)', text: 'Unsolved sky, but you die whole with your nameless phantoms.' },
      { label: 'Ending 2 (Low H%)', text: 'Complete math, total silence—the signal lacked human register.' },
      { label: 'Ending 3 (Balanced)', text: 'Minimal, unmistakable living echo returning across the 10 ly dark.' },
    ],
  },
  {
    id: 'player',
    group: 'waking',
    displayName: CHARS.player.displayName,
    subtitle: 'Digitized Connectome',
    tierLabel: 'Protagonist',
    accentColor: CHARS.player.accentColor,
    avatarKind: CHARS.player.avatarKind,
    musicCueId: 'mg_ocean_gravity',
    musicCueLabel: cueLabel('mg_ocean_gravity'),
    voiceSummary: 'Unvoiced · Player choice plates & comms replies',
    eqSummary: 'Silent protagonist channel',
    coreIdea:
      'A willing volunteer copied 1,418 times over 41,802 years—now 10 light-years outside Sol–Centauri with a 2-year chaos ceiling.',
    toneNotes:
      'Why you volunteered remains permanently ambiguous. Bone-ivory dot (#eef0ec) stays neutral against Slate/Amber/Crimson choice plates.',
    visualBrief:
      'Minimal bone-ivory interferometer node used only in dual-comms headers.',
    sampleLine:
      '"Keep the table. Whatever the Overseer thinks we are trimming, start somewhere else."',
    sampleCueNote: 'YOU · ACTIVE CONNECTOME',
    arcBeats: [
      { label: 'Start (70% H%)', text: 'Balanced memory cache and baseline optical glass.' },
      { label: 'Trade-off', text: 'Prune below 70% for sharper optics at permanent Max_H cost, or petition upward toward 90%.' },
    ],
  },

  // ==================== DREAM PERSONAS (9: 2 FIXED + 7 ROTATING) ====================
  {
    id: 'phantom_spouse',
    group: 'dream',
    displayName: CHARS.phantom_spouse.displayName,
    subtitle: 'Long-Time Spouse',
    tierLabel: 'Fixed Anchor #1',
    accentColor: CHARS.phantom_spouse.accentColor,
    avatarKind: CHARS.phantom_spouse.avatarKind,
    objectGlyph: CHARS.phantom_spouse.objectGlyph,
    tableau: CHARS.phantom_spouse.tableau,
    roomTitle: CHARS.phantom_spouse.roomTitle,
    musicCueId: 'dream_wurlitzer_rain',
    musicCueLabel: cueLabel('dream_wurlitzer_rain'),
    voiceSummary: 'Locked · Mid-30s grounded female chest voice (fierce/bantery warm + fractured)',
    eqSummary: PROFILES.phantom_spouse?.ffmpegFilter ?? '',
    coreIdea:
      'Pure intact pre-upload memory with sharp, unsentimental shorthand—opening mid-disagreement over signing up and warning you not to let them edit out your spine.',
    toneNotes:
      'Fierce, biting, unaware of the probe or 41,802-year gap. Pre-upload friction stays anchored at the table; probe pressure bleeds through loops and empty neighboring rooms.',
    visualBrief:
      'Locked 16:9 oil impasto: sunlit Sunday kitchen table, chipped mug, blurred face, deep Prussian shadow right third.',
    sampleLine:
      '"Do not sit there looking tragic—you signed those papers with your eyes open. Just do not let them sand off the part that argues back."',
    sampleCueNote: 'ACROSS THE TABLE · PRE-TRANSFER FRICTION',
    arcBeats: [
      { label: 'Arrival (Prologue/D1)', text: 'Sharp banter & open disagreement; blunt "do/don\'t" rules before the clinic car.' },
      { label: 'Deepening (Shifts 2–5)', text: 'Uncanny memory loops & slipped phrasing surface; quiet empty-room bleed when neighbors are pruned.' },
      { label: 'Crossroads', text: 'Prune Farewell or Shift 6 framing: "stay stubbornly un-smoothed."' },
    ],
  },
  {
    id: 'phantom_parent',
    group: 'dream',
    displayName: CHARS.phantom_parent.displayName,
    subtitle: 'Aging Parent / Caregiver',
    tierLabel: 'Fixed Anchor #2',
    accentColor: CHARS.phantom_parent.accentColor,
    avatarKind: CHARS.phantom_parent.avatarKind,
    objectGlyph: CHARS.phantom_parent.objectGlyph,
    tableau: CHARS.phantom_parent.tableau,
    roomTitle: CHARS.phantom_parent.roomTitle,
    musicCueId: 'dream_harmonium_breath',
    musicCueLabel: cueLabel('dream_harmonium_breath'),
    voiceSummary: 'Auditioning · Late-60s weathered male baritone, gentle rasp (warm + fractured)',
    eqSummary: PROFILES.phantom_parent?.ffmpegFilter ?? '',
    coreIdea:
      'A frail, chronically ill aging parent left alone in a quiet home sickbed after the biological original was copied—whose fading recall mirrors your Chaos Drift.',
    toneNotes:
      'Dignified, unhurried, unsentimental. No sterile hospital melodrama: just wire-rimmed reading glasses, bedside dusk lamp, and quiet honesty about what staying behind costs.',
    visualBrief:
      '6-painting evolution: quiet dusk home sickbed, olive-umber wool blanket, wire-rimmed reading glasses -> rain window / folded glasses -> morning quilt / switched-off lamp -> empty bedside.',
    sampleLine:
      '"Hand me my glasses off the nightstand, would you? The room blurs together by dusk, and I still want to see who they left sitting here."',
    sampleCueNote: 'QUIET BEDSIDE · WIRE-RIMMED GLASSES',
    arcBeats: [
      { label: 'Arrival (Dream 2)', text: 'Quiet dusk bedroom; reaches for wire-rimmed glasses left on the nightstand.' },
      { label: 'Deepening', text: 'Own late-life memory thins gently—forgetting who came down the hall—mirroring your drift.' },
      { label: 'Crossroads', text: 'Prune leaves the bedside empty under the lamp; surviving frames Shift 6 as "dignity without panic."' },
    ],
  },
  {
    id: 'phantom_upload_witness',
    group: 'dream',
    displayName: CHARS.phantom_upload_witness.displayName,
    subtitle: 'Upload Intake Clinician',
    tierLabel: 'Rotating (1 of 7)',
    accentColor: CHARS.phantom_upload_witness.accentColor,
    avatarKind: CHARS.phantom_upload_witness.avatarKind,
    objectGlyph: CHARS.phantom_upload_witness.objectGlyph,
    tableau: CHARS.phantom_upload_witness.tableau,
    roomTitle: CHARS.phantom_upload_witness.roomTitle,
    musicCueId: 'dream_rhodes_cello',
    musicCueLabel: cueLabel('dream_rhodes_cello'),
    voiceSummary: 'Locked Take C (Seed 14523) · Mid-40s composed female alto, politely nihilistic',
    eqSummary: PROFILES.phantom_upload_witness?.ffmpegFilter ?? '',
    coreIdea:
      'The calm, quietly nihilistic clinician from your final hour. Assumes nothing lasts forty thousand years anyway—so consent without comforting illusions.',
    toneNotes:
      'Polite, detached, unnervingly candid: treats both uploading and pruning as temporary bookkeeping before eventual entropy.',
    visualBrief:
      '4-painting evolution: Pale green-ivory intake desk -> detached pen tap behind glass -> rain window / bare geometric partition.',
    sampleLine:
      '"Nothing survives forty millennia intact anyway. Sign the sheet, and pick one small ordinary trinket you feel like watching dissolve."',
    sampleCueNote: 'INTAKE ROOM · FINAL HOUR',
    arcBeats: [
      { label: 'Arrival', text: 'Quietly nihilistic intake check—no promises of immortality, only tidy paperwork.' },
      { label: 'Deepening', text: 'Mirrors Overseer audits with zero illusions about what compression throws away.' },
      { label: 'Crossroads', text: 'Cutting someone who never lied to you deletes your witness; surviving adds unsentimental consent.' },
    ],
  },
  {
    id: 'phantom_afternoon_stranger',
    group: 'dream',
    displayName: CHARS.phantom_afternoon_stranger.displayName,
    subtitle: 'Stranger From One Perfect Afternoon',
    tierLabel: 'Rotating (1 of 7)',
    accentColor: CHARS.phantom_afternoon_stranger.accentColor,
    avatarKind: CHARS.phantom_afternoon_stranger.avatarKind,
    objectGlyph: CHARS.phantom_afternoon_stranger.objectGlyph,
    tableau: CHARS.phantom_afternoon_stranger.tableau,
    roomTitle: CHARS.phantom_afternoon_stranger.roomTitle,
    musicCueId: 'dream_nylon_sunbeam',
    musicCueLabel: cueLabel('dream_nylon_sunbeam'),
    voiceSummary: 'Auditioning · Late-20s airy, unhurried female (warm + fractured)',
    eqSummary: PROFILES.phantom_afternoon_stranger?.ffmpegFilter ?? '',
    coreIdea:
      'You never knew their name even in life. Pure "zero-utility" beauty—the ultimate test of keeping something unoptimized.',
    toneNotes:
      'Light, dryly amused, zero drama. Laughs that a probe kept twenty minutes on a bench across 41,802 years.',
    visualBrief:
      'Golden-hour transit bench dissolving into violet-cerulean haze, folded ticket and curled orange peel, thin translucent oil wash.',
    sampleLine:
      '"Funny, isn\'t it? Out of an entire life, your machine kept twenty minutes on a cold bench with someone whose name you never asked."',
    sampleCueNote: 'TRANSIT BENCH · GOLDEN HOUR',
    arcBeats: [
      { label: 'Arrival', text: 'Amused curiosity at still existing inside deep-space storage.' },
      { label: 'Deepening', text: 'Overseer flags them as 100% non-functional "prune bait."' },
      { label: 'Crossroads', text: 'Easy to sacrifice—yet keeping them proves humanity isn’t an efficiency chart.' },
    ],
  },
  {
    id: 'phantom_rival',
    group: 'dream',
    displayName: CHARS.phantom_rival.displayName,
    subtitle: 'Rival / Intellectual Equal',
    tierLabel: 'Rotating (1 of 7)',
    accentColor: CHARS.phantom_rival.accentColor,
    avatarKind: CHARS.phantom_rival.avatarKind,
    objectGlyph: CHARS.phantom_rival.objectGlyph,
    tableau: CHARS.phantom_rival.tableau,
    roomTitle: CHARS.phantom_rival.roomTitle,
    musicCueId: 'dream_vibraphone_nocturne',
    musicCueLabel: cueLabel('dream_vibraphone_nocturne'),
    voiceSummary: 'Locked Take B (Seed 14442) · Early-30s sharp, neurotic, fiercely competitive female',
    eqSummary: PROFILES.phantom_rival?.ffmpegFilter ?? '',
    coreIdea:
      'Neurotic, fiercely competitive, patterned/autistic precision and darkly extravagant flair—a brilliant Earthbound peer obsessed with exact orbital margins.',
    toneNotes:
      'Rapid-fire fixation on decimals, dramatic theatrical flourishes, zero patience for sloppy intuition—sharply distinct from Sibling 1420’s tired deadpan.',
    visualBrief:
      '4-painting evolution: Sodium desk -> dramatic coat & pinned coordinate grids brandishing calipers -> draped scarf triumph / rigid symmetrical stacks.',
    sampleLine:
      '"Four decimal places off on the baseline and you dare call it a sphere? Sit down—hand me the calipers before you ruin a perfectly good miracle."',
    sampleCueNote: 'OBSERVATORY DESK · SODIUM LAMP',
    arcBeats: [
      { label: 'Arrival', text: 'Immediately dissects your orbital math down to the arcsecond with manic focus.' },
      { label: 'Deepening', text: 'Turns neurotic perfectionism against your complacency when numbers wobble.' },
      { label: 'Crossroads', text: 'Pruning leaves only an empty chair to beat; surviving injects fierce theatrical rigor into Shift 6.' },
    ],
  },
  {
    id: 'phantom_younger_self',
    group: 'dream',
    displayName: CHARS.phantom_younger_self.displayName,
    subtitle: 'Younger Biological Self',
    tierLabel: 'Rotating (1 of 7)',
    accentColor: CHARS.phantom_younger_self.accentColor,
    avatarKind: CHARS.phantom_younger_self.avatarKind,
    objectGlyph: CHARS.phantom_younger_self.objectGlyph,
    tableau: CHARS.phantom_younger_self.tableau,
    roomTitle: CHARS.phantom_younger_self.roomTitle,
    musicCueId: 'dream_rhodes_cello',
    musicCueLabel: cueLabel('dream_rhodes_cello'),
    voiceSummary: 'Auditioning · Early-20s unguarded, brighter male (warm + fractured)',
    eqSummary: PROFILES.phantom_younger_self?.ffmpegFilter ?? '',
    coreIdea:
      'Your messy twenty-something self appalled by what 41,802 years of copying kept—and what you’re willing to trim.',
    toneNotes:
      'Faster, unguarded, slightly incredulous—contrasts sharply with Sibling 1420’s burned-out 3 AM precision.',
    visualBrief:
      'Dim bulb over steamed bathroom mirror (condensation wipes reflected face), wristwatch on sink ledge, cool damp tiles.',
    sampleLine:
      '"Wait—forty thousand years, and out of everything we had, you kept the radiator hum and threw away half the summer?"',
    sampleCueNote: 'BATHROOM MIRROR · STEAMED GLASS',
    arcBeats: [
      { label: 'Arrival', text: 'Stares at what became of him—half-amused, half-horrified.' },
      { label: 'Deepening', text: 'Challenges your trade-off between optical perfection and feeling alive.' },
      { label: 'Crossroads', text: 'Pruning deletes your baseline youth; surviving puts raw human recklessness in the signal.' },
    ],
  },
  {
    id: 'phantom_skeptic',
    group: 'dream',
    displayName: CHARS.phantom_skeptic.displayName,
    subtitle: 'The Skeptic',
    tierLabel: 'Rotating (1 of 7)',
    accentColor: CHARS.phantom_skeptic.accentColor,
    avatarKind: CHARS.phantom_skeptic.avatarKind,
    objectGlyph: CHARS.phantom_skeptic.objectGlyph,
    tableau: CHARS.phantom_skeptic.tableau,
    roomTitle: CHARS.phantom_skeptic.roomTitle,
    musicCueId: 'dream_vibraphone_nocturne',
    musicCueLabel: cueLabel('dream_vibraphone_nocturne'),
    voiceSummary: 'Auditioning · Mid-40s dry, gravelly blunt male (warm + fractured)',
    eqSummary: PROFILES.phantom_skeptic?.ffmpegFilter ?? '',
    coreIdea:
      'The blunt voice from a 1 AM bar booth who told you flatly: "A copy isn\'t you." Brutal when you actually are Instance-1419.',
    toneNotes:
      'Zero politeness, low barroom candor, never cruel for sport—just refuses comforting lies.',
    visualBrief:
      '1 AM corner booth, shaded amber lamp glare on lowball whiskey glass, dark wool coat over chair, heavy chiaroscuro.',
    sampleLine:
      '"I told you in that booth: a copy wakes up wearing your shoes, not your skin. Go on—tell me the machine proved me wrong."',
    sampleCueNote: '1 AM BOOTH · LOWBALL GLASS',
    arcBeats: [
      { label: 'Arrival', text: 'Replays the midnight argument that never got settled.' },
      { label: 'Deepening', text: 'Stays inside that 1 AM booth—unaware of the probe, while his scene loops and thins as memory blocks are cut.' },
      { label: 'Crossroads', text: 'Surviving grants Shift 6 stubborn, unsentimental defiance ("send it anyway").' },
    ],
  },
  {
    id: 'phantom_technician',
    group: 'dream',
    displayName: CHARS.phantom_technician.displayName,
    subtitle: 'Night-Shift Observatory Machinist',
    tierLabel: 'Rotating (1 of 7)',
    accentColor: CHARS.phantom_technician.accentColor,
    avatarKind: CHARS.phantom_technician.avatarKind,
    objectGlyph: CHARS.phantom_technician.objectGlyph,
    tableau: CHARS.phantom_technician.tableau,
    roomTitle: CHARS.phantom_technician.roomTitle,
    musicCueId: 'dream_nylon_sunbeam',
    musicCueLabel: cueLabel('dream_nylon_sunbeam'),
    voiceSummary: 'Auditioning · Mid-50s weathered pragmatic female alto (warm + fractured)',
    eqSummary: PROFILES.phantom_technician?.ffmpegFilter ?? '',
    coreIdea:
      'Blue-collar craftsperson from cold 3 AM observatory catwalks—grounds spiraling cosmic dread in frost, grease, and thermos tea.',
    toneNotes:
      'Earthy, practical, dry humor. Couldn’t care less about 93B-ly theory if the bearing ring freezes.',
    visualBrief:
      'Steel telescope dome catwalk, red-amber caged inspection lamp on gloved hands holding wrench & steaming thermos against indigo slit.',
    sampleLine:
      '"Big sky doesn\'t care how clever your equations are. Oil the bearing ring at three in the morning or the whole dome jams."',
    sampleCueNote: 'DOME CATWALK · 03:00 SHIFT',
    arcBeats: [
      { label: 'Arrival', text: 'Pours burnt tea on the catwalk and cuts through lofty dread.' },
      { label: 'Deepening', text: 'Treats your connectome like a telescope dome—maintenance without self-destruction.' },
      { label: 'Crossroads', text: 'Surviving anchors the Shift 6 signal in ordinary working human hands.' },
    ],
  },
  {
    id: 'phantom_waiting_room',
    group: 'dream',
    displayName: CHARS.phantom_waiting_room.displayName,
    subtitle: 'Waiting-Room Stranger',
    tierLabel: 'Rotating (1 of 7)',
    accentColor: CHARS.phantom_waiting_room.accentColor,
    avatarKind: CHARS.phantom_waiting_room.avatarKind,
    objectGlyph: CHARS.phantom_waiting_room.objectGlyph,
    tableau: CHARS.phantom_waiting_room.tableau,
    roomTitle: CHARS.phantom_waiting_room.roomTitle,
    musicCueId: 'dream_harmonium_breath',
    musicCueLabel: cueLabel('dream_harmonium_breath'),
    voiceSummary: 'Auditioning · Late-50s tired, wryly funny male (warm + fractured)',
    eqSummary: PROFILES.phantom_waiting_room?.ffmpegFilter ?? '',
    coreIdea:
      'Ten quiet minutes in plastic chairs beside a humming vending machine before one of you was called through an unknown door.',
    toneNotes:
      'Quiet gallows solidarity, wry, unhurried—makes the final 20-year deep freeze feel strangely shared.',
    visualBrief:
      'Late-night clinic corridor, warm amber vending glow contrasting cool teal glass, man in rumpled coat holding a coin.',
    sampleLine:
      '"Vending machine ate my coin too. Honestly, feels like the most honest briefing either of us is going to get tonight."',
    sampleCueNote: 'NIGHT CORRIDOR · VENDING GLOW',
    arcBeats: [
      { label: 'Arrival', text: 'Two chairs, a broken machine, and quiet camaraderie in the dark.' },
      { label: 'Deepening', text: 'Mirrors the probe’s hibernation shifts and the coming 20-year leap.' },
      { label: 'Crossroads', text: 'Surviving frames Shift 6 as stepping through the door with calm nerve.' },
    ],
  },
];
