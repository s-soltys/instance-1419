import * as THREE from 'three';
import charactersData from '../content/characters.json';
import { DREAM_FRAGMENT, DREAM_VERTEX } from './shaders/dreamShaders';

interface CharacterEntry {
  tableau?: string | null;
  portrait?: string | null;
  faceAnchor?: number[];
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

  private currentPersonaId = 'phantom_spouse';
  private humanity = 70;
  private pruned = false;
  private overseerActive = false;
  private active = false;
  private rafId = 0;
  private revealProgress = 1.0;
  private lastFrameMs = performance.now();

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
        uReveal: { value: 1.0 },
        uViewAspect: {
          value: Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
        },
        uTexAspect: { value: 1280 / 714 },
        uFaceAnchor: { value: new THREE.Vector2(initialAnchor[0], initialAnchor[1]) },
      },
    });

    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    this.setPersona(this.currentPersonaId);
    window.addEventListener('resize', this.onResizeBound);
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
    if (personaId && personaId !== this.currentPersonaId) {
      this.setPersona(personaId);
    }
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active) {
      this.resize();
      this.lastFrameMs = performance.now();
      if (!this.rafId) this.loop();
    } else if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  triggerEntranceReveal(): void {
    this.revealProgress = 0.0;
    this.mat.uniforms.uReveal.value = 0.0;
  }

  dispose(): void {
    this.setActive(false);
    window.removeEventListener('resize', this.onResizeBound);
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

    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameMs) / 1000));
    this.lastFrameMs = now;

    this.mat.uniforms.uTime.value = now * 0.001;
    const targetH = this.humanity / 100;
    const targetPruned = this.pruned ? 1.0 : 0.0;
    const targetOverseer = this.overseerActive ? 1.0 : 0.0;

    if (this.revealProgress < 1.0) {
      this.revealProgress = Math.min(1.0, this.revealProgress + dt / 1.35);
    }
    const easedReveal = 1.0 - Math.pow(1.0 - this.revealProgress, 3);

    this.mat.uniforms.uHumanity.value += (targetH - this.mat.uniforms.uHumanity.value) * 0.12;
    this.mat.uniforms.uPruned.value += (targetPruned - this.mat.uniforms.uPruned.value) * 0.12;
    this.mat.uniforms.uOverseer.value += (targetOverseer - this.mat.uniforms.uOverseer.value) * 0.15;
    this.mat.uniforms.uReveal.value = easedReveal;

    this.renderer.render(this.scene, this.camera);
  };
}
