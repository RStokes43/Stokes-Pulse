const StokesPulse = (function () {
  const tabs = {};
  let activeTab = "dashboard";

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (res.status === 401) {
      window.location.href = "/login";
      throw new Error("session expired");
    }
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function statusBadge(status) {
    return `<span class="badge ${status}">${escapeHtml(status)}</span>`;
  }

  function registerTab(name, module) {
    tabs[name] = module;
  }

  function statusRank(s) {
    return { up: 0, degraded: 1, down: 2 }[s] ?? 0;
  }

  function showFunction(fn) {
    qsa(".nav-fn").forEach((b) => b.classList.toggle("active", b.dataset.function === fn));
    qsa(".subgroup").forEach((g) => (g.hidden = g.dataset.group !== fn));
    const group = qs(`.subgroup[data-group="${fn}"]`);
    const firstTab = group && group.querySelector(".nav-tab");
    if (firstTab) showTab(firstTab.dataset.tab);
  }

  function showTab(tabName) {
    const prev = tabs[activeTab];
    if (prev && prev._timer) {
      clearInterval(prev._timer);
      prev._timer = null;
    }
    if (prev && prev._sidebarTimer) {
      clearInterval(prev._sidebarTimer);
      prev._sidebarTimer = null;
    }
    activeTab = tabName;
    qsa(".nav-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabName));
    qsa(".tab-panel").forEach((p) => (p.hidden = p.id !== `tab-${tabName}`));

    const mod = tabs[tabName];
    if (!mod) return;
    const root = qs(`#${tabName}-root`);
    const run = () => Promise.resolve(mod.render(root)).catch((e) => console.error(`[${tabName}]`, e));
    run();
    if (mod.refreshMs) {
      mod._timer = setInterval(run, mod.refreshMs);
    }

    const sidebarRoot = qs("#summary-sidebar");
    const runSidebar = () =>
      Promise.resolve(mod.renderSidebar ? mod.renderSidebar(sidebarRoot) : defaultSidebar.render(sidebarRoot)).catch((e) =>
        console.error("[sidebar]", e)
      );
    runSidebar();
    mod._sidebarTimer = setInterval(runSidebar, mod.refreshMs || 15000);
  }

  function openModal(id) { qs(`#${id}`).hidden = false; }
  function closeModal(id) { qs(`#${id}`).hidden = true; }

  function countAndWorst(devices) {
    const counts = { up: 0, degraded: 0, down: 0 };
    devices.forEach((d) => { counts[d.status] = (counts[d.status] || 0) + 1; });
    const worst = devices.reduce((acc, d) => (statusRank(d.status) > statusRank(acc) ? d.status : acc), "up");
    return { counts, worst };
  }

  const defaultSidebar = {
    async render(container) {
      const data = await fetchJSON("/api/devices");
      const devices = data.devices;
      const { counts, worst } = countAndWorst(devices);
      const statusWord = worst === "up" ? "Healthy" : worst === "degraded" ? "Degraded" : "Down";
      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      const latencyRows = devices
        .map(
          (d) => `<div class="latency-row">
            <span class="status-dot status-${d.status}"></span>
            <span class="name">${escapeHtml(d.name)}</span>
            <span class="val">${d.latency_ms == null ? "—" : d.latency_ms.toFixed(1) + " ms"}</span>
          </div>`
        )
        .join("");

      container.innerHTML = `
        <div class="side-panel health-hero">
          <div class="hero-status ${worst}">${statusWord}</div>
          <div class="hero-sub">${counts.up || 0}/${devices.length} up · ${now}</div>
        </div>
        <div class="side-panel">
          <h3>Summary</h3>
          <div class="device-latency-list">${latencyRows}</div>
        </div>`;
    },
  };

  async function refreshHeader() {
    try {
      const data = await fetchJSON("/api/devices");
      const { counts, worst } = countAndWorst(data.devices);

      const dot = qs("#logo-dot circle");
      if (dot) {
        dot.style.fill = worst === "up" ? "var(--up)" : worst === "degraded" ? "var(--degraded)" : "var(--down)";
      }

      const banner = qs("#health-banner");
      banner.classList.remove("degraded", "down");
      if (worst === "up") banner.textContent = "All systems normal";
      else if (worst === "degraded") {
        banner.textContent = `${counts.degraded} device(s) degraded`;
        banner.classList.add("degraded");
      } else {
        banner.textContent = `${counts.down} device(s) DOWN`;
        banner.classList.add("down");
      }
    } catch (e) {
      console.error("header refresh failed", e);
    }
  }

  async function loadMeta() {
    try {
      const meta = await fetchJSON("/api/meta");
      qs("#changelog-fab").textContent = "v" + meta.version;
    } catch (e) {
      console.error(e);
    }
  }

  function wireNav() {
    qsa(".nav-fn").forEach((b) => b.addEventListener("click", () => showFunction(b.dataset.function)));
    qsa(".nav-tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
    qs("#health-banner").addEventListener("click", () => showFunction("insights"));
    qsa("[data-close-modal]").forEach((b) =>
      b.addEventListener("click", (e) => {
        const modal = e.target.closest(".modal");
        if (modal) modal.hidden = true;
      })
    );

    qs("#help-btn").addEventListener("click", () => {
      if (window.HelpTab) window.HelpTab.render(qs("#help-body"));
      openModal("help-modal");
    });

    qs("#changelog-fab").addEventListener("click", async () => {
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
          data.commits
            .map((c) => `<tr><td><code>${escapeHtml(c.hash)}</code></td><td>${escapeHtml(c.date)}</td><td>${escapeHtml(c.message)}</td></tr>`)
            .join("") +
          "</tbody></table>";
      } catch (e) {
        body.innerHTML = '<div class="empty-state">Failed to load changelog.</div>';
      }
    });
  }

  function init() {
    wireNav();
    loadMeta();
    refreshHeader();
    setInterval(refreshHeader, 15000);
    showTab("dashboard");
  }

  return {
    registerTab, fetchJSON, qs, qsa, showTab, showFunction,
    openModal, closeModal, escapeHtml, statusBadge, init,
  };
})();
