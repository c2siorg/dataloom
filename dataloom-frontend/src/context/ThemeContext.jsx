import { createContext, useState, useEffect, useCallback, useMemo } from "react";

const ThemeContext = createContext(undefined);

/**
 * Reads the saved theme preference from localStorage.
 * Falls back to "system" if nothing is stored or localStorage is unavailable.
 */
function getStoredTheme() {
  try {
    return localStorage.getItem("theme") || "system";
  } catch {
    return "system";
  }
}

/**
 * Applies or removes the "dark" class on <html> based on the given preference.
 */
function applyDarkClass(preference) {
  const isDark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  document.documentElement.classList.toggle("dark", isDark);
}

/**
 * Provides theme state (light / dark / system) to the application.
 * Persists the user's preference in localStorage and listens for
 * OS-level color-scheme changes when set to "system".
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeRaw] = useState(getStoredTheme);

  // Apply on every theme change
  useEffect(() => {
    applyDarkClass(theme);
  }, [theme]);

  // Listen for OS preference changes (only matters when theme === "system")
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      // Re-read current theme from state via the callback form
      setThemeRaw((current) => {
        if (current === "system") {
          applyDarkClass("system");
        }
        return current; // don't change state, just re-apply
      });
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback((newTheme) => {
    setThemeRaw(newTheme);
    try {
      localStorage.setItem("theme", newTheme);
    } catch {
      // localStorage may be unavailable
    }
  }, []);

  const resolvedTheme = useMemo(() => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme;
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export default ThemeContext;
