(function () {
  function sparklineSvg(values) {
    const pts = [];
    const known = values.filter((v) => v != null);
    if (known.length < 2) {
      return '<svg class="sparkline" width="100%" height="24" viewBox="0 0 100 24"></svg>';
    }
    const max = Math.max(...known);
    const min = Math.min(...known);
    const range = max - min || 1;
    const step = 100 / (values.length - 1 || 1);
    values.forEach((v, i) => {
      if (v == null) return;
      const x = i * step;
      const y = 23 - ((v - min) / range) * 21;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    });
    return `<svg class="sparkline" width="100%" height="24" viewBox="0 0 100 24" preserveAspectRatio="none"><path d="M${pts.join(" L")}"></path></svg>`;
  }

  function renderCard(d) {
    const portBadges =
      d.ports_open.map((p) => `<span class="port-badge open">${p}</span>`).join("") +
      d.ports_closed.map((p) => `<span class="port-badge closed">${p}</span>`).join("");
    const uptime = d.uptime_24h_pct == null ? "—" : `${d.uptime_24h_pct}%`;
    const latency = d.latency_ms == null ? "—" : `${Math.round(d.latency_ms)} ms`;
    return `
      <div class="device-card status-${d.status}" data-id="${d.id}">
        <div class="device-card-head">
          <span class="status-dot status-${d.status}" title="${d.status}"></span>
          <span class="device-card-name">${StokesPulse.escapeHtml(d.name)}</span>
          <button class="mute-bell ${d.muted ? "muted" : ""}" data-id="${d.id}" data-muted="${d.muted}" title="${d.muted ? "Unmute alerts" : "Mute alerts"}">${d.muted ? "\u{1F515}" : "\u{1F514}"}</button>
        </div>
        <div class="device-card-ip">${d.ip}</div>
        ${d.ports.length ? `<div class="port-badges">${portBadges}</div>` : ""}
        ${sparklineSvg(d.sparkline)}
        <div class="card-metrics"><span>${latency}</span><span>${uptime} (24h)</span></div>
      </div>`;
  }

  function renderGroup(name, devices) {
    return `<div class="category-group"><h2>${StokesPulse.escapeHtml(name)}</h2><div class="card-grid">${devices.map(renderCard).join("")}</div></div>`;
  }

  const DashboardTab = {
    refreshMs: 15000,
    root: null,
    async render(root) {
      this.root = root;
      const data = await StokesPulse.fetchJSON("/api/devices");
      const groups = {};
      data.devices.forEach((d) => {
        (groups[d.group] = groups[d.group] || []).push(d);
      });
      const order = data.groups_order.filter((g) => groups[g]);
      root.innerHTML =
        order.map((g) => renderGroup(g, groups[g])).join("") ||
        '<div class="empty-state">No devices configured.</div>';

      StokesPulse.qsa(".mute-bell", root).forEach((btn) =>
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const muted = btn.dataset.muted === "true";
          await StokesPulse.fetchJSON("/api/mute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_id: id, muted: !muted }),
          });
          DashboardTab.render(DashboardTab.root);
        })
      );
    },
  };

  StokesPulse.registerTab("dashboard", DashboardTab);
})();
