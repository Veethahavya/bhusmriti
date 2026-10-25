#!/usr/bin/env python3
"""Atmosphere-only long archive (latest five months), 3° daily.

Land/hydrology is intentionally omitted here: the Open-Meteo free daily
quota was exhausted while building the 5-month land record. The app disables
the land layers for this range and says so in the UI. The normal 24 h / 7 d /
30 d ranges retain the full 33-field records.
"""
from __future__ import annotations
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from build_ranges import (  # noqa: E402
    CACHE, OUT, RANGES, SCALAR_SPECS, WIND_SPECS, download_ns, find_latest,
    grid_dims, ns_load,
)

STEP = 3
END = find_latest()
D0 = (END - timedelta(days=146)).date()
FRAMES = [datetime(D0.year, D0.month, D0.day, 0, 0, 0, tzinfo=timezone.utc) + timedelta(days=i)
          for i in range((END.date() - D0).days + 1)]
if FRAMES[-1] < END:
    FRAMES.append(END)


def main():
    out = OUT / 'long'
    out.mkdir(parents=True, exist_ok=True)
    print(f'long atmosphere: {len(FRAMES)} frames {FRAMES[0]:%Y-%m-%dT%H:%MZ} → {FRAMES[-1]:%Y-%m-%dT%H:%MZ}', flush=True)
    download_ns(FRAMES)
    fields = ns_load(FRAMES, STEP)

    order = []
    for _, _, sname, dname in WIND_SPECS:
        order += [sname, dname]
    order += [s[2] for s in SCALAR_SPECS]

    build_id = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')
    bin_name = f'snapshot-{build_id}.bin'
    bin_path = out / bin_name
    meta = {}
    total = 0
    with bin_path.open('wb') as fh:
        for field in order:
            arr = fields[field].astype(np.float32)
            finite = arr[np.isfinite(arr)]
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
            lat, lon = grid_dims(STEP)
            meta[field] = {
                'offset': round(off, 6), 'scale': scale, 'min': round(lo, 4), 'max': round(hi, 4),
                'grid': {'nx': len(lon), 'ny': len(lat), 'n': len(lon) * len(lat),
                         'lonMin': -180, 'latMin': -90, 'step': STEP},
            }
            print(f'  {field:34s} {lo:9.2f} … {hi:9.2f}', flush=True)

    lat, lon = grid_dims(STEP)
    manifest = {
        'version': 1, 'build_id': build_id,
        'generated_at': END.isoformat().replace('+00:00', 'Z'),
        'source': 'NOAA GFS via earth.nullschool.net (atmosphere archive)',
        'source_url': 'https://earth.nullschool.net/',
        'license': 'GFS: public domain (NOAA). Regrid: earth.nullschool.net.',
        'grid': {'lonMin': -180, 'lonMax': 180, 'latMin': -90, 'latMax': 90, 'step': STEP},
        'lonCount': len(lon), 'latCount': len(lat), 'pointCount': len(lon) * len(lat),
        'frameCount': len(FRAMES), 'fields': meta, 'fieldOrder': order,
        'times': [f.isoformat().replace('+00:00', 'Z') for f in FRAMES],
        'binary': bin_name, 'bytes': total, 'range': 'long', 'stepHours': 24,
        'atmosphereOnly': True,
    }
    tmp = out / 'manifest.json.tmp'
    tmp.write_text(json.dumps(manifest, indent=1))
    tmp.replace(out / 'manifest.json')
    for old in out.glob('snapshot*.bin'):
        if old.name != bin_name:
            old.unlink()
    print(f'wrote {bin_path} ({total/1e6:.1f} MB)', flush=True)

    rp = OUT / 'ranges.json'
    idx = json.loads(rp.read_text()) if rp.exists() else {'ranges': {}}
    idx.setdefault('ranges', {})['long'] = {
        'id': 'long', 'path': '/data/long', 'label': 'Long archive',
        'gridLabel': '3° · daily · atmosphere', 'start': FRAMES[0].isoformat().replace('+00:00', 'Z'),
        'end': FRAMES[-1].isoformat().replace('+00:00', 'Z'), 'stepHours': 24,
        'frames': len(FRAMES), 'buildId': build_id, 'bytes': total,
    }
    tmp = OUT / 'ranges.json.tmp'
    tmp.write_text(json.dumps(idx, indent=1))
    tmp.replace(rp)
    print('ranges.json updated', flush=True)


if __name__ == '__main__':
    main()
