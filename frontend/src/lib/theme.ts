// Theme toggle. index.html applies the stored or OS theme before first paint; storage may be blocked.
export type Theme = "dark" | "light";

export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  try {
    window.localStorage.setItem("casecheck-theme", theme);
  } catch {
    /* private mode or blocked storage: the choice lasts for this page only */
  }
  window.dispatchEvent(new CustomEvent("casecheck-theme", { detail: theme }));
}

export const toggleTheme = () => setTheme(currentTheme() === "dark" ? "light" : "dark");
