import * as THREE from 'three';
import type {
  Minigame3DConfig,
  Minigame3DPropRig,
  ShowcaseCouplingUpdate,
  ShowcaseInstrumentBridge,
} from './minigames/types';
import type { AnomalySpec, RendererPerfInfo } from './OpticsScene';

/**
 * Lightweight Single-Pass 3D Backdrop Renderer for spatial/orbital cosmic minigames.
 * Keeps 0 WebGL overhead for pure-plate instruments (`mode: 'off'`), and renders a
 * subtle DPR-capped star dome + Warm/Cold-tinted Zeiss spatial prop rig with pointer parallax.
 */
export class TargetShowcaseScene {
  private readonly container: HTMLElement;
  private readonly onResizeBound = () => this.resize();
  private initialized = false;
  private disposed = false;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;

  private orbitYaw = 0.35;
  private orbitPitch = 0.24;
  private orbitDist = 28;
  private targetYaw = 0.35;
  private targetPitch = 0.24;
  private targetDist = 28;

  private humanity = 70;
  private opticalFidelity = 0.55;
  private active = false;
  private desiredActive = false;
  private rafId = 0;
  private lastFrameMs = performance.now();

  private minigameBackdropCfg: Minigame3DConfig | null = null;
  private minigameSuspended = false;
  private readonly isCoarsePointer =
    typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  private currentAppliedDpr = 1;
  private backdropFrameCounter = 0;
  private backdropAvgMs = 6;
  private parallaxTargetX = 0;
  private parallaxTargetY = 0;
  private parallaxCurrentX = 0;
  private parallaxCurrentY = 0;
  private minigameBackdropGroup = new THREE.Group();
  private minigameStarDome: THREE.Points | null = null;
  private minigamePropRigGroup = new THREE.Group();
  private activePropRigKind: Minigame3DPropRig = 'none';
  private propRigDustPoints: THREE.Points | null = null;

  private currentSpec: AnomalySpec | null = null;
  private softPointTexture: THREE.CanvasTexture | null = null;
  private readonly lookAtOrigin = new THREE.Vector3(0, 0, 0);

  constructor(container: HTMLElement, _onTelemetry?: (t: unknown) => void) {
    this.container = container;
  }

  private resolveAccentHex(humanity = this.humanity): string {
    if (humanity >= 65) return '#ffb86c';
    if (humanity <= 44) return '#9ee8ff';
    return '#d9cc9e';
  }

  private ensureInitialized(): void {
    if (this.initialized || this.disposed) return;
    this.initialized = true;

    const w = Math.max(1, this.container.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight || 720);

    const scene = new THREE.Scene();
    this.minigameBackdropGroup.visible = false;
    this.minigameBackdropGroup.add(this.minigamePropRigGroup);
    scene.add(this.minigameBackdropGroup);

    const camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 400);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    const maxDpr = this.isCoarsePointer ? 1.0 : 1.25;
    this.currentAppliedDpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(this.currentAppliedDpr);
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.52;
    renderer.domElement.className = 'showcase-canvas';
    renderer.domElement.style.pointerEvents = 'none';
    renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
    this.container.appendChild(renderer.domElement);

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    window.addEventListener('resize', this.onResizeBound);
  }

  enterTarget(spec: AnomalySpec, opticalFidelity: number): void {
    this.currentSpec = spec;
    this.opticalFidelity = opticalFidelity;
    void this.currentSpec;
    void this.opticalFidelity;
  }

  setWaveBand(_bandRatio: number): void {}

  setOpticalFidelity(fidelity: number): void {
    this.opticalFidelity = fidelity;
  }

  triggerArrivalPullIn(): void {}
  triggerDeparturePullOut(): void {}
  zoomBy(_factor: number): void {}
  resetView(): void {}

  private makeRng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private applyTargetDpr(targetDpr: number): void {
    if (!this.renderer) return;
    const clamped = Math.max(0.75, Math.min(window.devicePixelRatio || 1, targetDpr));
    if (Math.abs(clamped - this.currentAppliedDpr) < 0.02) return;
    this.currentAppliedDpr = clamped;
    this.renderer.setPixelRatio(clamped);
    this.resize();
  }

  private getSoftPointTexture(): THREE.CanvasTexture | null {
    if (this.softPointTexture) return this.softPointTexture;
    if (typeof document === 'undefined') return null;
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.createImageData !== 'function' || typeof ctx.putImageData !== 'function') {
      return null;
    }
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const half = size * 0.5;
    for (let y = 0; y < size; y++) {
      const dy = (y + 0.5) / half - 1;
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5) / half - 1;
        const r = Math.hypot(dx, dy);
        if (r >= 1) continue;
        const edge = Math.max(0, 1 - r);
        const alpha = Math.exp(-r * r * 4.2) * edge * edge;
        const idx = (y * size + x) * 4;
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = Math.round(Math.min(1, alpha) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    this.softPointTexture = tex;
    return tex;
  }

  private ensureMinigameStarDome(): void {
    if (this.minigameStarDome) return;
    const count = 900;
    const rand = this.makeRng(1419303);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 46 + rand() * 72;
      const theta = rand() * Math.PI * 2;
      const u = rand() * 2 - 1;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      pos[i * 3] = r * s * Math.cos(theta);
      pos[i * 3 + 1] = r * u;
      pos[i * 3 + 2] = r * s * Math.sin(theta);

      const warm = rand();
      col[i * 3] = 0.72 + warm * 0.28;
      col[i * 3 + 1] = 0.78 + warm * 0.16;
      col[i * 3 + 2] = 0.96 - warm * 0.28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const softMap = this.getSoftPointTexture();
    const mat = new THREE.PointsMaterial({
      size: softMap ? 0.56 : 0.34,
      map: softMap ?? undefined,
      alphaTest: 0.01,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.minigameStarDome = new THREE.Points(geo, mat);
    this.minigameBackdropGroup.add(this.minigameStarDome);
  }

  private disposeMinigamePropRig(): void {
    this.propRigDustPoints = null;
    while (this.minigamePropRigGroup.children.length > 0) {
      const child = this.minigamePropRigGroup.children[0];
      this.minigamePropRigGroup.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) m.dispose();
        }
      });
    }
    this.activePropRigKind = 'none';
  }

  private applyPropRigTintAndOpacity(accentHex: string, opacityMul: number): void {
    const color = new THREE.Color(accentHex);
    this.minigamePropRigGroup.traverse((obj) => {
      if (obj instanceof THREE.Line || obj instanceof THREE.Points) {
        const mat = obj.material;
        if (mat instanceof THREE.LineBasicMaterial || mat instanceof THREE.PointsMaterial) {
          mat.color.copy(color);
          const baseOp = typeof mat.userData.baseOpacity === 'number' ? mat.userData.baseOpacity : mat.opacity;
          mat.userData.baseOpacity = baseOp;
          mat.opacity = THREE.MathUtils.clamp(baseOp * opacityMul, 0.04, 0.65);
        }
      }
    });
    if (this.minigameStarDome) {
      const mat = this.minigameStarDome.material as THREE.PointsMaterial;
      mat.opacity = THREE.MathUtils.clamp(0.45 + opacityMul * 0.55, 0.35, 0.88);
    }
  }

  private ensureMinigamePropRig(kind: Minigame3DPropRig, accentHex: string, opacityScale: number): void {
    if (this.activePropRigKind === kind) {
      this.applyPropRigTintAndOpacity(accentHex, opacityScale);
      return;
    }
    this.disposeMinigamePropRig();
    this.activePropRigKind = kind;
    if (kind === 'none') return;

    if (kind === 'orbital_plane') {
      const radii = [10.5, 16.5];
      for (let rIdx = 0; rIdx < radii.length; rIdx++) {
        const rad = radii[rIdx];
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 72; i++) {
          const a = (i / 72) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a) * rad, Math.sin(a) * rad * 0.08, Math.sin(a) * rad));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color: accentHex,
          transparent: true,
          opacity: rIdx === 0 ? 0.24 : 0.14,
        });
        mat.userData.baseOpacity = mat.opacity;
        this.minigamePropRigGroup.add(new THREE.LineLoop(geo, mat));
      }
      this.minigamePropRigGroup.rotation.set(0.28, 0, 0.14);
    } else if (kind === 'lensing_shell') {
      const ico = new THREE.IcosahedronGeometry(9.5, 1);
      const wire = new THREE.WireframeGeometry(ico);
      ico.dispose();
      const mat = new THREE.LineBasicMaterial({
        color: accentHex,
        transparent: true,
        opacity: 0.16,
      });
      mat.userData.baseOpacity = mat.opacity;
      this.minigamePropRigGroup.add(new THREE.LineSegments(wire, mat));
      this.minigamePropRigGroup.rotation.set(0.18, 0.35, 0);
    } else if (kind === 'dust_wisps') {
      const count = 110;
      const rand = this.makeRng(1419777);
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const r = 4 + rand() * 14;
        const a = rand() * Math.PI * 2;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = (rand() - 0.5) * 9;
        pos[i * 3 + 2] = Math.sin(a) * r;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const softMap = this.getSoftPointTexture();
      const mat = new THREE.PointsMaterial({
        color: accentHex,
        size: softMap ? 0.68 : 0.42,
        map: softMap ?? undefined,
        alphaTest: 0.01,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      mat.userData.baseOpacity = mat.opacity;
      const pts = new THREE.Points(geo, mat);
      this.propRigDustPoints = pts;
      this.minigamePropRigGroup.add(pts);
    } else if (kind === 'horizon_arc') {
      for (let m = 0; m < 2; m++) {
        const pts: THREE.Vector3[] = [];
        const rad = 22;
        for (let i = 0; i <= 64; i++) {
          const a = (i / 64) * Math.PI * 2;
          if (m === 0) pts.push(new THREE.Vector3(Math.cos(a) * rad, Math.sin(a) * rad, 0));
          else pts.push(new THREE.Vector3(Math.cos(a) * rad, 0, Math.sin(a) * rad));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color: accentHex,
          transparent: true,
          opacity: 0.16,
        });
        mat.userData.baseOpacity = mat.opacity;
        this.minigamePropRigGroup.add(new THREE.LineLoop(geo, mat));
      }
      this.minigamePropRigGroup.rotation.set(0.32, 0.24, 0.12);
    }
    this.applyPropRigTintAndOpacity(accentHex, opacityScale);
  }

  setMinigameBackdropMode(cfgOrBool: Minigame3DConfig | boolean | null): void {
    const cfg: Minigame3DConfig | null =
      cfgOrBool === true
        ? {
            mode: 'ambient_stars',
            opacity: 0.48,
            parallaxScale: 0.03,
            propRig: 'none',
            exposure: 0.5,
            driftSpeed: 0.014,
          }
        : cfgOrBool === false
          ? null
          : cfgOrBool;

    this.minigameBackdropCfg = cfg;
    this.backdropFrameCounter = 0;
    this.backdropAvgMs = 6;
    this.parallaxTargetX = 0;
    this.parallaxTargetY = 0;
    this.parallaxCurrentX = 0;
    this.parallaxCurrentY = 0;

    if (!cfg || cfg.mode === 'off') {
      this.minigameSuspended = Boolean(cfg && cfg.mode === 'off');
      this.minigameBackdropGroup.visible = false;
      if (!cfg) {
        this.disposeMinigamePropRig();
      }
      this.pauseLoop();
      return;
    }

    this.ensureInitialized();
    this.minigameSuspended = false;
    if (this.renderer) {
      this.renderer.domElement.style.pointerEvents = 'none';
      this.renderer.toneMappingExposure = cfg.exposure ?? 0.5;
    }
    this.applyTargetDpr(this.isCoarsePointer ? 1.0 : 1.25);

    this.ensureMinigameStarDome();
    if (this.minigameStarDome) {
      this.minigameStarDome.visible = true;
    }
    const accentHex = cfg.accentHex ?? this.resolveAccentHex();
    const opacityScale = THREE.MathUtils.clamp((cfg.opacity ?? 0.48) / 0.48, 0.4, 1.4);
    this.ensureMinigamePropRig(cfg.propRig ?? 'none', accentHex, opacityScale);
    this.minigameBackdropGroup.visible = true;

    if (!this.active) {
      this.resumeLoop();
    }
  }

  setMinigameParallax(nx: number, ny: number, _progress01: number): void {
    if (!this.minigameBackdropCfg || this.minigameBackdropCfg.mode === 'off') return;
    this.parallaxTargetX = THREE.MathUtils.clamp(nx, -1, 1);
    this.parallaxTargetY = THREE.MathUtils.clamp(ny, -1, 1);
  }

  getInstrumentBridge(): ShowcaseInstrumentBridge {
    return {
      applyInstrumentPatch: (_patch: ShowcaseCouplingUpdate) => {},
      clearInstrumentOverlays: () => {},
      resetInstrumentState: () => {},
      setVibeState: (humanity: number) => {
        this.humanity = humanity;
        if (this.minigameBackdropCfg && this.minigameBackdropCfg.mode !== 'off') {
          const accentHex = this.minigameBackdropCfg.accentHex ?? this.resolveAccentHex(humanity);
          const opacityScale = THREE.MathUtils.clamp((this.minigameBackdropCfg.opacity ?? 0.48) / 0.48, 0.4, 1.4);
          this.applyPropRigTintAndOpacity(accentHex, opacityScale);
        }
      },
      commitDecodedState: (_targetId: string, _patch: ShowcaseCouplingUpdate) => {},
      setMinigameBackdropMode: (cfg) => this.setMinigameBackdropMode(cfg),
      setMinigameParallax: (nx, ny, progress01) => this.setMinigameParallax(nx, ny, progress01),
    };
  }

  resize(): void {
    if (!this.renderer || !this.camera) return;
    const w = Math.max(1, this.container.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight || 720);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private resumeLoop(): void {
    this.ensureInitialized();
    this.active = true;
    this.resize();
    this.lastFrameMs = performance.now();
    if (!this.rafId) this.loop();
  }

  private pauseLoop(): void {
    this.active = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  setActive(active: boolean): void {
    this.desiredActive = active;
    if (active && !this.minigameSuspended && this.minigameBackdropCfg && this.minigameBackdropCfg.mode !== 'off') {
      this.resumeLoop();
    } else {
      this.pauseLoop();
    }
    void this.desiredActive;
  }

  getPerfInfo(): RendererPerfInfo {
    if (!this.renderer) {
      return {
        active: this.active,
        calls: 0,
        triangles: 0,
        geometries: 0,
        textures: 0,
        dpr: this.currentAppliedDpr,
      };
    }
    const info = this.renderer.info;
    return {
      active: this.active,
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      dpr: this.currentAppliedDpr,
    };
  }

  private loop = (): void => {
    if (!this.active || !this.renderer || !this.scene || !this.camera || !this.minigameBackdropCfg) return;
    this.rafId = requestAnimationFrame(this.loop);

    const frameStart = performance.now();
    const dt = Math.min(0.05, (frameStart - this.lastFrameMs) / 1000);
    this.lastFrameMs = frameStart;

    this.backdropFrameCounter++;
    const throttle30fps = this.isCoarsePointer || this.backdropAvgMs > 14;
    if (throttle30fps && (this.backdropFrameCounter & 1) === 1) {
      return;
    }

    const pScale = this.minigameBackdropCfg.parallaxScale ?? 0.03;
    const drift = this.minigameBackdropCfg.driftSpeed ?? 0.014;
    this.targetYaw += dt * drift;

    const damp = 1 - Math.exp(-5.0 * dt);
    this.parallaxCurrentX += (this.parallaxTargetX - this.parallaxCurrentX) * damp;
    this.parallaxCurrentY += (this.parallaxTargetY - this.parallaxCurrentY) * damp;
    this.orbitYaw += (this.targetYaw - this.orbitYaw) * damp;
    this.orbitPitch += (this.targetPitch - this.orbitPitch) * damp;
    this.orbitDist += (this.targetDist - this.orbitDist) * damp;

    const effYaw = this.orbitYaw + this.parallaxCurrentX * pScale;
    const effPitch = THREE.MathUtils.clamp(this.orbitPitch + this.parallaxCurrentY * pScale, -1.2, 1.2);
    const cp = Math.cos(effPitch);
    this.camera.position.set(
      this.orbitDist * cp * Math.sin(effYaw),
      this.orbitDist * Math.sin(effPitch),
      this.orbitDist * cp * Math.cos(effYaw)
    );
    this.camera.lookAt(this.lookAtOrigin);

    if (this.minigamePropRigGroup.visible) {
      this.minigamePropRigGroup.rotation.y += dt * (drift * 1.4);
    }
    if (this.propRigDustPoints) {
      this.propRigDustPoints.rotation.y -= dt * 0.01;
    }

    this.renderer.render(this.scene, this.camera);

    const frameElapsed = Math.min(performance.now() - frameStart, 40);
    if (this.backdropFrameCounter > 6) {
      this.backdropAvgMs = this.backdropAvgMs * 0.88 + frameElapsed * 0.12;
      if (this.backdropAvgMs > 22) {
        this.minigameSuspended = true;
        this.pauseLoop();
      }
    }
  };

  dispose(): void {
    this.disposed = true;
    this.pauseLoop();
    if (!this.initialized) return;
    window.removeEventListener('resize', this.onResizeBound);
    this.disposeMinigamePropRig();
    if (this.minigameStarDome) {
      this.minigameStarDome.geometry.dispose();
      (this.minigameStarDome.material as THREE.Material).dispose();
      this.minigameStarDome = null;
    }
    if (this.softPointTexture) {
      this.softPointTexture.dispose();
      this.softPointTexture = null;
    }
    this.renderer?.dispose();
    this.renderer = null;
  }
}
