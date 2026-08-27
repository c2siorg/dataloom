import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import Table from "../Components/Table";
import { ToastProvider } from "../context/ToastContext";

vi.mock("../api", () => ({
  transformProject: vi.fn(),
}));

const mockContext = {
  columns: [],
  rows: [],
  dtypes: {},
  columnOrder: [],
  setColumnOrder: vi.fn(),
  updateData: vi.fn(),
  totalRows: 0,
  totalPages: 1,
  page: 1,
  pageSize: 10,
  setPaginationData: vi.fn(),
  refreshProject: vi.fn(),
  loading: true,
};

vi.mock("../context/ProjectContext", () => ({
  useProjectContext: () => mockContext,
}));

vi.mock("../context/HistoryRefreshContext", () => ({
  useHistoryRefresh: () => ({ refreshLogs: vi.fn(), refreshCheckpoints: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockContext.columns = [];
  mockContext.rows = [];
  mockContext.loading = true;
  mockContext.pageSize = 10;
});

const renderTable = () =>
  render(
    <ToastProvider>
      <Table projectId="test-id" />
    </ToastProvider>,
  );

describe("Table — initial loading skeleton", () => {
  it("shows the table skeleton when loading and no columns are available yet", () => {
    renderTable();

    expect(screen.getByTestId("data-table-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("data-table")).not.toBeInTheDocument();
  });

  it("keeps the existing table while loading if columns are already present", () => {
    mockContext.loading = true;
    mockContext.columns = ["City", "Amount"];
    mockContext.rows = [["New York", "100"]];
    mockContext.columnOrder = [0, 1];

    renderTable();

    expect(screen.queryByTestId("data-table-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
  });
});
