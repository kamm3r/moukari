#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v ffmpeg >/dev/null || { echo 'Install FFmpeg before setup.'; exit 1; }
command -v uv >/dev/null || { echo 'Install uv before setup, or use docker compose up --build.'; exit 1; }
uv venv --python 3.12 --allow-existing .venv
uv pip install --python .venv/bin/python -r requirements-dev.txt
.venv/bin/python scripts/download_model.py
npm ci
npm run build
echo 'Ready. Run ./scripts/start.sh and open http://localhost:3000'
