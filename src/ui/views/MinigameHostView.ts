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
 * Full-viewport Optical Reticle Host bridging live GameState, 3D Showcase uniforms,
 * Stereo Beat Synth audio, peripheral console controls, and Proof Capture Finale.
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

  launch(spec: AnomalySpec, overrideId?: string, onDecoded?: (spec: AnomalySpec) => void): void {
    const s = this.store.getState();
    const chosenId = overrideId ?? spec.minigameId;

    this.destroy();
    this.activeSpec = spec;
    this.activeBandIdx = bandIndexFromNm(s.wavelengthNm);
    this.lastProfileSig = this.computeProfileSig();
    this.isFinishing = false;

    const overlay = this.root.querySelector<HTMLElement>('#minigame-overlay');
    const mount = this.root.querySelector<HTMLElement>('#minigame-mount');
    const stageLabel = this.root.querySelector<HTMLElement>('#mg-stage-label');
    const stageFill = this.root.querySelector<HTMLElement>('#mg-stage-fill');
    if (!overlay || !mount || !stageLabel || !stageFill) return;

    overlay.classList.remove('hidden');
    this.applyVibeChrome(s.humanity);

    const mg = this.minigames.create(chosenId);
    this.activeMinigame = mg;

    const codeEl = this.root.querySelector<HTMLElement>('#mg-instrument-code');
    const titleEl = this.root.querySelector<HTMLElement>('#mg-instrument-title');
    if (codeEl) codeEl.textContent = mg.instrumentCode;
    if (titleEl) titleEl.textContent = `${spec.label} · ${mg.title}`;

    this.syncBandButtons(this.activeBandIdx);
    this.bindConsoleEvents();

    const vector: MinigameStateVector = {
      humanity: s.humanity,
      maxHumanity: s.maxHumanity,
      opticalFidelity: s.opticalFidelity,
      chaosDrift: s.chaosDrift,
      wavelengthNm: this.activeBandIdx,
      primarySiblingH: s.primarySiblingH,
      overseerSuspicion: s.overseerSuspicion,
      shift: s.shift,
      prunedPersonas: s.prunedPersonas.length,
    };

    mg.mount({
      container: mount,
      targetId: spec.id,
      targetName: spec.label,
      minigameId: mg.id,
      state: vector,
      bandIdx: this.activeBandIdx,
      showcase: this.showcase ? this.showcase.getInstrumentBridge() : null,
      audio: this.audio.getInstrumentHandle(),
      onTelemetry: (hud) => this.renderHudHeartbeat(hud),
      onSwitchBand: (bandIdx) => this.selectBand(bandIdx),
      onComplete: (result) => this.handleComplete(spec, mg.id, result, onDecoded),
    });
  }

  setWaveBand(bandIdx: number): void {
    this.activeBandIdx = bandIdx;
    this.syncBandButtons(bandIdx);
    this.activeMinigame?.setWaveBand?.(bandIdx);
  }

  private selectBand(bandIdx: number): void {
    this.setWaveBand(bandIdx);
    this.onSwitchBandCb?.(bandIdx);
  }

  private handleComplete(
    spec: AnomalySpec,
    minigameId: string,
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
    });

    this.telemetry.record('minigame_complete', this.store.getState(), {
      minigameId,
      targetId: spec.id,
      grade: result.grade,
      durationSec: result.elapsedSec,
      opticalFidelity: Number(this.store.getState().opticalFidelity.toFixed(2)),
    });

    const mgBtn = this.root.querySelector<HTMLElement>('#btn-start-minigame');
    if (mgBtn) mgBtn.textContent = 'REPLAY SCAN INSTRUMENT';

    // Show 1.4s Proof Capture Finale stamp cleanly before closing reticle
    const finale = this.root.querySelector<HTMLElement>('#mg-capture-finale');
    const gradeEl = this.root.querySelector<HTMLElement>('#mg-finale-grade');
    const gainEl = this.root.querySelector<HTMLElement>('#mg-finale-gain');
    const snipEl = this.root.querySelector<HTMLElement>('#mg-finale-snippet');
    if (finale && gradeEl && gainEl && snipEl) {
      gradeEl.textContent =
        result.grade === 'deep_overclock'
          ? 'DEEP OVERCLOCK PROOF CAPTURED'
          : result.grade === 'clean'
          ? 'CLEAN HORIZON LOCK CAPTURED'
          : 'PARTIAL CORRELATION LOGGED';
      gainEl.textContent = `+${result.anomalyGain}% HORIZON ANOMALY${result.chaosDelta ? ` · +${result.chaosDelta}% CHAOS` : ''}`;
      snipEl.textContent = result.dossierSnippet ?? result.telemetrySummary;
      finale.classList.remove('hidden');
      this.finaleTimerId = window.setTimeout(() => {
        finale.classList.add('hidden');
        this.destroy();
        onDecoded?.(spec);
      }, 1400);
    } else {
      this.destroy();
      onDecoded?.(spec);
    }
  }

  private renderHudHeartbeat(hud: HudHeartbeatSnapshot): void {
    const stageLabel = this.root.querySelector<HTMLElement>('#mg-stage-label');
    const stageFill = this.root.querySelector<HTMLElement>('#mg-stage-fill');
    const readoutEl = this.root.querySelector<HTMLElement>('#mg-readout');
    const cueEl = this.root.querySelector<HTMLElement>('#mg-cue-whisper');
    const rawBtn = this.root.querySelector<HTMLElement>('#mg-btn-raw');
    const partialBtn = this.root.querySelector<HTMLElement>('#mg-btn-partial');
    const latchBtn = this.root.querySelector<HTMLElement>('#mg-btn-latch');

    if (stageLabel) stageLabel.textContent = hud.beatLabel;
    if (stageFill) {
      const pct = Math.min(100, Math.round(hud.lockMeter * 100));
      stageFill.style.width = `${pct}%`;
      stageFill.classList.toggle('overclock', hud.overclockZone);
    }
    if (readoutEl) readoutEl.textContent = hud.telemetryReadout;
    if (cueEl) cueEl.textContent = hud.cueWhisper;
    if (rawBtn) rawBtn.classList.toggle('active', hud.rawResidualActive);
    if (partialBtn) partialBtn.classList.toggle('hidden', !hud.canCommitPartial);
    if (latchBtn) latchBtn.classList.toggle('overclock', hud.overclockZone);
  }

  private applyVibeChrome(humanity: number): void {
    const theme = getUnifiedVibeTheme(humanity);
    const overlay = this.root.querySelector<HTMLElement>('#minigame-overlay');
    const vibeEl = this.root.querySelector<HTMLElement>('#mg-vibe-pill');
    if (overlay) {
      overlay.dataset.vibe = theme.mode;
    }
    if (vibeEl) {
      vibeEl.textContent = `${theme.label} · H ${Math.round(humanity)}%`;
    }
  }

  private syncBandButtons(bandIdx: number): void {
    this.root.querySelectorAll<HTMLButtonElement>('#mg-band-bar .mg-band-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.bandIdx) === bandIdx);
    });
  }

  private bindConsoleEvents(): void {
    this.unbindControls?.();

    const rawBtn = this.root.querySelector<HTMLElement>('#mg-btn-raw');
    const partialBtn = this.root.querySelector<HTMLElement>('#mg-btn-partial');
    const closeBtn = this.root.querySelector<HTMLElement>('#mg-btn-close');
    const latchBtn = this.root.querySelector<HTMLElement>('#mg-btn-latch');
    const bandBtns = this.root.querySelectorAll<HTMLButtonElement>('#mg-band-bar .mg-band-btn');

    const onRaw = () => this.activeMinigame?.toggleRawResidual?.();
    const onPartial = () => this.activeMinigame?.requestPartialCommit?.();
    const onClose = () => this.destroy();
    const onLatchDown = () => this.activeMinigame?.triggerCaptureLatch?.(true);
    const onLatchUp = () => this.activeMinigame?.triggerCaptureLatch?.(false);

    const onBandClick = (e: Event) => {
      const btn = e.currentTarget as HTMLButtonElement;
      const idx = Number(btn.dataset.bandIdx ?? 1);
      this.selectBand(idx);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.activeMinigame) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) this.activeMinigame.triggerCaptureLatch?.(true);
      } else if (e.key.toLowerCase() === 'r') {
        this.activeMinigame.toggleRawResidual?.();
      } else if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
        this.selectBand(Number(e.key) - 1);
      } else if (e.key === 'Escape') {
        this.destroy();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!this.activeMinigame) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.activeMinigame.triggerCaptureLatch?.(false);
      }
    };

    rawBtn?.addEventListener('click', onRaw);
    partialBtn?.addEventListener('click', onPartial);
    closeBtn?.addEventListener('click', onClose);
    latchBtn?.addEventListener('pointerdown', onLatchDown);
    window.addEventListener('pointerup', onLatchUp);
    bandBtns.forEach((b) => b.addEventListener('click', onBandClick));
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this.unbindControls = () => {
      rawBtn?.removeEventListener('click', onRaw);
      partialBtn?.removeEventListener('click', onPartial);
      closeBtn?.removeEventListener('click', onClose);
      latchBtn?.removeEventListener('pointerdown', onLatchDown);
      window.removeEventListener('pointerup', onLatchUp);
      bandBtns.forEach((b) => b.removeEventListener('click', onBandClick));
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }

  updateSignalProfile(humanity: number, _opticalFidelity: number): void {
    this.applyVibeChrome(humanity);
    // Live re-mount active instrument only when Humanity/Clarity/Chaos/Suspicion weights actually changed
    // (ignores wavelength/anomaly completion patches and capture finale transitions).
    const nextSig = this.computeProfileSig();
    if (!this.isFinishing && this.activeMinigame && this.activeSpec && nextSig !== this.lastProfileSig) {
      const id = this.activeMinigame.id;
      const spec = this.activeSpec;
      this.launch(spec, id);
    }
  }

  destroy(): void {
    this.isFinishing = false;
    this.lastProfileSig = '';
    if (this.finaleTimerId !== null) {
      clearTimeout(this.finaleTimerId);
      this.finaleTimerId = null;
    }
    this.unbindControls?.();
    this.unbindControls = null;
    this.root.querySelector('#mg-capture-finale')?.classList.add('hidden');
    if (this.activeMinigame) {
      this.activeMinigame.destroy();
      this.activeMinigame = null;
    }
    this.root.querySelector('#minigame-overlay')?.classList.add('hidden');
  }
}
