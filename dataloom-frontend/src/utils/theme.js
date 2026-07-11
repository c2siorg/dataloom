const THEME_STORAGE_KEY = "theme";

export const getInitialTheme = () => {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  const prefersDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;

  return prefersDarkMode ? "dark" : "light";
};

export const applyTheme = (theme) => {
  const root = document.documentElement;

  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  root.style.colorScheme = theme;

  localStorage.setItem(THEME_STORAGE_KEY, theme);
};
