import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CorrelationHeatmap from "../CorrelationHeatmap";

// Rasterizing needs a real canvas, which jsdom does not provide; the export is
// mocked so the SVG handed to it can be inspected.
const downloadChartAsPng = vi.fn();
vi.mock("../../../utils/chartImage", () => ({
  downloadChartAsPng: (...args: unknown[]) => downloadChartAsPng(...args),
}));

/** Two correlated columns plus a third constant column (null diagonal). */
const withDeadColumn = {
  columns: ["a", "b", "dead"],
  matrix: [
    [1, 0.5, null],
    [0.5, 1, null],
    [null, null, null],
  ],
};

/** A strong negative, a moderate positive and a missing pair. */
const mixed = {
  columns: ["a", "b", "c"],
  matrix: [
    [1, -0.9, 0.5],
    [-0.9, 1, null],
    [0.5, null, 1],
  ],
};

const SURFACE = "var(--app-surface)";

beforeEach(() => {
  downloadChartAsPng.mockReset();
  downloadChartAsPng.mockResolvedValue(undefined);
});

describe("CorrelationHeatmap", () => {
  it("shows a loading state while the correlation is null", () => {
    render(<CorrelationHeatmap correlation={null} />);
    expect(screen.getByText("Loading correlation…")).toBeInTheDocument();
  });

  it("shows a retry affordance on error", () => {
    const onRetry = vi.fn();
    render(<CorrelationHeatmap correlation={null} error onRetry={onRetry} />);

    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("prompts for more numeric columns when fewer than two have variance", () => {
    render(<CorrelationHeatmap correlation={{ columns: ["a"], matrix: [[1]] }} />);
    expect(screen.getByText(/at least two numeric columns/i)).toBeInTheDocument();
    expect(screen.queryByTestId("highlights-list")).not.toBeInTheDocument();
  });

  it("defaults to the lower-triangular matrix grid", () => {
    render(<CorrelationHeatmap correlation={withDeadColumn} />);

    const table = screen.getByTestId("correlation-table");
    expect(within(table).getByText("0.5")).toBeInTheDocument();
    // The ranked highlights list is hidden until the user toggles to it.
    expect(screen.queryByTestId("highlights-list")).not.toBeInTheDocument();
  });

  it("shows a ranked highlights list with strength labels when toggled", () => {
    render(<CorrelationHeatmap correlation={withDeadColumn} />);

    fireEvent.click(screen.getByText("Highlights"));

    const list = screen.getByTestId("highlights-list");
    expect(within(list).getByText("0.5")).toBeInTheDocument();
    expect(within(list).getByText("moderate positive")).toBeInTheDocument();
  });

  it("excludes constant columns and names them", () => {
    render(<CorrelationHeatmap correlation={withDeadColumn} />);

    const note = screen.getByTestId("excluded-note");
    expect(note).toHaveTextContent("dead");
    expect(note).toHaveTextContent(/no variance/i);
  });

  it("renders a lower-triangular matrix with a muted diagonal", () => {
    render(<CorrelationHeatmap correlation={withDeadColumn} />);

    const table = screen.getByTestId("correlation-table");
    // Lower-triangle value present, dead column dropped from the grid entirely.
    expect(within(table).getByText("0.5")).toBeInTheDocument();
    expect(within(table).queryByText("dead")).not.toBeInTheDocument();
    // Two identity cells render a muted "1"; the redundant upper "0.5" is gone.
    expect(within(table).getAllByText("1")).toHaveLength(2);
    expect(within(table).getAllByText("0.5")).toHaveLength(1);
  });

  it("mixes cell fills toward the theme surface so the scale diverges in both themes", () => {
    render(<CorrelationHeatmap correlation={mixed} />);

    const table = screen.getByTestId("correlation-table");
    const strong = within(table).getByText("-0.9");
    const moderate = within(table).getByText("0.5");
    const missing = within(table).getByText("—");

    expect(strong).toHaveStyle({
      background: `color-mix(in srgb, rgb(37 99 235) 90.0%, ${SURFACE})`,
    });
    expect(strong).toHaveStyle({ color: "#ffffff" });
    expect(moderate).toHaveStyle({
      background: `color-mix(in srgb, rgb(220 38 38) 50.0%, ${SURFACE})`,
    });
    expect(moderate).toHaveStyle({ color: "var(--app-foreground)" });
    // Missing pairs and the legend follow the tokens too.
    expect(missing).toHaveClass("bg-surface-hover", "text-disabled-foreground");
    expect(missing).not.toHaveAttribute("style");
    expect(document.querySelector(".h-2.w-32")).toHaveStyle({
      background: `linear-gradient(to right, rgb(37,99,235), ${SURFACE}, rgb(220,38,38))`,
    });
  });

  it("colours highlight values with classes that carry a dark variant", () => {
    render(<CorrelationHeatmap correlation={mixed} />);
    fireEvent.click(screen.getByText("Highlights"));

    const list = screen.getByTestId("highlights-list");
    expect(within(list).getByText("-0.9")).toHaveClass("text-blue-600", "dark:text-blue-400");
    expect(within(list).getByText("0.5")).toHaveClass("text-red-600", "dark:text-red-400");
  });

  it("bakes the resolved dark tokens into the exported grid", async () => {
    const root = document.documentElement;
    root.style.setProperty("--app-surface", "#18181b");
    root.style.setProperty("--app-surface-hover", "#27272a");
    root.style.setProperty("--app-border", "#38383a");
    root.style.setProperty("--app-foreground", "#fafafa");
    root.style.setProperty("--app-muted-foreground", "#a1a1aa");
    root.style.setProperty("--app-disabled-foreground", "#71717a");
    render(<CorrelationHeatmap correlation={mixed} />);

    fireEvent.click(screen.getByRole("button", { name: /download image/i }));

    await waitFor(() => expect(downloadChartAsPng).toHaveBeenCalledOnce());
    const svg = downloadChartAsPng.mock.calls[0]![0] as SVGSVGElement;
    const rects = Array.from(svg.querySelectorAll("rect"));
    const fills = rects.map((rect) => rect.getAttribute("fill"));
    // Diagonal, the two pairs and the missing pair, in row order.
    expect(fills).toEqual([
      "#18181b",
      "color-mix(in srgb, rgb(37 99 235) 90.0%, #18181b)",
      "#18181b",
      "color-mix(in srgb, rgb(220 38 38) 50.0%, #18181b)",
      "#27272a",
      "#18181b",
    ]);
    expect(new Set(rects.map((rect) => rect.getAttribute("stroke")))).toEqual(new Set(["#38383a"]));
    const texts = Array.from(svg.querySelectorAll("text")).map((t) => [
      t.textContent,
      t.getAttribute("fill"),
    ]);
    expect(texts).toContainEqual(["-0.9", "#ffffff"]);
    expect(texts).toContainEqual(["0.5", "#fafafa"]);
    expect(texts).toContainEqual(["—", "#71717a"]);
    expect(texts).toContainEqual(["1", "#a1a1aa"]);
    root.removeAttribute("style");
  });
});
