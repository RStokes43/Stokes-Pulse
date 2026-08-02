(function () {
  // ---------- shared helpers ----------
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (res.status === 401) {
      window.location.href = "/login?next=/mobile";
      throw new Error("session expired");
    }
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  }

  function statusRank(s) {
    return { up: 0, degraded: 1, down: 2 }[s] ?? 0;
  }

  function statusBadge(status) {
    return `<span class="badge ${status}">${escapeHtml(status)}</span>`;
  }

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

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

  const content = document.getElementById("m-content");

  // ---------- Dashboard ----------
  const PAUSE_ICON = '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor"></rect><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor"></rect></svg>';
  const PLAY_ICON = '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2.5 L13.5 8 L4 13.5 Z" fill="currentColor"></path></svg>';

  function mobileSparklineSvg(values) {
    const pts = [];
    const known = (values || []).filter((v) => v != null);
    if (known.length < 2) return "";
    const max = Math.max(...known);
    const min = Math.min(...known);
    const range = max - min || 1;
    const step = 100 / (values.length - 1 || 1);
    values.forEach((v, i) => {
      if (v == null) return;
      const x = i * step;
      const y = 15 - ((v - min) / range) * 13;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    });
    return `<svg class="m-sparkline" viewBox="0 0 100 16" preserveAspectRatio="none"><path d="M${pts.join(" L")}"></path></svg>`;
  }

  function dashboardCardHtml(d) {
    const latency = d.latency_ms == null ? "—" : `${Math.round(d.latency_ms)} ms`;
    const uptime = d.uptime_24h_pct == null ? "—" : `${d.uptime_24h_pct}%`;
    const spark = mobileSparklineSvg(d.sparkline);
    return `<div class="m-card status-${d.status}">
      <div class="m-card-row">
        <span class="dot status-${d.status}"></span>
        <div class="info">
          <div class="name">${escapeHtml(d.name)}</div>
          <div class="ip">${escapeHtml(d.ip)}</div>
        </div>
        <div class="metrics">
          <span class="latency">${latency}</span>
          <span>${uptime}</span>
        </div>
        <button class="pause-btn ${d.muted ? "paused" : ""}" data-id="${d.id}" data-muted="${d.muted}" title="${d.muted ? "Resume alerts" : "Pause alerts"}">${d.muted ? PLAY_ICON : PAUSE_ICON}</button>
      </div>
      ${spark}
    </div>`;
  }

  async function renderDashboard(root) {
    const data = await fetchJSON("/api/devices");
    const devices = data.devices;
    const counts = { up: 0, degraded: 0, down: 0 };
    devices.forEach((d) => { counts[d.status] = (counts[d.status] || 0) + 1; });
    const worst = devices.reduce((acc, d) => (statusRank(d.status) > statusRank(acc) ? d.status : acc), "up");
    const statusWord = worst === "up" ? "Healthy" : worst === "degraded" ? "Degraded" : "Down";
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const dotEl = document.querySelector("#m-logo-dot circle");
    if (dotEl) dotEl.setAttribute("fill", `var(--${worst})`);

    const groups = {};
    devices.forEach((d) => { (groups[d.group] = groups[d.group] || []).push(d); });
    const order = data.groups_order.filter((g) => groups[g]);
    const groupsHtml = order
      .map((g) => `<div class="m-group"><h2>${escapeHtml(g)}</h2>${groups[g].map(dashboardCardHtml).join("")}</div>`)
      .join("");

    root.innerHTML = `
      <div class="m-hero" id="m-hero" title="View analytics">
        <div class="status-word ${worst}">${statusWord}</div>
        <div class="status-sub">${counts.up || 0}/${devices.length} up · ${now}</div>
      </div>
      ${groupsHtml || '<div class="m-empty">No devices configured.</div>'}
    `;

    const heroEl = qs("#m-hero", root);
    if (heroEl) heroEl.addEventListener("click", () => showSection("analytics"));

    qsa(".pause-btn", root).forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const muted = btn.dataset.muted === "true";
        await fetchJSON("/api/mute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id: id, muted: !muted }),
        });
        renderDashboard(root);
      })
    );
  }

  // ---------- Events ----------
  async function renderEvents(root) {
    const data = await fetchJSON("/api/events?limit=50");
    if (!data.events.length) {
      root.innerHTML = '<div class="m-empty">No events yet.</div>';
      return;
    }
    root.innerHTML = data.events
      .map((e) => {
        const when = new Date(e.started_at * 1000).toLocaleString([], {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        });
        const ongoing = e.ended_at ? "" : " · ongoing";
        return `<div class="m-event">
          <span class="ev-device">${escapeHtml(e.device_name)}</span>
          <span class="ev-meta">${escapeHtml(e.event_type)} · ${when}${ongoing}</span>
        </div>`;
      })
      .join("");
  }

  // ---------- Topology ----------
  const TILE_W = 168, TILE_H = 58, GAP_X = 20, GAP_Y = 28, MAX_COLS = 2;
  const CANVAS_W = MAX_COLS * TILE_W + (MAX_COLS - 1) * GAP_X + 40;
  const ZONE_PAD_TOP = 32, ZONE_PAD_BOTTOM = 18, ZONE_GAP = 16;
  const ICON_COLORS = {
    internet: "#60a5fa", vpn: "#c084fc", firewall: "#fb923c",
    network: "#94a3b8", host: "#a5b4cb", nas: "#c4b5fd", vm: "#38bdf8",
  };
  const TIERS = [
    { label: "Internet & VPN", groups: ["Internet", "VPN"] },
    { label: "Firewall", groups: ["Firewall"] },
    { label: "Network", groups: ["Network"] },
    { label: "Hosts & Storage", groups: ["Storage", "Hosts"] },
    { label: "Virtual Machines", groups: ["VMs"] },
  ];

  function topoIcon(category, color) {
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
      default:
        return `<rect x="2" y="3" width="16" height="11" rx="1.5" fill="none" stroke="${color}" stroke-width="1.3"></rect>
          <line x1="7" y1="17" x2="13" y2="17" stroke="${color}" stroke-width="1.3"></line>
          <line x1="10" y1="14" x2="10" y2="17" stroke="${color}" stroke-width="1.3"></line>`;
    }
  }

  function buildTopoLayout(devices, groupsOrder) {
    const byGroup = {};
    devices.forEach((d) => { (byGroup[d.group] = byGroup[d.group] || []).push(d); });
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

  function topoTileSvg(pos) {
    const d = pos.device;
    const color = ICON_COLORS[d.category] || "var(--accent)";
    const textW = TILE_W - 50 - 10;
    return `
      <g class="topo-tile status-${d.status}" transform="translate(${pos.x},${pos.y})">
        <rect class="tile-bg" width="${TILE_W}" height="${TILE_H}" rx="10"></rect>
        <circle class="tile-dot" cx="14" cy="16" r="4"></circle>
        <g transform="translate(24,6)">${topoIcon(d.category, color)}</g>
        <foreignObject x="50" y="6" width="${textW}" height="${TILE_H - 10}">
          <div xmlns="http://www.w3.org/1999/xhtml" class="tile-text">
            <div class="tile-name-html" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
            <div class="tile-sub-html">${escapeHtml(d.ip)}</div>
          </div>
        </foreignObject>
      </g>`;
  }

  function topoVerticalLink(upperPos, lowerPos) {
    const x1 = upperPos.cx, y1 = upperPos.y + TILE_H;
    const x2 = lowerPos.cx, y2 = lowerPos.y;
    const midY = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;
  }

  function topoHorizontalLink(leftPos, rightPos) {
    const x1 = leftPos.x + TILE_W, y1 = leftPos.y + TILE_H / 2;
    const x2 = rightPos.x, y2 = rightPos.y + TILE_H / 2;
    const midX = (x1 + x2) / 2;
    return `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`;
  }

  function topoLinksSvg(positions) {
    let out = "";
    Object.values(positions).forEach((pos) => {
      const parentId = pos.device.depends_on;
      const parentPos = parentId && positions[parentId];
      if (!parentPos) return;
      const status = pos.device.status;
      let path;
      if (Math.abs(parentPos.y - pos.y) < 1) {
        const [leftPos, rightPos] = parentPos.x <= pos.x ? [parentPos, pos] : [pos, parentPos];
        path = topoHorizontalLink(leftPos, rightPos);
      } else {
        const [upperPos, lowerPos] = parentPos.y < pos.y ? [parentPos, pos] : [pos, parentPos];
        path = topoVerticalLink(upperPos, lowerPos);
      }
      out += `<path class="topo-link status-${status}" d="${path}"></path>`;
      if (status !== "down") out += `<path class="topo-flow" d="${path}"></path>`;
    });
    return out;
  }

  function topoZoneBandsSvg(zoneBands, width) {
    return zoneBands
      .map((z) => `
        <rect class="topo-zone-band" x="6" y="${z.y}" width="${width - 12}" height="${z.height}" rx="12"></rect>
        <text class="topo-zone-label" x="18" y="${z.y + 20}">${escapeHtml(z.name)}</text>`)
      .join("");
  }

  async function renderTopology(root) {
    const data = await fetchJSON("/api/topology");
    if (!data.devices.length) {
      root.innerHTML = '<div class="m-empty">No devices configured.</div>';
      return;
    }
    const layout = buildTopoLayout(data.devices, data.groups_order);
    const svg = `
      <div class="topology-wrap" style="margin-bottom:16px">
        <svg viewBox="0 0 ${layout.width} ${layout.height}" width="100%" height="${layout.height}" preserveAspectRatio="xMinYMin meet">
          ${topoZoneBandsSvg(layout.zoneBands, layout.width)}
          ${topoLinksSvg(layout.positions)}
          ${Object.values(layout.positions).map(topoTileSvg).join("")}
        </svg>
      </div>`;

    const [devicesData, eventsData] = await Promise.all([
      fetchJSON("/api/devices"),
      fetchJSON("/api/events?limit=5"),
    ]);
    const latencyRows = devicesData.devices
      .map((d) => `<div class="latency-row">
        <span class="status-dot status-${d.status}"></span>
        <span class="name">${escapeHtml(d.name)}</span>
        <span class="val">${d.latency_ms == null ? "—" : d.latency_ms.toFixed(1) + " ms"}</span>
      </div>`)
      .join("");
    const incidentRows = eventsData.events.length
      ? eventsData.events
          .map((e) => {
            const when = new Date(e.started_at * 1000).toLocaleString();
            const dur = formatDuration(e.duration_s);
            const resolved = e.ended_at && dur ? ` (resolved after ${dur})` : "";
            return `<div class="incident-item">
              <span class="incident-device">${escapeHtml(e.device_name)}</span>
              <span class="incident-meta">${when} · ${escapeHtml(alertPhrase(e))}${resolved}</span>
            </div>`;
          })
          .join("")
      : '<div class="empty-state">No incidents yet.</div>';

    root.innerHTML = `${svg}
      <div class="panel"><h2>Connection Latency</h2><div class="device-latency-list">${latencyRows}</div></div>
      <div class="panel"><h2>Recent Incidents</h2><div class="incident-list">${incidentRows}</div></div>`;
  }

  // ---------- Analytics ----------
  const analyticsState = { range: "24h", device: null };

  function lineChartSvg(series) {
    const points = series.filter((s) => s.latency_ms != null);
    if (points.length < 2) return '<div class="empty-state">Not enough data yet.</div>';
    const width = 620, height = 180, pad = 32;
    const xs = points.map((p) => p.ts);
    const ys = points.map((p) => p.latency_ms);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const maxY = Math.max(...ys) * 1.1 || 1;
    const scaleX = (x) => pad + ((x - minX) / (maxX - minX || 1)) * (width - pad * 2);
    const scaleY = (y) => height - pad - (y / maxY) * (height - pad * 2);
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(p.ts).toFixed(1)},${scaleY(p.latency_ms).toFixed(1)}`).join(" ");
    const gridLines = [0, 0.5, 1]
      .map((f) => {
        const y = height - pad - f * (height - pad * 2);
        return `<line class="chart-grid" x1="${pad}" x2="${width - pad}" y1="${y}" y2="${y}"></line><text class="chart-axis-label" x="2" y="${y + 3}">${Math.round(maxY * f)}ms</text>`;
      })
      .join("");
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMinYMin meet">${gridLines}<path class="chart-line" d="${path}"></path></svg>`;
  }

  async function renderAnalytics(root) {
    const data = await fetchJSON(`/api/analytics?range=${analyticsState.range}`);
    if (!analyticsState.device && data.devices.length) analyticsState.device = data.devices[0].device_id;

    const rangeOptions = ["24h", "7d", "30d"]
      .map((r) => `<option value="${r}" ${r === analyticsState.range ? "selected" : ""}>${r === "24h" ? "Last 24 hours" : r === "7d" ? "Last 7 days" : "Last 30 days"}</option>`)
      .join("");
    const deviceOptions = data.devices
      .map((d) => `<option value="${d.device_id}" ${d.device_id === analyticsState.device ? "selected" : ""}>${escapeHtml(d.name)}</option>`)
      .join("");

    const leaderboardHtml = data.leaderboard.length
      ? data.leaderboard
          .map((d) => `<div class="leaderboard-item"><span>${escapeHtml(d.name)}</span><span>${d.incidents_count} incident(s) · MTTR ${d.mttr_seconds ?? "—"}s</span></div>`)
          .join("")
      : '<div class="empty-state">No incidents in this range.</div>';

    const tableRows = data.devices
      .map((d) => `<tr>
        <td>${escapeHtml(d.name)}</td>
        <td>${d.uptime_pct ?? "—"}%</td>
        <td>${d.avg_latency_ms ?? "—"} ms</td>
        <td>${d.p95_latency_ms ?? "—"} ms</td>
        <td>${d.incidents_count}</td>
        <td>${d.mttr_seconds ?? "—"}s</td>
      </tr>`)
      .join("");

    root.innerHTML = `
      <div class="panel">
        <h2>Analytics</h2>
        <div class="form-row"><label>Range</label><select id="a-range">${rangeOptions}</select></div>
        <div class="form-row"><label>Device (chart)</label><select id="a-device">${deviceOptions}</select></div>
        <div class="chart-wrap" id="a-chart"></div>
      </div>
      <div class="panel"><h2>Worst performers</h2><div id="a-leaderboard">${leaderboardHtml}</div></div>
      <div class="panel">
        <h2>All devices</h2>
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th>Device</th><th>Uptime</th><th>Avg</th><th>p95</th><th>Inc.</th><th>MTTR</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>`;

    qs("#a-range", root).addEventListener("change", (e) => {
      analyticsState.range = e.target.value;
      renderAnalytics(root);
    });
    qs("#a-device", root).addEventListener("change", (e) => {
      analyticsState.device = e.target.value;
      loadChart(root);
    });
    await loadChart(root);
  }

  async function loadChart(root) {
    if (!analyticsState.device) return;
    const data = await fetchJSON(`/api/analytics/series?device=${analyticsState.device}&range=${analyticsState.range}`);
    const chartEl = qs("#a-chart", root);
    if (chartEl) chartEl.innerHTML = lineChartSvg(data.series);
  }

  // ---------- Impact ----------
  function impactNodeHtml(n, byId) {
    const childrenHtml = n.children.length
      ? `<ul>${n.children.map((cid) => impactNodeHtml(byId[cid], byId)).join("")}</ul>`
      : "";
    const rootCauseName = n.root_cause && byId[n.root_cause] ? byId[n.root_cause].name : n.root_cause;
    const impactedNote = n.impacted
      ? ` <span style="color:var(--degraded)">— suppressed, root cause: ${escapeHtml(rootCauseName)}</span>`
      : "";
    return `<li><div class="impact-node ${n.impacted ? "impacted" : ""}">${statusBadge(n.status)} <strong>${escapeHtml(n.name)}</strong>${impactedNote}</div>${childrenHtml}</li>`;
  }

  async function renderImpact(root) {
    const data = await fetchJSON("/api/impact");
    const byId = {};
    data.nodes.forEach((n) => (byId[n.id] = n));
    const roots = data.nodes.filter((n) => !n.depends_on || !byId[n.depends_on]);
    root.innerHTML = `<div class="panel">
      <h2>Impact / Blast Radius</h2>
      <p style="color:var(--text-dim);font-size:12px;margin-top:-4px">If a node fails, everything beneath it is impacted and its own alert is auto-suppressed.</p>
      <ul class="impact-tree">${roots.map((n) => impactNodeHtml(n, byId)).join("")}</ul>
    </div>`;
  }

  // ---------- Maintenance (admin) ----------
  async function renderMaintenance(root) {
    const devicesData = await fetchJSON("/api/devices");
    const data = await fetchJSON("/api/maintenance");
    const byId = {};
    devicesData.devices.forEach((d) => (byId[d.id] = d));

    const deviceOptions = `<option value="all">All devices</option>` +
      devicesData.devices.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("");

    const rows = (data.windows || [])
      .map((w) => {
        const devName = w.device_id === "all" ? "All devices" : (byId[w.device_id] ? byId[w.device_id].name : w.device_id);
        const when = w.type === "one_time" ? `${w.start} → ${w.end}` : `${w.start_time}–${w.end_time} daily`;
        return `<tr>
          <td>${escapeHtml(w.label || "—")}</td>
          <td>${escapeHtml(devName)}</td>
          <td>${w.type}</td>
          <td>${escapeHtml(when)}</td>
          <td><button class="btn secondary maint-delete" data-id="${w.id}">✕</button></td>
        </tr>`;
      })
      .join("");

    root.innerHTML = `
      <div class="panel">
        <h2>Schedule a quiet window</h2>
        <form id="maintenance-form">
          <div class="form-row"><label>Label</label><input type="text" name="label" placeholder="e.g. NAS firmware update"></div>
          <div class="form-row"><label>Device</label><select name="device_id">${deviceOptions}</select></div>
          <div class="form-row"><label>Type</label>
            <select name="type" id="maintenance-type">
              <option value="one_time">One-time</option>
              <option value="daily">Daily</option>
            </select>
          </div>
          <div id="maintenance-one-time-fields">
            <div class="form-row"><label>Start</label><input type="datetime-local" name="start"></div>
            <div class="form-row"><label>End</label><input type="datetime-local" name="end"></div>
          </div>
          <div id="maintenance-daily-fields" hidden>
            <div class="form-row"><label>Start time</label><input type="time" name="start_time"></div>
            <div class="form-row"><label>End time</label><input type="time" name="end_time"></div>
          </div>
          <button class="btn" type="submit">Add window</button>
        </form>
      </div>
      <div class="panel">
        <h2>Active / scheduled windows</h2>
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th>Label</th><th>Device</th><th>Type</th><th>When</th><th></th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5">No windows scheduled.</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;

    const typeSel = qs("#maintenance-type", root);
    typeSel.addEventListener("change", () => {
      const isDaily = typeSel.value === "daily";
      qs("#maintenance-one-time-fields", root).hidden = isDaily;
      qs("#maintenance-daily-fields", root).hidden = !isDaily;
    });

    qs("#maintenance-form", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const body = { label: form.label.value, device_id: form.device_id.value, type: form.type.value };
      if (body.type === "one_time") {
        body.start = form.start.value;
        body.end = form.end.value;
      } else {
        body.start_time = form.start_time.value;
        body.end_time = form.end_time.value;
        body.days_of_week = [0, 1, 2, 3, 4, 5, 6];
      }
      await fetchJSON("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      renderMaintenance(root);
    });

    qsa(".maint-delete", root).forEach((btn) =>
      btn.addEventListener("click", async () => {
        await fetch(`/api/maintenance/${btn.dataset.id}`, { method: "DELETE" });
        renderMaintenance(root);
      })
    );
  }

  // ---------- Settings (admin) ----------
  async function renderSettings(root) {
    const cfg = await fetchJSON("/api/settings");
    root.innerHTML = `
      <div class="panel">
        <h2>Alerting — SMTP</h2>
        <form id="settings-form">
          <div class="form-row"><label>SMTP Host</label><input type="text" name="smtp_host" value="${escapeHtml(cfg.smtp_host || "")}"></div>
          <div class="form-row"><label>SMTP Port</label><input type="number" name="smtp_port" value="${cfg.smtp_port || 587}"></div>
          <div class="form-row"><label>Security</label>
            <select name="smtp_security">
              <option value="none" ${cfg.smtp_security === "none" ? "selected" : ""}>None</option>
              <option value="starttls" ${cfg.smtp_security === "starttls" ? "selected" : ""}>STARTTLS</option>
              <option value="ssl" ${cfg.smtp_security === "ssl" ? "selected" : ""}>SSL</option>
            </select>
          </div>
          <div class="form-row"><label>Username</label><input type="text" name="smtp_user" value="${escapeHtml(cfg.smtp_user || "")}"></div>
          <div class="form-row">
            <label>Password ${cfg.has_password ? "(set — leave blank to keep)" : ""}</label>
            <input type="password" name="smtp_password" placeholder="${cfg.has_password ? "••••••••" : ""}" autocomplete="new-password">
          </div>
          <div class="form-row"><label>From address</label><input type="text" name="smtp_from" value="${escapeHtml(cfg.smtp_from || "")}"></div>
          <div class="form-row"><label>Recipients (comma-separated)</label><input type="text" name="recipients" value="${escapeHtml((cfg.recipients || []).join(", "))}"></div>
          <div class="form-row"><label><input type="checkbox" name="send_recovery_emails" ${cfg.send_recovery_emails ? "checked" : ""}> Send recovery emails</label></div>
          <div class="form-row"><label>Heartbeat URL</label><input type="text" name="heartbeat_url" value="${escapeHtml(cfg.heartbeat_url || "")}"></div>
          <button class="btn" type="submit">Save</button>
          <button class="btn secondary" type="button" id="test-email-btn">Test email</button>
          <div id="settings-status" style="margin-top:8px;font-size:12px;color:var(--text-dim)"></div>
        </form>
      </div>`;

    qs("#settings-form", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const body = {
        smtp_host: form.smtp_host.value,
        smtp_port: parseInt(form.smtp_port.value, 10) || 587,
        smtp_security: form.smtp_security.value,
        smtp_user: form.smtp_user.value,
        smtp_password: form.smtp_password.value,
        smtp_from: form.smtp_from.value,
        recipients: form.recipients.value.split(",").map((s) => s.trim()).filter(Boolean),
        send_recovery_emails: form.send_recovery_emails.checked,
        heartbeat_url: form.heartbeat_url.value,
      };
      await fetchJSON("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      qs("#settings-status", root).textContent = "Saved.";
      renderSettings(root);
    });

    qs("#test-email-btn", root).addEventListener("click", async () => {
      const statusEl = qs("#settings-status", root);
      statusEl.textContent = "Sending…";
      const res = await fetchJSON("/api/settings/test-email", { method: "POST" });
      statusEl.textContent = res.success ? "Test email sent!" : "Failed — check SMTP settings.";
    });
  }

  // ---------- Users (admin) ----------
  function roleSelect(username, role, disabled) {
    return `<select class="user-role" data-username="${escapeHtml(username)}" data-prev="${role}" ${disabled ? "disabled" : ""}>
      <option value="user" ${role === "user" ? "selected" : ""}>User</option>
      <option value="admin" ${role === "admin" ? "selected" : ""}>Admin</option>
    </select>`;
  }

  async function renderUsers(root) {
    const data = await fetchJSON("/api/users");
    const currentUser = data.current_user;
    const adminCount = data.users.filter((u) => u.role === "admin").length;

    const rows = data.users
      .map((u) => {
        const isYou = u.username === currentUser;
        const isLastAdmin = u.role === "admin" && adminCount <= 1;
        return `<tr>
          <td>${escapeHtml(u.username)}${isYou ? " (you)" : ""}</td>
          <td>${roleSelect(u.username, u.role, isLastAdmin)}</td>
          <td><button class="btn secondary user-delete" data-username="${escapeHtml(u.username)}" ${data.users.length <= 1 ? "disabled" : ""}>✕</button></td>
        </tr>`;
      })
      .join("");

    root.innerHTML = `
      <div class="panel">
        <h2>Add a user</h2>
        <form id="add-user-form">
          <div class="form-row"><label>Username</label><input type="text" name="username" required></div>
          <div class="form-row"><label>Password (min 8 chars)</label><input type="password" name="password" minlength="8" required></div>
          <div class="form-row"><label>Confirm</label><input type="password" name="confirm" minlength="8" required></div>
          <div class="form-row"><label>Role</label>
            <select name="role">
              <option value="user" selected>User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button class="btn" type="submit">Add</button>
          <div id="user-form-status" style="margin-top:8px;font-size:12px;color:var(--down)"></div>
        </form>
      </div>
      <div class="panel">
        <h2>Existing users</h2>
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th>Username</th><th>Role</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;

    qs("#add-user-form", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const statusEl = qs("#user-form-status", root);
      if (form.password.value !== form.confirm.value) {
        statusEl.textContent = "Passwords do not match.";
        return;
      }
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.username.value, password: form.password.value, role: form.role.value }),
      });
      const body = await res.json();
      if (!res.ok) {
        statusEl.textContent = body.error || "Failed to add user.";
        return;
      }
      renderUsers(root);
    });

    qsa(".user-delete", root).forEach((btn) =>
      btn.addEventListener("click", async () => {
        const username = btn.dataset.username;
        const res = await fetch(`/api/users/${encodeURIComponent(username)}`, { method: "DELETE" });
        const body = await res.json();
        if (!res.ok) { alert(body.error || "Failed to remove user."); return; }
        if (username === currentUser) { window.location.href = "/login"; return; }
        renderUsers(root);
      })
    );

    qsa(".user-role", root).forEach((sel) =>
      sel.addEventListener("change", async () => {
        const username = sel.dataset.username;
        const newRole = sel.value;
        const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        });
        const body = await res.json();
        if (!res.ok) { alert(body.error || "Failed to change role."); sel.value = sel.dataset.prev; return; }
        if (username === currentUser && newRole !== "admin") { window.location.href = "/mobile"; return; }
        renderUsers(root);
      })
    );
  }

  // ---------- Section registry + nav ----------
  const SECTIONS = {
    dashboard: { render: renderDashboard, refreshMs: 3000 },
    topology: { render: renderTopology, refreshMs: 3000 },
    analytics: { render: renderAnalytics, refreshMs: 30000 },
    events: { render: renderEvents, refreshMs: 20000 },
    impact: { render: renderImpact, refreshMs: 20000 },
    maintenance: { render: renderMaintenance, refreshMs: null },
    settings: { render: renderSettings, refreshMs: null },
    users: { render: renderUsers, refreshMs: null },
  };

  let currentSection = "dashboard";
  let currentTimer = null;

  function showSection(name) {
    const section = SECTIONS[name];
    if (!section) return;
    if (currentTimer) { clearInterval(currentTimer); currentTimer = null; }
    currentSection = name;
    // Reflect the section in the URL hash so a page reload (e.g. the
    // Android app's pull-to-refresh, which just reloads the current URL)
    // lands back on the same section instead of resetting to the dashboard.
    history.replaceState(null, "", `#${name}`);
    qsa(".m-drawer-item[data-section]").forEach((b) => b.classList.toggle("active", b.dataset.section === name));
    const run = () => Promise.resolve(section.render(content)).catch((e) => console.error(`[${name}]`, e));
    run();
    if (section.refreshMs) currentTimer = setInterval(run, section.refreshMs);
    closeDrawer();
  }

  function openDrawer() {
    qs("#m-drawer").hidden = false;
    qs("#drawer-backdrop").hidden = false;
  }
  function closeDrawer() {
    qs("#m-drawer").hidden = true;
    qs("#drawer-backdrop").hidden = true;
  }

  function openModal(id) { qs(`#${id}`).hidden = false; }
  function closeModal(id) { qs(`#${id}`).hidden = true; }

  function wireEdgeSwipe() {
    const EDGE_PX = 24;
    const SWIPE_PX = 60;
    const MAX_VERTICAL_PX = 60;
    const MAX_MS = 600;
    let startX = 0, startY = 0, startT = 0;

    document.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
    }, { passive: true });

    document.addEventListener("touchend", (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Date.now() - startT > MAX_MS || Math.abs(dy) > MAX_VERTICAL_PX) return;
      const drawerOpen = !qs("#m-drawer").hidden;
      if (!drawerOpen && startX <= EDGE_PX && dx > SWIPE_PX) {
        openDrawer();
      } else if (drawerOpen && dx < -SWIPE_PX) {
        closeDrawer();
      }
    }, { passive: true });
  }

  function wireChrome() {
    qs("#drawer-btn").addEventListener("click", openDrawer);
    qs("#drawer-backdrop").addEventListener("click", closeDrawer);
    wireEdgeSwipe();
    qsa(".m-drawer-item[data-section]").forEach((btn) =>
      btn.addEventListener("click", () => showSection(btn.dataset.section))
    );
    qsa("[data-close-modal]").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const modal = e.target.closest(".modal");
        if (modal) modal.hidden = true;
      })
    );
    qs("#help-btn").addEventListener("click", () => {
      if (window.HelpTab) window.HelpTab.render(qs("#help-body"));
      openModal("help-modal");
    });
    qs("#changelog-item").addEventListener("click", async () => {
      closeDrawer();
      const body = qs("#changelog-body");
      body.innerHTML = '<div class="empty-state">Loading…</div>';
      openModal("changelog-modal");
      try {
        const data = await fetchJSON("/api/changelog");
        if (!data.commits.length) {
          body.innerHTML = '<div class="empty-state">No commits yet.</div>';
          return;
        }
        body.innerHTML =
          '<table class="data-table"><thead><tr><th>Hash</th><th>Date</th><th>Message</th></tr></thead><tbody>' +
          data.commits.map((c) => `<tr><td><code>${escapeHtml(c.hash)}</code></td><td>${escapeHtml(c.date)}</td><td>${escapeHtml(c.message)}</td></tr>`).join("") +
          "</tbody></table>";
      } catch (e) {
        body.innerHTML = '<div class="empty-state">Failed to load changelog.</div>';
      }
    });
  }

  async function loadVersion() {
    try {
      const meta = await fetchJSON("/api/meta");
      const item = qs("#changelog-item");
      if (item) item.textContent = `Changelog (v${meta.version})`;
    } catch (e) { console.error(e); }
  }

  wireChrome();
  loadVersion();
  const initialSection = (location.hash || "").slice(1);
  const initialSectionAllowed =
    SECTIONS[initialSection] && qs(`.m-drawer-item[data-section="${initialSection}"]`);
  showSection(initialSectionAllowed ? initialSection : "dashboard");
})();
