import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
    refreshCheckpoints: vi.fn(),
  }),
  useHistoryRefreshTokens: () => ({ logsToken: 0, checkpointsToken: 0 }),
}));

vi.mock("../../context/ColumnProfilesContext", () => ({
  useColumnProfilesView: () => ({
    showColumnProfiles: false,
    toggleColumnProfiles: vi.fn(),
  }),
}));

vi.mock("../../api", () => ({
  saveProject: vi.fn(),
  undoLastTransformation: vi.fn(),
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
});
