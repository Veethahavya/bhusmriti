import { useEffect, useMemo, useState } from 'react';
import { useAtmos } from './store';
import { buildBrief, type Brief, type GridExtras } from './brief';
import { fetchPoint, type PointSeries } from './point';
import type { AtmosData } from './snapshot';
import type { Derived } from './derive';

function gridFallback(data: AtmosData, derived: Derived, lat: number, lon: number, end: number): Brief | null {
  const t = Math.round(end);
  const s = (field: string) => (data.has(field) ? data.sample(field, t, lon, lat) : NaN);
  const time = data.times[t] ?? Date.now();
  const temp = s('temperature_2m');
  if (!Number.isFinite(temp)) return null;
  const conv = derived.get('div10', t);
  const adv = derived.get('adv_temp', t);
  const land = data.has('soil_moisture_0_to_7cm_change_24h');
  const smt = land ? data.frame('soil_moisture_0_to_7cm_change_24h', t) : new Float32Array(0);
  const extras: GridExtras = {
    convergence: conv ? data.bilinear(conv, 0, lon, lat, data.gridForDerived('div10')) : undefined,
    advTemp: adv ? data.bilinear(adv, 0, lon, lat, data.gridForDerived('adv_temp')) : undefined,
    soilTrend: land && smt.length ? data.bilinear(smt, 0, lon, lat, data.gridFor('soil_moisture_0_to_7cm_change_24h')) : undefined,
  };
  const series: PointSeries = {
    time: [time], temperature: [temp], rh: [s('relative_humidity_2m')], dew: [s('dew_point_2m')],
    pressure: [s('pressure_msl')], wind: [s('wind_speed_10m')], dir: [s('wind_direction_10m')],
    gust: [s('wind_gusts_10m')], precip: [s('precipitation')], et0: [s('et0_fao_evapotranspiration')],
    soil: [s('soil_moisture_0_to_7cm')], vpd: [s('vapour_pressure_deficit')], cape: [s('cape')],
    cloud: [s('cloud_cover')],
  };
  const b = buildBrief(series, extras);
  b.headline = extras.convergence && extras.convergence > 0.5
    ? 'Surface air is converging here — watch for lift and cloud build-up.'
    : 'Model grid only — the local sounding is unavailable.';
  return b;
}

export function useBrief() {
  const home = useAtmos((s) => s.home);
  const data = useAtmos((s) => s.data);
  const derived = useAtmos((s) => s.derived);
  const end = useAtmos((s) => s.end);
  const atmosphereOnly = useAtmos((s) => !!s.data?.manifest.atmosphereOnly);
  const [series, setSeries] = useState<PointSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (atmosphereOnly) {
      setSeries(null);
      setLoading(false);
      setError(null);
      return () => { cancelled = true; };
    }
    setLoading(true);
    setError(null);
    fetchPoint(home.lat, home.lon)
      .then((s) => { if (!cancelled) { setSeries(s); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setSeries(null); setError(e instanceof Error ? e.message : String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [home.lat, home.lon, atmosphereOnly]);

  const extras = useMemo<GridExtras>(() => {
    if (!data || !derived) return {};
    const t = Math.round(end);
    try {
      const conv = derived.get('div10', t);
      const adv = derived.get('adv_temp', t);
      const smt = data.frame('soil_moisture_0_to_7cm_change_24h', t);
      return {
        convergence: conv ? data.bilinear(conv, 0, home.lon, home.lat, data.gridForDerived('div10')) : undefined,
        advTemp: adv ? data.bilinear(adv, 0, home.lon, home.lat, data.gridForDerived('adv_temp')) : undefined,
        soilTrend: smt.length ? data.bilinear(smt, 0, home.lon, home.lat, data.gridFor('soil_moisture_0_to_7cm_change_24h')) : undefined,
      };
    } catch { return {}; }
  }, [data, derived, end, home.lat, home.lon]);

  const brief = useMemo(() => {
    if (series) return buildBrief(series, extras);
    if (data && derived) return gridFallback(data, derived, home.lat, home.lon, end);
    return null;
  }, [series, extras, data, derived, home.lat, home.lon, end]);

  return { brief, loading, error, series };
}
