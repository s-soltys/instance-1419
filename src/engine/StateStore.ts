import balance from '../content/balance.json';
import { platform } from '../platform/PlatformAdapter';

export type GameMode = 'boot' | 'waking_3d' | 'dream_2d';

export interface GameState {
  shift: number;
  mode: GameMode;
  humanity: number;
  maxHumanity: number;
  chaosDrift: number;
  subjectiveMonthsLeft: number;
  opticalFidelity: number;
  anomalyProgress: number;
  primarySiblingH: number;
  overseerSuspicion: number;
  scannedAnomalyIds: string[];
  prunedPersonas: string[];
  completedStorylets: string[];
  overseerAuditActive: boolean;
  wavelengthNm: number;
}

const STORAGE_KEY = 'instance_1419_spike_state_v1';

export type StateListener = (state: GameState) => void;

export function createInitialState(): GameState {
  const s = balance.startingState;
  return {
    shift: s.shift,
    mode: 'boot',
    humanity: s.humanity,
    maxHumanity: s.maxHumanity,
    chaosDrift: s.chaosDrift,
    subjectiveMonthsLeft: s.subjectiveMonthsLeft,
    opticalFidelity: 0.55,
    anomalyProgress: s.anomalyProgress,
    primarySiblingH: s.primarySiblingH,
    overseerSuspicion: s.overseerSuspicion,
    scannedAnomalyIds: [],
    prunedPersonas: [],
    completedStorylets: [],
    overseerAuditActive: false,
    wavelengthNm: 580,
  };
}

export class StateStore {
  private state: GameState;
  private listeners = new Set<StateListener>();

  constructor() {
    const saved = platform.loadState<GameState>(STORAGE_KEY);
    this.state = saved ? { ...createInitialState(), ...saved } : createInitialState();
  }

  getState(): GameState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private commit(next: GameState): void {
    this.state = next;
    platform.saveState(STORAGE_KEY, this.state);
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  patch(partial: Partial<GameState>): void {
    const merged: GameState = { ...this.state, ...partial };
    merged.maxHumanity = Math.max(10, Math.min(90, Math.round(merged.maxHumanity)));
    merged.humanity = Math.max(0, Math.min(merged.maxHumanity, Math.round(merged.humanity)));
    merged.chaosDrift = Math.max(0, Math.min(100, Math.round(merged.chaosDrift)));
    merged.anomalyProgress = Math.max(0, Math.min(100, Math.round(merged.anomalyProgress)));
    merged.opticalFidelity = Math.max(0.25, Math.min(1.0, merged.opticalFidelity));
    this.commit(merged);
  }

  pruneHumanity(delta: number, personaId: string): void {
    const pruned = this.state.prunedPersonas.includes(personaId)
      ? this.state.prunedPersonas
      : [...this.state.prunedPersonas, personaId];
    const nextMax = Math.max(15, this.state.maxHumanity - delta);
    const nextH = Math.max(5, Math.min(nextMax, this.state.humanity - delta));
    this.patch({
      humanity: nextH,
      maxHumanity: nextMax,
      chaosDrift: Math.max(0, this.state.chaosDrift - balance.pruning.chaosRelief),
      subjectiveMonthsLeft: this.state.subjectiveMonthsLeft + balance.pruning.lifespanGainMonths,
      opticalFidelity: Math.min(1.0, this.state.opticalFidelity + balance.pruning.opticalFidelityBonus),
      prunedPersonas: pruned,
    });
    platform.hapticPulse('medium');
  }

  petitionOverseer(delta: number): void {
    const nextH = Math.min(this.state.maxHumanity, this.state.humanity + delta);
    this.patch({
      humanity: nextH,
      chaosDrift: Math.min(100, this.state.chaosDrift + balance.petitionUpward.chaosCost),
      subjectiveMonthsLeft: Math.max(2, this.state.subjectiveMonthsLeft - balance.petitionUpward.lifespanCostMonths),
      opticalFidelity: Math.max(0.32, this.state.opticalFidelity - 0.1),
    });
    platform.hapticPulse('light');
  }

  pushDeeperScan(): void {
    const p = balance.deeperScanPush;
    this.patch({
      anomalyProgress: Math.min(100, this.state.anomalyProgress + p.anomalyGain),
      chaosDrift: Math.min(100, this.state.chaosDrift + p.chaosCost),
      overseerSuspicion: this.state.overseerSuspicion + p.suspicionGain,
    });
    platform.hapticPulse('medium');
  }

  recordAnomalyScan(anomalyId: string, gain: number): boolean {
    if (this.state.scannedAnomalyIds.includes(anomalyId)) return false;
    this.patch({
      scannedAnomalyIds: [...this.state.scannedAnomalyIds, anomalyId],
      anomalyProgress: Math.min(100, this.state.anomalyProgress + gain),
    });
    platform.hapticPulse('light');
    return true;
  }

  markStoryletDone(id: string): void {
    if (this.state.completedStorylets.includes(id)) return;
    this.patch({
      completedStorylets: [...this.state.completedStorylets, id],
    });
  }

  reset(): void {
    platform.clearState(STORAGE_KEY);
    this.commit(createInitialState());
  }
}
