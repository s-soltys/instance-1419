import { platform } from '../../platform/PlatformAdapter';
import { setupFullRetinaCanvas } from './canvasUtils';
import {
  drawAmbientStars,
  drawCosmicPlateBackdrop,
  drawStageUnlockPulse,
  generateAmbientStars,
  getCosmicPalette,
} from './cosmicBackdrop';
import { clamp, createSeededRng, resolveInstrumentPayout } from './tactilePhysics';
import type {
  IMinigame,
  InstrumentFieldGuide,
  MinigameContext,
  SolvabilityHarness,
} from './types';

interface GravityWell {
  tx: number;
  ty: number;
  gm: number;
  radius: number;
}

interface DustHazard {
  tx: number;
  ty: number;
  radius: number;
}

/**
 * ORB-07 — Gravity Slingshot
 * Open-space orbital slingshot with varied launch orientations across stages
 * (Bottom-Left -> Top-Right, Top-Right -> Bottom-Left, Bottom -> Top) and zero pre-solved initial aim.
 */
export class GravitySlingshotGame implements IMinigame {
  readonly id = 'gravity_slingshot';
  readonly title = 'GRAVITY SLINGSHOT';
  readonly subtitle = 'Orbital Trajectory Bending';
  readonly instrumentCode = 'ORB-07';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private launcher = { tx: 0.24, ty: 0.74 };
  private wells: GravityWell[] = [];
  private hazards: DustHazard[] = [];
  private gateBase = { tx: 1.46, ty: 0.28, radius: 0.095, moveAmpX: 0, moveAmpY: 0 };

  private aimVx = 0;
  private aimVy = 0;
  private hasAimed = false;
  private isDraggingAim = false;

  private probe = { active: false, tx: 0.24, ty: 0.74, vx: 0, vy: 0, trail: [] as Array<{ tx: number; ty: number }> };
  private impactFlash: { tx: number; ty: number; ok: boolean; timer: number } | null = null;
  private stageClearTimer = 0;
  private stageFlash = 0;
  private stageFlashText = '';
  private wrongTapCount = 0;
  private ambientStars = generateAmbientStars(createSeededRng('orb-stars'), 46);
  private unbind: (() => void) | null = null;

  mount(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.startedAt = performance.now();
    this.completed = false;
    this.elapsedSec = 0;
    this.wrongTapCount = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minigame-canvas';
    ctx.container.innerHTML = '';
    ctx.container.appendChild(this.canvas);
    this.c2d = setupFullRetinaCanvas(this.canvas);

    this.setupStage(1);
    this.bindEvents();
    this.emitHud();
    ctx.onCalibrationComplete?.();

    this.lastTs = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTs) / 1000));
      this.lastTs = now;
      this.update(dt);
      this.render();
      if (!this.completed) {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(tick);
    }
  }

  private setupStage(stage: 1 | 2 | 3): void {
    this.stage = stage;
    this.stageClearTimer = 0;
    this.impactFlash = null;
    this.hasAimed = false;
    this.aimVx = 0;
    this.aimVy = 0;

    if (stage === 1) {
      // Bottom-Left -> Top-Right around gravity well & dust
      this.launcher = { tx: 0.24, ty: 0.74 };
      this.wells = [{ tx: 0.84, ty: 0.36, gm: 0.23, radius: 0.068 }];
      this.hazards = [{ tx: 0.86, ty: 0.72, radius: 0.145 }];
      this.gateBase = { tx: 1.48, ty: 0.28, radius: 0.095, moveAmpX: 0, moveAmpY: 0 };
    } else if (stage === 2) {
      // Top-Right -> Bottom-Left S-curve between two wells
      this.launcher = { tx: 1.5, ty: 0.24 };
      this.wells = [
        { tx: 1.12, ty: 0.56, gm: 0.21, radius: 0.064 },
        { tx: 0.62, ty: 0.34, gm: 0.21, radius: 0.064 },
      ];
      this.hazards = [{ tx: 0.88, ty: 0.78, radius: 0.12 }];
      this.gateBase = { tx: 0.24, ty: 0.74, radius: 0.09, moveAmpX: 0, moveAmpY: 0 };
    } else {
      // Bottom-Center -> Top moving collector between twin wells
      this.launcher = { tx: 0.88, ty: 0.84 };
      this.wells = [
        { tx: 0.64, ty: 0.5, gm: 0.21, radius: 0.062 },
        { tx: 1.12, ty: 0.48, gm: 0.21, radius: 0.062 },
      ];
      this.hazards = [];
      this.gateBase = { tx: 0.88, ty: 0.2, radius: 0.088, moveAmpX: 0.26, moveAmpY: 0 };
    }

    this.resetProbe();
  }

  private getCurrentGatePos(): { tx: number; ty: number } {
    return {
      tx: this.gateBase.tx + Math.sin(this.elapsedSec * 1.3) * this.gateBase.moveAmpX,
      ty: this.gateBase.ty + Math.cos(this.elapsedSec * 1.3) * this.gateBase.moveAmpY,
    };
  }

  private resetProbe(): void {
    this.probe = {
      active: false,
      tx: this.launcher.tx,
      ty: this.launcher.ty,
      vx: 0,
      vy: 0,
      trail: [],
    };
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'reset_probe' && !this.completed && this.stageClearTimer <= 0) {
      this.resetProbe();
      this.ctx.audio?.playTumblerClick(0.6, false);
      this.emitHud();
    }
  }

  private getArenaBox(w: number, h: number) {
    const topPad = h < 450 ? 50 : 62;
    const botPad = h < 450 ? 64 : 84;
    const availH = Math.max(120, h - topPad - botPad);
    const availW = Math.max(200, w * 0.88);
    const tableW = Math.min(availW, availH * 1.75);
    const tableH = tableW / 1.75;
    return {
      left: (w - tableW) * 0.5,
      top: topPad + (availH - tableH) * 0.5,
      scale: tableH,
    };
  }

  private stepPhysicsPoint(state: { tx: number; ty: number; vx: number; vy: number }, dt: number): void {
    const sub = 4;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      let ax = 0;
      let ay = 0;
      for (const well of this.wells) {
        const dx = well.tx - state.tx;
        const dy = well.ty - state.ty;
        const r2 = dx * dx + dy * dy + 0.022;
        const inv = well.gm / (r2 * Math.sqrt(r2));
        ax += dx * inv;
        ay += dy * inv;
      }
      state.vx += ax * h;
      state.vy += ay * h;
      state.tx += state.vx * h;
      state.ty += state.vy * h;
    }
  }

  private computePreviewArc(): Array<{ tx: number; ty: number }> {
    if (!this.hasAimed || Math.hypot(this.aimVx, this.aimVy) < 0.05) return [];
    const steps = this.stage === 1 ? 38 : this.stage === 2 ? 26 : 18;
    const sim = { tx: this.launcher.tx, ty: this.launcher.ty, vx: this.aimVx, vy: this.aimVy };
    const pts: Array<{ tx: number; ty: number }> = [{ tx: sim.tx, ty: sim.ty }];
    for (let i = 0; i < steps; i++) {
      this.stepPhysicsPoint(sim, 0.04);
      pts.push({ tx: sim.tx, ty: sim.ty });
      if (this.wells.some((w) => Math.hypot(sim.tx - w.tx, sim.ty - w.ty) < w.radius)) break;
      if (this.hazards.some((d) => Math.hypot(sim.tx - d.tx, sim.ty - d.ty) < d.radius)) break;
    }
    return pts;
  }

  private bindEvents(): void {
    const onResize = () => {
      this.c2d = setupFullRetinaCanvas(this.canvas);
    };

    const clientToTable = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      const box = this.getArenaBox(Math.max(1, rect.width), Math.max(1, rect.height));
      return {
        tx: (clientX - rect.left - box.left) / box.scale,
        ty: (clientY - rect.top - box.top) / box.scale,
      };
    };

    const setAimFromPointer = (tx: number, ty: number, useBowstring: boolean) => {
      const dx = useBowstring ? this.launcher.tx - tx : tx - this.launcher.tx;
      const dy = useBowstring ? this.launcher.ty - ty : ty - this.launcher.ty;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.03) return;
      this.hasAimed = true;
      const mag = clamp(useBowstring ? dist * 3.1 : dist * 1.15, 0.55, 1.38);
      this.aimVx = (dx / dist) * mag;
      this.aimVy = (dy / dist) * mag;
    };

    let bowstringMode = false;

    const onDown = (e: PointerEvent) => {
      if (this.completed || this.stageClearTimer > 0) return;
      this.canvas.setPointerCapture(e.pointerId);
      if (this.probe.active) this.resetProbe();
      this.isDraggingAim = true;
      const { tx, ty } = clientToTable(e.clientX, e.clientY);
      // Slingshot pullback if pressed close to launcher node, otherwise forward vector toward pointer
      bowstringMode = Math.hypot(tx - this.launcher.tx, ty - this.launcher.ty) < 0.26;
      setAimFromPointer(tx, ty, bowstringMode);
      platform.triggerHaptic('vernierTick', 0.45);
    };

    const onMove = (e: PointerEvent) => {
      if (!this.isDraggingAim || this.completed) return;
      const { tx, ty } = clientToTable(e.clientX, e.clientY);
      setAimFromPointer(tx, ty, bowstringMode);
    };

    const onUp = () => {
      if (!this.isDraggingAim || this.completed) return;
      this.isDraggingAim = false;
      if (this.hasAimed && Math.hypot(this.aimVx, this.aimVy) > 0.1) {
        this.launchProbe();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.completed || this.stageClearTimer > 0) return;
      if (!this.hasAimed) {
        this.hasAimed = true;
        this.aimVx = this.stage === 2 ? -0.85 : this.stage === 3 ? 0.0 : 0.85;
        this.aimVy = this.stage === 3 ? -0.9 : -0.2;
      }
      if (e.key === 'ArrowUp') this.aimVy = clamp(this.aimVy - 0.06, -1.35, 1.35);
      if (e.key === 'ArrowDown') this.aimVy = clamp(this.aimVy + 0.06, -1.35, 1.35);
      if (e.key === 'ArrowLeft') this.aimVx = clamp(this.aimVx - 0.06, -1.35, 1.35);
      if (e.key === 'ArrowRight') this.aimVx = clamp(this.aimVx + 0.06, -1.35, 1.35);
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this.launchProbe();
      }
    };

    window.addEventListener('resize', onResize);
    this.canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKeyDown);

    this.unbind = () => {
      window.removeEventListener('resize', onResize);
      this.canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }

  private launchProbe(): void {
    this.probe = {
      active: true,
      tx: this.launcher.tx,
      ty: this.launcher.ty,
      vx: this.aimVx,
      vy: this.aimVy,
      trail: [{ tx: this.launcher.tx, ty: this.launcher.ty }],
    };
    this.ctx.audio?.playSolenoidClack(false);
    platform.triggerHaptic('vernierTick', 0.72);
    this.emitHud();
  }

  private update(dt: number): void {
    if (this.completed) return;
    this.elapsedSec += dt;
    this.stageFlash = Math.max(0, this.stageFlash - dt * 1.4);

    if (this.impactFlash) {
      this.impactFlash.timer -= dt;
      if (this.impactFlash.timer <= 0) this.impactFlash = null;
    }

    if (this.probe.active && this.stageClearTimer <= 0) {
      this.stepPhysicsPoint(this.probe, dt * 1.25);
      this.probe.trail.push({ tx: this.probe.tx, ty: this.probe.ty });
      if (this.probe.trail.length > 75) this.probe.trail.shift();

      const gate = this.getCurrentGatePos();
      if (Math.hypot(this.probe.tx - gate.tx, this.probe.ty - gate.ty) <= this.gateBase.radius) {
        this.probe.active = false;
        this.impactFlash = { tx: gate.tx, ty: gate.ty, ok: true, timer: 0.7 };
        this.stageClearTimer = 0.7;
        this.stageFlash = 1;
        this.stageFlashText = `SLINGSHOT INSERTION ${this.stage}/3 LOCKED`;
        platform.triggerHaptic('phaseSnapLock', 0.95);
        this.ctx.audio?.playPhaseLock?.(this.stage);
        this.emitHud();
        return;
      }

      const hitWell = this.wells.some((w) => Math.hypot(this.probe.tx - w.tx, this.probe.ty - w.ty) <= w.radius);
      const hitDust = this.hazards.some((d) => Math.hypot(this.probe.tx - d.tx, this.probe.ty - d.ty) <= d.radius);
      const outBounds =
        this.probe.tx < -0.08 || this.probe.tx > 1.84 || this.probe.ty < -0.08 || this.probe.ty > 1.08;

      if (hitWell || hitDust || outBounds) {
        this.wrongTapCount += 1;
        this.impactFlash = { tx: this.probe.tx, ty: this.probe.ty, ok: false, timer: 0.45 };
        this.resetProbe();
        platform.triggerHaptic('rejectThud', 0.55);
        this.ctx.audio?.playTumblerClick(0.3, false);
        this.emitHud('Probe missed collector — pull or drag from the launcher again!');
      }
    }

    if (this.stageClearTimer > 0) {
      this.stageClearTimer -= dt;
      if (this.stageClearTimer <= 0) {
        if (this.stage < 3) {
          this.setupStage((this.stage + 1) as 2 | 3);
          this.emitHud();
        } else {
          this.finishSuccess();
        }
      }
    }
  }

  private finishSuccess(): void {
    if (this.completed) return;
    this.completed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.ctx.audio?.stopInstrumentAudio();
    this.ctx.audio?.playCaptureShutter('clean');
    platform.triggerHaptic('shutterCommit', 1.0);

    const acc = clamp(1 - this.wrongTapCount * 0.05, 0.72, 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.ctx.onComplete(
      resolveInstrumentPayout(
        'clean',
        totalSec,
        acc,
        `${this.ctx.targetId}_slingshot`,
        `Gravitational assist slingshot trajectories inserted cleanly on ${this.ctx.targetName}.`,
        `Orbital Accuracy ${(acc * 100).toFixed(0)}% · ${totalSec.toFixed(1)}s`,
        'Orbital Mechanics & Gravitational Assist Slingshot'
      )
    );
  }

  private emitHud(overridePrompt?: string): void {
    const labelMap: Record<1 | 2 | 3, string> = {
      1: '1/3 · EASY',
      2: '2/3 · MEDIUM',
      3: '3/3 · HARD',
    };
    const defaultPrompt =
      this.stage === 1
        ? 'Pull from the pulsing bottom-left launcher and curve the light-probe into the top-right gate.'
        : this.stage === 2
        ? 'Reverse course: slingshot from top-right to bottom-left between both gravity wells.'
        : 'Thread upward from the bottom launcher into the gliding collector gate!';

    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: labelMap[this.stage],
      stageProgress: clamp((this.stage - 1 + (this.stageClearTimer > 0 ? 1 : 0)) / 3, 0, 1),
      promptText: overridePrompt ?? defaultPrompt,
      actionButton: this.probe.active ? { id: 'reset_probe', label: 'RELOAD PROBE' } : null,
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'smacs',
      blurPx: 4,
      alpha: 0.44,
      brightness: 0.76,
      scale: 1.03,
      tintAlpha: 0.5,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.72);

    const box = this.getArenaBox(w, h);
    const toPx = (tx: number, ty: number) => ({
      x: box.left + tx * box.scale,
      y: box.top + ty * box.scale,
    });

    // Dust hazards in open space (no rectangular arena box border!)
    for (const d of this.hazards) {
      const p = toPx(d.tx, d.ty);
      const rPx = d.radius * box.scale;
      c2d.save();
      const grad = c2d.createRadialGradient(p.x, p.y, 4, p.x, p.y, rPx);
      grad.addColorStop(0, 'rgba(30, 18, 12, 0.94)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      c2d.fillStyle = grad;
      c2d.beginPath();
      c2d.arc(p.x, p.y, rPx, 0, Math.PI * 2);
      c2d.fill();
      c2d.strokeStyle = 'rgba(255, 148, 92, 0.3)';
      c2d.setLineDash([4, 4]);
      c2d.beginPath();
      c2d.arc(p.x, p.y, rPx, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    }

    for (const well of this.wells) {
      const wp = toPx(well.tx, well.ty);
      const rPx = well.radius * box.scale;
      c2d.save();
      const g = c2d.createRadialGradient(wp.x, wp.y, 2, wp.x, wp.y, rPx * 2.8);
      g.addColorStop(0, '#fff7dc');
      g.addColorStop(0.28, palette.accentHex);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c2d.fillStyle = g;
      c2d.beginPath();
      c2d.arc(wp.x, wp.y, rPx * 2.8, 0, Math.PI * 2);
      c2d.fill();

      for (let ring = 1; ring <= 2; ring++) {
        c2d.strokeStyle = `rgba(${palette.accentRgb}, ${(0.28 / ring).toFixed(2)})`;
        c2d.lineWidth = 1;
        c2d.beginPath();
        c2d.arc(wp.x, wp.y, rPx * (1.5 + ring * 0.85), 0, Math.PI * 2);
        c2d.stroke();
      }
      c2d.restore();
    }

    const gate = this.getCurrentGatePos();
    const gp = toPx(gate.tx, gate.ty);
    const gateR = this.gateBase.radius * box.scale;
    c2d.save();
    c2d.strokeStyle = palette.lockHex;
    c2d.fillStyle = `rgba(${palette.lockRgb}, ${this.stageClearTimer > 0 ? '0.35' : '0.12'})`;
    c2d.lineWidth = 2.4;
    c2d.beginPath();
    c2d.arc(gp.x, gp.y, gateR, 0, Math.PI * 2);
    c2d.fill();
    c2d.stroke();
    c2d.restore();

    if (!this.probe.active && this.stageClearTimer <= 0 && this.hasAimed) {
      const arc = this.computePreviewArc();
      if (arc.length >= 2) {
        c2d.save();
        c2d.strokeStyle = palette.secondaryHex;
        c2d.globalAlpha = this.isDraggingAim ? 0.85 : 0.45;
        c2d.lineWidth = 1.8;
        c2d.setLineDash([4, 5]);
        c2d.beginPath();
        arc.forEach((pt, idx) => {
          const sp = toPx(pt.tx, pt.ty);
          if (idx === 0) c2d.moveTo(sp.x, sp.y);
          else c2d.lineTo(sp.x, sp.y);
        });
        c2d.stroke();
        c2d.restore();
      }
    }

    const lp = toPx(this.launcher.tx, this.launcher.ty);
    c2d.save();
    if (!this.hasAimed && !this.probe.active) {
      const pulse = 18 + Math.sin(this.elapsedSec * 4) * 5;
      c2d.strokeStyle = `rgba(${palette.accentRgb}, 0.55)`;
      c2d.lineWidth = 1.5;
      c2d.beginPath();
      c2d.arc(lp.x, lp.y, pulse, 0, Math.PI * 2);
      c2d.stroke();
    }

    c2d.strokeStyle = palette.accentHex;
    c2d.lineWidth = 2;
    c2d.beginPath();
    c2d.arc(lp.x, lp.y, 14, 0, Math.PI * 2);
    c2d.stroke();

    if (!this.probe.active && this.stageClearTimer <= 0 && this.hasAimed) {
      const pullX = lp.x - this.aimVx * 36;
      const pullY = lp.y - this.aimVy * 36;
      c2d.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      c2d.lineWidth = 1.4;
      c2d.beginPath();
      c2d.moveTo(lp.x, lp.y);
      c2d.lineTo(pullX, pullY);
      c2d.stroke();
      c2d.fillStyle = palette.accentHex;
      c2d.beginPath();
      c2d.arc(pullX, pullY, 5, 0, Math.PI * 2);
      c2d.fill();
    }
    c2d.restore();

    if (this.probe.active) {
      c2d.save();
      c2d.strokeStyle = palette.secondaryHex;
      c2d.lineWidth = 2.2;
      c2d.beginPath();
      this.probe.trail.forEach((pt, idx) => {
        const sp = toPx(pt.tx, pt.ty);
        if (idx === 0) c2d.moveTo(sp.x, sp.y);
        else c2d.lineTo(sp.x, sp.y);
      });
      c2d.stroke();

      const pp = toPx(this.probe.tx, this.probe.ty);
      c2d.fillStyle = '#ffffff';
      c2d.shadowColor = palette.secondaryHex;
      c2d.shadowBlur = 14;
      c2d.beginPath();
      c2d.arc(pp.x, pp.y, 5.5, 0, Math.PI * 2);
      c2d.fill();
      c2d.restore();
    }

    if (this.impactFlash) {
      const fp = toPx(this.impactFlash.tx, this.impactFlash.ty);
      c2d.save();
      c2d.strokeStyle = this.impactFlash.ok ? palette.lockHex : '#ff8b5e';
      c2d.globalAlpha = clamp(this.impactFlash.timer * 2, 0, 1);
      c2d.lineWidth = 2.5;
      c2d.beginPath();
      c2d.arc(fp.x, fp.y, 24, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    }

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Spacecraft harvest momentum by curving cleanly around stellar gravity wells, threading narrow orbital corridors from any insertion direction.',
      goalSummary:
        'Aim and launch the light-probe so stellar gravity bends its trajectory into the collector gate across 3 distinct launch vectors.',
      controlsDesktop: 'Drag from the pulsing launcher ring and release to fire (or Arrow keys + Space).',
      controlsTouch: 'Touch and drag from the launcher ring to preview your curved arc, then release.',
      warmthEffect: 'Warm H% gives brighter golden contours; Cold H% tightens cyan telemetry guides.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.stageClearTimer = 0.01;
        if (stage < 3) {
          this.setupStage((stage + 1) as 2 | 3);
        } else {
          this.finishSuccess();
        }
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed ? 1 : (this.stage - 1 + (this.stageClearTimer > 0 ? 1 : 0)) / 3,
      }),
    };
  }

  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.unbind?.();
    this.unbind = null;
    this.ctx.audio?.stopInstrumentAudio();
    this.ctx.container.innerHTML = '';
  }
}
