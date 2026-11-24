import balance from '../content/balance.json';
import shiftsData from '../content/shifts.json';
import uiCopy from '../content/ui_copy.json';
import { platform } from '../platform/PlatformAdapter';

export type GameMode = 'boot' | 'waking_3d' | 'target_inspect' | 'dream_2d' | 'ending';
export type AuditOutcome = 'none' | 'pruned' | 'unsealed' | 'held';
export type EndingId = 'ending_whole_incomplete' | 'ending_cold_complete' | 'ending_sweet_spot';

export interface StatusShiftEvent {
  tone: 'warm' | 'cold' | 'discovery';
  title: string;
  detail: string;
  prevValue: number;
  nextValue: number;
  prevMax?: number;
  nextMax?: number;
  unit?: string;
}

export interface GameState {
  saveSchemaVersion: number;
  shift: number;
  mode: GameMode;
  activeTargetId: string | null;
  activeDreamPersonaId: string;
  dreamPersonaCache: string[];
  humanity: number;
  maxHumanity: number;
  chaosDrift: number;
  subjectiveMonthsLeft: number;
  opticalFidelity: number;
  anomalyProgress: number;
  primarySiblingH: number;
  secondarySiblingFound: boolean;
  overseerSuspicion: number;
  scannedAnomalyIds: string[];
  decodedMinigameTargets: string[];
  proofFragments: string[];
  prunedPersonas: string[];
  completedStorylets: string[];
  inkStateJson: string | null;
  overseerAuditActive: boolean;
  wavelengthNm: number;
  lastAuditOutcome: AuditOutcome;
}

const SAVE_SCHEMA_VERSION = 3;
const STORAGE_KEY = 'instance_1419_state_v3';
const LEGACY_STORAGE_KEYS = ['instance_1419_spike_state_v2'];

export type StateListener = (state: GameState) => void;
export type StatusShiftListener = (event: StatusShiftEvent) => void;

export function createInitialState(): GameState {
  const s = balance.startingState;
  return {
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    shift: s.shift,
    mode: 'boot',
    activeTargetId: null,
    activeDreamPersonaId: 'phantom_spouse',
    dreamPersonaCache: ['phantom_spouse'],
    humanity: s.humanity,
    maxHumanity: s.maxHumanity,
    chaosDrift: s.chaosDrift,
    subjectiveMonthsLeft: s.subjectiveMonthsLeft,
    opticalFidelity: s.opticalFidelity,
    anomalyProgress: s.anomalyProgress,
    primarySiblingH: s.primarySiblingH,
    secondarySiblingFound: false,
    overseerSuspicion: s.overseerSuspicion,
    scannedAnomalyIds: [],
    decodedMinigameTargets: [],
    proofFragments: [],
    prunedPersonas: [],
    completedStorylets: [],
    inkStateJson: null,
    overseerAuditActive: false,
    wavelengthNm: 560,
    lastAuditOutcome: 'none',
  };
}

function migrateSavedState(raw: Partial<GameState> | null): GameState {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;
  const merged: GameState = {
    ...base,
    ...raw,
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
  };
  if (merged.mode === 'target_inspect' && !merged.activeTargetId) {
    merged.mode = 'waking_3d';
  }
  if (!Array.isArray(merged.dreamPersonaCache) || merged.dreamPersonaCache.length === 0) {
    merged.dreamPersonaCache = ['phantom_spouse'];
  }
  if (!merged.activeDreamPersonaId) {
    merged.activeDreamPersonaId = merged.dreamPersonaCache[0];
  }
  if (!Array.isArray(merged.proofFragments)) {
    merged.proofFragments = [];
  }
  return merged;
}

export class StateStore {
  private state: GameState;
  private listeners = new Set<StateListener>();
  private shiftListeners = new Set<StatusShiftListener>();

  constructor() {
    let saved = platform.loadState<Partial<GameState>>(STORAGE_KEY);
    if (!saved) {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const legacy = platform.loadState<Partial<GameState>>(legacyKey);
        if (legacy) {
          saved = legacy;
          platform.clearState(legacyKey);
          break;
        }
      }
    }
    this.state = migrateSavedState(saved);
  }

  getState(): GameState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  subscribeStatusShift(listener: StatusShiftListener): () => void {
    this.shiftListeners.add(listener);
    return () => this.shiftListeners.delete(listener);
  }

  emitStatusShift(event: StatusShiftEvent): void {
    for (const l of this.shiftListeners) {
      l(event);
    }
  }

  private commit(next: GameState): void {
    this.state = next;
    platform.saveState(STORAGE_KEY, this.state);
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  patch(partial: Partial<GameState>): void {
    const merged: GameState = { ...this.state, ...partial, saveSchemaVersion: SAVE_SCHEMA_VERSION };
    const maxCap = balance.petitionUpward.maxHumanityCap;
    const minCeil = balance.pruning.minMaxHumanity;
    merged.maxHumanity = Math.max(minCeil, Math.min(maxCap, Math.round(merged.maxHumanity)));
    merged.humanity = Math.max(0, Math.min(merged.maxHumanity, Math.round(merged.humanity)));
    merged.primarySiblingH = Math.max(10, Math.min(maxCap, Math.round(merged.primarySiblingH)));
    merged.chaosDrift = Math.max(0, Math.min(100, Math.round(merged.chaosDrift)));
    merged.anomalyProgress = Math.max(0, Math.min(100, Math.round(merged.anomalyProgress)));
    merged.opticalFidelity = Math.max(0.25, Math.min(1.0, merged.opticalFidelity));
    merged.wavelengthNm = Math.max(200, Math.min(1800, Math.round(merged.wavelengthNm)));
    merged.shift = Math.max(1, Math.min(shiftsData.shifts.length, Math.round(merged.shift)));
    this.commit(merged);
  }

  pruneHumanity(delta: number, personaId: string): void {
    const step = delta > 0 ? delta : balance.pruning.defaultDelta;
    const threshold = balance.pruning.permanentCeilingThreshold;
    const minCeil = balance.pruning.minMaxHumanity;

    const prevH = this.state.humanity;
    const prevMax = this.state.maxHumanity;
    const rawNextH = Math.max(5, prevH - step);
    const permanentDrop = rawNextH < threshold ? Math.min(step, threshold - rawNextH) : 0;
    const nextMax = permanentDrop > 0 ? Math.max(minCeil, prevMax - step) : prevMax;
    const nextH = Math.min(nextMax, rawNextH);

    const pruned = this.state.prunedPersonas.includes(personaId)
      ? this.state.prunedPersonas
      : [...this.state.prunedPersonas, personaId];

    this.patch({
      humanity: nextH,
      maxHumanity: nextMax,
      chaosDrift: Math.max(0, this.state.chaosDrift - balance.pruning.chaosRelief),
      subjectiveMonthsLeft: this.state.subjectiveMonthsLeft + balance.pruning.lifespanGainMonths,
      opticalFidelity: Math.min(1.0, this.state.opticalFidelity + balance.pruning.opticalFidelityBonus),
      prunedPersonas: pruned,
      lastAuditOutcome: 'pruned',
    });

    const copy =
      nextMax < prevMax ? uiCopy.statusAlerts.prunePermanent : uiCopy.statusAlerts.pruneAboveThreshold;

    this.emitStatusShift({
      tone: 'cold',
      title: copy.title,
      detail: copy.detail,
      prevValue: prevH,
      nextValue: nextH,
      prevMax,
      nextMax,
      unit: '%',
    });
    platform.hapticPulse('medium');
  }

  petitionOverseer(delta: number): void {
    const step = delta > 0 ? delta : balance.petitionUpward.defaultDelta;
    const prevH = this.state.humanity;
    const nextH = Math.min(this.state.maxHumanity, prevH + step);

    this.patch({
      humanity: nextH,
      chaosDrift: Math.min(100, this.state.chaosDrift + balance.petitionUpward.chaosCost),
      subjectiveMonthsLeft: Math.max(2, this.state.subjectiveMonthsLeft - balance.petitionUpward.lifespanCostMonths),
      opticalFidelity: Math.max(
        balance.petitionUpward.minOpticalFidelity,
        this.state.opticalFidelity - balance.petitionUpward.opticalFidelityPenalty
      ),
      lastAuditOutcome: 'unsealed',
    });

    this.emitStatusShift({
      tone: 'warm',
      title: uiCopy.statusAlerts.unseal.title,
      detail: uiCopy.statusAlerts.unseal.detail,
      prevValue: prevH,
      nextValue: nextH,
      prevMax: this.state.maxHumanity,
      nextMax: this.state.maxHumanity,
      unit: '%',
    });
    platform.hapticPulse('light');
  }

  setAuditOutcome(outcome: AuditOutcome): void {
    this.patch({ lastAuditOutcome: outcome });
  }

  pushDeeperScan(): void {
    const p = balance.deeperScanPush;
    const prevAnom = this.state.anomalyProgress;
    const nextAnom = Math.min(100, prevAnom + p.anomalyGain);
    this.patch({
      anomalyProgress: nextAnom,
      chaosDrift: Math.min(100, this.state.chaosDrift + p.chaosCost),
      overseerSuspicion: this.state.overseerSuspicion + p.suspicionGain,
    });
    this.emitStatusShift({
      tone: 'discovery',
      title: uiCopy.statusAlerts.deeperScan.title,
      detail: uiCopy.statusAlerts.deeperScan.detail,
      prevValue: prevAnom,
      nextValue: nextAnom,
      unit: '%',
    });
    platform.hapticPulse('medium');
  }

  recordAnomalyScan(anomalyId: string, gain: number, label?: string): boolean {
    if (this.state.scannedAnomalyIds.includes(anomalyId)) return false;
    const prevAnom = this.state.anomalyProgress;
    const nextAnom = Math.min(100, prevAnom + gain);
    this.patch({
      scannedAnomalyIds: [...this.state.scannedAnomalyIds, anomalyId],
      anomalyProgress: nextAnom,
    });
    const copy = uiCopy.statusAlerts.targetLocked;
    this.emitStatusShift({
      tone: 'discovery',
      title: label ? `${label} ${copy.titleSuffix}` : copy.fallbackTitle,
      detail: copy.detail,
      prevValue: prevAnom,
      nextValue: nextAnom,
      unit: '%',
    });
    platform.hapticPulse('light');
    return true;
  }

  recordMinigameCompletion(
    targetId: string,
    label: string,
    options?:
      | number
      | {
          anomalyGain?: number;
          grade?: 'partial' | 'clean' | 'deep_overclock';
          chaosDelta?: number;
          suspicionDelta?: number;
          humanityDelta?: number;
          proofFragmentId?: string;
          dossierSnippet?: string;
        }
  ): boolean {
    const opts = typeof options === 'number' ? { anomalyGain: options } : options ?? {};
    const already = this.state.decodedMinigameTargets.includes(targetId);
    const gain = opts.anomalyGain ?? balance.minigameCompletion.anomalyGain;
    const prevAnom = this.state.anomalyProgress;
    const nextAnom = already ? prevAnom : Math.min(100, prevAnom + gain);
    const nextChaos = Math.max(0, Math.min(100, this.state.chaosDrift + (opts.chaosDelta ?? 0)));
    const nextSusp = Math.max(0, this.state.overseerSuspicion + (opts.suspicionDelta ?? 0));
    const nextH = Math.max(
      5,
      Math.min(this.state.maxHumanity, this.state.humanity + (opts.humanityDelta ?? 0))
    );
    const nextProofs =
      opts.proofFragmentId && !this.state.proofFragments.includes(opts.proofFragmentId)
        ? [...this.state.proofFragments, opts.proofFragmentId]
        : this.state.proofFragments;

    if (!already || opts.chaosDelta || opts.suspicionDelta || opts.humanityDelta || opts.proofFragmentId) {
      this.patch({
        decodedMinigameTargets: already
          ? this.state.decodedMinigameTargets
          : [...this.state.decodedMinigameTargets, targetId],
        anomalyProgress: nextAnom,
        chaosDrift: nextChaos,
        overseerSuspicion: nextSusp,
        humanity: nextH,
        proofFragments: nextProofs,
      });
    }

    const copy = uiCopy.statusAlerts.targetDecoded;
    const gradeLabel =
      opts.grade === 'deep_overclock'
        ? ' [OVERCLOCK PROOF]'
        : opts.grade === 'partial'
        ? ' [PARTIAL LOG]'
        : '';
    this.emitStatusShift({
      tone: 'discovery',
      title: `${label} ${copy.titleSuffix}${gradeLabel}`,
      detail: opts.dossierSnippet || (already ? copy.detailRepeat : copy.detailFirst),
      prevValue: prevAnom,
      nextValue: nextAnom,
      unit: '%',
    });
    platform.hapticPulse('medium');
    return !already;
  }

  advanceShift(): void {
    const currentIdx = Math.max(0, this.state.shift - 1);
    const currentDef = shiftsData.shifts[currentIdx] ?? shiftsData.shifts[0];
    const prevShift = this.state.shift;
    const nextShift = Math.min(shiftsData.shifts.length, prevShift + 1);
    const nextDef = shiftsData.shifts[nextShift - 1] ?? currentDef;

    this.patch({
      shift: nextShift,
      chaosDrift: Math.max(
        0,
        this.state.chaosDrift + nextDef.baseChaosPerShift - balance.dreamDefrag.chaosRelief
      ),
      subjectiveMonthsLeft: Math.max(0, this.state.subjectiveMonthsLeft - currentDef.monthsPerShift),
    });

    this.emitStatusShift({
      tone: 'discovery',
      title: `${uiCopy.statusAlerts.shiftAdvance.titlePrefix} ${nextShift}`,
      detail: `${nextDef.title} — ${uiCopy.statusAlerts.shiftAdvance.detail}`,
      prevValue: prevShift,
      nextValue: nextShift,
    });
  }

  evaluateEnding(): EndingId {
    const rules = shiftsData.endings;
    if (this.state.anomalyProgress >= rules.completeThresholdAnomaly) {
      return this.state.humanity < rules.coldThresholdHumanity
        ? 'ending_cold_complete'
        : 'ending_sweet_spot';
    }
    return 'ending_whole_incomplete';
  }

  markStoryletDone(id: string): void {
    if (this.state.completedStorylets.includes(id)) return;
    this.patch({
      completedStorylets: [...this.state.completedStorylets, id],
    });
  }

  reset(): void {
    platform.clearState(STORAGE_KEY);
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      platform.clearState(legacyKey);
    }
    this.commit(createInitialState());
  }
}
