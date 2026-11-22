import storyletsData from '../content/storylets.json';
import type { GameMode, GameState } from './StateStore';

export interface StoryletSpec {
  id: string;
  knot: string;
  mode: GameMode;
  once: boolean;
  conditions: {
    minShift?: number;
    minAnomalyProgress?: number;
  };
}

export class StoryletScheduler {
  private readonly specs: StoryletSpec[];

  constructor() {
    this.specs = storyletsData.storylets as StoryletSpec[];
  }

  pickAvailable(state: GameState, targetMode: GameMode): StoryletSpec | null {
    for (const spec of this.specs) {
      if (spec.mode !== targetMode) continue;
      if (spec.once && state.completedStorylets.includes(spec.id)) continue;
      if (spec.conditions.minShift !== undefined && state.shift < spec.conditions.minShift) {
        continue;
      }
      if (
        spec.conditions.minAnomalyProgress !== undefined &&
        state.anomalyProgress < spec.conditions.minAnomalyProgress
      ) {
        continue;
      }
      return spec;
    }
    return null;
  }
}
