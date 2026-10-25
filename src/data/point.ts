export type PointSeries = {
  time: number[];
  temperature: number[];
  rh: number[];
  dew: number[];
  pressure: number[];
  wind: number[];
  dir: number[];
  gust: number[];
  precip: number[];
  et0: number[];
  soil: number[];
  vpd: number[];
  cape: number[];
  cloud: number[];
};

const VARS = {
  temperature: 'temperature_2m',
  rh: 'relative_humidity_2m',
  dew: 'dew_point_2m',
  pressure: 'pressure_msl',
  wind: 'wind_speed_10m',
  dir: 'wind_direction_10m',
  gust: 'wind_gusts_10m',
  precip: 'precipitation',
  et0: 'et0_fao_evapotranspiration',
  soil: 'soil_moisture_0_to_7cm',
  vpd: 'vapour_pressure_deficit',
  cape: 'cape',
  cloud: 'cloud_cover',
};

const mem = new Map<string, PointSeries>();

export async function fetchPoint(lat: number, lon: number): Promise<PointSeries> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hour = Math.floor(Date.now() / 3600000);
  const cacheKey = `aeros.point.${key}.${hour}`;
  if (mem.has(cacheKey)) return mem.get(cacheKey)!;
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      const s = JSON.parse(raw) as PointSeries;
      mem.set(cacheKey, s);
      return s;
    }
  } catch { /* ignore */ }

  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    hourly: Object.values(VARS).join(','),
    past_days: '1',
    forecast_days: '1',
    timezone: 'GMT',
  });
  const url = `https://historical-forecast-api.open-meteo.com/v1/forecast?${params}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`point ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(d.reason || 'point request failed');
  const h = d.hourly;
  const series: PointSeries = {
    time: h.time.map((t: string) => Date.parse(t + 'Z')),
    temperature: h[VARS.temperature],
    rh: h[VARS.rh],
    dew: h[VARS.dew],
    pressure: h[VARS.pressure],
    wind: h[VARS.wind],
    dir: h[VARS.dir],
    gust: h[VARS.gust],
    precip: h[VARS.precip],
    et0: h[VARS.et0],
    soil: h[VARS.soil],
    vpd: h[VARS.vpd],
    cape: h[VARS.cape],
    cloud: h[VARS.cloud],
  };
  mem.set(cacheKey, series);
  try { sessionStorage.setItem(cacheKey, JSON.stringify(series)); } catch { /* ignore */ }
  return series;
}
