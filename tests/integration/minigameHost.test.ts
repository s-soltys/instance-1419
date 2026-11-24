import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
          <span id="mg-stage-label"></span>
          <i id="mg-stage-fill" style="width:0%"></i>
          <span id="mg-vibe-pill"></span>
        </div>
        <div id="minigame-mount"></div>
        <div class="mg-capture-finale hidden" id="mg-capture-finale">
          <div id="mg-finale-grade"></div>
          <div id="mg-finale-gain"></div>
          <div id="mg-finale-snippet"></div>
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

  it('launches safely even when attachShowcase has not been called yet (graceful null guard)', () => {
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

    expect(() => host.launch(spec)).not.toThrow();
    expect(root.querySelector('#minigame-overlay')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('#minigame-mount canvas.minigame-canvas')).not.toBeNull();
  });

  it('mounts, bridges 3D showcase, switches bands, toggles RAW, and destroys cleanly for all 5 instruments', () => {
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
      host.launch(spec, meta.id);

      expect(mockShowcase.getInstrumentBridge).toHaveBeenCalledTimes(1);
      expect(root.querySelector('#mg-instrument-code')?.textContent).toBe(meta.instrumentCode);
      expect(root.querySelector('#minigame-mount canvas.minigame-canvas')).not.toBeNull();

      host.setWaveBand(3);
      expect(
        root.querySelector('#mg-band-bar [data-band-idx="3"]')?.classList.contains('active')
      ).toBe(true);

      // Toggle RAW Residual key handler
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
      host.destroy();

      expect(root.querySelector('#minigame-overlay')?.classList.contains('hidden')).toBe(true);
      expect(root.querySelector('#minigame-mount canvas.minigame-canvas')).toBeNull();
      expect(mockShowcase._bridge.resetInstrumentState).toHaveBeenCalled();
    }
  });

  it('does not reset an active instrument on wavelength change, but updates when H% shifts', () => {
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

    host.launch(spec, 'fourier_sieve');
    const firstCanvas = root.querySelector('#minigame-mount canvas');

    // Same H%, fidelity, chaos, suspicion -> should NOT re-mount!
    store.patch({ wavelengthNm: 1580 });
    host.updateSignalProfile(store.getState().humanity, store.getState().opticalFidelity);
    expect(root.querySelector('#minigame-mount canvas')).toBe(firstCanvas);

    // Changing Humanity to Cold regime SHOULD update vibe chrome + cleanly re-mount with Cold profile
    store.patch({ humanity: 28, opticalFidelity: 0.88 });
    host.updateSignalProfile(28, 0.88);
    expect(root.querySelector<HTMLElement>('#minigame-overlay')?.dataset.vibe).toBe('cold');
    expect(root.querySelector('#mg-vibe-pill')?.textContent).toContain('SURGICAL COLD');
    expect(root.querySelector('#minigame-mount canvas')).not.toBe(firstCanvas);
  });
});
