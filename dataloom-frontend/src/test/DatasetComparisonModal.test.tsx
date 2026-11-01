import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CheckpointsPanel from "../Components/history/CheckpointsPanel";
import { ToastProvider } from "../context/ToastContext";
import type { DatasetComparison } from "../api/logs";

const { compareCheckpoint, deleteCheckpoint } = vi.hoisted(() => ({
  compareCheckpoint: vi.fn(),
  deleteCheckpoint: vi.fn(),
}));

vi.mock("../api", () => ({ compareCheckpoint, deleteCheckpoint }));

const comparison = (rowPage = 1, cellPage = 1): DatasetComparison => ({
  summary: {
    checkpoint_rows: 2,
    current_rows: 3,
    checkpoint_columns: 2,
    current_columns: 2,
    added_rows: 1,
    removed_rows: 0,
    changed_cells: 3,
    affected_rows: 2,
    affected_columns: 1,
  },
  columns: { added: [], removed: [], dtype_changed: [] },
  rows: [{ type: "added", row: 3, checkpoint_index: null, current_index: 2 }],
  cells: [{ row: 1, column: "value", checkpoint_value: "a", current_value: "b" }],
  total_rows: 3,
  total_cells: 3,
  row_page: rowPage,
  cell_page: cellPage,
  page_size: 1,
  total_row_pages: 3,
  total_cell_pages: 3,
  matching_strategy: "positional",
});

function renderPanel() {
  return render(
    <ToastProvider>
      <CheckpointsPanel
        projectId="project-1"
        checkpoints={[{ id: "checkpoint-1", message: "Saved", created_at: "2026-01-01T00:00:00Z" }]}
        currentColumns={["id", "value"]}
        onRevert={vi.fn()}
        onCheckpointDeleted={vi.fn()}
      />
    </ToastProvider>,
  );
}

const waitForRequestToSettle = () =>
  waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());

describe("Dataset comparison modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compareCheckpoint.mockImplementation(
      async (
        _projectId: string,
        _checkpointId: string,
        options: { rowPage: number; cellPage: number },
      ) => comparison(options.rowPage, options.cellPage),
    );
    deleteCheckpoint.mockResolvedValue({ success: true });
  });

  it("opens, loads the comparison, and closes", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByRole("dialog", { name: "Dataset Comparison" })).toBeInTheDocument();
    expect(await screen.findByText("Matching strategy: positional")).toBeInTheDocument();
    await waitForRequestToSettle();
    expect(compareCheckpoint).toHaveBeenCalledWith(
      "project-1",
      "checkpoint-1",
      expect.objectContaining({
        rowPage: 1,
        cellPage: 1,
        pageSize: 50,
        matchColumn: undefined,
        signal: expect.any(AbortSignal),
      }),
    );

    await user.click(screen.getByRole("button", { name: "Close comparison" }));
    expect(screen.queryByRole("dialog", { name: "Dataset Comparison" })).not.toBeInTheDocument();
  });

  it("paginates row and cell changes independently", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Compare" }));
    await screen.findByText("Matching strategy: positional");
    await waitForRequestToSettle();

    await user.click(screen.getByRole("button", { name: "Next row changes page" }));
    await waitFor(() =>
      expect(compareCheckpoint).toHaveBeenLastCalledWith(
        "project-1",
        "checkpoint-1",
        expect.objectContaining({ rowPage: 2, cellPage: 1 }),
      ),
    );
    await waitForRequestToSettle();

    await user.click(screen.getByRole("button", { name: "Next cell changes page" }));
    await waitFor(() =>
      expect(compareCheckpoint).toHaveBeenLastCalledWith(
        "project-1",
        "checkpoint-1",
        expect.objectContaining({ rowPage: 2, cellPage: 2 }),
      ),
    );
    await waitForRequestToSettle();
  });

  it("submits the selected identifier and resets both pages", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Compare" }));
    await screen.findByText("Matching strategy: positional");
    await waitForRequestToSettle();
    await user.click(screen.getByRole("button", { name: "Next row changes page" }));
    await screen.findByText("Matching strategy: positional");
    await waitForRequestToSettle();

    await user.selectOptions(screen.getByRole("combobox", { name: "Match rows by" }), "id");
    await waitFor(() =>
      expect(compareCheckpoint).toHaveBeenLastCalledWith(
        "project-1",
        "checkpoint-1",
        expect.objectContaining({ rowPage: 1, cellPage: 1, matchColumn: "id" }),
      ),
    );
  });

  it("shows identifier validation errors and distinct empty sections", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Compare" }));
    await screen.findByText("Matching strategy: positional");
    await waitForRequestToSettle();
    compareCheckpoint.mockRejectedValueOnce({
      response: { data: { detail: "Match column 'id' must contain unique values" } },
    });

    await user.selectOptions(screen.getByRole("combobox", { name: "Match rows by" }), "id");
    expect(await screen.findByRole("alert")).toHaveTextContent("must contain unique values");
    await waitForRequestToSettle();
    expect(screen.getByRole("combobox", { name: "Match rows by" })).toHaveValue("id");
    await user.selectOptions(screen.getByRole("combobox", { name: "Match rows by" }), "");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(compareCheckpoint).toHaveBeenLastCalledWith(
      "project-1",
      "checkpoint-1",
      expect.objectContaining({ rowPage: 1, cellPage: 1, matchColumn: undefined }),
    );
  });

  it("shows separate empty states for rows and cells", async () => {
    const user = userEvent.setup();
    compareCheckpoint.mockResolvedValue({
      ...comparison(),
      rows: [],
      cells: [],
      total_rows: 0,
      total_cells: 0,
      total_row_pages: 1,
      total_cell_pages: 1,
    });
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText("No row changes on this page.")).toBeInTheDocument();
    await waitForRequestToSettle();
    expect(screen.getByText("No cell changes on this page.")).toBeInTheDocument();
    expect(screen.getByText("No differences found.")).toBeInTheDocument();
  });

  it("closes during loading and ignores a response that arrives afterward", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (value: DatasetComparison) => void;
    compareCheckpoint.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Comparing checkpoint");
    await user.click(screen.getByRole("button", { name: "Close comparison" }));
    expect(screen.queryByRole("dialog", { name: "Dataset Comparison" })).not.toBeInTheDocument();
    resolveRequest(comparison());
    await waitFor(() =>
      expect(screen.queryByText("Matching strategy: positional")).not.toBeInTheDocument(),
    );
  });
});
