import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import Table from "../Components/Table";
import { transformProject } from "../api";
import { ToastProvider } from "../context/ToastContext";

vi.mock("../api", () => ({
  transformProject: vi.fn(() =>
    Promise.resolve({
      columns: ["City", "Amount", "Date"],
      rows: [["New York", "100", "2024-01-01"]],
      dtypes: {},
    }),
  ),
}));

const mockContext = {
  columns: ["City", "Amount", "Date"],
  rows: [
    ["New York", "100", "2024-01-01"],
    ["London", "200", "2024-01-02"],
  ],
  dtypes: {
    City: "string",
    Amount: "float",
    Date: "date",
  },
  columnOrder: [0, 1, 2],
  setColumnOrder: vi.fn(),
  updateData: vi.fn(),
  totalRows: 2,
  totalPages: 1,
  page: 1,
  pageSize: 50,
  setPaginationData: vi.fn(),
  refreshProject: vi.fn(),
};

vi.mock("../context/ProjectContext", () => ({
  useProjectContext: () => mockContext,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const renderTable = () =>
  render(
    <ToastProvider>
      <Table projectId="test-id" />
    </ToastProvider>,
  );

describe("Table — column reorder behavior", () => {
  it("renders columns in default order", () => {
    mockContext.columnOrder = [0, 1, 2];

    renderTable();

    const headers = screen.getAllByRole("columnheader");

    expect(headers[1]).toHaveTextContent("City");
    expect(headers[2]).toHaveTextContent("Amount");
    expect(headers[3]).toHaveTextContent("Date");
  });

  it("renders columns in reordered sequence [2, 0, 1]", () => {
    mockContext.columnOrder = [2, 0, 1];

    renderTable();

    const headers = screen.getAllByRole("columnheader");

    expect(headers[1]).toHaveTextContent("Date");
    expect(headers[2]).toHaveTextContent("City");
    expect(headers[3]).toHaveTextContent("Amount");
  });

  it("falls back to default order when columnOrder length mismatches", () => {
    mockContext.columnOrder = [0, 1];

    renderTable();

    const headers = screen.getAllByRole("columnheader");

    expect(headers[1]).toHaveTextContent("City");
    expect(headers[2]).toHaveTextContent("Amount");
    expect(headers[3]).toHaveTextContent("Date");
  });

  it("calls setColumnOrder when columns are reordered via drag and drop", async () => {
    mockContext.columnOrder = [0, 1, 2];

    renderTable();

    const buttons = screen.getAllByRole("button");

    const cityHeader = buttons.find((h) => h.textContent.includes("City"));

    const dateHeader = buttons.find((h) => h.textContent.includes("Date"));

    const dataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      setData: vi.fn(),
      getData: vi.fn(),
    };

    fireEvent.dragStart(cityHeader, { dataTransfer });
    fireEvent.dragOver(dateHeader, { dataTransfer });
    fireEvent.drop(dateHeader, { dataTransfer });

    expect(mockContext.setColumnOrder).toHaveBeenCalledWith([1, 2, 0]);
  });

  it("uses backend column index when editing reordered columns", async () => {
    const user = userEvent.setup();

    mockContext.columnOrder = [2, 0, 1];

    renderTable();

    const cells = screen.getAllByText("New York");

    await user.click(cells[0]);

    const input = await screen.findByDisplayValue("New York");

    await user.clear(input);
    await user.type(input, "Paris{enter}");

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "test-id",
        expect.objectContaining({
          change_cell_value: expect.objectContaining({
            col_index: 1,
          }),
        }),
      );
    });
  });
});
