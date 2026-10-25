import { samplePalette } from '../lib/color';
import type { Palette } from '../data/types';
import type { Home } from '../data/store';

type Projected = { x: number; y: number; front: boolean; facing: number };

export type OverlayHost = {
  width: number;
  height: number;
  dpr: number;
  distance: number;
  fullDistance: number;
  labels: boolean;
  barbs: boolean;
  grid: boolean;
  home: Home | null;
  probe: { x: number; y: number } | null;
  time: number;
  pressure: { data: Float32Array; nx: number; ny: number; lonMin: number; latMin: number; step: number } | null;
  windPalette: Palette;
  sampleWind: (lat: number, lon: number) => { speed: number; u: number; v: number } | null;
  project: (lat: number, lon: number) => Projected;
};

type Place = { name: string; lat: number; lon: number; pop: number };

export class Overlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private places: Place[] = [];
  private dpr = 1;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'aeros-overlay';
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize(parent.clientWidth, parent.clientHeight, Math.min(devicePixelRatio, 2));
    fetch('/geo/places.geojson')
      .then((r) => r.json())
      .then((fc) => {
        const out: Place[] = [];
        for (const f of fc.features ?? []) {
          const p = f.properties ?? {};
          const lat = Number(p.latitude ?? p.LATITUDE);
          const lon = Number(p.longitude ?? p.LONGITUDE);
          const pop = Number(p.pop_max ?? p.POP_MAX ?? 0);
          const name = String(p.name ?? p.NAME ?? '');
          if (Number.isFinite(lat) && Number.isFinite(lon) && name) out.push({ name, lat, lon, pop });
        }
        out.sort((a, b) => b.pop - a.pop);
        this.places = out.slice(0, 220);
      })
      .catch(() => { /* labels are optional */ });
  }

  resize(w: number, h: number, dpr: number) {
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  destroy() {
    this.canvas.remove();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
  }

  draw(s: OverlayHost) {
    const ctx = this.ctx;
    const w = s.width, h = s.height;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (s.grid) this.drawGrid(ctx, s, w, h);
    if (s.labels) this.drawCities(ctx, s);
    if (s.home) this.drawHome(ctx, s);
    if (s.barbs) this.drawBarbs(ctx, s);
    if (s.pressure) this.drawPressure(ctx, s);
    if (s.probe) this.drawProbe(ctx, s.probe);
  }

  private drawGrid(ctx: CanvasRenderingContext2D, s: OverlayHost, w: number, h: number) {
    ctx.save();
    ctx.strokeStyle = 'rgba(120,190,190,0.095)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let lon = -180; lon < 180; lon += 30) {
      let started = false;
      for (let lat = -80; lat <= 80; lat += 2) {
        const p = s.project(lat, lon);
        if (!p.front) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      let started = false;
      for (let lon = -180; lon <= 180; lon += 2) {
        const p = s.project(lat, lon);
        if (!p.front) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawCities(ctx: CanvasRenderingContext2D, s: OverlayHost) {
    const closeness = (s.fullDistance - s.distance) / Math.max(0.001, s.fullDistance - 1.15);
    const small = s.width < 600;
    const max = Math.round((small ? 8 : 14) + closeness * (small ? 22 : 76));
    const size = small ? 8 : s.distance > 2.6 ? 9 : s.distance > 1.6 ? 10 : 11;
    const placed: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
    let drawn = 0;
    ctx.save();
    ctx.font = `500 ${size}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    for (const p of this.places) {
      if (drawn >= max) break;
      const pr = s.project(p.lat, p.lon);
      if (!pr.front || pr.facing < 0.08) continue;
      if (pr.x < -40 || pr.x > s.width + 40 || pr.y < -20 || pr.y > s.height + 20) continue;
      const tw = p.name.length * size * 0.64 + 10;
      const box = { x0: pr.x - 2, y0: pr.y - size, x1: pr.x + tw, y1: pr.y + size };
      if (placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
      placed.push(box);
      drawn++;
      const a = Math.min(0.62, 0.18 + pr.facing * 0.7);
      ctx.fillStyle = `rgba(186,226,222,${a * 0.7})`;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, p.pop > 6_000_000 ? 1.8 : 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(210,240,236,${a})`;
      ctx.fillText(p.name.toUpperCase(), pr.x + 6, pr.y + 0.5);
    }
    ctx.restore();
  }

  private drawHome(ctx: CanvasRenderingContext2D, s: OverlayHost) {
    if (!s.home) return;
    const p = s.project(s.home.lat, s.home.lon);
    if (!p.front) return;
    const pulse = (s.time * 0.35) % 1;
    ctx.save();
    ctx.strokeStyle = `rgba(94,234,212,${0.55 * (1 - pulse)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5 + pulse * 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#5eead4';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '600 9px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(170,255,240,0.9)';
    const label = s.home.name.toUpperCase();
    ctx.fillText(label, p.x + 9, p.y - 8);
    ctx.restore();
  }

  private drawBarbs(ctx: CanvasRenderingContext2D, s: OverlayHost) {
    const step = s.distance > 3.2 ? 10 : s.distance > 2.35 ? 7.5 : s.distance > 1.7 ? 5 : 3.5;
    const size = s.distance > 2.6 ? 18 : s.distance > 1.6 ? 22 : 26;
    ctx.save();
    for (let lat = -80; lat <= 80; lat += step) {
      const span = step / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
      for (let lon = -180; lon < 180; lon += span) {
        const w = s.sampleWind(lat, lon);
        if (!w || w.speed < 4) continue;
        const p = s.project(lat, lon);
        if (!p.front || p.facing < 0.18) continue;
        if (p.x < -30 || p.x > s.width + 30 || p.y < -30 || p.y > s.height + 30) continue;

        const pe = s.project(lat, lon + 0.35);
        const pn = s.project(lat + 0.35, lon);
        if (!pe.front || !pn.front) continue;
        let ex = pe.x - p.x, ey = pe.y - p.y;
        let nx = pn.x - p.x, ny = pn.y - p.y;
        const el = Math.hypot(ex, ey) || 1, nl = Math.hypot(nx, ny) || 1;
        ex /= el; ey /= el; nx /= nl; ny /= nl;
        // screen vector of the wind (meteorological u east, v north)
        let dx = w.u * ex + w.v * nx;
        let dy = w.u * ey + w.v * ny;
        const dl = Math.hypot(dx, dy) || 1;
        dx /= dl; dy /= dl;
        // staff points toward where the wind comes from
        const knots = w.speed / 1.852;
        const colour = samplePalette(s.windPalette, Math.min(1, w.speed / 120));
        drawBarb(ctx, p.x, p.y, -dx, -dy, knots, colour, size, p.facing);
      }
    }
    ctx.restore();
  }

  private drawPressure(ctx: CanvasRenderingContext2D, s: OverlayHost) {
    const pgrid = s.pressure!;
    const arr = pgrid.data;
    const nx = pgrid.nx, ny = pgrid.ny;
    const marks: Array<{ lat: number; lon: number; v: number; high: boolean }> = [];
    const stride = nx > 200 ? 2 : 1;
    for (let y = 2; y < ny - 2; y += stride) {
      for (let x = 0; x < nx; x += stride) {
        const i = y * nx + x;
        const v = arr[i];
        if (!Number.isFinite(v)) continue;
        let min = v, max = v;
        for (let yy = -2; yy <= 2; yy++) {
          for (let xx = -2; xx <= 2; xx++) {
            const j = (Math.max(0, Math.min(ny - 1, y + yy))) * nx + ((x + xx + nx) % nx);
            const q = arr[j];
            if (!Number.isFinite(q)) continue;
            if (q < min) min = q;
            if (q > max) max = q;
          }
        }
        if (v === min || v === max) {
          marks.push({ lat: pgrid.latMin + y * pgrid.step, lon: pgrid.lonMin + x * pgrid.step, v, high: v === max });
        }
      }
    }
    marks.sort((a, b) => Math.abs(b.v - 1013) - Math.abs(a.v - 1013));
    const chosen: typeof marks = [];
    for (const m of marks) {
      if (chosen.some((c) => Math.abs(c.lat - m.lat) < 12 && Math.abs(c.lon - m.lon) < 18)) continue;
      chosen.push(m);
      if (chosen.length >= 7) break;
    }
    ctx.save();
    for (const m of chosen) {
      const p = s.project(m.lat, m.lon);
      if (!p.front) continue;
      ctx.font = '600 20px "Space Grotesk", ui-sans-serif, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = m.high ? 'rgba(116,185,255,0.92)' : 'rgba(255,122,122,0.92)';
      ctx.shadowColor = m.high ? 'rgba(40,110,220,0.8)' : 'rgba(220,40,40,0.8)';
      ctx.shadowBlur = 12;
      ctx.fillText(m.high ? 'H' : 'L', p.x, p.y - 2);
      ctx.shadowBlur = 0;
      ctx.font = '500 8px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = 'rgba(220,245,242,0.72)';
      ctx.fillText(Math.round(m.v).toString(), p.x, p.y + 13);
    }
    ctx.restore();
  }

  private drawProbe(ctx: CanvasRenderingContext2D, p: { x: number; y: number }) {
    ctx.save();
    ctx.strokeStyle = 'rgba(94,234,212,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x - 4, p.y);
    ctx.moveTo(p.x + 4, p.y); ctx.lineTo(p.x + 12, p.y);
    ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x, p.y - 4);
    ctx.moveTo(p.x, p.y + 4); ctx.lineTo(p.x, p.y + 12);
    ctx.stroke();
    ctx.restore();
  }
}

function drawBarb(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, dx: number, dy: number,
  knots: number, colour: string, size: number, facing: number,
) {
  const alpha = Math.min(0.86, 0.22 + facing * 0.8);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(3,10,12,0.75)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx * size, y + dy * size);
  ctx.stroke();

  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx * size, y + dy * size);
  // barbs at the far end
  const bx = x + dx * size, by = y + dy * size;
  let remaining = Math.max(0, Math.round(knots / 5) * 5);
  const pennants = Math.floor(remaining / 50);
  remaining -= pennants * 50;
  const full = Math.floor(remaining / 10);
  const half = remaining % 10 >= 5 ? 1 : 0;
  const px = -dy, py = dx;
  const step = 4;
  let offset = 1;
  for (let i = 0; i < pennants; i++) {
    const t = offset;
    const sx = bx - dx * t * step, sy = by - dy * t * step;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + px * 7, sy + py * 7);
    ctx.lineTo(sx - dx * 6, sy - dy * 6);
    ctx.closePath();
    offset += 1.8;
  }
  for (let i = 0; i < full; i++) {
    const t = offset;
    const sx = bx - dx * t * step, sy = by - dy * t * step;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + px * 6 - dx * 4, sy + py * 6 - dy * 4);
    offset += 1.5;
  }
  if (half) {
    const t = offset;
    const sx = bx - dx * t * step, sy = by - dy * t * step;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + px * 4 - dx * 2, sy + py * 4 - dy * 2);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}
