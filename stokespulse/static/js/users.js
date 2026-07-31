(function () {
  function roleSelect(username, role, disabled) {
    return `<select class="user-role" data-username="${StokesPulse.escapeHtml(username)}" data-prev="${role}" ${disabled ? "disabled" : ""}>
      <option value="user" ${role === "user" ? "selected" : ""}>User</option>
      <option value="admin" ${role === "admin" ? "selected" : ""}>Admin</option>
    </select>`;
  }

  const UsersTab = {
    root: null,
    async render(root) {
      this.root = root;
      const data = await StokesPulse.fetchJSON("/api/users");
      const currentUser = data.current_user;
      const adminCount = data.users.filter((u) => u.role === "admin").length;

      const rows = data.users
        .map((u) => {
          const isYou = u.username === currentUser;
          const created = new Date(u.created_at * 1000).toLocaleDateString();
          const isLastAdmin = u.role === "admin" && adminCount <= 1;
          return `<tr>
            <td>${StokesPulse.escapeHtml(u.username)}${isYou ? ' <span style="color:var(--text-dim)">(you)</span>' : ""}</td>
            <td>${roleSelect(u.username, u.role, isLastAdmin)}</td>
            <td>${created}</td>
            <td><button class="btn secondary user-delete" data-username="${StokesPulse.escapeHtml(u.username)}" ${data.users.length <= 1 ? "disabled" : ""}>Remove</button></td>
          </tr>`;
        })
        .join("");

      root.innerHTML = `
        <div class="panel">
          <h2>Add a user</h2>
          <form id="add-user-form">
            <div class="form-row"><label>Username</label><input type="text" name="username" required></div>
            <div class="form-row"><label>Password (min 8 characters)</label><input type="password" name="password" minlength="8" required></div>
            <div class="form-row"><label>Confirm password</label><input type="password" name="confirm" minlength="8" required></div>
            <div class="form-row"><label>Role</label>
              <select name="role">
                <option value="user" selected>User — dashboard/analytics only, no Maintenance/Settings/Users</option>
                <option value="admin">Admin — full access</option>
              </select>
            </div>
            <button class="btn" type="submit">Add user</button>
            <span id="user-form-status" style="margin-left:10px;font-size:12px;color:var(--down)"></span>
          </form>
        </div>
        <div class="panel">
          <h2>Existing users</h2>
          <table class="data-table">
            <thead><tr><th>Username</th><th>Role</th><th>Created</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;

      StokesPulse.qs("#add-user-form", root).addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const statusEl = StokesPulse.qs("#user-form-status", root);
        if (form.password.value !== form.confirm.value) {
          statusEl.textContent = "Passwords do not match.";
          return;
        }
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: form.username.value, password: form.password.value, role: form.role.value }),
        });
        const body = await res.json();
        if (!res.ok) {
          statusEl.textContent = body.error || "Failed to add user.";
          return;
        }
        UsersTab.render(UsersTab.root);
      });

      StokesPulse.qsa(".user-delete", root).forEach((btn) =>
        btn.addEventListener("click", async () => {
          const username = btn.dataset.username;
          const res = await fetch(`/api/users/${encodeURIComponent(username)}`, { method: "DELETE" });
          const body = await res.json();
          if (!res.ok) {
            alert(body.error || "Failed to remove user.");
            return;
          }
          if (username === currentUser) {
            window.location.href = "/login";
            return;
          }
          UsersTab.render(UsersTab.root);
        })
      );

      StokesPulse.qsa(".user-role", root).forEach((sel) =>
        sel.addEventListener("change", async () => {
          const username = sel.dataset.username;
          const newRole = sel.value;
          const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
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
          if (username === currentUser && newRole !== "admin") {
            window.location.href = "/";
            return;
          }
          UsersTab.render(UsersTab.root);
        })
      );
    },
  };

  StokesPulse.registerTab("users", UsersTab);
})();
