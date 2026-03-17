import { useContext } from "react";
import ThemeContext from "../context/ThemeContext";

/**
 * Convenience hook for consuming the theme context.
 * @returns {{ theme: 'light'|'dark'|'system', resolvedTheme: 'light'|'dark', setTheme: Function }}
 */
export default function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
