import * as THREE from 'three';
import anomaliesData from '../content/anomalies.json';
import {
  ANOMALY_FRAGMENT,
  ANOMALY_VERTEX,
  SKY_FRAGMENT,
  SKY_VERTEX,
  STAR_FRAGMENT,
  STAR_VERTEX,
} from './shaders/opticsShaders';

export interface AnomalySpec {
  id: string;
  label: string;
  subtitle: string;
  raDeg: number;
  decDeg: number;
  optimalWavelengthNm: number;
  wavelengthToleranceNm: number;
  recommendedFovMax: number;
  anomalyGain: number;
  kind: 'einstein_ring' | 'horizon_lattice' | 'home_reference';
  accentHex: string;
  description: string;
}

export interface OpticsTelemetry {
  raDeg: number;
  decDeg: number;
  fovDeg: number;
  zoomX: number;
  focusedAnomaly: AnomalySpec | null;
  alignmentScore: number; // 0..1
  wavelengthMatch: number; // 0..1
  lockProgress: number; // 0..1
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
  // 0 = warm amber K/M star, 0.5 = solar cream-white, 1.0 = hot blue-white O/B star
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
  private readonly anomalyDirs: Map<string, THREE.Vector3> = new Map();

  private yawDeg = 8;
  private pitchDeg = 4;
  private targetYawDeg = 8;
  private targetPitchDeg = 4;
  private fovDeg = 58;
  private targetFovDeg = 58;

  private wavelengthNm = 580;
  private opticalFidelity = 0.55;
  private anomalyProgress = 0;
  private lockProgress = 0;
  private lastLockedId = '';

  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pinchStartDist = 0;
  private pinchStartFov = 58;
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
    this.renderer.domElement.className = 'optics-canvas';
    container.appendChild(this.renderer.domElement);

    // 1. Celestial Skybox Sphere
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWavelengthNorm: { value: 0.13 },
        uOpticalFidelity: { value: this.opticalFidelity },
        uAnomalyProgress: { value: 0 },
      },
    });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(220, 48, 32), this.skyMat);
    this.scene.add(skyMesh);

    // 2. 14,000 Blackbody Starfield with JWST-style diffraction spikes
    this.starMat = this.buildStarfield(14000);

    // 3. Zoomable Deep-Field Anomaly Plates anchored at exact RA/Dec coordinates
    this.buildAnomalyPlates();

    this.bindEvents();
    this.applyCameraOrientation();
  }

  private buildStarfield(count: number): THREE.ShaderMaterial {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    // Deterministic LCG for reproducible starfield across screenshots & sessions
    let seed = 141941802;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      const u = rand() * 2 - 1;
      const theta = rand() * Math.PI * 2;
      const r = 165 + rand() * 25;
      const sqrtOneMinusU2 = Math.sqrt(Math.max(0, 1 - u * u));

      positions[i * 3] = r * sqrtOneMinusU2 * Math.cos(theta);
      positions[i * 3 + 1] = r * u;
      positions[i * 3 + 2] = r * sqrtOneMinusU2 * Math.sin(theta);

      const c = blackbodyColor(Math.pow(rand(), 1.15));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

      // Realistic power-law magnitude distribution (many faint stars, few crisp bright spikes)
      const mag = Math.pow(rand(), 6.8);
      sizes[i] = 1.4 + mag * 18.0;
      phases[i] = rand();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

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
        uWavelengthNorm: { value: 0.13 },
      },
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    return mat;
  }

  private buildAnomalyPlates(): void {
    const kindMap: Record<AnomalySpec['kind'], number> = {
      einstein_ring: 0,
      horizon_lattice: 1,
      home_reference: 2,
    };

    for (const spec of this.anomalySpecs) {
      const pos = raDecToVec3(spec.raDeg, spec.decDeg, 120);
      this.anomalyDirs.set(spec.id, pos.clone().normalize());

      const mat = new THREE.ShaderMaterial({
        vertexShader: ANOMALY_VERTEX,
        fragmentShader: ANOMALY_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uKind: { value: kindMap[spec.kind] },
          uWavelengthMatch: { value: 0.1 },
          uOpticalFidelity: { value: this.opticalFidelity },
          uZoomFactor: { value: 0.2 },
        },
      });
      this.anomalyMats.set(spec.id, mat);

      const size = spec.kind === 'home_reference' ? 18 : 26;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      mesh.position.copy(pos);
      mesh.lookAt(0, 0, 0);
      this.scene.add(mesh);
    }
  }

  private bindEvents(): void {
    const el = this.renderer.domElement;

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

      // Dynamic angular sensitivity proportional to current optical FOV
      const sens = (this.fovDeg / 60) * 0.16;
      this.targetYawDeg -= dx * sens;
      this.targetPitchDeg = THREE.MathUtils.clamp(this.targetPitchDeg + dy * sens, -78, 78);
    });

    const releasePointer = (e: PointerEvent) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size < 2) {
        this.pinchStartDist = 0;
      }
      if (this.activePointers.size === 0) {
        this.isDragging = false;
      }
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
    this.wavelengthNm = THREE.MathUtils.clamp(wavelengthNm, 400, 1800);
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

  getAnomalySpecs(): AnomalySpec[] {
    return this.anomalySpecs;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active) {
      this.resize();
      this.lastFrameTime = performance.now();
      if (!this.rafId) {
        this.loop();
      }
    } else if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private applyCameraOrientation(): void {
    const lookTarget = raDecToVec3(this.yawDeg, this.pitchDeg, 100);
    this.camera.lookAt(lookTarget);
  }

  private loop = (): void => {
    if (!this.active) return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    const elapsed = now * 0.001;

    // Smooth optical inertia
    const damp = 1 - Math.exp(-7.5 * dt);
    this.yawDeg += (this.targetYawDeg - this.yawDeg) * damp;
    this.pitchDeg += (this.targetPitchDeg - this.pitchDeg) * damp;
    this.fovDeg += (this.targetFovDeg - this.fovDeg) * damp;

    if (Math.abs(this.camera.fov - this.fovDeg) > 0.01) {
      this.camera.fov = this.fovDeg;
      this.camera.updateProjectionMatrix();
    }
    this.applyCameraOrientation();

    const waveNorm = (this.wavelengthNm - 400) / (1800 - 400);
    const zoomFactor = THREE.MathUtils.clamp((72 - this.fovDeg) / (72 - 4), 0, 1);

    this.skyMat.uniforms.uTime.value = elapsed;
    this.skyMat.uniforms.uWavelengthNorm.value = waveNorm;
    this.skyMat.uniforms.uOpticalFidelity.value = this.opticalFidelity;
    this.skyMat.uniforms.uAnomalyProgress.value = this.anomalyProgress;

    this.starMat.uniforms.uTime.value = elapsed;
    this.starMat.uniforms.uFovScale.value = zoomFactor;
    this.starMat.uniforms.uWavelengthNorm.value = waveNorm;

    // Evaluate reticle alignment against deep-field targets
    const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    let bestSpec: AnomalySpec | null = null;
    let bestAlign = 0;
    let bestWaveMatch = 0;

    for (const spec of this.anomalySpecs) {
      const dir = this.anomalyDirs.get(spec.id)!;
      const angleDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(camForward.dot(dir), -1, 1)));
      const align = THREE.MathUtils.clamp(1 - angleDeg / Math.max(4.5, this.fovDeg * 0.28), 0, 1);
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

    // Optical lock builds when centered + tuned to optimal band + sufficiently zoomed
    if (bestSpec && bestAlign > 0.52 && bestWaveMatch > 0.55 && this.fovDeg <= bestSpec.recommendedFovMax + 8) {
      const rate = 0.42 * (0.6 + 0.65 * this.opticalFidelity);
      this.lockProgress = Math.min(1, this.lockProgress + dt * rate);
      if (this.lockProgress >= 1 && this.lastLockedId !== bestSpec.id) {
        this.lastLockedId = bestSpec.id;
        this.onScanComplete(bestSpec);
      }
    } else {
      this.lockProgress = Math.max(0, this.lockProgress - dt * 0.5);
      if (this.lockProgress < 0.05) {
        this.lastLockedId = '';
      }
    }

    this.renderer.render(this.scene, this.camera);

    const normalizedRa = ((this.yawDeg % 360) + 360) % 360;
    this.onTelemetry({
      raDeg: normalizedRa,
      decDeg: this.pitchDeg,
      fovDeg: this.fovDeg,
      zoomX: 72 / this.fovDeg,
      focusedAnomaly: bestAlign > 0.35 ? bestSpec : null,
      alignmentScore: bestAlign,
      wavelengthMatch: bestWaveMatch,
      lockProgress: this.lockProgress,
    });
  };
}
