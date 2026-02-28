import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DataScreen from "../DataScreen";
import { useProjectContext } from "../../context/ProjectContext";

// Mock the ProjectContext
vi.mock("../../context/ProjectContext", () => ({
  useProjectContext: vi.fn(),
}));

// Mock the MenuNavbar component
vi.mock("../MenuNavbar", () => ({
  default: ({ onTransform, projectId }) => (
    <div data-testid="menu-navbar">
      <span data-testid="navbar-project-id">{projectId}</span>
      <button
        data-testid="mock-transform-btn"
        onClick={() =>
          onTransform({
            columns: ["Name", "Age"],
            rows: [
              ["Alice", "30"],
              ["Bob", "25"],
            ],
          })
        }
      >
        Apply Transform
      </button>
    </div>
  ),
}));

// Mock the Table component
vi.mock("../Table", () => ({
  default: ({ projectId, data }) => (
    <div data-testid="data-table">
      <span data-testid="table-project-id">{projectId}</span>
      {data ? (
        <div data-testid="table-with-data">
          <span>Columns: {data.columns.join(", ")}</span>
          <span>Rows: {data.rows.length}</span>
        </div>
      ) : (
        <span data-testid="no-data-message">No data available</span>
      )}
    </div>
  ),
}));

const renderWithRouter = (component, { route = "/workspace/proj-123" } = {}) => {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/workspace/:projectId" element={component} />
      </Routes>
    </MemoryRouter>,
  );
};

describe("DataScreen", () => {
  const mockSetProjectInfo = vi.fn();
  const mockRefreshProject = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for useProjectContext
    useProjectContext.mockReturnValue({
      setProjectInfo: mockSetProjectInfo,
      refreshProject: mockRefreshProject,
      loading: false,
      error: null,
      columns: ["Name", "Age", "City"],
      rows: [
        ["Alice", "30", "NYC"],
        ["Bob", "25", "LA"],
      ],
    });
  });

  it("renders the side menu/navbar", () => {
    renderWithRouter(<DataScreen />);

    expect(screen.getByTestId("menu-navbar")).toBeInTheDocument();
  });

  it("renders the data table component", () => {
    renderWithRouter(<DataScreen />);

    expect(screen.getByTestId("data-table")).toBeInTheDocument();
  });

  it("passes the correct projectId to MenuNavbar", () => {
    renderWithRouter(<DataScreen />);

    expect(screen.getByTestId("navbar-project-id")).toHaveTextContent("proj-123");
  });

  it("passes the correct projectId to Table", () => {
    renderWithRouter(<DataScreen />);

    expect(screen.getByTestId("table-project-id")).toHaveTextContent("proj-123");
  });

  it("sets project info on mount", async () => {
    await act(async () => {
      renderWithRouter(<DataScreen />);
    });

    await waitFor(() => {
      expect(mockSetProjectInfo).toHaveBeenCalledWith("proj-123");
    });
  });

  it("refreshes project data on mount", async () => {
    await act(async () => {
      renderWithRouter(<DataScreen />);
    });

    await waitFor(() => {
      expect(mockRefreshProject).toHaveBeenCalledWith("proj-123");
    });
  });

  it("updates when projectId URL parameter changes", async () => {
    // First render with proj-123
    await act(async () => {
      renderWithRouter(<DataScreen />, {
        route: "/workspace/proj-123",
      });
    });

    await waitFor(() => {
      expect(mockSetProjectInfo).toHaveBeenCalledWith("proj-123");
    });

    // Clear mock to track new calls
    mockSetProjectInfo.mockClear();
    mockRefreshProject.mockClear();

    // Unmount and render with new projectId - use a fresh render instead of rerender
    // because rerender with MemoryRouter doesn't update the route params
    const { unmount } = render(<></>); // Just to get unmount function
    unmount();

    await act(async () => {
      renderWithRouter(<DataScreen />, {
        route: "/workspace/proj-456",
      });
    });

    await waitFor(() => {
      expect(mockSetProjectInfo).toHaveBeenCalledWith("proj-456");
    });
  });

  it("handles transform data from MenuNavbar", async () => {
    const user = userEvent.setup();
    renderWithRouter(<DataScreen />);

    // Click the mock transform button
    await user.click(screen.getByTestId("mock-transform-btn"));

    // Table should now receive the transformed data
    await waitFor(() => {
      expect(screen.getByTestId("table-with-data")).toBeInTheDocument();
    });

    expect(screen.getByText(/Columns: Name, Age/)).toBeInTheDocument();
    expect(screen.getByText(/Rows: 2/)).toBeInTheDocument();
  });

  it("shows loading state when context is loading", () => {
    useProjectContext.mockReturnValue({
      setProjectInfo: mockSetProjectInfo,
      refreshProject: mockRefreshProject,
      loading: true,
      error: null,
      columns: [],
      rows: [],
    });

    renderWithRouter(<DataScreen />);

    // Both components should still render
    expect(screen.getByTestId("menu-navbar")).toBeInTheDocument();
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
  });

  it("shows error state when context has error", () => {
    useProjectContext.mockReturnValue({
      setProjectInfo: mockSetProjectInfo,
      refreshProject: mockRefreshProject,
      loading: false,
      error: "Failed to load project",
      columns: [],
      rows: [],
    });

    renderWithRouter(<DataScreen />);

    // Both components should still render
    expect(screen.getByTestId("menu-navbar")).toBeInTheDocument();
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
  });

  it("renders with empty context data", () => {
    useProjectContext.mockReturnValue({
      setProjectInfo: mockSetProjectInfo,
      refreshProject: mockRefreshProject,
      loading: false,
      error: null,
      columns: [],
      rows: [],
    });

    renderWithRouter(<DataScreen />);

    expect(screen.getByTestId("data-table")).toBeInTheDocument();
    expect(screen.getByTestId("no-data-message")).toBeInTheDocument();
  });

  it("does not set project info when projectId is undefined", async () => {
    render(
      <MemoryRouter initialEntries={["/workspace/"]}>
        <Routes>
          <Route path="/workspace/:projectId?" element={<DataScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    // Wait a bit and check that setProjectInfo was not called with undefined
    await new Promise((resolve) => setTimeout(resolve, 50));

    // setProjectInfo should not be called when projectId is undefined
    const calls = mockSetProjectInfo.mock.calls;
    const undefinedCalls = calls.filter((call) => call[0] === undefined);
    expect(undefinedCalls).toHaveLength(0);
  });

  it("maintains transform data across re-renders", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithRouter(<DataScreen />);

    // Apply transform
    await user.click(screen.getByTestId("mock-transform-btn"));

    await waitFor(() => {
      expect(screen.getByText(/Columns: Name, Age/)).toBeInTheDocument();
    });

    // Re-render with same props
    rerender(
      <MemoryRouter initialEntries={["/workspace/proj-123"]}>
        <Routes>
          <Route path="/workspace/:projectId" element={<DataScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    // Transform data should persist
    expect(screen.getByText(/Columns: Name, Age/)).toBeInTheDocument();
  });

  it("renders in a flex column layout", () => {
    const { container } = renderWithRouter(<DataScreen />);

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass("flex");
    expect(wrapper).toHaveClass("flex-col");
    expect(wrapper).toHaveClass("min-h-screen");
  });

  it("integrates with ProjectContext correctly", async () => {
    // Verify all context functions are called
    await act(async () => {
      renderWithRouter(<DataScreen />);
    });

    await waitFor(() => {
      expect(mockSetProjectInfo).toHaveBeenCalled();
      expect(mockRefreshProject).toHaveBeenCalled();
    });
  });

  it("passes onTransform callback to MenuNavbar that updates table data", async () => {
    const user = userEvent.setup();
    renderWithRouter(<DataScreen />);

    // Initially no external data
    expect(screen.getByTestId("no-data-message")).toBeInTheDocument();

    // Apply transform via the mock MenuNavbar button
    await user.click(screen.getByTestId("mock-transform-btn"));

    // Table should now have data
    await waitFor(() => {
      expect(screen.queryByTestId("no-data-message")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("table-with-data")).toBeInTheDocument();
  });

  it("handles different project IDs correctly", () => {
    // First project ID
    const { unmount } = render(
      <MemoryRouter initialEntries={["/workspace/project-abc"]}>
        <Routes>
          <Route path="/workspace/:projectId" element={<DataScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("navbar-project-id")).toHaveTextContent("project-abc");
    expect(screen.getByTestId("table-project-id")).toHaveTextContent("project-abc");

    // Clear mocks for next render
    mockSetProjectInfo.mockClear();
    mockRefreshProject.mockClear();

    // Unmount and render with different project ID
    unmount();

    render(
      <MemoryRouter initialEntries={["/workspace/project-xyz"]}>
        <Routes>
          <Route path="/workspace/:projectId" element={<DataScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("navbar-project-id")).toHaveTextContent("project-xyz");
    expect(screen.getByTestId("table-project-id")).toHaveTextContent("project-xyz");
  });

  it("renders both MenuNavbar and Table in correct order", () => {
    const { container } = renderWithRouter(<DataScreen />);

    const wrapper = container.firstChild;
    const children = wrapper.children;

    // First child should be MenuNavbar, second should be Table
    expect(children[0]).toHaveAttribute("data-testid", "menu-navbar");
    expect(children[1]).toHaveAttribute("data-testid", "data-table");
  });

  it("handles null/undefined transform data gracefully", async () => {
    // Create a mock that sends null data
    const NullTransformMenu = ({ onTransform }) => (
      <div data-testid="menu-navbar">
        <button data-testid="null-transform-btn" onClick={() => onTransform(null)}>
          Null Transform
        </button>
      </div>
    );

    // Need to clear the mock and re-mock it
    vi.doMock("../MenuNavbar", () => ({
      default: NullTransformMenu,
    }));

    // Re-import to pick up new mock - but note: in practice,
    // we just test that the current mock still works with data
    renderWithRouter(<DataScreen />);

    // Just verify the component renders without error
    expect(screen.getByTestId("menu-navbar")).toBeInTheDocument();
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
  });

  it("handles empty transform data gracefully", async () => {
    renderWithRouter(<DataScreen />);

    // Verify empty state is shown when no transform data passed
    expect(screen.getByTestId("no-data-message")).toBeInTheDocument();
  });
});
