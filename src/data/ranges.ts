import type { AtmosData } from './snapshot';

export type RangeId = '24h' | 'week' | 'month' | 'long';
export type RangePreset = 'today' | '24h' | 'week' | 'month' | 'long' | 'custom';

export type RangeMeta = {
  id: RangeId;
  path: string;
  label: string;
  gridLabel: string;
  start: string;
  end: string;
  stepHours: number;
  frames: number;
  buildId: string;
  bytes: number;
};

export type RangeIndex = {
  generated_at: string;
  ranges: Partial<Record<RangeId, RangeMeta>>;
};

export const RANGE_ORDER: RangeId[] = ['24h', 'week', 'month', 'long'];

export function localDateValue(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLocalDate(v: string): number {
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return Date.now();
  return new Date(y, m - 1, d).getTime();
}

export function todayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function shortDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' }).format(new Date(ms));
}

export function shortDateTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}

export function formatRangeLabel(startMs: number, endMs: number): string {
  const a = new Date(startMs), b = new Date(endMs);
  if (a.toDateString() === b.toDateString()) return shortDate(startMs);
  return `${shortDate(startMs)} – ${shortDate(endMs)}`;
}

export function chooseRange(startMs: number, endMs: number, ranges: RangeIndex | null): RangeId {
  if (!ranges) return '24h';
  const within = (id: RangeId) => {
    const r = ranges.ranges[id];
    if (!r) return false;
    return startMs >= Date.parse(r.start) - 1000 && endMs <= Date.parse(r.end) + 1000;
  };
  if (within('24h')) return '24h';
  if (within('week')) return 'week';
  if (within('month')) return 'month';
  if (within('long')) return 'long';
  return 'long';
}

export function hasRange(ranges: RangeIndex | null, id: RangeId): boolean {
  return !!ranges?.ranges[id];
}

export function datasetBase(ranges: RangeIndex | null, id: RangeId): string {
  return ranges?.ranges[id]?.path ?? (id === '24h' ? '/data' : `/data/${id}`);
}

export function computePulse(data: AtmosData, start: number, end: number): number[] {
  const field = data.has('precipitation') ? 'precipitation'
    : data.has('total_precipitable_water') ? 'total_precipitable_water' : null;
  if (!field) return new Array(end - start + 1).fill(0);
  const out: number[] = [];
  for (let f = start; f <= end; f++) {
    const arr = data.frame(field, f);
    let s = 0, c = 0;
    for (let i = 0; i < arr.length; i += 7) {
      const v = arr[i];
      if (v === v) { s += v; c++; }
    }
    out.push(c ? s / c : 0);
  }
  const max = Math.max(...out, 1e-6);
  return out.map((v) => v / max);
}

export function frameWindow(data: AtmosData, startMs?: number, endMs?: number): { start: number; end: number } {
  let start = 0;
  let end = data.times.length - 1;
  if (startMs !== undefined) {
    start = data.times.findIndex((t) => t >= startMs);
    if (start < 0) start = 0;
  }
  if (endMs !== undefined) {
    let e = -1;
    for (let i = data.times.length - 1; i >= 0; i--) {
      if (data.times[i] <= endMs) { e = i; break; }
    }
    if (e >= 0) end = e;
  }
  if (end <= start) end = Math.min(data.times.length - 1, start + 1);
  return { start, end };
}
