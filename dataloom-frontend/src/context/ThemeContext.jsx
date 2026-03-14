import { createContext, useContext, useMemo } from "react";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // Light mode only - no dark mode switching
  const value = useMemo(() => ({ theme: "light", setTheme: () => {} }), []);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
