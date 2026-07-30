(function () {
  function formatDuration(s) {
    if (s == null) return "—";
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), rs = s % 60;
    if (m < 60) return `${m}m ${rs}s`;
    const h = Math.floor(m / 60), rm = m % 60;
    return `${h}h ${rm}m`;
  }

  const EventsTab = {
    refreshMs: 20000,
    async render(root) {
      const data = await StokesPulse.fetchJSON("/api/events?limit=300");
      if (!data.events.length) {
        root.innerHTML = '<div class="panel"><h2>Event Log</h2><div class="empty-state">No events yet.</div></div>';
        return;
      }
      const rows = data.events
        .map(
          (e) => `<tr>
            <td>${StokesPulse.escapeHtml(e.device_name)}</td>
            <td>${StokesPulse.escapeHtml(e.event_type)}</td>
            <td>${new Date(e.started_at * 1000).toLocaleString()}</td>
            <td>${e.ended_at ? new Date(e.ended_at * 1000).toLocaleString() : "<em>ongoing</em>"}</td>
            <td>${formatDuration(e.duration_s)}</td>
            <td>${StokesPulse.statusBadge(e.alerted)}</td>
            <td>${StokesPulse.escapeHtml(e.details || "")}</td>
          </tr>`
        )
        .join("");
      root.innerHTML = `<div class="panel"><h2>Event Log</h2><table class="data-table">
        <thead><tr><th>Device</th><th>Type</th><th>Started</th><th>Ended</th><th>Duration</th><th>Alert</th><th>Details</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    },
  };

  StokesPulse.registerTab("events", EventsTab);
})();
