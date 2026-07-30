const StokesPulse = (function () {
  const tabs = {};
  let activeTab = "dashboard";

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
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
  }

  function openModal(id) { qs(`#${id}`).hidden = false; }
  function closeModal(id) { qs(`#${id}`).hidden = true; }

  async function refreshHeader() {
    try {
      const data = await fetchJSON("/api/devices");
      const devices = data.devices;
      const counts = { up: 0, degraded: 0, down: 0 };
      devices.forEach((d) => { counts[d.status] = (counts[d.status] || 0) + 1; });
      const worst = devices.reduce((acc, d) => (statusRank(d.status) > statusRank(acc) ? d.status : acc), "up");

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

      qs("#summary-content").innerHTML = `
        <div class="summary-row"><span>Up</span><span class="n" style="color:var(--up)">${counts.up || 0}</span></div>
        <div class="summary-row"><span>Degraded</span><span class="n" style="color:var(--degraded)">${counts.degraded || 0}</span></div>
        <div class="summary-row"><span>Down</span><span class="n" style="color:var(--down)">${counts.down || 0}</span></div>
        <div class="summary-row"><span>Total</span><span class="n">${devices.length}</span></div>
      `;
    } catch (e) {
      console.error("header refresh failed", e);
    }
  }

  async function loadMeta() {
    try {
      const meta = await fetchJSON("/api/meta");
      qs("#version-badge").textContent = "v" + meta.version;
    } catch (e) {
      console.error(e);
    }
  }

  function wireNav() {
    qsa(".nav-fn").forEach((b) => b.addEventListener("click", () => showFunction(b.dataset.function)));
    qsa(".nav-tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
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

    qs("#version-badge").addEventListener("click", async () => {
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
