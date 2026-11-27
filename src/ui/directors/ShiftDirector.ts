import shiftsData from '../../content/shifts.json';
import type { AnomalySpec } from '../../engine/OpticsScene';
import {
  INTRO_TARGET_1_ID,
  INTRO_TARGET_2_ID,
  type GameState,
  type IntroStage,
  type StateStore,
} from '../../engine/StateStore';

export interface ShiftDef {
  shift: number;
  status: string;
  title: string;
  shiftMandate: string;
  requiredTargets: string[];
  optionalTargets: string[];
  targetAnomalies: string[];
  baseChaosPerShift: number;
  monthsPerShift: number;
  realHibernationYearsAfter: number;
  fractalStage: number;
  narrativeHooks?: {
    openingKnot?: string;
    postRequiredKnot?: string;
    dreamKnot?: string;
    optionalArchiveEchoId?: string | null;
  };
}

export interface MandateStatus {
  shift: number;
  shiftTitle: string;
  requiredDone: number;
  requiredTotal: number;
  mandateMet: boolean;
  canEnterDream: boolean;
  canTransmitCapstone: boolean;
  reason?: string;
}

/**
 * Coordinates multi-shift survey progression, 2-required mandate gating,
 * expired optional target tracking, and compact collapsible bearing lists.
 */
export class ShiftDirector {
  getShiftDef(shift: number): ShiftDef {
    const list = shiftsData.shifts as ShiftDef[];
    return list.find((s) => s.shift === shift) ?? list[0];
  }

  getUnlockedAnomalyIds(state: GameState): string[] {
    if (
      state.introStage === 'prologue' ||
      state.introStage === 'title' ||
      state.introStage === 'scan_target_1' ||
      state.introStage === 'mg_1_done'
    ) {
      return [INTRO_TARGET_1_ID];
    }
    if (state.introStage === 'scan_target_2') {
      return [INTRO_TARGET_1_ID, INTRO_TARGET_2_ID];
    }
    const unlocked = new Set<string>();
    for (const sh of shiftsData.shifts as ShiftDef[]) {
      if (sh.shift <= state.shift) {
        for (const id of sh.targetAnomalies) unlocked.add(id);
      }
    }
    for (const id of state.scannedAnomalyIds) unlocked.add(id);
    for (const id of state.decodedMinigameTargets) unlocked.add(id);
    return [...unlocked];
  }

  getMandateStatus(store: StateStore, state = store.getState()): MandateStatus {
    const def = this.getShiftDef(state.shift);
    const quota = store.getShiftQuotaStatus(state.shift);
    const isCapstoneReady = state.shift >= 6 && quota.mandateMet;
    const isIntroLocked =
      state.shift === 1 &&
      state.introStage !== 'complete' &&
      state.introStage !== 'mg_2_done';
    const canEnterDream = !isIntroLocked && quota.mandateMet && state.shift < 6;
    const reason = isIntroLocked
      ? 'Finish the Sol–Centauri and Cluster J1419-A checks before sleep.'
      : !quota.mandateMet
        ? `Decode ${quota.requiredIds.length - quota.requiredDone} more required target${
            quota.requiredIds.length - quota.requiredDone === 1 ? '' : 's'
          } to satisfy Shift ${state.shift} mandate.`
        : undefined;

    return {
      shift: state.shift,
      shiftTitle: def.title,
      requiredDone: quota.requiredDone,
      requiredTotal: quota.requiredIds.length,
      mandateMet: quota.mandateMet,
      canEnterDream,
      canTransmitCapstone: isCapstoneReady,
      reason,
    };
  }

  resolveDreamKnotForShift(shift: number): string {
    if (shift <= 1) return 'dream_shift1_audit';
    return this.getShiftDef(shift).narrativeHooks?.dreamKnot ?? 'dream_shift1_audit';
  }

  renderBearingIndex(
    nav: HTMLElement,
    specs: AnomalySpec[],
    state: GameState,
    markerEls: Map<string, HTMLButtonElement>,
    handlers: {
      onHover: () => void;
      onSelect: (targetId: string, alreadyScanned: boolean) => void;
    }
  ): void {
    const scanned = new Set(state.scannedAnomalyIds);
    const decoded = new Set(state.decodedMinigameTargets);
    const expired = new Set(state.expiredOptionalTargets ?? []);
    const unlockedSet = new Set(this.getUnlockedAnomalyIds(state));
    const shiftDef = this.getShiftDef(state.shift);
    const reqSet = new Set(shiftDef.requiredTargets ?? []);
    const optSet = new Set(shiftDef.optionalTargets ?? []);
    const currentShiftSet = new Set(shiftDef.targetAnomalies ?? []);

    const headerHtml =
      shiftDef.shiftMandate && (state.introStage === 'complete' || state.introStage === 'mg_2_done')
        ? `<div class="bearing-index-head"><span class="bearing-shift-tag">SHIFT ${state.shift} SURVEY</span><span class="bearing-mandate">${shiftDef.shiftMandate}</span></div>`
        : '';

    const visibleSpecs = specs.filter((spec) => unlockedSet.has(spec.id));
    const activeSpecs =
      state.shift > 1
        ? visibleSpecs.filter(
            (spec) => currentShiftSet.has(spec.id) || !decoded.has(spec.id)
          )
        : visibleSpecs;
    const priorCompletedSpecs =
      state.shift > 1
        ? visibleSpecs.filter(
            (spec) => !currentShiftSet.has(spec.id) && decoded.has(spec.id)
          )
        : [];

    const renderLink = (spec: AnomalySpec, isPrior = false): string => {
      const isDecoded = decoded.has(spec.id);
      const isScanned = scanned.has(spec.id);
      const isExpired = !isDecoded && expired.has(spec.id);
      const isReq = reqSet.has(spec.id);
      const isOpt = optSet.has(spec.id);
      const roleTag = isReq ? 'REQ' : isOpt ? 'OPT' : '';
      const badge = isDecoded
        ? 'DECODED'
        : isExpired
          ? 'EXPIRED'
          : isScanned
            ? `${spec.actionVerb ?? 'CALIBRATE'} ▸`
            : roleTag
              ? `${roleTag} · ${spec.bandName}`
              : spec.bandName;
      const cls = [
        'bearing-link',
        isReq ? 'is-required' : isOpt ? 'is-optional' : '',
        isDecoded ? 'decoded' : isScanned ? 'scanned' : '',
        isExpired ? 'is-expired' : '',
        isPrior ? 'is-prior' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `
        <button class="${cls}" data-bearing-id="${spec.id}" type="button">
          ${spec.label}<span>${badge}</span>
        </button>
      `;
    };

    const itemsHtml = activeSpecs.map((sp) => renderLink(sp, false)).join('');
    const priorHtml =
      priorCompletedSpecs.length > 0
        ? `
          <details class="bearing-prior-group">
            <summary>PRIOR SHIFTS ARCHIVED (${priorCompletedSpecs.length})</summary>
            <div class="bearing-prior-list">
              ${priorCompletedSpecs.map((sp) => renderLink(sp, true)).join('')}
            </div>
          </details>
        `
        : '';

    nav.innerHTML = headerHtml + itemsHtml + priorHtml;

    nav.querySelectorAll<HTMLButtonElement>('.bearing-link').forEach((btn) => {
      btn.addEventListener('mouseenter', () => handlers.onHover());
      btn.addEventListener('click', () => {
        const id = btn.dataset.bearingId!;
        handlers.onSelect(id, scanned.has(id));
      });
    });

    for (const [id, el] of markerEls.entries()) {
      const isReq = reqSet.has(id);
      const isOpt = optSet.has(id);
      const isPriorDone = state.shift > 1 && !currentShiftSet.has(id) && decoded.has(id);
      el.classList.toggle('scanned', scanned.has(id));
      el.classList.toggle('decoded', decoded.has(id));
      el.classList.toggle('is-required', isReq);
      el.classList.toggle('is-optional', isOpt || !isReq);
      el.classList.toggle('is-prior-decoded', isPriorDone);
      el.classList.toggle('is-expired', !decoded.has(id) && expired.has(id));
    }
  }

  getIntroVisibleIds(stage: IntroStage, state: GameState): string[] | null {
    if (stage === 'prologue' || stage === 'title' || stage === 'scan_target_1') {
      return [INTRO_TARGET_1_ID];
    }
    if (stage === 'mg_1_done') {
      return [INTRO_TARGET_1_ID];
    }
    if (stage === 'scan_target_2') {
      return [INTRO_TARGET_1_ID, INTRO_TARGET_2_ID];
    }
    return this.getUnlockedAnomalyIds(state);
  }
}
