import type { PointSeries } from './point';

export type WindRose = Array<{ dir: number; speed: number; count: number }>;

export type Brief = {
  index: number;
  time: number;
  temp: number;
  tempMin: number;
  tempMax: number;
  tempTrend: number;
  rh: number;
  dew: number;
  dtd: number;
  vpd: number;
  wind: number;
  dir: number;
  gust: number;
  dirShift: number;
  pressure: number;
  ptend3: number;
  ptend24: number;
  precip24: number;
  et24: number;
  soil: number;
  soilTrend: number;
  cape: number;
  cloud: number;
  convergence: number;
  advTemp: number;
  rose: WindRose;
  headline: string;
  signals: Array<{ tone: 'watch' | 'wet' | 'storm' | 'calm'; label: string; detail: string }>;
};

export type GridExtras = {
  convergence?: number;
  advTemp?: number;
  soilTrend?: number;
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const at = (a: number[], i: number): number => (i >= 0 && i < a.length ? num(a[i]) : NaN);
const sum = (a: number[], i0: number, i1: number): number => {
  let s = 0;
  for (let i = Math.max(0, i0); i <= Math.min(a.length - 1, i1); i++) {
    const v = num(a[i]);
    if (Number.isFinite(v)) s += v;
  }
  return s;
};
const finite = (a: number[]): number[] => a.filter((v) => Number.isFinite(v));

export function buildBrief(s: PointSeries, extras: GridExtras = {}): Brief {
  let index = s.time.length - 1;
  const cap = Date.now() + 20 * 60 * 1000;
  for (let i = s.time.length - 1; i >= 0; i--) {
    if (s.time[i] <= cap) { index = i; break; }
  }
  const i0 = Math.max(0, index - 24);
  const temp = at(s.temperature, index);
  const temps = finite(s.temperature.slice(i0, index + 1));
  const pressure = at(s.pressure, index);
  const p3 = at(s.pressure, Math.max(0, index - 3));
  const p24 = at(s.pressure, i0);
  const wind = at(s.wind, index);
  const dir = at(s.dir, index);
  const prevDir = at(s.dir, Math.max(0, index - 6));
  const dtd = temp - at(s.dew, index);
  const ptend3 = pressure - p3;
  const ptend24 = pressure - p24;
  const soil = at(s.soil, index);
  const soil0 = at(s.soil, i0);
  const convergence = Number.isFinite(extras.convergence) ? Math.max(-8, Math.min(8, extras.convergence!)) : NaN;
  const advTemp = Number.isFinite(extras.advTemp) ? Math.max(-3, Math.min(3, extras.advTemp!)) : NaN;
  const cape = at(s.cape, index);
  const rh = at(s.rh, index);
  const precip24 = sum(s.precip, i0, index);
  const et24 = sum(s.et0, i0, index);

  let ds = dir - prevDir;
  ds = ((ds + 540) % 360) - 180;

  const rose: WindRose = Array.from({ length: 16 }, (_, k) => ({ dir: k * 22.5, speed: 0, count: 0 }));
  for (let i = i0; i <= index; i++) {
    const d = num(s.dir[i]);
    const w = num(s.wind[i]);
    if (!Number.isFinite(d) || !Number.isFinite(w)) continue;
    const k = Math.round(((d % 360) + 360) % 360 / 22.5) % 16;
    rose[k].speed += w;
    rose[k].count += 1;
  }
  for (const r of rose) if (r.count) r.speed /= r.count;

  const signals: Brief['signals'] = [];
  if (!Number.isFinite(temp)) {
    return {
      index, time: s.time[index] ?? Date.now(), temp: NaN, tempMin: NaN, tempMax: NaN, tempTrend: NaN,
      rh: NaN, dew: NaN, dtd: NaN, vpd: NaN, wind: NaN, dir: NaN, gust: NaN, dirShift: NaN,
      pressure: NaN, ptend3: NaN, ptend24: NaN, precip24: NaN, et24: NaN, soil: NaN,
      soilTrend: NaN, cape: NaN, cloud: NaN, convergence: NaN, advTemp: NaN, rose, headline: 'Waiting for the local sounding…', signals,
    };
  }

  if (ptend3 < -1.2) signals.push({ tone: 'watch', label: 'Pressure falling', detail: `${ptend3.toFixed(1)} hPa in 3 h — weather is organising.` });
  if (ptend3 > 1.2) signals.push({ tone: 'calm', label: 'Pressure rising', detail: `${ptend3.toFixed(1)} hPa in 3 h — clearing trend.` });
  if (rh > 78 && dtd < 3) signals.push({ tone: 'wet', label: 'Near saturation', detail: `RH ${rh.toFixed(0)}%, dew-point gap ${dtd.toFixed(1)} °C — fog or low cloud.` });
  if (precip24 > 1) signals.push({ tone: 'wet', label: 'Wet day', detail: `${precip24.toFixed(1)} mm in the last 24 h.` });
  if (cape > 1200 && (convergence > 0.5 || ptend3 < -1)) signals.push({ tone: 'storm', label: 'Storm ingredients', detail: `CAPE ${cape.toFixed(0)} J/kg with lift — watch convective development.` });
  if (Number.isFinite(convergence) && convergence > 1.5) signals.push({ tone: 'watch', label: 'Surface convergence', detail: `${convergence.toFixed(1)} ×10⁻⁵ s⁻¹ — air is pooling and rising.` });
  if (Number.isFinite(advTemp) && advTemp > 0.4) signals.push({ tone: 'watch', label: 'Warm advection', detail: `+${advTemp.toFixed(1)} K/h — warmer air is arriving.` });
  if (Number.isFinite(advTemp) && advTemp < -0.4) signals.push({ tone: 'watch', label: 'Cold advection', detail: `${advTemp.toFixed(1)} K/h — colder air is arriving.` });
  if (Math.abs(ds) > 45) signals.push({ tone: 'watch', label: 'Wind veering', detail: `Direction shifted ${Math.abs(ds).toFixed(0)}° in 6 h — a boundary is near.` });
  if (wind > 32) signals.push({ tone: 'watch', label: 'Strong flow', detail: `${wind.toFixed(0)} km/h sustained, gusting ${at(s.gust, index).toFixed(0)}.` });
  if (et24 > 3) signals.push({ tone: 'calm', label: 'High evaporative demand', detail: `${et24.toFixed(1)} mm ET₀ in 24 h — the surface is drying.` });

  let headline = 'A quiet signal — follow the flow and the next pressure change.';
  if (cape > 1500 && (convergence > 0.5 || ptend3 < -1)) headline = 'Storm ingredients are in place — instability is meeting lift.';
  else if (ptend3 < -1.2 && rh > 70) headline = 'Weather is organising — moisture is pooling as pressure falls.';
  else if (ptend3 < -1.2) headline = 'Pressure is falling. A change is on the way.';
  else if (ptend3 > 1.2 && rh < 70) headline = 'Clearing trend — pressure is rising and the air is drying.';
  else if (et24 > 3 && soil < 0.2) headline = 'The land is drying — high evaporation with a thin soil-moisture buffer.';
  else if (dtd < 1.5) headline = 'Saturation is close — fog or low cloud is likely.';
  else if (wind > 32) headline = 'A brisk flow is in place — watch the gust gradient and wind shift.';
  else if (advTemp > 0.4) headline = 'Warmer air is arriving — the thermal gradient is on the move.';

  return {
    index, time: s.time[index], temp,
    tempMin: temps.length ? Math.min(...temps) : NaN,
    tempMax: temps.length ? Math.max(...temps) : NaN,
    tempTrend: temp - at(s.temperature, Math.max(0, index - 6)),
    rh, dew: at(s.dew, index), dtd, vpd: at(s.vpd, index),
    wind, dir, gust: at(s.gust, index), dirShift: ds,
    pressure, ptend3, ptend24, precip24, et24, soil,
    soilTrend: Number.isFinite(extras.soilTrend) ? extras.soilTrend! : soil - soil0,
    cape, cloud: at(s.cloud, index), convergence, advTemp, rose, headline, signals,
  };
}

export function windDirLabel(deg: number): string {
  if (!Number.isFinite(deg)) return '—';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
