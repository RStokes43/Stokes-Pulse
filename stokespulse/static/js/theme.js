(function () {
  const STORAGE_KEY = "stokespulse-theme";
  const THEMES = [
    { id: "midnight-violet", name: "Midnight Violet", swatch: "#8b7bf0" },
    { id: "cyan-current", name: "Cyan Current", swatch: "#22d3ee" },
    { id: "amber-console", name: "Amber Console", swatch: "#f59e0b" },
    { id: "matrix-green", name: "Matrix Green", swatch: "#34d399" },
    { id: "crimson", name: "Crimson", swatch: "#fb7185" },
  ];

  function current() {
    return localStorage.getItem(STORAGE_KEY) || "midnight-violet";
  }

  function apply(id) {
    document.documentElement.setAttribute("data-theme", id);
  }

  function init() {
    apply(current());

    const btn = document.getElementById("theme-btn");
    const popover = document.getElementById("theme-popover");
    if (!btn || !popover) return;

    function renderOptions() {
      popover.innerHTML = THEMES.map(
        (t) => `<button class="theme-option ${t.id === current() ? "active" : ""}" data-theme-id="${t.id}">
          <span class="theme-swatch" style="background:${t.swatch}"></span>${t.name}
        </button>`
      ).join("");
      popover.querySelectorAll(".theme-option").forEach((opt) => {
        opt.addEventListener("click", () => {
          localStorage.setItem(STORAGE_KEY, opt.dataset.themeId);
          apply(opt.dataset.themeId);
          renderOptions();
          popover.hidden = true;
        });
      });
    }
    renderOptions();

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      popover.hidden = !popover.hidden;
    });
    popover.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => {
      popover.hidden = true;
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
