(function () {
  const COL_WIDTH = 170;
  const ROW_HEIGHT = 64;
  const COL_X0 = 90;
  const ROW_Y0 = 46;

  function buildLayout(devices, groupsOrder) {
    const byGroup = {};
    devices.forEach((d) => {
      (byGroup[d.group] = byGroup[d.group] || []).push(d);
    });
    const columns = groupsOrder.filter((g) => byGroup[g] && byGroup[g].length);
    const positions = {};
    let maxRows = 1;
    columns.forEach((g, ci) => {
      byGroup[g].forEach((d, ri) => {
        positions[d.id] = { x: COL_X0 + ci * COL_WIDTH, y: ROW_Y0 + ri * ROW_HEIGHT, device: d };
        maxRows = Math.max(maxRows, ri + 1);
      });
    });
    return { columns, byGroup, positions, width: COL_X0 + columns.length * COL_WIDTH, height: ROW_Y0 + maxRows * ROW_HEIGHT + 20 };
  }

  function nodeSvg(pos) {
    const d = pos.device;
    const sub = d.ip;
    return `
      <g class="topo-node status-${d.status}" transform="translate(${pos.x},${pos.y})">
        <circle r="9"></circle>
        <text x="14" y="4">${StokesPulse.escapeHtml(d.name)}</text>
        <text class="sub" x="14" y="15">${StokesPulse.escapeHtml(sub)}</text>
      </g>`;
  }

  function linkPath(p1, p2) {
    const midx = (p1.x + p2.x) / 2;
    return `M${p1.x},${p1.y} C${midx},${p1.y} ${midx},${p2.y} ${p2.x},${p2.y}`;
  }

  function linksSvg(positions) {
    let out = "";
    Object.values(positions).forEach((pos) => {
      const parentId = pos.device.depends_on;
      const parentPos = parentId && positions[parentId];
      if (!parentPos) return;
      const path = linkPath(parentPos, pos);
      const status = pos.device.status;
      out += `<path class="topo-link status-${status}" d="${path}"></path>`;
      if (status !== "down") {
        out += `<path class="topo-flow" d="${path}"></path>`;
      }
    });
    return out;
  }

  function zoneLabelsSvg(columns) {
    return columns
      .map((g, ci) => `<text class="topo-zone-label" x="${COL_X0 + ci * COL_WIDTH - 10}" y="16">${StokesPulse.escapeHtml(g)}</text>`)
      .join("");
  }

  const TopologyTab = {
    refreshMs: 15000,
    root: null,
    async render(root) {
      this.root = root;
      const data = await StokesPulse.fetchJSON("/api/topology");
      if (!data.devices.length) {
        root.innerHTML = '<div class="empty-state">No devices configured.</div>';
        return;
      }
      const layout = buildLayout(data.devices, data.groups_order);
      const svg = `
        <div class="topology-wrap">
          <svg viewBox="0 0 ${layout.width} ${layout.height}" width="100%" height="${layout.height}" preserveAspectRatio="xMinYMin meet">
            ${zoneLabelsSvg(layout.columns)}
            ${linksSvg(layout.positions)}
            ${Object.values(layout.positions).map(nodeSvg).join("")}
          </svg>
        </div>`;
      root.innerHTML = svg;
    },
  };

  StokesPulse.registerTab("topology", TopologyTab);
})();
