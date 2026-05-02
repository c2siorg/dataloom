import { createContext, useContext } from "react";

export const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);