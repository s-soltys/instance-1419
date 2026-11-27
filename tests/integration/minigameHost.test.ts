import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import anomaliesData from '../../src/content/anomalies.json';
import { MinigameRegistry } from '../../src/engine/minigames/MinigameRegistry';
import type { AnomalySpec } from '../../src/engine/OpticsScene';
import { StateStore } from '../../src/engine/StateStore';
import { TelemetryLogger } from '../../src/engine/TelemetryLogger';
import { MinigameHostView } from '../../src/ui/views/MinigameHostView';
import {
  createMockAudioEngine,
  createMockShowcaseScene,
  installJsdomCanvasAndObservers,
} from './domTestHelpers';

function buildOverlayDom(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="stage">
      <div class="minigame-overlay hidden" id="minigame-overlay" data-vibe="warm">
        <div class="mg-top-hud">
          <span id="mg-instrument-code"></span>
          <span id="mg-instrument-title"></span>
          <span id="mg-instrument-sub"></span>
          <span id="mg-stage-label"></span>
          <i id="mg-stage-fill" style="width:0%"></i>
          <span id="mg-vibe-pill"></span>
          <button id="mg-btn-recenter"></button>
          <button id="mg-btn-guide"></button>
        </div>
        <div id="mg-calibration-banner" class="hidden">
          <strong id="mg-cal-title"></strong>
          <span id="mg-cal-detail"></span>
        </div>
        <aside id="mg-field-guide-card" class="hidden">
          <strong id="mg-guide-title"></strong>
          <p id="mg-guide-target-action-wrap" class="hidden"><span id="mg-guide-target-action"></span></p>
          <span id="mg-guide-principle"></span>
          <span id="mg-guide-goal"></span>
          <span id="mg-guide-warmth"></span>
          <span id="mg-guide-controls"></span>
          <button id="mg-btn-guide-close"></button>
        </aside>
        <div id="minigame-mount"></div>
        <div id="mg-extra-controls" class="hidden"></div>
        <div class="mg-capture-finale hidden" id="mg-capture-finale">
          <div id="mg-finale-grade"></div>
          <div id="mg-finale-gain"></div>
          <div id="mg-finale-outcome"></div>
          <div id="mg-finale-visual"></div>
          <div id="mg-finale-mandate"></div>
          <div id="mg-finale-snippet" class="hidden"></div>
          <div id="mg-finale-principle"></div>
          <button id="mg-btn-log-dossier"></button>
        </div>
        <div class="mg-bottom-console">
          <div id="mg-band-bar">
            <button class="mg-band-btn" data-band-idx="0"></button>
            <button class="mg-band-btn active" data-band-idx="1"></button>
            <button class="mg-band-btn" data-band-idx="2"></button>
            <button class="mg-band-btn" data-band-idx="3"></button>
          </div>
          <div id="mg-readout"></div>
          <div id="mg-cue-whisper"></div>
          <button id="mg-btn-raw"></button>
          <button id="mg-btn-partial" class="hidden"></button>
          <i id="mg-latch-fill" style="width:0%"></i>
          <button id="mg-btn-latch"></button>
          <button id="mg-btn-close"></button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

describe('MinigameHostView lifecycle & crash regressions', () => {
  let root: HTMLElement;
  let host: MinigameHostView;
  let store: StateStore;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    installJsdomCanvasAndObservers();
    root = buildOverlayDom();
    store = new StateStore();
  });

  afterEach(() => {
    host?.destroy();
    document.body.innerHTML = '';
  });

  it('launches safely even when attachShowcase has not been called yet (graceful null guard)', async () => {
    const mockAudio = createMockAudioEngine();
    const reg = new MinigameRegistry();
    const spec = anomaliesData.anomalies[0] as AnomalySpec;
    host = new MinigameHostView(
      root,
      store,
      mockAudio as never,
      reg,
      new TelemetryLogger(store.getState())
    );

    await expect(host.launch(spec)).resolves.toBeUndefined();
    expect(root.querySelector('#minigame-overlay')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('#minigame-mount canvas.minigame-canvas')).not.toBeNull();
  });

  it('mounts, populates Field Guide, bridges 3D showcase, and destroys cleanly for all 6 instruments', async () => {
    const mockAudio = createMockAudioEngine();
    const mockShowcase = createMockShowcaseScene();
    const reg = new MinigameRegistry();
    const spec = anomaliesData.anomalies[2] as AnomalySpec;

    host = new MinigameHostView(
      root,
      store,
      mockAudio as never,
      reg,
      new TelemetryLogger(store.getState())
    );
    host.attachShowcase(mockShowcase as never);

    for (const meta of reg.listCatalog()) {
      mockShowcase.getInstrumentBridge.mockClear();
      await host.launch(spec, meta.id);

      expect(mockShowcase.getInstrumentBridge).toHaveBeenCalled();
      expect(root.querySelector('#mg-instrument-code')?.textContent).toBe(meta.instrumentCode);
      expect(root.querySelector('#minigame-mount canvas.minigame-canvas')).not.toBeNull();
      expect(root.querySelector('#mg-guide-principle')?.textContent?.length).toBeGreaterThan(15);

      host.destroy();

      expect(root.querySelector('#minigame-overlay')?.classList.contains('hidden')).toBe(true);
      expect(root.querySelector('#minigame-mount canvas.minigame-canvas')).toBeNull();
      expect(mockShowcase._bridge.resetInstrumentState).toHaveBeenCalled();
    }
  });

  it('updates an active instrument in-place on H% or fidelity shifts without resetting canvas or stage', async () => {
    const mockAudio = createMockAudioEngine();
    const mockShowcase = createMockShowcaseScene();
    const reg = new MinigameRegistry();
    const spec = anomaliesData.anomalies[2] as AnomalySpec;

    host = new MinigameHostView(
      root,
      store,
      mockAudio as never,
      reg,
      new TelemetryLogger(store.getState())
    );
    host.attachShowcase(mockShowcase as never);

    await host.launch(spec, 'wave_shaper');
    const firstCanvas = root.querySelector('#minigame-mount canvas');

    store.patch({ wavelengthNm: 1580 });
    host.updateSignalProfile(store.getState().humanity, store.getState().opticalFidelity);
    expect(root.querySelector('#minigame-mount canvas')).toBe(firstCanvas);

    store.patch({ humanity: 28, opticalFidelity: 0.88 });
    host.updateSignalProfile(28, 0.88);
    expect(root.querySelector<HTMLElement>('#minigame-overlay')?.dataset.vibe).toBe('cold');
    expect(root.querySelector('#minigame-mount canvas')).toBe(firstCanvas);
  });

  it('configures selective 3D backdrop mode per game and restores cleanly on destroy', async () => {
    const mockAudio = createMockAudioEngine();
    const mockShowcase = createMockShowcaseScene();
    const reg = new MinigameRegistry();
    const spec = anomaliesData.anomalies[1] as AnomalySpec;

    host = new MinigameHostView(
      root,
      store,
      mockAudio as never,
      reg,
      new TelemetryLogger(store.getState())
    );
    host.attachShowcase(mockShowcase as never);

    // Spatial game (wave_shaper) enables lightweight single-pass 3D backdrop mode
    await host.launch(spec, 'wave_shaper', undefined, { iterationIndex: 2 });
    expect(mockShowcase._bridge.setMinigameBackdropMode).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'ambient_stars', propRig: 'dust_wisps' })
    );
    expect(root.querySelector('#mg-guide-title')?.textContent).toContain('Rho Ophiuchi Dust Echo');

    // Pure-plate game (lens_focus) suspends 3D WebGL cleanly (mode: 'off')
    mockShowcase._bridge.setMinigameBackdropMode!.mockClear();
    await host.launch(spec, 'lens_focus');
    expect(mockShowcase._bridge.setMinigameBackdropMode).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'off' })
    );

    // Destroy restores full showcase mode (null)
    mockShowcase._bridge.setMinigameBackdropMode!.mockClear();
    host.destroy();
    expect(mockShowcase._bridge.setMinigameBackdropMode).toHaveBeenCalledWith(null);
  });

  it('renders visual horizon gain, dossier finding, required/optional nodes, and baseline closure on completion', async () => {
    vi.useFakeTimers();
    try {
      const mockAudio = createMockAudioEngine();
      const reg = new MinigameRegistry();
      const spec = anomaliesData.anomalies[0] as AnomalySpec;

      host = new MinigameHostView(
        root,
        store,
        mockAudio as never,
        reg,
        new TelemetryLogger(store.getState())
      );

      await host.launch(spec, spec.minigameId);
      expect(root.querySelector('#mg-instrument-title')?.textContent).toBe(spec.label);
      expect(root.querySelector('#mg-instrument-sub')?.textContent?.toUpperCase()).toBe(
        'STELLAR CONSTELLATION'
      );
      expect(root.querySelector('#mg-guide-target-action')?.textContent).toBe(
        spec.preScanBrief?.instrumentAction
      );

      const mg = (host as unknown as { activeMinigame: { getSolvabilityHarness: () => { solveStage: (s: 1 | 2 | 3) => void } } }).activeMinigame;
      const harness = mg.getSolvabilityHarness();
      harness.solveStage(1);
      harness.solveStage(2);
      harness.solveStage(3);

      expect(root.querySelector('#mg-finale-grade')?.textContent).toBe('SHIFT 1 · 1 OF 2 REQUIRED');
      expect(root.querySelector('#mg-finale-gain')?.textContent).toBe(spec.label);
      expect(root.querySelector('#mg-finale-outcome')?.getAttribute('data-grade')).toBe('clean');
      expect(root.querySelector('#mg-finale-outcome')?.textContent).toContain('CLEAN LOCK');
      expect(root.querySelector('#mg-finale-snippet')?.classList.contains('hidden')).toBe(false);
      expect(root.querySelector('#mg-finale-snippet')?.textContent).toBe(
        spec.postScanEcho?.dossierFinding
      );
      expect(root.querySelector('#mg-finale-mandate')?.textContent).toContain('SHIFT 1 MANDATE (1/2 REQUIRED');
      expect(root.querySelector('.mg-finale-ring-delta')?.textContent).toBe(
        'BASELINE LOCKED · 10.0 LY VECTOR SET'
      );
      expect(root.querySelector('#mg-finale-visual svg')).not.toBeNull();
      expect(root.querySelectorAll('#mg-finale-visual .mg-finale-node').length).toBe(4);
      expect(root.querySelectorAll('#mg-finale-visual .mg-finale-node.is-required').length).toBe(2);
      expect(root.querySelectorAll('#mg-finale-visual .mg-finale-node.is-optional').length).toBe(2);
      expect(root.querySelectorAll('#mg-finale-visual .mg-finale-node.is-just-earned').length).toBe(1);

      vi.advanceTimersByTime(450);
      expect(root.querySelector('#mg-capture-finale')?.classList.contains('hidden')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('supports Stage-3 Anomaly Overclock (deep_overclock) in Shift 5 and logs overclock consequences', async () => {
    vi.useFakeTimers();
    try {
      const mockAudio = createMockAudioEngine();
      const reg = new MinigameRegistry();
      const spec = anomaliesData.anomalies.find((a) => a.id === 'michelson_delay_node') as AnomalySpec;
      store.patch({ shift: 5, introStage: 'complete' });

      host = new MinigameHostView(
        root,
        store,
        mockAudio as never,
        reg,
        new TelemetryLogger(store.getState())
      );

      await host.launch(spec, spec.minigameId);
      const mg = (host as unknown as { activeMinigame: { getSolvabilityHarness: () => { solveStage: (s: 1 | 2 | 3) => void } } }).activeMinigame;
      const harness = mg.getSolvabilityHarness();
      harness.solveStage(1);
      harness.solveStage(2);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' }));
      harness.solveStage(3);

      expect(store.getState().decodedGrades.michelson_delay_node).toBe('deep_overclock');
      expect(root.querySelector('#mg-finale-outcome')?.getAttribute('data-grade')).toBe('deep_overclock');
      expect(root.querySelector('#mg-finale-outcome')?.textContent).toContain('DEEP OVERCLOCK');
      expect(root.querySelector('.mg-finale-ring-delta')?.textContent).toContain('HORIZON');

      vi.advanceTimersByTime(450);
      expect(root.querySelector('#mg-capture-finale')?.classList.contains('hidden')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
