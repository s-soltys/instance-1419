import * as THREE from 'three';
import jwstSmacsUrl from '../../assets/astro/jwst_smacs0723.webp';
import hubbleUdfUrl from '../../assets/astro/hubble_udf.webp';
import jwstCarinaUrl from '../../assets/astro/jwst_carina_nebula.webp';
import anomaliesData from '../content/anomalies.json';
import {
  ANOMALY_FRAGMENT,
  ANOMALY_VERTEX,
  SKY_BAKE_FRAGMENT,
  SKY_BAKE_VERTEX,
  SKY_FRAGMENT,
  SKY_VERTEX,
  STAR_FRAGMENT,
  STAR_VERTEX,
} from './shaders/opticsShaders';

export type ShowcaseType = 'star_system' | 'nebula' | 'grav_lens' | 'deep_field' | 'antipodal_poles';

export interface AnomalySpec {
  id: string;
  label: string;
  subtitle: string;
  bandName: string;
  showcaseType: ShowcaseType;
  minigameId: string;
  raDeg: number;
  decDeg: number;
  optimalWavelengthNm: number;
  wavelengthToleranceNm: number;
  recommendedFovMax: number;
  anomalyGain: number;
  kind: 'einstein_ring' | 'horizon_lattice' | 'home_reference' | 'nebula_cloud';
  accentHex: string;
  description: string;
}

export interface ProjectedMarker {
  id: string;
  label: string;
  bandName: string;
  wavelengthNm: number;
  x: number;
  y: number;
  inView: boolean;
  edgeAngleRad: number;
}

export type WideZoomStage = 'WIDE SKY' | 'SECTOR' | 'DEEP FIELD' | 'LOCK RANGE';

export interface OpticsTelemetry {
  raDeg: number;
  decDeg: number;
  fovDeg: number;
  zoomX: number;
  zoomNorm: number;
  zoomStage: WideZoomStage;
  focusedAnomaly: AnomalySpec | null;
  alignmentScore: number;
  wavelengthMatch: number;
  lockProgress: number;
  markers: ProjectedMarker[];
}

export interface RendererPerfInfo {
  active: boolean;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  dpr: number;
}

function raDecToVec3(raDeg: number, decDeg: number, radius: number, out = new THREE.Vector3()): THREE.Vector3 {
  const ra = THREE.MathUtils.degToRad(raDeg);
  const dec = THREE.MathUtils.degToRad(decDeg);
  return out.set(
    radius * Math.cos(dec) * Math.sin(ra),
    radius * Math.sin(dec),
    -radius * Math.cos(dec) * Math.cos(ra)
  );
}

const BB_COOL = new THREE.Color('#ffaa66');
const BB_MID = new THREE.Color('#fff5e4');
const BB_HOT = new THREE.Color('#9ec5ff');

function writeBlackbodyColor(tempNorm: number, out: THREE.Color): THREE.Color {
  if (tempNorm < 0.5) {
    return out.lerpColors(BB_COOL, BB_MID, tempNorm * 2.0);
  }
  return out.lerpColors(BB_MID, BB_HOT, (tempNorm - 0.5) * 2.0);
}

export class OpticsScene {
  private readonly container: HTMLElement;
  private readonly anomalySpecs: AnomalySpec[];
  private readonly anomalyDirs: Map<string, THREE.Vector3> = new Map();
  private readonly anomalyPositions: Map<string, THREE.Vector3> = new Map();
  private readonly projectedMarkers: ProjectedMarker[];
  private readonly onResizeBound = () => this.resize();
  private readonly isCoarsePointer =
    typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);

  // Lazy-initialized WebGL objects
  private initialized = false;
  private disposed = false;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private skyMat: THREE.ShaderMaterial | null = null;
  private starMat: THREE.ShaderMaterial | null = null;
  private skyNoiseRT: THREE.WebGLRenderTarget | null = null;
  private readonly anomalyMats: Map<string, THREE.ShaderMaterial> = new Map();
  private readonly disposableGeos: THREE.BufferGeometry[] = [];
  private readonly disposableMats: THREE.Material[] = [];
  private readonly disposableTexs: THREE.Texture[] = [];

  // Reusable per-frame math scratch objects
  private readonly _lookTarget = new THREE.Vector3();
  private readonly _camForward = new THREE.Vector3();
  private readonly _worldPos = new THREE.Vector3();

  private viewW = 1280;
  private viewH = 720;
  private appliedDpr = 1;

  private yawDeg = 12;
  private pitchDeg = 0;
  private targetYawDeg = 12;
  private targetPitchDeg = 0;
  private fovDeg = 54;
  private targetFovDeg = 54;

  private wavelengthNm = 560;
  private opticalFidelity = 0.55;
  private anomalyProgress = 0;
  private lockProgress = 0;
  private lastLockedId = '';
  private preDiveFovDeg = 54;
  private transitionBoostUntil = 0;

  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pinchStartDist = 0;
  private pinchStartFov = 54;
  private activePointers = new Map<number, { x: number; y: number }>();

  private rafId = 0;
  private lastFrameTime = performance.now();
  private active = false;

  private readonly onTelemetry: (t: OpticsTelemetry) => void;
  private readonly onScanComplete: (spec: AnomalySpec) => void;

  constructor(
    container: HTMLElement,
    onTelemetry: (t: OpticsTelemetry) => void,
    onScanComplete: (spec: AnomalySpec) => void
  ) {
    this.container = container;
    this.onTelemetry = onTelemetry;
    this.onScanComplete = onScanComplete;
    this.anomalySpecs = anomaliesData.anomalies as AnomalySpec[];
    this.projectedMarkers = this.anomalySpecs.map((spec) => {
      const pos = raDecToVec3(spec.raDeg, spec.decDeg, 120);
      this.anomalyPositions.set(spec.id, pos);
      this.anomalyDirs.set(spec.id, pos.clone().normalize());
      return {
        id: spec.id,
        label: spec.label,
        bandName: spec.bandName,
        wavelengthNm: spec.optimalWavelengthNm,
        x: 0.5,
        y: 0.5,
        inView: false,
        edgeAngleRad: 0,
      };
    });
  }

  private ensureInitialized(): void {
    if (this.initialized || this.disposed) return;
    this.initialized = true;

    this.viewW = Math.max(1, this.container.clientWidth || window.innerWidth || 1280);
    this.viewH = Math.max(1, this.container.clientHeight || window.innerHeight || 720);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(this.fovDeg, this.viewW / this.viewH, 0.1, 500);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });

    const maxDpr = this.isCoarsePointer ? 1.5 : 2;
    this.appliedDpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(this.appliedDpr);
    renderer.setSize(this.viewW, this.viewH);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.className = 'optics-canvas';
    renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
    this.container.appendChild(renderer.domElement);

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    // 1. Pre-bake static 3D FBM noise fields into an equirectangular render target once
    const bakeW = this.isCoarsePointer ? 512 : 1024;
    const bakeH = this.isCoarsePointer ? 256 : 512;
    const skyNoiseRT = new THREE.WebGLRenderTarget(bakeW, bakeH, {
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.bakeSkyNoiseTexture(renderer, skyNoiseRT);
    this.skyNoiseRT = skyNoiseRT;

    // 2. Multi-wavelength celestial sphere reading baked noise
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSkyNoiseTex: { value: skyNoiseRT.texture },
        uTime: { value: 0 },
        uWavelengthNorm: { value: (this.wavelengthNm - 200) / 1600 },
        uOpticalFidelity: { value: this.opticalFidelity },
        uAnomalyProgress: { value: this.anomalyProgress },
      },
    });
    const skyGeo = new THREE.SphereGeometry(220, 48, 32);
    this.disposableGeos.push(skyGeo);
    this.disposableMats.push(skyMat);
    this.skyMat = skyMat;
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // 3. 18,000 multi-spectral stars across 4 physical bands
    this.starMat = this.buildStarfield(18000, scene);

    // 4. NASA/STScI JWST & Hubble deep-sky & nebula plates
    this.buildAnomalyPlates(scene);

    this.bindEvents();
    this.applyCameraOrientation();
  }

  private bakeSkyNoiseTexture(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void {
    const bakeScene = new THREE.Scene();
    const bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const bakeGeo = new THREE.PlaneGeometry(2, 2);
    const bakeMat = new THREE.ShaderMaterial({
      vertexShader: SKY_BAKE_VERTEX,
      fragmentShader: SKY_BAKE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(bakeGeo, bakeMat);
    bakeScene.add(quad);

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(target);
    renderer.render(bakeScene, bakeCam);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;

    bakeGeo.dispose();
    bakeMat.dispose();
  }

  private buildStarfield(count: number, scene: THREE.Scene): THREE.ShaderMaterial {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const bands = new Float32Array(count);

    const galAxis = new THREE.Vector3(0.28, 0.91, -0.30).normalize();
    const upAxis = new THREE.Vector3(0, 1, 0);
    const galQuat = new THREE.Quaternion().setFromUnitVectors(upAxis, galAxis);

    const scratchVec = new THREE.Vector3();
    const scratchColor = new THREE.Color();
    const uvColA = new THREE.Color('#8ec2ff');
    const uvColB = new THREE.Color('#c79eff');
    const nirColA = new THREE.Color('#ffd399');
    const nirColB = new THREE.Color('#ff9d5c');
    const mirColA = new THREE.Color('#ff8458');
    const mirColB = new THREE.Color('#ffb870');

    let seed = 141941802;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      const bandRoll = rand();
      let band = 1;
      if (bandRoll < 0.14) band = 0;
      else if (bandRoll < 0.60) band = 1;
      else if (bandRoll < 0.85) band = 2;
      else band = 3;
      bands[i] = band;

      let u = rand() * 2 - 1;
      const theta = rand() * Math.PI * 2;
      const r = 165 + rand() * 25;
      if (band === 2 || band === 3) {
        u *= 0.48;
      }
      const sqrtOneMinusU2 = Math.sqrt(Math.max(0, 1 - u * u));

      scratchVec.set(
        r * sqrtOneMinusU2 * Math.cos(theta),
        r * u,
        r * sqrtOneMinusU2 * Math.sin(theta)
      );
      if (band === 2 || band === 3) {
        scratchVec.applyQuaternion(galQuat);
      }

      positions[i * 3] = scratchVec.x;
      positions[i * 3 + 1] = scratchVec.y;
      positions[i * 3 + 2] = scratchVec.z;

      if (band === 0) {
        scratchColor.lerpColors(uvColA, uvColB, rand());
      } else if (band === 2) {
        scratchColor.lerpColors(nirColA, nirColB, rand());
      } else if (band === 3) {
        scratchColor.lerpColors(mirColA, mirColB, rand());
      } else {
        writeBlackbodyColor(Math.pow(rand(), 1.15), scratchColor);
      }
      colors[i * 3] = scratchColor.r;
      colors[i * 3 + 1] = scratchColor.g;
      colors[i * 3 + 2] = scratchColor.b;

      const mag = Math.pow(rand(), 6.8);
      sizes[i] = (band === 0 || band === 3 ? 1.8 : 1.3) + mag * 19.0;
      phases[i] = rand();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aBand', new THREE.BufferAttribute(bands, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uFovScale: { value: 0.2 },
        uPixelRatio: { value: this.appliedDpr },
        uWavelengthNorm: { value: (this.wavelengthNm - 200) / 1600 },
      },
    });

    this.disposableGeos.push(geo);
    this.disposableMats.push(mat);
    scene.add(new THREE.Points(geo, mat));
    return mat;
  }

  private buildAnomalyPlates(scene: THREE.Scene): void {
    const loader = new THREE.TextureLoader();
    const smacsTex = loader.load(jwstSmacsUrl);
    smacsTex.colorSpace = THREE.SRGBColorSpace;
    const hubbleTex = loader.load(hubbleUdfUrl);
    hubbleTex.colorSpace = THREE.SRGBColorSpace;
    const carinaTex = loader.load(jwstCarinaUrl);
    carinaTex.colorSpace = THREE.SRGBColorSpace;
    this.disposableTexs.push(smacsTex, hubbleTex, carinaTex);

    const kindMap: Record<AnomalySpec['kind'], { kind: number; tex: THREE.Texture | null; size: number }> = {
      einstein_ring: { kind: 0, tex: smacsTex, size: 32 },
      horizon_lattice: { kind: 1, tex: hubbleTex, size: 30 },
      home_reference: { kind: 2, tex: null, size: 18 },
      nebula_cloud: { kind: 3, tex: carinaTex, size: 38 },
    };

    for (const spec of this.anomalySpecs) {
      const pos = this.anomalyPositions.get(spec.id)!;
      const cfg = kindMap[spec.kind];
      const mat = new THREE.ShaderMaterial({
        vertexShader: ANOMALY_VERTEX,
        fragmentShader: ANOMALY_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTexture: { value: cfg.tex },
          uHasTexture: { value: cfg.tex ? 1.0 : 0.0 },
          uTime: { value: 0 },
          uKind: { value: cfg.kind },
          uWavelengthMatch: { value: 0.1 },
          uOpticalFidelity: { value: this.opticalFidelity },
          uZoomFactor: { value: 0.2 },
        },
      });
      this.anomalyMats.set(spec.id, mat);
      this.disposableMats.push(mat);

      const geo = new THREE.PlaneGeometry(cfg.size, cfg.size);
      this.disposableGeos.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.lookAt(0, 0, 0);
      scene.add(mesh);
    }
  }

  private bindEvents(): void {
    const el = this.renderer?.domElement;
    if (!el) return;

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.activePointers.size === 1) {
        this.isDragging = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
      } else if (this.activePointers.size === 2) {
        this.isDragging = false;
        const pts = [...this.activePointers.values()];
        this.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.pinchStartFov = this.targetFovDeg;
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (!this.activePointers.has(e.pointerId)) return;
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activePointers.size === 2) {
        const pts = [...this.activePointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this.pinchStartDist > 8) {
          const ratio = this.pinchStartDist / Math.max(8, dist);
          this.targetFovDeg = THREE.MathUtils.clamp(this.pinchStartFov * ratio, 4, 72);
        }
        return;
      }

      if (!this.isDragging) return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      const sens = (this.fovDeg / 60) * 0.16;
      this.targetYawDeg -= dx * sens;
      this.targetPitchDeg = THREE.MathUtils.clamp(this.targetPitchDeg + dy * sens, -78, 78);
    });

    const releasePointer = (e: PointerEvent) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size < 2) this.pinchStartDist = 0;
      if (this.activePointers.size === 0) this.isDragging = false;
    };

    el.addEventListener('pointerup', releasePointer);
    el.addEventListener('pointercancel', releasePointer);

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.12 : 0.89;
        this.targetFovDeg = THREE.MathUtils.clamp(this.targetFovDeg * factor, 4, 72);
      },
      { passive: false }
    );

    window.addEventListener('resize', this.onResizeBound);
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight || 720);
    this.viewW = w;
    this.viewH = h;
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  getViewportSize(): { width: number; height: number } {
    return { width: this.viewW, height: this.viewH };
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

  setParameters(wavelengthNm: number, opticalFidelity: number, anomalyProgress: number): void {
    this.wavelengthNm = THREE.MathUtils.clamp(wavelengthNm, 200, 1800);
    this.opticalFidelity = opticalFidelity;
    this.anomalyProgress = anomalyProgress / 100;
  }

  zoomBy(factor: number): void {
    this.targetFovDeg = THREE.MathUtils.clamp(this.targetFovDeg * factor, 4, 72);
  }

  slewToAnomaly(id: string): void {
    const spec = this.anomalySpecs.find((a) => a.id === id);
    if (!spec) return;
    this.targetYawDeg = spec.raDeg;
    this.targetPitchDeg = spec.decDeg;
    this.targetFovDeg = Math.min(spec.recommendedFovMax - 4, 18);
  }

  triggerTransitionDive(targetId: string): void {
    const spec = this.anomalySpecs.find((a) => a.id === targetId);
    this.preDiveFovDeg = this.targetFovDeg;
    if (spec) {
      this.targetYawDeg = spec.raDeg;
      this.targetPitchDeg = spec.decDeg;
    }
    this.targetFovDeg = 3.6;
    this.transitionBoostUntil = performance.now() + 620;
  }

  triggerPullbackArrival(): void {
    const restoreFov = THREE.MathUtils.clamp(this.preDiveFovDeg || 54, 12, 72);
    this.fovDeg = Math.max(8, Math.min(18, restoreFov * 0.42));
    this.targetFovDeg = restoreFov;
    this.transitionBoostUntil = performance.now() + 650;
  }

  getAnomalySpecs(): AnomalySpec[] {
    return this.anomalySpecs;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active) {
      this.ensureInitialized();
      this.resize();
      this.lastFrameTime = performance.now();
      if (!this.rafId) this.rafId = requestAnimationFrame(this.loop);
    } else if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private applyCameraOrientation(): void {
    if (!this.camera) return;
    raDecToVec3(this.yawDeg, this.pitchDeg, 100, this._lookTarget);
    this.camera.lookAt(this._lookTarget);
  }

  private projectMarkers(): ProjectedMarker[] {
    const cam = this.camera!;
    this._camForward.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();

    for (let i = 0; i < this.anomalySpecs.length; i++) {
      const spec = this.anomalySpecs[i];
      const worldPos = this._worldPos.copy(this.anomalyPositions.get(spec.id)!);
      const dir = this.anomalyDirs.get(spec.id)!;
      const inFront = this._camForward.dot(dir) > 0.1;
      const ndc = worldPos.project(cam);
      let sx = (ndc.x + 1) * 0.5;
      let sy = (1 - ndc.y) * 0.5;
      if (!inFront) {
        sx = 1 - sx;
        sy = 1 - sy;
      }
      const inView = inFront && sx >= 0.08 && sx <= 0.92 && sy >= 0.12 && sy <= 0.84;
      const angle = Math.atan2(sy - 0.5, sx - 0.5);
      const out = this.projectedMarkers[i];
      out.x = THREE.MathUtils.clamp(sx, 0.06, 0.94);
      out.y = THREE.MathUtils.clamp(sy, 0.12, 0.84);
      out.inView = inView;
      out.edgeAngleRad = angle;
    }
    return this.projectedMarkers;
  }

  private loop = (): void => {
    if (!this.active || !this.renderer || !this.scene || !this.camera || !this.skyMat || !this.starMat) return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    const elapsed = now * 0.001;

    const dampRate = now < this.transitionBoostUntil ? 12.5 : 7.5;
    const damp = 1 - Math.exp(-dampRate * dt);
    this.yawDeg += (this.targetYawDeg - this.yawDeg) * damp;
    this.pitchDeg += (this.targetPitchDeg - this.pitchDeg) * damp;
    this.fovDeg += (this.targetFovDeg - this.fovDeg) * damp;

    if (Math.abs(this.camera.fov - this.fovDeg) > 0.01) {
      this.camera.fov = this.fovDeg;
      this.camera.updateProjectionMatrix();
    }
    this.applyCameraOrientation();

    const waveNorm = (this.wavelengthNm - 200) / (1800 - 200);
    const zoomFactor = THREE.MathUtils.clamp((72 - this.fovDeg) / (72 - 4), 0, 1);

    this.skyMat.uniforms.uTime.value = elapsed;
    this.skyMat.uniforms.uWavelengthNorm.value = waveNorm;
    this.skyMat.uniforms.uOpticalFidelity.value = this.opticalFidelity;
    this.skyMat.uniforms.uAnomalyProgress.value = this.anomalyProgress;

    this.starMat.uniforms.uTime.value = elapsed;
    this.starMat.uniforms.uFovScale.value = zoomFactor;
    this.starMat.uniforms.uWavelengthNorm.value = waveNorm;

    this._camForward.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    let bestSpec: AnomalySpec | null = null;
    let bestAlign = 0;
    let bestWaveMatch = 0;

    for (const spec of this.anomalySpecs) {
      const dir = this.anomalyDirs.get(spec.id)!;
      const angleDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(this._camForward.dot(dir), -1, 1)));
      const align = THREE.MathUtils.clamp(1 - angleDeg / Math.max(5.5, this.fovDeg * 0.30), 0, 1);
      const waveDiff = Math.abs(this.wavelengthNm - spec.optimalWavelengthNm);
      const waveMatch = THREE.MathUtils.clamp(1 - waveDiff / spec.wavelengthToleranceNm, 0, 1);

      const mat = this.anomalyMats.get(spec.id)!;
      mat.uniforms.uTime.value = elapsed;
      mat.uniforms.uWavelengthMatch.value = waveMatch;
      mat.uniforms.uOpticalFidelity.value = this.opticalFidelity;
      mat.uniforms.uZoomFactor.value = zoomFactor;

      if (align > bestAlign) {
        bestAlign = align;
        bestSpec = spec;
        bestWaveMatch = waveMatch;
      }
    }

    if (bestSpec && bestAlign > 0.5 && bestWaveMatch > 0.48 && this.fovDeg <= bestSpec.recommendedFovMax + 10) {
      const rate = 0.46 * (0.65 + 0.6 * this.opticalFidelity);
      this.lockProgress = Math.min(1, this.lockProgress + dt * rate);
      if (this.lockProgress >= 1 && this.lastLockedId !== bestSpec.id) {
        this.lastLockedId = bestSpec.id;
        this.onScanComplete(bestSpec);
      }
    } else {
      this.lockProgress = Math.max(0, this.lockProgress - dt * 0.5);
      if (this.lockProgress < 0.05) this.lastLockedId = '';
    }

    this.renderer.render(this.scene, this.camera);

    const normalizedRa = ((this.yawDeg % 360) + 360) % 360;
    const zoomNorm = THREE.MathUtils.clamp((72 - this.fovDeg) / (72 - 4), 0, 1);
    const zoomStage: WideZoomStage =
      this.fovDeg > 48
        ? 'WIDE SKY'
        : this.fovDeg > 28
          ? 'SECTOR'
          : this.fovDeg > 15
            ? 'DEEP FIELD'
            : 'LOCK RANGE';

    this.onTelemetry({
      raDeg: normalizedRa,
      decDeg: this.pitchDeg,
      fovDeg: this.fovDeg,
      zoomX: 72 / this.fovDeg,
      zoomNorm,
      zoomStage,
      focusedAnomaly: bestAlign > 0.34 ? bestSpec : null,
      alignmentScore: bestAlign,
      wavelengthMatch: bestWaveMatch,
      lockProgress: this.lockProgress,
      markers: this.projectMarkers(),
    });
  };

  dispose(): void {
    this.disposed = true;
    this.setActive(false);
    if (!this.initialized) return;
    window.removeEventListener('resize', this.onResizeBound);
    this.skyNoiseRT?.dispose();
    this.skyNoiseRT = null;
    for (const g of this.disposableGeos) g.dispose();
    for (const m of this.disposableMats) m.dispose();
    for (const t of this.disposableTexs) t.dispose();
    this.disposableGeos.length = 0;
    this.disposableMats.length = 0;
    this.disposableTexs.length = 0;
    this.anomalyMats.clear();
    this.renderer?.dispose();
    this.renderer = null;
  }
}
