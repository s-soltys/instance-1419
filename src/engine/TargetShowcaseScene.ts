import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { platform } from '../platform/PlatformAdapter';
import type {
  CameraKeyframe,
  Interactive3DHandle,
  Minigame3DConfig,
  Minigame3DPropRig,
  ShowcaseCouplingUpdate,
  ShowcaseInstrumentBridge,
} from './minigames/types';
import type { AnomalySpec, RendererPerfInfo, ShowcaseType } from './OpticsScene';
import {
  ACCRETION_DISK_FRAGMENT,
  ACCRETION_DISK_VERTEX,
  CLUSTER_STAR_FRAGMENT,
  CLUSTER_STAR_VERTEX,
  CORONA_FRAGMENT,
  CORONA_VERTEX,
  EINSTEIN_SHELL_FRAGMENT,
  EINSTEIN_SHELL_VERTEX,
  HORIZON_SPHERE_FRAGMENT,
  HORIZON_SPHERE_VERTEX,
  NEBULA_PUFF_FRAGMENT,
  NEBULA_PUFF_VERTEX,
  OPTICAL_POLISH_SHADER,
  PLANET_FRAGMENT,
  PLANET_VERTEX,
  POLAR_JET_FRAGMENT,
  POLAR_JET_VERTEX,
  RING_FRAGMENT,
  RING_VERTEX,
  SHOCK_SHELL_FRAGMENT,
  STAR_PLASMA_FRAGMENT,
  STAR_PLASMA_VERTEX,
} from './shaders/showcaseShaders';

interface OrbitingBody {
  mesh: THREE.Object3D;
  radius: number;
  speed: number;
  phase: number;
  inclination: number;
  selfSpin: number;
}

export type ShowcaseZoomStage = 'OVERVIEW' | 'MID ORBIT' | 'CLOSE-UP' | 'CORE';

export interface ShowcaseTelemetry {
  targetId: string;
  zoomNorm: number; // 0 = OVERVIEW (46), 1 = CORE (8.5)
  zoomX: number;
  zoomStage: ShowcaseZoomStage;
  scaleText: string;
  yawDeg: number;
  pitchDeg: number;
}

interface CachedShowcaseRig {
  type: ShowcaseType;
  group: THREE.Group;
  shaderMats: THREE.ShaderMaterial[];
  orbitingBodies: OrbitingBody[];
  companionStar: OrbitingBody | null;
  spinObjects: { obj: THREE.Object3D; speedX: number; speedY: number }[];
  defaultYaw: number;
  defaultPitch: number;
  defaultDist: number;
}

const MIN_DIST = 8.5;
const MAX_DIST = 46.0;

/**
 * Interactive 100% True-3D Deep-Target Showcase renderer.
 * Every target is built from full 3D volumetric geometry and shaders so rotating
 * 360 degrees around any star system, galaxy cluster, nebula, or pulsar looks
 * spatially rich from every angle—with zero flat screenshot planes.
 */
export class TargetShowcaseScene {
  private readonly container: HTMLElement;
  private readonly onResizeBound = () => this.resize();
  private initialized = false;
  private disposed = false;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rootGroup = new THREE.Group();
  private ambientStarsPoints: THREE.Points | null = null;
  private readonly rigCache = new Map<ShowcaseType, CachedShowcaseRig>();
  private nebulaPuffAtlas: THREE.DataTexture | null = null;
  private transitionBurst = 0.0;

  private orbitYaw = 0.35;
  private orbitPitch = 0.24;
  private orbitDist = 28;
  private targetYaw = 0.35;
  private targetPitch = 0.24;
  private targetDist = 28;

  private waveBand = 0.33;
  private opticalFidelity = 0.55;
  private active = false;
  private desiredActive = false;
  private rafId = 0;
  private lastFrameMs = performance.now();

  // Lightweight Single-Pass Minigame 3D Backdrop Mode state
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

  private isDragging = false;
  private lastX = 0;
  private lastY = 0;
  private activePointers = new Map<number, { x: number; y: number }>();
  private pinchStartDist = 0;
  private pinchStartOrbitDist = 28;

  private currentSpec: AnomalySpec | null = null;
  private defaultYaw = 0.35;
  private defaultPitch = 0.24;
  private defaultDist = 28;
  private readonly onTelemetry?: (t: ShowcaseTelemetry) => void;

  private shaderMats: THREE.ShaderMaterial[] = [];
  private instrumentOverlayGroup = new THREE.Group();
  private instrumentSonarPulses: Array<{ mesh: THREE.Mesh; age: number; maxAge: number }> = [];
  private instrumentPatch = {
    progress: 0,
    dustPeel: 0,
    slicePlaneZ: -15,
    unwarpProgress: 0,
    ringTwist: 0,
    seamReveal: 0,
    jetResonance: 0,
    blinkFlip: false,
    blinkMix: 0,
    humanity: 70,
    rawResidual: false,
    haloOffsets: [
      [0, 0, 0] as [number, number, number],
      [0.32, 0.14, 0] as [number, number, number],
      [-0.28, -0.2, 0] as [number, number, number],
    ],
    shearAngle: 0.4,
    shearMag: 0.25,
    fringeContrast: 0,
    fringePhase: 0,
  };
  private decodedTargets = new Map<string, ShowcaseCouplingUpdate>();
  private registeredHandles = new Map<string, Interactive3DHandle>();
  private activeHandleId: string | null = null;
  private hoveredHandleId: string | null = null;
  private dragPlane = new THREE.Plane();
  private dragStartWorld = new THREE.Vector3();
  private dragLastWorld = new THREE.Vector3();
  private pointerDownPos = { x: 0, y: 0 };
  private handleMoved = false;
  private raycaster = new THREE.Raycaster();
  private activeCameraKeyframe: CameraKeyframe | null = null;
  private targetLookAt = new THREE.Vector3(0, 0, 0);
  private currentLookAt = new THREE.Vector3(0, 0, 0);

  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private polishPass: ShaderPass | null = null;
  private bloomEnabled = true;
  private frameAvgMs = 16;
  private showcaseFrameCount = 0;
  private lastRafMs = 0;
  private lastVibeHapticMs = 0;

  private orbitingBodies: OrbitingBody[] = [];
  private companionStar: OrbitingBody | null = null;
  private spinObjects: { obj: THREE.Object3D; speedX: number; speedY: number }[] = [];
  private softPointTexture: THREE.CanvasTexture | null = null;

  constructor(container: HTMLElement, onTelemetry?: (t: ShowcaseTelemetry) => void) {
    this.container = container;
    this.onTelemetry = onTelemetry;
  }

  private ensureInitialized(): void {
    if (this.initialized || this.disposed) return;
    this.initialized = true;

    const w = Math.max(1, this.container.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight || 720);

    const scene = new THREE.Scene();
    scene.add(this.rootGroup);
    this.minigameBackdropGroup.visible = false;
    this.minigameBackdropGroup.add(this.minigamePropRigGroup);
    scene.add(this.minigameBackdropGroup);

    const camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 400);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    const maxDpr = this.isCoarsePointer ? 1.5 : 2;
    this.currentAppliedDpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(this.currentAppliedDpr);
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.className = 'showcase-canvas';
    renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
    this.container.appendChild(renderer.domElement);

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    this.addAmbientBackdropStars(1400);
    this.initPostProcessing();
    this.bindEvents();
  }

  private initPostProcessing(): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    try {
      const w = Math.max(1, this.container.clientWidth || window.innerWidth || 1280);
      const h = Math.max(1, this.container.clientHeight || window.innerHeight || 720);
      const composer = new EffectComposer(this.renderer);
      const renderPass = new RenderPass(this.scene, this.camera);
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.max(1, Math.floor(w * 0.5)), Math.max(1, Math.floor(h * 0.5))),
        0.52,
        0.42,
        0.82
      );
      const polishPass = new ShaderPass(OPTICAL_POLISH_SHADER);
      composer.addPass(renderPass);
      composer.addPass(bloomPass);
      composer.addPass(polishPass);
      this.composer = composer;
      this.bloomPass = bloomPass;
      this.polishPass = polishPass;
    } catch {
      this.composer = null;
      this.bloomPass = null;
      this.polishPass = null;
    }
  }

  triggerArrivalPullIn(): void {
    this.orbitDist = Math.min(MAX_DIST, this.defaultDist * 1.62);
    this.targetDist = this.defaultDist;
    this.orbitYaw = this.defaultYaw - 0.36;
    this.targetYaw = this.defaultYaw;
    this.transitionBurst = 1.0;
  }

  triggerDeparturePullOut(): void {
    this.targetDist = Math.min(MAX_DIST, this.defaultDist * 1.55);
    this.transitionBurst = 0.85;
  }

  loadTarget(spec: AnomalySpec, opticalFidelity: number): void {
    this.ensureInitialized();
    this.currentSpec = spec;
    this.opticalFidelity = opticalFidelity;
    this.waveBand = THREE.MathUtils.clamp((spec.optimalWavelengthNm - 200) / 1600, 0, 1);
    this.showcaseFrameCount = 0;
    this.lastRafMs = 0;

    this.clearOverlayGroup();
    for (const r of this.rigCache.values()) {
      r.group.visible = false;
    }

    const rig = this.getOrBuildRig(spec.showcaseType);
    rig.group.visible = true;
    this.shaderMats = rig.shaderMats;
    this.orbitingBodies = rig.orbitingBodies;
    this.companionStar = rig.companionStar;
    this.spinObjects = rig.spinObjects;
    this.defaultYaw = rig.defaultYaw;
    this.defaultPitch = rig.defaultPitch;
    this.defaultDist = rig.defaultDist;

    for (const m of this.shaderMats) {
      if (m.uniforms.uPixelRatio) m.uniforms.uPixelRatio.value = this.currentAppliedDpr;
    }

    this.activeCameraKeyframe = null;
    this.targetLookAt.set(0, 0, 0);
    this.currentLookAt.set(0, 0, 0);
    this.orbitYaw = this.defaultYaw;
    this.orbitPitch = this.defaultPitch;
    this.orbitDist = this.defaultDist;
    this.targetYaw = this.defaultYaw;
    this.targetPitch = this.defaultPitch;
    this.targetDist = this.defaultDist;

    // Hydrate persistent decoded visual state if already solved earlier
    const savedPatch = this.decodedTargets.get(spec.id);
    if (savedPatch) {
      this.applyPatchObject(savedPatch);
    } else {
      this.applyPatchObject({
        progress: 0,
        dustPeel: 0,
        slicePlaneZ: -15,
        unwarpProgress: 0,
        ringTwist: 0,
        seamReveal: 0,
        jetResonance: 0,
        blinkFlip: false,
        blinkMix: 0,
      });
    }
  }

  private getOrBuildRig(type: ShowcaseType): CachedShowcaseRig {
    const cached = this.rigCache.get(type);
    if (cached) return cached;

    const group = new THREE.Group();
    const rig: CachedShowcaseRig = {
      type,
      group,
      shaderMats: [],
      orbitingBodies: [],
      companionStar: null,
      spinObjects: [],
      defaultYaw: 0.35,
      defaultPitch: 0.24,
      defaultDist: 28,
    };
    this.rootGroup.add(group);

    // Temporarily route builders into this rig's group & arrays
    const prevMats = this.shaderMats;
    const prevBodies = this.orbitingBodies;
    const prevComp = this.companionStar;
    const prevSpins = this.spinObjects;
    this.shaderMats = rig.shaderMats;
    this.orbitingBodies = rig.orbitingBodies;
    this.companionStar = null;
    this.spinObjects = rig.spinObjects;

    if (type === 'star_system') {
      rig.defaultYaw = 0.42;
      rig.defaultPitch = 0.42;
      rig.defaultDist = 30;
      this.buildStarSystemShowcase(group);
      this.addSpatialReferenceRing(22, '#ebb062', group);
    } else if (type === 'nebula') {
      rig.defaultYaw = 0.32;
      rig.defaultPitch = 0.18;
      rig.defaultDist = 24;
      this.buildNebulaShowcase(group);
      this.addSpatialReferenceRing(13.5, '#f49d6a', group);
    } else if (type === 'deep_field') {
      rig.defaultYaw = 0.48;
      rig.defaultPitch = 0.28;
      rig.defaultDist = 25;
      this.buildDeepFieldPulsarShowcase(group);
      this.addSpatialReferenceRing(15.5, '#7ec8e8', group);
    } else if (type === 'antipodal_poles') {
      rig.defaultYaw = 0.25;
      rig.defaultPitch = 0.22;
      rig.defaultDist = 26;
      this.buildAntipodalPolesShowcase(group);
      this.addSpatialReferenceRing(16.5, '#9ee8ff', group);
    } else {
      rig.defaultYaw = 0.38;
      rig.defaultPitch = 0.24;
      rig.defaultDist = 26;
      this.buildGravLensShowcase(type, group);
      this.addSpatialReferenceRing(17.5, '#7ec8e8', group);
    }

    rig.companionStar = this.companionStar;
    this.shaderMats = prevMats;
    this.orbitingBodies = prevBodies;
    this.companionStar = prevComp;
    this.spinObjects = prevSpins;

    this.rigCache.set(type, rig);
    return rig;
  }

  zoomBy(factor: number): void {
    this.targetDist = THREE.MathUtils.clamp(this.targetDist * factor, MIN_DIST, MAX_DIST);
  }

  resetView(): void {
    this.targetYaw = this.defaultYaw;
    this.targetPitch = this.defaultPitch;
    this.targetDist = this.defaultDist;
  }

  private addSpatialReferenceRing(radius: number, colorHex: string, targetGroup: THREE.Group = this.rootGroup): void {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.16,
    });
    targetGroup.add(new THREE.LineLoop(geo, mat));

    // 4 subtle cardinal calibration ticks on the equatorial plane
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const tickPts = [
        new THREE.Vector3(Math.cos(a) * (radius - 0.8), 0, Math.sin(a) * (radius - 0.8)),
        new THREE.Vector3(Math.cos(a) * (radius + 0.8), 0, Math.sin(a) * (radius + 0.8)),
      ];
      const tickGeo = new THREE.BufferGeometry().setFromPoints(tickPts);
      const tickMat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.34,
      });
      targetGroup.add(new THREE.Line(tickGeo, tickMat));
    }
  }

  setWaveBand(band01: number): void {
    this.waveBand = THREE.MathUtils.clamp(band01, 0, 1);
  }

  setOpticalFidelity(fid: number): void {
    this.opticalFidelity = fid;
  }

  private applyPatchObject(patch: ShowcaseCouplingUpdate): void {
    if (patch.progress !== undefined) this.instrumentPatch.progress = patch.progress;
    if (patch.dustPeel !== undefined) this.instrumentPatch.dustPeel = patch.dustPeel;
    if (patch.slicePlaneZ !== undefined) this.instrumentPatch.slicePlaneZ = patch.slicePlaneZ;
    if (patch.unwarpProgress !== undefined) this.instrumentPatch.unwarpProgress = patch.unwarpProgress;
    if (patch.ringTwist !== undefined) this.instrumentPatch.ringTwist = patch.ringTwist;
    if (patch.seamReveal !== undefined) this.instrumentPatch.seamReveal = patch.seamReveal;
    if (patch.jetResonance !== undefined) this.instrumentPatch.jetResonance = patch.jetResonance;
    if (patch.blinkFlip !== undefined) {
      this.instrumentPatch.blinkFlip = patch.blinkFlip;
      if (patch.blinkMix === undefined) {
        this.instrumentPatch.blinkMix = patch.blinkFlip ? 1 : 0;
      }
    }
    if (patch.blinkMix !== undefined) this.instrumentPatch.blinkMix = patch.blinkMix;
    if (patch.humanity !== undefined) this.instrumentPatch.humanity = patch.humanity;
    if (patch.rawResidual !== undefined) this.instrumentPatch.rawResidual = patch.rawResidual;
    if (patch.haloOffsets !== undefined) this.instrumentPatch.haloOffsets = patch.haloOffsets;
    if (patch.shearAngle !== undefined) this.instrumentPatch.shearAngle = patch.shearAngle;
    if (patch.shearMag !== undefined) this.instrumentPatch.shearMag = patch.shearMag;
    if (patch.fringeContrast !== undefined) this.instrumentPatch.fringeContrast = patch.fringeContrast;
    if (patch.fringePhase !== undefined) this.instrumentPatch.fringePhase = patch.fringePhase;
    if (patch.dollyDelta) {
      this.targetDist = THREE.MathUtils.clamp(this.targetDist + patch.dollyDelta, 5, 58);
    }
    this.syncInstrumentUniforms();
  }

  getInstrumentBridge(): ShowcaseInstrumentBridge {
    return {
      applyInstrumentPatch: (patch: ShowcaseCouplingUpdate) => {
        this.applyPatchObject(patch);
      },
      trigger3DSonarPulse: (originX: number, originY: number, bandIdx = 1) => {
        if (!this.camera) return;
        if (!this.instrumentOverlayGroup.parent) {
          this.rootGroup.add(this.instrumentOverlayGroup);
        }
        const geo = new THREE.RingGeometry(0.45, 0.72, 48);
        const cols = ['#82c8ff', '#ffcf88', '#ff9e64', '#ff6454'];
        const mat = new THREE.MeshBasicMaterial({
          color: cols[bandIdx % cols.length],
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(originX * 14, originY * 8, 0);
        mesh.lookAt(this.camera.position);
        this.instrumentOverlayGroup.add(mesh);
        this.instrumentSonarPulses.push({ mesh, age: 0, maxAge: 1.35 });
      },
      add3DBearingVector: (angleRad: number, confidence: number, colorHex = '#ffb86c') => {
        if (!this.instrumentOverlayGroup.parent) {
          this.rootGroup.add(this.instrumentOverlayGroup);
        }
        const len = 18;
        const pts = [
          new THREE.Vector3(-Math.cos(angleRad) * len, -Math.sin(angleRad) * len * 0.65, 0),
          new THREE.Vector3(Math.cos(angleRad) * len, Math.sin(angleRad) * len * 0.65, 0),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: Math.max(0.25, Math.min(0.85, confidence)),
        });
        this.instrumentOverlayGroup.add(new THREE.Line(geo, mat));
      },
      clearInstrumentOverlays: () => {
        this.clearOverlayGroup();
      },
      resetInstrumentState: () => {
        this.activeCameraKeyframe = null;
        this.targetLookAt.set(0, 0, 0);
        this.registeredHandles.clear();
        this.activeHandleId = null;
        const saved = this.currentSpec ? this.decodedTargets.get(this.currentSpec.id) : undefined;
        this.applyPatchObject(
          saved ?? {
            progress: 0,
            dustPeel: 0,
            slicePlaneZ: -15,
            unwarpProgress: 0,
            ringTwist: 0,
            seamReveal: 0,
            jetResonance: 0,
            blinkFlip: false,
            blinkMix: 0,
          }
        );
        this.clearOverlayGroup();
      },
      getInstrumentGroup: () => {
        if (!this.instrumentOverlayGroup.parent) {
          this.rootGroup.add(this.instrumentOverlayGroup);
        }
        return this.instrumentOverlayGroup;
      },
      register3DHandle: (handle: Interactive3DHandle) => {
        this.registeredHandles.set(handle.id, handle);
        return () => {
          this.registeredHandles.delete(handle.id);
          if (this.activeHandleId === handle.id) this.activeHandleId = null;
          if (this.hoveredHandleId === handle.id) this.hoveredHandleId = null;
        };
      },
      setCameraKeyframe: (kf: CameraKeyframe | null) => {
        this.activeCameraKeyframe = kf;
        if (kf) {
          if (kf.yaw !== undefined) this.targetYaw = kf.yaw;
          if (kf.pitch !== undefined) this.targetPitch = kf.pitch;
          if (kf.dist !== undefined) this.targetDist = kf.dist;
          if (kf.lookAt) this.targetLookAt.set(kf.lookAt[0], kf.lookAt[1], kf.lookAt[2]);
        } else {
          this.targetLookAt.set(0, 0, 0);
        }
      },
      recenterCamera: () => {
        const kf = this.activeCameraKeyframe;
        if (kf) {
          this.targetYaw = kf.yaw ?? this.defaultYaw;
          this.targetPitch = kf.pitch ?? this.defaultPitch;
          this.targetDist = kf.dist ?? this.defaultDist;
          if (kf.lookAt) this.targetLookAt.set(kf.lookAt[0], kf.lookAt[1], kf.lookAt[2]);
        } else {
          this.resetView();
          this.targetLookAt.set(0, 0, 0);
        }
      },
      setVibeState: (humanity: number, rawResidual: boolean) => {
        this.instrumentPatch.humanity = humanity;
        this.instrumentPatch.rawResidual = rawResidual;
        this.syncInstrumentUniforms();
      },
      commitDecodedState: (targetId: string, patch: ShowcaseCouplingUpdate) => {
        this.decodedTargets.set(targetId, { ...patch });
        this.activeCameraKeyframe = null;
        this.targetLookAt.set(0, 0, 0);
        this.registeredHandles.clear();
        this.activeHandleId = null;
        this.clearOverlayGroup();
        this.applyPatchObject(patch);
      },
      projectWorldToScreen: (worldPos: { x: number; y: number; z: number }) => {
        const w = Math.max(1, this.container.clientWidth);
        const h = Math.max(1, this.container.clientHeight);
        if (!this.camera) return { x: w * 0.5, y: h * 0.5, visible: false };
        const v = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z).project(this.camera);
        return {
          x: (v.x * 0.5 + 0.5) * w,
          y: (-v.y * 0.5 + 0.5) * h,
          visible: v.z >= -1 && v.z <= 1,
        };
      },
      setMinigameBackdropMode: (cfg: Minigame3DConfig | null) => {
        this.setMinigameBackdropMode(cfg);
      },
      setMinigameParallax: (nx: number, ny: number, progress01: number) => {
        this.setMinigameParallax(nx, ny, progress01);
      },
    };
  }

  private clearOverlayGroup(): void {
    this.instrumentSonarPulses = [];
    this.registeredHandles.clear();
    this.activeHandleId = null;
    while (this.instrumentOverlayGroup.children.length > 0) {
      const child = this.instrumentOverlayGroup.children[0];
      this.instrumentOverlayGroup.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) m.dispose();
        }
      });
    }
  }

  private syncInstrumentUniforms(): void {
    const vibeCold = this.instrumentPatch.humanity <= 44 ? 1.0 : this.instrumentPatch.humanity < 65 ? 0.35 : 0.0;
    const rawVal = this.instrumentPatch.rawResidual ? 1.0 : 0.0;
    for (const m of this.shaderMats) {
      if (m.uniforms.uDustPeel) m.uniforms.uDustPeel.value = this.instrumentPatch.dustPeel;
      if (m.uniforms.uSlicePlaneZ) m.uniforms.uSlicePlaneZ.value = this.instrumentPatch.slicePlaneZ;
      if (m.uniforms.uUnwarpProgress) m.uniforms.uUnwarpProgress.value = this.instrumentPatch.unwarpProgress;
      if (m.uniforms.uRingTwist) m.uniforms.uRingTwist.value = this.instrumentPatch.ringTwist;
      if (m.uniforms.uSeamReveal) m.uniforms.uSeamReveal.value = this.instrumentPatch.seamReveal;
      if (m.uniforms.uJetResonance) m.uniforms.uJetResonance.value = this.instrumentPatch.jetResonance;
      if (m.uniforms.uVibeCold) m.uniforms.uVibeCold.value = vibeCold;
      if (m.uniforms.uRawResidual) m.uniforms.uRawResidual.value = rawVal;
      if (m.uniforms.uBlinkMix) m.uniforms.uBlinkMix.value = this.instrumentPatch.blinkMix;
      if (m.uniforms.uShearAngle) m.uniforms.uShearAngle.value = this.instrumentPatch.shearAngle;
      if (m.uniforms.uShearMag) m.uniforms.uShearMag.value = this.instrumentPatch.shearMag;
      if (m.uniforms.uHalo0 && this.instrumentPatch.haloOffsets[0]) {
        m.uniforms.uHalo0.value.set(this.instrumentPatch.haloOffsets[0][0], this.instrumentPatch.haloOffsets[0][1]);
      }
      if (m.uniforms.uHalo1 && this.instrumentPatch.haloOffsets[1]) {
        m.uniforms.uHalo1.value.set(this.instrumentPatch.haloOffsets[1][0], this.instrumentPatch.haloOffsets[1][1]);
      }
      if (m.uniforms.uHalo2 && this.instrumentPatch.haloOffsets[2]) {
        m.uniforms.uHalo2.value.set(this.instrumentPatch.haloOffsets[2][0], this.instrumentPatch.haloOffsets[2][1]);
      }
    }
    if (this.bloomPass) {
      this.bloomPass.strength = vibeCold > 0.8 ? 0.36 : 0.58;
      this.bloomPass.threshold = vibeCold > 0.8 ? 0.88 : 0.78;
    }
    if (this.polishPass) {
      this.polishPass.uniforms.uVibeCold.value = vibeCold;
      this.polishPass.uniforms.uRawResidual.value = rawVal;
      this.polishPass.uniforms.uRegFilm.value = vibeCold > 0.8 && !this.instrumentPatch.rawResidual ? 0.85 : 0.0;
    }
  }

  private clearRigCache(): void {
    this.shaderMats = [];
    this.orbitingBodies = [];
    this.companionStar = null;
    this.spinObjects = [];
    this.clearOverlayGroup();

    if (this.ambientStarsPoints) {
      this.rootGroup.remove(this.ambientStarsPoints);
      this.ambientStarsPoints.geometry.dispose();
      (this.ambientStarsPoints.material as THREE.Material).dispose();
      this.ambientStarsPoints = null;
    }

    for (const rig of this.rigCache.values()) {
      this.rootGroup.remove(rig.group);
      rig.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) m.dispose();
        }
      });
    }
    this.rigCache.clear();
  }

  private getNebulaPuffAtlas(): THREE.DataTexture {
    if (this.nebulaPuffAtlas) return this.nebulaPuffAtlas;
    const size = 256;
    const half = 128;
    const data = new Uint8Array(size * size * 4);

    const hash21 = (x: number, y: number): number => {
      let px = (x * 127.1 + y * 311.7) % 43758.5453;
      px = px - Math.floor(px);
      let py = (x * 269.5 + y * 183.3) % 43758.5453;
      py = py - Math.floor(py);
      const d = px * (px + 19.19) + py * (py + 19.19);
      const prod = (px + d) * (py + d);
      return prod - Math.floor(prod);
    };
    const noise2 = (x: number, y: number): number => {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      let fx = x - ix;
      let fy = y - iy;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      const a = hash21(ix, iy);
      const b = hash21(ix + 1, iy);
      const c = hash21(ix, iy + 1);
      const d = hash21(ix + 1, iy + 1);
      return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
    };
    const fbm2 = (x: number, y: number): number => {
      let v = 0;
      let amp = 0.5;
      let px = x;
      let py = y;
      for (let i = 0; i < 4; i++) {
        v += amp * noise2(px, py);
        px = px * 2.06 + 2.3;
        py = py * 2.06 + 1.7;
        amp *= 0.5;
      }
      return v;
    };

    for (let qy = 0; qy < 2; qy++) {
      for (let qx = 0; qx < 2; qx++) {
        const seedOffset = (qy * 2 + qx) * 7.31 + 1.17;
        for (let ly = 0; ly < half; ly++) {
          const ny = (ly / (half - 1)) * 2 - 1;
          for (let lx = 0; lx < half; lx++) {
            const nx = (lx / (half - 1)) * 2 - 1;
            const n = fbm2(nx * 2.4 + seedOffset * 1.9, ny * 2.4 + seedOffset * 0.7);
            const byteVal = Math.max(0, Math.min(255, Math.round(n * 255)));
            const gx = qx * half + lx;
            const gy = qy * half + ly;
            const idx = (gy * size + gx) * 4;
            data[idx] = byteVal;
            data[idx + 1] = byteVal;
            data[idx + 2] = byteVal;
            data[idx + 3] = 255;
          }
        }
      }
    }

    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.nebulaPuffAtlas = tex;
    return tex;
  }

  private makeRng(seedStart: number): () => number {
    let s = seedStart >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  private createStarPoints(
    positions: Float32Array,
    colors: Float32Array,
    sizes: Float32Array,
    phases: Float32Array
  ): THREE.Points {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: CLUSTER_STAR_VERTEX,
      fragmentShader: CLUSTER_STAR_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWaveBand: { value: this.waveBand },
        uPixelRatio: { value: this.currentAppliedDpr },
        uDustPeel: { value: this.instrumentPatch.dustPeel },
        uSlicePlaneZ: { value: this.instrumentPatch.slicePlaneZ },
        uJetResonance: { value: this.instrumentPatch.jetResonance },
        uVibeCold: { value: 0 },
      },
    });
    this.shaderMats.push(mat);
    return new THREE.Points(geo, mat);
  }

  private addAmbientBackdropStars(count: number): void {
    const rand = this.makeRng(918273);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const r = 55 + rand() * 85;
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
    const mat = new THREE.PointsMaterial({
      size: 0.34,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    this.ambientStarsPoints = new THREE.Points(geo, mat);
    this.rootGroup.add(this.ambientStarsPoints);
  }

  private addOuterHorizonSphere(isPulsar: boolean, targetGroup: THREE.Group): void {
    const mat = new THREE.ShaderMaterial({
      vertexShader: HORIZON_SPHERE_VERTEX,
      fragmentShader: HORIZON_SPHERE_FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWaveBand: { value: this.waveBand },
        uOpticalFidelity: { value: this.opticalFidelity },
        uIsPulsar: { value: isPulsar ? 1.0 : 0.0 },
        uSeamReveal: { value: this.instrumentPatch.seamReveal },
        uJetResonance: { value: this.instrumentPatch.jetResonance },
        uVibeCold: { value: 0 },
        uRawResidual: { value: 0 },
      },
    });
    this.shaderMats.push(mat);
    targetGroup.add(new THREE.Mesh(new THREE.SphereGeometry(54, 48, 32), mat));
  }

  private buildStarSystemShowcase(targetGroup: THREE.Group): void {
    const sunMat = new THREE.ShaderMaterial({
      vertexShader: STAR_PLASMA_VERTEX,
      fragmentShader: STAR_PLASMA_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uWaveBand: { value: this.waveBand },
        uVibeCold: { value: 0 },
        uBaseColor: { value: new THREE.Color('#f7a23b') },
      },
    });
    this.shaderMats.push(sunMat);
    targetGroup.add(new THREE.Mesh(new THREE.SphereGeometry(3.8, 64, 64), sunMat));

    const coronaMat = new THREE.ShaderMaterial({
      vertexShader: CORONA_VERTEX,
      fragmentShader: CORONA_FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWaveBand: { value: this.waveBand },
        uColor: { value: new THREE.Color('#ffaa52') },
      },
    });
    this.shaderMats.push(coronaMat);
    targetGroup.add(new THREE.Mesh(new THREE.SphereGeometry(5.5, 48, 48), coronaMat));

    const planetDefs = [
      {
        radius: 0.42,
        orbit: 8.0,
        speed: 0.36,
        phase: 0.6,
        inc: 0.05,
        colorA: '#6c3024',
        colorB: '#d97043',
        atmo: '#ff8a5c',
        hasAtmo: 0.35,
        bands: 12,
        ringed: false,
      },
      {
        radius: 0.74,
        orbit: 12.8,
        speed: 0.22,
        phase: 2.4,
        inc: -0.04,
        colorA: '#1d4f7a',
        colorB: '#b9dceb',
        atmo: '#7ec8e8',
        hasAtmo: 1.0,
        bands: 18,
        ringed: false,
      },
      {
        radius: 1.18,
        orbit: 18.8,
        speed: 0.13,
        phase: 4.5,
        inc: 0.07,
        colorA: '#7a5838',
        colorB: '#e3be8a',
        atmo: '#ffd49c',
        hasAtmo: 0.45,
        bands: 28,
        ringed: true,
      },
    ];

    for (const def of planetDefs) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * def.orbit, Math.sin(a) * def.orbit * def.inc, Math.sin(a) * def.orbit));
      }
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const orbitMat = new THREE.LineBasicMaterial({
        color: '#88b4d8',
        transparent: true,
        opacity: 0.18,
      });
      targetGroup.add(new THREE.LineLoop(orbitGeo, orbitMat));

      const planetGroup = new THREE.Group();
      const pMat = new THREE.ShaderMaterial({
        vertexShader: PLANET_VERTEX,
        fragmentShader: PLANET_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uColorA: { value: new THREE.Color(def.colorA) },
          uColorB: { value: new THREE.Color(def.colorB) },
          uAtmoColor: { value: new THREE.Color(def.atmo) },
          uHasAtmo: { value: def.hasAtmo },
          uBandFreq: { value: def.bands },
        },
      });
      this.shaderMats.push(pMat);
      planetGroup.add(new THREE.Mesh(new THREE.SphereGeometry(def.radius, 36, 36), pMat));

      if (def.ringed) {
        const ringMat = new THREE.ShaderMaterial({
          vertexShader: RING_VERTEX,
          fragmentShader: RING_FRAGMENT,
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
          uniforms: {
            uColor: { value: new THREE.Color('#e8c89b') },
          },
        });
        this.shaderMats.push(ringMat);
        const ringMesh = new THREE.Mesh(new THREE.PlaneGeometry(def.radius * 4.5, def.radius * 4.5), ringMat);
        ringMesh.rotation.x = Math.PI * 0.42;
        ringMesh.rotation.y = 0.25;
        planetGroup.add(ringMesh);
      }

      targetGroup.add(planetGroup);
      this.orbitingBodies.push({
        mesh: planetGroup,
        radius: def.orbit,
        speed: def.speed,
        phase: def.phase,
        inclination: def.inc,
        selfSpin: 0.4,
      });
    }

    const compMat = new THREE.ShaderMaterial({
      vertexShader: STAR_PLASMA_VERTEX,
      fragmentShader: STAR_PLASMA_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uWaveBand: { value: this.waveBand },
        uVibeCold: { value: 0 },
        uBaseColor: { value: new THREE.Color('#e87842') },
      },
    });
    this.shaderMats.push(compMat);
    const compMesh = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 32), compMat);
    targetGroup.add(compMesh);
    this.companionStar = {
      mesh: compMesh,
      radius: 34,
      speed: 0.04,
      phase: 1.1,
      inclination: 0.14,
      selfSpin: 0.2,
    };
  }

  /**
   * 100% True-3D Sculpted Volumetric Dust-Pillar Nebula (Carina Rift Nursery).
   * Zero flat planes—navigable 360 degrees around 4 curved 3D pillars, glowing
   * ionized gas halo, 2,400 newborn stars, and bipolar outflow jets.
   */
  private buildNebulaShowcase(targetGroup: THREE.Group): void {
    const rand = this.makeRng(441902);
    const puffAtlas = this.getNebulaPuffAtlas();

    // 1. 4 Sculpted 3D Dust Pillar Spines + 260 Volumetric Dust Puffs
    const pillarSpines = [
      { base: new THREE.Vector3(-5.2, -5.8, -1.5), tip: new THREE.Vector3(-2.6, 5.2, 0.8), radius: 2.3 },
      { base: new THREE.Vector3(-0.4, -6.2, 2.8), tip: new THREE.Vector3(0.9, 4.4, -0.6), radius: 2.0 },
      { base: new THREE.Vector3(4.6, -5.5, -2.2), tip: new THREE.Vector3(3.1, 3.8, 1.4), radius: 1.85 },
      { base: new THREE.Vector3(0.0, -6.6, -4.4), tip: new THREE.Vector3(-1.4, 2.4, -2.4), radius: 2.6 },
    ];

    const dustCount = 260;
    const dPos = new Float32Array(dustCount * 3);
    const dSize = new Float32Array(dustCount);
    const dSeed = new Float32Array(dustCount);
    const dKind = new Float32Array(dustCount);
    const scratchCenter = new THREE.Vector3();

    for (let i = 0; i < dustCount; i++) {
      const sp = pillarSpines[i % pillarSpines.length];
      const t = Math.pow(rand(), 0.88);
      scratchCenter.lerpVectors(sp.base, sp.tip, t);
      const spread = sp.radius * (1.2 - t * 0.65);
      const ang = rand() * Math.PI * 2;
      const rad = Math.sqrt(rand()) * spread;
      dPos[i * 3] = scratchCenter.x + Math.cos(ang) * rad;
      dPos[i * 3 + 1] = scratchCenter.y + (rand() - 0.5) * 1.4;
      dPos[i * 3 + 2] = scratchCenter.z + Math.sin(ang) * rad;
      dSize[i] = (2.6 - t * 1.1) * (0.75 + rand() * 0.7);
      dSeed[i] = rand();
      dKind[i] = 0.0;
    }

    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1));
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dSeed, 1));
    dustGeo.setAttribute('aKind', new THREE.BufferAttribute(dKind, 1));
    const dustMat = new THREE.ShaderMaterial({
      vertexShader: NEBULA_PUFF_VERTEX,
      fragmentShader: NEBULA_PUFF_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uPuffAtlas: { value: puffAtlas },
        uTime: { value: 0 },
        uWaveBand: { value: this.waveBand },
        uPixelRatio: { value: this.currentAppliedDpr },
        uDustPeel: { value: this.instrumentPatch.dustPeel },
        uSlicePlaneZ: { value: this.instrumentPatch.slicePlaneZ },
        uJetResonance: { value: this.instrumentPatch.jetResonance },
        uVibeCold: { value: 0 },
      },
    });
    this.shaderMats.push(dustMat);
    targetGroup.add(new THREE.Points(dustGeo, dustMat));

    // 2. Additive Volumetric Ionized Gas Halo (190 3D clouds)
    const gasCount = 190;
    const gPos = new Float32Array(gasCount * 3);
    const gSize = new Float32Array(gasCount);
    const gSeed = new Float32Array(gasCount);
    const gKind = new Float32Array(gasCount);

    for (let i = 0; i < gasCount; i++) {
      const r = 2.0 + rand() * 11.5;
      const theta = rand() * Math.PI * 2;
      const u = (rand() * 2 - 1) * 0.75;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      gPos[i * 3] = r * s * Math.cos(theta);
      gPos[i * 3 + 1] = r * u;
      gPos[i * 3 + 2] = r * s * Math.sin(theta);
      gSize[i] = 3.2 + rand() * 3.8;
      gSeed[i] = rand();
      gKind[i] = 1.0;
    }

    const gasGeo = new THREE.BufferGeometry();
    gasGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
    gasGeo.setAttribute('aSize', new THREE.BufferAttribute(gSize, 1));
    gasGeo.setAttribute('aSeed', new THREE.BufferAttribute(gSeed, 1));
    gasGeo.setAttribute('aKind', new THREE.BufferAttribute(gKind, 1));
    const gasMat = new THREE.ShaderMaterial({
      vertexShader: NEBULA_PUFF_VERTEX,
      fragmentShader: NEBULA_PUFF_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uPuffAtlas: { value: puffAtlas },
        uTime: { value: 0 },
        uWaveBand: { value: this.waveBand },
        uPixelRatio: { value: this.currentAppliedDpr },
        uDustPeel: { value: this.instrumentPatch.dustPeel },
        uSlicePlaneZ: { value: this.instrumentPatch.slicePlaneZ },
        uJetResonance: { value: this.instrumentPatch.jetResonance },
        uVibeCold: { value: 0 },
      },
    });
    this.shaderMats.push(gasMat);
    targetGroup.add(new THREE.Points(gasGeo, gasMat));

    // 3. 2,400 Embedded 3D Newborn Protostars inside & around the pillars
    const starCount = 2400;
    const sPos = new Float32Array(starCount * 3);
    const sCol = new Float32Array(starCount * 3);
    const sSize = new Float32Array(starCount);
    const sPhase = new Float32Array(starCount);
    const nebColA = new THREE.Color('#ffd39e');
    const nebColB = new THREE.Color('#9ec8ff');
    const scratchCol = new THREE.Color();

    for (let i = 0; i < starCount; i++) {
      if (i < 900) {
        const sp = pillarSpines[i % pillarSpines.length];
        const t = 0.25 + rand() * 0.75;
        scratchCenter.lerpVectors(sp.base, sp.tip, t);
        sPos[i * 3] = scratchCenter.x + (rand() - 0.5) * 3.2;
        sPos[i * 3 + 1] = scratchCenter.y + (rand() - 0.5) * 2.8;
        sPos[i * 3 + 2] = scratchCenter.z + (rand() - 0.5) * 3.2;
      } else {
        const r = 3 + rand() * 14;
        const th = rand() * Math.PI * 2;
        const u = rand() * 2 - 1;
        const sq = Math.sqrt(Math.max(0, 1 - u * u));
        sPos[i * 3] = r * sq * Math.cos(th);
        sPos[i * 3 + 1] = r * u;
        sPos[i * 3 + 2] = r * sq * Math.sin(th);
      }

      const hot = rand();
      scratchCol.lerpColors(nebColA, nebColB, hot * 0.7);
      sCol[i * 3] = scratchCol.r;
      sCol[i * 3 + 1] = scratchCol.g;
      sCol[i * 3 + 2] = scratchCol.b;
      sSize[i] = 0.28 + Math.pow(rand(), 5.0) * 1.45;
      sPhase[i] = rand();
    }
    targetGroup.add(this.createStarPoints(sPos, sCol, sSize, sPhase));

    // 4. Twin 3D Bipolar Protostar Jets emerging from two pillar tips
    const jetTips = [
      { pos: new THREE.Vector3(-2.6, 4.8, 0.8), tiltZ: 0.45, tiltX: 0.25 },
      { pos: new THREE.Vector3(3.1, 3.6, 1.4), tiltZ: -0.62, tiltX: -0.3 },
    ];
    for (const jt of jetTips) {
      const jetMat = new THREE.ShaderMaterial({
        vertexShader: POLAR_JET_VERTEX,
        fragmentShader: POLAR_JET_FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uWaveBand: { value: this.waveBand },
          uJetResonance: { value: this.instrumentPatch.jetResonance },
        },
      });
      this.shaderMats.push(jetMat);
      const group = new THREE.Group();
      group.position.copy(jt.pos);
      group.rotation.set(jt.tiltX, 0, jt.tiltZ);
      const coneGeo = new THREE.ConeGeometry(0.45, 4.5, 20, 1, true);
      const c1 = new THREE.Mesh(coneGeo, jetMat);
      c1.position.y = 2.25;
      c1.rotation.x = Math.PI;
      const c2 = new THREE.Mesh(coneGeo.clone(), jetMat);
      c2.position.y = -2.25;
      group.add(c1, c2);
      targetGroup.add(group);
    }

    // 5. 4 Luminous Protostar Landmark Cores nestled inside the pillar tips (clear anchors when zoomed close!)
    for (const sp of pillarSpines) {
      const coreMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 16, 16),
        new THREE.MeshBasicMaterial({ color: '#fff3d6' })
      );
      coreMesh.position.copy(sp.tip);
      targetGroup.add(coreMesh);

      const haloMat = new THREE.ShaderMaterial({
        vertexShader: CORONA_VERTEX,
        fragmentShader: CORONA_FRAGMENT,
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uWaveBand: { value: this.waveBand },
          uColor: { value: new THREE.Color('#ffbd72') },
        },
      });
      this.shaderMats.push(haloMat);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 20), haloMat);
      halo.position.copy(sp.tip);
      targetGroup.add(halo);
    }
  }

  /**
   * 100% True-3D Galaxy Cluster & Spherical Gravitational Lensing Shell (Cluster J1419-A).
   * 16 3D tilted spiral/elliptical galaxies + central glowing BCG core + 3D view-dependent
   * Einstein ring shell + outer spherical horizon enclosure.
   */
  private buildGravLensShowcase(_type: ShowcaseType, targetGroup: THREE.Group): void {
    const rand = this.makeRng(1419723);

    // 1. Central 3D Elliptical Core Galaxy (BCG) — volumetric core + 4,500 spheroid stars
    const coreGlowMat = new THREE.ShaderMaterial({
      vertexShader: CORONA_VERTEX,
      fragmentShader: CORONA_FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWaveBand: { value: this.waveBand },
        uColor: { value: new THREE.Color('#ffd394') },
      },
    });
    this.shaderMats.push(coreGlowMat);
    const coreGlow = new THREE.Mesh(new THREE.SphereGeometry(2.6, 36, 36), coreGlowMat);
    coreGlow.scale.set(1.25, 0.85, 1.05);
    targetGroup.add(coreGlow);

    const totalStars = 15000;
    const pos = new Float32Array(totalStars * 3);
    const col = new Float32Array(totalStars * 3);
    const size = new Float32Array(totalStars);
    const phase = new Float32Array(totalStars);

    const bcgA = new THREE.Color('#fff1d6');
    const bcgB = new THREE.Color('#ffbe73');
    const spiA = new THREE.Color('#ffe2b0');
    const spiB = new THREE.Color('#8ec2ff');
    const ellA = new THREE.Color('#fff0d2');
    const ellB = new THREE.Color('#f7ad62');
    const scratchCol = new THREE.Color();

    let cursor = 0;

    // Central BCG spheroid (4,500 stars)
    for (let i = 0; i < 4500; i++) {
      const r = Math.pow(rand(), 1.8) * 5.2;
      const th = rand() * Math.PI * 2;
      const u = rand() * 2 - 1;
      const sq = Math.sqrt(Math.max(0, 1 - u * u));
      pos[cursor * 3] = r * sq * Math.cos(th) * 1.25;
      pos[cursor * 3 + 1] = r * u * 0.78;
      pos[cursor * 3 + 2] = r * sq * Math.sin(th);

      scratchCol.lerpColors(bcgA, bcgB, Math.min(1, r / 4.5));
      col[cursor * 3] = scratchCol.r;
      col[cursor * 3 + 1] = scratchCol.g;
      col[cursor * 3 + 2] = scratchCol.b;
      size[cursor] = 0.25 + Math.pow(rand(), 4.5) * 1.1;
      phase[cursor] = rand();
      cursor++;
    }

    // 16 Tilted 3D Cluster Galaxies distributed throughout 3D sphere
    const galCount = 16;
    const starsPerGal = Math.floor((totalStars - cursor) / galCount);
    const euler = new THREE.Euler();
    const quat = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const center = new THREE.Vector3();

    for (let g = 0; g < galCount; g++) {
      const dist = 7.5 + rand() * 14.5;
      const th = (g / galCount) * Math.PI * 2 + rand() * 0.5;
      const u = (rand() * 2 - 1) * 0.78;
      const sq = Math.sqrt(Math.max(0, 1 - u * u));
      center.set(dist * sq * Math.cos(th), dist * u, dist * sq * Math.sin(th));

      euler.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      quat.setFromEuler(euler);
      const galRadius = 1.6 + rand() * 2.2;
      const isSpiral = g % 3 !== 0;

      for (let s = 0; s < starsPerGal && cursor < totalStars; s++) {
        if (isSpiral) {
          const arm = s % 2;
          const r = Math.pow(rand(), 0.75) * galRadius;
          const angle = arm * Math.PI + r * 1.85 + (rand() - 0.5) * 0.55;
          v.set(Math.cos(angle) * r, (rand() - 0.5) * 0.22 * (1 - r / (galRadius * 1.3)), Math.sin(angle) * r);
          scratchCol.lerpColors(spiA, spiB, Math.min(1, r / galRadius));
        } else {
          const r = Math.pow(rand(), 1.6) * galRadius * 0.85;
          const a = rand() * Math.PI * 2;
          const z = rand() * 2 - 1;
          const sq2 = Math.sqrt(Math.max(0, 1 - z * z));
          v.set(r * sq2 * Math.cos(a), r * z * 0.65, r * sq2 * Math.sin(a));
          scratchCol.lerpColors(ellA, ellB, rand());
        }
        col[cursor * 3] = scratchCol.r;
        col[cursor * 3 + 1] = scratchCol.g;
        col[cursor * 3 + 2] = scratchCol.b;

        v.applyQuaternion(quat).add(center);
        pos[cursor * 3] = v.x;
        pos[cursor * 3 + 1] = v.y;
        pos[cursor * 3 + 2] = v.z;
        size[cursor] = 0.22 + Math.pow(rand(), 4.2) * 0.95;
        phase[cursor] = rand();
        cursor++;
      }
    }

    const starPoints = this.createStarPoints(pos, col, size, phase);
    targetGroup.add(starPoints);
    this.spinObjects.push({ obj: starPoints, speedX: 0, speedY: 0.015 });

    // 2. True 3D Spherical Gravitational Lensing Shell (Einstein arcs wrap from ANY angle!)
    const einsteinMat = new THREE.ShaderMaterial({
      vertexShader: EINSTEIN_SHELL_VERTEX,
      fragmentShader: EINSTEIN_SHELL_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWaveBand: { value: this.waveBand },
        uOpticalFidelity: { value: this.opticalFidelity },
        uUnwarpProgress: { value: this.instrumentPatch.unwarpProgress },
        uRingTwist: { value: this.instrumentPatch.ringTwist },
        uSeamReveal: { value: this.instrumentPatch.seamReveal },
        uJetResonance: { value: this.instrumentPatch.jetResonance },
        uVibeCold: { value: 0 },
        uRawResidual: { value: 0 },
        uHalo0: { value: new THREE.Vector2(0, 0) },
        uHalo1: { value: new THREE.Vector2(0.32, 0.14) },
        uHalo2: { value: new THREE.Vector2(-0.28, -0.2) },
        uShearAngle: { value: this.instrumentPatch.shearAngle },
        uShearMag: { value: this.instrumentPatch.shearMag },
      },
    });
    this.shaderMats.push(einsteinMat);
    targetGroup.add(new THREE.Mesh(new THREE.SphereGeometry(7.2, 64, 48), einsteinMat));

    // 3. 3D Outer Spherical Horizon Enclosure Shell
    this.addOuterHorizonSphere(false, targetGroup);
  }

  /**
   * 100% True-3D Relativistic Pulsar, Accretion Disk, Polar Jets & Supernova Shock Shell
   * (Pulsar Rift S-04). Navigable 360 degrees in every direction.
   */
  private buildDeepFieldPulsarShowcase(targetGroup: THREE.Group): void {
    const rand = this.makeRng(991419);

    // 1. Magnetized Neutron Star Core
    const coreMat = new THREE.ShaderMaterial({
      vertexShader: STAR_PLASMA_VERTEX,
      fragmentShader: STAR_PLASMA_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uWaveBand: { value: this.waveBand },
        uVibeCold: { value: 0 },
        uBaseColor: { value: new THREE.Color('#78c6ff') },
      },
    });
    this.shaderMats.push(coreMat);
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.05, 40, 40), coreMat);
    targetGroup.add(core);

    const pulsarRig = new THREE.Group();
    pulsarRig.rotation.z = 0.38;
    pulsarRig.rotation.x = 0.22;
    targetGroup.add(pulsarRig);
    this.spinObjects.push({ obj: pulsarRig, speedX: 0, speedY: 0.42 });

    // 2. Swirling 3D Plasma Accretion Disk
    const diskMat = new THREE.ShaderMaterial({
      vertexShader: ACCRETION_DISK_VERTEX,
      fragmentShader: ACCRETION_DISK_FRAGMENT,
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWaveBand: { value: this.waveBand },
        uJetResonance: { value: this.instrumentPatch.jetResonance },
      },
    });
    this.shaderMats.push(diskMat);
    const disk = new THREE.Mesh(new THREE.PlaneGeometry(14.0, 14.0), diskMat);
    disk.rotation.x = Math.PI * 0.5;
    pulsarRig.add(disk);

    // 3. Twin Opposing 3D Relativistic Polar Jets
    const jetMat = new THREE.ShaderMaterial({
      vertexShader: POLAR_JET_VERTEX,
      fragmentShader: POLAR_JET_FRAGMENT,
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWaveBand: { value: this.waveBand },
        uJetResonance: { value: this.instrumentPatch.jetResonance },
      },
    });
    this.shaderMats.push(jetMat);
    const coneGeo = new THREE.ConeGeometry(1.65, 13.0, 32, 1, true);
    const jetNorth = new THREE.Mesh(coneGeo, jetMat);
    jetNorth.position.y = 7.1;
    jetNorth.rotation.x = Math.PI;
    const jetSouth = new THREE.Mesh(coneGeo.clone(), jetMat);
    jetSouth.position.y = -7.1;
    pulsarRig.add(jetNorth, jetSouth);

    // 4. 3D Volumetric Supernova Remnant Shock Shell
    const shockMat = new THREE.ShaderMaterial({
      vertexShader: EINSTEIN_SHELL_VERTEX,
      fragmentShader: SHOCK_SHELL_FRAGMENT,
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWaveBand: { value: this.waveBand },
        uJetResonance: { value: this.instrumentPatch.jetResonance },
      },
    });
    this.shaderMats.push(shockMat);
    const shockShell = new THREE.Mesh(new THREE.SphereGeometry(12.2, 64, 48), shockMat);
    targetGroup.add(shockShell);
    this.spinObjects.push({ obj: shockShell, speedX: 0.02, speedY: -0.03 });

    // 5. Orbiting Plasma & Distant Background Field Stars
    const starCount = 3200;
    const pos = new Float32Array(starCount * 3);
    const col = new Float32Array(starCount * 3);
    const size = new Float32Array(starCount);
    const phase = new Float32Array(starCount);
    const pColA = new THREE.Color('#9ad6ff');
    const pColB = new THREE.Color('#ffbe78');
    const scratchCol = new THREE.Color();

    for (let i = 0; i < starCount; i++) {
      if (i < 1600) {
        const r = 1.6 + Math.pow(rand(), 0.7) * 5.6;
        const a = rand() * Math.PI * 2;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = (rand() - 0.5) * 0.45;
        pos[i * 3 + 2] = Math.sin(a) * r;
        scratchCol.lerpColors(pColA, pColB, r / 7.2);
        col[i * 3] = scratchCol.r;
        col[i * 3 + 1] = scratchCol.g;
        col[i * 3 + 2] = scratchCol.b;
      } else {
        const r = 16 + rand() * 24;
        const th = rand() * Math.PI * 2;
        const u = rand() * 2 - 1;
        const sq = Math.sqrt(Math.max(0, 1 - u * u));
        pos[i * 3] = r * sq * Math.cos(th);
        pos[i * 3 + 1] = r * u;
        pos[i * 3 + 2] = r * sq * Math.sin(th);
        col[i * 3] = 0.78;
        col[i * 3 + 1] = 0.85;
        col[i * 3 + 2] = 1.0;
      }
      size[i] = 0.24 + Math.pow(rand(), 4.5) * 0.9;
      phase[i] = rand();
    }
    const diskPoints = this.createStarPoints(pos, col, size, phase);
    pulsarRig.add(diskPoints);

    // 6. Outer 3D Horizon Lattice Shell
    this.addOuterHorizonSphere(true, targetGroup);
  }

  /**
   * 100% True-3D Dual-Pole Celestial Sphere & Antipodal Facet Lattice (Blink Comparator).
   */
  private buildAntipodalPolesShowcase(targetGroup: THREE.Group): void {
    const rand = this.makeRng(141905);
    const starCount = 2800;
    const pos = new Float32Array(starCount * 3);
    const col = new Float32Array(starCount * 3);
    const size = new Float32Array(starCount);
    const phase = new Float32Array(starCount);
    const northCol = new THREE.Color('#ffdba4');
    const southCol = new THREE.Color('#9ce0ff');

    for (let i = 0; i < starCount; i++) {
      const r = 10 + rand() * 14;
      const th = rand() * Math.PI * 2;
      const u = rand() * 2 - 1;
      const sq = Math.sqrt(Math.max(0, 1 - u * u));
      pos[i * 3] = r * sq * Math.cos(th);
      pos[i * 3 + 1] = r * u;
      pos[i * 3 + 2] = r * sq * Math.sin(th);
      const c = u >= 0 ? northCol : southCol;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      size[i] = 0.25 + Math.pow(rand(), 4.2) * 1.05;
      phase[i] = rand();
    }
    targetGroup.add(this.createStarPoints(pos, col, size, phase));

    // Antipodal North & South Pole beacon halos
    const poleMat = new THREE.ShaderMaterial({
      vertexShader: CORONA_VERTEX,
      fragmentShader: CORONA_FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWaveBand: { value: this.waveBand },
        uColor: { value: new THREE.Color('#8cd9ff') },
      },
    });
    this.shaderMats.push(poleMat);
    const north = new THREE.Mesh(new THREE.SphereGeometry(2.8, 28, 28), poleMat);
    north.position.set(0, 8.5, 0);
    const south = new THREE.Mesh(new THREE.SphereGeometry(2.8, 28, 28), poleMat);
    south.position.set(0, -8.5, 0);
    targetGroup.add(north, south);

    this.addOuterHorizonSphere(true, targetGroup);
  }

  private pickHandleAt(clientX: number, clientY: number): { handle: Interactive3DHandle; hitPoint: THREE.Vector3 } | null {
    if (this.registeredHandles.size === 0 || !this.renderer || !this.camera) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const ndc = new THREE.Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);

    const worldPos = new THREE.Vector3();
    let bestHandle: Interactive3DHandle | null = null;
    let bestScore = Infinity;
    let bestPoint = new THREE.Vector3();

    for (const handle of this.registeredHandles.values()) {
      const hits = this.raycaster.intersectObject(handle.object, true);
      if (hits.length > 0) {
        if (hits[0].distance < bestScore) {
          bestScore = hits[0].distance;
          bestHandle = handle;
          bestPoint.copy(hits[0].point);
        }
        continue;
      }

      // Dynamic >=44px screen-space pick sphere guarantee for easy touch/trackpad targeting
      handle.object.getWorldPosition(worldPos);
      const projected = worldPos.clone().project(this.camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const px = (projected.x * 0.5 + 0.5) * w;
      const py = (-projected.y * 0.5 + 0.5) * h;
      const screenDist = Math.hypot(px - sx, py - sy);
      const pickPx = Math.max(44, handle.pickRadiusPx ?? 48);
      if (screenDist <= pickPx && screenDist < bestScore) {
        bestScore = screenDist;
        bestHandle = handle;
        bestPoint.copy(worldPos);
      }
    }

    return bestHandle ? { handle: bestHandle, hitPoint: bestPoint } : null;
  }

  private intersectDragPlane(clientX: number, clientY: number, out: THREE.Vector3): boolean {
    if (!this.renderer || !this.camera) return false;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const ndc = new THREE.Vector2(((clientX - rect.left) / w) * 2 - 1, -((clientY - rect.top) / h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.dragPlane, out) !== null;
  }

  private bindEvents(): void {
    const el = this.renderer?.domElement;
    if (!el) return;

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activePointers.size === 1) {
        this.pointerDownPos = { x: e.clientX, y: e.clientY };
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.handleMoved = false;

        const picked = this.pickHandleAt(e.clientX, e.clientY);
        if (picked && this.camera) {
          this.activeHandleId = picked.handle.id;
          this.isDragging = false;
          const mode = picked.handle.dragPlane ?? 'camera';
          if (mode === 'equatorial') {
            this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), picked.hitPoint);
          } else if (mode === 'axial_z') {
            const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
            const normal = new THREE.Vector3().crossVectors(camRight, new THREE.Vector3(0, 0, 1));
            if (normal.lengthSq() < 0.01) normal.set(0, 1, 0);
            this.dragPlane.setFromNormalAndCoplanarPoint(normal.normalize(), picked.hitPoint);
          } else {
            const camDir = new THREE.Vector3();
            this.camera.getWorldDirection(camDir);
            this.dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), picked.hitPoint);
          }
          this.dragStartWorld.copy(picked.hitPoint);
          this.dragLastWorld.copy(picked.hitPoint);
          picked.handle.onDragStart?.(picked.hitPoint.clone());
          platform.triggerHaptic('vernierTick', 0.45);
          return;
        }

        if (!this.activeCameraKeyframe?.lockOrbit) {
          this.isDragging = true;
        }
      } else if (this.activePointers.size === 2) {
        this.isDragging = false;
        this.activeHandleId = null;
        const pts = [...this.activePointers.values()];
        this.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.pinchStartOrbitDist = this.targetDist;
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (!this.activePointers.has(e.pointerId)) {
        const hover = this.pickHandleAt(e.clientX, e.clientY);
        const nextHoverId = hover?.handle.id ?? null;
        if (nextHoverId !== this.hoveredHandleId) {
          if (this.hoveredHandleId) {
            this.registeredHandles.get(this.hoveredHandleId)?.onHover?.(false);
          }
          this.hoveredHandleId = nextHoverId;
          if (nextHoverId) {
            this.registeredHandles.get(nextHoverId)?.onHover?.(true);
          }
          el.style.cursor = nextHoverId ? 'grab' : '';
        }
        return;
      }

      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activePointers.size === 2) {
        const pts = [...this.activePointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this.pinchStartDist > 8) {
          const ratio = this.pinchStartDist / Math.max(8, dist);
          this.targetDist = THREE.MathUtils.clamp(this.pinchStartOrbitDist * ratio, MIN_DIST, MAX_DIST);
        }
        return;
      }

      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;

      if (this.activeHandleId) {
        const handle = this.registeredHandles.get(this.activeHandleId);
        if (handle) {
          if (Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y) > 5) {
            this.handleMoved = true;
          }
          const curWorld = new THREE.Vector3();
          if (!this.intersectDragPlane(e.clientX, e.clientY, curWorld)) {
            curWorld.copy(this.dragLastWorld);
          }
          const worldDelta = curWorld.clone().sub(this.dragLastWorld);
          this.dragLastWorld.copy(curWorld);
          handle.onDrag?.({
            worldPoint: curWorld,
            worldDelta,
            screenX: e.clientX,
            screenY: e.clientY,
            screenDx: dx,
            screenDy: dy,
          });
          const now = performance.now();
          if (now - this.lastVibeHapticMs > 75 && (Math.abs(dx) + Math.abs(dy)) > 3) {
            this.lastVibeHapticMs = now;
            platform.triggerHaptic('vernierTick', 0.35);
          }
        }
        return;
      }

      if (!this.isDragging) return;
      this.targetYaw -= dx * 0.0065;
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * 0.0055, -1.25, 1.25);
    });

    const up = (e: PointerEvent) => {
      if (this.activeHandleId && this.activePointers.size === 1) {
        const handle = this.registeredHandles.get(this.activeHandleId);
        if (handle) {
          if (!this.handleMoved) {
            handle.onTap?.(this.dragStartWorld.clone());
          }
          handle.onDragEnd?.();
        }
        this.activeHandleId = null;
      }
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size < 2) this.pinchStartDist = 0;
      if (this.activePointers.size === 0) this.isDragging = false;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.targetDist = THREE.MathUtils.clamp(this.targetDist + e.deltaY * 0.02, MIN_DIST, MAX_DIST);
      },
      { passive: false }
    );

    window.addEventListener('resize', this.onResizeBound);
  }

  private applyTargetDpr(targetDpr: number): void {
    if (!this.renderer) return;
    const clamped = Math.max(0.75, Math.min(window.devicePixelRatio || 1, targetDpr));
    if (Math.abs(clamped - this.currentAppliedDpr) < 0.02) return;
    this.currentAppliedDpr = clamped;
    this.renderer.setPixelRatio(clamped);
    for (const rig of this.rigCache.values()) {
      for (const m of rig.shaderMats) {
        if (m.uniforms.uPixelRatio) m.uniforms.uPixelRatio.value = clamped;
      }
    }
    this.resize();
  }

  /**
   * Builds a shared 32x32 radial-Gaussian soft-circle CanvasTexture for THREE.PointsMaterial
   * so 3D ambient stars and dust wisps never render as hard-edged translucent squares.
   */
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

  /**
   * Builds a restrained, ultra-low-cost (<500 verts, 1-3 draw calls) Zeiss-optical 3D prop rig
   * for subtle spatial depth behind translucent 2D minigame canvases.
   */
  private ensureMinigamePropRig(kind: Minigame3DPropRig, accentHex = '#9cc8ff'): void {
    if (this.activePropRigKind === kind) return;
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
          opacity: rIdx === 0 ? 0.22 : 0.12,
        });
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
        opacity: 0.14,
      });
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
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pts = new THREE.Points(geo, mat);
      this.propRigDustPoints = pts;
      this.minigamePropRigGroup.add(pts);
    } else if (kind === 'horizon_arc') {
      // Subtle 93-BLY spherical horizon geodesic meridians (2 draw calls, ~180 verts)
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
          opacity: 0.14,
        });
        this.minigamePropRigGroup.add(new THREE.LineLoop(geo, mat));
      }
      this.minigamePropRigGroup.rotation.set(0.32, 0.24, 0.12);
    }
  }

  /**
   * Switches TargetShowcaseScene between full 3D showcase mode (`cfg === null`) and
   * lightweight single-pass Minigame Backdrop Mode (no EffectComposer/UnrealBloomPass,
   * DPR cap 1.0 mobile / 1.25 desktop, auto-30fps mobile guard, or full pause on `mode==='off'`).
   */
  setMinigameBackdropMode(cfg: Minigame3DConfig | null): void {
    this.minigameBackdropCfg = cfg;
    this.backdropFrameCounter = 0;
    this.backdropAvgMs = 6;
    this.parallaxTargetX = 0;
    this.parallaxTargetY = 0;
    this.parallaxCurrentX = 0;
    this.parallaxCurrentY = 0;

    if (!cfg) {
      this.minigameSuspended = false;
      this.rootGroup.visible = true;
      this.minigameBackdropGroup.visible = false;
      this.disposeMinigamePropRig();
      if (this.renderer) {
        this.renderer.toneMappingExposure = 1.12;
        this.applyTargetDpr(this.isCoarsePointer ? 1.5 : 2);
        this.resize();
      }
      if (this.desiredActive && !this.active) {
        this.resumeLoop();
      }
      return;
    }

    if (cfg.mode === 'off') {
      this.minigameSuspended = true;
      this.minigameBackdropGroup.visible = false;
      this.pauseLoop();
      return;
    }

    this.ensureInitialized();
    this.minigameSuspended = false;
    if (this.renderer) {
      this.renderer.toneMappingExposure = cfg.exposure ?? 0.5;
    }
    this.applyTargetDpr(this.isCoarsePointer ? 1.0 : 1.25);

    const showFullShowcase = cfg.mode === 'coupled_showcase';
    this.rootGroup.visible = showFullShowcase;
    this.ensureMinigameStarDome();
    if (this.minigameStarDome) {
      this.minigameStarDome.visible = !showFullShowcase;
    }
    this.ensureMinigamePropRig(cfg.propRig ?? 'none', cfg.accentHex ?? '#9cc8ff');
    this.minigameBackdropGroup.visible = true;

    if (this.desiredActive && !this.active) {
      this.resumeLoop();
    }
  }

  setMinigameParallax(nx: number, ny: number, progress01: number): void {
    if (!this.minigameBackdropCfg || this.minigameBackdropCfg.mode === 'off') return;
    this.parallaxTargetX = THREE.MathUtils.clamp(nx, -1, 1);
    this.parallaxTargetY = THREE.MathUtils.clamp(ny, -1, 1);
    this.instrumentPatch.progress = THREE.MathUtils.clamp(progress01, 0, 1);
  }

  resize(): void {
    if (!this.renderer || !this.camera) return;
    const w = Math.max(1, this.container.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight || 720);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (!this.minigameBackdropCfg) {
      this.composer?.setSize(w, h);
      this.bloomPass?.setSize(Math.max(1, Math.floor(w * 0.5)), Math.max(1, Math.floor(h * 0.5)));
    }
  }

  private resumeLoop(): void {
    this.ensureInitialized();
    this.active = true;
    this.resize();
    this.lastFrameMs = performance.now();
    this.lastRafMs = 0;
    this.showcaseFrameCount = 0;
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
    if (active && !this.minigameSuspended) {
      this.resumeLoop();
    } else {
      this.pauseLoop();
    }
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
    if (!this.active || !this.renderer || !this.scene || !this.camera) return;
    this.rafId = requestAnimationFrame(this.loop);

    const frameStart = performance.now();
    const dt = Math.min(0.05, (frameStart - this.lastFrameMs) / 1000);
    this.lastFrameMs = frameStart;
    const elapsed = frameStart * 0.001;

    // Lightweight Single-Pass Minigame 3D Backdrop Mode
    if (this.minigameBackdropCfg) {
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
        this.currentLookAt.x + this.orbitDist * cp * Math.sin(effYaw),
        this.currentLookAt.y + this.orbitDist * Math.sin(effPitch),
        this.currentLookAt.z + this.orbitDist * cp * Math.cos(effYaw)
      );
      this.camera.lookAt(this.currentLookAt);

      if (this.minigamePropRigGroup.visible) {
        this.minigamePropRigGroup.rotation.y += dt * (drift * 1.4);
      }
      if (this.propRigDustPoints) {
        this.propRigDustPoints.rotation.y -= dt * 0.01;
      }

      if (this.rootGroup.visible) {
        for (const m of this.shaderMats) {
          if (m.uniforms.uTime) m.uniforms.uTime.value = elapsed;
        }
        for (const sp of this.spinObjects) {
          sp.obj.rotation.x += dt * sp.speedX * 0.45;
          sp.obj.rotation.y += dt * sp.speedY * 0.45;
        }
      }

      // Direct single-pass render (bypasses EffectComposer / UnrealBloomPass / OpticalPolish)
      this.renderer.render(this.scene, this.camera);

      const frameElapsed = Math.min(performance.now() - frameStart, 40);
      if (this.backdropFrameCounter > 6) {
        this.backdropAvgMs = this.backdropAvgMs * 0.88 + frameElapsed * 0.12;
        if (this.backdropAvgMs > 22) {
          // Hard perf guard: suspend 3D backdrop if device struggles so 2D gameplay stays 60fps
          this.minigameSuspended = true;
          this.pauseLoop();
        }
      }
      return;
    }

    if (!this.isDragging && !this.activeHandleId && !this.activeCameraKeyframe) {
      this.targetYaw += dt * 0.045;
    }

    const damp = 1 - Math.exp(-7.0 * dt);
    this.orbitYaw += (this.targetYaw - this.orbitYaw) * damp;
    this.orbitPitch += (this.targetPitch - this.orbitPitch) * damp;
    this.orbitDist += (this.targetDist - this.orbitDist) * damp;
    this.currentLookAt.lerp(this.targetLookAt, damp);

    const cp = Math.cos(this.orbitPitch);
    this.camera.position.set(
      this.currentLookAt.x + this.orbitDist * cp * Math.sin(this.orbitYaw),
      this.currentLookAt.y + this.orbitDist * Math.sin(this.orbitPitch),
      this.currentLookAt.z + this.orbitDist * cp * Math.cos(this.orbitYaw)
    );
    this.camera.lookAt(this.currentLookAt);

    for (const m of this.shaderMats) {
      if (m.uniforms.uTime) m.uniforms.uTime.value = elapsed;
      if (m.uniforms.uWaveBand) m.uniforms.uWaveBand.value = this.waveBand;
      if (m.uniforms.uOpticalFidelity) m.uniforms.uOpticalFidelity.value = this.opticalFidelity;
    }
    if (this.transitionBurst > 0) {
      this.transitionBurst = Math.max(0, this.transitionBurst - dt / 0.55);
    }
    if (this.polishPass) {
      this.polishPass.uniforms.uTime.value = elapsed;
      this.polishPass.uniforms.uTransitionBurst.value = this.transitionBurst;
    }

    // Animate 3D rings/pulses triggered by instruments
    for (let i = this.instrumentSonarPulses.length - 1; i >= 0; i--) {
      const p = this.instrumentSonarPulses[i];
      p.age += dt;
      const t = p.age / p.maxAge;
      if (t >= 1) {
        this.instrumentOverlayGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.instrumentSonarPulses.splice(i, 1);
      } else {
        const s = 1 + t * 14.0;
        p.mesh.scale.set(s, s, 1);
        p.mesh.lookAt(this.camera.position);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.72;
      }
    }

    for (const body of this.orbitingBodies) {
      const a = elapsed * body.speed + body.phase;
      body.mesh.position.set(
        Math.cos(a) * body.radius,
        Math.sin(a) * body.radius * body.inclination,
        Math.sin(a) * body.radius
      );
      body.mesh.rotation.y += dt * body.selfSpin;
    }

    if (this.companionStar) {
      const a = elapsed * this.companionStar.speed + this.companionStar.phase;
      this.companionStar.mesh.position.set(
        Math.cos(a) * this.companionStar.radius,
        Math.sin(a) * this.companionStar.radius * this.companionStar.inclination + 4.5,
        Math.sin(a) * this.companionStar.radius
      );
    }

    for (const sp of this.spinObjects) {
      sp.obj.rotation.x += dt * sp.speedX;
      sp.obj.rotation.y += dt * sp.speedY;
    }

    if (this.composer && this.bloomEnabled) {
      try {
        this.composer.render();
      } catch {
        this.bloomEnabled = false;
        this.renderer.render(this.scene, this.camera);
      }
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Real rAF-to-rAF perf guard with 15-frame warmup: step down DPR before disabling bloom
    const rafDtMs = this.lastRafMs > 0 ? frameStart - this.lastRafMs : 16.6;
    this.lastRafMs = frameStart;
    this.showcaseFrameCount++;
    if (this.showcaseFrameCount > 15 && rafDtMs > 0 && rafDtMs < 250) {
      this.frameAvgMs = this.frameAvgMs * 0.92 + Math.min(rafDtMs, 100) * 0.08;
      if (this.frameAvgMs > 28) {
        if (this.currentAppliedDpr > 1.26) {
          this.applyTargetDpr(1.25);
          this.frameAvgMs = 18;
          this.showcaseFrameCount = 8;
        } else if (this.currentAppliedDpr > 1.02) {
          this.applyTargetDpr(1.0);
          this.frameAvgMs = 18;
          this.showcaseFrameCount = 8;
        } else if (this.frameAvgMs > 30 && this.bloomPass && this.bloomPass.enabled) {
          this.bloomPass.enabled = false;
        }
      }
    }

    if (this.onTelemetry && this.currentSpec) {
      const zoomNorm = THREE.MathUtils.clamp((MAX_DIST - this.orbitDist) / (MAX_DIST - MIN_DIST), 0, 1);
      const zoomX = MAX_DIST / Math.max(1, this.orbitDist);
      const zoomStage: ShowcaseZoomStage =
        zoomNorm < 0.25
          ? 'OVERVIEW'
          : zoomNorm < 0.55
            ? 'MID ORBIT'
            : zoomNorm < 0.82
              ? 'CLOSE-UP'
              : 'CORE';

      let scaleText = '';
      if (this.currentSpec.showcaseType === 'star_system') {
        scaleText = `${(this.orbitDist * 0.85).toFixed(1)} AU`;
      } else if (this.currentSpec.showcaseType === 'nebula') {
        scaleText = `${(this.orbitDist * 0.24).toFixed(1)} LY`;
      } else if (this.currentSpec.showcaseType === 'deep_field') {
        scaleText = `${(this.orbitDist * 0.18).toFixed(1)} LY`;
      } else if (this.currentSpec.showcaseType === 'antipodal_poles') {
        scaleText = `93.0 BLY`;
      } else {
        scaleText = `${(this.orbitDist * 0.14).toFixed(1)} MLY`;
      }

      const yawDeg = Math.round(((THREE.MathUtils.radToDeg(this.orbitYaw) % 360) + 360) % 360);
      const pitchDeg = Math.round(THREE.MathUtils.radToDeg(this.orbitPitch));

      this.onTelemetry({
        targetId: this.currentSpec.id,
        zoomNorm,
        zoomX,
        zoomStage,
        scaleText,
        yawDeg,
        pitchDeg,
      });
    }
  };

  dispose(): void {
    this.disposed = true;
    this.setActive(false);
    if (!this.initialized) return;
    window.removeEventListener('resize', this.onResizeBound);
    this.clearRigCache();
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
    if (this.nebulaPuffAtlas) {
      this.nebulaPuffAtlas.dispose();
      this.nebulaPuffAtlas = null;
    }
    this.composer?.dispose();
    this.renderer?.dispose();
    this.renderer = null;
  }
}
