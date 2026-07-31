# Stokes-Pulse

A self-hosted, dark-mode network monitoring dashboard for a homelab. Live-probes
real devices (firewall, NAS, hosts, VMs, VPN tunnels, internet reachability),
detects outages with debounce, and emails on down/recovery — all backed by
Flask + waitress + SQLite + hand-rolled SVG/vanilla JS. No external
CDNs/fonts — runs fully offline.

## Features

- **Dashboard** — device cards grouped by category, live status dot, latency,
  open/closed port badges, sparkline, 24h uptime %, pause/resume-alerts toggle
  per device.
- **Topology** — zoned tile map (Internet → VPN → Firewall → Network →
  Hosts/Storage → VMs) with animated, curved tier-to-tier links.
- **Analytics** — latency-over-time chart, uptime %, avg/p95 latency,
  incidents, MTTR, worst-performers leaderboard, over 24h/7d/30d ranges.
- **Event Log** — every down/recovery/security event with duration and alert
  status (sent/suppressed/muted/maintenance).
- **Impact** — blast-radius view from each device's `depends_on` field; a
  child's alert auto-suppresses when its parent is the root cause.
- **Maintenance** — one-time or daily quiet windows so planned downtime
  doesn't alert or clutter the log.
- **Settings** — SMTP alerting config, recovery emails, and a
  healthchecks.io-style heartbeat URL, all from the UI. The stored password
  is never sent back to the browser.
- **Port-drift watch** — scans notable ports every 30 min and emails if a new
  one opens versus a stored baseline (early-warning security).
- **Themes** — 5 selectable color schemes (palette icon, top right),
  persisted per-browser.
- Self-updating version badge (git commit count) with a changelog overlay
  built from `git log`.

## Tech stack

Python 3, Flask, waitress, SQLite (stdlib `sqlite3`). Probing uses the
system `ping` binary via `subprocess` and raw TCP connects via `socket` — no
extra dependencies beyond Flask/waitress. Frontend is vanilla JS + inline SVG,
no build step.

## Running locally

```bash
python -m venv .venv
.venv/Scripts/activate   # or .venv/bin/activate on Linux/Mac
pip install -r requirements.txt
python run.py
```

Serves on `http://0.0.0.0:8420` by default (override with `PORT`/`HOST` env vars).

## Config layout

- `config/targets.json` — device inventory. **Tracked in git**; the app only
  reads it. Edit and push to add/change monitored devices.
- `config/alerting.json`, `config/secrets.json`, `config/maintenance.json`,
  `config/alert_overrides.json` — runtime state. **Git-ignored**; configure
  via the Settings/Maintenance tabs instead of editing by hand.
- `data/monitor.db` — SQLite history (probe history, events, port baselines).
  Git-ignored.

## Deployment

Deployed to a Proxmox LXC that self-updates via a `git pull` systemd timer
from this private repo — push from your workstation, no SSH needed for
routine updates. Full step-by-step setup (LXC creation, deploy key, systemd
units) is in [`deploy/proxmox/README.md`](deploy/proxmox/README.md).

An nginx reverse-proxy config for fronting the app is in
[`deploy/proxmox/nginx-stokespulse.conf`](deploy/proxmox/nginx-stokespulse.conf).
