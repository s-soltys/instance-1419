import fs from 'node:fs';
import path from 'node:path';
import { Story } from 'inkjs';

const ROOT = path.resolve(process.cwd());
const balance = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/balance.json'), 'utf8'));
const shiftsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/shifts.json'), 'utf8'));
const anomaliesData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/anomalies.json'), 'utf8'));
const storyletsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/storylets.json'), 'utf8'));
const COMPILED_DIR = path.join(ROOT, 'src/content/dialogue/compiled');
const compiledInkFiles = fs.existsSync(COMPILED_DIR)
  ? fs.readdirSync(COMPILED_DIR).filter((f) => f.endsWith('.ink.json')).sort()
  : [];
const compiledStories = compiledInkFiles.map((file) => ({
  file,
  json: JSON.parse(fs.readFileSync(path.join(COMPILED_DIR, file), 'utf8')),
}));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function evaluateEnding(state) {
  const rules = shiftsData.endings;
  if (state.anomalyProgress >= rules.completeThresholdAnomaly) {
    return state.humanity < rules.coldThresholdHumanity
      ? 'ending_cold_complete'
      : 'ending_sweet_spot';
  }
  return 'ending_whole_incomplete';
}

// ============================================================================
// PART 1: 500-Run 6-Shift Economy Simulation (2 required + 0..2 optional scans)
// ============================================================================
function runArchetype(archetype, rand) {
  const s0 = balance.startingState;
  const state = {
    humanity: s0.humanity,
    maxHumanity: s0.maxHumanity,
    chaosDrift: s0.chaosDrift,
    subjectiveMonthsLeft: s0.subjectiveMonthsLeft,
    opticalFidelity: s0.opticalFidelity,
    anomalyProgress: s0.anomalyProgress,
    overseerSuspicion: s0.overseerSuspicion,
    prunedCount: 0,
    ceilingDropped: false,
  };

  const applyPrune = (delta = balance.pruning.defaultDelta) => {
    const prevH = state.humanity;
    const rawNext = Math.max(5, prevH - delta);
    const permanentDrop =
      rawNext < balance.pruning.permanentCeilingThreshold
        ? Math.min(delta, balance.pruning.permanentCeilingThreshold - rawNext)
        : 0;
    if (permanentDrop > 0) {
      state.maxHumanity = Math.max(
        balance.pruning.minMaxHumanity,
        Math.min(state.maxHumanity - delta, balance.pruning.permanentCeilingThreshold - 1)
      );
      state.ceilingDropped = true;
    }
    state.humanity = Math.min(state.maxHumanity, rawNext);
    state.chaosDrift = Math.max(0, state.chaosDrift - balance.pruning.chaosRelief);
    state.subjectiveMonthsLeft += balance.pruning.lifespanGainMonths;
    state.opticalFidelity = Math.min(1.0, state.opticalFidelity + balance.pruning.opticalFidelityBonus);
    state.prunedCount++;

    if (state.humanity > state.maxHumanity) {
      throw new Error(`Invariant violated: humanity ${state.humanity} > maxHumanity ${state.maxHumanity}`);
    }
    if (state.ceilingDropped && state.maxHumanity >= balance.pruning.permanentCeilingThreshold) {
      throw new Error(`Invariant violated: maxHumanity ${state.maxHumanity} stayed >= 70 after pruning <70`);
    }
  };

  const canPetition = () => {
    const p = balance.petitionUpward;
    return (
      state.humanity < state.maxHumanity &&
      state.chaosDrift < (p.denialChaosThreshold ?? 78) &&
      state.overseerSuspicion < (p.denialSuspicionThreshold ?? 4) &&
      state.subjectiveMonthsLeft >= (p.minMonthsRequired ?? 4)
    );
  };

  const applyPetition = (delta = balance.petitionUpward.defaultDelta) => {
    if (!canPetition()) return false;
    state.humanity = Math.min(state.maxHumanity, state.humanity + delta);
    state.chaosDrift = Math.min(100, state.chaosDrift + balance.petitionUpward.chaosCost);
    state.subjectiveMonthsLeft = Math.max(2, state.subjectiveMonthsLeft - balance.petitionUpward.lifespanCostMonths);
    state.opticalFidelity = Math.max(
      balance.petitionUpward.minOpticalFidelity,
      state.opticalFidelity - balance.petitionUpward.opticalFidelityPenalty
    );
    return true;
  };

  const payouts = balance.minigames?.payouts ?? {
    clean: { anomalyGain: 4, chaosDelta: 3, suspicionDelta: 0 },
    partial: { anomalyGain: 2, chaosDelta: 2, suspicionDelta: 0 },
  };
  const lockGain = 1;
  const optBonus = balance.minigames?.optionalAnomalyBonus ?? 3;
  const optChaos = balance.minigames?.optionalChaosDelta ?? 6;
  const optSusp = balance.minigames?.optionalSuspicionDelta ?? 1;
  const clarityThresh = balance.minigames?.clarityProofBonusThreshold ?? 0.68;
  const clarityBonus = balance.minigames?.clarityProofBonusAnomaly ?? 2;

  for (let i = 0; i < shiftsData.shifts.length; i++) {
    const shiftDef = shiftsData.shifts[i];
    const reqTargets = shiftDef.requiredTargets ?? [];
    const optTargets = shiftDef.optionalTargets ?? [];
    if (reqTargets.length !== 2) {
      throw new Error(`Shift ${shiftDef.shift} must define 2 requiredTargets (found ${reqTargets.length})`);
    }
    if (state.subjectiveMonthsLeft <= 0) {
      throw new Error(`Soft-lock: subjectiveMonthsLeft depleted before Shift ${shiftDef.shift}`);
    }

    const applyScan = (grade, isOptional = false) => {
      const p = payouts[grade] ?? payouts.clean;
      const clarity = state.opticalFidelity >= clarityThresh ? clarityBonus : 0;
      const gain = lockGain + p.anomalyGain + (isOptional ? optBonus : 0) + clarity;
      state.anomalyProgress = Math.min(100, state.anomalyProgress + gain);
      state.chaosDrift = Math.max(0, Math.min(100, state.chaosDrift + p.chaosDelta + (isOptional ? optChaos : 0)));
      state.overseerSuspicion += p.suspicionDelta + (isOptional ? optSusp : 0);
    };

    // Complete 2 required targets + 0..optionalTargets.length push-your-luck optional targets
    if (archetype === 'pure_warmth') {
      // Pure warmth completes all 12 required scans cleanly but skips optional risks & never prunes -> ~60% (Ending 1)
      applyScan('clean', false);
      applyScan('clean', false);
    } else if (archetype === 'cautious_sleeper') {
      applyScan('clean', false);
      applyScan('clean', false);
      if (optTargets.length > 0 && rand() < 0.45) {
        applyScan('clean', true);
      }
    } else if (archetype === 'balanced_sweet_spot') {
      applyScan('clean', false);
      applyScan('clean', false);
      const optToRun = Math.min(optTargets.length, rand() < 0.65 ? 1 : 0);
      for (let o = 0; o < optToRun; o++) {
        applyScan('clean', true);
      }
    } else if (archetype === 'ruthless_pruner') {
      for (let r = 0; r < reqTargets.length; r++) {
        applyScan('clean', false);
      }
      for (let o = 0; o < optTargets.length; o++) {
        if (rand() < 0.65) applyScan('clean', true);
      }
    } else {
      // reckless_scanner: pushes every optional scan
      for (let r = 0; r < reqTargets.length; r++) {
        applyScan('clean', false);
      }
      for (let o = 0; o < optTargets.length; o++) {
        applyScan('clean', true);
      }
    }

    // Dream / Overseer Audit resolution
    if (archetype === 'pure_warmth') {
      if (!applyPetition()) {
        state.chaosDrift = Math.max(0, state.chaosDrift - 10);
        state.overseerSuspicion += 1;
      }
    } else if (archetype === 'ruthless_pruner') {
      if (state.humanity > 20) {
        applyPrune();
      }
    } else if (archetype === 'balanced_sweet_spot') {
      if (state.chaosDrift >= shiftDef.overseerAuditChaosThreshold && state.humanity > 56) {
        applyPrune();
      } else if (state.humanity < 55 && canPetition()) {
        applyPetition();
      } else {
        state.chaosDrift = Math.max(0, state.chaosDrift - 10);
      }
    } else if (archetype === 'reckless_scanner') {
      if (state.chaosDrift > 52 && state.humanity > 48) {
        applyPrune();
      } else {
        state.overseerSuspicion += 1;
      }
    } else if (archetype === 'cautious_sleeper') {
      if (state.chaosDrift > 38 && state.humanity > 58) {
        applyPrune();
      } else {
        state.chaosDrift = Math.max(0, state.chaosDrift - 12);
      }
    }

    // Hibernation transition to next shift
    if (i < shiftsData.shifts.length - 1) {
      const nextDef = shiftsData.shifts[i + 1];
      state.chaosDrift = Math.max(
        0,
        Math.min(100, state.chaosDrift + nextDef.baseChaosPerShift - balance.dreamDefrag.chaosRelief)
      );
      state.subjectiveMonthsLeft = Math.max(1, state.subjectiveMonthsLeft - shiftDef.monthsPerShift);
    }

    if (state.chaosDrift < 0 || state.chaosDrift > 100) {
      throw new Error(`Chaos out of bounds: ${state.chaosDrift}`);
    }
    if (state.prunedCount > 0 && state.humanity < balance.pruning.permanentCeilingThreshold && !state.ceilingDropped) {
      throw new Error('Canon invariant failed: pruned below 70% without dropping maxHumanity');
    }
  }

  return {
    archetype,
    ending: evaluateEnding(state),
    humanity: state.humanity,
    maxHumanity: state.maxHumanity,
    anomalyProgress: state.anomalyProgress,
    chaosDrift: state.chaosDrift,
    monthsLeft: state.subjectiveMonthsLeft,
  };
}

const ARCHETYPES = [
  'pure_warmth',
  'ruthless_pruner',
  'balanced_sweet_spot',
  'reckless_scanner',
  'cautious_sleeper',
];

const rand = mulberry32(1419);
const endingCounts = {
  ending_whole_incomplete: 0,
  ending_cold_complete: 0,
  ending_sweet_spot: 0,
};

const TOTAL_RUNS = 500;
for (let r = 0; r < TOTAL_RUNS; r++) {
  const arch = ARCHETYPES[r % ARCHETYPES.length];
  const res = runArchetype(arch, rand);
  endingCounts[res.ending]++;
}

for (const [endingId, count] of Object.entries(endingCounts)) {
  if (count === 0) {
    console.error(`[sim-playthroughs] FAILED: Unreachable ending "${endingId}" across ${TOTAL_RUNS} runs.`);
    process.exit(1);
  }
}

if (anomaliesData.anomalies.length === 0) {
  console.error('[sim-playthroughs] FAILED: anomalies.json empty.');
  process.exit(1);
}

// ============================================================================
// PART 2: Real Compiled Ink Traversal, Implemented Shifts & Storylet Conditions
// ============================================================================
if (compiledStories.length === 0) {
  console.error('[sim-playthroughs] FAILED: no compiled .ink.json files found.');
  process.exit(1);
}

function findStoryJsonForKnot(knotName) {
  for (const item of compiledStories) {
    const dict = item.json?.root?.[2] ?? {};
    if (knotName in dict) return item.json;
  }
  return null;
}

function createInkHarnessStory(storyJson = compiledStories[0].json) {
  const simState = {
    humanity: balance.startingState.humanity,
    maxHumanity: balance.startingState.maxHumanity,
    chaosDrift: balance.startingState.chaosDrift,
    overseerSuspicion: balance.startingState.overseerSuspicion,
    prunedPersonas: [],
    lastAuditOutcome: 'none',
    shift: 1,
    primarySiblingH: balance.startingState.primarySiblingH ?? 68,
    storyFlags: new Map(),
    codexUnlocked: new Set(),
    activeDreamPersonaId: 'phantom_spouse',
    dreamVisitedRooms: new Set(),
    secondarySiblingFound: false,
    overseerDesynced: false,
    crudeSmileyForced: false,
    endingId: null,
  };

  const story = new Story(storyJson);
  const safeSetVar = (name, value) => {
    try {
      if (story.variablesState.GlobalVariableExistsWithName?.(name) || name in story.variablesState) {
        story.variablesState.$(name, value);
      }
    } catch {
      // Variable not declared in this compiled Ink file
    }
  };
  story.BindExternalFunction(
    'prune_humanity',
    (delta, personaId) => {
      const d = Number(delta);
      const rawNext = Math.max(5, simState.humanity - d);
      if (rawNext < balance.pruning.permanentCeilingThreshold) {
        simState.maxHumanity = Math.max(balance.pruning.minMaxHumanity, simState.maxHumanity - d);
      }
      simState.humanity = Math.min(simState.maxHumanity, rawNext);
      const pid = String(personaId);
      if (!simState.prunedPersonas.includes(pid)) {
        simState.prunedPersonas.push(pid);
      }
    },
    false
  );
  story.BindExternalFunction(
    'petition_overseer',
    (delta) => {
      simState.humanity = Math.min(simState.maxHumanity, simState.humanity + Number(delta));
    },
    false
  );
  story.BindExternalFunction(
    'shift_chaos',
    (delta) => {
      simState.chaosDrift = Math.max(0, Math.min(100, simState.chaosDrift + Number(delta)));
    },
    false
  );
  story.BindExternalFunction(
    'record_suspicion',
    (delta) => {
      simState.overseerSuspicion += Number(delta);
    },
    false
  );
  story.BindExternalFunction(
    'set_audit_outcome',
    (outcome) => {
      simState.lastAuditOutcome = String(outcome);
    },
    false
  );
  story.BindExternalFunction(
    'set_flag',
    (flagName, value) => {
      simState.storyFlags.set(String(flagName), Boolean(value));
    },
    false
  );
  story.BindExternalFunction(
    'unlock_codex',
    (codexId) => {
      simState.codexUnlocked.add(String(codexId));
    },
    false
  );
  story.BindExternalFunction(
    'set_active_persona',
    (personaId) => {
      simState.activeDreamPersonaId = String(personaId);
    },
    false
  );
  story.BindExternalFunction(
    'record_room_visit',
    (personaId) => {
      const pid = String(personaId);
      simState.activeDreamPersonaId = pid;
      simState.dreamVisitedRooms.add(pid);
    },
    false
  );
  story.BindExternalFunction(
    'mark_secondary_found',
    () => {
      simState.secondarySiblingFound = true;
    },
    false
  );
  story.BindExternalFunction(
    'adjust_sibling_h',
    (delta) => {
      simState.primarySiblingH = Math.max(5, Math.min(95, simState.primarySiblingH + Number(delta)));
    },
    false
  );
  story.BindExternalFunction(
    'set_overseer_desync',
    (flag) => {
      simState.overseerDesynced = Boolean(flag);
    },
    false
  );
  story.BindExternalFunction(
    'force_crude_smiley',
    (flag) => {
      simState.crudeSmileyForced = Boolean(flag);
    },
    false
  );
  story.BindExternalFunction(
    'enter_ending',
    (endingId) => {
      simState.endingId = String(endingId);
    },
    false
  );

  const syncVars = (overrides = {}) => {
    Object.assign(simState, overrides);
    safeSetVar('humanity', simState.humanity);
    safeSetVar('max_humanity', simState.maxHumanity);
    safeSetVar('chaos_drift', simState.chaosDrift);
    safeSetVar('anomaly_progress', 25);
    safeSetVar('primary_sibling_h', simState.primarySiblingH);
    safeSetVar('overseer_suspicion', simState.overseerSuspicion);
    safeSetVar('subjective_months', 24);
    safeSetVar('spouse_pruned', simState.prunedPersonas.includes('phantom_spouse'));
    safeSetVar('last_audit_outcome', simState.lastAuditOutcome);
    safeSetVar('current_shift', simState.shift);
    safeSetVar('shift_required_done', 2);
    safeSetVar('shift_optional_done', 0);
    safeSetVar('shift_mandate_met', true);
    safeSetVar('total_decoded', 2);
    safeSetVar('secondary_sibling_found', simState.secondarySiblingFound);
    safeSetVar('overseer_desynced', simState.overseerDesynced);
    safeSetVar('crude_smiley_forced', simState.crudeSmileyForced);
    safeSetVar('dream_rooms_visited', simState.dreamVisitedRooms.size);
    safeSetVar('active_dream_persona', simState.activeDreamPersonaId);
    safeSetVar('elapsed_real_years', (simState.shift - 1) * 0.6);
    safeSetVar('optical_fidelity_pct', 55);
  };

  return { story, simState, syncVars };
}

function traverseRealInkKnot(knotName, rng, stateOverrides = {}) {
  const storyJson = findStoryJsonForKnot(knotName);
  if (!storyJson) {
    throw new Error(`[sim-playthroughs] Missing compiled Ink knot "${knotName}"`);
  }
  const { story, simState, syncVars } = createInkHarnessStory(storyJson);
  syncVars(stateOverrides);
  story.ChoosePathString(knotName);

  const lines = [];
  let steps = 0;
  const MAX_STEPS = 200;

  while (steps < MAX_STEPS) {
    while (story.canContinue) {
      const txt = story.Continue()?.trim();
      if (txt) lines.push(txt);
      steps++;
      if (steps >= MAX_STEPS) {
        throw new Error(`[sim-playthroughs] Ink infinite loop in knot "${knotName}"`);
      }
    }
    const choices = story.currentChoices;
    if (choices.length === 0) break;

    // Avoid infinitely looping on optional # kind:ask choices by picking advancing choices after a couple asks
    const nonAskChoices = choices.filter((c) => !(c.tags ?? []).some((t) => t.trim() === 'kind:ask'));
    const pool = steps > 40 && nonAskChoices.length > 0 ? nonAskChoices : choices;
    const pick = pool[Math.floor(rng() * pool.length)];
    story.ChooseChoiceIndex(pick.index);
    syncVars();
    steps++;
  }

  if (lines.length === 0) {
    throw new Error(`[sim-playthroughs] Ink knot "${knotName}" produced 0 text lines`);
  }
  return { lines, simState };
}

// Dynamically iterate implemented shifts + verify StoryletScheduler-style conditions
const implementedShifts = shiftsData.shifts.filter((s) => s.status === 'implemented');
if (implementedShifts.length === 0) {
  throw new Error('[sim-playthroughs] No implemented shifts found in shifts.json');
}

const dynamicHookKnots = [];
for (const sh of implementedShifts) {
  const hooks = sh.narrativeHooks ?? {};
  for (const k of [hooks.openingKnot, hooks.postRequiredKnot, hooks.dreamKnot]) {
    if (k) dynamicHookKnots.push(k);
  }
}

const ENTRY_KNOTS = Array.from(
  new Set([
    'intro_prologue_assistant',
    'intro_sibling_first_call',
    'overseer_interrogation',
    'future_humanity_echo',
    ...dynamicHookKnots,
    ...storyletsData.storylets.map((s) => s.knot),
  ])
);

function pickStoryletSim(simCtx, targetMode) {
  const shiftDef = shiftsData.shifts.find((s) => s.shift === simCtx.shift);
  const optIds = shiftDef?.optionalTargets ?? [];
  const optDone = optIds.filter((id) => simCtx.decodedTargets.includes(id)).length;
  const reqDone = (shiftDef?.requiredTargets ?? []).filter((id) => simCtx.decodedTargets.includes(id)).length;
  const eligible = storyletsData.storylets
    .filter((spec) => {
      if (spec.mode !== targetMode) return false;
      if (spec.once && simCtx.completedStorylets.includes(spec.id)) return false;
      const c = spec.conditions ?? {};
      if (c.exactShift !== undefined && simCtx.shift !== c.exactShift) return false;
      if (c.minShift !== undefined && simCtx.shift < c.minShift) return false;
      if (c.maxShift !== undefined && simCtx.shift > c.maxShift) return false;
      if (c.minAnomalyProgress !== undefined && simCtx.anomalyProgress < c.minAnomalyProgress) return false;
      if (c.minRequiredScansInShift !== undefined && reqDone < c.minRequiredScansInShift) return false;
      if (c.minOptionalScansThisShift !== undefined && optDone < c.minOptionalScansThisShift) return false;
      return true;
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return eligible[0] ?? null;
}

// Verify StoryletScheduler condition logic (e.g. shift1_optional_scan_echo priority & exactShift)
{
  const s1NoOpt = pickStoryletSim({ shift: 1, anomalyProgress: 25, decodedTargets: ['sol_centauri_bearing', 'cluster_j1419_a'], completedStorylets: [] }, 'waking_3d');
  if (s1NoOpt?.id !== 'sibling_first_contact') {
    throw new Error(`[sim-playthroughs] Expected sibling_first_contact when 0 optional scans done, got ${s1NoOpt?.id}`);
  }
  const s1WithOpt = pickStoryletSim(
    { shift: 1, anomalyProgress: 25, decodedTargets: ['sol_centauri_bearing', 'cluster_j1419_a', 'carina_rift_nebula'], completedStorylets: [] },
    'waking_3d'
  );
  if (s1WithOpt?.id !== 'shift1_optional_scan_echo') {
    throw new Error(`[sim-playthroughs] Expected shift1_optional_scan_echo when Shift 1 optional scan done, got ${s1WithOpt?.id}`);
  }
  const s2WithOpt = pickStoryletSim(
    { shift: 2, anomalyProgress: 25, decodedTargets: ['fomalhaut_glare_well', 'dust_polarized_veil', 'kepler_transit_arc'], completedStorylets: ['sibling_first_contact'] },
    'waking_3d'
  );
  if (s2WithOpt?.id === 'shift1_optional_scan_echo') {
    throw new Error('[sim-playthroughs] shift1_optional_scan_echo must not trigger on Shift 2');
  }
}

const inkRand = mulberry32(41802);
const HUM_PRESETS = [84, 70, 56, 32];
let inkTraversals = 0;
for (let i = 0; i < 120; i++) {
  const knot = ENTRY_KNOTS[i % ENTRY_KNOTS.length];
  const hum = HUM_PRESETS[i % HUM_PRESETS.length];
  const shift = i % 3 === 0 ? 2 : 1;
  traverseRealInkKnot(knot, inkRand, { humanity: hum, shift });
  inkTraversals++;
}

// Explicit deterministic Shift-2 prune check via real compiled Ink
{
  const { story, simState, syncVars } = createInkHarnessStory();
  syncVars({ humanity: 70, maxHumanity: 90, shift: 2 });
  story.ChoosePathString('overseer_interrogation');
  let guard = 0;
  while (guard++ < 40) {
    while (story.canContinue) story.Continue();
    if (story.currentChoices.length === 0) break;
    const pruneChoice = story.currentChoices.find((c) =>
      (c.tags ?? []).some((t) => t.trim().toLowerCase() === 'kind:prune')
    );
    const chosen = pruneChoice ?? story.currentChoices[story.currentChoices.length - 1];
    story.ChooseChoiceIndex(chosen.index);
  }
  if (simState.maxHumanity >= 90 || simState.humanity >= 70 || !simState.prunedPersonas.includes('phantom_spouse')) {
    throw new Error(
      `[sim-playthroughs] Real Ink Shift-2 prune branch failed to drop maxHumanity/prune phantom_spouse: ${JSON.stringify(simState)}`
    );
  }
}

console.log(
  `[sim-playthroughs] PASS (${TOTAL_RUNS} economy runs + ${inkTraversals} real-Ink knot traversals across ${ENTRY_KNOTS.length} knots, 0 soft-locks, permanent ceiling invariant verified): ` +
    JSON.stringify(endingCounts)
);
