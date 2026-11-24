import type { AudioEngine } from '../../engine/AudioEngine';
import type { MinigameRegistry } from '../../engine/minigames/MinigameRegistry';
import type { IMinigame } from '../../engine/minigames/types';
import type { AnomalySpec } from '../../engine/OpticsScene';
import type { StateStore } from '../../engine/StateStore';
import type { TelemetryLogger } from '../../engine/TelemetryLogger';

/**
 * Hosts the active optical minigame instrument overlay and propagates live
 * Humanity + opticalFidelity updates from the store or QA Harness.
 */
export class MinigameHostView {
  private activeMinigame: IMinigame | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: StateStore,
    private readonly audio: AudioEngine,
    private readonly minigames: MinigameRegistry,
    private readonly telemetry: TelemetryLogger
  ) {}

  launch(spec: AnomalySpec, overrideId?: string, onDecoded?: (spec: AnomalySpec) => void): void {
    const s = this.store.getState();
    const chosenId = overrideId ?? spec.minigameId;

    this.destroy();
    const overlay = this.root.querySelector<HTMLElement>('#minigame-overlay');
    const mount = this.root.querySelector<HTMLElement>('#minigame-mount');
    const stageLabel = this.root.querySelector<HTMLElement>('#mg-stage-label');
    const stageFill = this.root.querySelector<HTMLElement>('#mg-stage-fill');
    if (!overlay || !mount || !stageLabel || !stageFill) return;

    overlay.classList.remove('hidden');

    const mg = this.minigames.create(chosenId);
    this.activeMinigame = mg;

    mg.mount({
      container: mount,
      humanity: s.humanity,
      opticalFidelity: s.opticalFidelity,
      target: spec,
      audio: this.audio,
      onStageUpdate: (label, progress) => {
        stageLabel.textContent = label;
        stageFill.style.width = `${Math.round(progress * 100)}%`;
      },
      onComplete: (result) => {
        this.destroy();
        this.store.recordMinigameCompletion(spec.id, spec.label);
        this.telemetry.record('minigame_complete', this.store.getState(), {
          minigameId: result.minigameId,
          targetId: result.targetId,
          durationSec: result.durationSec,
          opticalFidelity: Number(this.store.getState().opticalFidelity.toFixed(2)),
        });
        const mgBtn = this.root.querySelector<HTMLElement>('#btn-start-minigame');
        if (mgBtn) mgBtn.textContent = 'REPLAY SCAN MINIGAME';
        onDecoded?.(spec);
      },
      onCancel: () => {
        this.destroy();
      },
    });
  }

  updateSignalProfile(humanity: number, opticalFidelity: number): void {
    this.activeMinigame?.setSignalProfile(humanity, opticalFidelity);
  }

  destroy(): void {
    if (this.activeMinigame) {
      this.activeMinigame.destroy();
      this.activeMinigame = null;
    }
    this.root.querySelector('#minigame-overlay')?.classList.add('hidden');
  }
}
