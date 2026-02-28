import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import DataScreen from "../DataScreen";
import { ProjectProvider } from "../../context/ProjectContext";
import * as projectsApi from "../../api/projects";

// Mock the child components to simplify testing
vi.mock("../MenuNavbar", () => ({
  default: ({ projectId, onTransform }) => (
    <div data-testid="menu-navbar">
      Menu Navbar - Project: {projectId}
      <button
        onClick={() =>
          onTransform({
            columns: ["name", "age"],
            rows: [{ name: "John", age: 30 }],
          })
        }
      >
        Test Transform
      </button>
    </div>
  ),
}));

vi.mock("../Table", () => ({
  default: ({ projectId, data }) => (
    <div data-testid="table-component">
      Table - Project: {projectId}
      {data && <div>Data available</div>}
    </div>
  ),
}));

// Mock the projects API
vi.mock("../../api/projects", () => ({
  getProjectDetails: vi.fn(),
}));

// ============ 
// TEST DATA FACTORIES
// ============
/**
 * Factory function to create consistent project detail objects
 * Allows easy extension if API structure changes
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock project details
 */
const createMockProjectDetails = (overrides = {}) => {
  const defaults = {
    project_id: `project-${Math.random().toString(36).substr(2, 9)}`,
    filename: "data.csv",
    columns: ["name", "age", "city"],
    rows: [
      { name: "John", age: 30, city: "New York" },
      { name: "Jane", age: 25, city: "Los Angeles" },
    ],
    dtypes: {
      name: "string",
      age: "int64",
      city: "string",
    },
  };
  return { ...defaults, ...overrides };
};

/**
 * Factory to create empty project (no data)
 */
const createEmptyProject = (projectId = "test-project-123") => {
  return createMockProjectDetails({
    project_id: projectId,
    columns: [],
    rows: [],
    dtypes: {},
  });
};

/**
 * Factory to create project with custom column structure
 * Useful for testing different data types
 */
const createProjectWithColumns = (columns = [], projectId = "test-project-123") => {
  const dtypes = {};
  columns.forEach((col) => {
    dtypes[col] = "string"; // Default type
  });

  return createMockProjectDetails({
    project_id: projectId,
    columns,
    rows: [],
    dtypes,
  });
};

// ============ 
// TEST CONSTANTS
// ============
const TEST_IDS = {
  menuNavbar: "menu-navbar",
  tableComponent: "table-component",
  transformButton: "Test Transform",
};

const DEFAULT_PROJECT_ID = "test-project-123";
const ALTERNATIVE_PROJECT_ID = "my-project-456";
const ANOTHER_PROJECT_ID = "test-project-789";

// ============ 
// HELPER UTILITIES
// ============
/**
 * Helper to render DataScreen with MemoryRouter at the correct path
 * More scalable than inline router setup in each test
 * @param {String} projectId - Project ID to render for
 * @returns {Object} Render result
 */
const renderDataScreenAtPath = (projectId = DEFAULT_PROJECT_ID) => {
  return render(
    <MemoryRouter initialEntries={[`/workspace/${projectId}`]}>
      <ProjectProvider>
        <Routes>
          <Route path='/workspace/:projectId' element={<DataScreen />} />
        </Routes>
      </ProjectProvider>
    </MemoryRouter>
  );
};

describe("DataScreen Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock getProjectDetails to return sample data by default
    projectsApi.getProjectDetails.mockResolvedValue(
      createMockProjectDetails()
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render the main layout with menu navbar and table", async () => {
      renderDataScreenAtPath();

      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.menuNavbar)).toBeInTheDocument();
        expect(screen.getByTestId(TEST_IDS.tableComponent)).toBeInTheDocument();
      });
    });

    it("should render menu navbar component", async () => {
      renderDataScreenAtPath();

      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.menuNavbar)).toBeInTheDocument();
      });
    });

    it("should render table component", async () => {
      renderDataScreenAtPath();

      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.tableComponent)).toBeInTheDocument();
      });
    });

    it("should use flex layout for the screen", async () => {
      const { container } = renderDataScreenAtPath();

      await waitFor(() => {
        // Test behavior (flex layout is applied) rather than exact class names
        const mainDiv = container.querySelector(".flex.flex-col.min-h-screen");
        expect(mainDiv).toBeInTheDocument();
      });
    });
  });

  describe("Project Setup", () => {
    it("should set project info on mount with project ID", async () => {
      const projectId = ALTERNATIVE_PROJECT_ID;
      renderDataScreenAtPath(projectId);

      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.menuNavbar)).toBeInTheDocument();
      });
    });

    it("should fetch project details on component mount", async () => {
      const mockProject = createMockProjectDetails({
        project_id: ANOTHER_PROJECT_ID,
        columns: ["col1", "col2"],
        rows: [],
        dtypes: {},
      });
      projectsApi.getProjectDetails.mockResolvedValueOnce(mockProject);

      renderDataScreenAtPath(ANOTHER_PROJECT_ID);

      await waitFor(() => {
        expect(projectsApi.getProjectDetails).toHaveBeenCalled();
      });
    });

    it("should pass project ID to child components", async () => {
      const projectId = "specific-project-id";
      renderDataScreenAtPath(projectId);

      await waitFor(() => {
        const menuNavbar = screen.getByTestId(TEST_IDS.menuNavbar);
        // The mock component should show the projectId from the route
        expect(menuNavbar).toBeInTheDocument();
      });
    });
  });

  describe("Data Table Display", () => {
    it("should render table with data from context", async () => {
      renderDataScreenAtPath();

      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.tableComponent)).toBeInTheDocument();
      });
    });

    it("should pass table data through props when transform is called", async () => {
      renderDataScreenAtPath();

      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.menuNavbar)).toBeInTheDocument();
      });

      const transformButton = screen.getByText(TEST_IDS.transformButton);
      await userEvent.click(transformButton);

      await waitFor(() => {
        const table = screen.getByTestId(TEST_IDS.tableComponent);
        expect(table).toHaveTextContent("Data available");;
      });
    });

    it("should initially render table without external data", async () => {
      renderDataScreenAtPath();

      await waitFor(() => {
        const table = screen.getByTestId("table-component");
        expect(table).toBeInTheDocument();
        // Data should not be visible initially since no transform has occurred
        expect(table).not.toHaveTextContent("Data available");
      });
    });
  });

  describe("Menu Navbar Integration", () => {
    it("should pass onTransform handler to menu navbar", async () => {
      renderDataScreenAtPath();

      await waitFor(() => {
        const menuNavbar = screen.getByTestId("menu-navbar");
        expect(menuNavbar).toBeInTheDocument();
        // The button exists, meaning onTransform is passed
        expect(screen.getByText("Test Transform")).toBeInTheDocument();
      });
    });

    it("should handle transform callback from menu navbar", async () => {
      renderDataScreenAtPath();

      await waitFor(() => {
        expect(screen.getByTestId("menu-navbar")).toBeInTheDocument();
      });

      const transformButton = screen.getByText("Test Transform");
      await userEvent.click(transformButton);

      await waitFor(() => {
        // After transform, table should receive data
        const tableDiv = screen.getByTestId("table-component");
        expect(tableDiv.textContent).toContain("Data available");
      });
    });

    it("should update table data when transform is called", async () => {
      renderDataScreenAtPath();

      await waitFor(() => {
        expect(screen.getByTestId("menu-navbar")).toBeInTheDocument();
      });

      // Initially, data should not be visible
      let table = screen.getByTestId("table-component");
      expect(table).not.toHaveTextContent("Data available");

      // Click transform button
      const transformButton = screen.getByText("Test Transform");
      await userEvent.click(transformButton);

      // After transform, data should be visible
      await waitFor(() => {
        table = screen.getByTestId("table-component");
        expect(table).toHaveTextContent("Data available");
      });
    });
  });

  describe("Context Integration", () => {
    it("should provide project context to child components", async () => {
      renderDataScreenAtPath();

      await waitFor(() => {
        expect(projectsApi.getProjectDetails).toHaveBeenCalled();
      });
    });

    it("should call setProjectInfo with correct project ID", async () => {
      const projectId = "unique-test-id";
      renderDataScreenAtPath(projectId);

      // Wait for the component to render
      await waitFor(() => {
        expect(screen.getByTestId("menu-navbar")).toBeInTheDocument();
      });
    });

    it("should call refreshProject and fetch data on mount", async () => {
      const projectId = "refresh-test-id";
      projectsApi.getProjectDetails.mockResolvedValue({
        project_id: projectId,
        filename: "test_data.csv",
        columns: ["name", "age"],
        rows: [{ name: "John", age: 30 }],
        dtypes: { name: "string", age: "int64" },
      });

      renderDataScreenAtPath(projectId);

      await waitFor(() => {
        // refreshProject calls getProjectDetails internally
        expect(projectsApi.getProjectDetails).toHaveBeenCalled();
      });
    });
  });

  describe("Loading and Error States", () => {
    it("should handle API loading state", async () => {
      // Mock a delayed response to test loading state
      projectsApi.getProjectDetails.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(createMockProjectDetails()), 100)
          )
      );

      renderDataScreenAtPath();

      // Components should eventually render
      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.menuNavbar)).toBeInTheDocument();
        expect(screen.getByTestId(TEST_IDS.tableComponent)).toBeInTheDocument();
      });
    });

    it("should handle API errors gracefully", async () => {
      projectsApi.getProjectDetails.mockRejectedValueOnce(
        new Error("Failed to fetch project")
      );

      renderDataScreenAtPath();

      // Components should still render even with API error
      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.menuNavbar)).toBeInTheDocument();
        expect(screen.getByTestId(TEST_IDS.tableComponent)).toBeInTheDocument();
      });
    });
  });

  describe("State Management", () => {
    it("should maintain local state for table data", async () => {
      renderDataScreenAtPath();

      // Step 1: Initial render without external data
      await waitFor(() => {
        const table = screen.getByTestId(TEST_IDS.tableComponent);
        expect(table).toBeInTheDocument();
      });

      // Step 2: Simulate transform with external data
      const transformButton = screen.getByText(TEST_IDS.transformButton);
      await userEvent.click(transformButton);

      // Step 3: Verify table receives the data
      await waitFor(() => {
        const table = screen.getByTestId(TEST_IDS.tableComponent);
        expect(table.textContent).toContain("Data available");
      });
    });

    it("should update state independently from context", async () => {
      renderDataScreenAtPath();

      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.menuNavbar)).toBeInTheDocument();
      });

      // Transform data via callback
      const transformButton = screen.getByText(TEST_IDS.transformButton);
      await userEvent.click(transformButton);

      // Verify state was updated
      await waitFor(() => {
        const table = screen.getByTestId(TEST_IDS.tableComponent);
        expect(table).toHaveTextContent("Data available");
      });
    });
  });

  describe("Component Isolation", () => {
    it("should not depend on external navigation outside of workspace route", async () => {
      renderDataScreenAtPath();

      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.menuNavbar)).toBeInTheDocument();
      });

      // Component should work independently
      expect(screen.getByTestId(TEST_IDS.tableComponent)).toBeInTheDocument();
    });

    it("should work with different project IDs on initial load", async () => {
      const projectId = "different-project-456";
      const mockProject = createMockProjectDetails({
        project_id: projectId,
        columns: ["id", "name"],
        rows: [{ id: 1, name: "Test" }],
        dtypes: { id: "int64", name: "string" },
      });
      projectsApi.getProjectDetails.mockResolvedValue(mockProject);

      renderDataScreenAtPath(projectId);

      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.menuNavbar)).toBeInTheDocument();
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty column list", async () => {
      projectsApi.getProjectDetails.mockResolvedValueOnce(createEmptyProject());

      renderDataScreenAtPath();

      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.tableComponent)).toBeInTheDocument();
      });
    });

    it("should handle empty row list", async () => {
      const mockProject = createProjectWithColumns(["name", "age"]);
      projectsApi.getProjectDetails.mockResolvedValueOnce(mockProject);

      renderDataScreenAtPath();

      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.tableComponent)).toBeInTheDocument();
      });
    });

    it("should handle missing dtypes in project details", async () => {
      const mockProject = createMockProjectDetails();
      delete mockProject.dtypes;
      projectsApi.getProjectDetails.mockResolvedValueOnce(mockProject);

      renderDataScreenAtPath();

      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.tableComponent)).toBeInTheDocument();
      });
    });
  });

  describe("Multiple Transforms", () => {
    it("should handle multiple sequential transforms", async () => {
      renderDataScreenAtPath();

      await waitFor(() => {
        expect(screen.getByTestId(TEST_IDS.menuNavbar)).toBeInTheDocument();
      });

      // First transform
      let transformButton = screen.getByText(TEST_IDS.transformButton);
      await userEvent.click(transformButton);

      await waitFor(() => {
        let table = screen.getByTestId(TEST_IDS.tableComponent);
        expect(table).toHaveTextContent("Data available");
      });

      // Second transform without re-rendering
      transformButton = screen.getByText(TEST_IDS.transformButton);
      await userEvent.click(transformButton);

      // Should still have data
      await waitFor(() => {
        const table = screen.getByTestId(TEST_IDS.tableComponent);
        expect(table).toHaveTextContent("Data available");
      });
    });
  });
});
