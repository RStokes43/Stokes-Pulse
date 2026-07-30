(function () {
  function renderList(windows, byId) {
    if (!windows.length) return '<div class="empty-state">No maintenance windows scheduled.</div>';
    return (
      '<table class="data-table"><thead><tr><th>Label</th><th>Device</th><th>Type</th><th>When</th><th></th></tr></thead><tbody>' +
      windows
        .map((w) => {
          const devName = w.device_id === "all" ? "All devices" : (byId[w.device_id] ? byId[w.device_id].name : w.device_id);
          const when = w.type === "one_time" ? `${w.start} → ${w.end}` : `${w.start_time}–${w.end_time} daily`;
          return `<tr>
            <td>${StokesPulse.escapeHtml(w.label || "—")}</td>
            <td>${StokesPulse.escapeHtml(devName)}</td>
            <td>${w.type}</td>
            <td>${StokesPulse.escapeHtml(when)}</td>
            <td><button class="btn secondary maint-delete" data-id="${w.id}">Remove</button></td>
          </tr>`;
        })
        .join("") +
      "</tbody></table>"
    );
  }

  const MaintenanceTab = {
    root: null,
    devices: [],
    async render(root) {
      this.root = root;
      if (!this.devices.length) {
        const d = await StokesPulse.fetchJSON("/api/devices");
        this.devices = d.devices;
      }
      const byId = {};
      this.devices.forEach((d) => (byId[d.id] = d));
      const data = await StokesPulse.fetchJSON("/api/maintenance");

      root.innerHTML = `
        <div class="panel">
          <h2>Schedule a quiet window</h2>
          <form id="maintenance-form">
            <div class="inline-form">
              <div class="form-row"><label>Label</label><input type="text" name="label" placeholder="e.g. NAS firmware update"></div>
              <div class="form-row"><label>Device</label>
                <select name="device_id">
                  <option value="all">All devices</option>
                  ${this.devices.map((d) => `<option value="${d.id}">${StokesPulse.escapeHtml(d.name)}</option>`).join("")}
                </select>
              </div>
              <div class="form-row"><label>Type</label>
                <select name="type" id="maintenance-type">
                  <option value="one_time">One-time</option>
                  <option value="daily">Daily</option>
                </select>
              </div>
            </div>
            <div class="inline-form" id="maintenance-one-time-fields">
              <div class="form-row"><label>Start</label><input type="datetime-local" name="start"></div>
              <div class="form-row"><label>End</label><input type="datetime-local" name="end"></div>
            </div>
            <div class="inline-form" id="maintenance-daily-fields" hidden>
              <div class="form-row"><label>Start time</label><input type="time" name="start_time"></div>
              <div class="form-row"><label>End time</label><input type="time" name="end_time"></div>
            </div>
            <button class="btn" type="submit">Add window</button>
          </form>
        </div>
        <div class="panel">
          <h2>Active / scheduled windows</h2>
          <div id="maintenance-list">${renderList(data.windows || [], byId)}</div>
        </div>`;

      const typeSel = StokesPulse.qs("#maintenance-type", root);
      typeSel.addEventListener("change", () => {
        const isDaily = typeSel.value === "daily";
        StokesPulse.qs("#maintenance-one-time-fields", root).hidden = isDaily;
        StokesPulse.qs("#maintenance-daily-fields", root).hidden = !isDaily;
      });

      StokesPulse.qs("#maintenance-form", root).addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const body = {
          label: form.label.value,
          device_id: form.device_id.value,
          type: form.type.value,
        };
        if (body.type === "one_time") {
          body.start = form.start.value;
          body.end = form.end.value;
        } else {
          body.start_time = form.start_time.value;
          body.end_time = form.end_time.value;
          body.days_of_week = [0, 1, 2, 3, 4, 5, 6];
        }
        await StokesPulse.fetchJSON("/api/maintenance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        MaintenanceTab.render(MaintenanceTab.root);
      });

      StokesPulse.qsa(".maint-delete", root).forEach((btn) =>
        btn.addEventListener("click", async () => {
          await fetch(`/api/maintenance/${btn.dataset.id}`, { method: "DELETE" });
          MaintenanceTab.render(MaintenanceTab.root);
        })
      );
    },
  };

  StokesPulse.registerTab("maintenance", MaintenanceTab);
})();
