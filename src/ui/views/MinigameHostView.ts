import type { AudioEngine } from '../../engine/AudioEngine';
import type { MinigameRegistry } from '../../engine/minigames/MinigameRegistry';
import { getUnifiedVibeTheme } from '../../engine/minigames/tactilePhysics';
import type {
  HudHeartbeatSnapshot,
  IMinigame,
  MinigameResult,
  MinigameStateVector,
} from '../../engine/minigames/types';
import type { AnomalySpec } from '../../engine/OpticsScene';
import type { StateStore } from '../../engine/StateStore';
import type { TargetShowcaseScene } from '../../engine/TargetShowcaseScene';
import type { TelemetryLogger } from '../../engine/TelemetryLogger';
import { platform } from '../../platform/PlatformAdapter';

const BAND_RATIOS = [0.04, 0.23, 0.61, 0.86];

function bandIndexFromNm(wavelengthNm: number): number {
  const r = Math.max(0, Math.min(1, (wavelengthNm - 200) / 1600));
  let best = 1;
  let bestDiff = 99;
  BAND_RATIOS.forEach((b, idx) => {
    const d = Math.abs(b - r);
    if (d < bestDiff) {
      bestDiff = d;
      best = idx;
    }
  });
  return best;
}

/**
 * Calm, Zeiss-glass Optical Reticle Host bridging live GameState, direct-touch/canvas
 * minigame optics, subtle haptics, Field Guide, and Proof Capture Stamp.
 */
export class MinigameHostView {
  private showcase: TargetShowcaseScene | null = null;
  private activeMinigame: IMinigame | null = null;
  private activeSpec: AnomalySpec | null = null;
  private activeBandIdx = 1;
  private finaleTimerId: number | null = null;
  private unbindControls: (() => void) | null = null;
  private onSwitchBandCb: ((bandIdx: number) => void) | null = null;
  private lastProfileSig = '';
  private isFinishing = false;
  private currentHelperActionId: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: StateStore,
    private readonly audio: AudioEngine,
    private readonly minigames: MinigameRegistry,
    private readonly telemetry: TelemetryLogger,
    showcase: TargetShowcaseScene | null = null
  ) {
    this.showcase = showcase;
  }

  attachShowcase(showcase: TargetShowcaseScene): void {
    this.showcase = showcase;
  }

  private computeProfileSig(): string {
    const s = this.store.getState();
    return `${Math.round(s.humanity)}:${s.opticalFidelity.toFixed(2)}:${Math.round(s.chaosDrift)}:${s.overseerSuspicion}`;
  }

  setBandSwitchCallback(cb: (bandIdx: number) => void): void {
    this.onSwitchBandCb = cb;
  }

  setWaveBand(bandIdx: number): void {
    this.activeBandIdx = bandIdx;
  }

  launch(spec: AnomalySpec, overrideId?: string, onDecoded?: (spec: AnomalySpec) => void): void {
    const s = this.store.getState();
    const chosenId = overrideId ?? spec.minigameId;

    this.destroy();
    this.activeSpec = spec;
    this.activeBandIdx = bandIndexFromNm(s.wavelengthNm);
    this.lastProfileSig = this.computeProfileSig();
    this.isFinishing = false;
    this.currentHelperActionId = null;

    const overlay = this.root.querySelector<HTMLElement>('#minigame-overlay');
    const mount = this.root.querySelector<HTMLElement>('#minigame-mount');
    if (!overlay || !mount) return;

    overlay.classList.remove('hidden');
    this.applyVibeChrome(s.humanity);

    const mg = this.minigames.create(chosenId);
    this.activeMinigame = mg;

    const codeEl = this.root.querySelector<HTMLElement>('#mg-instrument-code');
    const titleEl = this.root.querySelector<HTMLElement>('#mg-instrument-title');
    if (codeEl) codeEl.textContent = mg.instrumentCode;
    if (titleEl) titleEl.textContent = mg.title;

    this.renderStagePips(1, '1/3 · EASY');
    const helperBtn = this.root.querySelector<HTMLButtonElement>('#mg-helper-btn');
    if (helperBtn) {
      helperBtn.classList.add('hidden');
      helperBtn.classList.remove('active');
      helperBtn.textContent = '';
    }

    this.populateFieldGuide(mg);
    this.bindConsoleEvents();

    const bridge = this.showcase ? this.showcase.getInstrumentBridge() : null;
    bridge?.setVibeState?.(s.humanity, false);

    const vector: MinigameStateVector = {
      humanity: s.humanity,
      maxHumanity: s.maxHumanity,
      opticalFidelity: s.opticalFidelity,
      chaosDrift: s.chaosDrift,
      wavelengthNm: s.wavelengthNm,
      primarySiblingH: s.primarySiblingH,
      overseerSuspicion: s.overseerSuspicion,
      shift: s.shift,
      prunedPersonas: s.prunedPersonas.length,
      proofFragments: [...s.proofFragments],
    };

    const isFirstRun = !s.calibratedInstruments.includes(mg.id);

    mg.mount({
      container: mount,
      targetId: spec.id,
      targetName: spec.label,
      minigameId: mg.id,
      state: vector,
      bandIdx: this.activeBandIdx,
      isFirstRun,
      showcase: bridge,
      audio: this.audio.getInstrumentHandle(),
      onTelemetry: (hud) => this.renderHudHeartbeat(hud),
      onCalibrationComplete: () => this.store.markInstrumentCalibrated(mg.id),
      onComplete: (result) => this.handleComplete(spec, mg, result, onDecoded),
    });
  }

  private populateFieldGuide(mg: IMinigame): void {
    const guide = mg.getFieldGuide?.();
    const card = this.root.querySelector<HTMLElement>('#mg-field-guide-card');
    card?.classList.add('hidden');
    if (!guide) return;

    const titleEl = this.root.querySelector<HTMLElement>('#mg-guide-title');
    const prinEl = this.root.querySelector<HTMLElement>('#mg-guide-principle');
    const goalEl = this.root.querySelector<HTMLElement>('#mg-guide-goal');
    const warmEl = this.root.querySelector<HTMLElement>('#mg-guide-warmth');
    const ctrlEl = this.root.querySelector<HTMLElement>('#mg-guide-controls');
    const isCoarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

    if (titleEl) titleEl.textContent = `${mg.instrumentCode} · ${guide.title}`;
    if (prinEl) prinEl.textContent = guide.physicalPrinciple;
    if (goalEl) goalEl.textContent = guide.goalSummary;
    if (warmEl) warmEl.textContent = guide.warmthEffect;
    if (ctrlEl) ctrlEl.textContent = isCoarse ? guide.controlsTouch : guide.controlsDesktop;
  }

  private renderStagePips(stageIndex: 1 | 2 | 3, label: string): void {
    const labelEl = this.root.querySelector<HTMLElement>('#mg-stage-label');
    if (labelEl) labelEl.textContent = label;
    this.root.querySelectorAll<HTMLElement>('#mg-stage-pips .mg-pip').forEach((pip) => {
      const idx = Number(pip.dataset.stage ?? '1');
      pip.classList.toggle('done', idx < stageIndex);
      pip.classList.toggle('active', idx === stageIndex);
    });
  }

  private handleComplete(
    spec: AnomalySpec,
    mg: IMinigame,
    result: MinigameResult,
    onDecoded?: (spec: AnomalySpec) => void
  ): void {
    if (!result.success) {
      this.destroy();
      return;
    }

    this.isFinishing = true;

    this.store.recordMinigameCompletion(spec.id, spec.label, {
      anomalyGain: result.anomalyGain,
      grade: result.grade === 'aborted' ? undefined : result.grade,
      chaosDelta: result.chaosDelta,
      suspicionDelta: result.suspicionDelta,
      humanityDelta: result.humanityDelta,
      proofFragmentId: result.proofFragmentId,
      dossierSnippet: result.dossierSnippet,
      instrumentCode: mg.instrumentCode,
      physicalPrinciple: result.physicalPrinciple,
    });
    this.store.markInstrumentCalibrated(mg.id);

    this.showcase?.getInstrumentBridge().commitDecodedState?.(spec.id, {
      progress: 1,
      dustPeel: 1,
      slicePlaneZ: 12,
      unwarpProgress: 1,
      seamReveal: 1,
      jetResonance: 0.85,
      fringeContrast: 1,
      fringePhase: 0,
    });

    this.telemetry.record('minigame_complete', this.store.getState(), {
      minigameId: mg.id,
      targetId: spec.id,
      grade: result.grade,
      durationSec: result.elapsedSec,
      opticalFidelity: Number(this.store.getState().opticalFidelity.toFixed(2)),
    });

    const mgBtn = this.root.querySelector<HTMLElement>('#btn-start-minigame');
    if (mgBtn) mgBtn.textContent = 'REPLAY SCAN INSTRUMENT';

    const finale = this.root.querySelector<HTMLElement>('#mg-capture-finale');
    const gradeEl = this.root.querySelector<HTMLElement>('#mg-finale-grade');
    const gainEl = this.root.querySelector<HTMLElement>('#mg-finale-gain');
    const snipEl = this.root.querySelector<HTMLElement>('#mg-finale-snippet');
    const prinEl = this.root.querySelector<HTMLElement>('#mg-finale-principle');
    const logBtn = this.root.querySelector<HTMLButtonElement>('#mg-btn-log-dossier');

    if (finale && gradeEl && gainEl && snipEl) {
      gradeEl.textContent = `ANALYSIS LOGGED · ${spec.label.toUpperCase()}`;
      gainEl.textContent = `+${result.anomalyGain}% HORIZON ANOMALY`;
      snipEl.textContent = result.dossierSnippet ?? result.telemetrySummary;
      if (prinEl) {
        prinEl.textContent = result.physicalPrinciple ? `PRINCIPLE: ${result.physicalPrinciple}` : '';
      }
      finale.classList.remove('hidden');

      const finishClose = () => {
        if (this.finaleTimerId !== null) {
          clearTimeout(this.finaleTimerId);
          this.finaleTimerId = null;
        }
        finale.classList.add('hidden');
        this.destroy(true);
        onDecoded?.(spec);
      };

      if (logBtn) {
        logBtn.disabled = false;
        logBtn.onclick = () => {
          this.audio.playCue('choice');
          finishClose();
        };
      }
      this.finaleTimerId = window.setTimeout(finishClose, 9000);
    } else {
      this.destroy(true);
      onDecoded?.(spec);
    }
  }

  private renderHudHeartbeat(hud: HudHeartbeatSnapshot): void {
    this.renderStagePips(hud.stageIndex, hud.stageLabel);

    const cueEl = this.root.querySelector<HTMLElement>('#mg-cue-whisper');
    if (cueEl) cueEl.textContent = hud.promptText;

    const helperBtn = this.root.querySelector<HTMLButtonElement>('#mg-helper-btn');
    if (helperBtn) {
      if (hud.actionButton) {
        this.currentHelperActionId = hud.actionButton.id;
        helperBtn.textContent = hud.actionButton.label;
        helperBtn.classList.toggle('active', Boolean(hud.actionButton.active));
        helperBtn.classList.remove('hidden');
      } else {
        this.currentHelperActionId = null;
        helperBtn.classList.add('hidden');
        helperBtn.classList.remove('active');
      }
    }

    this.showcase?.getInstrumentBridge().setVibeState?.(this.store.getState().humanity, false);
  }

  private applyVibeChrome(humanity: number): void {
    const theme = getUnifiedVibeTheme(humanity);
    const overlay = this.root.querySelector<HTMLElement>('#minigame-overlay');
    if (overlay) {
      overlay.dataset.vibe = theme.mode;
    }
  }

  private bindConsoleEvents(): void {
    this.unbindControls?.();

    const closeBtn = this.root.querySelector<HTMLElement>('#mg-btn-close');
    const guideBtn = this.root.querySelector<HTMLElement>('#mg-btn-guide');
    const guideCloseBtn = this.root.querySelector<HTMLElement>('#mg-btn-guide-close');
    const guideCard = this.root.querySelector<HTMLElement>('#mg-field-guide-card');
    const helperBtn = this.root.querySelector<HTMLButtonElement>('#mg-helper-btn');

    const onClose = () => this.destroy(false);
    const onToggleGuide = () => {
      this.audio.playCue('choice');
      guideCard?.classList.toggle('hidden');
    };
    const onCloseGuide = () => {
      guideCard?.classList.add('hidden');
    };
    const onHelperClick = () => {
      if (!this.currentHelperActionId) return;
      platform.triggerHaptic('vernierTick', 0.6);
      this.activeMinigame?.onHelperAction?.(this.currentHelperActionId);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.activeMinigame) return;
      if (e.key === '?' || e.key === '/') {
        onToggleGuide();
      } else if (e.key === 'Escape') {
        if (guideCard && !guideCard.classList.contains('hidden')) {
          guideCard.classList.add('hidden');
        } else {
          this.destroy(false);
        }
      }
    };

    closeBtn?.addEventListener('click', onClose);
    guideBtn?.addEventListener('click', onToggleGuide);
    guideCloseBtn?.addEventListener('click', onCloseGuide);
    helperBtn?.addEventListener('click', onHelperClick);
    window.addEventListener('keydown', onKeyDown);

    this.unbindControls = () => {
      closeBtn?.removeEventListener('click', onClose);
      guideBtn?.removeEventListener('click', onToggleGuide);
      guideCloseBtn?.removeEventListener('click', onCloseGuide);
      helperBtn?.removeEventListener('click', onHelperClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }

  updateSignalProfile(humanity: number, _opticalFidelity: number): void {
    this.applyVibeChrome(humanity);
    const nextSig = this.computeProfileSig();
    if (!this.isFinishing && this.activeMinigame && this.activeSpec && nextSig !== this.lastProfileSig) {
      const id = this.activeMinigame.id;
      const spec = this.activeSpec;
      this.launch(spec, id);
    }
  }

  destroy(preserveDecoded = false): void {
    this.isFinishing = false;
    this.lastProfileSig = '';
    this.currentHelperActionId = null;
    if (this.finaleTimerId !== null) {
      clearTimeout(this.finaleTimerId);
      this.finaleTimerId = null;
    }
    this.unbindControls?.();
    this.unbindControls = null;
    this.root.querySelector('#mg-capture-finale')?.classList.add('hidden');
    this.root.querySelector('#mg-field-guide-card')?.classList.add('hidden');
    this.root.querySelector('#mg-helper-btn')?.classList.add('hidden');
    if (this.activeMinigame) {
      this.activeMinigame.destroy();
      this.activeMinigame = null;
    }
    if (!preserveDecoded) {
      this.showcase?.getInstrumentBridge().resetInstrumentState();
    }
    this.root.querySelector('#minigame-overlay')?.classList.add('hidden');
    void this.onSwitchBandCb;
  }
}
