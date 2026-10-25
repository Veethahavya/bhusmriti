import { hexToRgba, samplePalette } from '../lib/color';
import type { Palette } from '../data/types';
import type { TrailSample } from './trails';

const BINS = 14;

/** Wind shown as a field of arrows whose tails dissolve into exaggerated smoke. */
export class GustLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sample: (x: number, y: number) => TrailSample | null;
  private bounds: () => { cx: number; cy: number; r: number };
  private colors: string[] = [];
  private paletteKey = '';
  private visible = false;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private mobile = false;

  constructor(parent: HTMLElement, sample: (x: number, y: number) => TrailSample | null, bounds: () => { cx: number; cy: number; r: number }) {
    this.sample = sample;
    this.bounds = bounds;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'aeros-gusts';
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.mobile = window.innerWidth < 760;
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

  resize(w: number, h: number, dpr: number) {
    this.width = w; this.height = h; this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.clear();
  }

  clear() { this.ctx.clearRect(0, 0, this.width, this.height); }

  update(frame: number) {
    if (!this.visible) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    const b = this.bounds();
    const cols = this.mobile ? 9 : 14;
    const rows = this.mobile ? 6 : 9;
    const time = frame * 0.42;
    let seed = 17;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        const fx = (rx + 0.5 + (rnd() - 0.5) * 0.6) / cols;
        const fy = (ry + 0.5 + (rnd() - 0.5) * 0.6) / rows;
        const x = b.cx + (fx - 0.5) * 2 * b.r * 0.96;
        const y = b.cy + (fy - 0.5) * 2 * b.r * 0.96;
        if ((x - b.cx) ** 2 + (y - b.cy) ** 2 > (b.r * 0.95) ** 2) continue;
        const s = this.sample(x, y);
        if (!s) continue;
        const mag = Math.hypot(s.vx, s.vy) || 1;
        const dx = s.vx / mag, dy = s.vy / mag;
        const nx = -dy, ny = dx;
        const speed = Math.max(0, s.speed);
        const len = Math.min(this.mobile ? 70 : 118, (this.mobile ? 24 : 34) + speed * 0.7);
        const alpha = 0.5 + Math.min(0.4, speed / 70);
        const idx = Math.max(0, Math.min(BINS - 1, Math.round(Math.pow(Math.min(1, speed / 55), 0.55) * (BINS - 1))));
        const color = this.colors[idx] ?? 'rgb(160,230,255)';

        // smoke tail
        const drift = Math.sin(time * 1.6 + rx * 0.9 + ry * 0.7) * 7.0;
        const gx = x + dx * drift, gy = y + dy * drift;
        const tx = gx - dx * len, ty = gy - dy * len;
        ctx.save();
        ctx.filter = 'blur(2.2px)';
        const grad = ctx.createLinearGradient(tx, ty, gx, gy);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.45, color);
        grad.addColorStop(1, 'rgba(255,255,255,0.9)');
        ctx.strokeStyle = grad;
        for (let k = 0; k < 5; k++) {
          const off = (k - 2) * 3.4;
          const wob = Math.sin(time * 2.4 + rx * 0.7 + ry * 0.55 + k) * 6.0;
          const mx = gx - dx * len * 0.55 + nx * (off + wob);
          const my = gy - dy * len * 0.55 + ny * (off + wob);
          ctx.globalAlpha = alpha * (0.36 - k * 0.045);
          ctx.lineWidth = 8.0 - k * 1.1;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.quadraticCurveTo(mx, my, gx, gy);
          ctx.stroke();
        }
        // drifting smoke puffs
        for (let k = 0; k < 3; k++) {
          const f = ((time * 0.45 + k * 0.33 + rx * 0.11) % 1);
          const px = tx + (gx - tx) * f + nx * Math.sin(time + k) * 3.0;
          const py = ty + (gy - ty) * f + ny * Math.sin(time + k) * 3.0;
          ctx.globalAlpha = 0.20 * (1 - f);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(px, py, 5 + f * 9, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // head arrow
        ctx.save();
        ctx.globalAlpha = 0.96;
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 0.8;
        const hx = gx, hy = gy;
        const bx = hx - dx * 13, by = hy - dy * 13;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(bx + nx * 4.5, by + ny * 4.5);
        ctx.lineTo(bx - nx * 4.5, by - ny * 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  destroy() { this.canvas.remove(); }
}
