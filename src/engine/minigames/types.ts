import type { AudioEngine } from '../AudioEngine';
import type { AnomalySpec } from '../OpticsScene';

export interface MinigameResult {
  minigameId: string;
  targetId: string;
  durationSec: number;
}

export interface MinigameContext {
  container: HTMLElement;
  humanity: number;
  opticalFidelity: number;
  target: AnomalySpec;
  audio: AudioEngine;
  onStageUpdate: (stageLabel: string, progress01: number) => void;
  onComplete: (result: MinigameResult) => void;
  onCancel: () => void;
}

export interface IMinigame {
  readonly id: string;
  readonly title: string;
  readonly tagline: string;
  readonly warmthNote: string;
  mount(ctx: MinigameContext): void;
  setSignalProfile(humanity: number, opticalFidelity: number): void;
  destroy(): void;
}
