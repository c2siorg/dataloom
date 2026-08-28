import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import TableSkeleton from "../TableSkeleton";

describe("TableSkeleton", () => {
  it("renders successfully", () => {
    render(<TableSkeleton columnCount={3} rowCount={4} />);

    expect(screen.getByTestId("data-table-skeleton")).toBeInTheDocument();
  });

  it('exposes data-testid="data-table-skeleton"', () => {
    render(<TableSkeleton />);

    expect(screen.getByTestId("data-table-skeleton")).toBeInTheDocument();
  });

  it("renders S.No. plus the requested data columns", () => {
    const { container } = render(<TableSkeleton columnCount={3} rowCount={2} />);

    const nameHeaderCells = container.querySelectorAll("thead tr:first-child th");
    expect(nameHeaderCells).toHaveLength(4);
  });

  it("renders the requested number of body rows", () => {
    const { container } = render(<TableSkeleton columnCount={2} rowCount={7} />);

    expect(container.querySelectorAll("tbody tr")).toHaveLength(7);
  });

  it("falls back to a visible column set when columns are empty", () => {
    const { container } = render(<TableSkeleton columnCount={0} rowCount={3} />);

    const nameHeaderCells = container.querySelectorAll("thead tr:first-child th");
    expect(nameHeaderCells.length).toBeGreaterThan(1);
    expect(screen.getByTestId("data-table-skeleton")).toBeInTheDocument();
  });
});
