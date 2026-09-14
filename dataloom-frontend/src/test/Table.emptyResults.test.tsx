import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import Table from "../Components/Table";
import { ToastProvider } from "../context/ToastContext";
import { PanelProvider } from "../context/PanelContext";

vi.mock("../api", () => ({
  transformProject: vi.fn(),
}));

const mockContext = {
  columns: ["City", "Amount"],
  rows: [
    ["New York", "100"],
    ["London", "200"],
  ],
  dtypes: { City: "string", Amount: "float" },
  columnOrder: [0, 1],
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

vi.mock("../context/HistoryRefreshContext", () => ({
  useHistoryRefresh: () => ({ refreshLogs: vi.fn(), refreshCheckpoints: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockContext.columns = ["City", "Amount"];
  mockContext.rows = [
    ["New York", "100"],
    ["London", "200"],
  ];
  mockContext.totalRows = 2;
});

const renderTable = () =>
  render(
    <PanelProvider>
      <ToastProvider>
        <Table projectId="test-id" />
      </ToastProvider>
    </PanelProvider>,
  );

describe("Table — empty result sets", () => {
  it("drops the previous rows when the result set becomes empty", () => {
    const { rerender } = renderTable();
    expect(screen.getByText("New York")).toBeInTheDocument();

    mockContext.rows = [];
    mockContext.totalRows = 0;
    rerender(
      <PanelProvider>
        <ToastProvider>
          <Table projectId="test-id" />
        </ToastProvider>
      </PanelProvider>,
    );

    expect(screen.queryByText("New York")).not.toBeInTheDocument();
    expect(screen.queryByText("London")).not.toBeInTheDocument();
  });

  it("keeps the headers when the result set becomes empty", () => {
    const { rerender } = renderTable();

    mockContext.rows = [];
    mockContext.totalRows = 0;
    rerender(
      <PanelProvider>
        <ToastProvider>
          <Table projectId="test-id" />
        </ToastProvider>
      </PanelProvider>,
    );

    const headers = screen.getAllByRole("columnheader");
    expect(headers[1]).toHaveTextContent("City");
    expect(headers[2]).toHaveTextContent("Amount");
  });
});
