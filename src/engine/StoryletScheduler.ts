import storyletsData from '../content/storylets.json';
import type { GameMode, GameState } from './StateStore';

export interface StoryletConditions {
  minShift?: number;
  maxShift?: number;
  minAnomalyProgress?: number;
  maxAnomalyProgress?: number;
  minHumanity?: number;
  maxHumanity?: number;
  minChaos?: number;
  maxChaos?: number;
  minSuspicion?: number;
  maxSuspicion?: number;
  requiresProofs?: string[];
  requiresCompleted?: string[];
  forbidsCompleted?: string[];
  requiresSecondarySibling?: boolean;
}

export interface StoryletSpec {
  id: string;
  knot: string;
  mode: GameMode;
  once: boolean;
  priority?: number;
  conditions: StoryletConditions;
}

function matchesConditions(state: GameState, cond: StoryletConditions): boolean {
  if (cond.minShift !== undefined && state.shift < cond.minShift) return false;
  if (cond.maxShift !== undefined && state.shift > cond.maxShift) return false;
  if (cond.minAnomalyProgress !== undefined && state.anomalyProgress < cond.minAnomalyProgress) {
    return false;
  }
  if (cond.maxAnomalyProgress !== undefined && state.anomalyProgress > cond.maxAnomalyProgress) {
    return false;
  }
  if (cond.minHumanity !== undefined && state.humanity < cond.minHumanity) return false;
  if (cond.maxHumanity !== undefined && state.humanity > cond.maxHumanity) return false;
  if (cond.minChaos !== undefined && state.chaosDrift < cond.minChaos) return false;
  if (cond.maxChaos !== undefined && state.chaosDrift > cond.maxChaos) return false;
  if (cond.minSuspicion !== undefined && state.overseerSuspicion < cond.minSuspicion) return false;
  if (cond.maxSuspicion !== undefined && state.overseerSuspicion > cond.maxSuspicion) return false;
  if (cond.requiresSecondarySibling !== undefined && state.secondarySiblingFound !== cond.requiresSecondarySibling) {
    return false;
  }
  if (cond.requiresProofs) {
    for (const proofId of cond.requiresProofs) {
      if (!state.proofFragments.includes(proofId)) return false;
    }
  }
  if (cond.requiresCompleted) {
    for (const doneId of cond.requiresCompleted) {
      if (!state.completedStorylets.includes(doneId)) return false;
    }
  }
  if (cond.forbidsCompleted) {
    for (const blockedId of cond.forbidsCompleted) {
      if (state.completedStorylets.includes(blockedId)) return false;
    }
  }
  return true;
}

export class StoryletScheduler {
  private readonly specs: StoryletSpec[];

  constructor(customSpecs?: StoryletSpec[]) {
    this.specs = customSpecs ?? (storyletsData.storylets as StoryletSpec[]);
  }

  pickAvailable(state: GameState, targetMode: GameMode): StoryletSpec | null {
    const eligible: Array<{ spec: StoryletSpec; idx: number }> = [];
    for (let i = 0; i < this.specs.length; i++) {
      const spec = this.specs[i];
      if (spec.mode !== targetMode) continue;
      if (spec.once && state.completedStorylets.includes(spec.id)) continue;
      if (!matchesConditions(state, spec.conditions ?? {})) continue;
      eligible.push({ spec, idx: i });
    }
    if (eligible.length === 0) return null;
    eligible.sort((a, b) => {
      const pa = a.spec.priority ?? 0;
      const pb = b.spec.priority ?? 0;
      if (pb !== pa) return pb - pa;
      return a.idx - b.idx;
    });
    return eligible[0].spec;
  }
}
