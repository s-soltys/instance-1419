import codexJson from '../content/codex.json';
import type { AuditOutcome, GameState } from './StateStore';

export type CodexCategoryId = 'evidence' | 'celestial' | 'systems' | 'instances';

export interface CodexCategorySpec {
  id: CodexCategoryId;
  label: string;
  code: string;
  description: string;
}

export interface CodexUnlockCondition {
  always?: boolean;
  minShift?: number;
  flag?: string;
  ending?: string;
  personaPruned?: string;
  scannedAnomaly?: string;
  decodedTarget?: string;
  minScannedCount?: number;
  minDecodedCount?: number;
  minAnomalyProgress?: number;
  codexUnlock?: string;
  storyletDone?: string;
  auditOutcomes?: AuditOutcome[];
  minPrunedCount?: number;
}

export interface CodexStageSpec {
  id: string;
  heading: string;
  tag: string;
  unlock: CodexUnlockCondition;
  body: string;
}

export interface CodexEntrySpec {
  id: string;
  category: CodexCategoryId;
  code: string;
  title: string;
  subtitle: string;
  targetId?: string;
  plateAsset?: string;
  plateCaption?: string;
  stages: CodexStageSpec[];
  nextHint?: string;
  annotations: {
    warm: string;
    mid: string;
    cold: string;
  };
}

export interface ResolvedCodexStage extends CodexStageSpec {
  isNew: boolean;
}

export interface ResolvedCodexEntry {
  spec: CodexEntrySpec;
  unlocked: boolean;
  unlockedStages: ResolvedCodexStage[];
  totalStages: number;
  hasUnread: boolean;
  statusLabel: 'NEW' | 'UPDATED' | 'READ' | 'LOCKED';
  annotationBand: 'warm' | 'mid' | 'cold';
  annotationText: string;
  hasMoreStages: boolean;
}

export interface CodexSnapshot {
  categories: CodexCategorySpec[];
  entries: ResolvedCodexEntry[];
  totalUnread: number;
  totalUnlockedStages: number;
  totalStages: number;
}

const CATEGORIES = codexJson.categories as CodexCategorySpec[];
const ENTRIES = codexJson.entries as CodexEntrySpec[];

export function evaluateUnlockCondition(cond: CodexUnlockCondition, state: GameState): boolean {
  if (cond.always) return true;
  if (typeof cond.minShift === 'number' && state.shift < cond.minShift) return false;
  if (cond.flag && !state.storyFlags?.[cond.flag] && !state.codexUnlocks.includes(cond.flag)) {
    return false;
  }
  if (cond.ending && state.endingId !== cond.ending && state.endingVariant !== cond.ending) {
    return false;
  }
  if (cond.personaPruned && !state.prunedPersonas.includes(cond.personaPruned)) return false;
  if (cond.scannedAnomaly && !state.scannedAnomalyIds.includes(cond.scannedAnomaly)) return false;
  if (cond.decodedTarget && !state.decodedMinigameTargets.includes(cond.decodedTarget)) return false;
  if (typeof cond.minScannedCount === 'number' && state.scannedAnomalyIds.length < cond.minScannedCount) {
    return false;
  }
  if (
    typeof cond.minDecodedCount === 'number' &&
    state.decodedMinigameTargets.length < cond.minDecodedCount
  ) {
    return false;
  }
  if (typeof cond.minAnomalyProgress === 'number' && state.anomalyProgress < cond.minAnomalyProgress) {
    return false;
  }
  if (cond.codexUnlock && !state.codexUnlocks.includes(cond.codexUnlock)) return false;
  if (cond.storyletDone && !state.completedStorylets.includes(cond.storyletDone)) return false;
  if (cond.auditOutcomes && !cond.auditOutcomes.includes(state.lastAuditOutcome)) return false;
  if (typeof cond.minPrunedCount === 'number' && state.prunedPersonas.length < cond.minPrunedCount) {
    return false;
  }
  return true;
}

/**
 * Pure data-driven Wake-World Codex resolver.
 * Evaluates progressive multi-stage unlocks, unread status badges, and H%-reactive
 * personal annotations strictly from src/content/codex.json and GameState.
 */
export class CodexEngine {
  getCategories(): CodexCategorySpec[] {
    return CATEGORIES;
  }

  resolve(state: GameState): CodexSnapshot {
    const annotationBand: 'warm' | 'mid' | 'cold' =
      state.humanity >= 65 ? 'warm' : state.humanity >= 45 ? 'mid' : 'cold';

    let totalUnread = 0;
    let totalUnlockedStages = 0;
    let totalStages = 0;

    const entries: ResolvedCodexEntry[] = ENTRIES.map((spec) => {
      totalStages += spec.stages.length;
      const baselineCount = spec.stages.filter((stage) => Boolean(stage.unlock.always)).length;
      const seenCount = Math.max(baselineCount, state.codexSeenStages[spec.id] ?? 0);

      const unlockedRaw = spec.stages.filter((stage) => evaluateUnlockCondition(stage.unlock, state));
      totalUnlockedStages += unlockedRaw.length;

      const unlocked = unlockedRaw.length > 0;
      const hasUnread = unlocked && unlockedRaw.length > seenCount;
      if (hasUnread) totalUnread++;

      const unlockedStages: ResolvedCodexStage[] = unlockedRaw.map((stage, idx) => ({
        ...stage,
        isNew: idx >= seenCount,
      }));

      let statusLabel: ResolvedCodexEntry['statusLabel'] = 'LOCKED';
      if (unlocked) {
        if (baselineCount === 0 && (state.codexSeenStages[spec.id] ?? 0) === 0) statusLabel = 'NEW';
        else if (unlockedRaw.length > seenCount) statusLabel = 'UPDATED';
        else statusLabel = 'READ';
      }

      return {
        spec,
        unlocked,
        unlockedStages,
        totalStages: spec.stages.length,
        hasUnread,
        statusLabel,
        annotationBand,
        annotationText: spec.annotations[annotationBand],
        hasMoreStages: unlockedRaw.length < spec.stages.length,
      };
    });

    return {
      categories: CATEGORIES,
      entries,
      totalUnread,
      totalUnlockedStages,
      totalStages,
    };
  }
}
