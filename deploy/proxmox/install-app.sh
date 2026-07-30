#!/usr/bin/env bash
# Run this INSIDE THE LXC CONTAINER (as root) after the repo has been cloned
# to /opt/stokespulse via the read-only deploy key.
#
# Usage: PORT=8420 bash install-app.sh
set -euo pipefail

APP_DIR="/opt/stokespulse"
PORT="${PORT:-8420}"

if [ ! -f "$APP_DIR/run.py" ]; then
  echo "Expected app source at $APP_DIR (run.py not found). Clone the repo there first." >&2
  exit 1
fi

echo "Installing base packages..."
apt-get update
apt-get install -y python3-venv python3-pip iputils-ping git

cd "$APP_DIR"

echo "Creating virtualenv and installing Python deps..."
python3 -m venv .venv
"$APP_DIR/.venv/bin/pip" install --upgrade pip
"$APP_DIR/.venv/bin/pip" install -r requirements.txt

mkdir -p "$APP_DIR/data"

echo "Installing systemd units..."
cp "$APP_DIR/deploy/proxmox/stokespulse.service" /etc/systemd/system/stokespulse.service
sed -i "s#__APP_DIR__#${APP_DIR}#g; s#__PORT__#${PORT}#g" /etc/systemd/system/stokespulse.service

cp "$APP_DIR/deploy/proxmox/stokespulse-update.service" /etc/systemd/system/stokespulse-update.service
sed -i "s#__APP_DIR__#${APP_DIR}#g" /etc/systemd/system/stokespulse-update.service

cp "$APP_DIR/deploy/proxmox/stokespulse-update.timer" /etc/systemd/system/stokespulse-update.timer
chmod +x "$APP_DIR/deploy/proxmox/update.sh"

systemctl daemon-reload
systemctl enable --now stokespulse
systemctl enable --now stokespulse-update.timer

echo ""
echo "Done. Stokes-Pulse should be listening on port ${PORT}."
echo "Check status:     systemctl status stokespulse"
echo "Tail logs:        journalctl -u stokespulse -f"
echo "Check auto-update: systemctl status stokespulse-update.timer"
