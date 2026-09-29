import { act, render, waitFor } from "@testing-library/react";
import { cloneElement, type ReactElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChartSpec } from "../../../api/visualizations";
import { ThemeProvider, useTheme } from "../../../context/ThemeContext";
import ChartRenderer from "../ChartRenderer";

// ResponsiveContainer measures its parent, which jsdom lays out at 0×0, so the
// chart would never mount; hand it a fixed size instead.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 600, height: 320 }),
  };
});

const bar: ChartSpec = {
  chart_type: "bar",
  title: "count by kind",
  x_label: "kind",
  y_label: "count",
  series: [
    {
      name: "count",
      data: [
        { x: "a", y: 3 },
        { x: "b", y: 5 },
      ],
    },
  ],
};

const pie: ChartSpec = { ...bar, chart_type: "pie", title: "share by kind" };

/** Exposes the toggle so a test can flip the theme the way the navbar does. */
let toggle: () => void = () => {};
function ThemeProbe() {
  toggle = useTheme().toggleTheme;
  return null;
}

function renderWithTheme(spec: ChartSpec, theme: "light" | "dark") {
  localStorage.setItem("theme", theme);
  return render(
    <ThemeProvider>
      <ThemeProbe />
      <ChartRenderer spec={spec} />
    </ThemeProvider>,
  );
}

const chrome = (container: HTMLElement) => ({
  grid: container.querySelector(".recharts-cartesian-grid line")?.getAttribute("stroke"),
  axis: container.querySelector(".recharts-cartesian-axis-line")?.getAttribute("stroke"),
  tick: container.querySelector(".recharts-cartesian-axis-tick-value")?.getAttribute("fill"),
});

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("ChartRenderer theming", () => {
  it("draws grid, axes and ticks from the theme tokens under a dark ThemeProvider", () => {
    const { container } = renderWithTheme(bar, "dark");

    expect(document.documentElement).toHaveClass("dark");
    expect(chrome(container)).toEqual({
      grid: "var(--app-grid)",
      axis: "var(--app-border)",
      tick: "var(--app-muted-foreground)",
    });
    // Recharts paints the tooltip box white by default; it has to follow the
    // elevated surface and foreground tokens instead.
    const tooltip = container.querySelector(".recharts-default-tooltip")?.getAttribute("style");
    expect(tooltip).toContain("background-color: var(--app-elevated)");
    expect(tooltip).toContain("border: 1px solid var(--app-border)");
    expect(tooltip).toContain("color: var(--app-foreground)");
  });

  it("separates pie slices with the surface colour rather than white", async () => {
    const { container } = renderWithTheme(pie, "dark");

    // Sectors mount once the entry animation starts.
    const slice = await waitFor(
      () => {
        const path = container.querySelector(".recharts-pie-sector path");
        expect(path).not.toBeNull();
        return path;
      },
      { timeout: 3000 },
    );
    expect(slice).toHaveAttribute("stroke", "var(--app-surface)");
  });

  it("restyles an open chart through the toggle without rerendering its colours", () => {
    const { container } = renderWithTheme(bar, "light");
    const before = chrome(container);
    expect(document.documentElement).not.toHaveClass("dark");

    act(() => toggle());

    // The chart keeps pointing at the same tokens; the `.dark` class flips
    // what they resolve to, so nothing in the SVG needs to change.
    expect(document.documentElement).toHaveClass("dark");
    expect(chrome(container)).toEqual(before);
  });
});
