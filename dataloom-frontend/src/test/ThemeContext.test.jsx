import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { applyTheme, getInitialTheme } from "../utils/theme";

vi.mock("../utils/theme", () => ({
  applyTheme: vi.fn(),
  getInitialTheme: vi.fn(),
}));

describe("ThemeContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInitialTheme.mockReturnValue("light");
  });

  it("starts with the initial theme", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });

    expect(result.current.theme).toBe("light");
    expect(result.current.isDarkMode).toBe(false);
  });

  it("applies the initial theme on mount", () => {
    renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });

    expect(applyTheme).toHaveBeenCalledTimes(1);
    expect(applyTheme).toHaveBeenCalledWith("light");
  });

  it("starts in dark mode when the initial theme is dark", () => {
    getInitialTheme.mockReturnValue("dark");

    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });

    expect(result.current.theme).toBe("dark");
    expect(result.current.isDarkMode).toBe(true);
    expect(applyTheme).toHaveBeenCalledWith("dark");
  });

  it("toggleTheme changes light mode to dark mode", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("dark");
    expect(result.current.isDarkMode).toBe(true);
    expect(applyTheme).toHaveBeenLastCalledWith("dark");
  });

  it("toggleTheme changes dark mode to light mode", () => {
    getInitialTheme.mockReturnValue("dark");

    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
    expect(result.current.isDarkMode).toBe(false);
    expect(applyTheme).toHaveBeenLastCalledWith("light");
  });

  it("allows the theme to be changed directly with setTheme", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });

    act(() => {
      result.current.setTheme("dark");
    });

    expect(result.current.theme).toBe("dark");
    expect(result.current.isDarkMode).toBe(true);
    expect(applyTheme).toHaveBeenLastCalledWith("dark");
  });

  it("throws when useTheme is used outside ThemeProvider", () => {
    expect(() => renderHook(() => useTheme())).toThrow(
      "useTheme must be used inside ThemeProvider",
    );
  });
});
