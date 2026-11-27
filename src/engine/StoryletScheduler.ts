import anomaliesData from '../content/anomalies.json';
import shiftsData from '../content/shifts.json';
import storyletsData from '../content/storylets.json';
import type { GameMode, GameState } from './StateStore';

export interface StoryletSpec {
  id: string;
  knot: string;
  mode: GameMode;
  once: boolean;
  priority?: number;
  conditions: {
    exactShift?: number;
    minShift?: number;
    maxShift?: number;
    minAnomalyProgress?: number;
    requiredDecodedTargets?: string[];
    minRequiredScansInShift?: number;
    minOptionalScansThisShift?: number;
    minOverseerSuspicion?: number;
    requiresFlag?: string;
    minHumanity?: number;
    maxHumanity?: number;
  };
}

function hasStoryletFlag(state: GameState, flag: string): boolean {
  if (!flag) return true;
  if (state.storyFlags?.[flag]) return true;
  if (state.codexUnlocks.includes(flag)) return true;
  if (state.completedStorylets.includes(flag)) return true;
  if (state.prunedPersonas.includes(flag)) return true;
  if (flag === 'spouse_pruned') return state.prunedPersonas.includes('phantom_spouse');
  if (flag === 'secondary_sibling_found') return state.secondarySiblingFound;
  if (flag.startsWith('decoded_')) {
    const targetId = flag.slice('decoded_'.length);
    if (state.decodedMinigameTargets.includes(targetId)) return true;
  }
  return anomaliesData.anomalies.some(
    (a) => a.postScanEcho?.storyFlag === flag && state.decodedMinigameTargets.includes(a.id)
  );
}

export class StoryletScheduler {
  private readonly specs: StoryletSpec[];

  constructor() {
    this.specs = storyletsData.storylets as StoryletSpec[];
  }

  getById(id: string): StoryletSpec | null {
    return this.specs.find((s) => s.id === id) ?? null;
  }

  pickAvailable(state: GameState, targetMode: GameMode): StoryletSpec | null {
    const shiftDef = shiftsData.shifts.find((s) => s.shift === state.shift);
    const reqIds = shiftDef?.requiredTargets ?? [];
    const optIds = shiftDef?.optionalTargets ?? [];
    const reqDone = reqIds.filter((id) => state.decodedMinigameTargets.includes(id)).length;
    const optDone = optIds.filter((id) => state.decodedMinigameTargets.includes(id)).length;

    const eligible: Array<{ spec: StoryletSpec; idx: number }> = [];
    for (let idx = 0; idx < this.specs.length; idx++) {
      const spec = this.specs[idx];
      if (spec.mode !== targetMode) continue;
      if (spec.once && state.completedStorylets.includes(spec.id)) continue;

      const c = spec.conditions ?? {};
      if (c.exactShift !== undefined && state.shift !== c.exactShift) continue;
      if (c.minShift !== undefined && state.shift < c.minShift) continue;
      if (c.maxShift !== undefined && state.shift > c.maxShift) continue;
      if (c.minAnomalyProgress !== undefined && state.anomalyProgress < c.minAnomalyProgress) {
        continue;
      }
      if (c.requiredDecodedTargets && c.requiredDecodedTargets.length > 0) {
        if (!c.requiredDecodedTargets.every((id) => state.decodedMinigameTargets.includes(id))) {
          continue;
        }
      }
      if (c.minRequiredScansInShift !== undefined && reqDone < c.minRequiredScansInShift) {
        continue;
      }
      if (c.minOptionalScansThisShift !== undefined && optDone < c.minOptionalScansThisShift) {
        continue;
      }
      if (c.minOverseerSuspicion !== undefined && state.overseerSuspicion < c.minOverseerSuspicion) {
        continue;
      }
      if (c.requiresFlag !== undefined && !hasStoryletFlag(state, c.requiresFlag)) {
        continue;
      }
      if (c.minHumanity !== undefined && state.humanity < c.minHumanity) continue;
      if (c.maxHumanity !== undefined && state.humanity > c.maxHumanity) continue;

      eligible.push({ spec, idx });
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
