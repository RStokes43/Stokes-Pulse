(function () {
  function renderNode(n, byId) {
    const childrenHtml = n.children.length
      ? `<ul>${n.children.map((cid) => renderNode(byId[cid], byId)).join("")}</ul>`
      : "";
    const rootCauseName = n.root_cause && byId[n.root_cause] ? byId[n.root_cause].name : n.root_cause;
    const impactedNote = n.impacted
      ? ` <span style="color:var(--degraded)">— alert suppressed, root cause: ${StokesPulse.escapeHtml(rootCauseName)}</span>`
      : "";
    return `<li><div class="impact-node ${n.impacted ? "impacted" : ""}">${StokesPulse.statusBadge(n.status)} <strong>${StokesPulse.escapeHtml(n.name)}</strong>${impactedNote}</div>${childrenHtml}</li>`;
  }

  const ImpactTab = {
    refreshMs: 20000,
    async render(root) {
      const data = await StokesPulse.fetchJSON("/api/impact");
      const byId = {};
      data.nodes.forEach((n) => (byId[n.id] = n));
      const roots = data.nodes.filter((n) => !n.depends_on || !byId[n.depends_on]);
      root.innerHTML = `<div class="panel"><h2>Impact / Blast Radius</h2>
        <p style="color:var(--text-dim);font-size:12px;margin-top:-4px">If a node fails, everything beneath it is shown as impacted and its own alert is auto-suppressed (the parent's alert is the one that fires).</p>
        <ul class="impact-tree">${roots.map((n) => renderNode(n, byId)).join("")}</ul></div>`;
    },
  };

  StokesPulse.registerTab("impact", ImpactTab);
})();
