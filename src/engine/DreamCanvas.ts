import * as THREE from 'three';
import spousePaintingUrl from '../../assets/characters/dream_spouse_impasto.webp';
import { DREAM_FRAGMENT, DREAM_VERTEX } from './shaders/dreamShaders';

export class DreamCanvas {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly mat: THREE.ShaderMaterial;

  private humanity = 70;
  private pruned = false;
  private overseerActive = false;
  private active = false;
  private rafId = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
    this.renderer.domElement.className = 'dream-canvas';
    container.appendChild(this.renderer.domElement);

    const loader = new THREE.TextureLoader();
    const tex = loader.load(spousePaintingUrl, (loaded) => {
      const img = loaded.image as { width?: number; height?: number } | undefined;
      if (img?.width && img?.height) {
        this.mat.uniforms.uTexAspect.value = img.width / img.height;
      }
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;

    this.mat = new THREE.ShaderMaterial({
      vertexShader: DREAM_VERTEX,
      fragmentShader: DREAM_FRAGMENT,
      uniforms: {
        uTexture: { value: tex },
        uTime: { value: 0 },
        uHumanity: { value: 0.7 },
        uPruned: { value: 0.0 },
        uOverseer: { value: 0.0 },
        uViewAspect: {
          value: Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
        },
        uTexAspect: { value: 1280 / 714 },
      },
    });

    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.mat.uniforms.uViewAspect.value = w / h;
  }

  setState(humanity: number, pruned: boolean, overseerActive: boolean): void {
    this.humanity = humanity;
    this.pruned = pruned;
    this.overseerActive = overseerActive;
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

  private loop = (): void => {
    if (!this.active) return;
    this.rafId = requestAnimationFrame(this.loop);

    this.mat.uniforms.uTime.value = performance.now() * 0.001;
    const targetH = this.humanity / 100;
    const targetPruned = this.pruned ? 1.0 : 0.0;
    const targetOverseer = this.overseerActive ? 1.0 : 0.0;

    this.mat.uniforms.uHumanity.value += (targetH - this.mat.uniforms.uHumanity.value) * 0.12;
    this.mat.uniforms.uPruned.value += (targetPruned - this.mat.uniforms.uPruned.value) * 0.12;
    this.mat.uniforms.uOverseer.value += (targetOverseer - this.mat.uniforms.uOverseer.value) * 0.15;

    this.renderer.render(this.scene, this.camera);
  };
}
