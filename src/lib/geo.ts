export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export function normLon(lon: number): number {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  return l;
}

export function clampLat(lat: number): number {
  return Math.max(-82, Math.min(82, lat));
}

/** lon/lat (degrees) → unit vector. lon 0 faces +Z. */
export function lonLatToVec(lon: number, lat: number): [number, number, number] {
  const la = lat * DEG, lo = lon * DEG;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
}

export function vecToLonLat(x: number, y: number, z: number): [number, number] {
  const lon = Math.atan2(x, z) / DEG;
  const lat = Math.asin(Math.max(-1, Math.min(1, y))) / DEG;
  return [normLon(lon), lat];
}

/** NOAA-ish low precision solar position. Returns subsolar lat/lon. */
export function subsolar(date: Date): { lat: number; lon: number } {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = ((280.46 + 0.9856474 * n) % 360 + 360) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / DEG;
  const gmst = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24;
  const lon = normLon(ra - gmst * 15);
  return { lat: decl / DEG, lon };
}

export function solarVec(date: Date): [number, number, number] {
  const s = subsolar(date);
  return lonLatToVec(s.lon, s.lat);
}

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatLon(lon: number): string {
  return `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
}
export function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`;
}
