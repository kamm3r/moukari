#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -x .venv/bin/python && -f dist/index.html && -f models/pose_landmarker_full.task ]] || { echo 'Run ./scripts/setup.sh first, or use docker compose up --build.'; exit 1; }
exec .venv/bin/python -m uvicorn server.app:app --host 0.0.0.0 --port "${PORT:-3000}"
