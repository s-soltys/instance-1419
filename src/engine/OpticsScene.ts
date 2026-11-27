import * as THREE from 'three';
import starCatalogUrl from '../../assets/astro/star_catalog_10ly.bin?url';
import anomaliesData from '../content/anomalies.json';
import pacing from '../content/pacing.json';
import shiftsData from '../content/shifts.json';
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

const ASTRO_PLATE_GLOB = import.meta.glob('../../assets/astro/*.webp', {
  import: 'default',
}) as Record<string, () => Promise<string>>;

const PLATE_FILE_MAP: Record<string, string> = {
  carina: 'jwst_carina_nebula.webp',
  smacs: 'jwst_smacs0723.webp',
  hudf: 'hubble_udf.webp',
  pillars: 'jwst_pillars_of_creation.webp',
  southern_ring: 'jwst_southern_ring.webp',
  stephans_quintet: 'jwst_stephans_quintet.webp',
  tarantula: 'jwst_tarantula_nebula.webp',
  crab: 'jwst_crab_nebula.webp',
  ring_m57: 'jwst_ring_nebula.webp',
  cartwheel: 'jwst_cartwheel_galaxy.webp',
  rho_ophiuchi: 'jwst_rho_ophiuchi.webp',
  cas_a: 'jwst_cassiopeia_a.webp',
  horsehead: 'jwst_horsehead_nebula.webp',
  sombrero: 'hubble_sombrero_galaxy.webp',
  whirlpool: 'hubble_whirlpool_m51.webp',
};

const MAX_ACTIVE_PLATES = 6;
const MAX_DECODED_DIRS = 21;
const STAR_CATALOG_RADIUS = 920;

export type ShowcaseType = 'star_system' | 'nebula' | 'grav_lens' | 'deep_field' | 'antipodal_poles';
export type ScaleClass =
  | 'planet'
  | 'star_system'
  | 'nebula'
  | 'galaxy'
  | 'galaxy_cluster'
  | 'horizon_anomaly';
export type AnomalyRole = 'baseline' | 'boundary_bleed' | 'direct_anomaly';

export interface AnomalyCatalogRef {
  catalog: string;
  designation: string;
  raJ2000Deg: number;
  decJ2000Deg: number;
  distanceLy: number;
  sourceLicense: string;
}

export interface PreScanBrief {
  objective: string;
  instrumentAction: string;
  whyNow: string;
}

export interface PostScanEcho {
  dossierFinding: string;
  psycheVoice: string;
  psycheLine: string;
  storyFlag: string;
  unlocksStoryletId: string | null;
}

export interface ProofContribution {
  phase: number;
  proofThread: string;
  weight: number;
}

export interface AnomalySpec {
  id: string;
  label: string;
  subtitle: string;
  bandName: string;
  showcaseType: ShowcaseType;
  scaleClass?: ScaleClass;
  minigameId: string;
  plateId?: string;
  preferredVariantIndex?: number;
  raDeg: number;
  decDeg: number;
  distanceLabel?: string;
  actionVerb?: string;
  anomalyRole?: AnomalyRole;
  spoilerFloorShift?: number;
  optimalWavelengthNm: number;
  wavelengthToleranceNm: number;
  recommendedFovMax: number;
  anomalyGain: number;
  kind: 'einstein_ring' | 'horizon_lattice' | 'home_reference' | 'nebula_cloud';
  accentHex: string;
  description: string;
  realCatalogRef?: AnomalyCatalogRef;
  preScanBrief?: PreScanBrief;
  postScanEcho?: PostScanEcho;
  proofContribution?: ProofContribution;
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
  scaleClass: ScaleClass;
  anomalyRole: AnomalyRole;
  isRequired: boolean;
  isDecoded: boolean;
  anomalyBleed: number;
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

function resolvePlateImporter(plateId: string | undefined): (() => Promise<string>) | null {
  if (!plateId) return null;
  const filename = PLATE_FILE_MAP[plateId];
  if (!filename) return null;
  for (const [globKey, importer] of Object.entries(ASTRO_PLATE_GLOB)) {
    if (globKey.endsWith(filename)) return importer;
  }
  return null;
}

const SCALE_CLASS_SIZE: Record<ScaleClass, number> = {
  planet: 18,
  star_system: 20,
  nebula: 38,
  galaxy: 28,
  galaxy_cluster: 32,
  horizon_anomaly: 34,
};

const SHIFT_REQUIRED_MAP: Map<number, Set<string>> = new Map(
  (shiftsData.shifts as Array<{ shift: number; requiredTargets?: string[] }>).map((s) => [
    s.shift,
    new Set(s.requiredTargets ?? []),
  ])
);

const SHIFT_ALL_MAP: Map<number, Set<string>> = new Map(
  (shiftsData.shifts as Array<{ shift: number; targetAnomalies?: string[] }>).map((s) => [
    s.shift,
    new Set(s.targetAnomalies ?? []),
  ])
);

const SURVEY_CENTER_DIR = raDecToVec3(26.0, 2.0, 1).normalize();
const SURVEY_COS_THRESHOLDS = [0.53, 0.03, -0.47, -0.83, -0.985, -1.05] as const;

function computeSurveyCosEdge(tier: number): number {
  const clamped = THREE.MathUtils.clamp(tier, 1, 6);
  const idx = Math.min(4, Math.floor(clamped - 1));
  const frac = clamped - 1 - idx;
  return THREE.MathUtils.lerp(SURVEY_COS_THRESHOLDS[idx], SURVEY_COS_THRESHOLDS[idx + 1], frac);
}

const J2000_GAL_AXIS = raDecToVec3(192.8595, 27.1283, 1).normalize();
const J2000_GAL_CENTER = raDecToVec3(266.405, -28.936, 1).normalize();

export class OpticsScene {
  private readonly container: HTMLElement;
  private readonly anomalySpecs: AnomalySpec[];
  private readonly anomalyDirs: Map<string, THREE.Vector3> = new Map();
  private readonly anomalyPositions: Map<string, THREE.Vector3> = new Map();
  private readonly projectedMarkers: ProjectedMarker[];
  private readonly visibleProjectedMarkers: ProjectedMarker[] = [];
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
  private plateLoader: THREE.TextureLoader | null = null;
  private readonly plateTexCache: Map<string, { tex: THREE.Texture; lastUsed: number }> = new Map();
  private readonly plateLoadInFlight: Map<string, Promise<void>> = new Map();
  private lruClock = 0;
  private readonly anomalyMats: Map<string, THREE.ShaderMaterial> = new Map();
  private readonly anomalyMeshes: Map<string, THREE.Mesh> = new Map();
  private readonly disposableGeos: THREE.BufferGeometry[] = [];
  private readonly disposableMats: THREE.Material[] = [];

  // Reusable per-frame math scratch objects
  private readonly _lookTarget = new THREE.Vector3();
  private readonly _camForward = new THREE.Vector3();
  private readonly _worldPos = new THREE.Vector3();

  private viewW = 1280;
  private viewH = 720;
  private appliedDpr = 1;

  private yawDeg = 16;
  private pitchDeg = -4;
  private targetYawDeg = 16;
  private targetPitchDeg = -4;
  private fovDeg = 62;
  private targetFovDeg = 62;

  private ambientDrift = false;
  private driftBasePitchDeg = -4;
  private visibleTargetIds: Set<string> | null = null;
  private decodedTargetIds: Set<string> = new Set();
  private justDecodedId = '';
  private decodePulseUntil = 0;
  private magneticDetentTargetId: string | null = null;
  private introPullUntil = 0;

  private wavelengthNm = 560;
  private opticalFidelity = 0.55;
  private anomalyProgress = 0;
  private currentShift = 1;
  private skySurveyTier = 1;
  private targetSkySurveyTier = 1;
  private fractalStage = 1;
  private targetFractalStage = 1;
  private anomalyBleed = 0;
  private skyShellCoverage = 0;
  private constellationGuideAlpha = 0.42;
  private readonly solDir = raDecToVec3(46.0, -16.0, 1).normalize();
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
        scaleClass: spec.scaleClass ?? 'star_system',
        anomalyRole: spec.anomalyRole ?? 'baseline',
        isRequired: false,
        isDecoded: false,
        anomalyBleed: 0,
      };
    });
  }

  private ensureInitialized(): void {
    if (this.initialized || this.disposed) return;
    this.initialized = true;

    this.viewW = Math.max(1, this.container.clientWidth || window.innerWidth || 1280);
    this.viewH = Math.max(1, this.container.clientHeight || window.innerHeight || 720);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(this.fovDeg, this.viewW / this.viewH, 0.1, 2000);
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
        uFractalStage: { value: this.fractalStage },
        uShellCoverage: { value: this.skyShellCoverage },
        uConstellationGuideAlpha: { value: this.constellationGuideAlpha },
        uSolDir: { value: this.solDir.clone() },
        uGalAxis: { value: J2000_GAL_AXIS.clone() },
        uGalCenter: { value: J2000_GAL_CENTER.clone() },
        uSurveyCenterDir: { value: SURVEY_CENTER_DIR.clone() },
        uSurveyCosEdge: { value: computeSurveyCosEdge(this.skySurveyTier) },
      },
    });
    const skyGeo = new THREE.SphereGeometry(220, 48, 32);
    this.disposableGeos.push(skyGeo);
    this.disposableMats.push(skyMat);
    this.skyMat = skyMat;
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // 3. 18,000 multi-spectral stars across 4 physical bands (real Hipparcos 10-ly binary + fallback)
    this.starMat = this.buildStarfield(18000, scene);
    this.syncDecodedStarUniforms();

    // 4. 15 NASA/ESA deep-sky & nebula plates (lazy-loaded, LRU max 6)
    this.buildAnomalyPlates(scene);
    this.syncVisiblePlatePrefetch();

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
    const unlockTiers = new Float32Array(count);

    const upAxis = new THREE.Vector3(0, 1, 0);
    const galQuat = new THREE.Quaternion().setFromUnitVectors(upAxis, J2000_GAL_AXIS);

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
      if (band === 2 || band === 3) {
        u *= 0.48;
      }
      const sqrtOneMinusU2 = Math.sqrt(Math.max(0, 1 - u * u));

      scratchVec
        .set(
          STAR_CATALOG_RADIUS * sqrtOneMinusU2 * Math.cos(theta),
          STAR_CATALOG_RADIUS * u,
          STAR_CATALOG_RADIUS * sqrtOneMinusU2 * Math.sin(theta)
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

      // Progressive tier distribution matching Shift 1 (~900) .. Shift 6 (18,000)
      if (i < 900) unlockTiers[i] = 1;
      else if (i < 3200) unlockTiers[i] = 2;
      else if (i < 7500) unlockTiers[i] = 3;
      else if (i < 12500) unlockTiers[i] = 4;
      else if (i < 16500) unlockTiers[i] = 5;
      else unlockTiers[i] = 6;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aBand', new THREE.BufferAttribute(bands, 1));
    geo.setAttribute('aUnlockTier', new THREE.BufferAttribute(unlockTiers, 1));

    const decodedDirsArray = Array.from({ length: MAX_DECODED_DIRS }, () => new THREE.Vector3());

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
        uSkySurveyTier: { value: this.skySurveyTier },
        uSurveyCenterDir: { value: SURVEY_CENTER_DIR.clone() },
        uSurveyCosEdge: { value: computeSurveyCosEdge(this.skySurveyTier) },
        uDecodedDirs: { value: decodedDirsArray },
        uDecodedCount: { value: 0 },
      },
    });

    this.disposableGeos.push(geo);
    this.disposableMats.push(mat);
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    void this.loadRealStarCatalog(geo);
    return mat;
  }

  private async loadRealStarCatalog(geo: THREE.BufferGeometry): Promise<void> {
    if (typeof fetch !== 'function') return;
    try {
      const res = await fetch(starCatalogUrl);
      if (!res.ok || this.disposed) return;
      const buf = await res.arrayBuffer();
      if (this.disposed || buf.byteLength < 24) return;

      const view = new DataView(buf);
      if (
        view.getUint8(0) !== 0x49 ||
        view.getUint8(1) !== 0x31 ||
        view.getUint8(2) !== 0x34 ||
        view.getUint8(3) !== 0x53
      ) {
        return;
      }
      const version = view.getUint16(4, true);
      if (version !== 1) return;
      const starCount = view.getUint32(8, true);
      if (starCount === 0 || buf.byteLength < 24 + starCount * 8) return;

      const solX = view.getFloat32(12, true);
      const solY = view.getFloat32(16, true);
      const solZ = view.getFloat32(20, true);
      if (Number.isFinite(solX) && Number.isFinite(solY) && Number.isFinite(solZ)) {
        this.solDir.set(solX, solY, solZ).normalize();
        if (this.skyMat) {
          (this.skyMat.uniforms.uSolDir.value as THREE.Vector3).copy(this.solDir);
        }
      }

      const positions = new Float32Array(starCount * 3);
      const colors = new Float32Array(starCount * 3);
      const sizes = new Float32Array(starCount);
      const phases = new Float32Array(starCount);
      const bands = new Float32Array(starCount);
      const unlockTiers = new Float32Array(starCount);

      const scratchVec = new THREE.Vector3();
      const scratchColor = new THREE.Color();

      for (let i = 0; i < starCount; i++) {
        const off = 24 + i * 8;
        const raQuant = view.getInt16(off, true);
        const decQuant = view.getInt16(off + 2, true);
        const magNorm = view.getUint8(off + 4);
        const bvNorm = view.getUint8(off + 5);
        const band = view.getUint8(off + 6);
        const unlockTier = view.getUint8(off + 7);

        const raDeg = (raQuant / 32767) * 180;
        const decDeg = (decQuant / 32767) * 90;
        raDecToVec3(raDeg, decDeg, STAR_CATALOG_RADIUS, scratchVec);

        positions[i * 3] = scratchVec.x;
        positions[i * 3 + 1] = scratchVec.y;
        positions[i * 3 + 2] = scratchVec.z;

        // B-V (-0.35..+2.0): 0 = hot blue -> 1 = cool orange-red; invert for writeBlackbodyColor
        writeBlackbodyColor(1.0 - bvNorm / 255, scratchColor);
        colors[i * 3] = scratchColor.r;
        colors[i * 3 + 1] = scratchColor.g;
        colors[i * 3 + 2] = scratchColor.b;

        const mag = magNorm / 255;
        sizes[i] = (band === 0 || band === 3 ? 1.85 : 1.45) + Math.pow(mag, 2.0) * 21.0;
        phases[i] = ((i * 2654435761) >>> 0) / 4294967296;
        bands[i] = band;
        unlockTiers[i] = unlockTier;
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
      geo.setAttribute('aBand', new THREE.BufferAttribute(bands, 1));
      geo.setAttribute('aUnlockTier', new THREE.BufferAttribute(unlockTiers, 1));
      geo.computeBoundingSphere();
    } catch {
      // Keep deterministic lightweight fallback stars in offline/jsdom environments
    }
  }

  private resolveAnomalyShaderKind(spec: AnomalySpec): number {
    if (spec.id === 'sol_centauri_bearing') return 2;
    if (spec.kind === 'einstein_ring') return 0;
    if (spec.kind === 'horizon_lattice') return 1;
    if (spec.kind === 'nebula_cloud') return 3;
    return 4;
  }

  private resolveTargetPlateSize(spec: AnomalySpec): number {
    if (spec.id === 'sol_centauri_bearing') return 18;
    if (spec.scaleClass && spec.scaleClass in SCALE_CLASS_SIZE) {
      return SCALE_CLASS_SIZE[spec.scaleClass];
    }
    if (spec.kind === 'nebula_cloud') return 38;
    if (spec.kind === 'einstein_ring') return 32;
    if (spec.kind === 'horizon_lattice') return 30;
    return 20;
  }

  private buildAnomalyPlates(scene: THREE.Scene): void {
    this.plateLoader = new THREE.TextureLoader();

    for (const spec of this.anomalySpecs) {
      const pos = this.anomalyPositions.get(spec.id)!;
      const shaderKind = this.resolveAnomalyShaderKind(spec);
      const size = this.resolveTargetPlateSize(spec);
      const mat = new THREE.ShaderMaterial({
        vertexShader: ANOMALY_VERTEX,
        fragmentShader: ANOMALY_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTexture: { value: null },
          uHasTexture: { value: 0.0 },
          uTime: { value: 0 },
          uKind: { value: shaderKind },
          uWavelengthMatch: { value: 0.1 },
          uOpticalFidelity: { value: this.opticalFidelity },
          uZoomFactor: { value: 0.2 },
          uFractalStage: { value: this.fractalStage },
          uAnomalyProgress: { value: this.anomalyProgress },
          uAnomalyBleed: { value: this.computeTargetBleed(spec) },
          uAnomalyRole: {
            value:
              spec.anomalyRole === 'direct_anomaly'
                ? 2.0
                : spec.anomalyRole === 'boundary_bleed'
                  ? 1.0
                  : 0.0,
          },
          uDecoded: { value: this.decodedTargetIds.has(spec.id) ? 1.0 : 0.0 },
          uDecodePulse: { value: 0.0 },
          uAmbientScale: { value: 1.0 },
        },
      });
      this.anomalyMats.set(spec.id, mat);
      this.disposableMats.push(mat);

      const geo = new THREE.PlaneGeometry(size, size);
      this.disposableGeos.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.lookAt(0, 0, 0);
      mesh.visible = this.isTargetVisible(spec.id);
      this.anomalyMeshes.set(spec.id, mesh);
      scene.add(mesh);
    }
  }

  private syncVisiblePlatePrefetch(): void {
    if (!this.initialized || this.disposed) return;
    let queued = 0;
    for (const spec of this.anomalySpecs) {
      if (!this.isTargetVisible(spec.id) || spec.id === 'sol_centauri_bearing') continue;
      if (!spec.plateId) continue;
      if (this.plateTexCache.has(spec.plateId)) {
        this.plateTexCache.get(spec.plateId)!.lastUsed = ++this.lruClock;
        continue;
      }
      if (this.plateTexCache.size + queued < MAX_ACTIVE_PLATES) {
        this.requestPlateTexture(spec.plateId);
        queued++;
      }
    }
    this.syncPlateTexturesToMaterials();
  }

  private requestPlateTexture(plateId: string): void {
    if (this.disposed || !this.plateLoader) return;
    const cached = this.plateTexCache.get(plateId);
    if (cached) {
      cached.lastUsed = ++this.lruClock;
      return;
    }
    if (this.plateLoadInFlight.has(plateId)) return;

    const importer = resolvePlateImporter(plateId);
    if (!importer) return;

    const loader = this.plateLoader;
    const promise = importer()
      .then((url) => {
        if (this.disposed) return;
        return new Promise<void>((resolve) => {
          loader.load(
            url,
            (tex) => {
              if (this.disposed) {
                tex.dispose();
                resolve();
                return;
              }
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.minFilter = THREE.LinearFilter;
              tex.magFilter = THREE.LinearFilter;
              this.plateTexCache.set(plateId, { tex, lastUsed: ++this.lruClock });
              this.evictLruPlatesIfNeeded();
              this.syncPlateTexturesToMaterials();
              resolve();
            },
            undefined,
            () => resolve()
          );
        });
      })
      .catch(() => {})
      .finally(() => {
        this.plateLoadInFlight.delete(plateId);
      });
    this.plateLoadInFlight.set(plateId, promise);
  }

  private evictLruPlatesIfNeeded(): void {
    while (this.plateTexCache.size > MAX_ACTIVE_PLATES) {
      const visiblePlates = new Set<string>();
      for (const spec of this.anomalySpecs) {
        if (this.isTargetVisible(spec.id) && spec.plateId && spec.id !== 'sol_centauri_bearing') {
          visiblePlates.add(spec.plateId);
        }
      }

      let victimKey: string | null = null;
      let victimScore = Infinity;
      for (const [key, entry] of this.plateTexCache.entries()) {
        const score = entry.lastUsed + (visiblePlates.has(key) ? 1_000_000 : 0);
        if (score < victimScore) {
          victimScore = score;
          victimKey = key;
        }
      }
      if (!victimKey) break;
      const victim = this.plateTexCache.get(victimKey);
      if (victim) {
        for (const mat of this.anomalyMats.values()) {
          if (mat.uniforms.uTexture.value === victim.tex) {
            mat.uniforms.uTexture.value = null;
            mat.uniforms.uHasTexture.value = 0.0;
          }
        }
        victim.tex.dispose();
      }
      this.plateTexCache.delete(victimKey);
    }
  }

  private syncPlateTexturesToMaterials(): void {
    for (const spec of this.anomalySpecs) {
      const mat = this.anomalyMats.get(spec.id);
      if (!mat) continue;
      if (spec.id === 'sol_centauri_bearing' || !spec.plateId) {
        mat.uniforms.uTexture.value = null;
        mat.uniforms.uHasTexture.value = 0.0;
        continue;
      }
      const cached = this.plateTexCache.get(spec.plateId);
      if (cached) {
        mat.uniforms.uTexture.value = cached.tex;
        mat.uniforms.uHasTexture.value = 1.0;
      } else {
        mat.uniforms.uTexture.value = null;
        mat.uniforms.uHasTexture.value = 0.0;
      }
    }
  }

  private bindEvents(): void {
    const el = this.renderer?.domElement;
    if (!el) return;

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

  setParameters(
    wavelengthNm: number,
    opticalFidelity: number,
    anomalyProgress: number,
    shift = 1,
    fractalStage = shift,
    anomalyBleed = 0,
    skyShellCoverage?: number,
    constellationGuideAlpha?: number
  ): void {
    this.wavelengthNm = THREE.MathUtils.clamp(wavelengthNm, 200, 1800);
    this.opticalFidelity = opticalFidelity;
    this.anomalyProgress = THREE.MathUtils.clamp(anomalyProgress / 100, 0, 1);
    this.currentShift = THREE.MathUtils.clamp(Math.round(shift), 1, 6);
    this.targetSkySurveyTier = this.currentShift;
    this.targetFractalStage = THREE.MathUtils.clamp(fractalStage, 1, 6);
    this.anomalyBleed = THREE.MathUtils.clamp(anomalyBleed, 0, 1);
    const shiftDef = (shiftsData.shifts as Array<{
      shift: number;
      anomalyPhase?: { skyShellCoverage?: number };
      skyRevealTier?: { constellationGuideAlpha?: number };
    }>).find((s) => s.shift === this.currentShift);
    this.skyShellCoverage =
      skyShellCoverage ?? shiftDef?.anomalyPhase?.skyShellCoverage ?? 0;
    this.constellationGuideAlpha =
      constellationGuideAlpha ?? shiftDef?.skyRevealTier?.constellationGuideAlpha ?? 0.3;
  }

  setDecodedTargetIds(ids: ReadonlySet<string>, justDecodedId?: string): void {
    this.decodedTargetIds = new Set(ids);
    if (justDecodedId) {
      this.justDecodedId = justDecodedId;
      this.decodePulseUntil = performance.now() + 1200;
    }
    this.syncDecodedStarUniforms();
  }

  private syncDecodedStarUniforms(): void {
    if (!this.starMat) return;
    const dirs = this.starMat.uniforms.uDecodedDirs.value as THREE.Vector3[];
    let count = 0;
    for (const id of this.decodedTargetIds) {
      if (count >= MAX_DECODED_DIRS) break;
      const dir = this.anomalyDirs.get(id);
      if (dir) {
        dirs[count].copy(dir);
        count++;
      }
    }
    this.starMat.uniforms.uDecodedCount.value = count;
  }

  private computeTargetBleed(spec: AnomalySpec): number {
    const role = spec.anomalyRole ?? 'baseline';
    const stageNorm = THREE.MathUtils.clamp((this.fractalStage - 1) / 5, 0, 1);
    if (role === 'direct_anomaly') {
      return THREE.MathUtils.clamp(Math.max(this.anomalyBleed, stageNorm * 0.85 + this.anomalyProgress * 0.25), 0, 1);
    }
    if (role === 'boundary_bleed') {
      return THREE.MathUtils.clamp(Math.max(this.anomalyBleed * 0.7, stageNorm * 0.52), 0, 1);
    }
    return THREE.MathUtils.clamp(this.anomalyBleed * 0.2, 0, 1);
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
    this.syncVisiblePlatePrefetch();
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
      if (this.camera) {
        this.camera.fov = clampedFov;
        this.camera.updateProjectionMatrix();
        this.applyCameraOrientation();
      }
    }
  }

  pullInToTarget1(): void {
    this.ambientDrift = false;
    // Start slightly wider for an unhurried ceremonial pull into the deep-sky view
    this.fovDeg = Math.max(this.fovDeg, 68);
    if (this.camera) {
      this.camera.fov = this.fovDeg;
      this.camera.updateProjectionMatrix();
    }
    // Shortest angular path from current drifting yaw to RA 22°
    const delta = ((((22 - this.yawDeg) % 360) + 540) % 360) - 180;
    this.targetYawDeg = this.yawDeg + delta;
    this.targetPitchDeg = -6;
    this.targetFovDeg = 54;
    this.introPullUntil = performance.now() + 3400;
  }

  private isTargetVisible(id: string): boolean {
    return this.visibleTargetIds === null || this.visibleTargetIds.has(id);
  }

  private isOuterFlankAmbient(id: string): boolean {
    if (this.ambientDrift || this.isTargetVisible(id)) return false;
    const nextShiftTargets = SHIFT_ALL_MAP.get(this.currentShift + 1);
    return nextShiftTargets ? nextShiftTargets.has(id) : false;
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
    this.transitionBoostUntil = performance.now() + 1550;
  }

  triggerPullbackArrival(): void {
    const restoreFov = THREE.MathUtils.clamp(this.preDiveFovDeg || 54, 12, 72);
    this.fovDeg = Math.max(8, Math.min(18, restoreFov * 0.42));
    this.targetFovDeg = restoreFov;
    this.transitionBoostUntil = performance.now() + 1050;
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
    this.visibleProjectedMarkers.length = 0;
    if (this.ambientDrift || !this.camera) return this.visibleProjectedMarkers;
    const cam = this.camera;
    const requiredSet = SHIFT_REQUIRED_MAP.get(this.currentShift);
    this._camForward.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();

    for (let i = 0; i < this.anomalySpecs.length; i++) {
      const spec = this.anomalySpecs[i];
      if (!this.isTargetVisible(spec.id)) continue;
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
      out.scaleClass = spec.scaleClass ?? 'star_system';
      out.anomalyRole = spec.anomalyRole ?? 'baseline';
      out.isRequired = requiredSet ? requiredSet.has(spec.id) : false;
      out.isDecoded = this.decodedTargetIds.has(spec.id);
      out.anomalyBleed = this.computeTargetBleed(spec);
      this.visibleProjectedMarkers.push(out);
    }
    return this.visibleProjectedMarkers;
  }

  private loop = (): void => {
    if (!this.active || !this.renderer || !this.scene || !this.camera || !this.skyMat || !this.starMat) return;
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
      now < this.transitionBoostUntil
        ? 11.0
        : now < this.introPullUntil
          ? 3.4
          : this.ambientDrift
            ? 2.4
            : pacing.optics.panDampRate;
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

    const tierDamp = 1 - Math.exp(-3.2 * dt);
    this.skySurveyTier += (this.targetSkySurveyTier - this.skySurveyTier) * tierDamp;
    this.fractalStage += (this.targetFractalStage - this.fractalStage) * tierDamp;
    const surveyCosEdge = computeSurveyCosEdge(this.skySurveyTier);

    this.skyMat.uniforms.uTime.value = elapsed;
    this.skyMat.uniforms.uWavelengthNorm.value = waveNorm;
    this.skyMat.uniforms.uOpticalFidelity.value = this.opticalFidelity;
    this.skyMat.uniforms.uAnomalyProgress.value = this.anomalyProgress;
    this.skyMat.uniforms.uFractalStage.value = this.fractalStage;
    if (this.skyMat.uniforms.uShellCoverage) {
      this.skyMat.uniforms.uShellCoverage.value = this.skyShellCoverage;
    }
    if (this.skyMat.uniforms.uConstellationGuideAlpha) {
      this.skyMat.uniforms.uConstellationGuideAlpha.value = this.constellationGuideAlpha;
    }
    this.skyMat.uniforms.uSurveyCosEdge.value = surveyCosEdge;

    this.starMat.uniforms.uTime.value = elapsed;
    this.starMat.uniforms.uFovScale.value = zoomFactor;
    this.starMat.uniforms.uWavelengthNorm.value = waveNorm;
    this.starMat.uniforms.uSkySurveyTier.value = this.skySurveyTier;
    this.starMat.uniforms.uSurveyCosEdge.value = surveyCosEdge;

    this._camForward.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    let bestSpec: AnomalySpec | null = null;
    let bestAlign = 0;
    let bestWaveMatch = 0;

    for (const spec of this.anomalySpecs) {
      const activeVisible = this.isTargetVisible(spec.id);
      const ambientFlank = this.isOuterFlankAmbient(spec.id);
      const renderVisible = activeVisible || ambientFlank;
      const mesh = this.anomalyMeshes.get(spec.id);
      if (mesh) mesh.visible = renderVisible;
      if (!renderVisible) continue;

      const dir = this.anomalyDirs.get(spec.id)!;
      const angleDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(this._camForward.dot(dir), -1, 1)));
      const align = THREE.MathUtils.clamp(1 - angleDeg / Math.max(5.5, this.fovDeg * 0.30), 0, 1);
      const waveDiff = Math.abs(this.wavelengthNm - spec.optimalWavelengthNm);
      const waveMatch = THREE.MathUtils.clamp(1 - waveDiff / spec.wavelengthToleranceNm, 0, 1);

      if (spec.id !== 'sol_centauri_bearing' && spec.plateId && angleDeg < this.fovDeg * 0.95) {
        this.requestPlateTexture(spec.plateId);
      }

      const mat = this.anomalyMats.get(spec.id)!;
      mat.uniforms.uTime.value = elapsed;
      mat.uniforms.uWavelengthMatch.value = activeVisible ? waveMatch : Math.max(waveMatch, 0.35);
      mat.uniforms.uOpticalFidelity.value = this.opticalFidelity;
      mat.uniforms.uZoomFactor.value = zoomFactor;
      mat.uniforms.uFractalStage.value = this.fractalStage;
      mat.uniforms.uAnomalyProgress.value = this.anomalyProgress;
      mat.uniforms.uAnomalyBleed.value = this.computeTargetBleed(spec);
      mat.uniforms.uDecoded.value = this.decodedTargetIds.has(spec.id) ? 1.0 : 0.0;
      mat.uniforms.uDecodePulse.value =
        spec.id === this.justDecodedId && now < this.decodePulseUntil
          ? THREE.MathUtils.clamp((this.decodePulseUntil - now) / 1200, 0, 1)
          : 0.0;
      mat.uniforms.uAmbientScale.value = activeVisible ? 1.0 : 0.26;

      if (activeVisible && !this.ambientDrift && align > bestAlign) {
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
      const rate = 0.46 * (0.65 + 0.6 * this.opticalFidelity) * pacing.optics.targetLockRateMultiplier;
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
    this.disposed = true;
    this.setActive(false);
    if (!this.initialized) return;
    window.removeEventListener('resize', this.onResizeBound);
    this.skyNoiseRT?.dispose();
    this.skyNoiseRT = null;
    for (const g of this.disposableGeos) g.dispose();
    for (const m of this.disposableMats) m.dispose();
    for (const entry of this.plateTexCache.values()) entry.tex.dispose();
    this.disposableGeos.length = 0;
    this.disposableMats.length = 0;
    this.plateTexCache.clear();
    this.plateLoadInFlight.clear();
    this.anomalyMats.clear();
    this.renderer?.dispose();
    this.renderer = null;
  }
}
