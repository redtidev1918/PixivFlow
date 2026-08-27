/* PixivFlow 文档站 · 主题切换(无依赖) */
(function () {
  var KEY = "pf-theme";

  function current() {
    if (localStorage.getItem(KEY)) return localStorage.getItem(KEY);
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelectorAll(".js-theme-toggle").forEach(function (btn) {
      btn.textContent = theme === "dark" ? "☀️" : "🌙";
      btn.title = theme === "dark" ? "切换到浅色" : "切换到深色";
      btn.setAttribute("aria-label", btn.title);
    });
  }

  // 提前执行,避免首屏闪烁:head 中已同步调用
  apply(current());

  function bind() {
    document.querySelectorAll(".js-theme-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        localStorage.setItem(KEY, next);
        apply(next);
      });
    });
    // 当前页导航高亮
    var path = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-links a").forEach(function (a) {
      if (a.getAttribute("href") === path) a.classList.add("active");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
