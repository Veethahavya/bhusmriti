import { hexToRgba, samplePalette } from '../lib/color';
import type { Palette } from '../data/types';

export type TrailSample = {
  vx: number;
  vy: number;
  speed: number;
  color: number;
};

type Particle = { x: number; y: number; age: number; life: number };

const BINS = 14;
const FADE = 0.034;

/**
 * Screen-space wind trails. Particles advect on the visible sphere; each
 * frame is composited into a persistent canvas that is faded with
 * destination-out, giving smooth curved comet tails (the classic wind map)
 * instead of straight polyline chords.
 */
export class WindTrails {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sample: (x: number, y: number) => TrailSample | null;
  private bounds: () => { cx: number; cy: number; r: number };
  private particles: Particle[] = [];
  private colors: string[] = [];
  private paletteKey = '';
  private width = 1;
  private height = 1;
  private dpr = 1;
  private density = 1;
  private visible = true;
  private mobile = false;
  private cleared = true;

  constructor(parent: HTMLElement, sample: (x: number, y: number) => TrailSample | null, bounds: () => { cx: number; cy: number; r: number }) {
    this.sample = sample;
    this.bounds = bounds;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'aeros-wind';
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: true })!;
    this.mobile = window.innerWidth < 760 || (navigator.hardwareConcurrency ?? 8) <= 4;
    this.resize(parent.clientWidth, parent.clientHeight, Math.min(devicePixelRatio, 1.75));
  }

  setPalette(palette: Palette) {
    const key = palette.map((p) => p[1]).join('|');
    if (key === this.paletteKey) return;
    this.paletteKey = key;
    this.colors = Array.from({ length: BINS }, (_, i) => {
      const [r, g, b] = hexToRgba(samplePalette(palette, i / (BINS - 1)));
      return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    });
  }

  setVisible(v: boolean) {
    this.visible = v;
    if (!v) this.clear();
  }

  setDensity(d: number) {
    this.density = d;
    const n = Math.round((this.mobile ? 1300 : 3200) * d);
    this.resizeParticles(Math.max(700, Math.min(7200, n)));
  }

  resize(w: number, h: number, dpr: number) {
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.clear();
    this.respawnAll();
  }

  private resizeParticles(n: number) {
    if (n === this.particles.length) return;
    this.particles = Array.from({ length: n }, () => ({ x: -100, y: -100, age: 0, life: 0 }));
    this.respawnAll();
  }

  reset() {
    this.clear();
    this.respawnAll();
  }

  private respawnAll() {
    for (const p of this.particles) this.spawn(p, true);
  }

  private spawn(p: Particle, immediate = false) {
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * this.width;
      const y = Math.random() * this.height;
      if (this.sample(x, y)) {
        p.x = x; p.y = y;
        p.age = immediate ? Math.random() * 4 : 0;
        p.life = 8 + Math.random() * 12;
        return;
      }
    }
    p.x = -100; p.y = -100;
    p.age = 0;
    p.life = 0.2;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.cleared = true;
  }

  update(dt: number) {
    if (!this.visible) {
      if (!this.cleared) this.clear();
      return;
    }
    this.cleared = false;
    const ctx = this.ctx;
    const d = Math.min(0.05, dt);

    // fade the existing trail
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${FADE})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'source-over';

    const paths = Array.from({ length: BINS }, () => new Path2D());
    const used = new Uint8Array(BINS);

    for (const p of this.particles) {
      const s = this.sample(p.x, p.y);
      if (!s || (s.vx === 0 && s.vy === 0)) {
        this.spawn(p);
        continue;
      }
      const nx = p.x + s.vx * d;
      const ny = p.y + s.vy * d;
      if (nx < -40 || nx > this.width + 40 || ny < -40 || ny > this.height + 40) {
        this.spawn(p);
        continue;
      }
      const bin = Math.max(0, Math.min(BINS - 1, s.color));
      const path = paths[bin];
      path.moveTo(p.x, p.y);
      path.lineTo(nx, ny);
      used[bin] = 1;
      p.x = nx;
      p.y = ny;
      p.age += d;
      if (p.age > p.life) this.spawn(p);
    }

    const b = this.bounds();
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, Math.max(1, b.r), 0, Math.PI * 2);
    ctx.clip();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const lw = this.mobile ? 0.95 : 1.15;
    ctx.lineWidth = lw;
    for (let b = 0; b < BINS; b++) {
      if (!used[b] || !this.colors[b]) continue;
      ctx.strokeStyle = this.colors[b];
      ctx.globalAlpha = 0.78;
      ctx.stroke(paths[b]);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  destroy() {
    this.canvas.remove();
  }
}
