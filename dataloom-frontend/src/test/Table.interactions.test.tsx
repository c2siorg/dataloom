import { render, screen, within } from "@testing-library/react";
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

// thead holds the column name row followed by the dtype row.
const getSections = () => {
  const [thead, tbody] = within(screen.getByTestId("data-table")).getAllByRole("rowgroup");
  const [headerRow, dtypeRow] = within(thead!).getAllByRole("row");
  return { headerRow: headerRow!, dtypeRow: dtypeRow!, tbody: tbody! };
};

const cellTexts = (row: HTMLElement, role: "cell" | "columnheader") =>
  within(row)
    .getAllByRole(role)
    .map((cell) => cell.textContent);

const COLUMN_ITEMS = ["Add Column Before", "Add Column After", "Delete Column", "Rename Column"];
const ROW_ITEMS = ["Add Row Above", "Add Row Below", "Delete Row"];

const expectMenuItems = (present: string[], absent: string[]) => {
  present.forEach((name) => expect(screen.getByRole("menuitem", { name })).toBeInTheDocument());
  absent.forEach((name) => expect(screen.queryByRole("menuitem", { name })).toBeNull());
};

describe("Table — row rendering", () => {
  it("renders S.No. ahead of the project's columns", () => {
    renderTable();

    expect(cellTexts(getSections().headerRow, "columnheader")).toEqual([
      "S.No.",
      "City",
      "Amount",
      "Date",
    ]);
  });

  it("renders each data row as its serial number followed by its cell values", () => {
    renderTable();

    const rows = within(getSections().tbody).getAllByRole("row");

    expect(rows).toHaveLength(2);
    expect(cellTexts(rows[0]!, "cell")).toEqual(["1", "New York", "100", "2024-01-01"]);
    expect(cellTexts(rows[1]!, "cell")).toEqual(["2", "London", "200", "2024-01-02"]);
  });

  it("offsets serial numbers by the current page", () => {
    mockContext.page = 2;

    renderTable();

    const rows = within(getSections().tbody).getAllByRole("row");

    expect(cellTexts(rows[0]!, "cell")[0]).toBe("51");
    expect(cellTexts(rows[1]!, "cell")[0]).toBe("52");
  });
});

describe("Table — context menu targets", () => {
  it("opens the column menu when a column header is right-clicked", async () => {
    const user = userEvent.setup();
    renderTable();

    const header = within(getSections().headerRow).getAllByRole("columnheader")[1]!;
    await user.pointer({ keys: "[MouseRight]", target: header });

    expectMenuItems(COLUMN_ITEMS, ROW_ITEMS);
  });

  it("opens the column menu when a dtype cell is right-clicked", async () => {
    const user = userEvent.setup();
    renderTable();

    const dtypeCell = within(getSections().dtypeRow).getAllByRole("columnheader")[1]!;
    await user.pointer({ keys: "[MouseRight]", target: dtypeCell });

    expectMenuItems(COLUMN_ITEMS, ROW_ITEMS);
  });

  it("opens the row menu when a data cell is right-clicked", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("New York") });

    expectMenuItems(ROW_ITEMS, COLUMN_ITEMS);
  });
});

describe("Table — cell edit cancel", () => {
  it("pressing Escape discards the edit without calling transformProject", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByText("New York"));

    const input = screen.getByDisplayValue("New York");
    await user.clear(input);
    await user.type(input, "Paris");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("New York")).toBeInTheDocument();
    expect(screen.queryByText("Paris")).toBeNull();
    expect(transformProject).not.toHaveBeenCalled();

    // Re-entering edit mode starts from the cell value, not the discarded text.
    await user.click(screen.getByText("New York"));
    expect(screen.getByRole("textbox")).toHaveValue("New York");
  });
});
