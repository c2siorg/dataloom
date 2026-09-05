import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import Table from "../Components/Table";
import { transformProject } from "../api";
import { ToastProvider } from "../context/ToastContext";
import { PanelProvider } from "../context/PanelContext";

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
  refreshLogs: vi.fn(),
  isPreviewMode: false,
};

vi.mock("../context/ProjectContext", () => ({
  useProjectContext: () => mockContext,
}));

vi.mock("../context/HistoryRefreshContext", () => ({
  useHistoryRefresh: () => ({ refreshLogs: vi.fn(), refreshCheckpoints: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockContext.page = 1;
});

const renderTable = () =>
  render(
    <PanelProvider>
      <ToastProvider>
        <Table projectId="test-id" />
      </ToastProvider>
    </PanelProvider>,
  );

describe("Table Context Menu Actions", () => {
  it("renders expected items for rows and columns", () => {
    renderTable();

    // 1. Check Row context menu rendering
    // Right click on a cell in the first data row (S.No. is index 0, first data cell is index 1)
    const cells = screen.getAllByText("New York");
    fireEvent.contextMenu(cells[0]!);

    expect(screen.getByRole("menuitem", { name: "Add Row Above" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Add Row Below" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete Row" })).toBeInTheDocument();

    // 2. Check Column context menu rendering
    const headers = screen.getAllByRole("columnheader");
    // Right click on the header for "City"
    fireEvent.contextMenu(headers[1]!);

    expect(screen.getByRole("menuitem", { name: "Add Column Before" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Add Column After" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete Column" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Rename Column" })).toBeInTheDocument();
  });

  it("triggers Add Row Above with correct global index", async () => {
    const user = userEvent.setup();
    renderTable();

    const cells = screen.getAllByText("New York");
    fireEvent.contextMenu(cells[0]!);

    const addRowAbove = screen.getByRole("menuitem", { name: "Add Row Above" });
    await user.click(addRowAbove);

    expect(transformProject).toHaveBeenCalledWith(
      "test-id",
      expect.objectContaining({
        operation_type: "addRow",
        row_params: { index: 0 },
      }),
    );
  });

  it("triggers Add Row Below with correct global index", async () => {
    const user = userEvent.setup();
    renderTable();

    const cells = screen.getAllByText("New York");
    fireEvent.contextMenu(cells[0]!);

    const addRowBelow = screen.getByRole("menuitem", { name: "Add Row Below" });
    await user.click(addRowBelow);

    expect(transformProject).toHaveBeenCalledWith(
      "test-id",
      expect.objectContaining({
        operation_type: "addRow",
        row_params: { index: 1 },
      }),
    );
  });

  it("triggers Add Column Before with correct backend index", async () => {
    const user = userEvent.setup();
    renderTable();

    const headers = screen.getAllByRole("columnheader");
    // Right click on the first data column ("City", index 1)
    fireEvent.contextMenu(headers[1]!);

    const addColBefore = screen.getByRole("menuitem", { name: "Add Column Before" });
    await user.click(addColBefore);

    // Enter name in InputDialog
    const input = screen.getByRole("textbox");
    await user.type(input, "NewColBefore");

    const okButton = screen.getByRole("button", { name: "OK" });
    await user.click(okButton);

    expect(transformProject).toHaveBeenCalledWith(
      "test-id",
      expect.objectContaining({
        operation_type: "addCol",
        add_col_params: { index: 0, name: "NewColBefore" },
      }),
    );
  });

  it("triggers Add Column After with correct backend index", async () => {
    const user = userEvent.setup();
    renderTable();

    const headers = screen.getAllByRole("columnheader");
    // Right click on the first data column ("City", index 1)
    fireEvent.contextMenu(headers[1]!);

    const addColAfter = screen.getByRole("menuitem", { name: "Add Column After" });
    await user.click(addColAfter);

    // Enter name in InputDialog
    const input = screen.getByRole("textbox");
    await user.type(input, "NewColAfter");

    const okButton = screen.getByRole("button", { name: "OK" });
    await user.click(okButton);

    expect(transformProject).toHaveBeenCalledWith(
      "test-id",
      expect.objectContaining({
        operation_type: "addCol",
        add_col_params: { index: 1, name: "NewColAfter" },
      }),
    );
  });

  it("blocks Add Column Before on S.No. and displays Toast", async () => {
    const user = userEvent.setup();
    renderTable();

    const headers = screen.getAllByRole("columnheader");
    // Right click on the "S.No." column (index 0)
    fireEvent.contextMenu(headers[0]!);

    const addColBefore = screen.getByRole("menuitem", { name: "Add Column Before" });
    await user.click(addColBefore);

    // Should display Toast
    expect(screen.getByText("Cannot add a column before the S.No. column.")).toBeInTheDocument();
    expect(transformProject).not.toHaveBeenCalled();
  });

  it("allows Add Column After on S.No. with index 0", async () => {
    const user = userEvent.setup();
    renderTable();

    const headers = screen.getAllByRole("columnheader");
    // Right click on the "S.No." column (index 0)
    fireEvent.contextMenu(headers[0]!);

    const addColAfter = screen.getByRole("menuitem", { name: "Add Column After" });
    await user.click(addColAfter);

    // Enter name in InputDialog
    const input = screen.getByRole("textbox");
    await user.type(input, "FirstDataCol");

    const okButton = screen.getByRole("button", { name: "OK" });
    await user.click(okButton);

    expect(transformProject).toHaveBeenCalledWith(
      "test-id",
      expect.objectContaining({
        operation_type: "addCol",
        add_col_params: { index: 0, name: "FirstDataCol" },
      }),
    );
  });

  describe("Pagination", () => {
    it("triggers Add Row Above with correct global index when page = 2", async () => {
      mockContext.page = 2;
      mockContext.pageSize = 50;

      const user = userEvent.setup();
      renderTable();

      const cells = screen.getAllByText("New York");
      fireEvent.contextMenu(cells[0]!);

      const addRowAbove = screen.getByRole("menuitem", { name: "Add Row Above" });
      await user.click(addRowAbove);

      expect(transformProject).toHaveBeenCalledWith(
        "test-id",
        expect.objectContaining({
          operation_type: "addRow",
          row_params: { index: 50 },
        }),
      );
    });

    it("triggers Add Row Below with correct global index when page = 2", async () => {
      mockContext.page = 2;
      mockContext.pageSize = 50;

      const user = userEvent.setup();
      renderTable();

      const cells = screen.getAllByText("New York");
      fireEvent.contextMenu(cells[0]!);

      const addRowBelow = screen.getByRole("menuitem", { name: "Add Row Below" });
      await user.click(addRowBelow);

      expect(transformProject).toHaveBeenCalledWith(
        "test-id",
        expect.objectContaining({
          operation_type: "addRow",
          row_params: { index: 51 },
        }),
      );
    });
  });
});
