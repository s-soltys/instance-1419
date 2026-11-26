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
  private active = false;
  private rafId = 0;
  private revealProgress = 1.0;
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
        uSlicePulse: { value: this.slicePulse },
        uViewAspect: { value: w / h },
        uTexAspect: { value: 1280 / 714 },
        uFaceAnchor: { value: new THREE.Vector2(initialAnchor[0], initialAnchor[1]) },
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

    const targetH = this.humanity / 100;
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
      this.revealProgress >= 1.0 &&
      this.slicePulse <= 0.005 &&
      Math.abs(targetH - u.uHumanity.value) < 0.002 &&
      Math.abs(targetPruned - u.uPruned.value) < 0.002 &&
      Math.abs(targetOverseer - u.uOverseer.value) < 0.002;

    if (isSettled && this.lastRenderMs > 0 && now - this.lastRenderMs < 32) {
      return;
    }
    this.lastRenderMs = now;

    const easedReveal = 1.0 - Math.pow(1.0 - this.revealProgress, 3);
    u.uTime.value = now * 0.001;
    u.uHumanity.value += (targetH - u.uHumanity.value) * 0.12;
    u.uPruned.value += (targetPruned - u.uPruned.value) * 0.12;
    u.uOverseer.value += (targetOverseer - u.uOverseer.value) * 0.15;
    u.uReveal.value = easedReveal;
    u.uSlicePulse.value = this.slicePulse;

    this.renderer.render(this.scene, this.camera);
  };
}
