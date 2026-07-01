import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CorrelationHeatmap from "../CorrelationHeatmap";

/** Two correlated columns plus a third constant column (null diagonal). */
const withDeadColumn = {
  columns: ["a", "b", "dead"],
  matrix: [
    [1, 0.5, null],
    [0.5, 1, null],
    [null, null, null],
  ],
};

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
    render(
      <CorrelationHeatmap correlation={{ columns: ["a"], matrix: [[1]] }} />,
    );
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
});
