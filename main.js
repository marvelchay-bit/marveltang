(() => {
  const root = document.documentElement;
  const $ = (s) => document.querySelector(s);

  /* Theme: system -> light -> dark, remembered between visits */
  const modes = ["system", "light", "dark"], btn = $("#theme");
  const saved = () => { try { return localStorage.getItem("theme") || "system"; } catch (e) { return "system"; } };
  function apply(m) {
    m === "system" ? root.removeAttribute("data-theme") : root.setAttribute("data-theme", m);
    btn.firstElementChild.textContent = m;
    btn.setAttribute("aria-label", "Theme: " + m + ". Click to change.");
  }
  apply(saved());
  btn.addEventListener("click", () => {
    const next = modes[(modes.indexOf(saved()) + 1) % modes.length];
    try { next === "system" ? localStorage.removeItem("theme") : localStorage.setItem("theme", next); } catch (e) {}
    apply(next);
  });

  /* Mobile menu */
  const burger = $("#burger"), menu = $("#menu");
  burger.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    burger.setAttribute("aria-expanded", open);
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
  menu.addEventListener("click", (e) => { if (e.target.tagName === "A") menu.classList.remove("open"); });

  /* Concept switcher (delete this block and the .dev markup once you pick) */
  document.querySelectorAll(".dev button").forEach((b) =>
    b.addEventListener("click", () => root.setAttribute("data-concept", b.dataset.c)));

  /* Newsletter: honest placeholder until the Kit form URL is added in Phase 7 */
  const form = $("#signup"), msg = $("#msg");
  form.addEventListener("submit", (e) => {
    if (form.getAttribute("action") === "#") {
      e.preventDefault();
      msg.textContent = "The newsletter is not connected yet. Nothing was sent.";
    }
  });

  $("#yr").textContent = new Date().getFullYear();
})();
