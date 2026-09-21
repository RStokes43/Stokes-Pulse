(function () {
  function formatDuration(s) {
    if (s == null) return "—";
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), rs = s % 60;
    if (m < 60) return `${m}m ${rs}s`;
    const h = Math.floor(m / 60), rm = m % 60;
    return `${h}h ${rm}m`;
  }

  function dateInputToUnix(value, endOfDay) {
    if (!value) return null;
    const d = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`);
    return Math.floor(d.getTime() / 1000);
  }

  const EventsTab = {
    refreshMs: 20000,
    root: null,
    deviceId: "",
    since: "",
    until: "",

    async render(root) {
      this.root = root;
      if (!root.dataset.inited) {
        root.innerHTML = `
          <div class="panel">
            <h2>Event Log</h2>
            <div class="inline-form">
              <div class="form-row"><label>Device</label>
                <select id="events-device"><option value="">All devices</option></select>
              </div>
              <div class="form-row"><label>From</label><input type="date" id="events-since"></div>
              <div class="form-row"><label>To</label><input type="date" id="events-until"></div>
              <button class="btn secondary" type="button" id="events-clear">Clear filters</button>
            </div>
            <div id="events-table"></div>
          </div>`;
        root.dataset.inited = "1";
        StokesPulse.qs("#events-device", root).addEventListener("change", (e) => {
          this.deviceId = e.target.value;
          this.load();
        });
        StokesPulse.qs("#events-since", root).addEventListener("change", (e) => {
          this.since = e.target.value;
          this.load();
        });
        StokesPulse.qs("#events-until", root).addEventListener("change", (e) => {
          this.until = e.target.value;
          this.load();
        });
        StokesPulse.qs("#events-clear", root).addEventListener("click", () => {
          this.deviceId = this.since = this.until = "";
          StokesPulse.qs("#events-device", this.root).value = "";
          StokesPulse.qs("#events-since", this.root).value = "";
          StokesPulse.qs("#events-until", this.root).value = "";
          this.load();
        });
      }
      await this.load();
    },

    async load() {
      const sel = StokesPulse.qs("#events-device", this.root);
      if (sel.options.length <= 1) {
        const devData = await StokesPulse.fetchJSON("/api/devices");
        sel.insertAdjacentHTML(
          "beforeend",
          devData.devices.map((d) => `<option value="${d.id}">${StokesPulse.escapeHtml(d.name)}</option>`).join("")
        );
      }

      const params = new URLSearchParams({ limit: "300" });
      if (this.deviceId) params.set("device", this.deviceId);
      const sinceTs = dateInputToUnix(this.since, false);
      const untilTs = dateInputToUnix(this.until, true);
      if (sinceTs != null) params.set("since", sinceTs);
      if (untilTs != null) params.set("until", untilTs);

      const data = await StokesPulse.fetchJSON(`/api/events?${params.toString()}`);
      const tableEl = StokesPulse.qs("#events-table", this.root);
      if (!data.events.length) {
        tableEl.innerHTML = '<div class="empty-state">No events match these filters.</div>';
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
      tableEl.innerHTML = `<table class="data-table">
        <thead><tr><th>Device</th><th>Type</th><th>Started</th><th>Ended</th><th>Duration</th><th>Alert</th><th>Details</th></tr></thead>
        <tbody>${rows}</tbody></table>`;
    },
  };

  StokesPulse.registerTab("events", EventsTab);
})();
