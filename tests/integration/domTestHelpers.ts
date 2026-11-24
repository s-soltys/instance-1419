import { vi } from 'vitest';
import anomaliesData from '../../src/content/anomalies.json';
import type { AnomalySpec } from '../../src/engine/OpticsScene';
import type {
  InstrumentAudioHandle,
  ShowcaseInstrumentBridge,
} from '../../src/engine/minigames/types';

export function installJsdomCanvasAndObservers(): void {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }

  const noop = () => {};
  const gradStub = { addColorStop: noop };
  const fakeCtx2d = {
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    roundRect: noop,
    fill: noop,
    stroke: noop,
    fillText: noop,
    setLineDash: noop,
    measureText: (t: string) => ({ width: t.length * 6 }),
    createRadialGradient: () => gradStub,
    createLinearGradient: () => gradStub,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
  };

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => fakeCtx2d,
  });

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16);
    window.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
  }
}

export function createMockAudioEngine() {
  const instrumentHandle: InstrumentAudioHandle = {
    updateBeatSynth: vi.fn(),
    stopInstrumentAudio: vi.fn(),
    playTumblerClick: vi.fn(),
    playStereoSonarEcho: vi.fn(),
    playSolenoidClack: vi.fn(),
    setWatchdogBed: vi.fn(),
    playCaptureShutter: vi.fn(),
    playProximityTick: vi.fn(),
    playPhaseLock: vi.fn(),
    playHapticThump: vi.fn(),
  };

  return {
    unlock: vi.fn(),
    playCue: vi.fn(),
    playHoverTick: vi.fn(),
    playVernierDetent: vi.fn(),
    isMuted: vi.fn(() => false),
    setMuted: vi.fn(),
    setMix: vi.fn(),
    updateMood: vi.fn(),
    updateProbeSignal: vi.fn(),
    getInstrumentHandle: vi.fn(() => instrumentHandle),
    _instrumentHandle: instrumentHandle,
  };
}

export function createMockShowcaseScene() {
  const bridge: ShowcaseInstrumentBridge = {
    applyInstrumentPatch: vi.fn(),
    trigger3DSonarPulse: vi.fn(),
    add3DBearingVector: vi.fn(),
    clearInstrumentOverlays: vi.fn(),
    resetInstrumentState: vi.fn(),
    getInstrumentGroup: vi.fn(() => null),
    register3DHandle: vi.fn(() => () => {}),
    setCameraKeyframe: vi.fn(),
    recenterCamera: vi.fn(),
    setVibeState: vi.fn(),
    commitDecodedState: vi.fn(),
    projectWorldToScreen: vi.fn(() => ({ x: 640, y: 360, visible: true })),
  };

  return {
    loadTarget: vi.fn(),
    setActive: vi.fn(),
    setWaveBand: vi.fn(),
    setOpticalFidelity: vi.fn(),
    zoomBy: vi.fn(),
    resetView: vi.fn(),
    getInstrumentBridge: vi.fn(() => bridge),
    _bridge: bridge,
  };
}

export function createMockOpticsScene() {
  const specs: AnomalySpec[] = anomaliesData.anomalies.map((a) => ({
    ...a,
    showcaseType: a.showcaseType as AnomalySpec['showcaseType'],
  }));
  return {
    getAnomalySpecs: vi.fn(() => specs),
    setActive: vi.fn(),
    setParameters: vi.fn(),
    slewToAnomaly: vi.fn(),
    zoomBy: vi.fn(),
  };
}

export function createMockVoiceEngine() {
  return {
    isEnabled: vi.fn(() => false),
    setEnabled: vi.fn(),
    speakSingle: vi.fn(),
    speakQueue: vi.fn(),
    stop: vi.fn(),
    getActiveSpeaker: vi.fn(() => null),
    getAmplitude: vi.fn(() => 0),
  };
}

export function createMockDreamCanvas() {
  return {
    setActive: vi.fn(),
    setState: vi.fn(),
  };
}
