import type { DerivedId, FieldGrid, FieldMeta, Manifest } from './types';

export type LoadProgress = (p: number, label: string) => void;

const DERIVED_BASE: Record<DerivedId, string> = {
  adv_temp: 'temperature_2m',
  adv_moist: 'relative_humidity_2m',
  div10: 'wind_speed_10m',
  ptend3: 'pressure_msl',
  t2m_trend: 'temperature_2m',
  sm_trend: 'soil_moisture_0_to_7cm',
  dtd: 'temperature_2m',
};

export class AtmosData {
  manifest: Manifest;
  nx: number;
  ny: number;
  n: number;
  times: number[];
  generatedAt: number;
  lonMin: number;
  latMin: number;
  step: number;
  raw: Uint16Array;
  private starts = new Map<string, number>();
  private decoded = new Map<string, Float32Array>();
  private grids = new Map<string, FieldGrid>();

  constructor(manifest: Manifest, buffer: ArrayBuffer) {
    this.manifest = manifest;
    this.nx = manifest.lonCount;
    this.ny = manifest.latCount;
    this.n = manifest.pointCount;
    this.lonMin = manifest.grid.lonMin;
    this.latMin = manifest.grid.latMin;
    this.step = manifest.grid.step;
    this.times = manifest.times.map((t) => Date.parse(t));
    this.generatedAt = Date.parse(manifest.generated_at);
    this.raw = new Uint16Array(buffer);

    const top: FieldGrid = {
      nx: this.nx, ny: this.ny, n: this.n,
      lonMin: this.lonMin, latMin: this.latMin, step: this.step,
    };
    let cursor = 0;
    for (const field of manifest.fieldOrder) {
      const meta = manifest.fields[field] as FieldMeta;
      const g = meta.grid ?? top;
      this.grids.set(field, g);
      this.starts.set(field, cursor);
      cursor += manifest.frameCount * g.n;
    }
  }

  has(field: string): boolean {
    return this.starts.has(field);
  }

  gridFor(field: string): FieldGrid {
    return this.grids.get(field) ?? {
      nx: this.nx, ny: this.ny, n: this.n,
      lonMin: this.lonMin, latMin: this.latMin, step: this.step,
    };
  }

  gridForDerived(kind: DerivedId): FieldGrid {
    return this.gridFor(DERIVED_BASE[kind] ?? 'temperature_2m');
  }

  /** Fields are decoded on first use and kept; raw int16 stays compact. */
  getField(field: string): Float32Array {
    const cached = this.decoded.get(field);
    if (cached) return cached;
    const start = this.starts.get(field);
    if (start === undefined) return EMPTY;
    const meta = this.manifest.fields[field] as FieldMeta;
    const g = this.gridFor(field);
    const count = this.manifest.frameCount * g.n;
    const arr = new Float32Array(count);
    const { offset, scale } = meta;
    const raw = this.raw;
    for (let i = 0; i < count; i++) {
      const q = raw[start + i];
      arr[i] = q === 65535 ? NaN : offset + q * scale;
    }
    this.decoded.set(field, arr);
    return arr;
  }

  frame(field: string, t: number): Float32Array {
    const arr = this.getField(field);
    if (!arr.length) return EMPTY;
    const g = this.gridFor(field);
    const i = Math.max(0, Math.min(this.manifest.frameCount - 1, t));
    return arr.subarray(i * g.n, (i + 1) * g.n);
  }

  sample(field: string, t: number, lon: number, lat: number): number {
    const arr = this.getField(field);
    if (!arr.length) return NaN;
    const g = this.gridFor(field);
    const i = Math.max(0, Math.min(this.manifest.frameCount - 1, t));
    return this.bilinear(arr, i * g.n, lon, lat, g);
  }

  bilinear(arr: Float32Array, base: number, lon: number, lat: number, g: FieldGrid): number {
    let x = ((lon - g.lonMin) / g.step) % g.nx;
    if (x < 0) x += g.nx;
    let y = (lat - g.latMin) / g.step;
    y = Math.max(0, Math.min(g.ny - 1.000001, y));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = (x0 + 1) % g.nx;
    const y1 = Math.min(y0 + 1, g.ny - 1);
    const fx = x - x0;
    const fy = y - y0;
    const i00 = base + y0 * g.nx + x0;
    const i10 = base + y0 * g.nx + x1;
    const i01 = base + y1 * g.nx + x0;
    const i11 = base + y1 * g.nx + x1;
    const v00 = arr[i00], v10 = arr[i10], v01 = arr[i01], v11 = arr[i11];
    if (v00 !== v00 || v10 !== v10 || v01 !== v01 || v11 !== v11) return NaN;
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
  }

  interpolate(field: string, frameFloat: number, out: Float32Array): Float32Array {
    const arr = this.getField(field);
    if (!arr.length) {
      out.fill(NaN);
      return out;
    }
    const g = this.gridFor(field);
    const max = this.manifest.frameCount - 1;
    const t0 = Math.max(0, Math.min(max, Math.floor(frameFloat)));
    const t1 = Math.min(max, t0 + 1);
    const f = Math.max(0, Math.min(1, frameFloat - t0));
    const a = t0 * g.n;
    const b = t1 * g.n;
    if (f < 1e-4) {
      out.set(arr.subarray(a, a + g.n));
    } else {
      for (let i = 0; i < g.n; i++) {
        const va = arr[a + i], vb = arr[b + i];
        out[i] = va !== va || vb !== vb ? NaN : va + (vb - va) * f;
      }
    }
    return out;
  }

  index(lon: number, lat: number, field = 'temperature_2m'): number {
    const g = this.gridFor(field);
    let x = Math.round((lon - g.lonMin) / g.step);
    x = ((x % g.nx) + g.nx) % g.nx;
    let y = Math.round((lat - g.latMin) / g.step);
    y = Math.max(0, Math.min(g.ny - 1, y));
    return y * g.nx + x;
  }
}

const EMPTY = new Float32Array(0);

export async function loadSnapshot(base: string, onProgress: LoadProgress): Promise<AtmosData> {
  onProgress(0.04, 'reading the analysis index');
  const mres = await fetch(`${base}/manifest.json`, { cache: 'no-cache' });
  if (!mres.ok) throw new Error(`manifest ${mres.status}`);
  const manifest: Manifest = await mres.json();

  onProgress(0.1, 'pulling the planetary field');
  const bres = await fetch(`${base}/${manifest.binary}?v=${manifest.build_id ?? manifest.bytes}`);
  if (!bres.ok) throw new Error(`grid ${bres.status}`);
  const total = Number(bres.headers.get('content-length') || manifest.bytes || 1);
  const reader = bres.body?.getReader();
  let received = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        onProgress(0.1 + 0.8 * Math.min(1, received / total), 'pulling the planetary field');
      }
    }
  } else {
    chunks.push(new Uint8Array(await bres.arrayBuffer()));
  }
  const buf = new Uint8Array(received || chunks.reduce((a, c) => a + c.byteLength, 0));
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }

  onProgress(0.94, 'indexing 33 fields');
  await new Promise((r) => setTimeout(r, 10));
  const data = new AtmosData(manifest, buf.buffer);
  onProgress(1, 'atmosphere ready');
  return data;
}

/** Choose the 24 h window that ends at the data cut (never presents forecast as past). */
export function windowFor(data: AtmosData): { start: number; end: number } {
  const cap = Math.min(Date.now(), data.generatedAt + 30 * 60 * 1000);
  let end = -1;
  for (let i = 0; i < data.times.length; i++) {
    if (data.times[i] <= cap) end = i;
  }
  if (end < 0) end = data.times.length - 1;
  const start = Math.max(0, end - 24);
  return { start, end };
}
