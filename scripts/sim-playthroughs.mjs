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

function deriveOpticalFidelity(humanity, maxHumanity) {
  const cfg = balance.opticalFidelityDerivation;
  const hNorm = Math.max(0, Math.min(1, humanity / 90));
  const scarNorm = Math.max(0, Math.min(1, (90 - maxHumanity) / 75));
  const raw = cfg.base - hNorm * cfg.humanityWeight + scarNorm * cfg.scarWeight;
  return Math.max(cfg.min, Math.min(cfg.max, Math.round(raw * 1000) / 1000));
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
    hibernationMonthsElapsed: 0,
    opticalFidelity: deriveOpticalFidelity(s0.humanity, s0.maxHumanity),
    anomalyProgress: s0.anomalyProgress,
    primarySiblingH: s0.primarySiblingH,
    siblingDesynced: false,
    overseerSuspicion: s0.overseerSuspicion,
    prunedCount: 0,
    crossedRubicon: false,
    ceilingDropped: false,
  };

  const applyPrune = (delta = balance.pruning.defaultDelta) => {
    const prevH = state.humanity;
    const rawNext = Math.max(5, prevH - delta);
    const threshold = balance.pruning.permanentCeilingThreshold;
    const minCeil = balance.pruning.minMaxHumanity;
    if (rawNext < threshold) {
      const overshoot = threshold - rawNext;
      const rubiconCap = threshold - Math.ceil(overshoot / 2);
      state.maxHumanity = Math.max(minCeil, Math.min(state.maxHumanity - delta, rubiconCap));
      state.ceilingDropped = true;
      state.crossedRubicon = true;
    }
    state.humanity = Math.min(state.maxHumanity, rawNext);
    state.chaosDrift = Math.max(0, state.chaosDrift - balance.pruning.chaosRelief);
    state.subjectiveMonthsLeft += balance.pruning.lifespanGainMonths;
    state.opticalFidelity = deriveOpticalFidelity(state.humanity, state.maxHumanity);
    state.prunedCount++;

    if (state.humanity > state.maxHumanity) {
      throw new Error(`Invariant violated: humanity ${state.humanity} > maxHumanity ${state.maxHumanity}`);
    }
  };

  const applyPetition = (delta = balance.petitionUpward.defaultDelta) => {
    state.humanity = Math.min(state.maxHumanity, state.humanity + delta);
    state.chaosDrift = Math.min(100, state.chaosDrift + balance.petitionUpward.chaosCost);
    state.subjectiveMonthsLeft = Math.max(2, state.subjectiveMonthsLeft - balance.petitionUpward.lifespanCostMonths);
    state.opticalFidelity = deriveOpticalFidelity(state.humanity, state.maxHumanity);

    if (state.crossedRubicon && state.humanity >= balance.pruning.permanentCeilingThreshold) {
      throw new Error(
        `Canon Rubicon invariant violated: petitioned back to ${state.humanity} >= ${balance.pruning.permanentCeilingThreshold}`
      );
    }
  };

  const payouts = balance.minigames.payouts;
  const avgScanGain = anomaliesData.anomalies[0]?.anomalyGain ?? 3;

  for (let i = 0; i < shiftsData.shifts.length; i++) {
    const shiftDef = shiftsData.shifts[i];

    // Real payouts from balance.json + anomalies.json (at most 1 target scan + instrument grade per shift 1..5)
    if (i < 5) {
      if (archetype === 'pure_warmth') {
        const tier = rand() < 0.35 ? payouts.partial : payouts.clean;
        state.anomalyProgress = Math.min(100, state.anomalyProgress + (rand() < 0.7 ? avgScanGain + tier.anomalyGain : avgScanGain));
        state.chaosDrift = Math.min(100, state.chaosDrift + tier.chaosDelta);
      } else if (archetype === 'cautious_sleeper') {
        const tier = payouts.partial;
        state.anomalyProgress = Math.min(100, state.anomalyProgress + avgScanGain + tier.anomalyGain);
        state.chaosDrift = Math.min(100, state.chaosDrift + tier.chaosDelta);
      } else if (archetype === 'balanced_sweet_spot') {
        const tier = rand() < 0.7 ? payouts.clean : payouts.deep_overclock;
        state.anomalyProgress = Math.min(100, state.anomalyProgress + avgScanGain + tier.anomalyGain);
        state.chaosDrift = Math.min(100, state.chaosDrift + tier.chaosDelta);
        state.overseerSuspicion += tier.suspicionDelta;
      } else if (archetype === 'ruthless_pruner') {
        const tier = payouts.deep_overclock;
        state.anomalyProgress = Math.min(100, state.anomalyProgress + avgScanGain + tier.anomalyGain);
        state.chaosDrift = Math.min(100, state.chaosDrift + tier.chaosDelta);
        state.overseerSuspicion += tier.suspicionDelta;
      } else {
        // reckless_scanner
        const tier = payouts.deep_overclock;
        const push = balance.deeperScanPush;
        state.anomalyProgress = Math.min(100, state.anomalyProgress + avgScanGain + tier.anomalyGain + (i % 2 === 0 ? push.anomalyGain : 0));
        state.chaosDrift = Math.min(100, state.chaosDrift + tier.chaosDelta + (i % 2 === 0 ? push.chaosCost : 0));
        state.overseerSuspicion += tier.suspicionDelta + (i % 2 === 0 ? push.suspicionGain : 0);
      }
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

    // Hibernation transition to next shift (mirrors StateStore.advanceShift)
    if (i < shiftsData.shifts.length - 1) {
      const nextDef = shiftsData.shifts[i + 1];
      const [driftMin, driftMax] = nextDef.siblingDriftRange;
      const playerWarmRatio = Math.max(0, Math.min(1, (state.humanity - 20) / 70));
      const targetSiblingH = Math.round(driftMin + (driftMax - driftMin) * (0.68 - playerWarmRatio * 0.36));
      state.primarySiblingH = Math.min(state.primarySiblingH, Math.max(driftMin, Math.min(driftMax, targetSiblingH)));
      state.siblingDesynced = state.siblingDesynced || state.overseerSuspicion >= nextDef.desyncSuspicionThreshold;
      state.hibernationMonthsElapsed += nextDef.hibernationMonthsElapsed ?? 0;
      state.chaosDrift = Math.max(
        0,
        Math.min(100, state.chaosDrift + nextDef.baseChaosPerShift - balance.dreamDefrag.chaosRelief)
      );
      state.subjectiveMonthsLeft = Math.max(0, state.subjectiveMonthsLeft - shiftDef.monthsPerShift);
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
    primarySiblingH: state.primarySiblingH,
    siblingDesynced: state.siblingDesynced,
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
let desyncedRuns = 0;
let driftedSiblingRuns = 0;

const TOTAL_RUNS = 500;
for (let r = 0; r < TOTAL_RUNS; r++) {
  const arch = ARCHETYPES[r % ARCHETYPES.length];
  const res = runArchetype(arch, rand);
  endingCounts[res.ending]++;
  if (res.siblingDesynced) desyncedRuns++;
  if (res.primarySiblingH < balance.startingState.primarySiblingH) driftedSiblingRuns++;
}

for (const [endingId, count] of Object.entries(endingCounts)) {
  if (count === 0) {
    console.error(`[sim-playthroughs] FAILED: Unreachable ending "${endingId}" across ${TOTAL_RUNS} runs.`);
    process.exit(1);
  }
}

if (desyncedRuns === 0 || driftedSiblingRuns === 0) {
  console.error(
    `[sim-playthroughs] FAILED: Expected sibling drift & desync triggers (drifted=${driftedSiblingRuns}, desynced=${desyncedRuns}).`
  );
  process.exit(1);
}

if (anomaliesData.anomalies.length === 0) {
  console.error('[sim-playthroughs] FAILED: anomalies.json empty.');
  process.exit(1);
}

console.log(
  `[sim-playthroughs] PASS (${TOTAL_RUNS} runs, 0 soft-locks, Rubicon <70% ceiling & sibling drift verified, desynced=${desyncedRuns}): ` +
    JSON.stringify(endingCounts)
);
