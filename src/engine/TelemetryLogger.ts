import { platform } from '../platform/PlatformAdapter';
import type { GameMode, GameState } from './StateStore';

export type TelemetryEventType =
  | 'session_start'
  | 'mode_change'
  | 'anomaly_scan'
  | 'minigame_complete'
  | 'dialogue_choice'
  | 'prune'
  | 'petition'
  | 'shift_advance';

export interface TelemetryEvent {
  tSec: number;
  type: TelemetryEventType;
  humanity: number;
  maxHumanity: number;
  chaosDrift: number;
  anomalyProgress: number;
  data?: Record<string, string | number | boolean>;
}

const MAX_EVENTS = 500;

/**
 * Lightweight playtest analytics ring-buffer for pacing calibration and QA inspection.
 */
export class TelemetryLogger {
  private readonly startedAtMs = performance.now();
  private readonly startedIso = new Date().toISOString();
  private readonly events: TelemetryEvent[] = [];
  private lastMode: GameMode | null = null;

  constructor(initialState: GameState) {
    this.lastMode = initialState.mode;
    this.record('session_start', initialState, { mode: initialState.mode, shift: initialState.shift });
  }

  record(
    type: TelemetryEventType,
    state: GameState,
    data?: Record<string, string | number | boolean>
  ): void {
    if (this.events.length >= MAX_EVENTS) {
      this.events.shift();
    }
    this.events.push({
      tSec: Number(((performance.now() - this.startedAtMs) / 1000).toFixed(2)),
      type,
      humanity: state.humanity,
      maxHumanity: state.maxHumanity,
      chaosDrift: state.chaosDrift,
      anomalyProgress: state.anomalyProgress,
      data,
    });
  }

  observeMode(state: GameState): void {
    if (state.mode !== this.lastMode) {
      this.lastMode = state.mode;
      this.record('mode_change', state, { mode: state.mode, targetId: state.activeTargetId ?? '' });
    }
  }

  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  exportSummary(state: GameState): Record<string, unknown> {
    const minigameCompletes = this.events.filter((e) => e.type === 'minigame_complete');
    return {
      schemaVersion: 1,
      startedAt: this.startedIso,
      exportedAt: new Date().toISOString(),
      elapsedSec: Number(((performance.now() - this.startedAtMs) / 1000).toFixed(2)),
      eventCount: this.events.length,
      minigamesCompletedCount: minigameCompletes.length,
      finalStateSnapshot: {
        shift: state.shift,
        mode: state.mode,
        humanity: state.humanity,
        maxHumanity: state.maxHumanity,
        chaosDrift: state.chaosDrift,
        opticalFidelity: Number(state.opticalFidelity.toFixed(2)),
        anomalyProgress: state.anomalyProgress,
        scannedCount: state.scannedAnomalyIds.length,
        decodedCount: state.decodedMinigameTargets.length,
        prunedPersonas: state.prunedPersonas,
      },
      events: this.events,
    };
  }

  downloadSummary(state: GameState): void {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    platform.exportJsonFile(`instance-1419-telemetry-${stamp}.json`, this.exportSummary(state));
  }
}
