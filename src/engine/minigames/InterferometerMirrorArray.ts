import { computeOpticalClarity, setupRetinaCanvas } from './canvasUtils';
import type { IMinigame, MinigameContext } from './types';

interface MirrorDef {
  x: number;
  y: number;
  angle: number;
}

interface BenchStage {
  emitter: { x: number; y: number; angle: number };
  targets: { x: number; y: number }[];
  blockers: { x: number; y: number; r: number }[];
  mirrors: MirrorDef[];
}

const STAGES: BenchStage[] = [
  {
    emitter: { x: 48, y: 135, angle: 0 },
    targets: [{ x: 430, y: 55 }],
    blockers: [{ x: 245, y: 118, r: 34 }],
    mirrors: [
      { x: 185, y: 135, angle: -0.35 },
      { x: 185, y: 215, angle: 0.65 },
      { x: 430, y: 215, angle: -0.6 },
    ],
  },
  {
    emitter: { x: 48, y: 65, angle: 0 },
    targets: [{ x: 435, y: 205 }],
    blockers: [
      { x: 235, y: 65, r: 32 },
      { x: 280, y: 195, r: 32 },
    ],
    mirrors: [
      { x: 155, y: 65, angle: 0.4 },
      { x: 155, y: 210, angle: -0.4 },
      { x: 380, y: 110, angle: 0.8 },
    ],
  },
  {
    emitter: { x: 48, y: 135, angle: 0 },
    targets: [
      { x: 432, y: 52 },
      { x: 432, y: 218 },
    ],
    blockers: [
      { x: 240, y: 135, r: 32 },
      { x: 355, y: 135, r: 24 },
    ],
    mirrors: [
      { x: 155, y: 135, angle: -0.4 },
      { x: 155, y: 52, angle: 0.3 },
      { x: 315, y: 52, angle: -0.3 },
    ],
  },
];

const LOGICAL_W = 480;
const LOGICAL_H = 264;

/**
 * Minigame 4: Interferometer Mirror Array.
 * Rotate mirrors to bounce starlight around dust blockers into sensor nodes.
 * Stage 3 includes a distinct diamond prism 50/50 beam splitter on Mirror 2.
 * Canon H% + opticalFidelity contract: low H% / high clarity renders razor-sharp cyan raytracing
 * and faster sensor integration; high H% adds warm optical bloom & subtle thermal tremor.
 */
export class InterferometerMirrorArray implements IMinigame {
  readonly id = 'mirror_array';
  readonly title = 'Interferometer Mirror Array';
  readonly tagline = 'Drag around any mirror to angle starlight into the sensor node.';
  readonly warmthNote =
    'High H: warm optical scatter & subtle thermal tremor · Low H / High Clarity: crisp beam raytrace & fast lock';

  private ctx!: MinigameContext;
  private humanity = 70;
  private opticalFidelity = 0.55;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private hintEl!: HTMLElement;

  private stageIdx = 0;
  private mirrors: MirrorDef[] = [];
  private activeMirror = -1;
  private lastPointerAngle = 0;
  private lockHold = 0;
  private startedAt = 0;
  private lastTime = 0;
  private rafId = 0;
  private destroyed = false;

  mount(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.humanity = ctx.humanity;
    this.opticalFidelity = ctx.opticalFidelity;
    this.stageIdx = 0;
    this.startedAt = performance.now();
    this.lastTime = this.startedAt;
    this.destroyed = false;

    ctx.container.innerHTML = `
      <div class="mg-shell">
        <div class="mg-head">
          <div>
            <div class="mg-title">${this.title}</div>
            <div class="mg-sub" id="mg-hint">${this.tagline}</div>
          </div>
          <button class="etched-action" id="mg-cancel" type="button">BACK</button>
        </div>
        <div class="mg-canvas-wrap">
          <canvas id="mg-canvas"></canvas>
        </div>
      </div>
    `;

    this.canvas = ctx.container.querySelector('#mg-canvas')!;
    this.c2d = this.canvas.getContext('2d')!;
    setupRetinaCanvas(this.canvas, this.c2d, LOGICAL_W, LOGICAL_H);
    this.hintEl = ctx.container.querySelector('#mg-hint')!;
    this.setupStage(0);

    ctx.container.querySelector('#mg-cancel')?.addEventListener('click', () => ctx.onCancel());

    const toPos = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (LOGICAL_W / Math.max(1, rect.width)),
        y: (e.clientY - rect.top) * (LOGICAL_H / Math.max(1, rect.height)),
      };
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      const p = toPos(e);
      let best = -1;
      let bestD = 38;
      for (let i = 0; i < this.mirrors.length; i++) {
        const d = Math.hypot(p.x - this.mirrors[i].x, p.y - this.mirrors[i].y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best !== -1) {
        this.activeMirror = best;
        this.canvas.setPointerCapture(e.pointerId);
        this.lastPointerAngle = Math.atan2(p.y - this.mirrors[best].y, p.x - this.mirrors[best].x);
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.activeMirror === -1) return;
      const p = toPos(e);
      const m = this.mirrors[this.activeMirror];
      const ang = Math.atan2(p.y - m.y, p.x - m.x);
      let delta = ang - this.lastPointerAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      this.lastPointerAngle = ang;
      m.angle += delta;
    });

    const up = () => {
      this.activeMirror = -1;
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);

    this.ctx.onStageUpdate(`Bench 1 of ${STAGES.length}`, 0);
    this.loop();
  }

  private setupStage(idx: number): void {
    const st = STAGES[idx % STAGES.length];
    this.mirrors = st.mirrors.map((m) => ({ ...m }));
    this.lockHold = 0;
  }

  setSignalProfile(humanity: number, opticalFidelity: number): void {
    this.humanity = humanity;
    this.opticalFidelity = opticalFidelity;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  private traceBeam(
    ox: number,
    oy: number,
    dx: number,
    dy: number,
    stage: BenchStage,
    hitTargets: Set<number>,
    segments: { x1: number; y1: number; x2: number; y2: number }[],
    depth = 0
  ): void {
    if (depth > 6) return;
    let bestT = 650;
    let hitType: 'none' | 'blocker' | 'target' | 'mirror' = 'none';
    let hitIdx = -1;

    for (let i = 0; i < stage.blockers.length; i++) {
      const b = stage.blockers[i];
      const fx = ox - b.x;
      const fy = oy - b.y;
      const proj = fx * dx + fy * dy;
      const c = fx * fx + fy * fy - b.r * b.r;
      const disc = proj * proj - c;
      if (disc >= 0) {
        const t = -proj - Math.sqrt(disc);
        if (t > 2 && t < bestT) {
          bestT = t;
          hitType = 'blocker';
          hitIdx = i;
        }
      }
    }

    for (let i = 0; i < stage.targets.length; i++) {
      const trg = stage.targets[i];
      const fx = ox - trg.x;
      const fy = oy - trg.y;
      const proj = fx * dx + fy * dy;
      const c = fx * fx + fy * fy - 16 * 16;
      const disc = proj * proj - c;
      if (disc >= 0) {
        const t = -proj - Math.sqrt(disc);
        if (t > 2 && t < bestT) {
          bestT = t;
          hitType = 'target';
          hitIdx = i;
        }
      }
    }

    for (let i = 0; i < this.mirrors.length; i++) {
      const m = this.mirrors[i];
      const mx = Math.cos(m.angle) * 24;
      const my = Math.sin(m.angle) * 24;
      const x1 = m.x - mx;
      const y1 = m.y - my;
      const x2 = m.x + mx;
      const y2 = m.y + my;

      const v1x = ox - x1;
      const v1y = oy - y1;
      const v2x = x2 - x1;
      const v2y = y2 - y1;
      const v3x = -dy;
      const v3y = dx;
      const dot = v2x * v3x + v2y * v3y;
      if (Math.abs(dot) < 0.0001) continue;
      const t1 = (v2x * v1y - v2y * v1x) / dot;
      const t2 = (v1x * v3x + v1y * v3y) / dot;
      if (t1 > 3 && t1 < bestT && t2 >= 0 && t2 <= 1) {
        bestT = t1;
        hitType = 'mirror';
        hitIdx = i;
      }
    }

    const hx = ox + dx * bestT;
    const hy = oy + dy * bestT;
    segments.push({ x1: ox, y1: oy, x2: hx, y2: hy });

    if (hitType === 'target') {
      hitTargets.add(hitIdx);
    } else if (hitType === 'mirror') {
      const m = this.mirrors[hitIdx];
      let nx = -Math.sin(m.angle);
      let ny = Math.cos(m.angle);
      if (dx * nx + dy * ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const d = dx * nx + dy * ny;
      const rx = dx - 2 * d * nx;
      const ry = dy - 2 * d * ny;
      this.traceBeam(hx, hy, rx, ry, stage, hitTargets, segments, depth + 1);

      if (this.stageIdx === 2 && hitIdx === 1) {
        this.traceBeam(hx + dx * 4, hy + dy * 4, dx, dy, stage, hitTargets, segments, depth + 1);
      }
    }
  }

  private loop = (): void => {
    if (this.destroyed) return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    const clarity = computeOpticalClarity(this.humanity, this.opticalFidelity);
    const isHighClarity = clarity >= 0.62;
    const st = STAGES[this.stageIdx];

    if (this.activeMirror === -1 && clarity < 0.5) {
      this.mirrors[0].angle += Math.sin(now * 0.0014) * (0.5 - clarity) * 0.0012;
    }

    const hitTargets = new Set<number>();
    const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
    this.traceBeam(
      st.emitter.x,
      st.emitter.y,
      Math.cos(st.emitter.angle),
      Math.sin(st.emitter.angle),
      st,
      hitTargets,
      segments
    );

    const allHit = hitTargets.size === st.targets.length;
    const lockRate = 0.9 + clarity * 0.5;

    if (allHit) {
      this.lockHold = Math.min(1, this.lockHold + dt * lockRate);
      if (this.lockHold >= 1) {
        this.ctx.audio.playRingSnap();
        this.stageIdx++;
        if (this.stageIdx >= STAGES.length) {
          this.ctx.onStageUpdate('Optical Path Complete', 1);
          this.ctx.onComplete({
            minigameId: this.id,
            targetId: this.ctx.target.id,
            durationSec: Math.round((now - this.startedAt) / 1000),
          });
          return;
        }
        this.setupStage(this.stageIdx);
      }
    } else {
      this.lockHold = Math.max(0, this.lockHold - dt * 0.85);
    }

    this.hintEl.textContent = allHit
      ? 'SENSOR LOCKED — CALIBRATING BEAM…'
      : this.stageIdx === 2
        ? 'Diamond Prism (Mirror 2) splits the beam—hit BOTH sensor nodes at once.'
        : 'Drag around any mirror to tilt it and route starlight around the dust clouds.';

    this.ctx.onStageUpdate(
      `Bench ${this.stageIdx + 1} of ${STAGES.length} · ${hitTargets.size}/${st.targets.length} lit`,
      (this.stageIdx + this.lockHold) / STAGES.length
    );

    this.draw(isHighClarity, clarity, st, segments, hitTargets);
  };

  private draw(
    isHighClarity: boolean,
    clarity: number,
    st: BenchStage,
    segments: { x1: number; y1: number; x2: number; y2: number }[],
    hitTargets: Set<number>
  ): void {
    const w = LOGICAL_W;
    const h = LOGICAL_H;
    const c = this.c2d;

    c.clearRect(0, 0, w, h);

    for (const b of st.blockers) {
      c.fillStyle = 'rgba(14, 18, 28, 0.88)';
      c.strokeStyle = isHighClarity ? 'rgba(126, 200, 232, 0.25)' : 'rgba(200, 148, 120, 0.28)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }

    const allLit = hitTargets.size === st.targets.length;
    const beamCol = allLit ? '#7ad4b6' : isHighClarity ? '#7ec8e8' : '#ffd285';

    // Warm optical scatter halo when clarity is lower (High H)
    if (!isHighClarity) {
      c.strokeStyle = `rgba(255, 210, 133, ${(0.22 * (1 - clarity)).toFixed(2)})`;
      c.lineWidth = 7;
      for (const seg of segments) {
        c.beginPath();
        c.moveTo(seg.x1, seg.y1);
        c.lineTo(seg.x2, seg.y2);
        c.stroke();
      }
    }

    c.strokeStyle = beamCol;
    c.lineWidth = allLit ? 2.8 : 2;
    for (const seg of segments) {
      c.beginPath();
      c.moveTo(seg.x1, seg.y1);
      c.lineTo(seg.x2, seg.y2);
      c.stroke();
    }

    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(st.emitter.x, st.emitter.y, 6.5, 0, Math.PI * 2);
    c.fill();

    for (let i = 0; i < st.targets.length; i++) {
      const trg = st.targets[i];
      const lit = hitTargets.has(i);
      c.strokeStyle = lit ? '#7ad4b6' : 'rgba(235, 176, 98, 0.72)';
      c.fillStyle = lit ? 'rgba(122, 212, 182, 0.35)' : 'rgba(235, 176, 98, 0.1)';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(trg.x, trg.y, 14, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }

    for (let i = 0; i < this.mirrors.length; i++) {
      const m = this.mirrors[i];
      const isSplitter = this.stageIdx === 2 && i === 1;
      const mx = Math.cos(m.angle) * 24;
      const my = Math.sin(m.angle) * 24;

      c.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(m.x, m.y, 26, 0, Math.PI * 2);
      c.stroke();

      if (isSplitter) {
        c.strokeStyle = this.activeMirror === i ? '#ffffff' : '#7ad4b6';
        c.fillStyle = 'rgba(122, 212, 182, 0.16)';
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(m.x, m.y - 12);
        c.lineTo(m.x + 12, m.y);
        c.lineTo(m.x, m.y + 12);
        c.lineTo(m.x - 12, m.y);
        c.closePath();
        c.fill();
        c.stroke();
      }

      c.strokeStyle = this.activeMirror === i ? '#ffffff' : isSplitter ? '#7ec8e8' : '#d8eaf6';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(m.x - mx, m.y - my);
      c.lineTo(m.x + mx, m.y + my);
      c.stroke();
    }
  }
}
