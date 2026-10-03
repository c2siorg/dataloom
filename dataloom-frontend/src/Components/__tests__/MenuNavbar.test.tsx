import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MenuNavbar from "../MenuNavbar";
import {
  getUndoState,
  redoLastTransformation,
  undoLastTransformation,
  type UndoState,
} from "../../api/transforms";
import type { ProjectDetails } from "../../api/types";

// State the mocked hooks read, so each test can set preview mode and assert on calls.
const mocks = vi.hoisted(() => ({
  isPreviewMode: false,
  updateData: vi.fn(),
  setPaginationData: vi.fn(),
  closePanel: vi.fn(),
  refreshLogs: vi.fn(),
  refreshCheckpoints: vi.fn(),
  resetProject: vi.fn(),
}));

// Mock the hooks used inside MenuNavbar
vi.mock("../../context/ProjectContext", () => ({
  useProjectContext: () => ({
    updateData: mocks.updateData,
    setPaginationData: mocks.setPaginationData,
    refreshProject: vi.fn(),
    page: 2,
    pageSize: 10,
    projectName: "Test Project",
    isPreviewMode: mocks.isPreviewMode,
  }),
}));

vi.mock("../../context/PanelContext", () => ({
  usePanel: () => ({
    activePanel: null,
    openPanel: vi.fn(),
    togglePanel: vi.fn(),
    closePanel: mocks.closePanel,
  }),
}));

vi.mock("../../context/WorkspaceTabsContext", () => ({
  useWorkspaceTabs: () => ({
    openTab: vi.fn(),
    activeTabId: "dataset-tab",
  }),
}));

vi.mock("../../context/HistoryRefreshContext", () => ({
  useHistoryRefresh: () => ({
    refreshLogs: mocks.refreshLogs,
    refreshCheckpoints: mocks.refreshCheckpoints,
  }),
  useHistoryRefreshTokens: () => ({ logsToken: 0, checkpointsToken: 0 }),
}));

vi.mock("../../context/ColumnProfilesContext", () => ({
  useColumnProfilesView: () => ({
    showColumnProfiles: false,
    toggleColumnProfiles: vi.fn(),
  }),
}));

vi.mock("../../api/projects", () => ({
  saveProject: vi.fn(),
  resetProject: mocks.resetProject,
}));

vi.mock("../../api/transforms", () => ({
  undoLastTransformation: vi.fn(),
  redoLastTransformation: vi.fn(),
  getUndoState: vi.fn(),
}));

const mockGetUndoState = vi.mocked(getUndoState);
const mockRedo = vi.mocked(redoLastTransformation);
const mockUndo = vi.mocked(undoLastTransformation);

const PROJECT_PAGE = {
  columns: ["a"],
  rows: [[1]],
  row_count: 1,
  dtypes: { a: "int" },
  page: 2,
  page_size: 10,
  total_rows: 11,
  total_pages: 2,
  filename: "Test Project",
  file_path: "unused",
  project_id: "p1",
} as ProjectDetails;

/** Render with a known undo state and wait until the buttons reflect it. */
const renderWithUndoState = async (state: UndoState) => {
  mockGetUndoState.mockResolvedValue(state);
  render(<MenuNavbar projectId="p1" />);
  await waitFor(() => expect(mockGetUndoState).toHaveBeenCalledWith("p1"));
  await waitFor(() =>
    expect(screen.getByTestId("toolbar-undo").hasAttribute("disabled")).toBe(!state.can_undo),
  );
  await waitFor(() =>
    expect(screen.getByTestId("toolbar-redo").hasAttribute("disabled")).toBe(!state.can_redo),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isPreviewMode = false;
  // Unanswered by default: an unknown state must leave both buttons enabled.
  mockGetUndoState.mockReturnValue(new Promise(() => {}));
});

describe("MenuNavbar", () => {
  it("renders ribbon tabs and toolbar buttons with title attributes", () => {
    render(<MenuNavbar projectId="p1" />);

    const fileTab = screen.getByTestId("tab-file");
    expect(fileTab).toBeInTheDocument();
    expect(fileTab).toHaveAttribute(
      "title",
      "Manage project checkpoints, export data, and view history.",
    );

    const saveButton = screen.getByTestId("toolbar-save");
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).toHaveAttribute(
      "title",
      "Save the current state of the project as a new checkpoint.",
    );
  });

  it("shows tooltip on mouse enter or focus and hides on mouse leave or blur", () => {
    render(<MenuNavbar projectId="p1" />);

    const saveButton = screen.getByTestId("toolbar-save");

    // Initially no tooltip role element
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // Mouse enter shows tooltip
    fireEvent.mouseEnter(saveButton);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Save the current state of the project as a new checkpoint.",
    );

    // Mouse leave hides tooltip
    fireEvent.mouseLeave(saveButton);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // Keyboard focus shows tooltip
    fireEvent.focus(saveButton);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Save the current state of the project as a new checkpoint.",
    );

    // Keyboard blur hides tooltip
    fireEvent.blur(saveButton);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("clears tooltip when button is clicked", () => {
    render(<MenuNavbar projectId="p1" />);

    const exportButton = screen.getByTestId("toolbar-export");

    fireEvent.mouseEnter(exportButton);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.click(exportButton);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  describe("Undo and Redo", () => {
    it("puts Redo right after Undo", () => {
      render(<MenuNavbar projectId="p1" />);

      const redo = screen.getByTestId("toolbar-redo");
      expect(redo).toHaveAttribute("title", "Redo the last undone transformation.");
      expect(screen.getByTestId("toolbar-undo").compareDocumentPosition(redo)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it("leaves both enabled while the undo state is unknown", () => {
      render(<MenuNavbar projectId="p1" />);

      expect(screen.getByTestId("toolbar-undo")).not.toBeDisabled();
      expect(screen.getByTestId("toolbar-redo")).not.toBeDisabled();
    });

    it("redoes via the API and applies the returned page", async () => {
      mockRedo.mockResolvedValue(PROJECT_PAGE);
      await renderWithUndoState({ can_undo: false, can_redo: true });

      fireEvent.click(screen.getByTestId("toolbar-redo"));

      expect(await screen.findByText("Last transformation redone!")).toBeInTheDocument();
      expect(mockRedo).toHaveBeenCalledWith("p1", 2, 10);
      expect(mocks.closePanel).toHaveBeenCalled();
      expect(mocks.updateData).toHaveBeenCalledWith(["a"], [[1]], { resetColumnOrder: false });
      expect(mocks.setPaginationData).toHaveBeenCalledWith(PROJECT_PAGE);
      expect(mocks.refreshLogs).toHaveBeenCalled();
    });

    it("says there is nothing to redo on a 404", async () => {
      mockRedo.mockRejectedValue({ response: { status: 404 } });
      await renderWithUndoState({ can_undo: false, can_redo: true });

      fireEvent.click(screen.getByTestId("toolbar-redo"));

      expect(await screen.findByText("Nothing to redo.")).toBeInTheDocument();
      expect(mocks.refreshLogs).not.toHaveBeenCalled();
    });

    it("reports other redo failures", async () => {
      mockRedo.mockRejectedValue({ response: { status: 500 } });
      await renderWithUndoState({ can_undo: false, can_redo: true });

      fireEvent.click(screen.getByTestId("toolbar-redo"));

      expect(await screen.findByText("Failed to redo transformation.")).toBeInTheDocument();
    });

    it("disables Redo when there is nothing to redo", async () => {
      await renderWithUndoState({ can_undo: true, can_redo: false });

      expect(screen.getByTestId("toolbar-redo")).toBeDisabled();
      expect(screen.getByTestId("toolbar-undo")).not.toBeDisabled();
    });

    it("disables Undo when there is nothing to undo", async () => {
      await renderWithUndoState({ can_undo: false, can_redo: true });

      expect(screen.getByTestId("toolbar-undo")).toBeDisabled();
      expect(screen.getByTestId("toolbar-redo")).not.toBeDisabled();
      fireEvent.click(screen.getByTestId("toolbar-undo"));
      expect(mockUndo).not.toHaveBeenCalled();
    });

    it("disables Undo and Redo while previewing", async () => {
      mocks.isPreviewMode = true;
      mockGetUndoState.mockResolvedValue({ can_undo: true, can_redo: true });
      render(<MenuNavbar projectId="p1" />);
      await waitFor(() => expect(mockGetUndoState).toHaveBeenCalled());

      const redo = screen.getByTestId("toolbar-redo");
      expect(redo).toBeDisabled();
      expect(redo).toHaveAttribute(
        "title",
        "Redo is unavailable while previewing a transformation.",
      );
      expect(screen.getByTestId("toolbar-undo")).toBeDisabled();
    });
  });

  describe("Reset Dataset", () => {
    it("opens the reset confirmation dialog", () => {
      render(<MenuNavbar projectId="p1" />);

      fireEvent.click(screen.getByTestId("toolbar-reset-dataset"));

      expect(screen.getByText("Reset Dataset?")).toBeInTheDocument();
      expect(
        screen.getByText(
          "This will discard all transformations, checkpoints, undo history, and redo history and restore the dataset to its original uploaded state.",
        ),
      ).toBeInTheDocument();
    });

    it("resets the dataset and refreshes the UI", async () => {
      mocks.resetProject.mockResolvedValue(PROJECT_PAGE);

      render(<MenuNavbar projectId="p1" />);

      fireEvent.click(screen.getByTestId("toolbar-reset-dataset"));

      const dialog = screen.getByRole("dialog", {
        name: "Reset Dataset?",
      });

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Reset Dataset",
        }),
      );

      await waitFor(() => {
        expect(mocks.resetProject).toHaveBeenCalledWith("p1", 2, 10);
      });

      expect(mocks.updateData).toHaveBeenCalledWith(["a"], [[1]], { resetColumnOrder: false });
      expect(mocks.setPaginationData).toHaveBeenCalledWith(PROJECT_PAGE);
      expect(mocks.refreshLogs).toHaveBeenCalled();
      expect(mocks.refreshCheckpoints).toHaveBeenCalled();

      expect(screen.getByText("Dataset reset successfully.")).toBeInTheDocument();
      expect(screen.queryByText("Reset Dataset?")).not.toBeInTheDocument();
    });

    it("reports a reset failure", async () => {
      mocks.resetProject.mockRejectedValue(new Error("Reset failed"));

      render(<MenuNavbar projectId="p1" />);

      fireEvent.click(screen.getByTestId("toolbar-reset-dataset"));

      const dialog = screen.getByRole("dialog", {
        name: "Reset Dataset?",
      });

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Reset Dataset",
        }),
      );

      expect(await screen.findByText("Failed to reset dataset.")).toBeInTheDocument();

      expect(mocks.updateData).not.toHaveBeenCalled();
      expect(mocks.setPaginationData).not.toHaveBeenCalled();
      expect(mocks.refreshLogs).not.toHaveBeenCalled();
      expect(mocks.refreshCheckpoints).not.toHaveBeenCalled();
    });

    it("disables Reset Dataset while previewing", () => {
      mocks.isPreviewMode = true;

      render(<MenuNavbar projectId="p1" />);

      const resetButton = screen.getByTestId("toolbar-reset-dataset");

      expect(resetButton).toBeDisabled();
      expect(resetButton).toHaveAttribute(
        "title",
        "Reset Dataset is unavailable while previewing a transformation.",
      );
    });
  });
});
