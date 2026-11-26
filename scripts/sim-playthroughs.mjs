import fs from 'node:fs';
import path from 'node:path';
import { Story } from 'inkjs';

const ROOT = path.resolve(process.cwd());
const balance = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/balance.json'), 'utf8'));
const shiftsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/shifts.json'), 'utf8'));
const anomaliesData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/anomalies.json'), 'utf8'));
const storyletsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/storylets.json'), 'utf8'));
const compiledInk = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/content/dialogue/compiled/spike_shift1.ink.json'), 'utf8')
);

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
      state.maxHumanity = Math.max(balance.pruning.minMaxHumanity, state.maxHumanity - delta);
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
  };

  const applyPetition = (delta = balance.petitionUpward.defaultDelta) => {
    state.humanity = Math.min(state.maxHumanity, state.humanity + delta);
    state.chaosDrift = Math.min(100, state.chaosDrift + balance.petitionUpward.chaosCost);
    state.subjectiveMonthsLeft = Math.max(2, state.subjectiveMonthsLeft - balance.petitionUpward.lifespanCostMonths);
    state.opticalFidelity = Math.max(
      balance.petitionUpward.minOpticalFidelity,
      state.opticalFidelity - balance.petitionUpward.opticalFidelityPenalty
    );
  };

  for (let i = 0; i < shiftsData.shifts.length; i++) {
    const shiftDef = shiftsData.shifts[i];
    const availableCount = shiftDef.targetAnomalies.length;
    const optionalCount = Math.max(0, availableCount - 2);
    const perTargetGain = balance.minigameCompletion?.cleanGain ?? 5;

    // 2 required optical scans per shift + 0..optionalCount push-your-luck deeper scans
    let scansDone = 2;
    let extraAnomaly = 0;
    if (archetype === 'pure_warmth') {
      scansDone = 2;
    } else if (archetype === 'cautious_sleeper') {
      scansDone = 2 + (optionalCount > 0 && rand() < 0.35 ? 1 : 0);
    } else if (archetype === 'balanced_sweet_spot') {
      scansDone = 2 + Math.min(optionalCount, rand() < 0.65 ? 1 : 0);
      extraAnomaly = 5 + (state.chaosDrift > 30 || rand() < 0.45 ? 4 : 0);
      if (extraAnomaly > 5) state.chaosDrift = Math.min(100, state.chaosDrift + 7);
    } else if (archetype === 'ruthless_pruner') {
      scansDone = availableCount;
      extraAnomaly = Math.round(state.opticalFidelity * 6);
      state.chaosDrift = Math.min(100, state.chaosDrift + 9);
    } else {
      // reckless_scanner
      scansDone = availableCount;
      const p = balance.deeperScanPush;
      extraAnomaly = p.anomalyGain * 0.45;
      state.chaosDrift = Math.min(100, state.chaosDrift + p.chaosCost);
      state.overseerSuspicion += p.suspicionGain;
    }

    state.anomalyProgress = Math.min(100, state.anomalyProgress + scansDone * perTargetGain + extraAnomaly);

    // Dream / Overseer Audit resolution
    if (archetype === 'pure_warmth') {
      if (state.humanity < state.maxHumanity) {
        applyPetition();
      } else {
        state.chaosDrift = Math.max(0, state.chaosDrift - 10);
        state.overseerSuspicion += 1;
      }
    } else if (archetype === 'ruthless_pruner') {
      if (state.humanity > 20) {
        applyPrune();
      }
    } else if (archetype === 'balanced_sweet_spot') {
      if (state.chaosDrift >= shiftDef.overseerAuditChaosThreshold && state.humanity > 50) {
        applyPrune();
      } else if (state.humanity < 55 && state.humanity < state.maxHumanity) {
        applyPetition();
      } else {
        state.chaosDrift = Math.max(0, state.chaosDrift - 10);
      }
    } else if (archetype === 'reckless_scanner') {
      if (state.chaosDrift > 52 && state.humanity > 28) {
        applyPrune();
      } else {
        state.overseerSuspicion += 1;
      }
    } else if (archetype === 'cautious_sleeper') {
      if (state.chaosDrift > 34 && state.humanity > 58) {
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
// PART 2: Real Compiled Ink Traversal & External Function Verification
// ============================================================================
function createInkHarnessStory() {
  const simState = {
    humanity: balance.startingState.humanity,
    maxHumanity: balance.startingState.maxHumanity,
    chaosDrift: balance.startingState.chaosDrift,
    overseerSuspicion: balance.startingState.overseerSuspicion,
    prunedPersonas: [],
    lastAuditOutcome: 'none',
    shift: 1,
  };

  const story = new Story(compiledInk);
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

  const syncVars = (overrides = {}) => {
    Object.assign(simState, overrides);
    story.variablesState.$('humanity', simState.humanity);
    story.variablesState.$('max_humanity', simState.maxHumanity);
    story.variablesState.$('chaos_drift', simState.chaosDrift);
    story.variablesState.$('anomaly_progress', 25);
    story.variablesState.$('primary_sibling_h', 68);
    story.variablesState.$('overseer_suspicion', simState.overseerSuspicion);
    story.variablesState.$('subjective_months', 24);
    story.variablesState.$('spouse_pruned', simState.prunedPersonas.includes('phantom_spouse'));
    story.variablesState.$('last_audit_outcome', simState.lastAuditOutcome);
    story.variablesState.$('current_shift', simState.shift);
  };

  return { story, simState, syncVars };
}

function traverseRealInkKnot(knotName, rng, stateOverrides = {}) {
  const { story, simState, syncVars } = createInkHarnessStory();
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

const ENTRY_KNOTS = Array.from(
  new Set([
    'intro_prologue_kitchen',
    'intro_overseer_wakeup',
    'intro_sibling_first_call',
    'intro_post_target2_overseer',
    'dream_shift1_audit',
    'overseer_interrogation',
    'future_humanity_echo',
    ...storyletsData.storylets.map((s) => s.knot),
  ])
);

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
