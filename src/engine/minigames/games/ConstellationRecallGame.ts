import { platform } from '../../../platform/PlatformAdapter';
import { BaseCosmicMinigame, type PointerLocalEvent } from '../core/BaseCosmicMinigame';
import { drawGlowPolylineXY } from '../render/OpticalDrawUtils';
import { drawOpticalStar } from '../render/StarPSFAtlas';
import { clamp, lerp } from '../tactilePhysics';
import type {
  CosmicPlateId,
  HudActionButtonSpec,
  InstrumentFieldGuide,
  MinigameVariantSpec,
  SpectralClass,
} from '../types';

interface SkyNode {
  id: number;
  bx: number;
  by: number;
  distancePc: number;
  parallaxMas: number;
  parallaxWeight: number;
  driftPhase: number;
  isDecoy: boolean;
  spectralClass: SpectralClass;
  flash: number;
  wrongFlash: number;
  decoyFlare: number;
  size: number;
}

interface ConstellationVariantConfig {
  starPalette: readonly SpectralClass[];
  decoyClass: SpectralClass;
  parallaxBoost: number;
  sectorTag: string;
}

const VARIANT_CONFIGS: readonly ConstellationVariantConfig[] = [
  {
    starPalette: ['A', 'B', 'F', 'G'],
    decoyClass: 'M',
    parallaxBoost: 1.0,
    sectorTag: 'SMACS 0723 FIELD',
  },
  {
    starPalette: ['O', 'B', 'B', 'A'],
    decoyClass: 'K',
    parallaxBoost: 1.15,
    sectorTag: '30 DORADUS CORE',
  },
  {
    starPalette: ['F', 'A', 'B', 'G'],
    decoyClass: 'M',
    parallaxBoost: 1.05,
    sectorTag: 'HUDF REFERENCE',
  },
  {
    starPalette: ['G', 'F', 'K', 'A'],
    decoyClass: 'M',
    parallaxBoost: 1.25,
    sectorTag: 'SOL–CENTAURI BASELINE',
  },
];

function orient2d(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const o1 = orient2d(ax, ay, bx, by, cx, cy);
  const o2 = orient2d(ax, ay, bx, by, dx, dy);
  const o3 = orient2d(cx, cy, dx, dy, ax, ay);
  const o4 = orient2d(cx, cy, dx, dy, bx, by);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/**
 * CON-02 — Stellar Constellation
 * Distance-layered parallax asterism memory with comet arrival blooms, 2-opt untangled shapes,
 * telescope-locked PSF diffraction spikes (zero spinning ninja stars), and keyboard access.
 */
export class ConstellationRecallGame extends BaseCosmicMinigame {
  readonly id = 'constellation_recall';
  readonly title = 'STELLAR CONSTELLATION';
  readonly subtitle = 'Parallax Spatial Memory';
  readonly instrumentCode = 'CON-02';

  readonly platePool: readonly CosmicPlateId[] = ['smacs', 'tarantula', 'hudf'];
  readonly variants: readonly MinigameVariantSpec[] = [
    { index: 0, id: 'constellation_recall_v1', label: 'SMACS Anchor Asterism', plateId: 'smacs', scenarioTag: 'smacs_anchor' },
    { index: 1, id: 'constellation_recall_v2', label: 'Doradus Supercluster', plateId: 'tarantula', scenarioTag: 'doradus' },
    { index: 2, id: 'constellation_recall_v3', label: 'Ultra Deep Field Lattice', plateId: 'hudf', scenarioTag: 'hudf_lattice' },
    { index: 3, id: 'constellation_recall_v4', label: 'Sol-Centauri Baseline', plateId: 'smacs', scenarioTag: 'sol_centauri' },
  ];

  private variantCfg: ConstellationVariantConfig = VARIANT_CONFIGS[0];
  private nodes: SkyNode[] = [];
  private sequence: number[] = [];
  private recallIndex = 0;
  private mode: 'playback' | 'recall' | 'stage_clear' = 'playback';

  // Playback state: star 0 blooms at step 0; for step >= 1 comet travels from step-1 -> step and blooms on arrival
  private playbackStep = 0;
  private playbackSegmentT = 0;
  private playbackLeadDelay = 0.3;
  private playbackInterval = 0.58;
  private cometSparkCooldown = 0;

  private smoothPx = 0;
  private smoothPy = 0;
  private wrongTapCount = 0;
  private consecutiveWrongOnStep = 0;
  private lastCorrectTapAt = -10;
  private overridePrompt: string | null = null;
  private hoveredNodeId = -1;
  private kbdSelectedNodeId = -1;

  // Reusable polyline buffer for zero-GC filament rendering
  private readonly chainXY = new Float32Array(24);
  private readonly posCacheX = new Float32Array(16);
  private readonly posCacheY = new Float32Array(16);

  protected override onMount(): void {
    this.variantCfg = VARIANT_CONFIGS[this.iterationIndex % VARIANT_CONFIGS.length];
    this.wrongTapCount = 0;
    this.smoothPx = 0;
    this.smoothPy = 0;
  }

  protected override onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.overridePrompt = null;
    this.consecutiveWrongOnStep = 0;
    this.hoveredNodeId = -1;
    this.kbdSelectedNodeId = -1;

    const totalMain = stage === 1 ? 7 : stage === 2 ? 9 : 11;
    const seqLen = stage === 1 ? 3 : stage === 2 ? 4 : 5;
    const decoyCount = stage === 3 ? 2 : 0;

    // Safe vertical bounds keeping stars & caustic rings cleanly above REPLAY button on 844x390
    const yMin = 0.22;
    const yMax = 0.65;
    const xMin = 0.14;
    const xMax = 0.86;

    const candidates: SkyNode[] = [];
    let guard = 0;
    while (candidates.length < totalMain && guard < 900) {
      guard++;
      const minSep = guard < 450 ? 0.12 : 0.095;
      const bx = xMin + rng() * (xMax - xMin);
      const by = yMin + rng() * (yMax - yMin);
      // Aspect-aware separation so nodes stay comfortably clickable on 844x390 without starving Stage 3 decoys
      const tooClose = candidates.some((c) => {
        const dx = c.bx - bx;
        const dy = (c.by - by) * 0.72;
        return Math.hypot(dx, dy) < minSep;
      });
      if (tooClose) continue;

      const idx = candidates.length;
      candidates.push({
        id: idx,
        bx,
        by,
        distancePc: 16 + rng() * 78,
        parallaxMas: 0,
        parallaxWeight: 1,
        driftPhase: rng() * Math.PI * 2,
        isDecoy: false,
        spectralClass: this.variantCfg.starPalette[idx % this.variantCfg.starPalette.length],
        flash: 0,
        wrongFlash: 0,
        decoyFlare: 0,
        size: 10.0 + rng() * 2.8,
      });
    }

    // Assign decoys relative to placed candidates.length so Stage 3 ALWAYS spawns exact decoyCount foreground decoys
    const decoyStart = Math.max(seqLen, candidates.length - decoyCount);
    for (let idx = 0; idx < candidates.length; idx++) {
      const node = candidates[idx];
      const isDecoy = decoyCount > 0 && idx >= decoyStart;
      node.isDecoy = isDecoy;
      if (isDecoy) {
        node.distancePc = 4.5 + rng() * 3.0;
        node.spectralClass = this.variantCfg.decoyClass;
        node.size = 9.8 + rng() * 1.8;
      }
      node.parallaxMas = 1000 / node.distancePc;
      node.parallaxWeight = clamp(node.parallaxMas / 85, 0.14, 2.2) * this.variantCfg.parallaxBoost;
    }
    this.nodes = candidates;

    // Choose sequence from non-decoy stars, then untangle via 2-opt so asterisms look iconic & clean
    const validIds = this.nodes.filter((n) => !n.isDecoy).map((n) => n.id);
    for (let i = validIds.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [validIds[i], validIds[j]] = [validIds[j], validIds[i]];
    }
    const chosen = validIds.slice(0, Math.min(seqLen, validIds.length));

    // Order by angular sweep around centroid, then 2-opt uncross any remaining self-intersections
    if (chosen.length >= 3) {
      let cx = 0;
      let cy = 0;
      for (const id of chosen) {
        cx += this.nodes[id].bx;
        cy += this.nodes[id].by;
      }
      cx /= chosen.length;
      cy /= chosen.length;
      const dir = rng() > 0.5 ? 1 : -1;
      chosen.sort((a, b) => {
        const angA = Math.atan2(this.nodes[a].by - cy, this.nodes[a].bx - cx);
        const angB = Math.atan2(this.nodes[b].by - cy, this.nodes[b].bx - cx);
        return (angA - angB) * dir;
      });
      // Rotate start node deterministically for variety
      const rotStart = Math.floor(rng() * chosen.length);
      const rotated = chosen.slice(rotStart).concat(chosen.slice(0, rotStart));
      this.untanglePath(rotated);
      this.sequence = rotated;
    } else {
      this.sequence = chosen;
    }

    this.startPlayback();
  }

  private untanglePath(seq: number[]): void {
    for (let pass = 0; pass < 8; pass++) {
      let swapped = false;
      for (let i = 0; i < seq.length - 2; i++) {
        for (let j = i + 2; j < seq.length - 1; j++) {
          const a = this.nodes[seq[i]];
          const b = this.nodes[seq[i + 1]];
          const c = this.nodes[seq[j]];
          const d = this.nodes[seq[j + 1]];
          if (segmentsIntersect(a.bx, a.by, b.bx, b.by, c.bx, c.by, d.bx, d.by)) {
            let l = i + 1;
            let r = j;
            while (l < r) {
              const tmp = seq[l];
              seq[l] = seq[r];
              seq[r] = tmp;
              l++;
              r--;
            }
            swapped = true;
          }
        }
      }
      if (!swapped) break;
    }
  }

  private startPlayback(): void {
    this.mode = 'playback';
    this.recallIndex = 0;
    this.consecutiveWrongOnStep = 0;
    this.overridePrompt = null;
    this.playbackStep = 0;
    this.playbackSegmentT = 0;
    this.playbackLeadDelay = 0.28;
    // Warm: lyrical slower cadence; Cold: brisk surgical astrometry cadence
    this.playbackInterval =
      this.profile.vibe === 'warm'
        ? this.stage === 1 ? 0.68 : 0.62
        : this.profile.vibe === 'cold'
        ? this.stage === 1 ? 0.5 : 0.45
        : this.stage === 1 ? 0.6 : 0.53;
    this.emitHud(true);
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'replay' && !this.completed && this.mode !== 'stage_clear') {
      this.startPlayback();
    }
  }

  private computeNodePositions(w: number, h: number): void {
    const compactShift = this.compact ? 0.88 : 1.0;
    const swayScale = this.stage === 3 && this.compact ? 0.72 : 1.0;
    const parallaxOn = this.stage >= 2;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const baseDrift = (parallaxOn ? 0.0085 * n.parallaxWeight : 0.002) * swayScale;
      const pointerScaleX = (parallaxOn ? 0.015 : 0.006) * n.parallaxWeight * swayScale;
      const pointerScaleY = (parallaxOn ? 0.011 : 0.004) * n.parallaxWeight * swayScale;
      const ox = baseDrift * Math.sin(this.elapsedSec * 0.85 + n.driftPhase) + this.smoothPx * pointerScaleX;
      const oy = baseDrift * 0.55 * Math.cos(this.elapsedSec * 0.7 + n.driftPhase) + this.smoothPy * pointerScaleY;
      this.posCacheX[i] = clamp(n.bx + ox, 0.07, 0.93) * w;
      this.posCacheY[i] = clamp(n.by * compactShift + (this.compact ? 0.03 : 0) + oy, 0.14, this.compact ? 0.7 : 0.78) * h;
    }
  }

  private easeInOutCubic(t: number): number {
    const c = clamp(t, 0, 1);
    return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
  }

  private bloomPlaybackNode(seqIdx: number): void {
    const nodeId = this.sequence[seqIdx];
    const node = this.nodes[nodeId];
    if (!node) return;
    node.flash = 1;
    this.computeNodePositions(this.width, this.height);
    const sx = this.posCacheX[nodeId];
    const sy = this.posCacheY[nodeId];
    this.particles.emitLockCausticRing(sx, sy, 14, this.palette.accentHex);
    this.particles.emitPhotonSparks(sx, sy, 3, 28, this.palette.accentHex);
    const pan = clamp(node.bx * 2 - 1, -0.8, 0.8);
    // Pentatonic musical scale for Warm vs clinical harmonic step for Cold
    const pentatonic = [330, 392, 440, 523.25, 587.33, 659.25];
    const pitchHz =
      this.profile.vibe === 'cold'
        ? 420 + seqIdx * 78
        : pentatonic[seqIdx % pentatonic.length];
    this.ctx.audio?.playStereoSonarEcho(pan, 0.22, pitchHz);
    platform.triggerHaptic('proximityPulse', 0.42);
  }

  protected override onPointerMove(ev: PointerLocalEvent): void {
    if (this.mode !== 'recall' || this.nodes.length === 0) {
      this.hoveredNodeId = -1;
      return;
    }
    this.computeNodePositions(ev.w, ev.h);
    let best = -1;
    let bestD = 38;
    for (let i = 0; i < this.nodes.length; i++) {
      const d = Math.hypot(ev.x - this.posCacheX[i], ev.y - this.posCacheY[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.hoveredNodeId = best;
  }

  protected override onPointerDown(ev: PointerLocalEvent): void {
    if (this.mode !== 'recall' || this.stageClearTimer > 0) return;
    this.computeNodePositions(ev.w, ev.h);
    const hitRadius = this.profile.vibe === 'warm' ? 46 : this.profile.vibe === 'cold' ? 38 : 42;
    let bestIdx = -1;
    let bestDist = hitRadius;
    for (let i = 0; i < this.nodes.length; i++) {
      const d = Math.hypot(ev.x - this.posCacheX[i], ev.y - this.posCacheY[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx !== -1) {
      this.handleStarTap(this.nodes[bestIdx], this.posCacheX[bestIdx], this.posCacheY[bestIdx]);
    }
  }

  protected override onKeyDown(e: KeyboardEvent): void {
    if (this.mode === 'stage_clear') return;
    if (e.key === 'r' || e.key === 'R') {
      this.startPlayback();
      return;
    }
    if (this.mode !== 'recall' || this.nodes.length === 0) return;

    if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.kbdSelectedNodeId = (this.kbdSelectedNodeId + 1) % this.nodes.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.kbdSelectedNodeId = (this.kbdSelectedNodeId - 1 + this.nodes.length) % this.nodes.length;
    } else if ((e.key === 'Enter' || e.code === 'Space') && this.kbdSelectedNodeId >= 0) {
      e.preventDefault();
      this.computeNodePositions(this.width, this.height);
      const id = this.kbdSelectedNodeId;
      this.handleStarTap(this.nodes[id], this.posCacheX[id], this.posCacheY[id]);
    }
  }

  private handleStarTap(node: SkyNode, sx: number, sy: number): void {
    const expectedId = this.sequence[this.recallIndex];

    // Guard against accidental double-tap on the just-connected star within 350ms
    if (
      this.recallIndex > 0 &&
      node.id === this.sequence[this.recallIndex - 1] &&
      this.elapsedSec - this.lastCorrectTapAt < 0.35
    ) {
      return;
    }

    const pan = clamp((sx / Math.max(1, this.width)) * 2 - 1, -0.8, 0.8);

    if (node.id === expectedId) {
      node.flash = 1;
      this.recallIndex += 1;
      this.consecutiveWrongOnStep = 0;
      this.lastCorrectTapAt = this.elapsedSec;
      this.overridePrompt = null;
      this.particles.emitLockCausticRing(sx, sy, 15, this.palette.lockHex);
      this.particles.emitPhotonSparks(sx, sy, 4, 34, this.palette.lockHex);

      const pentatonic = [330, 392, 440, 523.25, 587.33, 659.25];
      const pitchHz =
        this.profile.vibe === 'cold'
          ? 420 + (this.recallIndex - 1) * 78
          : pentatonic[(this.recallIndex - 1) % pentatonic.length];
      this.ctx.audio?.playStereoSonarEcho(pan, 0.18, pitchHz);
      platform.triggerHaptic('vernierTick', 0.72);

      if (this.recallIndex >= this.sequence.length) {
        this.mode = 'stage_clear';
        this.triggerStageClear(
          `CONSTELLATION ${this.stage}/${this.maxStages} LOCKED`,
          this.stage === 3 ? 0.55 : 0.7,
          sx,
          sy
        );
      } else {
        this.emitHud(true);
      }
    } else {
      node.wrongFlash = 1;
      this.wrongTapCount += 1;
      this.consecutiveWrongOnStep += 1;
      this.particles.emitLockCausticRing(sx, sy, 13, '#ff8652');
      this.ctx.audio?.playSolenoidClack(false);
      platform.triggerHaptic('rejectThud', 0.62);

      // Gentle anti-frustration whisper ripple on the expected next star after 2 misses
      if (this.consecutiveWrongOnStep >= 2 && expectedId !== undefined) {
        const ex = this.posCacheX[expectedId];
        const ey = this.posCacheY[expectedId];
        this.particles.emitLockCausticRing(ex, ey, 18, this.palette.accentHex);
      }
      this.overridePrompt = node.isDecoy
        ? 'High-parallax foreground star — ignore drifting decoys or tap REPLAY PATTERN.'
        : 'Soft amber pulse — continue from your last linked star, or tap REPLAY PATTERN.';
      this.emitHud(true);
    }
  }

  protected override onUpdate(dt: number): void {
    this.smoothPx = lerp(this.smoothPx, this.pointerNormX, Math.min(1, dt * 4.5));
    this.smoothPy = lerp(this.smoothPy, this.pointerNormY, Math.min(1, dt * 4.5));
    this.cometSparkCooldown = Math.max(0, this.cometSparkCooldown - dt);

    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      n.flash = Math.max(0, n.flash - dt * 1.6);
      n.wrongFlash = Math.max(0, n.wrongFlash - dt * 1.8);
      n.decoyFlare = Math.max(0, n.decoyFlare - dt * 1.7);
    }

    const totalDone = this.getStageProgress01();
    this.ctx.showcase?.applyInstrumentPatch({
      progress: totalDone,
      dustPeel: totalDone,
      humanity: this.ctx.state.humanity,
    });

    if (this.mode === 'playback' && this.sequence.length > 0) {
      if (this.playbackLeadDelay > 0) {
        this.playbackLeadDelay -= dt;
        if (this.playbackLeadDelay <= 0) {
          this.bloomPlaybackNode(0);
          this.playbackStep = 1;
          this.playbackSegmentT = 0;
        }
        return;
      }

      if (this.playbackStep >= this.sequence.length) {
        // Brief linger after final arrival before entering recall
        this.playbackSegmentT += dt / (this.playbackInterval * 0.72);
        if (this.playbackSegmentT >= 1) {
          this.mode = 'recall';
          this.emitHud(true);
        }
        return;
      }

      this.playbackSegmentT += dt / this.playbackInterval;

      // In Stage 3, briefly flare a foreground high-parallax decoy mid-playback as a realistic distractor
      if (this.stage === 3 && this.playbackStep === 2 && this.playbackSegmentT > 0.45 && this.playbackSegmentT < 0.52) {
        for (let i = 0; i < this.nodes.length; i++) {
          if (this.nodes[i].isDecoy && this.nodes[i].decoyFlare <= 0.01) {
            this.nodes[i].decoyFlare = 1;
            break;
          }
        }
      }

      // Tapering stardust wake behind the traveling playback comet
      if (this.cometSparkCooldown <= 0) {
        this.cometSparkCooldown = 0.055;
        this.computeNodePositions(this.width, this.height);
        const fromId = this.sequence[this.playbackStep - 1];
        const toId = this.sequence[this.playbackStep];
        const t = this.easeInOutCubic(this.playbackSegmentT);
        const cx = lerp(this.posCacheX[fromId], this.posCacheX[toId], t);
        const cy = lerp(this.posCacheY[fromId], this.posCacheY[toId], t);
        this.particles.emitPhotonSparks(cx, cy, 2, 12, this.palette.accentHex);
      }

      if (this.playbackSegmentT >= 1) {
        // Comet has arrived at destination star: bloom & chime ON ARRIVAL!
        this.bloomPlaybackNode(this.playbackStep);
        this.playbackStep += 1;
        this.playbackSegmentT = 0;
      }
    }
  }

  protected override onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const overall = this.getStageProgress01();
    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: lerp(6, 0, overall),
      alpha: lerp(0.56, 0.92, overall),
      brightness: lerp(0.84, 1.12, overall),
      scale: lerp(1.06, 1.01, overall),
      tintAlpha: 0.34,
      starOpacity: this.clarity01,
    });

    this.computeNodePositions(w, h);

    // Count of stars already arrived/connected
    const connectedCount =
      this.mode === 'playback'
        ? this.playbackLeadDelay > 0
          ? 0
          : Math.min(this.sequence.length, this.playbackStep)
        : this.mode === 'stage_clear'
        ? this.sequence.length
        : this.recallIndex;

    // Luminous asterism polygon wash when constellation locks
    if (this.mode === 'stage_clear' && connectedCount >= 3) {
      c2d.save();
      c2d.beginPath();
      for (let i = 0; i < connectedCount; i++) {
        const id = this.sequence[i];
        if (i === 0) c2d.moveTo(this.posCacheX[id], this.posCacheY[id]);
        else c2d.lineTo(this.posCacheX[id], this.posCacheY[id]);
      }
      c2d.closePath();
      c2d.fillStyle = `rgba(${this.palette.lockRgb}, ${(0.18 * clamp(this.stageClearTimer * 1.4, 0, 1)).toFixed(3)})`;
      c2d.fill();
      c2d.restore();
    }

    // Connected starlight filaments via 2-pass optical glow (ZERO shadowBlur!)
    if (connectedCount >= 2) {
      for (let i = 0; i < connectedCount; i++) {
        const id = this.sequence[i];
        this.chainXY[i * 2] = this.posCacheX[id];
        this.chainXY[i * 2 + 1] = this.posCacheY[id];
      }
      const lineCol = this.mode === 'playback' ? this.palette.accentHex : this.palette.lockHex;
      drawGlowPolylineXY(c2d, this.chainXY, connectedCount, lineCol, 2.0, {
        outerWidthMul: 3.0,
        outerAlpha: 0.24,
        coreAlpha: 0.92,
      });
    }

    // Faint elastic aiming tether from last linked star to hovered candidate
    const aimTargetId =
      this.mode === 'recall' && this.recallIndex > 0
        ? this.hoveredNodeId >= 0
          ? this.hoveredNodeId
          : this.kbdSelectedNodeId
        : -1;
    if (aimTargetId >= 0 && aimTargetId < this.nodes.length) {
      const prevId = this.sequence[this.recallIndex - 1];
      if (prevId !== undefined && prevId !== aimTargetId) {
        c2d.save();
        c2d.strokeStyle = `rgba(${this.palette.accentRgb}, 0.34)`;
        c2d.lineWidth = 1.25;
        c2d.setLineDash?.([4, 6]);
        c2d.beginPath();
        c2d.moveTo(this.posCacheX[prevId], this.posCacheY[prevId]);
        c2d.lineTo(this.posCacheX[aimTargetId], this.posCacheY[aimTargetId]);
        c2d.stroke();
        c2d.setLineDash?.([]);
        c2d.restore();
      }
    }

    // Active traveling comet segment during playback (flies from playbackStep-1 -> playbackStep)
    if (
      this.mode === 'playback' &&
      this.playbackLeadDelay <= 0 &&
      this.playbackStep >= 1 &&
      this.playbackStep < this.sequence.length
    ) {
      const fromId = this.sequence[this.playbackStep - 1];
      const toId = this.sequence[this.playbackStep];
      const t = this.easeInOutCubic(this.playbackSegmentT);
      const fx = this.posCacheX[fromId];
      const fy = this.posCacheY[fromId];
      const tx = this.posCacheX[toId];
      const ty = this.posCacheY[toId];
      const cx = lerp(fx, tx, t);
      const cy = lerp(fy, ty, t);

      this.chainXY[0] = fx;
      this.chainXY[1] = fy;
      this.chainXY[2] = cx;
      this.chainXY[3] = cy;
      drawGlowPolylineXY(c2d, this.chainXY, 2, this.palette.accentHex, 2.0, {
        outerWidthMul: 3.0,
        outerAlpha: 0.28,
        coreAlpha: 0.95,
      });

      // Luminous stardust wake beads behind traveling comet
      for (let wake = 1; wake <= 3; wake++) {
        const wt = Math.max(0, t - wake * 0.065);
        drawOpticalStar(c2d, lerp(fx, tx, wt), lerp(fy, ty, wt), 3.4 - wake * 0.7, {
          spectralClass: 'F',
          spikes: 0,
          alpha: 0.65 - wake * 0.16,
          vibeMode: this.palette.mode,
        });
      }

      drawOpticalStar(c2d, cx, cy, 5.4, {
        spectralClass: 'F',
        spikes: 4,
        alpha: 0.98,
        rotationRad: 0,
        vibeMode: this.palette.mode,
      });
    }

    // Subtle sector astrometry header tag
    c2d.save();
    c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = `rgba(${this.palette.secondaryRgb}, 0.65)`;
    c2d.textAlign = 'left';
    c2d.fillText(
      `${this.variantCfg.sectorTag} · ${this.stage >= 2 ? 'PARALLAX ACTIVE' : 'EPOCH 0'}`,
      w * 0.08,
      this.compact ? 58 : 76
    );
    c2d.restore();

    // Render all stars using telescope-locked PSF sprites (ZERO spinning spikes!)
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const sx = this.posCacheX[i];
      const sy = this.posCacheY[i];
      const seqIdx = this.sequence.indexOf(node.id);
      const alreadyConnected = seqIdx !== -1 && seqIdx < connectedCount;
      const isHovered = this.mode === 'recall' && (i === this.hoveredNodeId || i === this.kbdSelectedNodeId);

      let spectral: SpectralClass = node.spectralClass;
      let rad = node.size;
      let alpha = 0.86;
      let spikes: 0 | 4 | 6 = 6;

      if (node.wrongFlash > 0.05) {
        spectral = 'ALERT';
        rad *= 1 + node.wrongFlash * 0.25;
        alpha = 0.98;
      } else if (node.flash > 0.05) {
        spectral = alreadyConnected && this.mode !== 'playback' ? 'LOCK' : 'F';
        rad *= 1 + node.flash * 0.42;
        alpha = 1.0;
      } else if (node.decoyFlare > 0.05) {
        spectral = node.spectralClass;
        rad *= 1 + node.decoyFlare * 0.32;
        alpha = 0.96;
      } else if (alreadyConnected) {
        spectral = 'LOCK';
        alpha = 0.96;
      }
      // Uniform 6-point JWST aperture spikes across all stars (single optical spider; zero decoy spoiler)
      spikes = 6;

      drawOpticalStar(c2d, sx, sy, rad, {
        spectralClass: spectral,
        spikes,
        alpha,
        rotationRad: 0, // Locked to telescope optical spider axis!
        vibeMode: this.palette.mode,
        timeSec: this.elapsedSec,
        scintPhase: node.driftPhase,
      });

      // Resting Zeiss target ring so interactive nodes pop cleanly against background field stars
      if (!alreadyConnected && node.wrongFlash <= 0.05) {
        const restBreath = 0.2 + 0.06 * Math.sin(this.elapsedSec * 2.1 + node.driftPhase);
        c2d.save();
        c2d.strokeStyle = isHovered ? this.palette.accentHex : this.palette.secondaryHex;
        c2d.globalAlpha = isHovered ? 0.62 : restBreath;
        c2d.lineWidth = isHovered ? 1.5 : 1.0;
        c2d.beginPath();
        c2d.arc(sx, sy, rad * (isHovered ? 1.85 : 1.38), 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      }

      // Subtle Zeiss reticle ring on connected or flashing stars
      if (alreadyConnected || isHovered || node.flash > 0.22) {
        c2d.save();
        c2d.strokeStyle =
          node.wrongFlash > 0.05
            ? '#ff8652'
            : alreadyConnected
            ? this.palette.lockHex
            : this.palette.accentHex;
        c2d.globalAlpha = isHovered && !alreadyConnected ? 0.62 : 0.78;
        c2d.lineWidth = isHovered ? 1.5 : 1.3;
        c2d.beginPath();
        c2d.arc(sx, sy, rad * (isHovered ? 2.0 : 1.75), 0, Math.PI * 2);
        c2d.stroke();

        // Cold mode: clinical astrometry parallax readout (mas) & sequence index
        if (this.profile.showNumericDeltas && alreadyConnected) {
          c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
          c2d.fillStyle = this.palette.lockHex;
          c2d.globalAlpha = 0.78;
          c2d.textAlign = 'center';
          c2d.fillText(`π ${Math.round(node.parallaxMas)}mas`, sx, sy + rad * 2.1 + 11);
        }
        c2d.restore();
      }
    }

    this.drawSharedOverlays(c2d, w, h);
  }

  protected override getStageProgress01(): number {
    return clamp((this.stage - 1 + this.recallIndex / Math.max(1, this.sequence.length)) / 3, 0, 1);
  }

  protected override getPromptText(): string {
    if (this.overridePrompt) return this.overridePrompt;
    if (this.mode === 'playback') {
      return `Follow the comet linking ${this.sequence.length} asterism stars…`;
    }
    return this.stage === 3
      ? `Tap the ${this.sequence.length} true stars in order (${this.recallIndex}/${this.sequence.length}) — ignore foreground decoys.`
      : `Tap the ${this.sequence.length} stars in order (${this.recallIndex}/${this.sequence.length} connected).`;
  }

  protected override getHelperActionSpec(): HudActionButtonSpec | null {
    return this.mode === 'recall' ? { id: 'replay', label: 'REPLAY PATTERN' } : null;
  }

  protected override solveCurrentStage(_stage: 1 | 2 | 3): void {
    this.mode = 'recall';
    this.recallIndex = this.sequence.length;
  }

  protected override verifySolved(): boolean {
    return this.sequence.length > 0 && this.recallIndex >= this.sequence.length;
  }

  protected override onAllStagesCleared(): void {
    const acc = clamp(1 - this.wrongTapCount * 0.04, 0.72, 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.finishSuccess({
      accuracy: acc,
      proofFragmentSuffix: 'constellation',
      dossierSnippet: `Astrometric parallax baseline recalled across 3 stages (${this.variantCfg.sectorTag}) on ${this.ctx.targetName}.`,
      telemetrySummary: `${this.activeVariant?.label ?? 'Asterism'} · Precision ${(acc * 100).toFixed(0)}% · ${totalSec.toFixed(1)}s`,
      physicalPrinciple: 'Trigonometric Stellar Parallax (π = 1/d) & Sidereal Baseline Astrometry',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Astrometric parallax measures true distances (π = 1/d in arcseconds, or 1000/d in milliarcseconds): nearby foreground stars shift markedly against deep background fields.',
      goalSummary:
        'Watch the comet link stars in order, then trace them across 3 stages (3 → 4 parallax → 5 with high-parallax foreground decoys).',
      controlsDesktop: 'Click stars in order (or Tab/Arrows + Enter); move cursor to inspect parallax depth; press R to replay.',
      controlsTouch: 'Tap stars in order; double-taps are ignored and wrong taps keep your chain intact.',
      warmthEffect: 'Warm H% gives unhurried musical playback; Cold H% speeds cadence and overlays live parallax (mas) readouts.',
    };
  }
}
