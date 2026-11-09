/* Runs before the first paint: picks the theme so the page never flashes the wrong one. */
(function () {
  try {
    var saved = localStorage.getItem('atlas-admin-theme');
    var theme = saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeChoice = saved || 'system';
  } catch {
    document.documentElement.dataset.theme = 'dark';
  }
})();
