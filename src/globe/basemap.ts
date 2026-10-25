type Ring = number[][];
type Poly = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
type Feature = { type: 'Feature'; properties: Record<string, unknown>; geometry: Poly | { type: string } };
type FC = { type: 'FeatureCollection'; features: Feature[] };

async function geo(path: string): Promise<FC> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

function project(lon: number, lat: number, w: number, h: number): [number, number] {
  return [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
}

function addRing(ctx: CanvasRenderingContext2D, ring: Ring, w: number, h: number, ox: number) {
  let first = true;
  let prevLon = 0;
  for (const p of ring) {
    const lon = p[0];
    const [x, y] = project(lon, p[1], w, h);
    if (!first && Math.abs(lon - prevLon) > 180) {
      // antimeridian: break the subpath
      ctx.closePath();
      ctx.moveTo(x + ox, y);
    } else if (first) {
      ctx.moveTo(x + ox, y);
    } else {
      ctx.lineTo(x + ox, y);
    }
    first = false;
    prevLon = lon;
  }
  ctx.closePath();
}

function addGeometry(ctx: CanvasRenderingContext2D, g: Feature['geometry'], w: number, h: number, ox: number) {
  if (g.type === 'Polygon') {
    for (const ring of (g as { coordinates: Ring[] }).coordinates) addRing(ctx, ring, w, h, ox);
  } else if (g.type === 'MultiPolygon') {
    for (const poly of (g as { coordinates: Ring[][] }).coordinates) for (const ring of poly) addRing(ctx, ring, w, h, ox);
  }
}

function addLines(ctx: CanvasRenderingContext2D, coords: Ring, w: number, h: number) {
  let first = true;
  let prevLon = 0;
  for (const p of coords) {
    const lon = p[0];
    const [x, y] = project(lon, p[1], w, h);
    if (first || Math.abs(lon - prevLon) > 180) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    first = false;
    prevLon = lon;
  }
}

function drawFeatureSet(
  ctx: CanvasRenderingContext2D,
  fc: FC,
  w: number,
  h: number,
  style: 'fill' | 'stroke',
) {
  for (const f of fc.features) {
    if (style === 'fill') {
      addGeometry(ctx, f.geometry, w, h, 0);
    } else if (f.geometry.type === 'LineString') {
      addLines(ctx, (f.geometry as unknown as { coordinates: Ring }).coordinates, w, h);
    } else if (f.geometry.type === 'MultiLineString') {
      for (const line of (f.geometry as unknown as { coordinates: Ring[] }).coordinates) addLines(ctx, line, w, h);
    } else if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
      addGeometry(ctx, f.geometry, w, h, 0);
    }
  }
}

export type BaseAssets = { map: HTMLCanvasElement; mask: HTMLCanvasElement; width: number };

export async function buildBasemap(size?: number): Promise<BaseAssets> {
  const w = size ?? (window.innerWidth < 900 ? 1024 : 1536);
  const h = w / 2;
  const mobile = w <= 1024;

  const [land, coast, lakes, borders] = await Promise.all([
    geo('/geo/land.geojson'),
    geo('/geo/coastline.geojson'),
    geo('/geo/lakes.geojson'),
    geo('/geo/countries.geojson').catch(() => ({ type: 'FeatureCollection', features: [] } as FC)),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  // deep ocean with a subtle equatorial lift
  const ocean = ctx.createLinearGradient(0, 0, 0, h);
  ocean.addColorStop(0, '#03090d');
  ocean.addColorStop(0.45, '#06141b');
  ocean.addColorStop(0.55, '#071820');
  ocean.addColorStop(1, '#03090d');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, w, h);

  // faint ocean texture
  const noise = document.createElement('canvas');
  noise.width = 256; noise.height = 128;
  const nctx = noise.getContext('2d')!;
  const img = nctx.createImageData(256, 128);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd() > 0.62 ? 255 : 0;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = v ? 10 : 0;
  }
  nctx.putImageData(img, 0, 0);
  const pat = ctx.createPattern(noise, 'repeat');
  if (pat) { ctx.globalAlpha = 0.5; ctx.fillStyle = pat; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }

  // land
  const landGrad = ctx.createLinearGradient(0, 0, 0, h);
  landGrad.addColorStop(0, '#081216');
  landGrad.addColorStop(0.48, '#0c1c21');
  landGrad.addColorStop(0.55, '#0c1b20');
  landGrad.addColorStop(1, '#081216');
  ctx.beginPath();
  drawFeatureSet(ctx, land, w, h, 'fill');
  ctx.fillStyle = landGrad;
  ctx.fill('evenodd');

  // lakes cut back to water
  ctx.beginPath();
  drawFeatureSet(ctx, lakes, w, h, 'fill');
  ctx.fillStyle = '#051219';
  ctx.fill('evenodd');

  // borders, very quiet
  ctx.strokeStyle = 'rgba(122,176,176,0.16)';
  ctx.lineWidth = Math.max(0.6, w / 5200);
  ctx.setLineDash([w / 1400, w / 500]);
  ctx.beginPath();
  drawFeatureSet(ctx, borders, w, h, 'stroke');
  ctx.stroke();
  ctx.setLineDash([]);

  // coastlines: a bloom, then a fine line
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(35,150,150,0.16)';
  ctx.lineWidth = mobile ? 2.8 : 4.2;
  ctx.beginPath();
  drawFeatureSet(ctx, coast, w, h, 'stroke');
  ctx.stroke();
  ctx.strokeStyle = 'rgba(96,214,200,0.55)';
  ctx.lineWidth = mobile ? 0.7 : 1;
  ctx.beginPath();
  drawFeatureSet(ctx, coast, w, h, 'stroke');
  ctx.stroke();

  // subtle graticule baked at very low contrast
  ctx.strokeStyle = 'rgba(130,190,190,0.055)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = project(lon, 0, w, h)[0];
    ctx.moveTo(x, 0); ctx.lineTo(x, h);
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = project(0, lat, w, h)[1];
    ctx.moveTo(0, y); ctx.lineTo(w, y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(150,220,210,0.09)';
  ctx.beginPath();
  const eq = project(0, 0, w, h)[1];
  ctx.moveTo(0, eq); ctx.lineTo(w, eq);
  ctx.stroke();

  // ── land mask ──────────────────────────────────────────────────────────────
  const mw = 1024, mh = 512;
  const mask = document.createElement('canvas');
  mask.width = mw; mask.height = mh;
  const mctx = mask.getContext('2d')!;
  mctx.fillStyle = '#000';
  mctx.fillRect(0, 0, mw, mh);
  mctx.beginPath();
  drawFeatureSet(mctx, land, mw, mh, 'fill');
  mctx.fillStyle = '#fff';
  mctx.fill('evenodd');
  mctx.beginPath();
  drawFeatureSet(mctx, lakes, mw, mh, 'fill');
  mctx.fillStyle = '#000';
  mctx.fill('evenodd');

  return { map: canvas, mask, width: w };
}
