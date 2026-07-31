(function () {
  const TILE_W = 188;
  const TILE_H = 58;
  const GAP_X = 26;
  const GAP_Y = 30;
  const MAX_COLS = 4;
  const CANVAS_W = MAX_COLS * TILE_W + (MAX_COLS - 1) * GAP_X + 60;
  const ZONE_PAD_TOP = 34;
  const ZONE_PAD_BOTTOM = 20;
  const ZONE_GAP = 18;
  const SIDE_PAD = 30;

  const ICON_COLORS = {
    internet: "#60a5fa",
    vpn: "#c084fc",
    firewall: "#fb923c",
    network: "#94a3b8",
    host: "#a5b4cb",
    nas: "#c4b5fd",
    vm: "#38bdf8",
  };

  function icon(category, color) {
    switch (category) {
      case "internet":
        return `<circle cx="10" cy="10" r="8" fill="none" stroke="${color}" stroke-width="1.4"></circle>
          <ellipse cx="10" cy="10" rx="3.2" ry="8" fill="none" stroke="${color}" stroke-width="1.2"></ellipse>
          <line x1="2" y1="10" x2="18" y2="10" stroke="${color}" stroke-width="1.2"></line>`;
      case "vpn":
        return `<rect x="2" y="6" width="9" height="8" rx="3" fill="none" stroke="${color}" stroke-width="1.4" transform="rotate(-20 6.5 10)"></rect>
          <rect x="9" y="6" width="9" height="8" rx="3" fill="none" stroke="${color}" stroke-width="1.4" transform="rotate(-20 13.5 10)"></rect>`;
      case "firewall":
        return `<path d="M10 2 L17 5 V10 C17 14.5 14 17.5 10 19 C6 17.5 3 14.5 3 10 V5 Z" fill="none" stroke="${color}" stroke-width="1.4"></path>`;
      case "network":
        return `<circle cx="4" cy="5" r="2.2" fill="${color}"></circle>
          <circle cx="16" cy="5" r="2.2" fill="${color}"></circle>
          <circle cx="10" cy="16" r="2.2" fill="${color}"></circle>
          <line x1="4" y1="5" x2="10" y2="16" stroke="${color}" stroke-width="1.1"></line>
          <line x1="16" y1="5" x2="10" y2="16" stroke="${color}" stroke-width="1.1"></line>`;
      case "nas":
        return `<rect x="2" y="3" width="16" height="6" rx="1.5" fill="none" stroke="${color}" stroke-width="1.3"></rect>
          <rect x="2" y="11" width="16" height="6" rx="1.5" fill="none" stroke="${color}" stroke-width="1.3"></rect>
          <circle cx="15" cy="6" r="0.9" fill="${color}"></circle>
          <circle cx="15" cy="14" r="0.9" fill="${color}"></circle>`;
      case "host":
        return `<rect x="2" y="2" width="16" height="12" rx="1.5" fill="none" stroke="${color}" stroke-width="1.3"></rect>
          <line x1="2" y1="6.5" x2="18" y2="6.5" stroke="${color}" stroke-width="1"></line>
          <line x1="2" y1="10.5" x2="18" y2="10.5" stroke="${color}" stroke-width="1"></line>
          <line x1="6" y1="17" x2="14" y2="17" stroke="${color}" stroke-width="1.3"></line>`;
      default: // vm
        return `<rect x="2" y="3" width="16" height="11" rx="1.5" fill="none" stroke="${color}" stroke-width="1.3"></rect>
          <line x1="7" y1="17" x2="13" y2="17" stroke="${color}" stroke-width="1.3"></line>
          <line x1="10" y1="14" x2="10" y2="17" stroke="${color}" stroke-width="1.3"></line>`;
    }
  }

  // Peer categories that are direct siblings under the same parent (e.g. both
  // Internet and VPN checks hang directly off the firewall) are merged into one
  // visual tier so a link never has to skip over an unrelated zone in between.
  const TIERS = [
    { label: "Internet & VPN", groups: ["Internet", "VPN"] },
    { label: "Firewall", groups: ["Firewall"] },
    { label: "Network", groups: ["Network"] },
    { label: "Hosts & Storage", groups: ["Storage", "Hosts"] },
    { label: "Virtual Machines", groups: ["VMs"] },
  ];

  function buildLayout(devices, groupsOrder) {
    const byGroup = {};
    devices.forEach((d) => {
      (byGroup[d.group] = byGroup[d.group] || []).push(d);
    });
    const tiers = TIERS.map((t) => ({
      label: t.label,
      devices: groupsOrder.filter((g) => t.groups.includes(g)).flatMap((g) => byGroup[g] || []),
    })).filter((t) => t.devices.length);

    const positions = {};
    const zoneBands = [];
    let y = 20;

    tiers.forEach((tier) => {
      const list = tier.devices;
      const rows = Math.ceil(list.length / MAX_COLS);
      const zoneTop = y;

      for (let r = 0; r < rows; r++) {
        const rowItems = list.slice(r * MAX_COLS, r * MAX_COLS + MAX_COLS);
        const rowWidth = rowItems.length * TILE_W + (rowItems.length - 1) * GAP_X;
        const rowStartX = (CANVAS_W - rowWidth) / 2;
        const rowY = zoneTop + ZONE_PAD_TOP + r * (TILE_H + GAP_Y);
        rowItems.forEach((d, i) => {
          positions[d.id] = {
            x: rowStartX + i * (TILE_W + GAP_X),
            y: rowY,
            cx: rowStartX + i * (TILE_W + GAP_X) + TILE_W / 2,
            device: d,
          };
        });
      }

      const zoneHeight = ZONE_PAD_TOP + rows * TILE_H + (rows - 1) * GAP_Y + ZONE_PAD_BOTTOM;
      zoneBands.push({ name: tier.label, y: zoneTop, height: zoneHeight });
      y = zoneTop + zoneHeight + ZONE_GAP;
    });

    return { positions, zoneBands, width: CANVAS_W, height: y };
  }

  function tileSvg(pos) {
    const d = pos.device;
    const color = ICON_COLORS[d.category] || "var(--accent)";
    const textW = TILE_W - 50 - 10; // tile width minus icon column minus right margin
    return `
      <g class="topo-tile status-${d.status}" transform="translate(${pos.x},${pos.y})">
        <rect class="tile-bg" width="${TILE_W}" height="${TILE_H}" rx="10"></rect>
        <circle class="tile-dot" cx="14" cy="16" r="4"></circle>
        <g transform="translate(24,6)">${icon(d.category, color)}</g>
        <foreignObject x="50" y="6" width="${textW}" height="${TILE_H - 10}">
          <div xmlns="http://www.w3.org/1999/xhtml" class="tile-text">
            <div class="tile-name-html" title="${StokesPulse.escapeHtml(d.name)}">${StokesPulse.escapeHtml(d.name)}</div>
            <div class="tile-sub-html">${StokesPulse.escapeHtml(d.ip)}</div>
          </div>
        </foreignObject>
      </g>`;
  }

  function verticalLinkPath(upperPos, lowerPos) {
    const x1 = upperPos.cx, y1 = upperPos.y + TILE_H;
    const x2 = lowerPos.cx, y2 = lowerPos.y;
    const midY = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;
  }

  function horizontalLinkPath(leftPos, rightPos) {
    const x1 = leftPos.x + TILE_W, y1 = leftPos.y + TILE_H / 2;
    const x2 = rightPos.x, y2 = rightPos.y + TILE_H / 2;
    const midX = (x1 + x2) / 2;
    return `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`;
  }

  function linksSvg(positions) {
    let out = "";
    Object.values(positions).forEach((pos) => {
      const parentId = pos.device.depends_on;
      const parentPos = parentId && positions[parentId];
      if (!parentPos) return;
      const status = pos.device.status;
      let path;
      if (Math.abs(parentPos.y - pos.y) < 1) {
        // Same row (e.g. a switch and the APs hanging off it in the same
        // category zone) — connect side-to-side instead of top/bottom.
        const [leftPos, rightPos] = parentPos.x <= pos.x ? [parentPos, pos] : [pos, parentPos];
        path = horizontalLinkPath(leftPos, rightPos);
      } else {
        // Draw by physical position (whichever tile sits higher connects down
        // to the lower one), not by which one is the dependency "parent" —
        // e.g. Internet/VPN tiles sit above Firewall even though they depend on it.
        const [upperPos, lowerPos] = parentPos.y < pos.y ? [parentPos, pos] : [pos, parentPos];
        path = verticalLinkPath(upperPos, lowerPos);
      }
      out += `<path class="topo-link status-${status}" d="${path}"></path>`;
      if (status !== "down") out += `<path class="topo-flow" d="${path}"></path>`;
    });
    return out;
  }

  function zoneBandsSvg(zoneBands, width) {
    return zoneBands
      .map(
        (z) => `
        <rect class="topo-zone-band" x="8" y="${z.y}" width="${width - 16}" height="${z.height}" rx="14"></rect>
        <text class="topo-zone-label" x="24" y="${z.y + 22}">${StokesPulse.escapeHtml(z.name)}</text>`
      )
      .join("");
  }

  function formatDuration(s) {
    if (s == null) return null;
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), rs = s % 60;
    if (m < 60) return `${m}m ${rs}s`;
    const h = Math.floor(m / 60), rm = m % 60;
    return `${h}h ${rm}m`;
  }

  function alertPhrase(e) {
    switch (e.alerted) {
      case "sent": return "alert sent";
      case "suppressed": return e.details || "suppressed";
      case "muted": return "muted";
      case "maintenance": return "in maintenance window";
      case "failed": return "alert failed to send";
      default: return e.alerted || "";
    }
  }

  async function renderSidebar(container) {
    const [devicesData, eventsData] = await Promise.all([
      StokesPulse.fetchJSON("/api/devices"),
      StokesPulse.fetchJSON("/api/events?limit=5"),
    ]);

    const latencyRows = devicesData.devices
      .map(
        (d) => `<div class="latency-row">
          <span class="status-dot status-${d.status}"></span>
          <span class="name">${StokesPulse.escapeHtml(d.name)}</span>
          <span class="val">${d.latency_ms == null ? "—" : d.latency_ms.toFixed(1) + " ms"}</span>
        </div>`
      )
      .join("");

    const incidentRows = eventsData.events.length
      ? eventsData.events
          .map((e) => {
            const when = new Date(e.started_at * 1000).toLocaleString();
            const dur = formatDuration(e.duration_s);
            const resolved = e.ended_at && dur ? ` (resolved after ${dur})` : "";
            return `<div class="incident-item">
              <span class="incident-device">${StokesPulse.escapeHtml(e.device_name)}</span>
              <span class="incident-meta">${when} · ${StokesPulse.escapeHtml(alertPhrase(e))}${resolved}</span>
            </div>`;
          })
          .join("")
      : '<div class="empty-state">No incidents yet.</div>';

    container.innerHTML = `
      <div class="side-panel">
        <h3>Connection Latency</h3>
        <div class="device-latency-list">${latencyRows}</div>
      </div>
      <div class="side-panel">
        <h3>Recent Incidents</h3>
        <div class="incident-list">${incidentRows}</div>
      </div>`;
  }

  const TopologyTab = {
    refreshMs: 3000,
    root: null,
    async render(root) {
      this.root = root;
      const data = await StokesPulse.fetchJSON("/api/topology");
      if (!data.devices.length) {
        root.innerHTML = '<div class="empty-state">No devices configured.</div>';
        return;
      }
      const layout = buildLayout(data.devices, data.groups_order);
      root.innerHTML = `
        <div class="topology-wrap">
          <svg viewBox="0 0 ${layout.width} ${layout.height}" width="100%" height="${layout.height}" preserveAspectRatio="xMinYMin meet">
            ${zoneBandsSvg(layout.zoneBands, layout.width)}
            ${linksSvg(layout.positions)}
            ${Object.values(layout.positions).map(tileSvg).join("")}
          </svg>
        </div>`;
    },
    async renderSidebar(container) {
      return renderSidebar(container);
    },
  };

  StokesPulse.registerTab("topology", TopologyTab);
})();
