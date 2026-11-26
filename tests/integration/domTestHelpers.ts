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
    ellipse: noop,
    rect: noop,
    clip: noop,
    drawImage: noop,
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
    }),
    putImageData: noop,
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
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
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
    playCaptureShutter: vi.fn(),
    playProximityTick: vi.fn(),
    playPhaseLock: vi.fn(),
    playHapticThump: vi.fn(),
  };

  return {
    unlock: vi.fn(),
    playCue: vi.fn(),
    playStatusShift: vi.fn(),
    playHoverTick: vi.fn(),
    playVernierDetent: vi.fn(),
    isMuted: vi.fn(() => false),
    setMuted: vi.fn(),
    setMix: vi.fn(),
    updateMood: vi.fn(),
    syncMusicContext: vi.fn(),
    getMusicDirector: vi.fn(() => ({
      listCues: () => [],
      listColdStems: () => [],
      getActiveCueId: () => null,
      getActiveCueLabel: () => 'Procedural Observatory Bed',
      isPlayingPrebaked: () => false,
      setAuditionOverride: vi.fn(),
    })),
    updateProbeSignal: vi.fn(),
    getInstrumentHandle: vi.fn(() => instrumentHandle),
    _instrumentHandle: instrumentHandle,
  };
}

export function createMockShowcaseScene() {
  const bridge: ShowcaseInstrumentBridge = {
    applyInstrumentPatch: vi.fn(),
    clearInstrumentOverlays: vi.fn(),
    resetInstrumentState: vi.fn(),
    setVibeState: vi.fn(),
    commitDecodedState: vi.fn(),
    setMinigameBackdropMode: vi.fn(),
    setMinigameParallax: vi.fn(),
  };

  return {
    loadTarget: vi.fn(),
    enterTarget: vi.fn(),
    setMinigameBackdropMode: vi.fn(),
    setActive: vi.fn(),
    setWaveBand: vi.fn(),
    setOpticalFidelity: vi.fn(),
    triggerArrivalPullIn: vi.fn(),
    triggerDeparturePullOut: vi.fn(),
    zoomBy: vi.fn(),
    resetView: vi.fn(),
    getPerfInfo: vi.fn(() => ({ active: false, calls: 0, triangles: 0, geometries: 0, textures: 0, dpr: 1 })),
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
    setAmbientDrift: vi.fn(),
    isAmbientDrift: vi.fn(() => false),
    setVisibleTargetIds: vi.fn(),
    getVisibleTargetIds: vi.fn(() => null),
    setMagneticDetentTarget: vi.fn(),
    getMagneticDetentTarget: vi.fn(() => null),
    setIntroFraming: vi.fn(),
    pullInToTarget1: vi.fn(),
    triggerTransitionDive: vi.fn(),
    triggerPullbackArrival: vi.fn(),
    slewToAnomaly: vi.fn(),
    zoomBy: vi.fn(),
    getViewportSize: vi.fn(() => ({ width: 1280, height: 720 })),
    getPerfInfo: vi.fn(() => ({ active: false, calls: 0, triangles: 0, geometries: 0, textures: 0, dpr: 1 })),
  };
}

export function createMockVoiceEngine() {
  return {
    isEnabled: vi.fn(() => false),
    setEnabled: vi.fn(),
    setVolume: vi.fn(),
    getVolume: vi.fn(() => 0.92),
    speakSingle: vi.fn(),
    speakQueue: vi.fn(),
    stop: vi.fn(),
    waitForQueueNearEnd: vi.fn(() => Promise.resolve()),
    getActiveSpeaker: vi.fn(() => null),
    getActiveLineId: vi.fn(() => null),
    getAmplitude: vi.fn(() => 0),
    subscribe: vi.fn(() => () => {}),
  };
}

export function createMockDreamCanvas() {
  return {
    setActive: vi.fn(),
    setState: vi.fn(),
    triggerEntranceReveal: vi.fn(),
    triggerSlicePulse: vi.fn(),
    setWakeProgress: vi.fn(),
    triggerWakeSequence: vi.fn(),
    setDrowsyPeek: vi.fn(),
    triggerSleepClose: vi.fn(),
    setHumanityOscillation: vi.fn(),
    getPerfInfo: vi.fn(() => ({ active: false, calls: 0, triangles: 0, geometries: 0, textures: 0, dpr: 1 })),
  };
}
