import { platform } from '../../../platform/PlatformAdapter';
import { BaseCosmicMinigame, type PointerLocalEvent } from '../core/BaseCosmicMinigame';
import { drawGlowStroke, drawInclinedAstrometryRing } from '../render/OpticalDrawUtils';
import { drawLimbDarkenedStar, drawOpticalStar, drawSoftDustPuff } from '../render/StarPSFAtlas';
import { clamp, lerp } from '../tactilePhysics';
import type {
  CosmicPlateId,
  InstrumentFieldGuide,
  MinigameVariantSpec,
  SpectralClass,
} from '../types';

type QuasarMotif = 'double_tap' | 'triple_staccato' | 'sawtooth_echo' | 'staggered_burst';

interface MirageStar {
  id: number;
  nx: number;
  ny: number;
  isMirage: boolean;
  delaySec: number;
  delayDays: number;
  magScale: number;
  decoyKind: 'steady' | 'sine_fast' | 'sine_slow' | 'single_pulse';
  decoyPhase: number;
  spectralClass: SpectralClass;
  selected: boolean;
  rejectFlash: number;
  quadCtrlDx: number;
  quadCtrlDy: number;
}

interface MirageVariantProfile {
  motif: QuasarMotif;
  motifLabel: string;
  foldCuspGeometry: boolean;
  variableMagnification: boolean;
  lensTiltRad: number;
  systemName: string;
}

const MIRAGE_VARIANTS: readonly MinigameVariantSpec[] = [
  { index: 0, id: 'einstein_cross_v1', label: 'Huchra Quad Quasar', plateId: 'smacs' },
  { index: 1, id: 'einstein_cross_v2', label: 'Cartwheel Lensed Burst', plateId: 'cartwheel' },
  { index: 2, id: 'einstein_cross_v3', label: 'Quintet Foreground Mirage', plateId: 'stephans_quintet' },
  { index: 3, id: 'einstein_cross_v4', label: 'Staggered Delay Echo', plateId: 'smacs' },
];

const VARIANT_PROFILES: readonly MirageVariantProfile[] = [
  {
    motif: 'double_tap',
    motifLabel: 'TWIN-FLARE (| |)',
    foldCuspGeometry: false,
    variableMagnification: false,
    lensTiltRad: 0.22,
    systemName: 'Q2237+0305',
  },
  {
    motif: 'triple_staccato',
    motifLabel: 'CUSP STACCATO (|  ||)',
    foldCuspGeometry: true,
    variableMagnification: false,
    lensTiltRad: -0.35,
    systemName: 'RX J1131-1231',
  },
  {
    motif: 'sawtooth_echo',
    motifLabel: 'FLARE + AFTERGLOW (|\\ .)',
    foldCuspGeometry: false,
    variableMagnification: false,
    lensTiltRad: 0.42,
    systemName: 'HE 0435-1223',
  },
  {
    motif: 'staggered_burst',
    motifLabel: 'REFSDAL TWIN-ECHO',
    foldCuspGeometry: true,
    variableMagnification: true,
    lensTiltRad: -0.18,
    systemName: 'PG 1115+080',
  },
];

const CADENCE_PERIOD = 2.4;

/**
 * MIR-20 — Einstein Cross Mirage Collapser
 * Refsdal time-delay cosmography: identify lensed quasar copies sharing an identical
 * intrinsic flare motif arriving staggered by Δt days — with naturalized star colors,
 * near-ring field interlopers, isotropic Einstein ring, always-visible mobile cadence
 * traces, hover audition sonar, and curved tangent geodesic collapse!
 */
export class EinsteinCrossGame extends BaseCosmicMinigame {
  readonly id = 'einstein_cross';
  readonly title = 'EINSTEIN CROSS MIRAGE';
  readonly subtitle = 'Time-Delayed Quasar Cadence';
  readonly instrumentCode = 'MIR-20';
  readonly platePool: readonly CosmicPlateId[] = ['smacs', 'cartwheel', 'stephans_quintet'];
  readonly variants = MIRAGE_VARIANTS;

  private variantProfile: MirageVariantProfile = VARIANT_PROFILES[0];
  private stars: MirageStar[] = [];
  private hoveredStarId: number | null = null;
  private lastHoverAuditionCycle = -1;
  private wrongTapCount = 0;
  private lastShowcaseSig = '';

  protected onMount(): void {
    this.variantProfile = VARIANT_PROFILES[this.iterationIndex % VARIANT_PROFILES.length];
    this.wrongTapCount = 0;
  }

  private getFlareSigma(): number {
    if (this.profile.vibe === 'warm') return 0.132;
    if (this.profile.vibe === 'cold') return 0.088;
    return 0.11;
  }

  private evalQuasarMotif(timeSec: number, motif: QuasarMotif): number {
    const raw = timeSec % CADENCE_PERIOD;
    const phase = raw < 0 ? raw + CADENCE_PERIOD : raw;
    const sig = this.getFlareSigma();

    if (motif === 'double_tap') {
      const p1 = Math.exp(-Math.pow((phase - 0.38) / sig, 2));
      const p2 = Math.exp(-Math.pow((phase - 0.86) / sig, 2));
      return clamp(0.18 + Math.max(p1, p2) * 0.86, 0.18, 1.04);
    }
    if (motif === 'triple_staccato') {
      const p1 = Math.exp(-Math.pow((phase - 0.3) / (sig * 0.92), 2));
      const p2 = Math.exp(-Math.pow((phase - 0.95) / (sig * 0.82), 2));
      const p3 = Math.exp(-Math.pow((phase - 1.32) / (sig * 0.82), 2));
      return clamp(0.16 + Math.max(p1, p2 * 0.92, p3 * 0.96) * 0.88, 0.16, 1.04);
    }
    if (motif === 'sawtooth_echo') {
      // Fast sharp flare + decaying exponential shoulder + smaller afterglow echo
      let main = 0;
      if (phase >= 0.25 && phase <= 1.05) {
        const u = phase - 0.25;
        main = u < 0.12 ? u / 0.12 : Math.exp(-(u - 0.12) * 4.2);
      }
      const echo = 0.56 * Math.exp(-Math.pow((phase - 1.34) / (sig * 1.15), 2));
      return clamp(0.16 + Math.max(main, echo) * 0.88, 0.16, 1.04);
    }
    // staggered_burst: bright primary + closely spaced double secondary echo
    const p1 = Math.exp(-Math.pow((phase - 0.34) / (sig * 0.95), 2));
    const p2 = 0.72 * Math.exp(-Math.pow((phase - 0.84) / (sig * 0.9), 2));
    const p3 = 0.94 * Math.exp(-Math.pow((phase - 1.56) / (sig * 0.95), 2));
    return clamp(0.16 + Math.max(p1, p2, p3) * 0.88, 0.16, 1.04);
  }

  private evalPulseAt(s: MirageStar, timeSec: number): number {
    if (s.isMirage) {
      return this.evalQuasarMotif(timeSec - s.delaySec, this.variantProfile.motif);
    }
    if (s.decoyKind === 'steady') return 0.28;
    const raw = (timeSec + s.decoyPhase) % CADENCE_PERIOD;
    const phase = raw < 0 ? raw + CADENCE_PERIOD : raw;
    if (s.decoyKind === 'sine_fast') {
      return 0.22 + 0.62 * (0.5 + 0.5 * Math.sin((phase / CADENCE_PERIOD) * Math.PI * 6));
    }
    if (s.decoyKind === 'sine_slow') {
      return 0.22 + 0.58 * (0.5 + 0.5 * Math.sin((phase / CADENCE_PERIOD) * Math.PI * 2));
    }
    // single_pulse: shares same 2.4s period but ONLY a single flare (tests real waveform reading!)
    const sig = this.getFlareSigma() * 1.1;
    const p = Math.exp(-Math.pow((phase - 0.58) / sig, 2));
    return clamp(0.18 + p * 0.82, 0.18, 1.0);
  }

  private getEinsteinRingPx(w: number, h: number): { cx: number; cy: number; rx: number; ry: number } {
    const cx = w * 0.5;
    const cy = h * 0.48;
    const ringR = Math.min(w, h) * (h < 450 ? 0.25 : 0.26);
    // Isotropic in angular sky space with authentic mild elliptical potential (1.12 : 0.90)
    return { cx, cy, rx: ringR * 1.12, ry: ringR * 0.9 };
  }

  protected onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.hoveredStarId = null;
    this.lastHoverAuditionCycle = -1;

    const mirageCount = stage === 1 ? 2 : 4;
    const decoyCount = stage === 1 ? 3 : stage === 2 ? 3 : 5;
    const refW = Math.max(844, this.width);
    const refH = Math.max(390, this.height);
    const ring = this.getEinsteinRingPx(refW, refH);
    const minSepPx = this.compact ? 58 : 70;

    // Naturalized spectral pool: BOTH mirages and field decoys draw from natural AGN/star colors!
    const quasarClasses: readonly SpectralClass[] = ['A', 'B', 'F'];
    const decoyClasses: readonly SpectralClass[] = ['A', 'B', 'F', 'G', 'K'];
    const qClass = quasarClasses[Math.floor(rng() * quasarClasses.length)];

    this.stars = [];
    const placedPx: Array<{ x: number; y: number }> = [];

    const isClearPx = (x: number, y: number): boolean => {
      // Clear of central lensing galaxy core
      if (Math.hypot(x - ring.cx, y - ring.cy) < 46) return false;
      // Clear of HUD margins
      if (x < refW * 0.12 || x > refW * 0.88 || y < refH * 0.22 || y > refH * 0.72) return false;
      for (let i = 0; i < placedPx.length; i++) {
        if (Math.hypot(x - placedPx[i].x, y - placedPx[i].y) < minSepPx) return false;
      }
      return true;
    };

    const baseAng = rng() * Math.PI * 2;
    const delayStepsDays = stage === 1 ? [0, 18] : [0, 11, 26, 44];

    // 1. Place lensed mirage images (symmetric cross OR realistic asymmetric fold/cusp quad!)
    for (let i = 0; i < mirageCount; i++) {
      let ang = baseAng + (i * Math.PI * 2) / mirageCount + (rng() - 0.5) * 0.28;
      let rMul = 0.94 + rng() * 0.14;
      if (this.variantProfile.foldCuspGeometry && mirageCount === 4) {
        // Cusp/Fold Quad: 3 clustered along one bright arc + 1 counter-image opposite!
        const foldOffsets = [-0.62, 0.0, 0.62, Math.PI];
        ang = baseAng + foldOffsets[i] + (rng() - 0.5) * 0.12;
        rMul = i === 3 ? 0.84 : 1.02 + (i === 1 ? 0.06 : 0);
      }

      let x = ring.cx + Math.cos(ang) * ring.rx * rMul;
      let y = ring.cy + Math.sin(ang) * ring.ry * rMul;
      if (!isClearPx(x, y)) {
        for (let k = 0; k < 20; k++) {
          const aTry = ang + (k % 2 === 0 ? 1 : -1) * k * 0.14;
          const xTry = clamp(ring.cx + Math.cos(aTry) * ring.rx * rMul, refW * 0.14, refW * 0.86);
          const yTry = clamp(ring.cy + Math.sin(aTry) * ring.ry * rMul, refH * 0.24, refH * 0.7);
          if (isClearPx(xTry, yTry)) {
            x = xTry;
            y = yTry;
            break;
          }
        }
      }
      placedPx.push({ x, y });

      const perpX = -(y - ring.cy) * 0.24;
      const perpY = (x - ring.cx) * 0.24;
      this.stars.push({
        id: this.stars.length,
        nx: clamp(x / refW, 0.12, 0.88),
        ny: clamp(y / refH, 0.22, 0.72),
        isMirage: true,
        delaySec: i * (stage === 3 ? 0.44 : 0.34),
        delayDays: delayStepsDays[i] ?? i * 14,
        magScale: this.variantProfile.variableMagnification ? (i === 1 ? 1.24 : i === 3 ? 0.78 : 1.0) : 1.0,
        decoyKind: 'steady',
        decoyPhase: 0,
        spectralClass: qClass,
        selected: false,
        rejectFlash: 0,
        quadCtrlDx: perpX / refW,
        quadCtrlDy: perpY / refH,
      });
    }

    // 2. Place naturalized field decoys — including near-ring & inner-ring interlopers so ring position doesn't spoil!
    for (let d = 0; d < decoyCount; d++) {
      let x = refW * 0.2;
      let y = refH * 0.3;
      const nearRing = d < (stage === 3 ? 2 : 1);
      for (let attempt = 0; attempt < 48; attempt++) {
        const ang = rng() * Math.PI * 2;
        const rMul = nearRing ? 0.82 + rng() * 0.4 : 1.32 + rng() * 0.58;
        const candX = ring.cx + Math.cos(ang) * ring.rx * rMul;
        const candY = ring.cy + Math.sin(ang) * ring.ry * rMul;
        if (isClearPx(candX, candY)) {
          x = candX;
          y = candY;
          break;
        }
      }
      placedPx.push({ x, y });

      const decoyKind: MirageStar['decoyKind'] =
        stage === 1
          ? d === 0
            ? 'sine_slow'
            : 'steady'
          : stage === 2
          ? d % 2 === 0
            ? 'sine_fast'
            : 'sine_slow'
          : d < 2
          ? 'single_pulse'
          : d % 2 === 0
          ? 'sine_fast'
          : 'sine_slow';

      // Give near-ring decoys the SAME spectral class as the quasar so color NEVER spoils!
      const cls = nearRing ? qClass : decoyClasses[Math.floor(rng() * decoyClasses.length)];

      this.stars.push({
        id: this.stars.length,
        nx: clamp(x / refW, 0.12, 0.88),
        ny: clamp(y / refH, 0.22, 0.72),
        isMirage: false,
        delaySec: 0,
        delayDays: 0,
        magScale: 0.85 + rng() * 0.3,
        decoyKind,
        decoyPhase: rng() * CADENCE_PERIOD,
        spectralClass: cls,
        selected: false,
        rejectFlash: 0,
        quadCtrlDx: 0,
        quadCtrlDy: 0,
      });
    }

    this.syncShowcaseCoupling(true);
  }

  private syncShowcaseCoupling(force: boolean): void {
    if (!this.ctx.showcase) return;
    const mirages = this.stars.filter((s) => s.isMirage);
    const done = mirages.filter((s) => s.selected).length;
    const unwarp = done / Math.max(1, mirages.length);
    const sig = `${Math.round(unwarp * 20)}:${this.stage}`;
    if (!force && sig === this.lastShowcaseSig) return;
    this.lastShowcaseSig = sig;
    this.ctx.showcase.applyInstrumentPatch({
      progress: this.getStageProgress01(),
      unwarpProgress: unwarp,
    });
  }

  protected onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;

    let clicked: MirageStar | null = null;
    let bestDist = ev.pointerType === 'touch' ? 44 : 38;
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      if (s.selected) continue;
      const d = Math.hypot(ev.x - s.nx * this.width, ev.y - s.ny * this.height);
      if (d < bestDist) {
        bestDist = d;
        clicked = s;
      }
    }
    if (!clicked) return;
    this.selectMirageCandidate(clicked);
  }

  protected onPointerMove(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;
    let hovered: number | null = null;
    let best = 38;
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const d = Math.hypot(ev.x - s.nx * this.width, ev.y - s.ny * this.height);
      if (d < best) {
        best = d;
        hovered = s.id;
      }
    }
    if (hovered !== this.hoveredStarId) {
      this.hoveredStarId = hovered;
      this.lastHoverAuditionCycle = -1;
    }
  }

  private selectMirageCandidate(clicked: MirageStar): void {
    if (clicked.selected || this.stageClearTimer > 0) return;
    if (clicked.isMirage) {
      clicked.selected = true;
      const sx = clicked.nx * this.width;
      const sy = clicked.ny * this.height;
      platform.triggerHaptic('phaseSnapLock', 0.9);
      this.ctx.audio?.playTumblerClick(0.92, true);
      this.ctx.audio?.playStereoSonarEcho?.((clicked.nx - 0.5) * 1.6, 0.4, 420 + clicked.delayDays * 2);
      this.particles.emitPhotonSparks(sx, sy, 4, 32, this.palette.lockHex);
      this.particles.emitLockCausticRing(sx, sy, 14, this.palette.lockHex);
      this.syncShowcaseCoupling(true);

      const mirages = this.stars.filter((s) => s.isMirage);
      if (mirages.every((s) => s.selected)) {
        const ring = this.getEinsteinRingPx(this.width, this.height);
        this.triggerStageClear(
          `EINSTEIN CROSS ${this.stage}/3 · Δt COLLAPSED`,
          0.85,
          ring.cx,
          ring.cy
        );
      } else {
        this.emitHud(true);
      }
    } else {
      clicked.rejectFlash = 1.0;
      this.wrongTapCount++;
      platform.triggerHaptic('rejectThud', 0.65);
      this.ctx.audio?.playSolenoidClack(false);
    }
  }

  protected onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0 || this.stars.length === 0) return;
    if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const unselected = this.stars.filter((s) => !s.selected);
      if (unselected.length === 0) return;
      const curIdx = unselected.findIndex((s) => s.id === this.hoveredStarId);
      const step = e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1;
      const nextIdx = curIdx < 0 ? 0 : (curIdx + step + unselected.length) % unselected.length;
      this.hoveredStarId = unselected[nextIdx].id;
      this.lastHoverAuditionCycle = -1;
      return;
    }
    if ((e.key === 'Enter' || e.code === 'Space') && !e.repeat && this.hoveredStarId !== null) {
      e.preventDefault();
      const target = this.stars.find((s) => s.id === this.hoveredStarId);
      if (target) this.selectMirageCandidate(target);
    }
  }

  protected onUpdate(dt: number): void {
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      if (s.rejectFlash > 0) s.rejectFlash = Math.max(0, s.rejectFlash - dt * 2.4);
    }

    // Subtle hover-audition sonar on flare peak — IDENTICAL pitch (420 Hz) for all stars so players read cadence, never pitch!
    if (this.hoveredStarId !== null && this.stageClearTimer <= 0) {
      const hs = this.stars.find((item) => item.id === this.hoveredStarId);
      if (hs) {
        const amp = this.evalPulseAt(hs, this.elapsedSec);
        const cyc = Math.floor(this.elapsedSec * 4.2);
        if (amp > 0.78 && cyc > this.lastHoverAuditionCycle) {
          this.lastHoverAuditionCycle = cyc;
          this.ctx.audio?.playStereoSonarEcho?.((hs.nx - 0.5) * 1.4, 0.55, 420);
        }
      }
    }
  }

  protected onAllStagesCleared(): void {
    this.finishSuccess({
      accuracy: clamp(1 - this.wrongTapCount * 0.05, 0.72, 1),
      proofFragmentSuffix: 'einstein',
      dossierSnippet: `Time-delayed Einstein Cross quasar echoes (${this.variantProfile.systemName}, Refsdal Δt delays) linked and de-lensed on ${this.ctx.targetName}.`,
      telemetrySummary: `Mirage Collapsed · ${this.elapsedSec.toFixed(1)}s`,
      physicalPrinciple: 'Refsdal Gravitational Time-Delay Cosmography & Strong Lensing Geodesics',
    });
  }

  protected getStageProgress01(): number {
    if (this.completed) return 1;
    let total = 0;
    let done = 0;
    for (let i = 0; i < this.stars.length; i++) {
      if (this.stars[i].isMirage) {
        total++;
        if (this.stars[i].selected) done++;
      }
    }
    return clamp((this.stage - 1 + done / Math.max(1, total)) / 3, 0, 1);
  }

  protected getPromptText(): string {
    let total = 0;
    let done = 0;
    for (let i = 0; i < this.stars.length; i++) {
      if (this.stars[i].isMirage) {
        total++;
        if (this.stars[i].selected) done++;
      }
    }
    return `Match the top reference ${this.variantProfile.motifLabel} trace to click all ${total} time-delayed quasar images (${done}/${total}).`;
  }

  private drawReferenceCadenceLegend(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const compact = h < 450;
    const cx = w * 0.5;
    const y = compact ? 50 : 62;
    const barW = compact ? 64 : 88;
    const barH = compact ? 10 : 12;
    const bx = cx - barW * 0.5;

    c2d.save();
    c2d.font = '600 8px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = this.palette.accentHex;
    c2d.textAlign = 'center';
    c2d.fillText(`${this.variantProfile.systemName} · ${this.variantProfile.motifLabel}`, cx, y);

    c2d.strokeStyle = 'rgba(200, 224, 248, 0.16)';
    c2d.lineWidth = 0.8;
    c2d.beginPath();
    c2d.moveTo(bx, y + barH + 5);
    c2d.lineTo(bx + barW, y + barH + 5);
    c2d.stroke();

    c2d.strokeStyle = this.palette.accentHex;
    c2d.globalAlpha = 0.9;
    c2d.lineWidth = 1.4;
    c2d.beginPath();
    const steps = 28;
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const v = this.evalQuasarMotif(this.elapsedSec - (1 - u) * 2.2, this.variantProfile.motif);
      const px = bx + u * barW;
      const py = y + barH + 5 - v * barH;
      if (k === 0) c2d.moveTo(px, py);
      else c2d.lineTo(px, py);
    }
    c2d.stroke();
    c2d.restore();
  }

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const compact = this.compact;
    const ring = this.getEinsteinRingPx(w, h);
    const collapseFrac = this.stageClearTimer > 0 ? clamp(1 - this.stageClearTimer / 0.85, 0, 1) : 0;

    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 4,
      alpha: 0.45,
      brightness: 0.78,
      tintAlpha: 0.46,
      reticleDuck: { cx: ring.cx, cy: ring.cy, r: ring.rx * 0.72 },
    });

    this.drawReferenceCadenceLegend(c2d, w, h);

    // Central Elliptical Lensing Galaxy (pre-baked soft dust glow + Sersic core, ZERO radial gradients!)
    c2d.save();
    c2d.translate(ring.cx, ring.cy);
    c2d.rotate(this.variantProfile.lensTiltRad);
    c2d.scale(1.45, 0.82);
    drawSoftDustPuff(c2d, 0, 0, compact ? 24 : 32, '#e2b67c', 0.52);
    drawLimbDarkenedStar(c2d, 0, 0, compact ? 9 : 13, 'G', 0.82);
    c2d.restore();

    // Isotropic Subtle Einstein Critical Curve + Faint Tangential Caustic Arcs
    drawInclinedAstrometryRing(
      c2d,
      ring.cx,
      ring.cy,
      ring.rx,
      ring.ry,
      this.variantProfile.lensTiltRad,
      this.palette.mode === 'cold' ? '158, 232, 255' : '196, 220, 246',
      { backAlpha: 0.14, frontAlpha: 0.24, dashBack: [4, 6], ticks: 4 }
    );

    // Curved Tangent Geodesic Links from Tagged Mirages -> Central Lensing Core
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      if (!s.selected) continue;
      const sx = s.nx * w;
      const sy = s.ny * h;
      const ctrlX = (ring.cx + sx) * 0.5 + s.quadCtrlDx * w;
      const ctrlY = (ring.cy + sy) * 0.5 + s.quadCtrlDy * h;
      drawGlowStroke(
        c2d,
        (ctx) => {
          ctx.moveTo(ring.cx, ring.cy);
          ctx.quadraticCurveTo(ctrlX, ctrlY, sx, sy);
        },
        this.palette.lockHex,
        1.6,
        { outerAlpha: 0.22, coreAlpha: 0.74 }
      );
    }

    // De-lensed reconstructed quasar bloom during collapse animation
    if (collapseFrac > 0.25) {
      const bloomT = clamp((collapseFrac - 0.25) / 0.75, 0, 1);
      drawOpticalStar(c2d, ring.cx, ring.cy, lerp(6, 17, bloomT), {
        spectralClass: 'LOCK',
        spikes: 6,
        alpha: bloomT,
        vibeMode: this.palette.mode,
      });
      if (this.profile.showNumericDeltas) {
        c2d.save();
        c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        c2d.fillStyle = this.palette.lockHex;
        c2d.textAlign = 'center';
        c2d.fillText('H₀ ≈ 71.4 km/s/Mpc · SINGLE SOURCE RESTORED', ring.cx, ring.cy + ring.ry + 18);
        c2d.restore();
      }
    }

    // Render All Stars + ALWAYS-VISIBLE Scrolling Cadence Traces (Desktop & Mobile 844x390!)
    const traceW = compact ? 30 : 38;
    const traceH = compact ? 8 : 10;
    const histSec = this.profile.vibe === 'warm' ? 2.45 : 2.15;

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const sx = s.nx * w;
      const sy = s.ny * h;
      let drawX = sx;
      let drawY = sy;

      // Smooth quadratic Bezier geodesic glide inward during collapse!
      if (s.selected && collapseFrac > 0) {
        const t = collapseFrac;
        const inv = 1 - t;
        const ctrlX = (ring.cx + sx) * 0.5 + s.quadCtrlDx * w;
        const ctrlY = (ring.cy + sy) * 0.5 + s.quadCtrlDy * h;
        drawX = inv * inv * sx + 2 * inv * t * ctrlX + t * t * ring.cx;
        drawY = inv * inv * sy + 2 * inv * t * ctrlY + t * t * ring.cy;
      }

      const amp = this.evalPulseAt(s, this.elapsedSec);
      const hovered = this.hoveredStarId === s.id;
      const traceCol = s.selected
        ? this.palette.lockHex
        : hovered
        ? this.palette.accentHex
        : 'rgba(210, 232, 250, 0.78)';

      // Flare pulse ring on bright burst peak (same neutral tint for ALL pulsing stars — ZERO color spoiler!)
      if (amp > 0.72) {
        c2d.save();
        c2d.strokeStyle = s.selected ? this.palette.lockHex : '#d8eeff';
        c2d.globalAlpha = clamp((amp - 0.68) * 1.65, 0, 0.68);
        c2d.lineWidth = 1.3;
        c2d.beginPath();
        c2d.arc(drawX, drawY, 10 + (amp - 0.68) * 20, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      }

      // Naturalized PSF Star Sprite (identical AGN tint across mirages & near-ring decoys!)
      const starR = (6.8 + amp * 5.8) * s.magScale * (compact ? 0.92 : 1.0);
      drawOpticalStar(c2d, drawX, drawY, starR, {
        spectralClass: s.selected ? 'LOCK' : s.spectralClass,
        spikes: amp > 0.68 ? 4 : 0,
        alpha: clamp(0.76 + amp * 0.24, 0.74, 1),
        vibeMode: this.palette.mode,
      });

      // Subtle uniform neutral astrometric aperture ring (identical on mirages & decoys, 0 spoiler)
      if (collapseFrac === 0) {
        c2d.save();
        c2d.strokeStyle = s.selected ? this.palette.lockHex : 'rgba(210, 232, 250, 0.28)';
        c2d.lineWidth = s.selected ? 1.35 : 0.95;
        c2d.beginPath();
        c2d.arc(drawX, drawY, compact ? 7.5 : 9, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      }

      if (hovered && !s.selected && collapseFrac === 0) {
        c2d.save();
        c2d.strokeStyle = this.palette.accentHex;
        c2d.globalAlpha = 0.62;
        c2d.lineWidth = 1.2;
        c2d.beginPath();
        c2d.arc(drawX, drawY, 16, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      }

      if (s.rejectFlash > 0.02) {
        c2d.save();
        c2d.strokeStyle = '#ff6b6b';
        c2d.globalAlpha = s.rejectFlash;
        c2d.lineWidth = 1.8;
        c2d.beginPath();
        c2d.arc(drawX, drawY, 15 + (1 - s.rejectFlash) * 10, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      }

      // Scrolling Cadence Sparkline directly beneath every star (NEVER hidden on compact!)
      if (collapseFrac === 0) {
        const bx = drawX - traceW * 0.5;
        const by = drawY + (compact ? 14 : 18);
        c2d.save();
        c2d.strokeStyle = traceCol;
        c2d.globalAlpha = hovered || s.selected ? 0.92 : 0.72;
        c2d.lineWidth = compact ? 1.15 : 1.3;
        c2d.beginPath();
        const steps = 18;
        for (let k = 0; k <= steps; k++) {
          const u = k / steps;
          const v = this.evalPulseAt(s, this.elapsedSec - (1 - u) * histSec);
          const xPt = bx + u * traceW;
          const yPt = by + traceH - v * traceH;
          if (k === 0) c2d.moveTo(xPt, yPt);
          else c2d.lineTo(xPt, yPt);
        }
        c2d.stroke();

        // Refsdal gravitational time-delay tag once a lensed image is confirmed!
        if (s.selected) {
          c2d.font = '600 7.5px ui-monospace, SFMono-Regular, Menlo, monospace';
          c2d.fillStyle = this.palette.lockHex;
          c2d.textAlign = 'center';
          c2d.fillText(s.delayDays === 0 ? 'Δt 0d' : `Δt +${s.delayDays}d`, drawX, by + traceH + 9);
        }
        c2d.restore();
      }
    }

    this.drawSharedOverlays(c2d, w, h);
  }

  protected solveCurrentStage(_stage: 1 | 2 | 3): void {
    for (let i = 0; i < this.stars.length; i++) {
      if (this.stars[i].isMirage) {
        this.stars[i].selected = true;
      }
    }
  }

  protected override verifySolved(_stage: 1 | 2 | 3): boolean {
    const mirages = this.stars.filter((s) => s.isMirage);
    return mirages.length > 0 && mirages.every((s) => s.selected);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Strong gravitational lensing splits one background quasar into 2–4 images whose identical flare bursts arrive staggered by days (Refsdal time-delay cosmography), while foreground variable stars oscillate independently.',
      goalSummary:
        'Compare the scrolling light-curve cadence under each star against the top reference quasar burst and select every time-delayed mirage copy.',
      controlsDesktop:
        'Hover stars to audition their flare cadence and click all mirage images (or Tab/Arrows + Enter/Space).',
      controlsTouch:
        'Compare the scrolling cadence trace beneath each star and tap every time-delayed mirage image.',
      warmthEffect:
        'Warm H% broadens burst peaks and enhances hover cadence chimes; Cold H% sharpens spikes and reveals Refsdal Δt days & H₀ telemetry.',
    };
  }
}
