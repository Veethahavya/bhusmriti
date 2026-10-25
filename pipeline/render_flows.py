#!/usr/bin/env python3
"""Pre-render flow layers as datashader raster overlays for the globe.

Streamlines are integrated from the stored u/v fields, their points are
aggregated with datashader (mean speed + density), and saved as transparent
equirectangular PNGs plus a per-range manifest. The web app samples these
overlays on the sphere instead of the canvas particle trails.
"""
from __future__ import annotations
import json, math, sys
from pathlib import Path
import numpy as np
import pandas as pd
import datashader as ds
import colorcet as cc
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data'
OUT = DATA / 'flows'
W, H = 1024, 512
SEED_X, SEED_Y = 90, 45
STEPS = 26
STEP_DEG = 0.9

FLOWS = {
    'wind10': ('wind_speed_10m', 'wind_direction_10m'),
    'wind850': ('wind_speed_850hPa', 'wind_direction_850hPa'),
    'wind500': ('wind_speed_500hPa', 'wind_direction_500hPa'),
    'wind250': ('wind_speed_250hPa', 'wind_direction_250hPa'),
    'ocean_current': ('ocean_current_velocity', 'ocean_current_direction'),
}
COLORS = {
    'wind10': ['#00000000', '#1b4f72', '#2e86ab', '#5eead4', '#e8fff8', '#ffb26b'],
    'ocean_current': ['#00000000', '#083b66', '#0d6e92', '#22a6b3', '#7ee8dc', '#ffd28a'],
}


def load_range(base: Path):
    m = json.loads((base / 'manifest.json').read_text())
    raw = np.frombuffer((base / m['binary']).read_bytes(), dtype='<u2')
    starts = {}
    cursor = 0
    for f in m['fieldOrder']:
        meta = m['fields'][f]
        g = meta['grid']
        starts[f] = (cursor, g, meta)
        cursor += m['frameCount'] * g['n']
    return m, raw, starts


def field(raw, starts, name, frame):
    if name not in starts:
        return None
    start, g, meta = starts[name]
    arr = raw[start + frame * g['n']: start + (frame + 1) * g['n']].astype(np.float32)
    arr[arr == 65535] = np.nan
    return meta['offset'] + arr * meta['scale'], g


def bilinear(arr, g, lon, lat):
    x = ((lon - g['lonMin']) / g['step']) % g['nx']
    y = (lat - g['latMin']) / g['step']
    y = np.clip(y, 0, g['ny'] - 1.000001)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    x1 = (x0 + 1) % g['nx']; y1 = np.minimum(y0 + 1, g['ny'] - 1)
    fx = x - x0; fy = y - y0
    a = arr[y0 * g['nx'] + x0]; b = arr[y0 * g['nx'] + x1]
    c = arr[y1 * g['nx'] + x0]; d = arr[y1 * g['nx'] + x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def render(frame, raw, starts, flow):
    speed_f, dir_f = FLOWS[flow]
    sv = field(raw, starts, speed_f, frame)
    dv = field(raw, starts, dir_f, frame)
    if sv is None or dv is None:
        return None
    speed, g = sv
    direction, _ = dv
    valid = np.isfinite(speed) & np.isfinite(direction)
    if not valid.any():
        return None
    sp = np.where(valid, speed, 0.0)
    ang = np.where(valid, np.deg2rad(direction), 0.0)
    u = -sp * np.sin(ang) / 3.6
    v = -sp * np.cos(ang) / 3.6

    lons = np.linspace(-178, 178, SEED_X)
    lats = np.linspace(-78, 78, SEED_Y)
    seed_lon, seed_lat = np.meshgrid(lons, lats)
    seed_lon = seed_lon.ravel(); seed_lat = seed_lat.ravel()
    keep = np.isfinite(bilinear(sp, g, seed_lon, seed_lat))
    seed_lon = seed_lon[keep]; seed_lat = seed_lat[keep]

    lines_x, lines_y, lines_s = [], [], []
    for lon0, lat0 in zip(seed_lon, seed_lat):
        xs = [float(lon0)]; ys = [float(lat0)]; ss = []
        lon = float(lon0); lat = float(lat0)
        for _ in range(STEPS):
            uu = bilinear(u, g, lon, lat); vv = bilinear(v, g, lon, lat)
            if not (np.isfinite(uu) and np.isfinite(vv)):
                break
            spd = math.hypot(uu, vv)
            if spd < 0.15:
                break
            k = STEP_DEG / max(0.2, spd)
            lon += uu * k * 3.6
            lat += vv * k * 3.6
            if lon > 180: lon -= 360
            if lon < -180: lon += 360
            lat = max(-85, min(85, lat))
            xs.append(lon); ys.append(lat); ss.append(spd * 3.6)
        if len(xs) >= 4:
            lines_x.append(np.array(xs)); lines_y.append(np.array(ys)); lines_s.append(float(np.mean(ss)))

    if not lines_x:
        return None
    df = pd.DataFrame({'x': lines_x, 'y': lines_y, 'speed': lines_s})
    canvas = ds.Canvas(plot_width=W, plot_height=H, x_range=(-180, 180), y_range=(-90, 90))
    # datashader line requires RaggedArray in this version; use points along
    # streamlines, aggregated per pixel. Density is rendered as alpha.
    px, py, ps = [], [], []
    for xs, ys, spd in zip(lines_x, lines_y, lines_s):
        px.extend(xs); py.extend(ys); ps.extend([spd] * len(xs))
    pts = pd.DataFrame({'x': px, 'y': py, 'speed': ps})
    agg = canvas.points(pts, 'x', 'y', agg=ds.mean('speed'))
    cnt = canvas.points(pts, 'x', 'y', agg=ds.count())
    vals = np.asarray(agg.values, dtype=float)
    counts = np.asarray(cnt.values, dtype=float)
    if not np.isfinite(vals).any():
        return None
    vmin = float(np.nanpercentile(vals[counts > 0], 5))
    vmax = float(np.nanpercentile(vals[counts > 0], 99))
    if vmax <= vmin: vmax = vmin + 1
    n = np.clip((vals - vmin) / (vmax - vmin), 0, 1)
    cmap = cc.palette(COLORS.get(flow, COLORS['wind10'])) if False else None
    # use a small manual ramp matching the app palette
    ramp = np.array([[27, 79, 114], [46, 134, 171], [94, 234, 212], [232, 255, 248], [255, 178, 107]], dtype=float) / 255
    idx = n * (len(ramp) - 1)
    lo = np.floor(idx).astype(int); hi = np.minimum(lo + 1, len(ramp) - 1); f = idx - lo
    rgb = ramp[lo] * (1 - f[..., None]) + ramp[hi] * f[..., None]
    dens = np.clip(np.log1p(counts) / math.log1p(max(1.0, np.percentile(counts[counts > 0], 90))), 0, 1)
    alpha = np.where(counts > 0, 0.22 + 0.78 * dens, 0)
    rgba = np.dstack([rgb, alpha])
    rgba = np.flipud(rgba)  # datashader y is bottom-up; PNG is top-down
    img = Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA')
    return img


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    ranges = {'24h': DATA, 'week': DATA / 'week', 'month': DATA / 'month'}
    for rid, base in ranges.items():
        if not (base / 'manifest.json').exists():
            continue
        m, raw, starts = load_range(base)
        frames = m['frameCount']
        for flow in FLOWS:
            if only and flow != only:
                continue
            if FLOWS[flow][0] not in starts or FLOWS[flow][1] not in starts:
                continue
            outdir = OUT / rid / flow
            outdir.mkdir(parents=True, exist_ok=True)
            index = []
            limit = int(__import__('os').environ.get('FLOW_MAX_FRAMES', '0') or 0)
            for f in range(frames if not limit else min(frames, limit)):
                p = outdir / f'{f:03d}.png'
                if not p.exists():
                    img = render(f, raw, starts, flow)
                    if img is None:
                        continue
                    img.save(p, optimize=True)
                index.append({'frame': f, 'time': m['times'][f], 'url': f'/data/flows/{rid}/{flow}/{f:03d}.png'})
            (outdir / 'manifest.json').write_text(json.dumps({'range': rid, 'flow': flow, 'frames': index}, indent=1))
            print(rid, flow, len(index), 'frames', flush=True)


if __name__ == '__main__':
    main()
