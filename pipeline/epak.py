"""Minimal EPak/PPak reader for earth.nullschool.net GFS products.

Format (reverse engineered from the public client):
  'head' <int32 BE headerLen> <json header>  then blocks:
  'ppak' <int32 BE len> <int32 cols><int32 rows><int32 grids><float32 log10Scale> <packed>
  'qpak' ...
  'tail'

Packed integers are zig-zag / variable length encoded, then the grid is a 2-D
prefix sum of the residuals, then divided by 10**scale.
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np


def _unpack(src: bytes, count: int) -> np.ndarray:
    out = np.empty(count, dtype=np.float32)
    i = 0
    n = 0
    L = len(src)
    while i < L and n < count:
        o = src[i]
        i += 1
        if o < 128:
            o = (o & 0x7F) - 0x80 if (o & 0x40) else o
            out[n] = o
        else:
            hi = o >> 4
            if 8 <= hi <= 11:
                o = ((o << 26) & 0xFFFFFFFF)
                if o & 0x80000000:
                    o -= 0x100000000
                o = (o >> 18) | src[i]
                i += 1
                out[n] = o
            elif 12 <= hi <= 13:
                o = ((o << 27) & 0xFFFFFFFF)
                if o & 0x80000000:
                    o -= 0x100000000
                o = (o >> 11) | (src[i] << 8) | src[i + 1]
                i += 2
                out[n] = o
            elif hi == 14:
                o = ((o << 28) & 0xFFFFFFFF)
                if o & 0x80000000:
                    o -= 0x100000000
                o = (o >> 4) | (src[i] << 16) | (src[i + 1] << 8) | src[i + 2]
                i += 3
                out[n] = o
            else:
                if o == 255:
                    cnt = 1 + src[i]
                    i += 1
                    end = min(count, n + cnt)
                    out[n:end] = np.nan
                    n = end
                    continue
                o = (src[i] << 24) | (src[i + 1] << 16) | (src[i + 2] << 8) | src[i + 3]
                i += 4
                if o >= 0x80000000:
                    o -= 0x100000000
                out[n] = o
        n += 1
    if n < count:
        out[n:] = np.nan
    return out


def _delta_loop(v: np.ndarray, cols: int, rows: int) -> np.ndarray:
    e = v.astype(np.float64).reshape(rows, cols)
    for i in range(rows):
        if i:
            for j in range(cols):
                left = e[i, j - 1] if j else 0.0
                up = e[i - 1, j]
                diag = e[i - 1, j - 1] if j else 0.0
                base = (left + up - diag)
                if np.isnan(base):
                    base = left if not np.isnan(left) else up
                e[i, j] += base
        else:
            for j in range(1, cols):
                left = e[i, j - 1]
                e[i, j] += left if not np.isnan(left) else 0.0
    return e.astype(np.float32)


def _ppak(payload: bytes) -> np.ndarray:
    cols, rows, grids, exp = struct.unpack_from('>iiif', payload, 0)
    count = cols * rows * grids
    packed = _unpack(payload[16:], count)
    if np.isnan(packed).any() or grids != 1:
        # rare fields (some accumulations) carry missing values; keep exact semantics
        out = np.empty((grids, rows, cols), dtype=np.float32)
        for g in range(grids):
            out[g] = _delta_loop(packed[g * rows * cols:(g + 1) * rows * cols], cols, rows)
        data = out
    else:
        arr = packed.reshape(rows, cols)
        data = (np.cumsum(np.cumsum(arr, axis=1), axis=0))[None, ...]
    return (data / (10.0 ** float(exp))).astype(np.float32)


def _qpak(payload: bytes) -> np.ndarray:
    etype = payload[0]
    count = struct.unpack_from('>i', payload, 1)[0]
    scale = struct.unpack_from('>d', payload, 5)[0]
    dt = np.float32 if etype == 8 else np.float64
    packed = _unpack(payload[13:], count)
    data = np.cumsum(packed.astype(dt))
    return (data / scale).astype(np.float32)


def decode(path: str | Path) -> tuple[dict, list[np.ndarray]]:
    b = Path(path).read_bytes()
    if b[:4] != b'head':
        raise ValueError(f'not an epak: {path}')
    hlen = struct.unpack_from('>i', b, 4)[0]
    header = json.loads(b[8:8 + hlen])
    off = 8 + hlen
    blocks: list[np.ndarray] = []
    while off < len(b):
        typ = b[off:off + 4]
        off += 4
        if typ == b'tail':
            break
        blen = struct.unpack_from('>i', b, off)[0]
        off += 4
        payload = b[off:off + blen]
        off += blen
        if typ == b'ppak':
            blocks.append(_ppak(payload))
        elif typ == b'qpak':
            blocks.append(_qpak(payload))
        else:
            raise ValueError(f'unknown block {typ!r}')
    return header, blocks


def variable_for(header: dict, block: int = 0) -> dict:
    for k, v in header.get('variables', {}).items():
        if isinstance(v, dict) and isinstance(v.get('data'), dict) and v.get('data', {}).get('method') in ('ppak', 'qpak') and v.get('data', {}).get('block') == block:
            return v
    return {}


def to_2deg(field: np.ndarray) -> np.ndarray:
    """Nearest sample a 1-degree GFS grid (lat 90..-90, lon 0..359) to 2 deg.

    Output rows run south (-90) to north (+90), cols -180..178.
    """
    rows = np.arange(180, -1, -2)          # lat 90 -> -90 step 2, reversed below
    cols = np.concatenate([np.arange(180, 360, 2), np.arange(0, 180, 2)])
    if field.ndim == 3:
        field = field[0]
    return field[np.ix_(rows, cols)].copy()  # rows: -90..90
