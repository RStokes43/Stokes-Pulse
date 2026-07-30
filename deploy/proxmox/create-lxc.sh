#!/usr/bin/env bash
# Run this ON THE PROXMOX HOST (as root) to create the Stokes-Pulse LXC.
#
# Usage: bash create-lxc.sh [CTID] [HOSTNAME]
#   CTID     defaults to 901 (900 is already ForaScraper on this host)
#   HOSTNAME defaults to stokes-pulse
set -euo pipefail

CTID="${1:-901}"
HOSTNAME="${2:-stokes-pulse}"

# --- network (fixed per your setup; 10.10.43.9 confirmed free) ---
BRIDGE="vmbr0"
IP_CIDR="10.10.43.9/24"
GATEWAY="10.10.43.1"

# --- container sizing ---
STORAGE="local-lvm"
DISK_GB=6
CORES=1
MEMORY_MB=512
SWAP_MB=512

TEMPLATE_STORE="local"
TEMPLATE_PATTERN="ubuntu-22.04-standard"

echo "Updating LXC template list..."
pveam update

TEMPLATE=$(pveam available --section system | awk '{print $2}' | grep "^${TEMPLATE_PATTERN}" | sort -V | tail -n1)
if [ -z "$TEMPLATE" ]; then
  echo "Could not find an available template matching ${TEMPLATE_PATTERN}. Run 'pveam available' to see options." >&2
  exit 1
fi

if ! pveam list "$TEMPLATE_STORE" | grep -q "$TEMPLATE"; then
  echo "Downloading template $TEMPLATE ..."
  pveam download "$TEMPLATE_STORE" "$TEMPLATE"
fi

echo "Creating container $CTID ($HOSTNAME)..."
pct create "$CTID" "${TEMPLATE_STORE}:vztmpl/${TEMPLATE}" \
  --hostname "$HOSTNAME" \
  --cores "$CORES" \
  --memory "$MEMORY_MB" \
  --swap "$SWAP_MB" \
  --rootfs "${STORAGE}:${DISK_GB}" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=${IP_CIDR},gw=${GATEWAY}" \
  --unprivileged 1 \
  --features nesting=1 \
  --onboot 1

echo "Starting container $CTID..."
pct start "$CTID"
sleep 5

echo ""
echo "Container $CTID ($HOSTNAME) is up at ${IP_CIDR%/*}."
echo ""
echo "Next steps (see deploy/proxmox/README.md for the full walkthrough):"
echo "  1. Create a PRIVATE GitHub repo for this project and push this code to it."
echo "  2. Generate a read-only deploy key and add it to the repo's Deploy Keys."
echo "  3. Enter the container:  pct exec ${CTID} -- bash"
echo "     Install git, set up the deploy key, and 'git clone' the repo to /opt/stokespulse."
echo "  4. Run: bash /opt/stokespulse/deploy/proxmox/install-app.sh"
