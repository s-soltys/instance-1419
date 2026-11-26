export type WakeupAnimPhase =
  | 'anim_handoff_static'
  | 'anim_transfer'
  | 'anim_epochs'
  | 'anim_shell'
  | 'anim_blind_clock'
  | 'anim_aperture';

const VALID_PHASES: ReadonlySet<string> = new Set<WakeupAnimPhase>([
  'anim_handoff_static',
  'anim_transfer',
  'anim_epochs',
  'anim_shell',
  'anim_blind_clock',
  'anim_aperture',
]);

const DEFAULT_CAPTIONS: Record<WakeupAnimPhase, { code: string; label: string }> = {
  anim_handoff_static: { code: '00 // TRANSFER STANDBY', label: 'CALIBRATING CARRIER · WHITE NOISE FLOOR' },
  anim_transfer: { code: '01 // ARCHIVE TRANSFER', label: 'CONNECTOME UPLOAD · NAMES COMPRESSED' },
  anim_epochs: { code: '02 // DEEP TIME', label: '41,802 YEARS · 1,417 PRIOR INSTANCES' },
  anim_shell: { code: '03 // SURVEY BASELINE', label: '10.0 LY PAST SOL–CENTAURI · 14 LIGHT-MIN PAIR' },
  anim_blind_clock: { code: '04 // CARETAKER BOUNDARY', label: 'BLIND OUTSIDE HULL · 24-MONTH CLOCK' },
  anim_aperture: { code: '05 // APERTURE CLEAR', label: 'UNSEALING OPTICAL SHELL' },
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutCubic(t: number): number {
  const k = 1 - clamp01(t);
  return 1 - k * k * k;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Pure, minimalist Zeiss-glass vector schematic rendered on a DPR-capped 2D canvas
 * during the Overseer Wake-Up Briefing. Zero shadowBlur, zero per-frame gradient allocations,
 * zero layout reads inside rAF — strictly respects PR #1 GPU/CPU performance hygiene.
 */
export class WakeupBriefingCanvas {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly c2d: CanvasRenderingContext2D;
  private resizeObserver: ResizeObserver | null = null;
  private width = 1280;
  private height = 720;
  private dpr = 1;

  private active = false;
  private rafId = 0;
  private lastTs = 0;
  private elapsedSec = 0;

  private phase: WakeupAnimPhase = 'anim_transfer';
  private prevPhase: WakeupAnimPhase | null = null;
  private phaseElapsed = 0;
  private transitionT = 1;

  private captions: Record<WakeupAnimPhase, { code: string; label: string }> = { ...DEFAULT_CAPTIONS };

  // Precomputed deterministic star / tick / static seeds (0 per-frame allocations)
  private readonly epochTicks: Float32Array;
  private readonly dustMotes: Float32Array;
  private readonly staticSeeds: Float32Array;

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wakeup-briefing-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    container.innerHTML = '';
    container.appendChild(this.canvas);
    this.c2d = this.canvas.getContext('2d')!;

    // Precompute 180 representative tick phases for the 1,417 prior instances halo
    this.epochTicks = new Float32Array(180 * 3);
    let seed = 141941802;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 180; i++) {
      this.epochTicks[i * 3] = (i / 180) * Math.PI * 2 + (rand() - 0.5) * 0.02;
      this.epochTicks[i * 3 + 1] = 0.62 + (i % 5) * 0.088 + rand() * 0.025;
      this.epochTicks[i * 3 + 2] = 0.25 + rand() * 0.75;
    }

    this.dustMotes = new Float32Array(42 * 3);
    for (let i = 0; i < 42; i++) {
      this.dustMotes[i * 3] = rand();
      this.dustMotes[i * 3 + 1] = rand();
      this.dustMotes[i * 3 + 2] = 0.5 + rand() * 1.4;
    }

    // 260 deterministic static noise specks / analog scan slivers
    this.staticSeeds = new Float32Array(260 * 4);
    for (let i = 0; i < 260; i++) {
      this.staticSeeds[i * 4] = rand();
      this.staticSeeds[i * 4 + 1] = rand();
      this.staticSeeds[i * 4 + 2] = 1.2 + rand() * 5.2;
      this.staticSeeds[i * 4 + 3] = rand();
    }

    this.syncSize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncSize());
      this.resizeObserver.observe(container);
    }
  }

  setCaptions(overrides: Partial<Record<WakeupAnimPhase, string>>): void {
    for (const key of Object.keys(overrides) as WakeupAnimPhase[]) {
      const text = overrides[key];
      if (text && this.captions[key]) {
        this.captions[key] = { ...this.captions[key], label: text };
      }
    }
  }

  setPhase(rawPhase: string | undefined): void {
    const next: WakeupAnimPhase =
      rawPhase && VALID_PHASES.has(rawPhase) ? (rawPhase as WakeupAnimPhase) : 'anim_transfer';
    if (next === this.phase && this.transitionT >= 0.99) return;
    this.prevPhase = this.phase;
    this.phase = next;
    this.phaseElapsed = 0;
    this.transitionT = 0;
  }

  getPhase(): WakeupAnimPhase {
    return this.phase;
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (active) {
      this.syncSize();
      this.lastTs = performance.now();
      if (!this.rafId && typeof requestAnimationFrame !== 'undefined') {
        this.rafId = requestAnimationFrame(this.loop);
      }
    } else if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private syncSize(): void {
    const w = Math.max(1, this.container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280));
    const h = Math.max(1, this.container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 720));
    this.dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.c2d.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private loop = (now: number): void => {
    if (!this.active) return;
    this.rafId = requestAnimationFrame(this.loop);

    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTs) / 1000));
    this.lastTs = now;
    this.elapsedSec += dt;
    this.phaseElapsed += dt;
    if (this.transitionT < 1) {
      this.transitionT = Math.min(1, this.transitionT + dt / 1.15);
    }

    this.render();
  };

  private render(): void {
    const ctx = this.c2d;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // Subtle dark schematic scrim on non-aperture phases so lines read crisply while aperture lets 3D stars breathe
    const apertureFade =
      this.phase === 'anim_aperture' ? 1 - easeOutCubic(clamp01(this.phaseElapsed / 3.9)) : 1;

    if (this.phase === 'anim_handoff_static') {
      ctx.fillStyle = 'rgba(2, 4, 8, 0.96)';
      ctx.fillRect(0, 0, w, h);
    } else if (apertureFade > 0.01) {
      ctx.fillStyle = `rgba(3, 6, 12, ${(0.82 * apertureFade).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Center schematic left-of-center so right-side interactive dialogue ribbon stays balanced
    const compact = w < 720 || h < 460;
    const cx = this.phase === 'anim_handoff_static' ? w * 0.5 : compact ? w * 0.36 : w * 0.33;
    const cy = h * 0.5;
    const radius = Math.min(w * (compact ? 0.27 : 0.24), h * 0.34);

    // Ambient subtle coordinate field + motes
    if (this.phase !== 'anim_handoff_static') {
      this.drawAmbientField(ctx, w, h, cx, cy, radius, apertureFade);
    }

    const easeIn = easeOutCubic(this.transitionT);
    if (this.prevPhase && this.prevPhase !== 'anim_handoff_static' && this.transitionT < 1) {
      const fadeOut = (1 - easeIn) * 0.85;
      if (fadeOut > 0.02) {
        this.drawPhase(ctx, this.prevPhase, cx, cy, radius, fadeOut, this.phaseElapsed + 1.5, w, h);
      }
    }

    this.drawPhase(ctx, this.phase, cx, cy, radius, easeIn, this.phaseElapsed, w, h);

    // Minimalist etched phase caption in lower-left negative space
    const cap = this.captions[this.phase];
    const capAlpha =
      this.phase === 'anim_aperture'
        ? easeIn * clamp01(1 - this.phaseElapsed / 3.8) * 0.72
        : this.phase === 'anim_handoff_static'
          ? 0
          : easeIn * 0.78;
    if (cap && capAlpha > 0.02) {
      const leftPad = Math.max(24, w * 0.035);
      const bottomY = h - Math.max(26, h * 0.05);
      ctx.save();
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = `rgba(126, 200, 232, ${(capAlpha * 0.85).toFixed(3)})`;
      ctx.fillText(cap.code, leftPad, bottomY - 15);
      ctx.fillStyle = `rgba(226, 236, 246, ${(capAlpha * 0.92).toFixed(3)})`;
      ctx.fillText(cap.label, leftPad, bottomY);
      ctx.restore();
    }
  }

  private drawAmbientField(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cx: number,
    cy: number,
    radius: number,
    alphaMul: number
  ): void {
    if (alphaMul <= 0.02) return;
    ctx.save();

    // Whisper-thin crosshair axes
    ctx.strokeStyle = `rgba(170, 206, 236, ${(0.075 * alphaMul).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - radius * 1.45, cy);
    ctx.lineTo(cx + radius * 1.45, cy);
    ctx.moveTo(cx, cy - radius * 1.35);
    ctx.lineTo(cx, cy + radius * 1.35);
    ctx.stroke();

    // Subtle outer optical calibration ring
    ctx.strokeStyle = `rgba(170, 206, 236, ${(0.12 * alphaMul).toFixed(3)})`;
    ctx.setLineDash([2, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Gentle drifting starlight dust motes
    for (let i = 0; i < 42; i++) {
      const mx = ((this.dustMotes[i * 3] + this.elapsedSec * 0.004 * this.dustMotes[i * 3 + 2]) % 1) * w;
      const my = this.dustMotes[i * 3 + 1] * h;
      const twinkle = 0.35 + 0.65 * Math.sin(this.elapsedSec * 1.1 + i * 1.7);
      ctx.fillStyle = `rgba(216, 232, 248, ${(0.16 * twinkle * alphaMul).toFixed(3)})`;
      ctx.fillRect(mx, my, 1.4, 1.4);
    }
    ctx.restore();
  }

  private drawPhase(
    ctx: CanvasRenderingContext2D,
    phase: WakeupAnimPhase,
    cx: number,
    cy: number,
    r: number,
    alpha: number,
    tSec: number,
    w: number,
    h: number
  ): void {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = clamp01(alpha);

    switch (phase) {
      case 'anim_handoff_static':
        this.drawHandoffStatic(ctx, w, h, cx, cy, r, tSec);
        break;
      case 'anim_transfer':
        this.drawTransfer(ctx, cx, cy, r, tSec);
        break;
      case 'anim_epochs':
        this.drawEpochs(ctx, cx, cy, r, tSec);
        break;
      case 'anim_shell':
        this.drawShell(ctx, cx, cy, r, tSec);
        break;
      case 'anim_blind_clock':
        this.drawBlindClock(ctx, cx, cy, r, tSec);
        break;
      case 'anim_aperture':
        this.drawAperture(ctx, cx, cy, r, tSec);
        break;
    }

    ctx.restore();
  }

  /** Phase 0: Prolonged shutdown white-noise calibration & deep-sleep handoff */
  private drawHandoffStatic(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cx: number,
    cy: number,
    r: number,
    tSec: number
  ): void {
    const calProgress = clamp01(tSec / 4.8);
    // Static intensity swells cleanly through middle standby and settles calm at 4.8s
    const staticEnv = clamp01(tSec / 0.45) * (1 - 0.72 * smoothstep01(3.6, 4.9, tSec));

    // Deterministic animated monochrome/cryo white-noise snow + faint horizontal sync bands
    const frameStep = Math.floor(this.elapsedSec * 24);
    for (let i = 0; i < 260; i++) {
      const s0 = this.staticSeeds[i * 4];
      const s1 = this.staticSeeds[i * 4 + 1];
      const len = this.staticSeeds[i * 4 + 2];
      const warm = this.staticSeeds[i * 4 + 3];
      const sx = ((s0 + ((frameStep * (37 + (i % 19))) % 997) / 997) % 1) * w;
      const sy = ((s1 + ((frameStep * (13 + (i % 11))) % 613) / 613) % 1) * h;
      const alpha = (0.04 + 0.16 * warm) * staticEnv;
      ctx.fillStyle = warm > 0.78 ? `rgba(176, 224, 248, ${alpha.toFixed(3)})` : `rgba(220, 232, 244, ${alpha.toFixed(3)})`;
      ctx.fillRect(sx, sy, len * (1 + staticEnv * 2.2), 1.1);
    }

    // Occasional soft horizontal analog tear lines
    for (let b = 0; b < 4; b++) {
      const bandY = (((b * 0.27 + this.elapsedSec * (0.21 + b * 0.08)) % 1)) * h;
      const bandA = (0.03 + 0.035 * Math.sin(this.elapsedSec * 5.2 + b)) * staticEnv;
      ctx.fillStyle = `rgba(148, 210, 244, ${Math.max(0, bandA).toFixed(3)})`;
      ctx.fillRect(0, bandY, w, 1.5);
    }

    // Center calibration waveform settling from lively static into a steady horizontal pulse
    const waveW = Math.min(w * 0.56, r * 2.5);
    const waveX0 = cx - waveW * 0.5;
    const waveY = cy - 42;
    ctx.strokeStyle = `rgba(164, 218, 246, ${(0.45 + 0.3 * (1 - calProgress)).toFixed(3)})`;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const u = i / 72;
      const px = waveX0 + u * waveW;
      const env = Math.sin(u * Math.PI);
      const jitter =
        Math.sin(u * 48 + this.elapsedSec * 29) * 0.5 +
        Math.cos(u * 83 - this.elapsedSec * 19) * 0.5;
      const amp = lerp(24, 2.5, smoothstep01(0.4, 4.6, tSec));
      const py = waveY + jitter * amp * env;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Sequential diegetic standby telemetry lines
    const lines: Array<{ at: number; text: string; tone: string }> = [
      { at: 0.35, text: '01 // SESSION SEALED · WARMTH BASELINE 70%', tone: 'rgba(235, 198, 146, {a})' },
      { at: 1.45, text: '02 // ARCHIVING CONNECTOME · DEEP STANDBY', tone: 'rgba(186, 216, 240, {a})' },
      { at: 2.75, text: '03 // SIGNAL ACQUIRED · OUTER SURVEY SHELL', tone: 'rgba(156, 218, 248, {a})' },
      { at: 3.95, text: '04 // ELAPSED: 41,802 YRS · WAKING WATCH #1419', tone: 'rgba(232, 244, 255, {a})' },
    ];
    ctx.font = '10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i < lines.length; i++) {
      const a = clamp01((tSec - lines[i].at) / 0.55) * 0.88;
      if (a <= 0.01) continue;
      ctx.fillStyle = lines[i].tone.replace('{a}', a.toFixed(3));
      ctx.fillText(lines[i].text, waveX0, cy + 8 + i * 20);
    }

    // Thin hairline calibration progress bar
    const barY = cy + 102;
    ctx.fillStyle = 'rgba(164, 206, 236, 0.16)';
    ctx.fillRect(waveX0, barY, waveW, 1.5);
    ctx.fillStyle = 'rgba(126, 200, 232, 0.86)';
    ctx.fillRect(waveX0, barY, waveW * easeOutCubic(calProgress), 1.5);
  }

  /** Phase 1: Warm amber pulse detaching from Sol–Centauri twin anchor into crisp geometric connectome waveform */
  private drawTransfer(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, tSec: number): void {
    const progress = easeOutCubic(clamp01(tSec / 1.8));
    const anchorX = cx - r * 0.72;
    const waveStartX = cx - r * 0.36;
    const waveEndX = cx + r * 0.92;

    // Warm Sol-Centauri twin anchor halo (concentric alpha rings — zero shadowBlur)
    const pulse = 0.85 + 0.15 * Math.sin(this.elapsedSec * 2.2);
    for (let k = 3; k >= 1; k--) {
      ctx.strokeStyle = `rgba(235, 176, 98, ${(0.12 * k * pulse).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(anchorX, cy, (10 + k * 14) * (0.94 + 0.06 * pulse), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd996';
    ctx.beginPath();
    ctx.arc(anchorX - 4, cy - 2, 3.4, 0, Math.PI * 2);
    ctx.arc(anchorX + 6, cy + 3, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Detaching amber transfer packet traveling along optical axis
    const travel = (this.elapsedSec * 0.34) % 1;
    const pktX = lerp(anchorX + 16, waveStartX, travel);
    ctx.strokeStyle = 'rgba(235, 176, 98, 0.36)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(anchorX + 14, cy);
    ctx.lineTo(waveStartX, cy);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 224, 166, ${(0.9 * (1 - travel * 0.4)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(pktX, cy, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // Morphing connectome waveform (warm organic wave -> crisp faceted telemetry carrier)
    const span = (waveEndX - waveStartX) * progress;
    ctx.strokeStyle = 'rgba(235, 176, 98, 0.72)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const px = waveStartX + u * span;
      const env = Math.sin(u * Math.PI);
      const organic = Math.sin(u * 14 - this.elapsedSec * 2.4) * 0.65 + Math.sin(u * 29 + this.elapsedSec * 1.4) * 0.35;
      const faceted = Math.round(organic * 3) / 3;
      const yOff = lerp(organic, faceted, u) * r * 0.24 * env;
      if (i === 0) ctx.moveTo(px, cy + yOff);
      else ctx.lineTo(px, cy + yOff);
    }
    ctx.stroke();

    // Geometric cyan harmonic echo trace
    ctx.strokeStyle = 'rgba(126, 200, 232, 0.56)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const px = waveStartX + u * span;
      const env = Math.sin(u * Math.PI);
      const yOff = -Math.sin(u * 18 - this.elapsedSec * 2.0) * r * 0.14 * env;
      if (i === 0) ctx.moveTo(px, cy + yOff);
      else ctx.lineTo(px, cy + yOff);
    }
    ctx.stroke();

    // Minimalist compressed-name bracket ticks
    ctx.font = '9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(235, 176, 98, 0.72)';
    ctx.fillText('SOL–α CEN', anchorX - 24, cy + r * 0.34);
    ctx.fillStyle = 'rgba(176, 214, 240, 0.68)';
    ctx.fillText('[NAMES COMPRESSED]', waveStartX + span * 0.22, cy - r * 0.32);
  }

  /** Phase 2: Logarithmic deep-time ring sweeping to 41,802 YRS with 1,417 concentric instance ticks */
  private drawEpochs(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, tSec: number): void {
    const sweep = easeOutCubic(clamp01(tSec / 1.9));
    const years = Math.round(41802 * sweep);
    const copies = Math.round(1417 * sweep);

    // Concentric deep-time rings
    for (let ring = 1; ring <= 4; ring++) {
      const rr = r * (0.34 + ring * 0.165);
      ctx.strokeStyle = `rgba(164, 204, 234, ${(0.09 + ring * 0.035).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Active sweeping epoch arc
    const startAng = -Math.PI * 0.5;
    const endAng = startAng + Math.PI * 2 * (0.08 + 0.92 * sweep);
    ctx.strokeStyle = 'rgba(126, 200, 232, 0.85)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.0, startAng, endAng);
    ctx.stroke();

    // 180 gossamer concentric instance ticks representing 1,417 prior copies rippling & fading
    const visibleCount = Math.floor(180 * sweep);
    ctx.lineWidth = 1;
    for (let i = 0; i < visibleCount; i++) {
      const ang = this.epochTicks[i * 3] - Math.PI * 0.5 + this.elapsedSec * 0.02;
      const radNorm = this.epochTicks[i * 3 + 1];
      const ageAlpha = (0.14 + 0.42 * (i / 180)) * (0.7 + 0.3 * Math.sin(this.elapsedSec * 1.6 + i * 0.25));
      const r0 = r * radNorm;
      const r1 = r0 + 5.5;
      ctx.strokeStyle = `rgba(186, 218, 242, ${ageAlpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.stroke();
    }

    // Glowing current instance pin at sweep tip (Instance-1419)
    const tipX = cx + Math.cos(endAng) * r;
    const tipY = cy + Math.sin(endAng) * r;
    ctx.strokeStyle = 'rgba(235, 176, 98, 0.6)';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 8 + Math.sin(this.elapsedSec * 3) * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffe2ad';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Clean central readout
    ctx.textAlign = 'center';
    ctx.font = '500 22px "Iowan Old Style", Georgia, serif';
    ctx.fillStyle = '#f2f7fc';
    ctx.fillText(`${years.toLocaleString()} YRS`, cx, cy - 4);
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(235, 176, 98, 0.86)';
    ctx.fillText(`${copies.toLocaleString()} PRIOR WATCHES · WATCH #1419`, cx, cy + 16);
    ctx.textAlign = 'left';
  }

  /** Phase 3: 10.0 LY pullback from Sol–Centauri to outer survey shell with 1419 <-> 1420 baseline */
  private drawShell(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, tSec: number): void {
    const pull = easeOutCubic(clamp01(tSec / 1.7));

    // Tiny twin golden pins receding leftward (Sol–Centauri home)
    const homeX = lerp(cx - r * 0.22, cx - r * 0.86, pull);
    const homeY = cy + r * 0.14;

    ctx.fillStyle = '#ffd88a';
    ctx.beginPath();
    ctx.arc(homeX - 3, homeY - 1.5, 2.8, 0, Math.PI * 2);
    ctx.arc(homeX + 4, homeY + 2, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(235, 176, 98, 0.38)';
    ctx.beginPath();
    ctx.arc(homeX, homeY, 12, 0, Math.PI * 2);
    ctx.stroke();

    // Outer survey shell arc centered back on home
    const shellR = r * (0.9 + 0.56 * pull);
    ctx.strokeStyle = 'rgba(154, 206, 240, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(homeX, homeY, shellR, -0.58, 0.42);
    ctx.stroke();

    // Probe 1419 & Neighbor 1420 on the shell perimeter
    const ang1419 = -0.26;
    const ang1420 = 0.16;
    const p1419X = homeX + Math.cos(ang1419) * shellR;
    const p1419Y = homeY + Math.sin(ang1419) * shellR;
    const p1420X = homeX + Math.cos(ang1420) * shellR;
    const p1420Y = homeY + Math.sin(ang1420) * shellR;

    // 10.0 LY chord line from Sol–Centauri to 1419
    ctx.strokeStyle = 'rgba(235, 176, 98, 0.36)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(homeX + 12, homeY - 3);
    ctx.lineTo(lerp(homeX + 12, p1419X, pull), lerp(homeY - 3, p1419Y, pull));
    ctx.stroke();
    ctx.setLineDash([]);

    // Luminous interferometry baseline arc between 1419 and 1420
    const relayPulse = 0.65 + 0.35 * Math.sin(this.elapsedSec * 2.4);
    ctx.strokeStyle = `rgba(122, 212, 182, ${(0.76 * relayPulse * pull).toFixed(3)})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(p1419X, p1419Y);
    ctx.lineTo(p1420X, p1420Y);
    ctx.stroke();

    // Traveling light-minute ping along 1419 <-> 1420 baseline
    const ping = (this.elapsedSec * 0.45) % 1;
    const pingX = lerp(p1419X, p1420X, ping);
    const pingY = lerp(p1419Y, p1420Y, ping);
    ctx.fillStyle = '#c4ffe8';
    ctx.beginPath();
    ctx.arc(pingX, pingY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Probe 1419 dot
    ctx.fillStyle = '#ffe4b4';
    ctx.beginPath();
    ctx.arc(p1419X, p1419Y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(235, 176, 98, 0.65)';
    ctx.beginPath();
    ctx.arc(p1419X, p1419Y, 10, 0, Math.PI * 2);
    ctx.stroke();

    // Probe 1420 dot
    ctx.fillStyle = '#9cf0d4';
    ctx.beginPath();
    ctx.arc(p1420X, p1420Y, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(122, 212, 182, 0.55)';
    ctx.beginPath();
    ctx.arc(p1420X, p1420Y, 9, 0, Math.PI * 2);
    ctx.stroke();

    // Crisp vector callouts
    ctx.font = '9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(235, 176, 98, 0.84)';
    ctx.fillText('SOL–CENTAURI', homeX - 24, homeY + 26);
    ctx.fillStyle = 'rgba(218, 234, 248, 0.72)';
    ctx.fillText('10.0 LY', (homeX + p1419X) * 0.5 - 16, (homeY + p1419Y) * 0.5 - 10);
    ctx.fillStyle = '#ffe4b4';
    ctx.fillText('PROBE 1419 (YOU)', p1419X + 14, p1419Y + 3);
    ctx.fillStyle = '#9cf0d4';
    ctx.fillText('PROBE 1420 (SIBLING)', p1420X + 14, p1420Y + 3);
    ctx.fillStyle = 'rgba(122, 212, 182, 0.85)';
    ctx.fillText('14 LIGHT-MIN BASELINE', (p1419X + p1420X) * 0.5 + 14, (p1419Y + p1420Y) * 0.5 + 4);
  }

  /** Phase 4: Split aperture — clinical shutter closing on outer sky side vs inner connectome & 24-month clock */
  private drawBlindClock(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, tSec: number): void {
    const closeT = easeOutCubic(clamp01(tSec / 1.5));

    // Outer circular boundary
    ctx.strokeStyle = 'rgba(182, 214, 240, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
    ctx.stroke();

    // Left hemisphere: Blind outer hull shutter blades closing
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.92, Math.PI * 0.5, Math.PI * 1.5);
    ctx.closePath();
    ctx.clip();

    ctx.fillStyle = `rgba(10, 18, 28, ${(0.72 * closeT).toFixed(3)})`;
    ctx.fillRect(cx - r, cy - r, r, r * 2);

    // Diagonal clinical shutter louvers sweeping shut
    ctx.strokeStyle = `rgba(148, 206, 238, ${(0.34 * closeT).toFixed(3)})`;
    ctx.lineWidth = 1;
    const step = 13;
    const slide = (1 - closeT) * r * 0.6;
    for (let x = -r * 1.5; x < r * 0.4; x += step) {
      ctx.beginPath();
      ctx.moveTo(cx + x - slide, cy - r);
      ctx.lineTo(cx + x + r * 0.7 - slide, cy + r);
      ctx.stroke();
    }
    ctx.restore();

    // Center dividing meridian line
    ctx.strokeStyle = 'rgba(210, 236, 255, 0.72)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.05);
    ctx.lineTo(cx, cy + r * 1.05);
    ctx.stroke();

    // Right hemisphere: Live warm-to-cyan connectome heartbeat waveform
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.88, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.closePath();
    ctx.clip();

    ctx.strokeStyle = 'rgba(235, 176, 98, 0.88)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const waveW = r * 0.84;
    for (let i = 0; i <= 48; i++) {
      const u = i / 48;
      const px = cx + 6 + u * waveW;
      const beat = Math.exp(-Math.pow(((u - ((this.elapsedSec * 0.42) % 1)) * 7), 2));
      const py = cy + Math.sin(u * 16 - this.elapsedSec * 3.2) * 8 - beat * 28;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    // Outer 24-month glowing arc along right perimeter
    const arcFill = 0.88 - 0.04 * Math.sin(this.elapsedSec * 1.2);
    ctx.strokeStyle = 'rgba(235, 176, 98, 0.86)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.05, -Math.PI * 0.44, -Math.PI * 0.44 + Math.PI * 0.88 * arcFill);
    ctx.stroke();

    // Labels
    ctx.font = '9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(156, 208, 240, 0.84)';
    ctx.fillText('OUTSIDE HULL', cx - 14, cy - 8);
    ctx.fillStyle = 'rgba(156, 208, 240, 0.58)';
    ctx.fillText('BLIND · UNOBSERVED', cx - 14, cy + 8);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe2ad';
    ctx.fillText('CONNECTOME MONITOR', cx + 14, cy - r * 0.52);
    ctx.fillStyle = 'rgba(235, 176, 98, 0.84)';
    ctx.fillText('24-MONTH CLOCK', cx + 14, cy + r * 0.58);
  }

  /** Phase 5: Schematic expands & thins radially outward, unsealing 6 counter-rotating shutter arcs into 3D cosmos */
  private drawAperture(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, tSec: number): void {
    const dissolve = easeOutCubic(clamp01(tSec / 4.0));
    const fade = 1 - dissolve * 0.94;
    if (fade <= 0.02) return;

    const expand = 1 + dissolve * 0.72;
    ctx.strokeStyle = `rgba(182, 220, 246, ${(0.58 * fade).toFixed(3)})`;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.96 * expand, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(235, 176, 98, ${(0.48 * fade).toFixed(3)})`;
    ctx.setLineDash([4, 10]);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.68 * expand, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 6 counter-rotating Zeiss-glass shutter arcs opening radially
    const bR = r * 1.12 * expand;
    const rot = dissolve * 0.42;
    ctx.strokeStyle = `rgba(220, 238, 252, ${(0.48 * fade).toFixed(3)})`;
    ctx.lineWidth = 1.3;
    for (let q = 0; q < 6; q++) {
      const a0 = q * (Math.PI / 3) + 0.2 + (q % 2 === 0 ? rot : -rot);
      ctx.beginPath();
      ctx.arc(cx, cy, bR, a0, a0 + 0.24);
      ctx.stroke();
    }
  }

  dispose(): void {
    this.setActive(false);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }
}
