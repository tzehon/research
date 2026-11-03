#!/bin/sh
set -eu
python /app/render_lab_config.py
# Preserve the image's database migration/startup behavior.
exec /app/docker/prod_entrypoint.sh --config /tmp/lab-config.yaml --host 0.0.0.0 --port "${PORT:-4000}"
