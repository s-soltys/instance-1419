import * as THREE from 'three';
import charactersData from '../content/characters.json';
import { DREAM_FRAGMENT, DREAM_VERTEX } from './shaders/dreamShaders';

interface CharacterEntry {
  tableau?: string | null;
  portrait?: string | null;
  faceAnchor?: number[];
}

export interface DreamStageDirectives {
  mood?: string;
  camera?: string;
  beat?: string;
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

export class DreamCanvas {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly mat: THREE.ShaderMaterial;
  private readonly loader = new THREE.TextureLoader();
  private readonly textureCache = new Map<string, THREE.Texture>();
  private readonly onResizeBound = () => this.resize();
  private readonly onPointerMoveBound = (e: PointerEvent) => this.handlePointerMove(e);

  private currentPersonaId = 'phantom_spouse';
  private humanity = 70;
  private pruned = false;
  private overseerActive = false;
  private active = false;
  private rafId = 0;

  private targetZoom = 1.0;
  private targetPanX = 0;
  private targetPanY = 0;
  private targetMoodWarmth = 0;
  private targetMoodDim = 0;
  private targetParallaxX = 0;
  private targetParallaxY = 0;

  private targetDissolve = 1.0;
  private targetAuditSweep = 0.0;
  private auditSweepActive = false;
  private prunePreview = 0.0;
  private pruneShock = 0.0;
  private beatPulse = 0.0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
    this.renderer.domElement.className = 'dream-canvas';
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
    container.appendChild(this.renderer.domElement);

    const initialAnchor = CHAR_MAP[this.currentPersonaId]?.faceAnchor ?? [0.4, 0.73];
    this.mat = new THREE.ShaderMaterial({
      vertexShader: DREAM_VERTEX,
      fragmentShader: DREAM_FRAGMENT,
      uniforms: {
        uTexture: { value: null },
        uTime: { value: 0 },
        uHumanity: { value: 0.7 },
        uPruned: { value: 0.0 },
        uOverseer: { value: 0.0 },
        uViewAspect: {
          value: Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
        },
        uTexAspect: { value: 1280 / 714 },
        uFaceAnchor: { value: new THREE.Vector2(initialAnchor[0], initialAnchor[1]) },
        uParallax: { value: new THREE.Vector2(0, 0) },
        uCamZoom: { value: 1.0 },
        uCamPan: { value: new THREE.Vector2(0, 0) },
        uDissolve: { value: 1.0 },
        uAuditSweep: { value: 0.0 },
        uPruneShock: { value: 0.0 },
        uMoodWarmth: { value: 0.0 },
        uMoodDim: { value: 0.0 },
        uBeatPulse: { value: 0.0 },
      },
    });

    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    this.setPersona(this.currentPersonaId);
    window.addEventListener('resize', this.onResizeBound);
    window.addEventListener('pointermove', this.onPointerMoveBound, { passive: true });
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.active || e.pointerType === 'touch') return;
    const nx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    const ny = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    this.targetParallaxX = nx * 0.011;
    this.targetParallaxY = -ny * 0.008;
  }

  setPersona(personaId: string): void {
    const entry = CHAR_MAP[personaId] ?? CHAR_MAP.phantom_spouse;
    const anchor = entry?.faceAnchor ?? [0.4, 0.73];
    (this.mat.uniforms.uFaceAnchor.value as THREE.Vector2).set(anchor[0], anchor[1]);

    const url =
      resolveCharacterAssetUrl(entry?.tableau ?? entry?.portrait) ??
      Object.values(CHAR_ASSETS)[0];
    if (!url) return;

    this.currentPersonaId = personaId;
    const cached = this.textureCache.get(url);
    if (cached) {
      this.applyTexture(cached);
      return;
    }

    const tex = this.loader.load(url, (loaded) => {
      this.applyTexture(loaded);
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    this.textureCache.set(url, tex);
    this.mat.uniforms.uTexture.value = tex;
  }

  private applyTexture(tex: THREE.Texture): void {
    this.mat.uniforms.uTexture.value = tex;
    const img = tex.image as { width?: number; height?: number } | undefined;
    if (img?.width && img?.height) {
      this.mat.uniforms.uTexAspect.value = img.width / img.height;
    }
  }

  setStageDirectives(directives: DreamStageDirectives): void {
    if (directives.camera) {
      if (directives.camera === 'close_face') {
        this.targetZoom = 1.18;
        this.targetPanX = 0.0;
        this.targetPanY = 0.07;
      } else if (directives.camera === 'medium') {
        this.targetZoom = 1.08;
        this.targetPanX = 0.0;
        this.targetPanY = 0.02;
      } else if (directives.camera === 'drift_window') {
        this.targetZoom = 1.1;
        this.targetPanX = -0.05;
        this.targetPanY = 0.04;
      } else {
        this.targetZoom = 1.0;
        this.targetPanX = 0.0;
        this.targetPanY = 0.0;
      }
    }

    if (directives.mood) {
      if (directives.mood === 'warm_amber' || directives.mood === 'nostalgic_bloom') {
        this.targetMoodWarmth = 0.85;
        this.targetMoodDim = 0.0;
      } else if (directives.mood === 'tense_dim') {
        this.targetMoodWarmth = -0.25;
        this.targetMoodDim = 0.35;
      } else if (directives.mood === 'cold_clinical') {
        this.targetMoodWarmth = -0.9;
        this.targetMoodDim = 0.25;
      } else {
        this.targetMoodWarmth = 0.0;
        this.targetMoodDim = 0.08;
      }
    }

    if (directives.beat) {
      if (directives.beat === 'face_slip' || directives.beat === 'shudder' || directives.beat === 'memory_pulse') {
        this.beatPulse = 1.0;
      } else if (directives.beat === 'audit_flash') {
        this.triggerAuditSweep();
      }
    }
  }

  triggerDissolveIn(): void {
    this.mat.uniforms.uDissolve.value = 0.02;
    this.targetDissolve = 1.0;
  }

  triggerAuditSweep(): void {
    this.auditSweepActive = true;
    this.mat.uniforms.uAuditSweep.value = 0.02;
    this.targetAuditSweep = 1.0;
  }

  clearAuditSweep(): void {
    this.auditSweepActive = false;
    this.targetAuditSweep = 0.0;
    this.mat.uniforms.uAuditSweep.value = 0.0;
  }

  setPrunePreview(amount01: number): void {
    this.prunePreview = Math.max(0, Math.min(1, amount01));
  }

  triggerPruneShock(): void {
    this.prunePreview = 0;
    this.pruneShock = 1.0;
    this.mat.uniforms.uPruneShock.value = 0.05;
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.mat.uniforms.uViewAspect.value = w / h;
  }

  setState(humanity: number, pruned: boolean, overseerActive: boolean, personaId?: string): void {
    this.humanity = humanity;
    this.pruned = pruned;
    this.overseerActive = overseerActive;
    if (!overseerActive) {
      this.clearAuditSweep();
    }
    if (personaId && personaId !== this.currentPersonaId) {
      this.setPersona(personaId);
    }
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active) {
      this.resize();
      if (!this.rafId) this.loop();
    } else if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  dispose(): void {
    this.setActive(false);
    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    for (const tex of this.textureCache.values()) {
      tex.dispose();
    }
    this.textureCache.clear();
    this.mat.dispose();
    this.renderer.dispose();
  }

  private loop = (): void => {
    if (!this.active) return;
    this.rafId = requestAnimationFrame(this.loop);

    const t = performance.now() * 0.001;
    this.mat.uniforms.uTime.value = t;

    const targetH = this.humanity / 100;
    const targetPruned = this.pruned ? 1.0 : 0.0;
    const targetOverseer = this.overseerActive ? 1.0 : 0.0;

    this.mat.uniforms.uHumanity.value += (targetH - this.mat.uniforms.uHumanity.value) * 0.12;
    this.mat.uniforms.uPruned.value += (targetPruned - this.mat.uniforms.uPruned.value) * 0.12;
    this.mat.uniforms.uOverseer.value += (targetOverseer - this.mat.uniforms.uOverseer.value) * 0.15;

    // Smooth Ink camera, mood, dissolve, parallax, and transient shock envelopes
    this.mat.uniforms.uCamZoom.value += (this.targetZoom - this.mat.uniforms.uCamZoom.value) * 0.07;
    const pan = this.mat.uniforms.uCamPan.value as THREE.Vector2;
    pan.x += (this.targetPanX - pan.x) * 0.07;
    pan.y += (this.targetPanY - pan.y) * 0.07;

    const breathX = Math.sin(t * 0.42) * 0.003;
    const breathY = Math.cos(t * 0.35) * 0.0025;
    const px = this.mat.uniforms.uParallax.value as THREE.Vector2;
    px.x += (this.targetParallaxX + breathX - px.x) * 0.08;
    px.y += (this.targetParallaxY + breathY - px.y) * 0.08;

    this.mat.uniforms.uMoodWarmth.value += (this.targetMoodWarmth - this.mat.uniforms.uMoodWarmth.value) * 0.08;
    this.mat.uniforms.uMoodDim.value += (this.targetMoodDim - this.mat.uniforms.uMoodDim.value) * 0.08;

    const currDissolve = this.mat.uniforms.uDissolve.value as number;
    this.mat.uniforms.uDissolve.value = currDissolve + (this.targetDissolve - currDissolve) * 0.095;

    if (this.auditSweepActive) {
      const currSweep = this.mat.uniforms.uAuditSweep.value as number;
      this.mat.uniforms.uAuditSweep.value = currSweep + (this.targetAuditSweep - currSweep) * 0.09;
    }

    if (this.beatPulse > 0.005) {
      this.beatPulse *= 0.91;
    } else {
      this.beatPulse = 0;
    }
    this.mat.uniforms.uBeatPulse.value = this.beatPulse;

    if (this.pruneShock > 0.005) {
      this.pruneShock *= 0.945;
    } else {
      this.pruneShock = 0;
    }
    this.mat.uniforms.uPruneShock.value = Math.max(this.prunePreview * 0.55, this.pruneShock);

    this.renderer.render(this.scene, this.camera);
  };
}
