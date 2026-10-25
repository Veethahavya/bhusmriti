#!/usr/bin/env python3
"""Build the AEROS 24-hour global snapshot.

Atmosphere : NOAA GFS 1° fields, re-gridded by earth.nullschool.net (EPak).
Land/hydro : Open-Meteo historical-forecast API (ERA5/GFS blend), 7.5°.

Outputs public/data/manifest.json + snapshot.bin (2° global grid, 25 frames).
"""
from __future__ import annotations

import gzip
import json
import math
import os
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from epak import decode, variable_for  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data'
CACHE = ROOT / '.cache'
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(exist_ok=True)

NS_BASE = 'https://gaia.nullschool.net/data/gfs'
OM_BASE = 'https://historical-forecast-api.open-meteo.com/v1/forecast'
UA = 'AEROS/1.0 (personal atmosphere atlas)'

NFRAMES = 25
HOUR_MS = 3600_000

# product, level, output speed name
WIND_SPECS = [
    ('wind', 'surface', 'wind_speed_10m', 'wind_direction_10m'),
    ('wind', '850hPa', 'wind_speed_850hPa', 'wind_direction_850hPa'),
    ('wind', '500hPa', 'wind_speed_500hPa', 'wind_direction_500hPa'),
    ('wind', '250hPa', 'wind_speed_250hPa', 'wind_direction_250hPa'),
]
SCALAR_SPECS = [
    ('temp', 'surface', 'temperature_2m', lambda v: v - 273.15),
    ('temp', '850hPa', 'temperature_850hPa', lambda v: v - 273.15),
    ('temp', '500hPa', 'temperature_500hPa', lambda v: v - 273.15),
    ('relative_humidity', 'surface', 'relative_humidity_2m', lambda v: v),
    ('relative_humidity', '850hPa', 'relative_humidity_850hPa', lambda v: v),
    ('dew_point_temp-2m', None, 'dew_point_2m', lambda v: v - 273.15),
    ('mean_sea_level_pressure', None, 'pressure_msl', lambda v: v / 100.0),
    ('cape', None, 'cape', lambda v: v),
    ('total_precipitable_water', None, 'total_precipitable_water', lambda v: v),
]

OM_VARS = [
    'surface_temperature', 'sea_surface_temperature', 'cloud_cover',
    'soil_moisture_0_to_7cm', 'soil_moisture_7_to_28cm',
    'soil_moisture_28_to_100cm', 'soil_moisture_100_to_255cm',
    'soil_temperature_0_to_7cm', 'et0_fao_evapotranspiration',
    'vapour_pressure_deficit', 'snow_depth', 'shortwave_radiation',
    'vertical_velocity_500hPa', 'geopotential_height_500hPa',
    'wind_gusts_10m', 'precipitation',
]

LAT1 = np.arange(-90, 91, 1, dtype=np.float64)     # 181
LON1 = np.arange(-180, 180, 1, dtype=np.float64)   # 360
NLAT1, NLON1 = len(LAT1), len(LON1)
NPOINTS1 = NLAT1 * NLON1

LAT2 = np.arange(-90, 91, 2, dtype=np.float64)     # 91
LON2 = np.arange(-180, 180, 2, dtype=np.float64)   # 180
NLAT2, NLON2 = len(LAT2), len(LON2)
NPOINTS2 = NLAT2 * NLON2

OM_LAT = np.arange(-82.5, 82.6, 7.5)              # 23
OM_LON = np.arange(-180, 180, 7.5)                # 48


def to_1deg(field: np.ndarray) -> np.ndarray:
    """1-degree GFS grid (lat 90..-90, lon 0..359) -> south-up (-180..179)."""
    if field.ndim == 3:
        field = field[0]
    rows = np.arange(180, -1, -1)
    cols = np.concatenate([np.arange(180, 360), np.arange(0, 180)])
    return field[np.ix_(rows, cols)].copy()


def blur(a: np.ndarray) -> np.ndarray:
    """Light binomial 3x3 smooth to suppress regrid-scale noise."""
    p = np.pad(a, ((0, 0), (1, 1), (1, 1)), mode='edge')
    return (p[:, :-2, :-2] + 2 * p[:, :-2, 1:-1] + p[:, :-2, 2:]
            + 2 * p[:, 1:-1, :-2] + 4 * p[:, 1:-1, 1:-1] + 2 * p[:, 1:-1, 2:]
            + p[:, 2:, :-2] + 2 * p[:, 2:, 1:-1] + p[:, 2:, 2:]) / 16.0


def log(*a):
    print(*a, flush=True)


def code(level: str | None) -> str:
    if level is None:
        return ''
    if level == 'surface':
        return '-surface-level'
    return f'-isobaric-{level}'


def ns_url(end: datetime, product: str, level: str | None) -> str:
    d = end.strftime('%Y/%m/%d')
    hhmm = end.strftime('%H%M')
    return f'{NS_BASE}/{d}/{hhmm}-{product}{code(level)}-gfs-1.0.epak'


def ns_cache(end: datetime, product: str, level: str | None) -> Path:
    p = CACHE / 'ns' / end.strftime('%Y%m%d%H')
    p.mkdir(parents=True, exist_ok=True)
    return p / f'{product}{code(level)}.epak'


def fetch(url: str, dest: Path | None = None, tries: int = 4) -> bytes:
    if dest and dest.exists() and dest.stat().st_size > 1000:
        return dest.read_bytes()
    last = None
    for t in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if dest:
                dest.write_bytes(data)
            return data
        except urllib.error.HTTPError as e:
            last = e
            if e.code == 404:
                break
            time.sleep(min(30, 2 ** t * 3))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(min(30, 2 ** t * 3))
    raise RuntimeError(f'fetch failed {url}: {last}')


def find_latest() -> datetime:
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    for k in range(0, 5):
        t = now - timedelta(hours=k)
        url = ns_url(t, 'wind', 'surface')
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA}, method='HEAD')
            with urllib.request.urlopen(req, timeout=20) as r:
                if r.status == 200:
                    log(f'latest GFS frame available: {t:%Y-%m-%dT%H:%MZ}')
                    return t
        except Exception:
            continue
    raise SystemExit('no recent nullschool GFS data found')


def download_ns(frames: list[datetime]):
    jobs = []
    for f in frames:
        for prod, level, _, _ in WIND_SPECS:
            jobs.append((f, prod, level))
        for prod, level, _, _ in SCALAR_SPECS:
            jobs.append((f, prod, level))
    def one(job):
        f, prod, level = job
        dest = ns_cache(f, prod, level)
        fetch(ns_url(f, prod, level), dest)
        return job
    log(f'downloading {len(jobs)} GFS slices ({NFRAMES} h × {len(WIND_SPECS)+len(SCALAR_SPECS)} products)')
    done = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = [ex.submit(one, j) for j in jobs]
        for fut in as_completed(futs):
            fut.result()
            done += 1
            if done % 40 == 0:
                log(f'  {done}/{len(jobs)} slices')


def ns_load(frames: list[datetime], fields: dict):
    # wind
    for prod, level, sname, dname in WIND_SPECS:
        arr_s = np.empty((NFRAMES, NLAT1, NLON1), dtype=np.float32)
        arr_d = np.empty((NFRAMES, NLAT1, NLON1), dtype=np.float32)
        for fi, f in enumerate(frames):
            _, blocks = decode(ns_cache(f, prod, level))
            u = blocks[0][0] if blocks[0].ndim == 3 else blocks[0]
            v = blocks[1][0] if blocks[1].ndim == 3 else blocks[1]
            u2 = blur(to_1deg(u)[None])[0]
            v2 = blur(to_1deg(v)[None])[0]
            spd = np.hypot(u2, v2) * 3.6
            dr = (np.degrees(np.arctan2(-u2, -v2)) + 360.0) % 360.0
            arr_s[fi] = spd
            arr_d[fi] = dr
        fields[sname] = arr_s
        fields[dname] = arr_d
        log(f'  wind {level}: {float(np.nanmin(arr_s)):.1f} … {float(np.nanmax(arr_s)):.1f} km/h')
    # scalars
    for prod, level, name, conv in SCALAR_SPECS:
        arr = np.empty((NFRAMES, NLAT1, NLON1), dtype=np.float32)
        for fi, f in enumerate(frames):
            _, blocks = decode(ns_cache(f, prod, level))
            g = blocks[0][0] if blocks[0].ndim == 3 else blocks[0]
            arr[fi] = to_1deg(conv(g))
        if name in ('pressure_msl', 'temperature_2m', 'temperature_850hPa', 'temperature_500hPa',
                    'relative_humidity_2m', 'relative_humidity_850hPa', 'dew_point_2m'):
            arr = blur(arr)
        fields[name] = arr
        log(f'  {name:32s} {float(np.nanmin(arr)):9.2f} … {float(np.nanmax(arr)):9.2f}')


def om_fetch(frames: list[datetime]) -> dict:
    pts = [(lo, la) for la in OM_LAT for lo in OM_LON]
    hour_key = frames[-1].strftime('%Y%m%d%H')
    cdir = CACHE / 'om' / hour_key
    cdir.mkdir(parents=True, exist_ok=True)
    batches = [pts[i:i + 100] for i in range(0, len(pts), 100)]
    results = []
    for bi, batch in enumerate(batches):
        cp = cdir / f'batch_{bi:03d}.json.gz'
        if cp.exists():
            with gzip.open(cp, 'rt') as fh:
                data = json.load(fh)
        else:
            params = {
                'latitude': ','.join(f'{p[1]:.4f}' for p in batch),
                'longitude': ','.join(f'{p[0]:.4f}' for p in batch),
                'hourly': ','.join(OM_VARS),
                'past_days': '1',
                'forecast_days': '1',
                'timezone': 'GMT',
            }
            url = OM_BASE + '?' + urllib.parse.urlencode(params)
            log(f'  hydrology batch {bi+1}/{len(batches)} ({len(batch)} pts)')
            data = None
            for attempt in range(5):
                try:
                    req = urllib.request.Request(url, headers={'User-Agent': UA})
                    with urllib.request.urlopen(req, timeout=120) as r:
                        data = json.loads(r.read())
                    break
                except urllib.error.HTTPError as e:
                    msg = e.read().decode('utf-8', 'replace')[:180]
                    log(f'    HTTP {e.code}: {msg}')
                    time.sleep(40 if e.code == 429 else 2 ** attempt * 4)
                except Exception as e:  # noqa: BLE001
                    log(f'    {type(e).__name__}: {e}')
                    time.sleep(2 ** attempt * 4)
            if data is None:
                raise SystemExit(f'hydrology batch {bi} failed')
            with gzip.open(cp, 'wt') as fh:
                json.dump(data, fh)
            time.sleep(9.0)
        if isinstance(data, dict):
            data = [data]
        results.extend(data)
    if len(results) != len(pts):
        raise SystemExit(f'hydrology got {len(results)} / {len(pts)} points')

    want = [f.strftime('%Y-%m-%dT%H:00') for f in frames]
    out = {v: np.full((NFRAMES, len(OM_LAT), len(OM_LON)), np.nan, dtype=np.float32) for v in OM_VARS}
    for i, row in enumerate(results):
        y = i // len(OM_LON)
        x = i % len(OM_LON)
        h = row.get('hourly', {})
        idx = {t: j for j, t in enumerate(h.get('time', []))}
        for v in OM_VARS:
            arr = h.get(v, [])
            if not arr:
                continue
            for fi, ts in enumerate(want):
                j = idx.get(ts)
                if j is not None and arr[j] is not None:
                    out[v][fi, y, x] = arr[j]
    return out


def upsample_om(arr: np.ndarray) -> np.ndarray:
    """(..., 23, 48) at 7.5° -> (..., 91, 180) at 2°."""
    lat = LAT2.astype(np.float32)
    lon = LON2.astype(np.float32)
    gy = np.clip((lat - OM_LAT[0]) / 7.5, 0, len(OM_LAT) - 1.0001)
    gx = ((lon - OM_LON[0]) / 7.5) % len(OM_LON)
    y0 = np.floor(gy).astype(int); y1 = np.minimum(y0 + 1, len(OM_LAT) - 1); fy = (gy - y0).astype(np.float32)[None, :, None]
    x0 = np.floor(gx).astype(int); x1 = (x0 + 1) % len(OM_LON); fx = (gx - x0).astype(np.float32)[None, None, :]
    a = arr[..., y0, :][..., x0]
    b = arr[..., y0, :][..., x1]
    c = arr[..., y1, :][..., x0]
    d = arr[..., y1, :][..., x1]
    top = a * (1 - fx) + b * fx
    bot = c * (1 - fx) + d * fx
    return (top * (1 - fy) + bot * fy).astype(np.float32)


def build():
    t0 = time.time()
    end = find_latest()
    frames = [end - timedelta(hours=(NFRAMES - 1 - i)) for i in range(NFRAMES)]
    log(f'window {frames[0]:%Y-%m-%dT%H:%MZ} → {frames[-1]:%Y-%m-%dT%H:%MZ}')

    download_ns(frames)
    fields: dict[str, np.ndarray] = {}
    log('decoding atmosphere')
    ns_load(frames, fields)

    log('fetching hydrology (Open-Meteo historical forecast)')
    om = om_fetch(frames)
    for v in OM_VARS:
        arr = upsample_om(om[v])
        fields[v] = arr
        finite = arr[np.isfinite(arr)]
        log(f'  {v:32s} {float(finite.min()) if finite.size else float("nan"):9.3f} … {float(finite.max()) if finite.size else float("nan"):9.3f}')

    order = list(fields.keys())
    atmos_fields = {x for spec in WIND_SPECS for x in (spec[2], spec[3])} | {n for _, _, n, _ in SCALAR_SPECS}
    def grid_for(field: str):
        if field in atmos_fields:
            return {'nx': NLON1, 'ny': NLAT1, 'n': NPOINTS1, 'lonMin': -180, 'latMin': -90, 'step': 1}
        return {'nx': NLON2, 'ny': NLAT2, 'n': NPOINTS2, 'lonMin': -180, 'latMin': -90, 'step': 2}
    log(f'packing {len(order)} fields · {NFRAMES} frames · atmosphere {NPOINTS1} pts · land {NPOINTS2} pts')
    bin_path = OUT / 'snapshot.bin'
    meta = {}
    total = 0
    with bin_path.open('wb') as fh:
        for field in order:
            arr = fields[field].astype(np.float32)
            finite = arr[np.isfinite(arr)]
            if finite.size == 0:
                lo, hi = 0.0, 1.0
            else:
                lo = float(np.nanmin(finite))
                hi = float(np.nanmax(finite))
                if hi - lo < 1e-9:
                    hi = lo + 1.0
            span = (hi - lo) * 1.01
            off = lo
            scale = span / 65000.0
            q = np.round(np.nan_to_num((arr - off) / scale, nan=0.0, posinf=0.0, neginf=0.0))
            q = np.clip(q, 0, 65000).astype(np.uint16)
            q[~np.isfinite(arr)] = 65535
            fh.write(q.astype('<u2').tobytes())
            total += q.size * 2
            meta[field] = {
                'offset': round(off, 6), 'scale': scale,
                'min': round(lo, 4), 'max': round(hi, 4),
                'grid': grid_for(field),
            }
            log(f'  {field:32s} {lo:10.3f} … {hi:10.3f}')
    log(f'wrote {bin_path} ({total/1e6:.1f} MB)')

    manifest = {
        'version': 1,
        'build_id': datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S'),
        'generated_at': end.isoformat().replace('+00:00', 'Z'),
        'source': 'NOAA GFS via earth.nullschool.net; Open-Meteo',
        'source_url': 'https://earth.nullschool.net/ · https://open-meteo.com/',
        'license': 'GFS: public domain (NOAA). Regrid: earth.nullschool.net. Open-Meteo: CC BY 4.0.',
        'grid': {'lonMin': -180, 'lonMax': 180, 'latMin': -90, 'latMax': 90, 'step': 1},
        'lonCount': NLON1, 'latCount': NLAT1, 'pointCount': NPOINTS1,
        'frameCount': NFRAMES,
        'fields': meta, 'fieldOrder': order,
        'times': [f.isoformat().replace('+00:00', 'Z') for f in frames],
        'binary': 'snapshot.bin', 'bytes': total,
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=1))
    log(f'manifest ok · {time.time()-t0:.0f}s total')
    log('done ✔')


if __name__ == '__main__':
    build()
