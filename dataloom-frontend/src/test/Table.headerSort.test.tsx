import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import Table from "../Components/Table";
import { ToastProvider } from "../context/ToastContext";
import { SORT } from "../constants/operationTypes";
import { transformProject } from "../api";

vi.mock("../api", () => ({
  transformProject: vi.fn(),
  getColumnProfile: vi.fn(() => Promise.resolve({})),
}));

type Pending = { projectId: string; payload: unknown } | null;

// enterPreviewMode and cancelPreview update pendingTransform like the real
// context does, since the header derives its indicator from it.
const mockContext = {
  columns: ["City", "Amount"],
  rows: [["Delhi", "420"]] as unknown[][],
  dtypes: { City: "string", Amount: "int64" },
  columnOrder: [0, 1],
  setColumnOrder: vi.fn(),
  updateData: vi.fn(),
  dataVersion: 0,
  totalRows: 1,
  totalPages: 1,
  page: 1,
  pageSize: 50,
  isPreviewMode: false,
  pendingTransform: null as Pending,
  setPaginationData: vi.fn(),
  updatePreviewPage: vi.fn(),
  refreshProject: vi.fn(),
  enterPreviewMode: vi.fn((_c: unknown, _r: unknown, _d: unknown, info: Pending) => {
    mockContext.pendingTransform = info;
    mockContext.isPreviewMode = true;
  }),
  cancelPreview: vi.fn(() => {
    mockContext.pendingTransform = null;
    mockContext.isPreviewMode = false;
  }),
  loading: false,
};

vi.mock("../context/ProjectContext", () => ({ useProjectContext: () => mockContext }));
vi.mock("../context/HistoryRefreshContext", () => ({
  useHistoryRefresh: () => ({ refreshLogs: vi.fn(), refreshCheckpoints: vi.fn() }),
}));
const openPanel = vi.fn();
vi.mock("../context/PanelContext", () => ({ usePanel: () => ({ openPanel }) }));

const tree = () => (
  <ToastProvider>
    <Table projectId="p1" />
  </ToastProvider>
);
const amount = () => screen.getByRole("button", { name: "Amount" });
const ariaSort = () => amount().closest("th")?.getAttribute("aria-sort");
const payload = (ascending: boolean) => ({
  operation_type: SORT,
  sort_params: { criteria: [{ column: "Amount", ascending }] },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockContext.isPreviewMode = false;
  mockContext.pendingTransform = null;
  (transformProject as Mock).mockResolvedValue({ columns: [], rows: [], dtypes: {} });
});

describe("Table header sort", () => {
  it("cycles ascending, descending, then clears, issuing the Sort form's payload", async () => {
    const view = render(tree());

    fireEvent.click(amount());
    await waitFor(() => expect(openPanel).toHaveBeenCalledWith("SortForm"));
    expect(transformProject).toHaveBeenCalledWith("p1", payload(true), {
      preview: true,
      page: 1,
      pageSize: 50,
    });
    view.rerender(tree());
    expect(ariaSort()).toBe("ascending");

    fireEvent.click(amount());
    await waitFor(() => expect(transformProject).toHaveBeenCalledTimes(2));
    expect(transformProject).toHaveBeenLastCalledWith("p1", payload(false), expect.anything());
    view.rerender(tree());
    expect(ariaSort()).toBe("descending");

    fireEvent.click(amount());
    expect(mockContext.cancelPreview).toHaveBeenCalledOnce();
    expect(transformProject).toHaveBeenCalledTimes(2);
    view.rerender(tree());
    expect(ariaSort()).toBeNull();
  });

  it("stays inert while another form's preview is pending", () => {
    mockContext.isPreviewMode = true;
    mockContext.pendingTransform = { projectId: "p1", payload: { operation_type: "filter" } };
    render(tree());

    fireEvent.click(amount());

    expect(transformProject).not.toHaveBeenCalled();
  });
});
