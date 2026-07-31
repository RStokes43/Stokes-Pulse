(function () {
  let currentView = "status";

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
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

  function cardHtml(d) {
    const latency = d.latency_ms == null ? "—" : `${Math.round(d.latency_ms)} ms`;
    const uptime = d.uptime_24h_pct == null ? "—" : `${d.uptime_24h_pct}%`;
    return `<div class="m-card status-${d.status}">
      <span class="dot status-${d.status}"></span>
      <div class="info">
        <div class="name">${escapeHtml(d.name)}</div>
        <div class="ip">${escapeHtml(d.ip)}</div>
      </div>
      <div class="metrics">
        <span class="latency">${latency}</span>
        <span>${uptime}</span>
      </div>
    </div>`;
  }

  async function renderStatus() {
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
      .map((g) => `<div class="m-group"><h2>${escapeHtml(g)}</h2>${groups[g].map(cardHtml).join("")}</div>`)
      .join("");

    document.getElementById("m-view-status").innerHTML = `
      <div class="m-hero">
        <div class="status-word ${worst}">${statusWord}</div>
        <div class="status-sub">${counts.up || 0}/${devices.length} up · ${now}</div>
      </div>
      ${groupsHtml || '<div class="m-empty">No devices configured.</div>'}
    `;
  }

  async function renderEvents() {
    const data = await fetchJSON("/api/events?limit=50");
    const root = document.getElementById("m-view-events");
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

  function refreshCurrent() {
    (currentView === "status" ? renderStatus() : renderEvents()).catch((e) => console.error("[mobile]", e));
  }

  document.querySelectorAll(".m-seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".m-seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
      currentView = btn.dataset.view;
      document.getElementById("m-view-status").hidden = currentView !== "status";
      document.getElementById("m-view-events").hidden = currentView !== "events";
      refreshCurrent();
    });
  });

  refreshCurrent();
  setInterval(refreshCurrent, 3000);
})();
