import * as THREE from 'three';
import { DREAM_FRAGMENT, DREAM_VERTEX } from './shaders/dreamShaders';

/**
 * Generates a warm, painterly oil-study fallback texture for the Phase 0 spike
 * (kitchen table, late-afternoon amber window light, two ceramic mugs, and a soft
 * brushstroke figure of [RELATION:SPOUSE_01]). Swappable for any external PNG/WebP
 * via characters.json without touching shader or UI code.
 */
function createProceduralPainterlyTableau(): HTMLCanvasElement {
  const w = 1024;
  const h = 768;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Deep warm indigo-umber background wash
  const bg = ctx.createRadialGradient(w * 0.32, h * 0.28, 40, w * 0.5, h * 0.5, w * 0.78);
  bg.addColorStop(0, '#c98842');
  bg.addColorStop(0.38, '#6a4430');
  bg.addColorStop(0.75, '#252130');
  bg.addColorStop(1, '#10131e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Deterministic painterly impasto strokes
  let seed = 41802;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const stroke = (
    x: number,
    y: number,
    len: number,
    thick: number,
    angle: number,
    color: string,
    alpha: number
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-len / 2, -thick / 2, len, thick, thick * 0.45);
    ctx.fill();
    ctx.restore();
  };

  // Golden afternoon window panes (upper left)
  ctx.save();
  const winGrad = ctx.createLinearGradient(90, 60, 390, 420);
  winGrad.addColorStop(0, 'rgba(255, 224, 152, 0.78)');
  winGrad.addColorStop(0.6, 'rgba(229, 152, 72, 0.32)');
  winGrad.addColorStop(1, 'rgba(229, 152, 72, 0)');
  ctx.fillStyle = winGrad;
  ctx.beginPath();
  ctx.moveTo(110, 75);
  ctx.lineTo(355, 115);
  ctx.lineTo(420, 460);
  ctx.lineTo(70, 420);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Ambient impasto wall brushwork
  const wallPalette = ['#d89548', '#a36136', '#4c3533', '#272c42', '#e8b970'];
  for (let i = 0; i < 340; i++) {
    const x = rand() * w;
    const y = rand() * h * 0.72;
    const c = wallPalette[Math.floor(rand() * wallPalette.length)];
    stroke(x, y, 36 + rand() * 88, 7 + rand() * 18, (rand() - 0.5) * 0.65, c, 0.14 + rand() * 0.22);
  }

  // Painterly silhouette & warm backlit shoulders/face of [RELATION:SPOUSE_01]
  // Soft head glow (intentionally indistinct facial features — memory without a name)
  const figX = w * 0.54;
  const figY = h * 0.43;

  // Coat / shoulders
  for (let i = 0; i < 95; i++) {
    const sx = figX + (rand() - 0.5) * 260;
    const sy = figY + 125 + (rand() - 0.5) * 180;
    const col = sx < figX - 20 ? '#d28f4c' : rand() > 0.45 ? '#31374d' : '#4a3d49';
    stroke(sx, sy, 48 + rand() * 72, 14 + rand() * 20, -0.35 + rand() * 0.7, col, 0.42);
  }

  // Head & warm rim light
  const headGrad = ctx.createRadialGradient(figX - 28, figY - 18, 12, figX, figY, 96);
  headGrad.addColorStop(0, '#f7cf92');
  headGrad.addColorStop(0.5, '#bd7c4d');
  headGrad.addColorStop(1, '#392a35');
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.ellipse(figX, figY, 68, 86, 0.06, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 70; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = rand() * 78;
    const hx = figX + Math.cos(ang) * rad * 0.85;
    const hy = figY + Math.sin(ang) * rad * 1.05;
    const col = hx < figX - 10 ? '#f6cb86' : '#6b453c';
    stroke(hx, hy, 22 + rand() * 34, 6 + rand() * 11, ang + 1.2, col, 0.34);
  }

  // Kitchen table foreground plane
  const tableGrad = ctx.createLinearGradient(0, h * 0.66, 0, h);
  tableGrad.addColorStop(0, '#6a442d');
  tableGrad.addColorStop(0.5, '#3b241d');
  tableGrad.addColorStop(1, '#1a1214');
  ctx.fillStyle = tableGrad;
  ctx.fillRect(0, h * 0.68, w, h * 0.32);

  for (let i = 0; i < 120; i++) {
    stroke(
      rand() * w,
      h * 0.69 + rand() * h * 0.3,
      60 + rand() * 140,
      8 + rand() * 15,
      (rand() - 0.5) * 0.12,
      rand() > 0.5 ? '#9f653b' : '#2a1a18',
      0.28
    );
  }

  // Two mismatched ceramic mugs catching golden window rim light
  const drawMug = (mx: number, my: number, tint: string) => {
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.roundRect(mx - 22, my - 30, 44, 52, 8);
    ctx.fill();
    ctx.strokeStyle = '#f8d294';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(mx + 22, my - 4, 12, -1.2, 1.2);
    ctx.stroke();
    // Rising warm steam wisps
    for (let s = 0; s < 5; s++) {
      stroke(mx - 6 + s * 4, my - 52 - s * 14, 24, 5, -1.35 + rand() * 0.3, '#f7d8a6', 0.22);
    }
  };

  drawMug(w * 0.38, h * 0.74, '#b85c3a');
  drawMug(w * 0.64, h * 0.77, '#4f6d7a');

  return canvas;
}

export class DreamCanvas {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly mat: THREE.ShaderMaterial;

  private humanity = 70;
  private pruned = false;
  private overseerActive = false;
  private active = false;
  private rafId = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
    this.renderer.domElement.className = 'dream-canvas';
    container.appendChild(this.renderer.domElement);

    const tex = new THREE.CanvasTexture(createProceduralPainterlyTableau());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;

    this.mat = new THREE.ShaderMaterial({
      vertexShader: DREAM_VERTEX,
      fragmentShader: DREAM_FRAGMENT,
      uniforms: {
        uTexture: { value: tex },
        uTime: { value: 0 },
        uHumanity: { value: 0.7 },
        uPruned: { value: 0.0 },
        uOverseer: { value: 0.0 },
      },
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.scene.add(quad);

    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
  }

  setState(humanity: number, pruned: boolean, overseerActive: boolean): void {
    this.humanity = humanity;
    this.pruned = pruned;
    this.overseerActive = overseerActive;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active) {
      this.resize();
      if (!this.rafId) {
        this.loop();
      }
    } else if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private loop = (): void => {
    if (!this.active) return;
    this.rafId = requestAnimationFrame(this.loop);

    this.mat.uniforms.uTime.value = performance.now() * 0.001;
    // Smooth interpolation for dramatic live H% scrubbing & prune shock
    const targetH = this.humanity / 100;
    const targetPruned = this.pruned ? 1.0 : 0.0;
    const targetOverseer = this.overseerActive ? 1.0 : 0.0;

    this.mat.uniforms.uHumanity.value += (targetH - this.mat.uniforms.uHumanity.value) * 0.12;
    this.mat.uniforms.uPruned.value += (targetPruned - this.mat.uniforms.uPruned.value) * 0.12;
    this.mat.uniforms.uOverseer.value += (targetOverseer - this.mat.uniforms.uOverseer.value) * 0.15;

    this.renderer.render(this.scene, this.camera);
  };
}
