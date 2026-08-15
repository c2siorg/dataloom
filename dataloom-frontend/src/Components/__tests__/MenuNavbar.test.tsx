import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MenuNavbar from "../MenuNavbar";

// Mock the hooks used inside MenuNavbar
vi.mock("../../context/ProjectContext", () => ({
  useProjectContext: () => ({
    updateData: vi.fn(),
    refreshProject: vi.fn(),
    pageSize: 10,
    projectName: "Test Project",
    isPreviewMode: false,
  }),
}));

vi.mock("../../context/PanelContext", () => ({
  usePanel: () => ({
    activePanel: null,
    openPanel: vi.fn(),
    togglePanel: vi.fn(),
    closePanel: vi.fn(),
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
    refreshLogs: vi.fn(),
    refreshCheckpoints: vi.fn(),
  }),
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
});
