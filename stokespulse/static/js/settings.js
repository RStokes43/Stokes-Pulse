(function () {
  const SettingsTab = {
    root: null,
    async render(root) {
      this.root = root;
      const cfg = await StokesPulse.fetchJSON("/api/settings");
      const oauthCfg = await StokesPulse.fetchJSON("/api/settings/oauth");
      root.innerHTML = `
        <div class="panel">
          <h2>Google Sign-In</h2>
          <div style="color:var(--text-dim);font-size:12px;margin-bottom:10px">
            From a Google Cloud OAuth 2.0 "Web application" client, with redirect URI
            <code>https://pulse.stokescloud.net/auth/google/callback</code>. Only needed for
            sign-in from outside the home LAN — LAN clients never see this.
          </div>
          <form id="oauth-form">
            <div class="form-row"><label>Client ID</label><input type="text" name="client_id" value="${StokesPulse.escapeHtml(oauthCfg.client_id || "")}" autocomplete="off"></div>
            <div class="form-row">
              <label>Client secret ${oauthCfg.has_client_secret ? '<span style="color:var(--text-dim)">(set — leave blank to keep)</span>' : ""}</label>
              <input type="password" name="client_secret" placeholder="${oauthCfg.has_client_secret ? "••••••••" : ""}" autocomplete="new-password">
            </div>
            <button class="btn" type="submit">Save Google Sign-In settings</button>
            <span id="oauth-status" style="margin-left:10px;font-size:12px;color:var(--text-dim)"></span>
          </form>
        </div>
        <div class="panel">
          <h2>Alerting — SMTP</h2>
          <form id="settings-form">
            <div class="form-row"><label>SMTP Host</label><input type="text" name="smtp_host" value="${StokesPulse.escapeHtml(cfg.smtp_host || "")}"></div>
            <div class="form-row"><label>SMTP Port</label><input type="number" name="smtp_port" value="${cfg.smtp_port || 587}"></div>
            <div class="form-row"><label>Security</label>
              <select name="smtp_security">
                <option value="none" ${cfg.smtp_security === "none" ? "selected" : ""}>None</option>
                <option value="starttls" ${cfg.smtp_security === "starttls" ? "selected" : ""}>STARTTLS</option>
                <option value="ssl" ${cfg.smtp_security === "ssl" ? "selected" : ""}>SSL</option>
              </select>
            </div>
            <div class="form-row"><label>Username</label><input type="text" name="smtp_user" value="${StokesPulse.escapeHtml(cfg.smtp_user || "")}"></div>
            <div class="form-row">
              <label>Password ${cfg.has_password ? '<span style="color:var(--text-dim)">(set — leave blank to keep)</span>' : ""}</label>
              <input type="password" name="smtp_password" placeholder="${cfg.has_password ? "••••••••" : ""}" autocomplete="new-password">
            </div>
            <div class="form-row"><label>From address</label><input type="text" name="smtp_from" value="${StokesPulse.escapeHtml(cfg.smtp_from || "")}"></div>
            <div class="form-row"><label>Recipients (comma-separated)</label><input type="text" name="recipients" value="${StokesPulse.escapeHtml((cfg.recipients || []).join(", "))}"></div>
            <div class="form-row"><label><input type="checkbox" name="send_recovery_emails" ${cfg.send_recovery_emails ? "checked" : ""}> Send recovery emails</label></div>
            <div class="form-row"><label>Heartbeat URL (healthchecks.io)</label><input type="text" name="heartbeat_url" value="${StokesPulse.escapeHtml(cfg.heartbeat_url || "")}"></div>
            <button class="btn" type="submit">Save settings</button>
            <button class="btn secondary" type="button" id="test-email-btn">Send test email</button>
            <span id="settings-status" style="margin-left:10px;font-size:12px;color:var(--text-dim)"></span>
          </form>
        </div>`;

      StokesPulse.qs("#settings-form", root).addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const body = {
          smtp_host: form.smtp_host.value,
          smtp_port: parseInt(form.smtp_port.value, 10) || 587,
          smtp_security: form.smtp_security.value,
          smtp_user: form.smtp_user.value,
          smtp_password: form.smtp_password.value,
          smtp_from: form.smtp_from.value,
          recipients: form.recipients.value.split(",").map((s) => s.trim()).filter(Boolean),
          send_recovery_emails: form.send_recovery_emails.checked,
          heartbeat_url: form.heartbeat_url.value,
        };
        await StokesPulse.fetchJSON("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        StokesPulse.qs("#settings-status", SettingsTab.root).textContent = "Saved.";
        SettingsTab.render(SettingsTab.root);
      });

      StokesPulse.qs("#test-email-btn", root).addEventListener("click", async () => {
        const statusEl = StokesPulse.qs("#settings-status", root);
        statusEl.textContent = "Sending…";
        const res = await StokesPulse.fetchJSON("/api/settings/test-email", { method: "POST" });
        statusEl.textContent = res.success ? "Test email sent!" : "Failed to send — check SMTP settings.";
      });

      StokesPulse.qs("#oauth-form", root).addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        await StokesPulse.fetchJSON("/api/settings/oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: form.client_id.value,
            client_secret: form.client_secret.value,
          }),
        });
        StokesPulse.qs("#oauth-status", SettingsTab.root).textContent = "Saved.";
        SettingsTab.render(SettingsTab.root);
      });
    },
  };

  StokesPulse.registerTab("settings", SettingsTab);
})();
