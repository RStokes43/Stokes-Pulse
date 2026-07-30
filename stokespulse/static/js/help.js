(function () {
  window.HelpTab = {
    render(container) {
      container.innerHTML = `
        <h3>Dashboard</h3>
        <p>Live status cards for every monitored device, grouped by category. Dot color = current status, the sparkline is recent latency, badges show which configured ports are open/closed, and the bell mutes alerts for just that device.</p>
        <h3>Topology</h3>
        <p>A zoned map (Internet → VPN → Firewall → Network → LAN) showing how everything connects, built from each device's "depends on" relationship. Animated flow lines mean that link is currently healthy; a red link means that path is down.</p>
        <h3>Analytics</h3>
        <p>Latency-over-time chart plus uptime %, average/p95 latency, incident counts, and MTTR (mean time to recovery) computed from up to 30 days of history. The leaderboard highlights your worst-behaving devices for the selected range.</p>
        <h3>Event Log</h3>
        <p>Every down/recovery/security (port-drift) event with start/end time, duration, and whether an alert was actually sent, suppressed (root-cause), muted, or held back by a maintenance window.</p>
        <h3>Impact</h3>
        <p>Shows the dependency tree from each device's "depends_on" field. If a parent (e.g. a switch or a Proxmox host) goes down, its children are marked impacted and their own alerts are automatically suppressed — you get one root-cause email, not ten.</p>
        <h3>Maintenance</h3>
        <p>Schedule one-time or recurring daily quiet windows so planned work doesn't trigger alerts or clutter the event log.</p>
        <h3>Settings</h3>
        <p>Configure SMTP for email alerts, recovery notifications, and an optional healthchecks.io heartbeat URL so you're told if Stokes-Pulse itself stops running. Your SMTP password is never sent back to the browser once saved — the field just shows whether one is set.</p>
        <h3>Version / changelog</h3>
        <p>The version badge in the header is your git commit count. Click it to see recent commit history.</p>
        <h3>Port-drift watch</h3>
        <p>Every 30 minutes, each device is scanned across a list of notable ports. If a new port opens that wasn't there before, you get an early-warning email — useful for catching services (or intrusions) you didn't expect.</p>
      `;
    },
  };
})();
