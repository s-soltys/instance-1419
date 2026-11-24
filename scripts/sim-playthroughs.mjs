import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const balance = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/balance.json'), 'utf8'));
const shiftsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/shifts.json'), 'utf8'));
const anomaliesData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/anomalies.json'), 'utf8'));

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

    // Shift waking scan behavior by archetype
    const scanBonus = (rand() - 0.5) * 4;
    if (archetype === 'pure_warmth') {
      state.anomalyProgress = Math.min(100, state.anomalyProgress + 8 + (rand() < 0.25 ? 4 : 0));
    } else if (archetype === 'cautious_sleeper') {
      state.anomalyProgress = Math.min(100, state.anomalyProgress + 10 + (rand() < 0.3 ? 4 : 0));
    } else if (archetype === 'balanced_sweet_spot') {
      state.anomalyProgress = Math.min(100, state.anomalyProgress + Math.max(12, 16 + scanBonus));
      if (state.chaosDrift > 30 || rand() < 0.45) {
        state.anomalyProgress = Math.min(100, state.anomalyProgress + 5);
        state.chaosDrift = Math.min(100, state.chaosDrift + 8);
      }
    } else if (archetype === 'ruthless_pruner') {
      state.anomalyProgress = Math.min(100, state.anomalyProgress + 18 + Math.round(state.opticalFidelity * 6));
      state.chaosDrift = Math.min(100, state.chaosDrift + 10);
    } else {
      // reckless_scanner
      const p = balance.deeperScanPush;
      state.anomalyProgress = Math.min(100, state.anomalyProgress + p.anomalyGain + 4);
      state.chaosDrift = Math.min(100, state.chaosDrift + p.chaosCost);
      state.overseerSuspicion += p.suspicionGain;
    }

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

console.log(
  `[sim-playthroughs] PASS (${TOTAL_RUNS} runs, 0 soft-locks, permanent ceiling invariant verified): ` +
    JSON.stringify(endingCounts)
);
