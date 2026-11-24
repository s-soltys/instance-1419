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
  StuckTimeDirector,
} from './tactilePhysics';
import {
  CognitiveInstrumentProfile,
  IMinigame,
  MinigameContext,
  MinigameGrade,
} from './types';

interface MatrixCell {
  r: number;
  c: number;
  code: string;
  used: boolean;
  isChaosDecoy: boolean;
}

interface TargetSeq {
  name: string;
  codes: string[];
  matched: boolean;
}

const CODES = ['Φ1', 'Ω2', 'Λ4', 'Σ7', 'Ψ9'];

export class CorrelatorPhaseMatrix implements IMinigame {
  readonly id = 'phase_matrix';
  readonly title = 'VLBI CORRELATOR MATRIX';
  readonly subtitle = 'Orthogonal Phase Breach · Pulsar Baseline Handshake';
  readonly instrumentCode = 'MTX-04';

  private ctx!: MinigameContext;
  private profile!: CognitiveInstrumentProfile;
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private unbindInput: (() => void) | null = null;
  private resizeObs: ResizeObserver | null = null;

  private gridSize = 5;
  private grid: MatrixCell[][] = [];
  private sequences: TargetSeq[] = [];
  private buffer: string[] = [];
  private maxBuffer = 6;
  private axisMode: 'row' | 'col' = 'row';
  private activeIdx = 0;

  private rawActive = false;
  private latch = new LatchController();
  private director = new StuckTimeDirector();
  private hitstop = new HitstopRecoil();
  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private finished = false;
  private statusCue = 'Select highlighted top-row cell to start orthogonal correlation trace';

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

    this.generatePuzzle();

    this.unbindInput = bindCanvasPress(this.canvas, {
      onDown: (x, y, w, h) => this.handleDown(x, y, w, h),
    });

    this.lastTime = performance.now();
    this.loop();
  }

  private generatePuzzle(): void {
    const rand = createSeededRng(`mtx-${this.ctx.targetId}-${this.ctx.state.shift}`);
    this.grid = [];
    for (let r = 0; r < this.gridSize; r++) {
      const row: MatrixCell[] = [];
      for (let c = 0; c < this.gridSize; c++) {
        row.push({
          r,
          c,
          code: CODES[Math.floor(rand() * CODES.length)],
          used: false,
          isChaosDecoy: false,
        });
      }
      this.grid.push(row);
    }

    // Carve guaranteed solvable orthogonal solution path of length 5 from row 0
    const pathCodes: string[] = [];
    let r = 0;
    let c = Math.floor(rand() * this.gridSize);
    let pickRow = false; // just picked from row 0 -> next must match col c
    for (let step = 0; step < 5; step++) {
      pathCodes.push(this.grid[r][c].code);
      if (pickRow) {
        c = (c + 1 + Math.floor(rand() * (this.gridSize - 1))) % this.gridSize;
      } else {
        r = 1 + Math.floor(rand() * (this.gridSize - 1));
      }
      pickRow = !pickRow;
    }

    // Plant Chaos decoy cell off-path
    for (let r0 = 0; r0 < this.gridSize; r0++) {
      for (let c0 = 0; c0 < this.gridSize; c0++) {
        if (rand() < this.profile.pareidoliaChance * 0.25 && r0 > 0) {
          this.grid[r0][c0].isChaosDecoy = true;
        }
      }
    }

    // Overlapping solvable sequences!
    this.sequences = [
      { name: 'SEQ-1 PULSAR SYNC', codes: pathCodes.slice(0, 2), matched: false },
      { name: 'SEQ-2 HORIZON FACET', codes: pathCodes.slice(1, 4), matched: false },
      { name: 'SEQ-3 OVERCLOCK', codes: pathCodes.slice(2, 5), matched: false },
    ];
    this.resetTrace();
  }

  private resetTrace(): void {
    for (const row of this.grid) {
      for (const cell of row) cell.used = false;
    }
    this.buffer = [];
    this.axisMode = 'row';
    this.activeIdx = 0;
    for (const seq of this.sequences) seq.matched = false;
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
    const solved = this.sequences.filter((s) => s.matched).length;
    if (solved < 1 || this.finished) return;
    this.commitFinish('partial', 0.65);
  }

  private getLayout(w: number, h: number) {
    const cellSize = Math.min(48, Math.floor(Math.min(w * 0.28, h * 0.56) / this.gridSize));
    const gridW = cellSize * this.gridSize;
    return {
      gx: 28,
      gy: h * 0.5 - gridW * 0.5,
      cellSize,
      gridW,
      rx: w - 230,
      ry: h * 0.5 - gridW * 0.5,
      rw: 204,
      rh: gridW,
    };
  }

  private handleDown(x: number, y: number, w: number, h: number): void {
    if (this.finished) return;
    const lay = this.getLayout(w, h);

    // Check RESET TRACE button on right panel
    if (x >= lay.rx && x <= lay.rx + lay.rw && y >= lay.ry + lay.rh - 38 && y <= lay.ry + lay.rh) {
      this.resetTrace();
      this.ctx.audio?.playSolenoidClack(false);
      this.statusCue = 'Correlator buffer cleared — start again on Row 1';
      return;
    }

    // Check Grid Cell Click
    const col = Math.floor((x - lay.gx) / lay.cellSize);
    const row = Math.floor((y - lay.gy) / lay.cellSize);
    if (row < 0 || row >= this.gridSize || col < 0 || col >= this.gridSize) return;

    const cell = this.grid[row][col];
    if (cell.used || this.buffer.length >= this.maxBuffer) return;

    const validAxis = this.axisMode === 'row' ? row === this.activeIdx : col === this.activeIdx;
    if (!validAxis) {
      this.ctx.audio?.playSolenoidClack(false);
      this.statusCue =
        this.axisMode === 'row'
          ? `Must select inside highlighted Row ${this.activeIdx + 1}`
          : `Must select inside highlighted Column ${this.activeIdx + 1}`;
      return;
    }

    cell.used = true;
    this.buffer.push(cell.code);
    this.hitstop.trigger(28, 3);
    this.ctx.audio?.playTumblerClick(0.65, !cell.isChaosDecoy);

    // Toggle orthogonal axis!
    if (this.axisMode === 'row') {
      this.axisMode = 'col';
      this.activeIdx = col;
    } else {
      this.axisMode = 'row';
      this.activeIdx = row;
    }

    // Evaluate sequence matches inside contiguous sliding windows
    let anyNewMatch = false;
    const bufJoined = this.buffer.join(',');
    for (const seq of this.sequences) {
      if (!seq.matched && bufJoined.includes(seq.codes.join(','))) {
        seq.matched = true;
        anyNewMatch = true;
      }
    }
    if (anyNewMatch) {
      this.ctx.audio?.playSolenoidClack(true);
      this.hitstop.trigger(44, 4.5);
      this.statusCue = 'Correlator daemon uploaded!';
    }
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

    const solvedCount = this.sequences.filter((s) => s.matched).length;
    const bandMatch = this.ctx.bandIdx === 0 ? 1.0 : this.ctx.bandIdx === 1 ? 0.72 : 0.45;
    const overall = clamp(solvedCount / 2, 0, 1);

    const assistTier = this.director.tick(dt, overall);
    const rawOk = computeRawGate(this.profile, this.rawActive);
    const latchOut = this.latch.tick(dt, solvedCount >= 2 ? 1.0 : 0.0, rawOk);

    this.ctx.audio?.updateBeatSynth({
      beatHz: solvedCount >= 2 ? 0 : (2 - solvedCount) * 6,
      harmonicLock: overall,
      warmth: this.profile.harmonicWarmthGain,
      strain: latchOut.overclockZone ? 0.85 : 0.1,
    });
    this.ctx.audio?.setWatchdogBed(latchOut.overclockZone ? 0.5 : 0);

    this.ctx.showcase?.applyInstrumentPatch({
      progress: overall,
      jetResonance: clamp(solvedCount * 0.45, 0, 1),
      seamReveal: solvedCount >= 2 ? 1.0 : solvedCount * 0.4,
    });

    const beatIndex: 1 | 2 | 3 = solvedCount < 1 ? 1 : solvedCount < 2 ? 2 : 3;
    const beatLabel =
      beatIndex === 1
        ? '01 ISOLATE (TRACE ROW->COL CORRELATOR)'
        : beatIndex === 2
        ? '02 EXPOSE (COMPLETE SEQ-2 HORIZON FACET)'
        : rawOk
        ? '03 EXTRACT [HOLD SPACE]'
        : '03 OVER-REGULARIZED — PRESS [R]';

    this.ctx.onTelemetry?.({
      beatIndex,
      beatLabel,
      lockMeter: latchOut.lockProgress > 0 ? latchOut.lockProgress : overall,
      overclockZone: latchOut.overclockZone,
      rawResidualActive: this.rawActive,
      canCommitPartial: solvedCount >= 1 && (assistTier >= 3 || overall >= 0.5),
      telemetryReadout: `DAEMONS ${solvedCount}/3 · BUFFER ${this.buffer.length}/${this.maxBuffer} · UV [1] ${Math.round(bandMatch * 100)}%`,
      cueWhisper:
        this.ctx.bandIdx !== 0
          ? 'Switch to UV / X-RAY [1] for crisp pulsar polarization readout'
          : assistTier >= 2 && solvedCount < 2
          ? `Guide: Sequence 1 starts on ${this.sequences[0].codes.join(' -> ')}`
          : this.statusCue,
      assistTier,
    });

    if (latchOut.completedGrade) {
      this.commitFinish(latchOut.completedGrade, clamp(0.65 + (solvedCount / 3) * 0.35, 0, 1));
      return;
    }

    this.render(recoil.shakeX, recoil.shakeY, wOrDefault(this.canvas), hOrDefault(this.canvas));
  };

  private render(shakeX: number, shakeY: number, w: number, h: number): void {
    const ctx = this.g;
    ctx.clearRect(0, 0, w, h);

    drawReticleFrame(ctx, w, h, this.profile, this.rawActive, this.elapsed, shakeX, shakeY);
    const { theme } = this.profile;
    const lay = this.getLayout(w, h);

    // 1. Left Transparent Matrix Panel
    ctx.save();
    ctx.fillStyle = 'rgba(7, 11, 18, 0.72)';
    ctx.strokeStyle = `rgba(${theme.accentRgb}, 0.36)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(lay.gx - 8, lay.gy - 30, lay.gridW + 16, lay.gridW + 40, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = theme.accentHex;
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.fillText('CORRELATOR PHASE MATRIX', lay.gx, lay.gy - 12);

    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const cell = this.grid[r][c];
        const x = lay.gx + c * lay.cellSize;
        const y = lay.gy + r * lay.cellSize;
        const activeCell = this.axisMode === 'row' ? r === this.activeIdx : c === this.activeIdx;

        ctx.fillStyle = cell.used
          ? 'rgba(255,255,255,0.04)'
          : activeCell
          ? `rgba(${theme.accentRgb}, 0.18)`
          : 'rgba(255,255,255,0.02)';
        ctx.fillRect(x + 2, y + 2, lay.cellSize - 4, lay.cellSize - 4);

        if (activeCell && !cell.used) {
          ctx.strokeStyle = `rgba(${theme.accentRgb}, 0.65)`;
          ctx.strokeRect(x + 2, y + 2, lay.cellSize - 4, lay.cellSize - 4);
        }

        ctx.fillStyle = cell.used
          ? 'rgba(255,255,255,0.22)'
          : cell.isChaosDecoy && (this.rawActive || this.profile.vibe === 'cold')
          ? theme.dangerHex
          : activeCell
          ? '#ffffff'
          : theme.secondaryHex;
        ctx.font = '700 13px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cell.used ? '--' : cell.code, x + lay.cellSize * 0.5, y + lay.cellSize * 0.5);
      }
    }
    ctx.restore();

    // 2. Right Panel: Correlator Buffer & Sequence Stack
    ctx.save();
    ctx.fillStyle = 'rgba(7, 11, 18, 0.72)';
    ctx.strokeStyle = `rgba(${theme.secondaryRgb}, 0.34)`;
    ctx.beginPath();
    ctx.roundRect(lay.rx, lay.ry - 30, lay.rw, lay.rh + 40, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = theme.secondaryHex;
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.fillText('BUFFER TRACE', lay.rx + 12, lay.ry - 12);

    for (let i = 0; i < this.maxBuffer; i++) {
      const bx = lay.rx + 12 + i * 30;
      const by = lay.ry + 6;
      ctx.strokeStyle = `rgba(${theme.accentRgb}, 0.55)`;
      ctx.strokeRect(bx, by, 26, 26);
      if (this.buffer[i]) {
        ctx.fillStyle = theme.accentHex;
        ctx.font = '700 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.buffer[i], bx + 13, by + 13);
      }
    }

    this.sequences.forEach((seq, idx) => {
      const sy = lay.ry + 54 + idx * 44;
      ctx.textAlign = 'left';
      ctx.fillStyle = seq.matched ? theme.accentHex : `rgba(${theme.secondaryRgb}, 0.68)`;
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.fillText(`${seq.name} ${seq.matched ? '✓' : ''}`, lay.rx + 12, sy);
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.fillText(seq.codes.join('  '), lay.rx + 12, sy + 16);
    });

    // Reset button
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeStyle = `rgba(${theme.secondaryRgb}, 0.4)`;
    ctx.beginPath();
    ctx.roundRect(lay.rx + 10, lay.ry + lay.rh - 38, lay.rw - 20, 28, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = theme.secondaryHex;
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RESET TRACE', lay.rx + lay.rw * 0.5, lay.ry + lay.rh - 24);
    ctx.restore();

    drawFloatingDeltaPill(
      ctx,
      w * 0.5,
      h * 0.5 + Math.min(w, h) * 0.34,
      `${this.axisMode.toUpperCase()} ${this.activeIdx + 1} ACTIVE`,
      this.profile,
      this.sequences[1]?.matched
    );
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
      's04_correlator_proof',
      'VLBI correlator phase trace locked Pulsar Rift S-04 curvature identically to Cluster J1419-A.',
      `Correlator Phase Matrix (${grade}) traced in ${elapsedSec}s.`
    );
    window.setTimeout(() => this.ctx.onComplete(res), 420);
  }

  destroy(): void {
    this.finished = true;
    cancelAnimationFrame(this.rafId);
    this.unbindInput?.();
    this.resizeObs?.disconnect();
    this.ctx.audio?.stopInstrumentAudio();
    this.ctx.showcase?.resetInstrumentState();
    this.canvas.remove();
  }
}

function wOrDefault(el: HTMLCanvasElement): number {
  return Math.max(1, el.clientWidth);
}
function hOrDefault(el: HTMLCanvasElement): number {
  return Math.max(1, el.clientHeight);
}
