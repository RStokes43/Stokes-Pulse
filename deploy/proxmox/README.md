# Deploying Stokes-Pulse to Proxmox (Jotunheim)

This sets up an LXC that pulls its own updates from a private GitHub repo
every 5 minutes — you deploy by pushing from your PC, no SSH into the
container needed after the first setup.

CTID **901** / IP **10.10.43.9** was chosen because CTID 900 / 10.10.43.8 on
this host is already ForaScraper's production container.

## 1. Create the private GitHub repo

On github.com: New repository → name it (e.g. `stokes-pulse`) → **Private**.
Do not initialize with a README/gitignore (this project already has them).

From your PC, in this project folder:

```bash
git init -b main
git add .
git commit -m "Initial Stokes-Pulse build"
git remote add origin git@github.com:<your-username>/stokes-pulse.git
git push -u origin main
```

## 2. Add the read-only deploy key

A dedicated ed25519 keypair was generated for this (not committed to the
repo). Its **public** key:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIL9/2jNpYTAw9PDP5ueDtyVJnuAZsTg6YBgRI6qwub3r stokespulse-deploy-readonly
```

In the GitHub repo: **Settings → Deploy keys → Add deploy key** → paste the
line above → leave **"Allow write access" unchecked** (read-only) → Add key.

The matching **private** key lives on your PC at:
`stokespulse_deploy_key` (ask Claude for the exact scratchpad path, or
regenerate one with `ssh-keygen -t ed25519 -f stokespulse_deploy_key -N ""`
and add its `.pub` instead). You'll copy the private key into the LXC in
step 4 — treat it like a password in transit (e.g. paste directly into a
root shell via the Proxmox console, don't email it to yourself).

## 3. Create the LXC

On the Proxmox host (SSH or the web console shell), as root:

```bash
bash create-lxc.sh 901 stokes-pulse
```

(Copy `create-lxc.sh` to the host first, e.g. via the Proxmox web UI's
upload, WinSCP, or paste its contents into a new file with `nano`.)

## 4. Clone the repo into the container

Enter the container:

```bash
pct exec 901 -- bash
```

Inside the container:

```bash
apt-get update && apt-get install -y git openssh-client
mkdir -p ~/.ssh && chmod 700 ~/.ssh
nano ~/.ssh/id_ed25519          # paste the PRIVATE key contents, save
chmod 600 ~/.ssh/id_ed25519
ssh-keyscan github.com >> ~/.ssh/known_hosts

mkdir -p /opt/stokespulse
git clone git@github.com:<your-username>/stokes-pulse.git /opt/stokespulse
```

## 5. Install and start

Still inside the container:

```bash
bash /opt/stokespulse/deploy/proxmox/install-app.sh
```

This installs Python + deps, sets up the `.venv`, installs the
`stokespulse` service and the `stokespulse-update` timer (git pull every
5 min, auto-restart on change), and starts both.

## 6. Verify

From your PC/browser: **http://10.10.43.9:8420**

```bash
systemctl status stokespulse
journalctl -u stokespulse -f
systemctl list-timers stokespulse-update.timer
```

## 7. Day-to-day deploys

Just edit code (or `config/targets.json`) on your PC, commit, and
`git push`. Within 5 minutes the timer on the LXC pulls it and restarts the
service automatically. Secrets (`config/alerting.json`,
`config/secrets.json`, `config/maintenance.json`,
`config/alert_overrides.json`, `data/`) are git-ignored and never touched by
the pull — configure SMTP etc. once via the Settings tab in the UI.

## Security follow-ups (do these next)

This app currently serves plain HTTP with no login, meant for LAN-only
access. To harden it later:

- **Add a login**: put it behind a reverse proxy (Caddy or nginx) with
  `basic_auth` — a few lines of config, no code changes needed here.
- **Add HTTPS**: Caddy can auto-issue a local cert, or use step-ca /
  self-signed + trust the cert on your devices, since this never touches
  the public internet.
- Keep the deploy key **read-only** (never check "Allow write access").
- Keep `config/secrets.json` and `config/alerting.json` off any backup
  destination you don't control.
