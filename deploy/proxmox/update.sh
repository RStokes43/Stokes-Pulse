#!/usr/bin/env bash
# Runs INSIDE the LXC via the stokespulse-update.timer/.service.
# Pulls the latest commit; only reinstalls deps + restarts the app if HEAD changed.
# Never touches git-ignored files (config/alerting.json, config/secrets.json,
# config/maintenance.json, config/alert_overrides.json, data/) since git doesn't track them.
set -euo pipefail

APP_DIR="/opt/stokespulse"
cd "$APP_DIR"

BEFORE="$(git rev-parse HEAD)"
git fetch origin
git merge --ff-only origin/main
AFTER="$(git rev-parse HEAD)"

if [ "$BEFORE" != "$AFTER" ]; then
  echo "Stokes-Pulse updated ${BEFORE:0:7} -> ${AFTER:0:7}, reinstalling deps and restarting..."
  "$APP_DIR/.venv/bin/pip" install -r requirements.txt --quiet
  systemctl restart stokespulse
else
  echo "Stokes-Pulse already up to date (${AFTER:0:7})."
fi
