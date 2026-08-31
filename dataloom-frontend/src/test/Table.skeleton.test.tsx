import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import Table from "../Components/Table";
import { ToastProvider } from "../context/ToastContext";

vi.mock("../api", () => ({
  transformProject: vi.fn(),
  getColumnProfile: vi.fn(() => Promise.resolve({})),
}));

const COLUMNS = ["City", "Amount", "Date"];
const ROWS = [["New York", "100", "2024-01-01"]];

const mockContext = {
  columns: COLUMNS,
  rows: ROWS as unknown[][],
  dtypes: { City: "string", Amount: "float", Date: "date" },
  columnOrder: [0, 1, 2],
  setColumnOrder: vi.fn(),
  updateData: vi.fn(),
  dataVersion: 0,
  totalRows: 1,
  totalPages: 1,
  page: 1,
  pageSize: 50,
  isPreviewMode: false,
  pendingTransform: null,
  setPaginationData: vi.fn(),
  updatePreviewPage: vi.fn(),
  refreshProject: vi.fn(),
  loading: false,
};

vi.mock("../context/ProjectContext", () => ({
  useProjectContext: () => mockContext,
}));

vi.mock("../context/HistoryRefreshContext", () => ({
  useHistoryRefresh: () => ({ refreshLogs: vi.fn(), refreshCheckpoints: vi.fn() }),
}));

const renderTable = (showColumnProfiles = false) =>
  render(
    <ToastProvider>
      <Table projectId="test-id" showColumnProfiles={showColumnProfiles} />
    </ToastProvider>,
  );

/** Render the first-load state: fetching, with no rows on screen yet. */
const renderLoading = (showColumnProfiles = false) => {
  mockContext.loading = true;
  mockContext.rows = [];
  return renderTable(showColumnProfiles);
};

const headerRows = (container: HTMLElement, testId: string) =>
  container.querySelector(`[data-testid="${testId}"]`)?.querySelectorAll("thead tr") ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  mockContext.loading = false;
  mockContext.rows = ROWS;
});

describe("Table loading skeleton", () => {
  it("renders the grid and no skeleton when not loading", () => {
    renderTable();

    expect(screen.getByTestId("data-table")).toBeInTheDocument();
    expect(screen.queryByTestId("data-table-skeleton")).not.toBeInTheDocument();
  });

  it("renders the skeleton and no grid on first load", () => {
    renderLoading();

    expect(screen.getByTestId("data-table-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("data-table")).not.toBeInTheDocument();
  });

  it("keeps the grid when a refresh follows an in-place update", () => {
    // Mutation handlers update the grid, then refresh. Rows are still on
    // screen, so the skeleton must not replace them.
    mockContext.loading = true;
    renderTable();

    expect(screen.getByTestId("data-table")).toBeInTheDocument();
    expect(screen.queryByTestId("data-table-skeleton")).not.toBeInTheDocument();
  });

  it("gives the skeleton the same column count as the loaded grid", () => {
    const { container: loaded } = renderTable();
    const loadedCells = loaded.querySelectorAll(
      '[data-testid="data-table"] thead tr:last-child th',
    );

    const { container: skeleton } = renderLoading();
    const skeletonCells = skeleton.querySelectorAll(
      '[data-testid="data-table-skeleton"] thead tr:last-child th',
    );

    expect(skeletonCells).toHaveLength(loadedCells.length);
  });

  it("gives the skeleton the same header row count as the loaded grid", () => {
    const { container: loaded } = renderTable();
    const { container: skeleton } = renderLoading();

    expect(headerRows(skeleton, "data-table-skeleton")).toHaveLength(
      headerRows(loaded, "data-table").length,
    );
  });

  it("keeps the header rows aligned when column profiles are on", () => {
    const { container: loaded } = renderTable(true);
    const { container: skeleton } = renderLoading(true);

    expect(headerRows(skeleton, "data-table-skeleton")).toHaveLength(
      headerRows(loaded, "data-table").length,
    );
  });
});
