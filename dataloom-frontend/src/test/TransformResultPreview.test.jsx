import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TransformResultPreview from "../Components/forms/TransformResultPreview";
import FilterForm from "../Components/forms/FilterForm";
import { transformProject } from "../api";

vi.mock("../api", () => ({
  transformProject: vi.fn(),
}));

const mockContext = {
  columns: ["City", "Amount", "Date"],
  columnOrder: [0, 1, 2],
  updateData: vi.fn(),
  enterPreviewMode: vi.fn(),
  cancelPreview: vi.fn(),
  confirmPreview: vi.fn(),
  refreshProject: vi.fn(),
  pageSize: 50,
  pendingTransform: null,
  isPreviewMode: false,
};

vi.mock("../context/ProjectContext", () => ({
  useProjectContext: () => mockContext,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockContext.columnOrder = [0, 1, 2];
  mockContext.isPreviewMode = false;
  mockContext.pendingTransform = null;
});

// TransformResultPreview — column-ordering logic
describe("TransformResultPreview — column ordering", () => {
  const columns = ["City", "Amount", "Date"];
  const rows = [["New York", "100", "2024-01-01"]];

  it("renders columns in default order [0, 1, 2]", () => {
    mockContext.columnOrder = [0, 1, 2];

    render(<TransformResultPreview columns={columns} rows={rows} />);

    const headers = screen.getAllByRole("columnheader");
    // first header is S.No.
    expect(headers[1]).toHaveTextContent("City");
    expect(headers[2]).toHaveTextContent("Amount");
    expect(headers[3]).toHaveTextContent("Date");
  });

  it("reorders columns when columnOrder is [2, 0, 1]", () => {
    mockContext.columnOrder = [2, 0, 1];

    render(<TransformResultPreview columns={columns} rows={rows} />);

    const headers = screen.getAllByRole("columnheader");
    expect(headers[1]).toHaveTextContent("Date");
    expect(headers[2]).toHaveTextContent("City");
    expect(headers[3]).toHaveTextContent("Amount");
  });

  it("reorders row cells to match column order", () => {
    mockContext.columnOrder = [2, 0, 1];

    render(<TransformResultPreview columns={columns} rows={rows} />);

    const cells = screen.getAllByRole("cell");
    // cells[0] = S.No. (1), cells[1] = Date, cells[2] = City, cells[3] = Amount
    expect(cells[1]).toHaveTextContent("2024-01-01");
    expect(cells[2]).toHaveTextContent("New York");
    expect(cells[3]).toHaveTextContent("100");
  });

  it("falls back to raw order when columnOrder length mismatches columns", () => {
    mockContext.columnOrder = [0, 1]; // length 2, columns length 3 — mismatch

    render(<TransformResultPreview columns={columns} rows={rows} />);

    const headers = screen.getAllByRole("columnheader");
    expect(headers[1]).toHaveTextContent("City");
    expect(headers[2]).toHaveTextContent("Amount");
    expect(headers[3]).toHaveTextContent("Date");
  });

  it("renders empty state when rows is empty", () => {
    render(<TransformResultPreview columns={columns} rows={[]} />);

    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders empty state when columns is empty", () => {
    render(<TransformResultPreview columns={[]} rows={rows} />);

    expect(screen.getByText("No columns available")).toBeInTheDocument();
  });

  it("prepends S.No. column with correct row index", () => {
    mockContext.columnOrder = [0, 1, 2];

    const multiRows = [
      ["New York", "100", "2024-01-01"],
      ["London", "200", "2024-01-02"],
    ];

    render(<TransformResultPreview columns={columns} rows={multiRows} />);

    const allRows = screen.getAllByRole("row");
    // allRows[0] = header, allRows[1] = first data row, allRows[2] = second
    expect(allRows[1].firstChild).toHaveTextContent("1");
    expect(allRows[2].firstChild).toHaveTextContent("2");
  });
});

// FilterForm — updateData propagation
describe("FilterForm — updateData propagation", () => {
  it("calls enterPreviewMode with dtypes after successful transform", async () => {
    transformProject.mockResolvedValueOnce({
      columns: ["City", "Amount"],
      rows: [["Paris", "300"]],
      dtypes: { City: "string", Amount: "float" },
    });

    const { getByTestId, getByText } = render(<FilterForm projectId="proj-1" onClose={vi.fn()} />);

    // Fill required fields
    // ColumnSelect renders a combobox button; open it and pick a column
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(getByTestId("filter-column"));
    fireEvent.click(getByText("City"));

    const valueInput = getByTestId("filter-value");
    fireEvent.change(valueInput, { target: { value: "Paris" } });

    fireEvent.click(getByText("Apply Filter"));

    await vi.waitFor(() => {
      expect(mockContext.enterPreviewMode).toHaveBeenCalledWith(
        ["City", "Amount"],
        [["Paris", "300"]],
        { City: "string", Amount: "float" }, // <-- This was the missing argument causing the test to fail
        {
          payload: {
            operation_type: "filter",
            parameters: {
              column: "City",
              condition: "=",
              value: "Paris",
            },
          },
          projectId: "proj-1",
        },
      );
    });
  });

  it("does not call enterPreviewMode when transform fails", async () => {
    transformProject.mockRejectedValueOnce(new Error("Server error"));

    const { getByTestId, getByText } = render(<FilterForm projectId="proj-1" onClose={vi.fn()} />);

    const { fireEvent } = await import("@testing-library/react");
    const valueInput = getByTestId("filter-value");
    fireEvent.change(valueInput, { target: { value: "Paris" } });

    fireEvent.click(getByText("Apply Filter"));

    await vi.waitFor(() => {
      expect(mockContext.enterPreviewMode).not.toHaveBeenCalled();
    });
  });
});
