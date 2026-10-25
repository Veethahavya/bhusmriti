#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PY="${AEROS_PYTHON:-}"
if [ -z "$PY" ]; then
  for cand in \
    "python3" \
    "$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3" \
    "/opt/homebrew/bin/python3" \
    "/usr/local/bin/python3"; do
    if command -v "$cand" >/dev/null 2>&1 && "$cand" -c 'import numpy' >/dev/null 2>&1; then
      PY="$cand"; break
    fi
  done
fi

if [ -z "$PY" ]; then
  echo "AEROS needs Python 3 with numpy. Install it with: pip3 install -r requirements.txt" >&2
  echo "Or set AEROS_PYTHON to a Python that has numpy." >&2
  exit 1
fi

echo "[aeros] refreshing with $PY"
"$PY" pipeline/build_ranges.py
"$PY" pipeline/build_long.py
