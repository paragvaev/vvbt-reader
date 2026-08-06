export const READER_THEME_KEY = "vvbt-reader-theme";

export function resolveTheme(stored, prefersDark) {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}

export function nextTheme(current) {
  return current === "dark" ? "light" : "dark";
}

export function installThemeToggle() {
  const media = matchMedia("(prefers-color-scheme: dark)");
  let stored = null;
  try { stored = localStorage.getItem(READER_THEME_KEY); } catch {}
  let theme = resolveTheme(stored, media.matches);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "theme-toggle";
  const glyph = document.createElement("span");
  glyph.className = "theme-glyph";
  glyph.setAttribute("aria-hidden", "true");
  button.append(glyph);
  document.body.append(button);

  const apply = value => {
    theme = value;
    document.documentElement.dataset.theme = value;
    const target = nextTheme(value);
    glyph.textContent = target === "dark" ? "☾" : "☀︎";
    button.setAttribute("aria-label", target === "dark" ? "Включить тёмную тему" : "Включить светлую тему");
    button.title = button.getAttribute("aria-label");
  };

  apply(theme);
  button.addEventListener("click", () => {
    const value = nextTheme(theme);
    try { localStorage.setItem(READER_THEME_KEY, value); } catch {}
    apply(value);
  });
  media.addEventListener?.("change", event => {
    let preference = null;
    try { preference = localStorage.getItem(READER_THEME_KEY); } catch {}
    if (!preference) apply(resolveTheme(null, event.matches));
  });
}
