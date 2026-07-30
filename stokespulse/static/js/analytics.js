(function () {
  function renderTable(devices) {
    if (!devices.length) return '<div class="empty-state">No devices.</div>';
    return (
      '<table class="data-table"><thead><tr><th>Device</th><th>Uptime</th><th>Avg latency</th><th>p95 latency</th><th>Incidents</th><th>MTTR</th></tr></thead><tbody>' +
      devices
        .map(
          (d) => `<tr>
            <td>${StokesPulse.escapeHtml(d.name)}</td>
            <td>${d.uptime_pct ?? "—"}%</td>
            <td>${d.avg_latency_ms ?? "—"} ms</td>
            <td>${d.p95_latency_ms ?? "—"} ms</td>
            <td>${d.incidents_count}</td>
            <td>${d.mttr_seconds ?? "—"}s</td>
          </tr>`
        )
        .join("") +
      "</tbody></table>"
    );
  }

  function lineChartSvg(series) {
    const points = series.filter((s) => s.latency_ms != null);
    if (points.length < 2) return '<div class="empty-state">Not enough data yet — check back after a few probe cycles.</div>';
    const width = 760, height = 200, pad = 34;
    const xs = points.map((p) => p.ts);
    const ys = points.map((p) => p.latency_ms);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const maxY = Math.max(...ys) * 1.1 || 1;
    const scaleX = (x) => pad + ((x - minX) / (maxX - minX || 1)) * (width - pad * 2);
    const scaleY = (y) => height - pad - (y / maxY) * (height - pad * 2);
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(p.ts).toFixed(1)},${scaleY(p.latency_ms).toFixed(1)}`).join(" ");
    const gridLines = [0, 0.25, 0.5, 0.75, 1]
      .map((f) => {
        const y = height - pad - f * (height - pad * 2);
        return `<line class="chart-grid" x1="${pad}" x2="${width - pad}" y1="${y}" y2="${y}"></line><text class="chart-axis-label" x="2" y="${y + 3}">${Math.round(maxY * f)}ms</text>`;
      })
      .join("");
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMinYMin meet">${gridLines}<path class="chart-line" d="${path}"></path></svg>`;
  }

  const AnalyticsTab = {
    refreshMs: 30000,
    root: null,
    range: "24h",
    selectedDevice: null,

    async render(root) {
      this.root = root;
      if (!root.dataset.inited) {
        root.innerHTML = `
          <div class="panel">
            <h2>Analytics</h2>
            <div class="inline-form">
              <div class="form-row"><label>Range</label>
                <select id="analytics-range">
                  <option value="24h">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                </select>
              </div>
              <div class="form-row"><label>Device (chart)</label>
                <select id="analytics-device"></select>
              </div>
            </div>
            <div class="chart-wrap" id="analytics-chart"></div>
          </div>
          <div class="panel">
            <h2>Worst performers (leaderboard)</h2>
            <div id="analytics-leaderboard"></div>
          </div>
          <div class="panel">
            <h2>All devices</h2>
            <div id="analytics-table"></div>
          </div>`;
        root.dataset.inited = "1";
        StokesPulse.qs("#analytics-range", root).addEventListener("change", (e) => {
          this.range = e.target.value;
          this.load();
        });
        StokesPulse.qs("#analytics-device", root).addEventListener("change", (e) => {
          this.selectedDevice = e.target.value;
          this.loadChart();
        });
      }
      await this.load();
    },

    async load() {
      const data = await StokesPulse.fetchJSON(`/api/analytics?range=${this.range}`);
      const sel = StokesPulse.qs("#analytics-device", this.root);
      if (!sel.options.length) {
        sel.innerHTML = data.devices.map((d) => `<option value="${d.device_id}">${StokesPulse.escapeHtml(d.name)}</option>`).join("");
        this.selectedDevice = data.devices[0] && data.devices[0].device_id;
      }
      StokesPulse.qs("#analytics-leaderboard", this.root).innerHTML = data.leaderboard.length
        ? data.leaderboard
            .map(
              (d) =>
                `<div class="leaderboard-item"><span>${StokesPulse.escapeHtml(d.name)}</span><span>${d.incidents_count} incident(s) · MTTR ${d.mttr_seconds ?? "—"}s</span></div>`
            )
            .join("")
        : '<div class="empty-state">No incidents in this range.</div>';
      StokesPulse.qs("#analytics-table", this.root).innerHTML = renderTable(data.devices);
      await this.loadChart();
    },

    async loadChart() {
      if (!this.selectedDevice) return;
      const data = await StokesPulse.fetchJSON(`/api/analytics/series?device=${this.selectedDevice}&range=${this.range}`);
      StokesPulse.qs("#analytics-chart", this.root).innerHTML = lineChartSvg(data.series);
    },
  };

  StokesPulse.registerTab("analytics", AnalyticsTab);
})();
