import { clamp, lerp } from '../tactilePhysics';
import type { SpectralClass, VibeMode } from '../types';
import { drawOpticalStar, quantizeHexToSpectralClass } from './StarPSFAtlas';

export type CosmicParticleKind = 'mote' | 'photon' | 'lock_ring' | 'shimmer';

interface ParticleSlot {
  active: boolean;
  kind: CosmicParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number; // optional target X for photon integration / shimmer coalescence
  ty: number; // optional target Y
  age: number;
  maxAge: number;
  size: number;
  baseRadius: number; // for lock_ring expansion
  alpha: number;
  depth: number; // parallax weight 0.2..1.0
  spectralClass: SpectralClass;
  colorHex: string;
}

export interface ReticleDuckZone {
  cx: number;
  cy: number;
  r: number;
}

/**
 * Zero-GC fixed-capacity cosmic particle pool (140 desktop / 80 mobile coarse).
 * Implements Instance-1419's 4 restrained Zeiss-optical particle types:
 *  1. Interstellar motes (ambient laminar drift, depth parallax, H% reactive)
 *  2. Photon integration sparks (gently drifting inward onto detector/reticle)
 *  3. Dual-hairline lock caustic rings + subtle PSF flare
 *  4. Chromatic spectral shimmer (R/B micro-motes coalescing into coherence)
 * Zero shadowBlur, zero per-frame object allocation, auto-40% opacity ducking inside active reticle.
 */
export class ParticlePool {
  readonly capacity: number;
  private readonly slots: ParticleSlot[];
  private cursor = 0;
  private moteCount = 0;
  private moteTarget = 30;
  private vibeMode: VibeMode = 'balanced';
  private rngState = 14192026;

  constructor(overrideCapacity?: number) {
    const isCoarse =
      typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);
    this.capacity = overrideCapacity ?? (isCoarse ? 80 : 140);
    this.slots = new Array<ParticleSlot>(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      this.slots[i] = {
        active: false,
        kind: 'mote',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        tx: 0,
        ty: 0,
        age: 0,
        maxAge: 1,
        size: 1.5,
        baseRadius: 12,
        alpha: 0.1,
        depth: 0.5,
        spectralClass: 'F',
        colorHex: '#fff6e8',
      };
    }
  }

  private nextRand(): number {
    this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  configureVibe(vibeMode: VibeMode, seed = 1419): void {
    this.vibeMode = vibeMode;
    this.rngState = (seed ^ 0x9e3779b9) >>> 0;
    const isCoarse = this.capacity <= 80;
    const base = isCoarse ? 22 : 34;
    this.moteTarget = vibeMode === 'cold' ? Math.round(base * 0.5) : base;
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.slots[i].active = false;
    }
    this.moteCount = 0;
    this.cursor = 0;
  }

  seedAmbientMotes(w: number, h: number): void {
    const safeW = Math.max(1, w);
    const safeH = Math.max(1, h);
    while (this.moteCount < this.moteTarget) {
      this.spawnMote(safeW, safeH, false);
    }
  }

  private acquireSlot(): ParticleSlot {
    for (let n = 0; n < this.capacity; n++) {
      const idx = (this.cursor + n) % this.capacity;
      const s = this.slots[idx];
      if (!s.active) {
        this.cursor = (idx + 1) % this.capacity;
        return s;
      }
    }
    // Ring-buffer overwrite oldest non-mote if possible
    for (let n = 0; n < this.capacity; n++) {
      const idx = (this.cursor + n) % this.capacity;
      const s = this.slots[idx];
      if (s.kind !== 'mote') {
        this.cursor = (idx + 1) % this.capacity;
        return s;
      }
    }
    const fallback = this.slots[this.cursor];
    if (fallback.active && fallback.kind === 'mote') {
      this.moteCount = Math.max(0, this.moteCount - 1);
    }
    this.cursor = (this.cursor + 1) % this.capacity;
    return fallback;
  }

  private spawnMote(w: number, h: number, fromEdge: boolean): void {
    const s = this.acquireSlot();
    const depth = 0.25 + this.nextRand() * 0.75;
    const speed = lerp(3, 8, depth);
    const ang = -0.35 + this.nextRand() * 0.7; // gentle laminar rightward-upward cosmic drift
    s.active = true;
    s.kind = 'mote';
    s.x = fromEdge ? -8 : this.nextRand() * w;
    s.y = this.nextRand() * h;
    s.vx = Math.cos(ang) * speed;
    s.vy = Math.sin(ang) * speed * 0.55;
    s.tx = 0;
    s.ty = 0;
    s.age = 0;
    s.maxAge = 16 + this.nextRand() * 14;
    s.size = lerp(1.0, 2.35, depth);
    s.baseRadius = 0;
    s.alpha = lerp(0.045, 0.14, this.nextRand());
    s.depth = depth;
    if (this.vibeMode === 'warm') {
      s.spectralClass = 'G';
      s.colorHex = '#ffe4bc';
    } else if (this.vibeMode === 'cold') {
      s.spectralClass = 'O';
      s.colorHex = '#9ee8ff';
    } else {
      s.spectralClass = 'A';
      s.colorHex = '#d6e2f0';
    }
    this.moteCount++;
  }

  /**
   * Emits 1–4 calm photon integration sparks drifting inward onto a detector/reticle point.
   */
  emitPhotonSparks(
    targetX: number,
    targetY: number,
    count = 3,
    spreadRadius = 46,
    colorHex = '#ffe6bd'
  ): void {
    const clampedCount = Math.min(6, Math.max(1, count));
    const cls = quantizeHexToSpectralClass(colorHex);
    for (let i = 0; i < clampedCount; i++) {
      const s = this.acquireSlot();
      const ang = this.nextRand() * Math.PI * 2;
      const dist = spreadRadius * (0.55 + this.nextRand() * 0.65);
      const life = 0.45 + this.nextRand() * 0.4;
      s.active = true;
      s.kind = 'photon';
      s.x = targetX + Math.cos(ang) * dist;
      s.y = targetY + Math.sin(ang) * dist;
      s.tx = targetX;
      s.ty = targetY;
      s.vx = ((targetX - s.x) / life) * 0.85;
      s.vy = ((targetY - s.y) / life) * 0.85;
      s.age = 0;
      s.maxAge = life;
      s.size = 1.5 + this.nextRand() * 1.4;
      s.baseRadius = 0;
      s.alpha = 0.72;
      s.depth = 0.5;
      s.spectralClass = cls;
      s.colorHex = colorHex;
    }
  }

  /**
   * Emits a restrained dual-hairline lock-bloom caustic ring expanding 1.0x -> 2.4x over 0.65s.
   */
  emitLockCausticRing(cx: number, cy: number, baseRadius = 22, colorHex = '#8be9c0'): void {
    const s = this.acquireSlot();
    s.active = true;
    s.kind = 'lock_ring';
    s.x = cx;
    s.y = cy;
    s.vx = 0;
    s.vy = 0;
    s.tx = 0;
    s.ty = 0;
    s.age = 0;
    s.maxAge = 0.65;
    s.size = 1.25;
    s.baseRadius = Math.max(8, baseRadius);
    s.alpha = 0.85;
    s.depth = 0;
    s.spectralClass = 'LOCK';
    s.colorHex = colorHex;
  }

  /**
   * Emits chromatic spectral shimmer micro-motes that coalesce toward white-gold coherence.
   */
  emitSpectralShimmer(x: number, y: number, coherence01: number, count = 2): void {
    const clampedCount = Math.min(4, Math.max(1, count));
    for (let i = 0; i < clampedCount; i++) {
      const s = this.acquireSlot();
      const spread = lerp(10, 1.5, clamp(coherence01, 0, 1));
      s.active = true;
      s.kind = 'shimmer';
      s.x = x + (this.nextRand() - 0.5) * spread * 2;
      s.y = y + (this.nextRand() - 0.5) * spread * 2;
      s.tx = x;
      s.ty = y;
      s.vx = (this.nextRand() - 0.5) * 14 * (1 - coherence01 * 0.7);
      s.vy = -8 - this.nextRand() * 10;
      s.age = 0;
      s.maxAge = 0.5 + this.nextRand() * 0.35;
      s.size = 1.4 + this.nextRand() * 1.1;
      s.baseRadius = clamp(coherence01, 0, 1);
      s.alpha = 0.55;
      s.depth = 0.3;
      s.spectralClass = coherence01 > 0.8 ? 'F' : i % 2 === 0 ? 'O' : 'M';
      s.colorHex = coherence01 > 0.8 ? '#fff6e8' : i % 2 === 0 ? '#9bb8ff' : '#ff9358';
    }
  }

  update(dt: number, w: number, h: number): void {
    const safeW = Math.max(1, w);
    const safeH = Math.max(1, h);

    if (this.moteCount < this.moteTarget) {
      this.spawnMote(safeW, safeH, this.moteCount > 0);
    }

    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (!s.active) continue;

      s.age += dt;
      if (s.age >= s.maxAge) {
        if (s.kind === 'mote') {
          this.moteCount = Math.max(0, this.moteCount - 1);
        }
        s.active = false;
        continue;
      }

      if (s.kind === 'mote') {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.x > safeW + 12) s.x = -10;
        else if (s.x < -12) s.x = safeW + 10;
        if (s.y > safeH + 12) s.y = -10;
        else if (s.y < -12) s.y = safeH + 10;
      } else if (s.kind === 'photon') {
        // Ease inward toward focal point
        const pull = 1 - Math.exp(-3.2 * dt);
        s.x += (s.tx - s.x) * pull + s.vx * dt * 0.25;
        s.y += (s.ty - s.y) * pull + s.vy * dt * 0.25;
      } else if (s.kind === 'shimmer') {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
    }
  }

  render(
    c2d: CanvasRenderingContext2D,
    opts?: {
      parallaxX?: number;
      parallaxY?: number;
      reticleDuck?: ReticleDuckZone;
    }
  ): void {
    const px = clamp(opts?.parallaxX ?? 0, -1, 1);
    const py = clamp(opts?.parallaxY ?? 0, -1, 1);
    const duck = opts?.reticleDuck;
    const duckR2 = duck ? duck.r * duck.r : 0;

    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (!s.active) continue;

      const t = clamp(s.age / Math.max(0.001, s.maxAge), 0, 1);
      const drawX = s.x + px * s.depth * 10;
      const drawY = s.y + py * s.depth * 10;

      // Auto-40% opacity ducking inside active central reticle so targets/labels stay razor-clear
      let duckMul = 1;
      if (duck && s.kind !== 'lock_ring') {
        const dx = drawX - duck.cx;
        const dy = drawY - duck.cy;
        if (dx * dx + dy * dy < duckR2) {
          duckMul = 0.6;
        }
      }

      if (s.kind === 'mote') {
        const env = Math.sin(t * Math.PI);
        const a = s.alpha * env * duckMul;
        if (a <= 0.008) continue;
        drawOpticalStar(c2d, drawX, drawY, s.size, {
          spectralClass: s.spectralClass,
          spikes: 0,
          alpha: a,
          vibeMode: this.vibeMode,
        });
      } else if (s.kind === 'photon') {
        const env = Math.sin(t * Math.PI);
        const a = s.alpha * env * duckMul;
        if (a <= 0.01) continue;
        drawOpticalStar(c2d, drawX, drawY, s.size * (1 - t * 0.35), {
          spectralClass: s.spectralClass,
          spikes: 0,
          alpha: a,
          vibeMode: this.vibeMode,
        });
      } else if (s.kind === 'shimmer') {
        const env = (1 - t) * Math.min(1, t * 5);
        const a = s.alpha * env * duckMul;
        if (a <= 0.01) continue;
        const splitPx = lerp(1.6, 0.2, s.baseRadius);
        drawOpticalStar(c2d, drawX - splitPx, drawY, s.size * 0.85, {
          spectralClass: 'O',
          spikes: 0,
          alpha: a * 0.72,
          vibeMode: this.vibeMode,
        });
        drawOpticalStar(c2d, drawX + splitPx, drawY, s.size * 0.85, {
          spectralClass: 'M',
          spikes: 0,
          alpha: a * 0.72,
          vibeMode: this.vibeMode,
        });
      } else if (s.kind === 'lock_ring') {
        const ease = 1 - Math.pow(1 - t, 4);
        const radius = s.baseRadius * lerp(1.0, 2.4, ease);
        const fade = (1 - t) * (1 - t);
        c2d.save();
        c2d.strokeStyle = s.colorHex;
        c2d.globalAlpha = s.alpha * fade;
        c2d.lineWidth = s.size;
        c2d.beginPath();
        c2d.arc(drawX, drawY, radius, 0, Math.PI * 2);
        c2d.stroke();

        // Subtle +2px secondary echo ring matching Warm/Cold H% vibe
        c2d.strokeStyle = this.vibeMode === 'warm' ? '#ffdf9e' : '#9ee8ff';
        c2d.globalAlpha = s.alpha * fade * 0.42;
        c2d.lineWidth = 0.9;
        c2d.beginPath();
        c2d.arc(drawX, drawY, radius + 2.2, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      }
    }
  }

  getActiveCount(): number {
    let count = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.slots[i].active) count++;
    }
    return count;
  }
}
