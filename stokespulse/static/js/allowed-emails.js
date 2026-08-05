(function () {
  function roleSelect(email, role, disabled) {
    return `<select class="email-role" data-email="${StokesPulse.escapeHtml(email)}" data-prev="${role}" ${disabled ? "disabled" : ""}>
      <option value="user" ${role === "user" ? "selected" : ""}>User</option>
      <option value="admin" ${role === "admin" ? "selected" : ""}>Admin</option>
    </select>`;
  }

  const AllowedEmailsTab = {
    root: null,
    async render(root) {
      this.root = root;
      const data = await StokesPulse.fetchJSON("/api/allowed-emails");
      const currentUser = data.current_user;
      const adminCount = data.emails.filter((e) => e.role === "admin").length;

      const rows = data.emails
        .map((e) => {
          const isYou = e.email === currentUser;
          const added = new Date(e.added_at * 1000).toLocaleDateString();
          const isLastAdmin = e.role === "admin" && adminCount <= 1;
          return `<tr>
            <td>${StokesPulse.escapeHtml(e.email)}${isYou ? ' <span style="color:var(--text-dim)">(you)</span>' : ""}</td>
            <td>${roleSelect(e.email, e.role, isLastAdmin)}</td>
            <td>${added}</td>
            <td><button class="btn secondary email-delete" data-email="${StokesPulse.escapeHtml(e.email)}" ${data.emails.length <= 1 ? "disabled" : ""}>Remove</button></td>
          </tr>`;
        })
        .join("");

      root.innerHTML = `
        <div class="panel">
          <h2>Allow an email</h2>
          <div class="sub" style="color:var(--text-dim);font-size:12px;margin-bottom:10px">
            Anyone on the home LAN already has full access without signing in — this list only
            gates Google sign-in from outside the LAN. The email also needs to be added as a
            test user in the Google Cloud OAuth consent screen.
          </div>
          <form id="add-email-form">
            <div class="form-row"><label>Email</label><input type="email" name="email" required></div>
            <div class="form-row"><label>Role</label>
              <select name="role">
                <option value="user" selected>User — dashboard/analytics only, no Maintenance/Settings/Allowed Emails</option>
                <option value="admin">Admin — full access</option>
              </select>
            </div>
            <button class="btn" type="submit">Add email</button>
            <span id="email-form-status" style="margin-left:10px;font-size:12px;color:var(--down)"></span>
          </form>
        </div>
        <div class="panel">
          <h2>Allowed emails</h2>
          <table class="data-table">
            <thead><tr><th>Email</th><th>Role</th><th>Added</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;

      StokesPulse.qs("#add-email-form", root).addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const statusEl = StokesPulse.qs("#email-form-status", root);
        const res = await fetch("/api/allowed-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email.value, role: form.role.value }),
        });
        const body = await res.json();
        if (!res.ok) {
          statusEl.textContent = body.error || "Failed to add email.";
          return;
        }
        AllowedEmailsTab.render(AllowedEmailsTab.root);
      });

      StokesPulse.qsa(".email-delete", root).forEach((btn) =>
        btn.addEventListener("click", async () => {
          const email = btn.dataset.email;
          const res = await fetch(`/api/allowed-emails/${encodeURIComponent(email)}`, { method: "DELETE" });
          const body = await res.json();
          if (!res.ok) {
            alert(body.error || "Failed to remove email.");
            return;
          }
          if (email === currentUser) {
            window.location.href = "/login";
            return;
          }
          AllowedEmailsTab.render(AllowedEmailsTab.root);
        })
      );

      StokesPulse.qsa(".email-role", root).forEach((sel) =>
        sel.addEventListener("change", async () => {
          const email = sel.dataset.email;
          const newRole = sel.value;
          const res = await fetch(`/api/allowed-emails/${encodeURIComponent(email)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: newRole }),
          });
          const body = await res.json();
          if (!res.ok) {
            alert(body.error || "Failed to change role.");
            sel.value = sel.dataset.prev;
            return;
          }
          if (email === currentUser && newRole !== "admin") {
            window.location.href = "/";
            return;
          }
          AllowedEmailsTab.render(AllowedEmailsTab.root);
        })
      );
    },
  };

  StokesPulse.registerTab("allowed-emails", AllowedEmailsTab);
})();
