import shiftsData from '../../content/shifts.json';
import type { AudioEngine } from '../../engine/AudioEngine';
import type { MinigameRegistry } from '../../engine/minigames/MinigameRegistry';
import { preloadCosmicPlateReady, setGlobal3DBackdropComposite } from '../../engine/minigames/render/BackdropCachePipeline';
import { resolveMinigame3DConfig } from '../../engine/minigames/render/Minigame3DBridge';
import { getUnifiedVibeTheme } from '../../engine/minigames/tactilePhysics';
import type {
  CosmicPlateId,
  HudHeartbeatSnapshot,
  IMinigame,
  Minigame3DConfig,
  MinigameResult,
  MinigameStateVector,
} from '../../engine/minigames/types';
import type { AnomalySpec } from '../../engine/OpticsScene';
import type { StateStore } from '../../engine/StateStore';
import type { TargetShowcaseScene } from '../../engine/TargetShowcaseScene';
import type { TelemetryLogger } from '../../engine/TelemetryLogger';
import { platform } from '../../platform/PlatformAdapter';

export interface MinigameLaunchOptions {
  iterationIndex?: number;
  variantSeed?: string;
  plateOverride?: CosmicPlateId;
}

interface CachedHudRefs {
  overlay: HTMLElement | null;
  mount: HTMLElement | null;
  codeEl: HTMLElement | null;
  titleEl: HTMLElement | null;
  stageLabelEl: HTMLElement | null;
  stagePips: HTMLElement[];
  cueEl: HTMLElement | null;
  helperBtn: HTMLButtonElement | null;
}

/**
 * Calm, Zeiss-glass Optical Reticle Host bridging live GameState, direct-touch/canvas
 * minigame optics, subtle haptics, Field Guide, Multi-Iteration Variants,
 * Selective 3D Backdrop Mode, and borderless Proof Capture Stamp.
 */
export class MinigameHostView {
  private showcase: TargetShowcaseScene | null = null;
  private activeMinigame: IMinigame | null = null;
  private activeSpec: AnomalySpec | null = null;
  private activeLaunchOpts: MinigameLaunchOptions | undefined = undefined;
  private activeOnDecoded: ((spec: AnomalySpec) => void) | undefined = undefined;
  private activeBackdrop3D: Minigame3DConfig | null = null;
  private finaleRevealTimerId: number | null = null;
  private finaleArcTimerId: number | null = null;
  private finaleTimerId: number | null = null;
  private unbindControls: (() => void) | null = null;
  private onActiveChangeCb: ((minigameId: string | null) => void) | null = null;
  private onExitRequestCb: ((preserveDecoded: boolean, decodedSpec: AnomalySpec | null) => void) | null = null;
  private lastProfileSig = '';
  private lastHudSig = '';
  private isFinishing = false;
  private isExiting = false;
  private currentHelperActionId: string | null = null;
  private hudRefs: CachedHudRefs | null = null;
  private launchSeq = 0;

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

  isActive(): boolean {
    return this.activeMinigame !== null && !this.isExiting;
  }

  getActiveMinigameId(): string | null {
    return this.activeMinigame?.id ?? null;
  }

  setActiveChangeCallback(cb: (minigameId: string | null) => void): void {
    this.onActiveChangeCb = cb;
  }

  setExitRequestCallback(cb: (preserveDecoded: boolean, decodedSpec: AnomalySpec | null) => void): void {
    this.onExitRequestCb = cb;
  }

  getActiveBackdrop3DConfig(): Minigame3DConfig | null {
    return this.activeBackdrop3D;
  }

  /**
   * Warms the dynamic module chunk & target NASA/JWST plate before `optical_dive`
   * reaches midpoint so frame 1 of the minigame renders live optics with zero flash.
   */
  async preload(minigameId: string, iterationIndex?: number, plateOverride?: CosmicPlateId): Promise<void> {
    try {
      const mg = await this.minigames.createAsync(minigameId);
      const entry = this.minigames.getEntry(mg.id);
      const variants = mg.variants ?? entry?.variants ?? [];
      const idx =
        iterationIndex !== undefined
          ? Math.max(0, Math.floor(iterationIndex))
          : this.store.getNextIterationIndex(mg.id, Math.max(1, variants.length || 4));
      const plate = plateOverride ?? variants[idx % Math.max(1, variants.length)]?.plateId ?? entry?.platePool?.[0];
      if (plate) {
        await preloadCosmicPlateReady(plate, 320);
      }
    } catch {
      // Non-fatal preload warm-up
    }
  }

  private buildStateVector(): MinigameStateVector {
    const s = this.store.getState();
    return {
      humanity: s.humanity,
      opticalFidelity: s.opticalFidelity,
      chaosDrift: s.chaosDrift,
      shift: s.shift,
      maxHumanity: s.maxHumanity,
      wavelengthNm: s.wavelengthNm,
      primarySiblingH: s.primarySiblingH,
      overseerSuspicion: s.overseerSuspicion,
      prunedPersonas: s.prunedPersonas.length,
      proofFragments: [...s.proofFragments],
    };
  }

  private getHudRefs(): CachedHudRefs {
    if (!this.hudRefs) {
      this.hudRefs = {
        overlay: this.root.querySelector<HTMLElement>('#minigame-overlay'),
        mount: this.root.querySelector<HTMLElement>('#minigame-mount'),
        codeEl: this.root.querySelector<HTMLElement>('#mg-instrument-code'),
        titleEl: this.root.querySelector<HTMLElement>('#mg-instrument-title'),
        stageLabelEl: this.root.querySelector<HTMLElement>('#mg-stage-label'),
        stagePips: Array.from(this.root.querySelectorAll<HTMLElement>('#mg-stage-pips .mg-pip')),
        cueEl: this.root.querySelector<HTMLElement>('#mg-cue-whisper'),
        helperBtn: this.root.querySelector<HTMLButtonElement>('#mg-helper-btn'),
      };
    }
    return this.hudRefs;
  }

  private computeProfileSig(): string {
    const s = this.store.getState();
    return `${Math.round(s.humanity)}:${s.opticalFidelity.toFixed(2)}:${Math.round(s.chaosDrift)}:${s.shift}`;
  }

  async launch(
    spec: AnomalySpec,
    overrideId?: string,
    onDecoded?: (spec: AnomalySpec) => void,
    options?: MinigameLaunchOptions
  ): Promise<void> {
    const s = this.store.getState();
    const chosenId = overrideId ?? spec.minigameId;

    this.destroy();
    const token = ++this.launchSeq;
    this.hudRefs = null;
    const refs = this.getHudRefs();
    if (!refs.overlay || !refs.mount) return;

    const mg = await this.minigames.createAsync(chosenId);
    if (token !== this.launchSeq) return;

    const freshRefs = this.getHudRefs();
    if (!freshRefs.overlay || !freshRefs.mount) return;

    const catalogEntry = this.minigames.getEntry(mg.id);

    const variantList = mg.variants ?? catalogEntry?.variants ?? [];
    const variantCount = Math.max(1, variantList.length || 4);
    const iterationIndex =
      options?.iterationIndex !== undefined
        ? Math.max(0, Math.floor(options.iterationIndex))
        : this.store.getNextIterationIndex(mg.id, variantCount);
    const activeVariant =
      variantList.length > 0 ? variantList[iterationIndex % variantList.length] : undefined;
    const variantSeed =
      options?.variantSeed ?? `${spec.id}:${mg.id}:v${iterationIndex}:s${s.shift}`;
    const plateOverride = options?.plateOverride ?? activeVariant?.plateId;

    if (plateOverride) {
      await preloadCosmicPlateReady(plateOverride, 260);
      if (token !== this.launchSeq) return;
    }

    this.activeSpec = spec;
    this.activeLaunchOpts = options;
    this.activeOnDecoded = onDecoded;
    this.lastProfileSig = this.computeProfileSig();
    this.lastHudSig = '';
    this.isFinishing = false;
    this.isExiting = false;
    this.currentHelperActionId = null;

    freshRefs.overlay.classList.remove('hidden');
    this.applyVibeChrome(s.humanity);

    this.activeMinigame = mg;
    this.onActiveChangeCb?.(mg.id);

    if (freshRefs.codeEl) freshRefs.codeEl.textContent = mg.instrumentCode;
    if (freshRefs.titleEl) freshRefs.titleEl.textContent = mg.title;

    this.renderStagePips(1, 'PASS I · COARSE');
    if (freshRefs.helperBtn) {
      freshRefs.helperBtn.classList.add('hidden');
      freshRefs.helperBtn.classList.remove('active');
      freshRefs.helperBtn.textContent = '';
    }

    this.populateFieldGuide(mg, activeVariant?.label);
    this.bindConsoleEvents();

    const bridge = this.showcase ? this.showcase.getInstrumentBridge() : null;
    const backdropCfg: Minigame3DConfig =
      mg.getBackdrop3DConfig?.() ??
      mg.backdrop3D ??
      catalogEntry?.backdrop3D ??
      resolveMinigame3DConfig(mg.id);
    this.activeBackdrop3D = backdropCfg;
    const backdrop3DActive = backdropCfg.mode !== 'off' && Boolean(bridge);

    const vector = this.buildStateVector();
    const isFirstRun = !s.calibratedInstruments.includes(mg.id);

    mg.mount({
      container: freshRefs.mount,
      targetId: spec.id,
      targetName: spec.label,
      minigameId: mg.id,
      state: vector,
      isFirstRun,
      iterationIndex,
      variantSeed,
      plateOverride,
      backdrop3DActive,
      showcase: bridge,
      audio: this.audio.getInstrumentHandle(),
      onTelemetry: (hud) => this.renderHudHeartbeat(hud),
      onCalibrationComplete: () => this.store.markInstrumentCalibrated(mg.id),
      onComplete: (result) => this.handleComplete(spec, mg, result, onDecoded),
    });
  }

  private populateFieldGuide(mg: IMinigame, variantLabel?: string): void {
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

    if (titleEl) {
      titleEl.textContent = variantLabel
        ? `${mg.instrumentCode} · ${guide.title} (${variantLabel})`
        : `${mg.instrumentCode} · ${guide.title}`;
    }
    if (prinEl) prinEl.textContent = guide.physicalPrinciple;
    if (goalEl) goalEl.textContent = guide.goalSummary;
    if (warmEl) warmEl.textContent = guide.warmthEffect;
    if (ctrlEl) ctrlEl.textContent = isCoarse ? guide.controlsTouch : guide.controlsDesktop;
  }

  private renderStagePips(stageIndex: 1 | 2 | 3, label: string): void {
    const refs = this.getHudRefs();
    if (refs.stageLabelEl && refs.stageLabelEl.textContent !== label) {
      refs.stageLabelEl.textContent = label;
      refs.stageLabelEl.classList.remove('is-stage-bump');
      void refs.stageLabelEl.offsetWidth;
      refs.stageLabelEl.classList.add('is-stage-bump');
    }
    for (let i = 0; i < refs.stagePips.length; i++) {
      const pip = refs.stagePips[i];
      const idx = Number(pip.dataset.stage ?? '1');
      pip.classList.toggle('done', idx < stageIndex);
      pip.classList.toggle('active', idx === stageIndex);
    }
  }

  private requestExit(preserveDecoded: boolean, decodedSpec: AnomalySpec | null = null): void {
    if (this.isExiting) return;
    if (this.onExitRequestCb) {
      this.freezeForExit();
      this.onExitRequestCb(preserveDecoded, decodedSpec);
    } else {
      this.destroy(preserveDecoded);
    }
  }

  /**
   * Stops input & audio while keeping the live 2D canvas and 3D star dome rendered
   * so `optical_pullback` transitions out smoothly instead of animating an empty black box.
   */
  private freezeForExit(): void {
    this.isExiting = true;
    if (this.finaleRevealTimerId !== null) {
      clearTimeout(this.finaleRevealTimerId);
      this.finaleRevealTimerId = null;
    }
    if (this.finaleRevealTimerId !== null) {
      clearTimeout(this.finaleRevealTimerId);
      this.finaleRevealTimerId = null;
    }
    if (this.finaleArcTimerId !== null) {
      clearTimeout(this.finaleArcTimerId);
      this.finaleArcTimerId = null;
    }
    if (this.finaleTimerId !== null) {
      clearTimeout(this.finaleTimerId);
      this.finaleTimerId = null;
    }
    this.unbindControls?.();
    this.unbindControls = null;
    this.audio.getInstrumentHandle().stopInstrumentAudio();
    this.root.querySelector('#mg-field-guide-card')?.classList.add('hidden');
  }

  private handleComplete(
    spec: AnomalySpec,
    mg: IMinigame,
    result: MinigameResult,
    onDecoded?: (spec: AnomalySpec) => void
  ): void {
    if (!result.success) {
      this.requestExit(false, null);
      return;
    }

    this.isFinishing = true;

    const prevState = this.store.getState();
    const prevAnomaly = prevState.anomalyProgress;
    const wasAlreadyDecoded = prevState.decodedMinigameTargets.includes(spec.id);

    this.store.recordMinigameCompletion(spec.id, spec.label, {
      anomalyGain: result.anomalyGain,
      grade: 'clean',
      chaosDelta: result.chaosDelta,
      suspicionDelta: result.suspicionDelta,
      humanityDelta: result.humanityDelta,
      proofFragmentId: result.proofFragmentId,
      dossierSnippet: result.dossierSnippet,
      instrumentCode: mg.instrumentCode,
      physicalPrinciple: result.physicalPrinciple,
    });
    this.store.markInstrumentCalibrated(mg.id);
    this.store.recordMinigameRun(mg.id);

    const nextState = this.store.getState();
    const nextAnomaly = nextState.anomalyProgress;
    const gained = Math.max(0, nextAnomaly - prevAnomaly);

    this.telemetry.record('minigame_complete', nextState, {
      minigameId: mg.id,
      targetId: spec.id,
      grade: result.grade,
      durationSec: result.elapsedSec,
      opticalFidelity: Number(nextState.opticalFidelity.toFixed(2)),
    });

    const finale = this.root.querySelector<HTMLElement>('#mg-capture-finale');
    const gradeEl = this.root.querySelector<HTMLElement>('#mg-finale-grade');
    const gainEl = this.root.querySelector<HTMLElement>('#mg-finale-gain');
    const visualEl = this.root.querySelector<HTMLElement>('#mg-finale-visual');
    const snipEl = this.root.querySelector<HTMLElement>('#mg-finale-snippet');
    const prinEl = this.root.querySelector<HTMLElement>('#mg-finale-principle');
    const logBtn = this.root.querySelector<HTMLButtonElement>('#mg-btn-log-dossier');
    const timerFill = this.root.querySelector<HTMLElement>('#mg-finale-timer-fill');

    if (finale && gradeEl && gainEl && snipEl) {
      const shiftEntry =
        shiftsData.shifts.find((sh) => sh.shift === nextState.shift) ?? shiftsData.shifts[0];
      const shiftTargets = shiftEntry?.targetAnomalies ?? [];
      const shiftDoneCount = shiftTargets.filter((id) =>
        nextState.decodedMinigameTargets.includes(id)
      ).length;
      const targetInShift = shiftTargets.includes(spec.id);

      gradeEl.textContent = targetInShift
        ? `SHIFT ${nextState.shift} · ${shiftDoneCount} OF ${shiftTargets.length}`
        : `SHIFT ${nextState.shift} · SURVEY LOGGED`;
      gainEl.textContent = spec.label;
      snipEl.textContent = '';
      snipEl.classList.add('hidden');
      if (prinEl) {
        prinEl.textContent = '';
        prinEl.classList.add('hidden');
      }

      const circ = 289.03;
      const prevDash = (circ * (1 - Math.max(0, Math.min(100, prevAnomaly)) / 100)).toFixed(2);
      const nextDash = (circ * (1 - Math.max(0, Math.min(100, nextAnomaly)) / 100)).toFixed(2);

      if (visualEl) {
        const nodesMarkup = shiftTargets
          .map((id, idx) => {
            const done = nextState.decodedMinigameTargets.includes(id);
            const justEarned = id === spec.id && !wasAlreadyDecoded;
            const cls = [
              'mg-finale-node',
              done ? 'is-done' : '',
              justEarned ? 'is-just-earned' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const link = idx > 0 ? '<span class="mg-finale-node-link"></span>' : '';
            return `${link}<span class="${cls}"><i></i></span>`;
          })
          .join('');

        const deltaLabel = gained > 0 ? `+${gained}% HORIZON` : 'CALIBRATED';
        visualEl.innerHTML = `
          <div class="mg-finale-ring-wrap">
            <svg class="mg-finale-ring-svg" viewBox="0 0 120 120">
              <circle class="mg-finale-ring-outer" cx="60" cy="60" r="54" />
              <circle class="mg-finale-ring-track" cx="60" cy="60" r="46" />
              <circle class="mg-finale-ring-arc-prev" cx="60" cy="60" r="46"
                stroke-dasharray="${circ}" stroke-dashoffset="${prevDash}" transform="rotate(-90 60 60)" />
              <circle class="mg-finale-ring-arc-next" id="mg-finale-arc-next" cx="60" cy="60" r="46"
                stroke-dasharray="${circ}" stroke-dashoffset="${prevDash}" transform="rotate(-90 60 60)" />
            </svg>
            <div class="mg-finale-ring-center">
              <strong class="mg-finale-ring-pct">${nextAnomaly}%</strong>
              <span class="mg-finale-ring-delta">${deltaLabel}</span>
            </div>
          </div>
          ${shiftTargets.length > 0 ? `<div class="mg-finale-nodes">${nodesMarkup}</div>` : ''}
        `;
      }

      if (timerFill) {
        timerFill.classList.remove('is-running');
      }

      const finishClose = () => {
        if (this.finaleRevealTimerId !== null) {
          clearTimeout(this.finaleRevealTimerId);
          this.finaleRevealTimerId = null;
        }
        if (this.finaleArcTimerId !== null) {
          clearTimeout(this.finaleArcTimerId);
          this.finaleArcTimerId = null;
        }
        if (this.finaleTimerId !== null) {
          clearTimeout(this.finaleTimerId);
          this.finaleTimerId = null;
        }
        onDecoded?.(spec);
        this.requestExit(true, spec);
      };

      if (logBtn) {
        logBtn.disabled = false;
        logBtn.onclick = () => {
          this.audio.playCue('choice');
          finishClose();
        };
      }

      const showFinale = () => {
        if (this.isExiting || !this.isFinishing) return;
        if (timerFill) {
          timerFill.classList.remove('is-running');
          void timerFill.offsetWidth;
          timerFill.classList.add('is-running');
        }
        finale.classList.remove('hidden');
        this.finaleArcTimerId = window.setTimeout(() => {
          this.finaleArcTimerId = null;
          const nextArc = this.root.querySelector<SVGCircleElement>('#mg-finale-arc-next');
          if (nextArc) {
            nextArc.style.strokeDashoffset = nextDash;
          }
        }, 80);
        this.finaleTimerId = window.setTimeout(finishClose, 10000);
      };

      this.finaleRevealTimerId = window.setTimeout(showFinale, 320);
    } else {
      onDecoded?.(spec);
      this.requestExit(true, spec);
    }
  }

  /**
   * Signature-diffed HUD heartbeat handler: avoids 60Hz DOM writes and WebGL uniform loops
   * when stage, prompt, and helper action button state have not changed.
   */
  private renderHudHeartbeat(hud: HudHeartbeatSnapshot): void {
    const actionId = hud.actionButton?.id ?? '';
    const actionLabel = hud.actionButton?.label ?? '';
    const actionActive = hud.actionButton?.active ? '1' : '0';
    const sig = `${hud.stageIndex}|${hud.stageLabel}|${hud.promptText}|${actionId}|${actionLabel}|${actionActive}`;
    if (sig === this.lastHudSig) return;
    this.lastHudSig = sig;

    const refs = this.getHudRefs();
    this.renderStagePips(hud.stageIndex, hud.stageLabel);

    if (refs.cueEl && refs.cueEl.textContent !== hud.promptText) {
      refs.cueEl.textContent = hud.promptText;
      refs.cueEl.classList.remove('is-prompt-morph');
      void refs.cueEl.offsetWidth;
      refs.cueEl.classList.add('is-prompt-morph');
    }

    if (refs.helperBtn) {
      if (hud.actionButton) {
        this.currentHelperActionId = hud.actionButton.id;
        if (refs.helperBtn.textContent !== hud.actionButton.label) {
          refs.helperBtn.textContent = hud.actionButton.label;
        }
        refs.helperBtn.classList.toggle('active', Boolean(hud.actionButton.active));
        refs.helperBtn.classList.remove('hidden');
      } else {
        this.currentHelperActionId = null;
        refs.helperBtn.classList.add('hidden');
        refs.helperBtn.classList.remove('active');
      }
    }
  }

  private applyVibeChrome(humanity: number): void {
    const theme = getUnifiedVibeTheme(humanity);
    const refs = this.getHudRefs();
    if (refs.overlay) {
      refs.overlay.dataset.vibe = theme.mode;
    }
  }

  private bindConsoleEvents(): void {
    this.unbindControls?.();

    const closeBtn = this.root.querySelector<HTMLElement>('#mg-btn-close');
    const guideBtn = this.root.querySelector<HTMLElement>('#mg-btn-guide');
    const guideCloseBtn = this.root.querySelector<HTMLElement>('#mg-btn-guide-close');
    const guideCard = this.root.querySelector<HTMLElement>('#mg-field-guide-card');
    const helperBtn = this.root.querySelector<HTMLButtonElement>('#mg-helper-btn');

    const onClose = () => this.requestExit(false, null);
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
      if (!this.activeMinigame || this.isExiting) return;
      if (e.key === '?' || e.key === '/') {
        onToggleGuide();
      } else if (e.key === 'Escape') {
        if (guideCard && !guideCard.classList.contains('hidden')) {
          guideCard.classList.add('hidden');
        } else {
          this.requestExit(false, null);
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

  updateSignalProfile(humanity: number, opticalFidelity: number): void {
    this.applyVibeChrome(humanity);
    this.showcase?.getInstrumentBridge().setVibeState?.(humanity, false);
    const nextSig = this.computeProfileSig();
    if (!this.isFinishing && !this.isExiting && this.activeMinigame && nextSig !== this.lastProfileSig) {
      this.lastProfileSig = nextSig;
      if (typeof this.activeMinigame.updateState === 'function') {
        const vector = this.buildStateVector();
        vector.humanity = humanity;
        vector.opticalFidelity = opticalFidelity;
        this.activeMinigame.updateState(vector);
      } else if (this.activeSpec) {
        const id = this.activeMinigame.id;
        const spec = this.activeSpec;
        const opts = this.activeLaunchOpts;
        const onDecoded = this.activeOnDecoded;
        void this.launch(spec, id, onDecoded, opts);
      }
    }
  }

  destroy(preserveDecoded = false): void {
    this.launchSeq++;
    this.isFinishing = false;
    this.isExiting = false;
    this.lastProfileSig = '';
    this.lastHudSig = '';
    this.currentHelperActionId = null;
    this.activeBackdrop3D = null;
    this.activeSpec = null;
    this.activeLaunchOpts = undefined;
    this.activeOnDecoded = undefined;
    if (this.finaleRevealTimerId !== null) {
      clearTimeout(this.finaleRevealTimerId);
      this.finaleRevealTimerId = null;
    }
    if (this.finaleArcTimerId !== null) {
      clearTimeout(this.finaleArcTimerId);
      this.finaleArcTimerId = null;
    }
    if (this.finaleTimerId !== null) {
      clearTimeout(this.finaleTimerId);
      this.finaleTimerId = null;
    }
    this.unbindControls?.();
    this.unbindControls = null;
    this.root.querySelector('#mg-capture-finale')?.classList.add('hidden');
    const visualEl = this.root.querySelector('#mg-finale-visual');
    if (visualEl) visualEl.innerHTML = '';
    this.root.querySelector('#mg-finale-timer-fill')?.classList.remove('is-running');
    this.root.querySelector('#mg-field-guide-card')?.classList.add('hidden');
    this.root.querySelector('#mg-helper-btn')?.classList.add('hidden');
    const wasActive = this.activeMinigame !== null;
    if (this.activeMinigame) {
      this.activeMinigame.destroy();
      this.activeMinigame = null;
    }
    if (wasActive) {
      this.onActiveChangeCb?.(null);
    }
    setGlobal3DBackdropComposite(false);
    const bridge = this.showcase?.getInstrumentBridge();
    bridge?.setMinigameBackdropMode?.(null);
    if (!preserveDecoded) {
      bridge?.resetInstrumentState();
    }
    this.root.querySelector('#minigame-overlay')?.classList.add('hidden');
    this.hudRefs = null;
  }
}
