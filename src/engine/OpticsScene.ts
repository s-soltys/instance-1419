import * as THREE from 'three';
import jwstSmacsUrl from '../../assets/astro/jwst_smacs0723.webp';
import hubbleUdfUrl from '../../assets/astro/hubble_udf.webp';
import jwstCarinaUrl from '../../assets/astro/jwst_carina_nebula.webp';
import anomaliesData from '../content/anomalies.json';
import {
  ANOMALY_FRAGMENT,
  ANOMALY_VERTEX,
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

function raDecToVec3(raDeg: number, decDeg: number, radius: number): THREE.Vector3 {
  const ra = THREE.MathUtils.degToRad(raDeg);
  const dec = THREE.MathUtils.degToRad(decDeg);
  return new THREE.Vector3(
    radius * Math.cos(dec) * Math.sin(ra),
    radius * Math.sin(dec),
    -radius * Math.cos(dec) * Math.cos(ra)
  );
}

function blackbodyColor(tempNorm: number): THREE.Color {
  const c = new THREE.Color();
  if (tempNorm < 0.5) {
    c.lerpColors(new THREE.Color('#ffaa66'), new THREE.Color('#fff5e4'), tempNorm * 2.0);
  } else {
    c.lerpColors(new THREE.Color('#fff5e4'), new THREE.Color('#9ec5ff'), (tempNorm - 0.5) * 2.0);
  }
  return c;
}

export class OpticsScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly starMat: THREE.ShaderMaterial;
  private readonly anomalySpecs: AnomalySpec[];
  private readonly anomalyMats: Map<string, THREE.ShaderMaterial> = new Map();
  private readonly anomalyMeshes: Map<string, THREE.Mesh> = new Map();
  private readonly anomalyDirs: Map<string, THREE.Vector3> = new Map();
  private readonly anomalyPositions: Map<string, THREE.Vector3> = new Map();

  private yawDeg = 16;
  private pitchDeg = -4;
  private targetYawDeg = 16;
  private targetPitchDeg = -4;
  private fovDeg = 62;
  private targetFovDeg = 62;

  private ambientDrift = false;
  private driftBasePitchDeg = -4;
  private visibleTargetIds: Set<string> | null = null;
  private magneticDetentTargetId: string | null = null;
  private introPullUntil = 0;

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

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      this.fovDeg,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      500
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.className = 'optics-canvas';
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
    container.appendChild(this.renderer.domElement);

    // 1. Multi-wavelength celestial sphere (UV -> Visible -> Near-IR -> Mid-IR)
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWavelengthNorm: { value: 0.225 },
        uOpticalFidelity: { value: this.opticalFidelity },
        uAnomalyProgress: { value: 0 },
      },
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(220, 48, 32), this.skyMat));

    // 2. 18,000 multi-spectral stars across 4 physical bands
    this.starMat = this.buildStarfield(18000);

    // 3. NASA/STScI JWST & Hubble deep-sky & nebula plates
    this.buildAnomalyPlates();

    this.bindEvents();
    this.applyCameraOrientation();
  }

  private buildStarfield(count: number): THREE.ShaderMaterial {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const bands = new Float32Array(count);

    const galAxis = new THREE.Vector3(0.28, 0.91, -0.30).normalize();

    let seed = 141941802;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      const bandRoll = rand();
      let band = 1; // Visible default
      if (bandRoll < 0.14) band = 0; // UV/X-ray hot stars
      else if (bandRoll < 0.60) band = 1; // Visible optical stars
      else if (bandRoll < 0.85) band = 2; // Near-IR shrouded galactic plane stars
      else band = 3; // Mid-IR cool red giants/protostars
      bands[i] = band;

      let u = rand() * 2 - 1;
      const theta = rand() * Math.PI * 2;
      const r = 165 + rand() * 25;
      if (band === 2 || band === 3) {
        // Concentrate IR populations closer to galactic plane
        u *= 0.48;
      }
      const sqrtOneMinusU2 = Math.sqrt(Math.max(0, 1 - u * u));

      const p = new THREE.Vector3(
        r * sqrtOneMinusU2 * Math.cos(theta),
        r * u,
        r * sqrtOneMinusU2 * Math.sin(theta)
      );
      if (band === 2 || band === 3) {
        // Tilt toward galAxis plane
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), galAxis);
        p.applyQuaternion(q);
      }

      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;

      let c: THREE.Color;
      if (band === 0) {
        c = new THREE.Color('#8ec2ff').lerp(new THREE.Color('#c79eff'), rand());
      } else if (band === 2) {
        c = new THREE.Color('#ffd399').lerp(new THREE.Color('#ff9d5c'), rand());
      } else if (band === 3) {
        c = new THREE.Color('#ff8458').lerp(new THREE.Color('#ffb870'), rand());
      } else {
        c = blackbodyColor(Math.pow(rand(), 1.15));
      }
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

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
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uWavelengthNorm: { value: 0.225 },
      },
    });

    this.scene.add(new THREE.Points(geo, mat));
    return mat;
  }

  private buildAnomalyPlates(): void {
    const loader = new THREE.TextureLoader();
    const smacsTex = loader.load(jwstSmacsUrl);
    smacsTex.colorSpace = THREE.SRGBColorSpace;
    const hubbleTex = loader.load(hubbleUdfUrl);
    hubbleTex.colorSpace = THREE.SRGBColorSpace;
    const carinaTex = loader.load(jwstCarinaUrl);
    carinaTex.colorSpace = THREE.SRGBColorSpace;

    const kindMap: Record<AnomalySpec['kind'], { kind: number; tex: THREE.Texture | null; size: number }> = {
      einstein_ring: { kind: 0, tex: smacsTex, size: 32 },
      horizon_lattice: { kind: 1, tex: hubbleTex, size: 30 },
      home_reference: { kind: 2, tex: null, size: 18 },
      nebula_cloud: { kind: 3, tex: carinaTex, size: 38 },
    };

    for (const spec of this.anomalySpecs) {
      const pos = raDecToVec3(spec.raDeg, spec.decDeg, 120);
      this.anomalyPositions.set(spec.id, pos);
      this.anomalyDirs.set(spec.id, pos.clone().normalize());

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

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cfg.size, cfg.size), mat);
      mesh.position.copy(pos);
      mesh.lookAt(0, 0, 0);
      mesh.visible = this.isTargetVisible(spec.id);
      this.anomalyMeshes.set(spec.id, mesh);
      this.scene.add(mesh);
    }
  }

  private bindEvents(): void {
    const el = this.renderer.domElement;

    el.addEventListener('pointerdown', (e) => {
      if (this.ambientDrift) return;
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
      if (this.ambientDrift) return;
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

      let sens = (this.fovDeg / 60) * 0.16;
      const detentDist = this.getMagneticDetentAngleDeg();
      if (detentDist !== null && detentDist < 7.0) {
        // Soft ~7° magnetic optical detent damping so aiming feels warm and effortless
        sens *= 0.48 + 0.52 * (detentDist / 7.0);
      }
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
        if (this.ambientDrift) return;
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.12 : 0.89;
        this.targetFovDeg = THREE.MathUtils.clamp(this.targetFovDeg * factor, 4, 72);
      },
      { passive: false }
    );

    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setParameters(wavelengthNm: number, opticalFidelity: number, anomalyProgress: number): void {
    this.wavelengthNm = THREE.MathUtils.clamp(wavelengthNm, 200, 1800);
    this.opticalFidelity = opticalFidelity;
    this.anomalyProgress = anomalyProgress / 100;
  }

  setAmbientDrift(enabled: boolean): void {
    this.ambientDrift = enabled;
    if (enabled) {
      this.isDragging = false;
      this.activePointers.clear();
      this.pinchStartDist = 0;
      this.lockProgress = 0;
      this.lastLockedId = '';
      this.targetFovDeg = 62;
      this.driftBasePitchDeg = THREE.MathUtils.clamp(this.pitchDeg, -18, 18);
    }
  }

  isAmbientDrift(): boolean {
    return this.ambientDrift;
  }

  setVisibleTargetIds(ids: string[] | null): void {
    this.visibleTargetIds = ids ? new Set(ids) : null;
    for (const [id, mesh] of this.anomalyMeshes.entries()) {
      mesh.visible = this.isTargetVisible(id);
    }
    if (this.lastLockedId && !this.isTargetVisible(this.lastLockedId)) {
      this.lockProgress = 0;
      this.lastLockedId = '';
    }
  }

  getVisibleTargetIds(): string[] | null {
    return this.visibleTargetIds ? [...this.visibleTargetIds] : null;
  }

  setMagneticDetentTarget(targetId: string | null): void {
    this.magneticDetentTargetId = targetId;
  }

  getMagneticDetentTarget(): string | null {
    return this.magneticDetentTargetId;
  }

  setIntroFraming(raDeg: number, decDeg: number, fov: number, immediate = false): void {
    const clampedPitch = THREE.MathUtils.clamp(decDeg, -78, 78);
    const clampedFov = THREE.MathUtils.clamp(fov, 4, 72);
    this.targetYawDeg = raDeg;
    this.targetPitchDeg = clampedPitch;
    this.targetFovDeg = clampedFov;
    if (immediate) {
      this.yawDeg = raDeg;
      this.pitchDeg = clampedPitch;
      this.fovDeg = clampedFov;
      this.camera.fov = clampedFov;
      this.camera.updateProjectionMatrix();
      this.applyCameraOrientation();
    }
  }

  pullInToTarget1(): void {
    this.ambientDrift = false;
    // Shortest angular path from current drifting yaw to RA 22°
    const delta = ((((22 - this.yawDeg) % 360) + 540) % 360) - 180;
    this.targetYawDeg = this.yawDeg + delta;
    this.targetPitchDeg = -6;
    this.targetFovDeg = 56;
    this.introPullUntil = performance.now() + 1250;
  }

  private isTargetVisible(id: string): boolean {
    return this.visibleTargetIds === null || this.visibleTargetIds.has(id);
  }

  private getMagneticDetentAngleDeg(): number | null {
    if (!this.magneticDetentTargetId || this.ambientDrift) return null;
    if (!this.isTargetVisible(this.magneticDetentTargetId)) return null;
    const dir = this.anomalyDirs.get(this.magneticDetentTargetId);
    if (!dir) return null;
    const aim = raDecToVec3(this.targetYawDeg, this.targetPitchDeg, 1).normalize();
    return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(aim.dot(dir), -1, 1)));
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
      this.resize();
      this.lastFrameTime = performance.now();
      if (!this.rafId) this.loop();
    } else if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private applyCameraOrientation(): void {
    const lookTarget = raDecToVec3(this.yawDeg, this.pitchDeg, 100);
    this.camera.lookAt(lookTarget);
  }

  private projectMarkers(): ProjectedMarker[] {
    if (this.ambientDrift) return [];
    const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const out: ProjectedMarker[] = [];

    for (const spec of this.anomalySpecs) {
      if (!this.isTargetVisible(spec.id)) continue;
      const worldPos = this.anomalyPositions.get(spec.id)!.clone();
      const dir = this.anomalyDirs.get(spec.id)!;
      const inFront = camForward.dot(dir) > 0.1;
      const ndc = worldPos.project(this.camera);
      let sx = (ndc.x + 1) * 0.5;
      let sy = (1 - ndc.y) * 0.5;
      if (!inFront) {
        sx = 1 - sx;
        sy = 1 - sy;
      }
      const inView = inFront && sx >= 0.08 && sx <= 0.92 && sy >= 0.12 && sy <= 0.84;
      const angle = Math.atan2(sy - 0.5, sx - 0.5);
      out.push({
        id: spec.id,
        label: spec.label,
        bandName: spec.bandName,
        wavelengthNm: spec.optimalWavelengthNm,
        x: THREE.MathUtils.clamp(sx, 0.06, 0.94),
        y: THREE.MathUtils.clamp(sy, 0.12, 0.84),
        inView,
        edgeAngleRad: angle,
      });
    }
    return out;
  }

  private loop = (): void => {
    if (!this.active) return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    const elapsed = now * 0.001;

    if (this.ambientDrift) {
      this.targetYawDeg += dt * 1.15;
      this.targetPitchDeg = this.driftBasePitchDeg + Math.sin(elapsed * 0.16) * 2.4;
      this.targetFovDeg = 62;
    } else if (!this.isDragging && this.magneticDetentTargetId && this.isTargetVisible(this.magneticDetentTargetId)) {
      const detentSpec = this.anomalySpecs.find((a) => a.id === this.magneticDetentTargetId);
      const angleDeg = this.getMagneticDetentAngleDeg();
      if (detentSpec && angleDeg !== null && angleDeg > 0.15 && angleDeg < 7.0) {
        const pull = (1 - angleDeg / 7.0) * Math.min(1, dt * 2.4);
        const yawDelta = ((((detentSpec.raDeg - this.targetYawDeg) % 360) + 540) % 360) - 180;
        this.targetYawDeg += yawDelta * pull;
        this.targetPitchDeg += (detentSpec.decDeg - this.targetPitchDeg) * pull;
      }
    }

    const dampRate =
      now < this.transitionBoostUntil ? 12.5 : now < this.introPullUntil ? 3.8 : this.ambientDrift ? 2.8 : 7.5;
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

    const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    let bestSpec: AnomalySpec | null = null;
    let bestAlign = 0;
    let bestWaveMatch = 0;

    for (const spec of this.anomalySpecs) {
      const visible = this.isTargetVisible(spec.id);
      const mesh = this.anomalyMeshes.get(spec.id);
      if (mesh) mesh.visible = visible;
      if (!visible) continue;

      const dir = this.anomalyDirs.get(spec.id)!;
      const angleDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(camForward.dot(dir), -1, 1)));
      const align = THREE.MathUtils.clamp(1 - angleDeg / Math.max(5.5, this.fovDeg * 0.30), 0, 1);
      const waveDiff = Math.abs(this.wavelengthNm - spec.optimalWavelengthNm);
      const waveMatch = THREE.MathUtils.clamp(1 - waveDiff / spec.wavelengthToleranceNm, 0, 1);

      const mat = this.anomalyMats.get(spec.id)!;
      mat.uniforms.uTime.value = elapsed;
      mat.uniforms.uWavelengthMatch.value = waveMatch;
      mat.uniforms.uOpticalFidelity.value = this.opticalFidelity;
      mat.uniforms.uZoomFactor.value = zoomFactor;

      if (!this.ambientDrift && align > bestAlign) {
        bestAlign = align;
        bestSpec = spec;
        bestWaveMatch = waveMatch;
      }
    }

    if (
      !this.ambientDrift &&
      bestSpec &&
      bestAlign > 0.5 &&
      bestWaveMatch > 0.48 &&
      this.fovDeg <= bestSpec.recommendedFovMax + 10
    ) {
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
      focusedAnomaly: !this.ambientDrift && bestAlign > 0.34 ? bestSpec : null,
      alignmentScore: this.ambientDrift ? 0 : bestAlign,
      wavelengthMatch: this.ambientDrift ? 0 : bestWaveMatch,
      lockProgress: this.ambientDrift ? 0 : this.lockProgress,
      markers: this.projectMarkers(),
    });
  };

  dispose(): void {
    this.setActive(false);
    this.skyMat.dispose();
    this.starMat.dispose();
    for (const m of this.anomalyMats.values()) m.dispose();
    this.renderer.dispose();
  }
}
