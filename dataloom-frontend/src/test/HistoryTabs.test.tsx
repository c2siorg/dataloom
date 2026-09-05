import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { CheckpointsTab } from "../Components/workspace/HistoryTabs";
import { ToastProvider } from "../context/ToastContext";
import { HistoryRefreshProvider } from "../context/HistoryRefreshContext";
import { revertToCheckpoint } from "../api/projects";
import { getCheckpoints } from "../api/logs";

vi.mock("../api/projects", () => ({
  revertToCheckpoint: vi.fn(),
}));

vi.mock("../api/logs", () => ({
  getCheckpoints: vi.fn(),
}));

const mockRevertToCheckpoint = revertToCheckpoint as unknown as Mock;
const mockGetCheckpoints = getCheckpoints as unknown as Mock;

const mockUpdateData = vi.fn();
const mockSetPaginationData = vi.fn();

vi.mock("../context/ProjectContext", () => ({
  useProjectContext: () => ({
    projectId: "proj-1",
    page: 3,
    pageSize: 50,
    updateData: mockUpdateData,
    setPaginationData: mockSetPaginationData,
    refreshProject: vi.fn(),
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ projectId: "proj-1" }),
  };
});

// Mock ResizeObserver
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("CheckpointsTab - Pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCheckpoints.mockResolvedValue([
      { id: "checkpoint-1", created_at: new Date().toISOString(), message: "Initial commit" },
    ]);
  });

  const renderComponent = () => {
    return render(
      <ToastProvider>
        <HistoryRefreshProvider>
          <CheckpointsTab />
        </HistoryRefreshProvider>
      </ToastProvider>,
    );
  };

  it("passes current page and pageSize to revertToCheckpoint and consumes paginated response", async () => {
    mockRevertToCheckpoint.mockResolvedValue({
      columns: ["A"],
      rows: [[1]],
      dtypes: { A: "int" },
      page: 3,
      page_size: 50,
      total_rows: 150,
      total_pages: 3,
    });

    renderComponent();

    // Wait for checkpoints to load
    await waitFor(() => {
      expect(screen.getByText("Initial commit")).toBeInTheDocument();
    });

    // Click Revert
    const revertButtons = screen.getAllByRole("button", { name: "Revert" });
    fireEvent.click(revertButtons[0]!);

    // Click Confirm
    const confirmButton = screen.getByRole("button", { name: /Confirm/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      // It should have passed projectId, checkpointId, page=3, pageSize=50
      expect(revertToCheckpoint).toHaveBeenCalledWith("proj-1", "checkpoint-1", 3, 50);

      // Should have passed columns and rows to updateData
      expect(mockUpdateData).toHaveBeenCalledWith(["A"], [[1]], {
        dtypes: { A: "int" },
        resetColumnOrder: false,
      });

      // Should have passed the entire response to setPaginationData
      expect(mockSetPaginationData).toHaveBeenCalledWith({
        columns: ["A"],
        rows: [[1]],
        dtypes: { A: "int" },
        page: 3,
        page_size: 50,
        total_rows: 150,
        total_pages: 3,
      });
    });
  });
});
