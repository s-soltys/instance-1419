import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogueRunner } from '../../src/engine/DialogueRunner';
import { MinigameRegistry } from '../../src/engine/minigames/MinigameRegistry';
import { StateStore } from '../../src/engine/StateStore';
import { StoryletScheduler } from '../../src/engine/StoryletScheduler';
import { UIController } from '../../src/ui/UIController';
import {
  createMockAudioEngine,
  createMockDreamCanvas,
  createMockOpticsScene,
  createMockShowcaseScene,
  createMockVoiceEngine,
  installJsdomCanvasAndObservers,
} from './domTestHelpers';

describe('UIController <-> MinigameHostView <-> DevHarness wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    installJsdomCanvasAndObservers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('wires showcase cleanly through DevHarness launch buttons without throwing TypeError', () => {
    const appRoot = document.getElementById('app')!;
    const store = new StateStore();
    const audio = createMockAudioEngine();
    const voice = createMockVoiceEngine();
    const dialogue = new DialogueRunner(store, audio.playCue);
    const scheduler = new StoryletScheduler();
    const minigames = new MinigameRegistry();

    const ui = new UIController(
      appRoot,
      store,
      audio as never,
      voice as never,
      dialogue,
      scheduler,
      minigames
    );

    const optics = createMockOpticsScene();
    const showcase = createMockShowcaseScene();
    const dream = createMockDreamCanvas();

    ui.attachRenderers(optics as never, showcase as never, dream as never);

    // Clicking DevHarness launch button reproduces the exact production trigger path
    const causticBtn = document.querySelector<HTMLButtonElement>('[data-launch-mg="caustic_unwarper"]');
    expect(causticBtn).not.toBeNull();
    causticBtn!.click();

    // Advance transitionToMode timers cleanly
    vi.advanceTimersByTime(1000);

    expect(showcase.loadTarget).toHaveBeenCalled();
    expect(showcase.getInstrumentBridge).toHaveBeenCalled();
    expect(appRoot.querySelector('#minigame-overlay')?.classList.contains('hidden')).toBe(false);
    expect(appRoot.querySelector('#mg-instrument-code')?.textContent).toBe('CAU-03');

    // Switching to another instrument whose anomaly targets a different 3D showcase reloads target
    const fourierBtn = document.querySelector<HTMLButtonElement>('[data-launch-mg="fourier_sieve"]');
    expect(fourierBtn).not.toBeNull();
    fourierBtn!.click();
    vi.advanceTimersByTime(1000);

    expect(showcase.loadTarget).toHaveBeenCalledTimes(2);
    expect(appRoot.querySelector('#mg-instrument-code')?.textContent).toBe('FFT-02');
  });
});
