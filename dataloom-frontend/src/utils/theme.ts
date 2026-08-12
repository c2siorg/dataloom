const THEME_STORAGE_KEY = "theme";

/** The two colour schemes the app supports. */
export type Theme = "light" | "dark";

export const getInitialTheme = (): Theme => {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  const prefersDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;

  return prefersDarkMode ? "dark" : "light";
};

export const applyTheme = (theme: Theme) => {
  const root = document.documentElement;

  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  root.style.colorScheme = theme;

  localStorage.setItem(THEME_STORAGE_KEY, theme);
};
