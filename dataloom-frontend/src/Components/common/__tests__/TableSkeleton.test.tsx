import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import TableSkeleton from "../TableSkeleton";

const nameHeaderCells = (container: HTMLElement) =>
  container.querySelectorAll("thead tr:first-child th");

describe("TableSkeleton", () => {
  it("applies the pulse animation", () => {
    render(<TableSkeleton />);

    expect(screen.getByTestId("data-table-skeleton")).toHaveClass("animate-pulse");
  });

  it("is hidden from assistive technology", () => {
    render(<TableSkeleton />);

    expect(screen.getByTestId("data-table-skeleton")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders two header rows", () => {
    const { container } = render(<TableSkeleton />);

    expect(container.querySelectorAll("thead tr")).toHaveLength(2);
  });

  it("renders a third header row when column profiles are shown", () => {
    const { container } = render(<TableSkeleton showColumnProfiles />);

    expect(container.querySelectorAll("thead tr")).toHaveLength(3);
  });

  it("renders the requested data columns plus the S.No. column", () => {
    const { container } = render(<TableSkeleton columnCount={3} />);

    expect(nameHeaderCells(container)).toHaveLength(4);
  });

  it("renders body cells for every column", () => {
    const { container } = render(<TableSkeleton columnCount={12} />);

    expect(nameHeaderCells(container)).toHaveLength(13);
    container.querySelectorAll("tbody tr").forEach((row) => {
      expect(row.querySelectorAll("td")).toHaveLength(13);
    });
  });

  it("falls back to a default column count when given zero", () => {
    const { container } = render(<TableSkeleton columnCount={0} />);

    expect(nameHeaderCells(container).length).toBeGreaterThan(1);
  });

  it("renders the requested number of body rows", () => {
    const { container } = render(<TableSkeleton rowCount={7} />);

    expect(container.querySelectorAll("tbody tr")).toHaveLength(7);
  });

  it("matches the row heights of the real grid", () => {
    const { container } = render(<TableSkeleton columnCount={2} rowCount={1} />);

    expect(nameHeaderCells(container)[0]).toHaveClass("h-6");
    expect(container.querySelectorAll("thead tr:last-child th")[0]).toHaveClass("h-5");
    expect(container.querySelectorAll("tbody td")[0]).toHaveClass("h-6");
  });
});
