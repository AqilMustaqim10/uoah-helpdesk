// Runs BEFORE the page draws, so dark mode never flashes white.
// Uses the saved choice if there is one, otherwise the computer's own setting.
// This lives in its own file (not inside index.html) so the strict Content-Security-Policy can forbid inline scripts.
(function () {
  try {
    var saved = localStorage.getItem("theme");
    var dark = saved
      ? saved === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
