import { AtmosData } from './snapshot';
import type { DerivedId, FieldGrid } from './types';

const DEG = Math.PI / 180;

/**
 * Derived flux fields. Each kind is computed on the native grid of its base
 * field (1° atmosphere, 2° land/hydrology) and cached per integer frame.
 */
export class Derived {
  private data: AtmosData;
  private cache = new Map<string, Float32Array[]>();
  private flowCache = new Map<string, Array<{ u: Float32Array; v: Float32Array } | undefined>>();

  constructor(data: AtmosData) {
    this.data = data;
  }

  private vec(field: string, frame: number): { u: Float32Array; v: Float32Array } | null {
    const speed = this.data.frame(field, frame);
    const dirField = field.replace('speed', 'direction');
    if (!speed.length || !this.data.has(dirField)) return null;
    const dir = this.data.frame(dirField, frame);
    const n = speed.length;
    const u = new Float32Array(n);
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = speed[i] / 3.6; // km/h -> m/s
      const a = dir[i] * DEG;
      // meteorological direction is where the wind comes FROM
      u[i] = -s * Math.sin(a);
      v[i] = -s * Math.cos(a);
    }
    return { u, v };
  }

  flow(speedField: string, frame: number): { u: Float32Array; v: Float32Array } | null {
    let list = this.flowCache.get(speedField);
    if (!list) {
      list = [];
      this.flowCache.set(speedField, list);
    }
    const f = Math.max(0, Math.min(this.data.manifest.frameCount - 1, frame));
    if (!list[f]) {
      const v = this.vec(speedField, f);
      if (v) list[f] = v;
    }
    return list[f] ?? null;
  }

  private compute(kind: DerivedId, frame: number): Float32Array {
    const grid: FieldGrid = this.data.gridForDerived(kind);
    const { nx, ny, n, latMin, step } = grid;
    const out = new Float32Array(n);
    out.fill(NaN);
    const dd = step * DEG;
    const dLonM = (lat: number) => 111320 * Math.cos(lat * DEG) * dd;
    const dLatM = 110540 * dd;

    const gradient = (arr: Float32Array, x: number, y: number) => {
      const xw = (x - 1 + nx) % nx;
      const xe = (x + 1) % nx;
      const yn = Math.min(y + 2, ny - 1);
      const ys = Math.max(y - 2, 0);
      const lat = latMin + y * step;
      const dx = dLonM(lat);
      const dy = dLatM;
      return [
        (arr[y * nx + xe] - arr[y * nx + xw]) / (4 * dx),
        (arr[yn * nx + x] - arr[ys * nx + x]) / (4 * dy),
      ] as const;
    };

    if (kind === 'adv_temp' || kind === 'adv_moist' || kind === 'div10') {
      const w = this.vec('wind_speed_10m', frame);
      const scalar = kind === 'adv_temp'
        ? this.data.frame('temperature_2m', frame)
        : kind === 'adv_moist'
          ? this.data.frame('relative_humidity_2m', frame)
          : null;
      if (!w) return out;
      for (let y = 0; y < ny; y++) {
        const lat = latMin + y * step;
        for (let x = 0; x < nx; x++) {
          const i = y * nx + x;
          const u = w.u[i], v = w.v[i];
          if (u !== u || v !== v) continue;
          if (Math.abs(lat) > 81.5) continue;
          if (kind === 'div10') {
            const xw = (x - 2 + nx) % nx;
            const xe = (x + 2) % nx;
            const yn = Math.min(y + 2, ny - 1);
            const ys = Math.max(y - 2, 0);
            const dx = dLonM(lat);
            const dy = dLatM;
            const dudx = (w.u[y * nx + xe] - w.u[y * nx + xw]) / (4 * dx);
            const dvdy = (w.v[yn * nx + x] - w.v[ys * nx + x]) / (4 * dy);
            out[i] = (dudx + dvdy) * 1e5;
          } else if (scalar) {
            const s = scalar[i];
            if (s !== s) continue;
            const [gx, gy] = gradient(scalar, x, y);
            out[i] = -(u * gx + v * gy) * 3600;
          }
        }
      }
      if (kind === 'div10') {
        const sm = new Float32Array(n);
        for (let y = 0; y < ny; y++) {
          for (let x = 0; x < nx; x++) {
            let s = 0, c = 0;
            for (let yy = -1; yy <= 1; yy++) {
              const yj = y + yy;
              if (yj < 0 || yj >= ny) continue;
              for (let xx = -1; xx <= 1; xx++) {
                const v = out[yj * nx + ((x + xx + nx) % nx)];
                if (v === v) { s += v; c++; }
              }
            }
            sm[y * nx + x] = c ? s / c : NaN;
          }
        }
        return sm;
      }
      return out;
    }

    if (kind === 'ptend3') {
      const p = this.data.frame('pressure_msl', frame);
      const k = Math.min(3, frame);
      if (k <= 0) return out;
      const p0 = this.data.frame('pressure_msl', frame - k);
      for (let i = 0; i < n; i++) out[i] = (p[i] - p0[i]) * (3 / k);
      return out;
    }

    if (kind === 't2m_trend' || kind === 'sm_trend') {
      const field = kind === 't2m_trend' ? 'temperature_2m' : 'soil_moisture_0_to_7cm';
      if (frame < 24) return out;
      const a = this.data.frame(field, frame);
      const b = this.data.frame(field, frame - 24);
      for (let i = 0; i < n; i++) out[i] = a[i] - b[i];
      return out;
    }

    if (kind === 'dtd') {
      const t = this.data.frame('temperature_2m', frame);
      const td = this.data.frame('dew_point_2m', frame);
      for (let i = 0; i < n; i++) out[i] = t[i] - td[i];
      return out;
    }
    return out;
  }

  get(kind: DerivedId, frame: number): Float32Array {
    let list = this.cache.get(kind);
    if (!list) {
      list = [];
      this.cache.set(kind, list);
    }
    const f = Math.max(0, Math.min(this.data.manifest.frameCount - 1, frame));
    if (!list[f]) list[f] = this.compute(kind, f);
    return list[f];
  }

  interpolate(kind: DerivedId, frameFloat: number, out: Float32Array): Float32Array {
    const max = this.data.manifest.frameCount - 1;
    const t0 = Math.max(0, Math.min(max, Math.floor(frameFloat)));
    const t1 = Math.min(max, t0 + 1);
    const f = Math.max(0, Math.min(1, frameFloat - t0));
    const a = this.get(kind, t0);
    const b = this.get(kind, t1);
    for (let i = 0; i < out.length; i++) {
      const va = a[i], vb = b[i];
      out[i] = va !== va || vb !== vb ? NaN : va + (vb - va) * f;
    }
    return out;
  }
}
