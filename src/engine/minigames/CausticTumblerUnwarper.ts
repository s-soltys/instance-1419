import { setupFullRetinaCanvas } from './canvasUtils';
import {
  bindCanvasPress,
  computeRawGate,
  drawFloatingDeltaPill,
  drawReticleFrame,
} from './reticleUtils';
import {
  clamp,
  computeInstrumentProfile,
  createSeededRng,
  HitstopRecoil,
  LatchController,
  resolveInstrumentPayout,
  SpringActuator,
  StuckTimeDirector,
} from './tactilePhysics';
import {
  CognitiveInstrumentProfile,
  IMinigame,
  MinigameContext,
  MinigameGrade,
} from './types';

interface CausticRing {
  id: number;
  label: string;
  radiusFrac: number;
  sweetAngle: number;
  spring: SpringActuator;
  locked: boolean;
  lastTickBucket: number;
}

export class CausticTumblerUnwarper implements IMinigame {
  readonly id = 'caustic_unwarper';
  readonly title = 'CAUSTIC TUMBLER UNWARPER';
  readonly subtitle = 'Tactile Shear Lockpick · Einstein Arc De-Projection';
  readonly instrumentCode = 'CAU-03';

  private ctx!: MinigameContext;
  private profile!: CognitiveInstrumentProfile;
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private unbindInput: (() => void) | null = null;
  private resizeObs: ResizeObserver | null = null;

  private rings: CausticRing[] = [];
  private activeRingIdx = 0;
  private isDraggingRing = false;
  private dragStartAngle = 0;
  private tensionHolding = false;
  private tensionCharge = 0;

  private rawActive = false;
  private latch = new LatchController();
  private director = new StuckTimeDirector();
  private hitstop = new HitstopRecoil();
  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private finished = false;
  private statusWhisper = 'Drag active ring to feel sweet-spot click · Right-click / [T] applies shear tension';

  private keyHandler = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'w') {
      this.tensionHolding = e.type === 'keydown';
    }
  };

  mount(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.profile = computeInstrumentProfile(ctx.state);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minigame-canvas';
    ctx.container.appendChild(this.canvas);
    this.g = setupFullRetinaCanvas(this.canvas);

    this.resizeObs = new ResizeObserver(() => {
      if (this.canvas.isConnected) this.g = setupFullRetinaCanvas(this.canvas);
    });
    this.resizeObs.observe(ctx.container);

    const rand = createSeededRng(`cau-${ctx.targetId}-${ctx.state.shift}`);
    const labels = ['INNER EINSTEIN ARC', 'QUADRUPOLE SHEAR', 'OUTER HORIZON SEAM'];
    const radii = [0.46, 0.65, 0.84];
    this.rings = labels.map((label, idx) => {
      const sweet = (rand() - 0.5) * Math.PI * 1.5;
      const start = sweet + (idx % 2 === 0 ? 1.15 : -1.25);
      return {
        id: idx,
        label,
        radiusFrac: radii[idx],
        sweetAngle: sweet,
        spring: new SpringActuator(start),
        locked: false,
        lastTickBucket: Math.round(start * 10),
      };
    });

    this.unbindInput = bindCanvasPress(this.canvas, {
      onDown: (x, y, w, h, btn) => this.handleDown(x, y, w, h, btn),
      onMove: (x, y, w, h) => this.handleMove(x, y, w, h),
      onUp: () => {
        this.isDraggingRing = false;
        this.tensionHolding = false;
      },
      onWheel: (dy) => {
        const ring = this.rings[this.activeRingIdx];
        if (ring && !ring.locked) ring.spring.target += dy * 0.0022;
      },
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('keyup', this.keyHandler);

    this.lastTime = performance.now();
    this.loop();
  }

  setWaveBand(bandIdx: number): void {
    this.ctx.bandIdx = bandIdx;
  }

  toggleRawResidual(force?: boolean): void {
    this.rawActive = force !== undefined ? force : !this.rawActive;
    this.ctx.audio?.playSolenoidClack(false);
  }

  triggerCaptureLatch(holding: boolean): void {
    this.latch.setHolding(holding);
  }

  requestPartialCommit(): void {
    const lockedCount = this.rings.filter((r) => r.locked).length;
    if (lockedCount < 2 || this.finished) return;
    this.commitFinish('partial', 0.65);
  }

  private getTensionBtnBounds(w: number, h: number) {
    return {
      x: w - 184,
      y: h * 0.5 - 38,
      bw: 152,
      bh: 76,
    };
  }

  private handleDown(x: number, y: number, w: number, h: number, btn: number): void {
    if (this.finished) return;

    // 1. Check on-screen SHEAR TENSION pad press (for touch / left-click accessibility)
    const tb = this.getTensionBtnBounds(w, h);
    if (x >= tb.x && x <= tb.x + tb.bw && y >= tb.y && y <= tb.y + tb.bh) {
      this.tensionHolding = true;
      return;
    }

    // 2. Right click applies tension anywhere
    if (btn === 2) {
      this.tensionHolding = true;
      return;
    }

    // 3. Pick nearest unlocked ring by radius & begin rotating
    const cx = w * 0.5;
    const cy = h * 0.5;
    const scale = Math.min(w, h) * 0.41;
    const distNorm = Math.hypot(x - cx, y - cy) / Math.max(1, scale);

    let bestIdx = this.activeRingIdx;
    let bestDelta = 99;
    this.rings.forEach((r, idx) => {
      if (r.locked) return;
      const d = Math.abs(distNorm - r.radiusFrac);
      if (d < bestDelta) {
        bestDelta = d;
        bestIdx = idx;
      }
    });
    if (!this.rings[bestIdx].locked) {
      this.activeRingIdx = bestIdx;
      this.isDraggingRing = true;
      this.dragStartAngle = Math.atan2(y - cy, x - cx) - this.rings[bestIdx].spring.target;
    }
  }

  private handleMove(x: number, y: number, w: number, h: number): void {
    if (!this.isDraggingRing || this.finished) return;
    const ring = this.rings[this.activeRingIdx];
    if (!ring || ring.locked) return;
    const cx = w * 0.5;
    const cy = h * 0.5;
    ring.spring.target = Math.atan2(y - cy, x - cx) - this.dragStartAngle;
  }

  private loop = (): void => {
    if (this.finished) return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    const rawDt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsed += rawDt;

    const recoil = this.hitstop.step(rawDt);
    const dt = recoil.frozen ? 0 : rawDt;

    const sweetTol = (0.22 * this.profile.detentWellScale) / this.profile.snapPrecisionMul;
    const bandMatch = this.ctx.bandIdx === 2 ? 1.0 : this.ctx.bandIdx === 3 ? 0.72 : 0.4;

    for (const r of this.rings) {
      if (r.locked) {
        r.spring.snap(r.sweetAngle);
        continue;
      }
      const prevBucket = r.lastTickBucket;
      r.spring.step(dt, {
        stiffness: 195,
        damping: 22,
        detentCenter: r.sweetAngle,
        detentRadius: sweetTol * 1.15,
        detentPull: this.profile.vibe === 'warm' ? 0.65 : 0.35,
      });
      const err = Math.abs(Math.atan2(Math.sin(r.spring.value - r.sweetAngle), Math.cos(r.spring.value - r.sweetAngle)));
      const bucket = Math.round(r.spring.value * 14);
      if (bucket !== prevBucket) {
        r.lastTickBucket = bucket;
        const inSweet = err < sweetTol;
        this.ctx.audio?.playTumblerClick(clamp(1 - err, 0, 1), inSweet);
      }
    }

    const active = this.rings[this.activeRingIdx];
    let activeErr = 0;
    if (active && !active.locked) {
      activeErr = Math.abs(
        Math.atan2(Math.sin(active.spring.value - active.sweetAngle), Math.cos(active.spring.value - active.sweetAngle))
      );
      const inSweet = activeErr < sweetTol;
      if (this.tensionHolding) {
        if (inSweet) {
          this.tensionCharge = Math.min(1, this.tensionCharge + dt * 2.1);
          if (this.tensionCharge >= 1) {
            active.locked = true;
            this.tensionCharge = 0;
            this.tensionHolding = false;
            this.hitstop.trigger(50, 5.5);
            this.ctx.audio?.playSolenoidClack(true);
            this.statusWhisper = `${active.label} pinned!`;
            const nextIdx = this.rings.findIndex((r) => !r.locked);
            if (nextIdx >= 0) this.activeRingIdx = nextIdx;
          }
        } else {
          // Misaligned tumbler kicks back gently like Skyrim/Cyberpunk tension probe
          this.tensionCharge = Math.max(0, this.tensionCharge - dt * 1.6);
          if (activeErr > sweetTol * 1.4 && Math.random() < dt * 8) {
            this.hitstop.trigger(22, 3);
            this.ctx.audio?.playSolenoidClack(false);
            this.statusWhisper = 'Shear bind! Rotate closer to sweet spot before holding tension';
          }
        }
      } else {
        this.tensionCharge = Math.max(0, this.tensionCharge - dt * 1.2);
      }
    }

    const lockedCount = this.rings.filter((r) => r.locked).length;
    const allLocked = lockedCount >= this.rings.length;
    const overall = (lockedCount + (active && !active.locked ? clamp(1 - activeErr / 1.5, 0, 0.8) : 0)) / this.rings.length;

    const assistTier = this.director.tick(dt, overall);
    const rawOk = computeRawGate(this.profile, this.rawActive);
    const latchOut = this.latch.tick(dt, allLocked && bandMatch >= 0.65 ? 1.0 : 0.0, rawOk);

    // Update audio beat + live 3D Cluster J1419-A gravitational lensing shader!
    if (active && !active.locked) {
      this.ctx.audio?.updateBeatSynth({
        beatHz: activeErr * 10,
        harmonicLock: clamp(1 - activeErr / 1.4, 0, 1),
        warmth: this.profile.harmonicWarmthGain,
        strain: this.tensionCharge,
      });
    } else if (allLocked) {
      this.ctx.audio?.updateBeatSynth({
        beatHz: 0,
        harmonicLock: 1,
        warmth: this.profile.harmonicWarmthGain,
        strain: latchOut.overclockZone ? 0.85 : 0.1,
      });
    }
    this.ctx.audio?.setWatchdogBed(latchOut.overclockZone ? 0.5 : 0);

    this.ctx.showcase?.applyInstrumentPatch({
      progress: overall,
      unwarpProgress: lockedCount / 3,
      ringTwist: active ? (active.spring.value - active.sweetAngle) * 0.8 : 0,
      seamReveal: allLocked ? 1.0 : lockedCount * 0.28,
    });

    const beatIndex: 1 | 2 | 3 = lockedCount < 2 ? 1 : !allLocked ? 2 : 3;
    const beatLabel =
      beatIndex === 1
        ? `01 ISOLATE (NEAR-IR [3] · ${lockedCount}/3 TUMBLERS)`
        : beatIndex === 2
        ? '02 EXPOSE (PIN FINAL CAUSTIC SHELL)'
        : rawOk
        ? '03 EXTRACT [HOLD SPACE]'
        : '03 OVER-REGULARIZED — PRESS [R]';

    this.ctx.onTelemetry?.({
      beatIndex,
      beatLabel,
      lockMeter: latchOut.lockProgress > 0 ? latchOut.lockProgress : overall,
      overclockZone: latchOut.overclockZone,
      rawResidualActive: this.rawActive,
      canCommitPartial: lockedCount >= 2 && (assistTier >= 3 || overall >= 0.6),
      telemetryReadout: `RINGS ${lockedCount}/3 · TENSION ${Math.round(this.tensionCharge * 100)}% · SHEAR ${(activeErr * 57.3).toFixed(1)}°`,
      cueWhisper:
        this.ctx.bandIdx !== 2
          ? 'Recommended Band: NEAR-IR [3] highlights Einstein arc caustics cleanly'
          : assistTier >= 2 && !allLocked
          ? 'Guide: Dotted marker shows sweet spot — drag ring knob into arc, then hold SHEAR TENSION'
          : this.statusWhisper,
      assistTier,
    });

    if (latchOut.completedGrade) {
      this.commitFinish(latchOut.completedGrade, clamp(0.75 + bandMatch * 0.25, 0, 1));
      return;
    }

    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.render(recoil.shakeX, recoil.shakeY, w, h, sweetTol, assistTier);
  };

  private render(
    shakeX: number,
    shakeY: number,
    w: number,
    h: number,
    sweetTol: number,
    assistTier: number
  ): void {
    const ctx = this.g;
    ctx.clearRect(0, 0, w, h);

    drawReticleFrame(ctx, w, h, this.profile, this.rawActive, this.elapsed, shakeX, shakeY);

    const cx = w * 0.5 + shakeX;
    const cy = h * 0.5 + shakeY;
    const scale = Math.min(w, h) * 0.41;
    const { theme } = this.profile;

    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      const rad = r.radiusFrac * scale;
      const isAct = i === this.activeRingIdx && !r.locked;
      const err = Math.abs(Math.atan2(Math.sin(r.spring.value - r.sweetAngle), Math.cos(r.spring.value - r.sweetAngle)));
      const inSweet = err < sweetTol;

      ctx.save();
      ctx.strokeStyle = r.locked
        ? theme.accentHex
        : isAct
        ? inSweet
          ? theme.accentHex
          : theme.secondaryHex
        : `rgba(${theme.secondaryRgb}, 0.25)`;
      ctx.lineWidth = r.locked ? 2.4 : isAct ? 2.0 : 1.1;

      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.stroke();

      // Sweet-spot bracket hint when active & warm/close OR assistTier >= 2
      if (!r.locked && (assistTier >= 2 || (isAct && err < sweetTol * 2.1))) {
        ctx.strokeStyle = `rgba(${theme.accentRgb}, ${inSweet ? 0.95 : 0.42})`;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, r.sweetAngle - sweetTol * 0.5, r.sweetAngle + sweetTol * 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draggable tumbler bead
      const bx = cx + Math.cos(r.spring.value) * rad;
      const by = cy + Math.sin(r.spring.value) * rad;
      ctx.fillStyle = r.locked ? theme.accentHex : isAct ? (inSweet ? theme.accentHex : '#fff') : theme.secondaryHex;
      ctx.beginPath();
      ctx.arc(bx, by, isAct ? 8 : 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (isAct) {
        drawFloatingDeltaPill(
          ctx,
          bx,
          by - 20,
          `${r.label} · ${(err * 57.3).toFixed(1)}°`,
          this.profile,
          inSweet
        );
      }
    }

    // Side interactive Shear Tension Button (Mouse Left + Touch friendly!)
    const tb = this.getTensionBtnBounds(w, h);
    ctx.save();
    ctx.fillStyle = this.tensionHolding ? `rgba(${theme.accentRgb}, 0.24)` : 'rgba(7, 11, 18, 0.72)';
    ctx.strokeStyle = this.tensionHolding ? theme.accentHex : `rgba(${theme.secondaryRgb}, 0.45)`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(tb.x, tb.y, tb.bw, tb.bh, 8);
    ctx.fill();
    ctx.stroke();

    // Tension fill bar
    ctx.fillStyle = theme.accentHex;
    ctx.fillRect(tb.x + 8, tb.y + tb.bh - 12, (tb.bw - 16) * this.tensionCharge, 5);

    ctx.fillStyle = theme.secondaryHex;
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HOLD SHEAR TENSION', tb.x + tb.bw * 0.5, tb.y + 28);
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillStyle = `rgba(${theme.secondaryRgb}, 0.65)`;
    ctx.fillText('[RMB / T / HOLD HERE]', tb.x + tb.bw * 0.5, tb.y + 45);
    ctx.restore();
  }

  private commitFinish(grade: MinigameGrade, accuracy: number): void {
    if (this.finished) return;
    this.finished = true;
    this.ctx.audio?.playCaptureShutter(grade);
    const elapsedSec = Math.round(this.elapsed * 10) / 10;
    const res = resolveInstrumentPayout(
      grade,
      elapsedSec,
      accuracy,
      'j1419_caustic_seam',
      'Einstein caustic unwarping exposed identical geodesic lattice tiling behind Cluster J1419-A.',
      `Caustic Tumbler Unwarper (${grade}) solved in ${elapsedSec}s.`
    );
    window.setTimeout(() => this.ctx.onComplete(res), 420);
  }

  destroy(): void {
    this.finished = true;
    cancelAnimationFrame(this.rafId);
    this.unbindInput?.();
    this.resizeObs?.disconnect();
    window.removeEventListener('keydown', this.keyHandler);
    window.removeEventListener('keyup', this.keyHandler);
    this.ctx.audio?.stopInstrumentAudio();
    this.ctx.showcase?.resetInstrumentState();
    this.canvas.remove();
  }
}
