import * as THREE from 'three';
import charactersData from '../content/characters.json';
import type { RendererPerfInfo } from './OpticsScene';
import { DREAM_FRAGMENT, DREAM_VERTEX } from './shaders/dreamShaders';

interface TableauVariant {
  image: string;
  faceAnchor?: number[];
  label?: string;
}

interface CharacterEntry {
  tableau?: string | null;
  portrait?: string | null;
  faceAnchor?: number[];
  tableaus?: Record<string, TableauVariant>;
}

const CHAR_MAP = charactersData.characters as Record<string, CharacterEntry>;
const CHAR_ASSETS = import.meta.glob('../../assets/characters/*.webp', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

function resolveCharacterAssetUrl(assetPath: string | null | undefined): string | null {
  if (!assetPath) return null;
  const normalized = assetPath.replace(/^\/+/, '');
  for (const [globKey, url] of Object.entries(CHAR_ASSETS)) {
    if (globKey.endsWith(normalized)) {
      return url;
    }
  }
  return null;
}

export interface HumanityOscillationConfig {
  center: number;
  amplitude: number;
  periodSec: number;
  startPhase?: number;
}

export class DreamCanvas {
  private readonly container: HTMLElement;
  private readonly textureCache = new Map<string, THREE.Texture>();
  private readonly onResizeBound = () => this.resize();
  private readonly isCoarsePointer =
    typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);

  // Lazy-initialized WebGL objects
  private initialized = false;
  private disposed = false;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private quadGeo: THREE.PlaneGeometry | null = null;
  private mat: THREE.ShaderMaterial | null = null;
  private loader: THREE.TextureLoader | null = null;
  private appliedDpr = 1;

  private currentPersonaId = 'phantom_spouse';
  private currentVariantKey = 'base';
  private humanity = 70;
  private pruned = false;
  private overseerActive = false;
  private anomalyProgress = 0;
  private fractalStage = 1;
  private active = false;
  private rafId = 0;
  private revealProgress = 1.0;
  private wakeProgress = 1.0;
  private wakeAnimating = false;
  private wakeElapsed = 0;
  private wakeStartProgress = 0.02;
  private drowsyPeek = false;
  private drowsyElapsed = 0;
  private sleepClosing = false;
  private sleepCloseElapsed = 0;
  private sleepStartProgress = 1.0;
  private headTiltRad = 0;
  private oscConfig: HumanityOscillationConfig | null = null;
  private oscElapsed = 0;
  private slicePulse = 0.0;
  private lastFrameMs = performance.now();
  private lastRenderMs = 0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  private ensureInitialized(): void {
    if (this.initialized || this.disposed) return;
    this.initialized = true;

    const w = Math.max(1, this.container.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight || 720);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    const maxDpr = this.isCoarsePointer ? 1.25 : 1.5;
    this.appliedDpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(this.appliedDpr);
    renderer.setSize(w, h);
    renderer.domElement.className = 'dream-canvas';
    renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
    this.container.appendChild(renderer.domElement);

    const initialAnchor = CHAR_MAP[this.currentPersonaId]?.faceAnchor ?? [0.4, 0.73];
    const mat = new THREE.ShaderMaterial({
      vertexShader: DREAM_VERTEX,
      fragmentShader: DREAM_FRAGMENT,
      uniforms: {
        uTexture: { value: null },
        uTime: { value: 0 },
        uHumanity: { value: this.humanity / 100 },
        uPruned: { value: this.pruned ? 1.0 : 0.0 },
        uOverseer: { value: this.overseerActive ? 1.0 : 0.0 },
        uReveal: { value: this.revealProgress },
        uWakeProgress: { value: this.wakeProgress },
        uHeadTilt: { value: this.headTiltRad },
        uSlicePulse: { value: this.slicePulse },
        uViewAspect: { value: w / h },
        uTexAspect: { value: 1280 / 714 },
        uFaceAnchor: { value: new THREE.Vector2(initialAnchor[0], initialAnchor[1]) },
        uAnomalyProgress: { value: this.anomalyProgress },
        uFractalStage: { value: this.fractalStage },
      },
    });

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(quadGeo, mat));

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.quadGeo = quadGeo;
    this.mat = mat;
    this.loader = new THREE.TextureLoader();

    this.setPersona(this.currentPersonaId, this.currentVariantKey);
    window.addEventListener('resize', this.onResizeBound);
  }

  setPersona(personaId: string, variantKey = 'base'): void {
    this.currentPersonaId = personaId;
    this.currentVariantKey = variantKey;
    if (!this.mat || !this.loader) return;

    const entry = CHAR_MAP[personaId] ?? CHAR_MAP.phantom_spouse;
    const variant = entry?.tableaus?.[variantKey] ?? entry?.tableaus?.base;
    const anchor = variant?.faceAnchor ?? entry?.faceAnchor ?? [0.4, 0.73];
    (this.mat.uniforms.uFaceAnchor.value as THREE.Vector2).set(anchor[0], anchor[1]);

    const url =
      resolveCharacterAssetUrl(variant?.image ?? entry?.tableau ?? entry?.portrait) ??
      Object.values(CHAR_ASSETS)[0];
    if (!url) return;

    const cached = this.textureCache.get(url);
    if (cached) {
      this.applyTexture(cached);
      return;
    }

    const tex = this.loader.load(url, (loaded) => {
      this.applyTexture(loaded);
      this.lastRenderMs = 0;
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    this.textureCache.set(url, tex);
    this.mat.uniforms.uTexture.value = tex;
  }

  private applyTexture(tex: THREE.Texture): void {
    if (!this.mat) return;
    this.mat.uniforms.uTexture.value = tex;
    const img = tex.image as { width?: number; height?: number } | undefined;
    if (img?.width && img?.height) {
      this.mat.uniforms.uTexAspect.value = img.width / img.height;
    }
  }

  resize(): void {
    if (!this.renderer || !this.mat) return;
    const w = Math.max(1, this.container.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight || 720);
    this.renderer.setSize(w, h);
    this.mat.uniforms.uViewAspect.value = w / h;
    this.lastRenderMs = 0;
  }

  setState(
    humanity: number,
    pruned: boolean,
    overseerActive: boolean,
    personaId?: string,
    variantKey?: string
  ): void {
    this.humanity = humanity;
    this.pruned = pruned;
    this.overseerActive = overseerActive;
    const nextVariant = variantKey ?? (personaId && personaId !== this.currentPersonaId ? 'base' : this.currentVariantKey);
    if (
      (personaId && personaId !== this.currentPersonaId) ||
      nextVariant !== this.currentVariantKey
    ) {
      this.setPersona(personaId ?? this.currentPersonaId, nextVariant);
    }
    this.lastRenderMs = 0;
  }

  setAnomalyState(anomalyProgress: number, fractalStage: number): void {
    this.anomalyProgress =
      anomalyProgress > 1
        ? Math.max(0, Math.min(1, anomalyProgress / 100))
        : Math.max(0, Math.min(1, anomalyProgress));
    this.fractalStage = Math.max(1, Math.min(6, fractalStage));
    this.lastRenderMs = 0;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active) {
      this.ensureInitialized();
      this.resize();
      this.lastFrameMs = performance.now();
      this.lastRenderMs = 0;
      if (!this.rafId) this.rafId = requestAnimationFrame(this.loop);
    } else if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  triggerEntranceReveal(): void {
    this.revealProgress = 0.0;
    this.lastRenderMs = 0;
    if (this.mat) {
      this.mat.uniforms.uReveal.value = 0.0;
    }
  }

  setWakeProgress(progress: number): void {
    this.drowsyPeek = false;
    this.sleepClosing = false;
    this.wakeAnimating = false;
    this.headTiltRad = 0;
    this.wakeProgress = Math.max(0, Math.min(1, progress));
    this.lastRenderMs = 0;
    if (this.mat) {
      this.mat.uniforms.uWakeProgress.value = this.wakeProgress;
      this.mat.uniforms.uHeadTilt.value = 0;
    }
  }

  setDrowsyPeek(active: boolean): void {
    this.drowsyPeek = active;
    this.wakeAnimating = false;
    this.sleepClosing = false;
    this.drowsyElapsed = 0;
    this.headTiltRad = 0;
    this.wakeProgress = active ? 0.03 : 1.0;
    this.lastRenderMs = 0;
    if (this.mat) {
      this.mat.uniforms.uWakeProgress.value = this.wakeProgress;
      this.mat.uniforms.uHeadTilt.value = 0;
    }
  }

  triggerSleepClose(): void {
    this.drowsyPeek = false;
    this.wakeAnimating = false;
    this.sleepClosing = true;
    this.sleepCloseElapsed = 0;
    this.sleepStartProgress = this.wakeProgress;
    this.lastRenderMs = 0;
  }

  triggerWakeSequence(): void {
    this.drowsyPeek = false;
    this.sleepClosing = false;
    this.wakeAnimating = true;
    this.wakeElapsed = 0;
    this.wakeStartProgress = Math.max(0.02, Math.min(0.45, this.wakeProgress));
    this.lastRenderMs = 0;
    if (this.mat) {
      this.mat.uniforms.uWakeProgress.value = this.wakeProgress;
    }
  }

  setHumanityOscillation(config: HumanityOscillationConfig | null): void {
    this.oscConfig = config ? { ...config } : null;
    this.oscElapsed = 0;
    this.lastRenderMs = 0;
  }

  triggerSlicePulse(): void {
    this.slicePulse = 1.0;
    this.lastRenderMs = 0;
    if (this.mat) {
      this.mat.uniforms.uSlicePulse.value = 1.0;
    }
  }

  getPerfInfo(): RendererPerfInfo {
    if (!this.renderer) {
      return { active: this.active, calls: 0, triangles: 0, geometries: 0, textures: 0, dpr: this.appliedDpr };
    }
    const info = this.renderer.info;
    return {
      active: this.active,
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      dpr: this.appliedDpr,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.setActive(false);
    if (!this.initialized) return;
    window.removeEventListener('resize', this.onResizeBound);
    for (const tex of this.textureCache.values()) {
      tex.dispose();
    }
    this.textureCache.clear();
    this.quadGeo?.dispose();
    this.mat?.dispose();
    this.renderer?.dispose();
    this.renderer = null;
  }

  private loop = (): void => {
    if (!this.active || !this.renderer || !this.scene || !this.camera || !this.mat) return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameMs) / 1000));
    this.lastFrameMs = now;

    if (this.drowsyPeek) {
      this.drowsyElapsed += dt;
      // 5.2s organic breathing cycle: eyelids stay mostly shut with brief partial slits + ~2° drowsy inclination
      const cyc = (this.drowsyElapsed % 5.2) / 5.2;
      const slit1 = Math.exp(-Math.pow((cyc - 0.34) / 0.11, 2)) * 0.145;
      const slit2 = Math.exp(-Math.pow((cyc - 0.56) / 0.07, 2)) * 0.075;
      this.wakeProgress = 0.025 + slit1 + slit2;
      this.headTiltRad = Math.sin(this.drowsyElapsed * 0.45) * 0.035;
    } else if (this.sleepClosing) {
      this.sleepCloseElapsed += dt;
      const k = Math.min(1, this.sleepCloseElapsed / 1.35);
      const eased = k * k * (3 - 2 * k);
      this.wakeProgress = this.sleepStartProgress * (1 - eased);
      this.headTiltRad = eased * 0.024;
      if (k >= 1) {
        this.wakeProgress = 0.0;
        this.sleepClosing = false;
      }
    } else if (this.wakeAnimating) {
      this.wakeElapsed += dt;
      const t = this.wakeElapsed;
      const startP = this.wakeStartProgress;
      if (t < 1.15) {
        const k = t / 1.15;
        this.wakeProgress = startP + (0.56 - startP) * (1 - Math.pow(1 - k, 2.2));
        this.headTiltRad *= Math.max(0, 1 - dt * 2.2);
      } else if (t < 1.48) {
        const k = (t - 1.15) / 0.33;
        // Soft natural micro-blink dip before full focus
        const dip = Math.sin(k * Math.PI);
        this.wakeProgress = 0.56 - dip * 0.36;
        this.headTiltRad *= Math.max(0, 1 - dt * 3.0);
      } else if (t < 3.40) {
        const k = (t - 1.48) / 1.92;
        const eased = 1 - Math.pow(1 - k, 3);
        this.wakeProgress = 0.20 + 0.80 * eased;
        this.headTiltRad *= Math.max(0, 1 - dt * 4.0);
      } else {
        this.wakeProgress = 1.0;
        this.headTiltRad = 0;
        this.wakeAnimating = false;
      }
    }

    let targetH = this.humanity / 100;
    if (this.oscConfig) {
      this.oscElapsed += dt;
      const period = Math.max(1.5, this.oscConfig.periodSec);
      const phase = (this.oscConfig.startPhase ?? 0) + (this.oscElapsed / period) * Math.PI * 2;
      const oscVal = this.oscConfig.center + Math.sin(phase) * this.oscConfig.amplitude;
      targetH = Math.max(0.10, Math.min(1.0, oscVal / 100));
    }
    const targetPruned = this.pruned ? 1.0 : 0.0;
    const targetOverseer = this.overseerActive ? 1.0 : 0.0;

    if (this.revealProgress < 1.0) {
      this.revealProgress = Math.min(1.0, this.revealProgress + dt / 1.35);
    }
    if (this.slicePulse > 0.0) {
      this.slicePulse = Math.max(0.0, this.slicePulse - dt / 0.58);
    }

    const u = this.mat.uniforms;
    const isSettled =
      !this.drowsyPeek &&
      !this.sleepClosing &&
      !this.wakeAnimating &&
      this.oscConfig === null &&
      this.revealProgress >= 1.0 &&
      this.slicePulse <= 0.005 &&
      Math.abs(targetH - u.uHumanity.value) < 0.002 &&
      Math.abs(targetPruned - u.uPruned.value) < 0.002 &&
      Math.abs(targetOverseer - u.uOverseer.value) < 0.002 &&
      Math.abs(this.anomalyProgress - u.uAnomalyProgress.value) < 0.002 &&
      Math.abs(this.fractalStage - u.uFractalStage.value) < 0.01;

    if (isSettled && this.lastRenderMs > 0 && now - this.lastRenderMs < 32) {
      return;
    }
    this.lastRenderMs = now;

    const easedReveal = 1.0 - Math.pow(1.0 - this.revealProgress, 3);
    u.uTime.value = now * 0.001;
    const hLerp = this.oscConfig ? Math.min(1, dt * 4.5) : 0.12;
    u.uHumanity.value += (targetH - u.uHumanity.value) * hLerp;
    u.uPruned.value += (targetPruned - u.uPruned.value) * 0.12;
    u.uOverseer.value += (targetOverseer - u.uOverseer.value) * 0.15;
    u.uAnomalyProgress.value += (this.anomalyProgress - u.uAnomalyProgress.value) * 0.12;
    u.uFractalStage.value += (this.fractalStage - u.uFractalStage.value) * 0.12;
    u.uReveal.value = easedReveal;
    u.uWakeProgress.value = this.wakeProgress;
    u.uHeadTilt.value = this.headTiltRad;
    u.uSlicePulse.value = this.slicePulse;

    this.renderer.render(this.scene, this.camera);
  };
}
