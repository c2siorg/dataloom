import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChartBuilderPanel from "../ChartBuilderPanel";

const columns = ["region", "revenue", "cost"];
const dtypes = { region: "str", revenue: "int", cost: "float" };

const renderChart = vi.fn();
const showHeatmap = vi.fn();

// ChartBuilderPanel reads columns/dtypes from ProjectContext and drives the shared
// chart view; mock both so the panel can be rendered in isolation.
vi.mock("../../../context/ProjectContext", () => ({
  useProjectContext: () => ({ columns, dtypes }),
}));
vi.mock("../../../context/ChartViewContext", () => ({
  useChartView: () => ({ renderChart, showHeatmap }),
}));

beforeEach(() => {
  renderChart.mockReset();
  showHeatmap.mockReset();
});

function renderPanel() {
  render(<ChartBuilderPanel onClose={vi.fn()} />);
}

const renderButton = () => screen.getByRole("button", { name: "Render" });

/** Open the popover trigger with the given testid and click an option by name.
 * Scopes to the open panel: a just-closed popover lingers in the DOM. */
function pick(testid: string, name: RegExp | string) {
  fireEvent.click(screen.getByTestId(testid));
  const panel = document.querySelector('[data-state="open"]') as HTMLElement;
  fireEvent.click(within(panel).getByRole("option", { name }));
}

describe("ChartBuilderPanel", () => {
  it("disables Render until a valid configuration is chosen", () => {
    renderPanel();
    // Histogram is the default and starts with no column selected.
    expect(renderButton()).toBeDisabled();

    pick("histogram-column", /revenue/);
    expect(renderButton()).toBeEnabled();

    fireEvent.click(renderButton());
    expect(renderChart).toHaveBeenCalledWith({
      chart_type: "histogram",
      column: "revenue",
      bins: 20,
    });
  });

  it("offers only numeric columns for a histogram", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("histogram-column"));
    const names = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toHaveLength(2);
    expect(names!.join(" ")).toContain("revenue");
    expect(names!.join(" ")).toContain("cost");
    expect(names!.join(" ")).not.toContain("region");
  });

  it("disables the value field when the bar aggregation is count", () => {
    renderPanel();
    pick("chart-type-select", "Bar");

    pick("agg-select", "Count");
    expect(screen.getByTestId("value-select")).toBeDisabled();
    // Category alone is enough for a count bar chart.
    pick("category-select", /region/);
    expect(renderButton()).toBeEnabled();

    pick("agg-select", "Sum");
    // Sum needs a value column, so Render is blocked again until one is picked.
    expect(screen.getByTestId("value-select")).toBeEnabled();
    expect(renderButton()).toBeDisabled();
  });

  it("requires both axes for a scatter plot", () => {
    renderPanel();
    pick("chart-type-select", "Scatter");

    pick("x-select", /revenue/);
    expect(renderButton()).toBeDisabled();
    pick("y-select", /cost/);
    expect(renderButton()).toBeEnabled();

    fireEvent.click(renderButton());
    expect(renderChart).toHaveBeenCalledWith({
      chart_type: "scatter",
      x: "revenue",
      y: ["cost"],
      color: undefined,
    });
  });

  it("routes the correlation heatmap to showHeatmap with no field selectors", () => {
    renderPanel();
    pick("chart-type-select", "Correlation heatmap");

    expect(screen.queryByTestId("x-select")).not.toBeInTheDocument();
    expect(renderButton()).toBeEnabled();

    fireEvent.click(renderButton());
    expect(showHeatmap).toHaveBeenCalledOnce();
    expect(renderChart).not.toHaveBeenCalled();
  });
});
