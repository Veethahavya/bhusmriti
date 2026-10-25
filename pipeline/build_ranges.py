#!/usr/bin/env python3
"""Build the AEROS time-range snapshots.

24h  : 1° atmosphere + 2° land, hourly
week : 2° all fields, 3-hourly
month: 3° all fields, 12-hourly

The 31-day hydrology response is fetched once and sliced for every range.
Everything is cached; a refresh only downloads genuinely new slices.
"""
from __future__ import annotations

import gzip
import json
import math
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
from epak import decode  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data'
CACHE = ROOT / '.cache'
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(exist_ok=True)

NS_BASE = 'https://gaia.nullschool.net/data/gfs'
OM_BASE = 'https://historical-forecast-api.open-meteo.com/v1/forecast'
UA = 'AEROS/1.0 (personal atmosphere atlas)'

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
ATMOS_FIELDS = {x for spec in WIND_SPECS for x in (spec[2], spec[3])} | {n for _, _, n, _ in SCALAR_SPECS}

OM_VARS = [
    'surface_temperature', 'sea_surface_temperature', 'cloud_cover',
    'soil_moisture_0_to_7cm', 'soil_moisture_7_to_28cm',
    'soil_moisture_28_to_100cm', 'soil_moisture_100_to_255cm',
    'soil_temperature_0_to_7cm', 'et0_fao_evapotranspiration',
    'vapour_pressure_deficit', 'snow_depth', 'shortwave_radiation',
    'vertical_velocity_500hPa', 'geopotential_height_500hPa',
    'wind_gusts_10m', 'precipitation',
]

OM_LAT = np.arange(-82.5, 82.6, 7.5)
OM_LON = np.arange(-180, 180, 7.5)

RANGES = [
    dict(id='24h', days=1, step=1, atm_step=1, hydro_step=2, out=OUT,
         label='Last 24 hours', grid_label='1° atmosphere · 2° land'),
    dict(id='week', days=7, step=3, atm_step=2, hydro_step=2, out=OUT / 'week',
         label='Last 7 days', grid_label='2° · 3-hourly'),
    dict(id='month', days=30, step=12, atm_step=3, hydro_step=3, out=OUT / 'month',
         label='Last 30 days', grid_label='3° · 12-hourly'),
]


def log(*a):
    print(*a, flush=True)


def level_code(level):
    if level is None:
        return ''
    if level == 'surface':
        return '-surface-level'
    return f'-isobaric-{level}'


def ns_url(end, product, level):
    return f"{NS_BASE}/{end:%Y/%m/%d}/{end:%H%M}-{product}{level_code(level)}-gfs-1.0.epak"


def ns_cache(end, product, level):
    p = CACHE / 'ns' / end.strftime('%Y%m%d%H')
    p.mkdir(parents=True, exist_ok=True)
    return p / f'{product}{level_code(level)}.epak'


def fetch(url, dest=None, tries=4):
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


def find_latest():
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    for k in range(0, 5):
        t = now - timedelta(hours=k)
        try:
            req = urllib.request.Request(ns_url(t, 'wind', 'surface'), headers={'User-Agent': UA}, method='HEAD')
            with urllib.request.urlopen(req, timeout=20) as r:
                if r.status == 200:
                    log(f'latest GFS frame: {t:%Y-%m-%dT%H:%MZ}')
                    return t
        except Exception:
            continue
    raise SystemExit('no recent GFS data')


def download_ns(frames):
    jobs = []
    for f in frames:
        for prod, level, _, _ in WIND_SPECS:
            jobs.append((f, prod, level))
        for prod, level, _, _ in SCALAR_SPECS:
            jobs.append((f, prod, level))
    def one(job):
        f, prod, level = job
        fetch(ns_url(f, prod, level), ns_cache(f, prod, level))
    log(f'download {len(jobs)} GFS slices')
    done = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = [ex.submit(one, j) for j in jobs]
        for fut in as_completed(futs):
            fut.result()
            done += 1
            if done % 100 == 0:
                log(f'  {done}/{len(jobs)}')


def blur(a):
    p = np.pad(a, ((0, 0), (1, 1), (1, 1)), mode='edge')
    return (p[:, :-2, :-2] + 2 * p[:, :-2, 1:-1] + p[:, :-2, 2:]
            + 2 * p[:, 1:-1, :-2] + 4 * p[:, 1:-1, 1:-1] + 2 * p[:, 1:-1, 2:]
            + p[:, 2:, :-2] + 2 * p[:, 2:, 1:-1] + p[:, 2:, 2:]) / 16.0


def to_grid(field, step):
    if field.ndim == 3:
        field = field[0]
    rows = np.arange(180, -1, -step)
    cols = np.concatenate([np.arange(180, 360, step), np.arange(0, 180, step)])
    return field[np.ix_(rows, cols)].copy()


def grid_dims(step):
    lat = np.arange(-90, 91, step)
    lon = np.arange(-180, 180, step)
    return lat, lon


def ns_load(frames, step):
    lat, lon = grid_dims(step)
    ny, nx = len(lat), len(lon)
    fields = {}
    for prod, level, sname, dname in WIND_SPECS:
        arr_s = np.empty((len(frames), ny, nx), dtype=np.float32)
        arr_d = np.empty((len(frames), ny, nx), dtype=np.float32)
        for fi, f in enumerate(frames):
            _, blocks = decode(ns_cache(f, prod, level))
            u = blocks[0][0] if blocks[0].ndim == 3 else blocks[0]
            v = blocks[1][0] if blocks[1].ndim == 3 else blocks[1]
            u2 = blur(to_grid(u, step)[None])[0]
            v2 = blur(to_grid(v, step)[None])[0]
            arr_s[fi] = np.hypot(u2, v2) * 3.6
            arr_d[fi] = (np.degrees(np.arctan2(-u2, -v2)) + 360.0) % 360.0
        fields[sname] = arr_s
        fields[dname] = arr_d
        log(f'  wind {level}: {float(np.nanmin(arr_s)):.0f} … {float(np.nanmax(arr_s)):.0f} km/h')
    for prod, level, name, conv in SCALAR_SPECS:
        arr = np.empty((len(frames), ny, nx), dtype=np.float32)
        for fi, f in enumerate(frames):
            _, blocks = decode(ns_cache(f, prod, level))
            g = blocks[0][0] if blocks[0].ndim == 3 else blocks[0]
            arr[fi] = to_grid(conv(g), step)
        if name in ('pressure_msl', 'temperature_2m', 'temperature_850hPa', 'temperature_500hPa',
                    'relative_humidity_2m', 'relative_humidity_850hPa', 'dew_point_2m'):
            arr = blur(arr)
        fields[name] = arr
    return fields


def hydro_all(end):
    """Fetch 32 days of 7.5° hydrology once; return dict(var -> [time,23,48])."""
    cdir = CACHE / 'om' / f'{end:%Y%m%d%H}-31d'
    cdir.mkdir(parents=True, exist_ok=True)
    pts = [(lo, la) for la in OM_LAT for lo in OM_LON]
    batches = [pts[i:i + 100] for i in range(0, len(pts), 100)]
    rows = []
    for bi, batch in enumerate(batches):
        cp = cdir / f'batch_{bi:03d}.json.gz'
        if cp.exists():
            with gzip.open(cp, 'rt') as f:
                data = json.load(f)
        else:
            params = {
                'latitude': ','.join(f'{p[1]:.4f}' for p in batch),
                'longitude': ','.join(f'{p[0]:.4f}' for p in batch),
                'hourly': ','.join(OM_VARS),
                'past_days': '31',
                'forecast_days': '1',
                'timezone': 'GMT',
            }
            url = OM_BASE + '?' + urllib.parse.urlencode(params)
            log(f'  hydrology batch {bi+1}/{len(batches)} ({len(batch)} pts, 32 days)')
            data = None
            for attempt in range(6):
                try:
                    req = urllib.request.Request(url, headers={'User-Agent': UA})
                    with urllib.request.urlopen(req, timeout=180) as r:
                        data = json.loads(r.read())
                    break
                except urllib.error.HTTPError as e:
                    msg = e.read().decode('utf-8', 'replace')[:160]
                    log(f'    HTTP {e.code}: {msg}')
                    time.sleep(45 if e.code == 429 else 2 ** attempt * 4)
                except Exception as e:  # noqa: BLE001
                    log(f'    {type(e).__name__}: {e}')
                    time.sleep(2 ** attempt * 4)
            if data is None:
                raise SystemExit(f'hydrology batch {bi} failed')
            with gzip.open(cp, 'wt') as f:
                json.dump(data, f)
            time.sleep(8.0)
        if isinstance(data, dict):
            data = [data]
        rows.extend(data)
    if len(rows) != len(pts):
        raise SystemExit(f'hydrology {len(rows)}/{len(pts)}')
    times = rows[0]['hourly']['time']
    n = len(times)
    out = {v: np.full((n, len(OM_LAT), len(OM_LON)), np.nan, dtype=np.float32) for v in OM_VARS}
    for i, row in enumerate(rows):
        y = i // len(OM_LON)
        x = i % len(OM_LON)
        h = row.get('hourly', {})
        idx = {t: j for j, t in enumerate(h.get('time', []))}
        for v in OM_VARS:
            arr = h.get(v, [])
            if not arr:
                continue
            for t, j in idx.items():
                val = arr[j]
                if val is not None and 0 <= j < n:
                    # map by time index directly (all rows share the same time axis)
                    out[v][j, y, x] = val
    return times, out


def upsample_om(arr, step):
    lat, lon = grid_dims(step)
    lat = lat.astype(np.float32); lon = lon.astype(np.float32)
    gy = np.clip((lat - OM_LAT[0]) / 7.5, 0, len(OM_LAT) - 1.0001)
    gx = ((lon - OM_LON[0]) / 7.5) % len(OM_LON)
    y0 = np.floor(gy).astype(int); y1 = np.minimum(y0 + 1, len(OM_LAT) - 1); fy = (gy - y0).astype(np.float32)[None, :, None]
    x0 = np.floor(gx).astype(int); x1 = (x0 + 1) % len(OM_LON); fx = (gx - x0).astype(np.float32)[None, None, :]
    a = arr[..., y0, :][..., x0]; b = arr[..., y0, :][..., x1]
    c = arr[..., y1, :][..., x0]; d = arr[..., y1, :][..., x1]
    top = a * (1 - fx) + b * fx
    bot = c * (1 - fx) + d * fx
    return (top * (1 - fy) + bot * fy).astype(np.float32)


def frames_for(end, days, step):
    n = days * 24 // step
    return [end - timedelta(hours=days * 24 - i * step) for i in range(n + 1)]


def build_range(spec, end, hydro_times, hydro):
    rid = spec['id']
    if spec.get('daily_midnight'):
        d0 = (end - timedelta(days=spec['days'])).date()
        frames = [datetime(d0.year, d0.month, d0.day, 0, 0, 0, tzinfo=timezone.utc) + timedelta(days=i)
                  for i in range((end.date() - d0).days + 1)]
        if frames[-1] < end:
            frames.append(end)
    else:
        frames = frames_for(end, spec['days'], spec['step'])
    log(f"=== {rid}: {len(frames)} frames {frames[0]:%Y-%m-%dT%H:%MZ} → {frames[-1]:%Y-%m-%dT%H:%MZ}")
    download_ns(frames)
    fields = ns_load(frames, spec['atm_step'])

    iso = [f.strftime('%Y-%m-%dT%H:00') for f in frames]
    hidx = {t: j for j, t in enumerate(hydro_times)}
    missing = [t for t in iso if t not in hidx]
    if missing:
        raise SystemExit(f'hydrology missing {len(missing)} frames, e.g. {missing[:3]}')
    for v in OM_VARS:
        arr = hydro[v][[hidx[t] for t in iso]]
        fields[v] = upsample_om(arr, spec['hydro_step'])

    grid = {'lonMin': -180, 'lonMax': 180, 'latMin': -90, 'latMax': 90, 'step': spec['atm_step']}
    lat_a, lon_a = grid_dims(spec['atm_step'])
    lat_h, lon_h = grid_dims(spec['hydro_step'])
    n_a = len(lat_a) * len(lon_a)
    n_h = len(lat_h) * len(lon_h)
    out = spec['out']
    out.mkdir(parents=True, exist_ok=True)
    order = [x for x in (list(ATMOS_FIELDS))]  # set order is not stable; use specs order
    order = [s[2] for s in WIND_SPECS] + [s[2] for s in WIND_SPECS]  # placeholder
    # stable order: wind speed/dir pairs, scalars, hydro
    order = []
    for _, _, sname, dname in WIND_SPECS:
        order += [sname, dname]
    order += [s[2] for s in SCALAR_SPECS]
    order += list(OM_VARS)

    build_id = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')
    bin_name = f'snapshot-{build_id}.bin'
    bin_path = out / bin_name
    meta = {}
    total = 0
    with bin_path.open('wb') as fh:
        for field in order:
            arr = fields[field].astype(np.float32)
            finite = arr[np.isfinite(arr)]
            if finite.size == 0:
                lo, hi = 0.0, 1.0
            else:
                lo = float(np.nanmin(finite)); hi = float(np.nanmax(finite))
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
            is_atm = field in ATMOS_FIELDS
            g = (n_a, spec['atm_step']) if is_atm else (n_h, spec['hydro_step'])
            nx = len(lon_a) if is_atm else len(lon_h)
            ny = len(lat_a) if is_atm else len(lat_h)
            meta[field] = {
                'offset': round(off, 6), 'scale': scale, 'min': round(lo, 4), 'max': round(hi, 4),
                'grid': {'nx': nx, 'ny': ny, 'n': g[0], 'lonMin': -180, 'latMin': -90, 'step': g[1]},
            }
            log(f'  {field:34s} {lo:9.2f} … {hi:9.2f}')
    manifest = {
        'version': 1, 'build_id': build_id,
        'generated_at': end.isoformat().replace('+00:00', 'Z'),
        'source': 'NOAA GFS via earth.nullschool.net; Open-Meteo',
        'source_url': 'https://earth.nullschool.net/ · https://open-meteo.com/',
        'license': 'GFS: public domain (NOAA). Regrid: earth.nullschool.net. Open-Meteo: CC BY 4.0.',
        'grid': grid, 'lonCount': len(lon_a), 'latCount': len(lat_a), 'pointCount': n_a,
        'frameCount': len(frames), 'fields': meta, 'fieldOrder': order,
        'times': [f.isoformat().replace('+00:00', 'Z') for f in frames],
        'binary': bin_name, 'bytes': total,
        'range': rid, 'stepHours': spec['step'],
    }
    tmp = out / 'manifest.json.tmp'
    tmp.write_text(json.dumps(manifest, indent=1))
    tmp.replace(out / 'manifest.json')
    for old in out.glob('snapshot*.bin'):
        if old.name != bin_name:
            old.unlink()
    log(f'  wrote {bin_path} ({total/1e6:.1f} MB)')
    return {
        'id': rid, 'path': '/data' if rid == '24h' else f'/data/{rid}',
        'label': spec['label'], 'gridLabel': spec['grid_label'],
        'start': frames[0].isoformat().replace('+00:00', 'Z'),
        'end': frames[-1].isoformat().replace('+00:00', 'Z'),
        'stepHours': spec['step'], 'frames': len(frames), 'buildId': build_id,
        'bytes': total,
    }


def main():
    t0 = time.time()
    end = find_latest()
    log('fetching 32-day hydrology')
    hydro_times, hydro = hydro_all(end)
    ranges = {}
    for spec in RANGES:
        ranges[spec['id']] = build_range(spec, end, hydro_times, hydro)
    tmp = OUT / 'ranges.json.tmp'
    tmp.write_text(json.dumps({'generated_at': end.isoformat().replace('+00:00', 'Z'), 'ranges': ranges}, indent=1))
    tmp.replace(OUT / 'ranges.json')
    log(f'ranges.json ok; total {time.time()-t0:.0f}s')


if __name__ == '__main__':
    main()
