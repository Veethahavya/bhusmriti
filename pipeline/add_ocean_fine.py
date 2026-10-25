#!/usr/bin/env python3
"""Refetch ocean currents on a full 2° grid and merge into the 24h/7d/30d snapshots.

The original marine fetch used the 7.5° hydrology sample points. That leaves
obvious holes near coasts once the field is upsampled to the 2° atlas grid.
This fetches the same variables on a true 2° grid and replaces the current
fields in the existing binaries (all other fields copied byte-for-byte).
"""
from __future__ import annotations
import gzip, json, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from build_ranges import CACHE, OUT, UA, upsample_om

VARS = ['ocean_current_velocity', 'ocean_current_direction']
BASE = 'https://marine-api.open-meteo.com/v1/marine'
LAT = np.arange(-90, 91, 2, dtype=np.float32)
LON = np.arange(-180, 181, 2, dtype=np.float32)


def fetch(end):
    cdir = CACHE / 'marine2' / f'{end:%Y%m%d%H}-31d'
    cdir.mkdir(parents=True, exist_ok=True)
    pts = [(float(lo), float(la)) for la in LAT for lo in LON if la > -80]
    batches = [pts[i:i + 100] for i in range(0, len(pts), 100)]
    rows = []
    for bi, batch in enumerate(batches):
        cp = cdir / f'batch_{bi:03d}.json.gz'
        if cp.exists():
            with gzip.open(cp, 'rt') as f:
                data = json.load(f)
        else:
            params = {
                'latitude': ','.join(f'{p[1]:.2f}' for p in batch),
                'longitude': ','.join(f'{p[0]:.2f}' for p in batch),
                'hourly': ','.join(VARS), 'past_days': '31', 'forecast_days': '1', 'timezone': 'GMT',
            }
            url = BASE + '?' + urllib.parse.urlencode(params)
            if bi % 10 == 0:
                print(f'2° marine {bi+1}/{len(batches)}', flush=True)
            data = None
            for attempt in range(6):
                try:
                    req = urllib.request.Request(url, headers={'User-Agent': UA})
                    with urllib.request.urlopen(req, timeout=240) as r:
                        data = json.loads(r.read())
                    break
                except urllib.error.HTTPError as e:
                    print(f'  HTTP {e.code} batch {bi}', flush=True)
                    time.sleep(45 if e.code == 429 else 2 + attempt * 5)
                except Exception as e:  # noqa: BLE001
                    print(' ', e, flush=True)
                    time.sleep(2 + attempt * 5)
            if data is None:
                raise SystemExit(f'batch {bi} failed')
            with gzip.open(cp, 'wt') as f:
                json.dump(data, f)
            time.sleep(1.5)
        if isinstance(data, dict):
            data = [data]
        if len(data) != len(batch):
            # API drops no-data locations; keep a lookup by returned coordinates
            data = [r for r in data if 'hourly' in r]
        rows.extend(data)
    times = rows[0]['hourly']['time']
    n = len(times)
    out = {v: np.full((n, len(LAT), len(LON)), np.nan, dtype=np.float32) for v in VARS}
    for row in rows:
        lo = row.get('longitude', 0.0); la = row.get('latitude', 0.0)
        y = int(np.argmin(np.abs(LAT - la))); x = int(np.argmin(np.abs(LON - lo)))
        h = row.get('hourly', {})
        idx = {t: j for j, t in enumerate(h.get('time', []))}
        for v in VARS:
            arr = h.get(v, [])
            for t, j in idx.items():
                if 0 <= j < n and j < len(arr) and arr[j] is not None:
                    out[v][j, y, x] = arr[j]
    filled = 0
    for v in VARS:
        # Fill land/coastal NaNs from neighbouring valid marine cells so the
        # trail field does not develop visible holes along coastlines.
        for j in range(n):
            g = out[v][j]
            for _ in range(5):
                nan = ~np.isfinite(g)
                if not nan.any():
                    break
                pad = np.pad(g, 1, mode='constant', constant_values=np.nan)
                neigh = np.stack([
                    pad[0:-2, 0:-2], pad[0:-2, 1:-1], pad[0:-2, 2:],
                    pad[1:-1, 0:-2], pad[1:-1, 2:],
                    pad[2:, 0:-2], pad[2:, 1:-1], pad[2:, 2:],
                ], axis=0)
                cnt = np.sum(np.isfinite(neigh), axis=0)
                mean = np.nanmean(np.where(np.isfinite(neigh), neigh, np.nan), axis=0)
                take = nan & (cnt > 0)
                g[take] = mean[take]
                filled += int(take.sum())
    print('filled', filled, 'cells', flush=True)
    return times, out


def add_range(manifest_path: Path, marine_times, marine):
    m = json.loads(manifest_path.read_text())
    times = m['times']
    key = lambda s: s.replace('Z', '').replace(':00:00', ':00')[:16]
    midx = {key(t): j for j, t in enumerate(marine_times)}
    missing = [t for t in times if key(t) not in midx]
    if missing:
        raise SystemExit(f'{manifest_path}: missing {len(missing)}')
    sst_grid = m['fields'].get('sea_surface_temperature', {}).get('grid')
    if not sst_grid:
        raise SystemExit(f'{manifest_path}: no SST grid')
    step = sst_grid['step']
    fields = {}
    for v in VARS:
        arr = marine[v][[midx[key(t)] for t in times]]
        fields[v] = upsample_om(arr, step).astype(np.float32)

    binname = f"snapshot-{datetime.now().strftime('%Y%m%d%H%M%S')}.bin"
    src = manifest_path.parent / m['binary']
    raw = src.read_bytes()
    meta = {}
    total = len(raw)
    with (manifest_path.parent / binname).open('wb') as fh:
        fh.write(raw)
        for v in VARS:
            arr = fields[v]
            finite = arr[np.isfinite(arr)]
            lo, hi = (float(np.nanmin(finite)), float(np.nanmax(finite))) if finite.size else (0.0, 1.0)
            if hi - lo < 1e-9:
                hi = lo + 1.0
            span = (hi - lo) * 1.01
            scale = span / 65000.0
            q = np.round(np.nan_to_num((arr - lo) / scale, nan=0.0, posinf=0.0, neginf=0.0))
            q = np.clip(q, 0, 65000).astype(np.uint16)
            q[~np.isfinite(arr)] = 65535
            fh.write(q.astype('<u2').tobytes())
            total += q.size * 2
            meta[v] = {'offset': round(lo, 6), 'scale': scale, 'min': round(lo, 4), 'max': round(hi, 4), 'grid': dict(sst_grid)}
            print(f'  {v:32s} {lo:8.2f} … {hi:8.2f}', flush=True)
    m['fields'].update(meta)
    for v in VARS:
        if v not in m['fieldOrder']:
            m['fieldOrder'].append(v)
    m['binary'] = binname
    m['bytes'] = total
    m['build_id'] = datetime.now().strftime('%Y%m%d%H%M%S')
    tmp = manifest_path.with_suffix('.json.tmp'); tmp.write_text(json.dumps(m, indent=1)); tmp.replace(manifest_path)
    src.unlink(missing_ok=True)
    print(f'{manifest_path}: +{total-len(raw)} bytes, {binname}', flush=True)
    return {'bytes': total, 'buildId': m['build_id']}


def main():
    manifests = [OUT / 'manifest.json', OUT / 'week/manifest.json', OUT / 'month/manifest.json']
    m0 = json.loads(manifests[0].read_text())
    end = datetime.fromisoformat(m0['generated_at'].replace('Z', '+00:00'))
    print('fetching 2° marine', end, flush=True)
    mt, mar = fetch(end)
    idx = json.loads((OUT / 'ranges.json').read_text())
    for mp in manifests:
        rid = mp.parent.name if mp.parent.name in ('week', 'month') else '24h'
        print('adding', rid, flush=True)
        upd = add_range(mp, mt, mar)
        if rid in idx.get('ranges', {}):
            idx['ranges'][rid].update(upd)
    (OUT / 'ranges.json').write_text(json.dumps(idx, indent=1))
    print('done', flush=True)


if __name__ == '__main__':
    main()
