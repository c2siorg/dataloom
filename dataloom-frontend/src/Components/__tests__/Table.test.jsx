import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Table from "../Table";
import { useProjectContext } from "../../hooks/useProjectContext";

// Mock the hooks and API
vi.mock("../../hooks/useProjectContext");
vi.mock("../../api", () => ({
  transformProject: vi.fn(),
}));

// Import the mocked function
import { transformProject } from "../../api";

const mockUseProjectContext = vi.mocked(useProjectContext);
const mockTransformProject = vi.mocked(transformProject);

describe("Table", () => {
  const mockProjectId = "test-project-123";
  const mockColumns = ["Name", "Age", "City"];
  const mockRows = [
    ["Alice", "25", "New York"],
    ["Bob", "30", "London"],
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock context with data
    mockUseProjectContext.mockReturnValue({
      columns: mockColumns,
      rows: mockRows,
    });
  });

  it("renders column headers including S.No. column", () => {
    render(<Table projectId={mockProjectId} />);

    // Check that all headers are rendered including S.No.
    expect(screen.getByText("S.No.")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText("City")).toBeInTheDocument();
  });

  it("renders all data rows with correct values", () => {
    render(<Table projectId={mockProjectId} />);

    // Check S.No. column values
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    // Check data values
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("New York")).toBeInTheDocument();
    expect(screen.getByText("London")).toBeInTheDocument();
  });

  it("renders empty table when no data is available", () => {
    mockUseProjectContext.mockReturnValue({
      columns: [],
      rows: [],
    });

    render(<Table projectId={mockProjectId} />);

    // Table should render but without headers or rows
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();

    // No data cells should be present
    expect(screen.queryByText("S.No.")).not.toBeInTheDocument();
  });

  it("renders data from externalData prop when provided", () => {
    const externalData = {
      columns: ["Product", "Price"],
      rows: [
        ["Widget", "10.99"],
        ["Gadget", "24.99"],
      ],
    };

    render(<Table projectId={mockProjectId} data={externalData} />);

    // Should show external data headers
    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();

    // Should show external data values
    expect(screen.getByText("Widget")).toBeInTheDocument();
    expect(screen.getByText("Gadget")).toBeInTheDocument();
    expect(screen.getByText("10.99")).toBeInTheDocument();
    expect(screen.getByText("24.99")).toBeInTheDocument();
  });

  it("opens column context menu on right-click on header", async () => {
    render(<Table projectId={mockProjectId} />);

    const nameHeader = screen.getByText("Name").closest("th");

    // Right-click on the header
    fireEvent.contextMenu(nameHeader);

    // Context menu should appear with column options
    await waitFor(() => {
      expect(screen.getByText("Add Column")).toBeInTheDocument();
      expect(screen.getByText("Delete Column")).toBeInTheDocument();
      expect(screen.getByText("Rename Column")).toBeInTheDocument();
    });
  });

  it("opens row context menu on right-click on cell", async () => {
    render(<Table projectId={mockProjectId} />);

    // Get a data cell and right-click on it
    const aliceCell = screen.getByText("Alice");

    fireEvent.contextMenu(aliceCell);

    // Context menu should appear with row options
    await waitFor(() => {
      expect(screen.getByText("Add Row")).toBeInTheDocument();
      expect(screen.getByText("Delete Row")).toBeInTheDocument();
    });
  });

  it("closes context menu when clicking outside", async () => {
    render(<Table projectId={mockProjectId} />);

    // Open context menu
    const nameHeader = screen.getByText("Name").closest("th");
    fireEvent.contextMenu(nameHeader);

    await waitFor(() => {
      expect(screen.getByText("Add Column")).toBeInTheDocument();
    });

    // Click outside the context menu (on the container)
    const container = screen.getByRole("table").closest("div").parentElement;
    fireEvent.click(container);

    // Context menu should close
    await waitFor(() => {
      expect(screen.queryByText("Add Column")).not.toBeInTheDocument();
    });
  });

  it("activates cell editing on double-click", async () => {
    const user = userEvent.setup();
    render(<Table projectId={mockProjectId} />);

    // Double-click on a data cell (not S.No. column)
    const aliceCell = screen.getByText("Alice");
    await act(async () => {
      await user.dblClick(aliceCell);
    });

    // An input should appear
    await waitFor(() => {
      const input = screen.getByRole("textbox");
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("Alice");
    });
  });

  it("does not activate editing on S.No. column cells", async () => {
    const user = userEvent.setup();
    render(<Table projectId={mockProjectId} />);

    // Double-click on S.No. cell
    const snoCell = screen.getByText("1").closest("td");
    await act(async () => {
      await user.dblClick(snoCell);
    });

    // No input should appear
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("saves cell edit on Enter key and calls API", async () => {
    const user = userEvent.setup();
    const mockResponse = {
      columns: mockColumns,
      rows: [
        ["Alice Updated", "25", "New York"],
        ["Bob", "30", "London"],
      ],
    };
    mockTransformProject.mockResolvedValueOnce(mockResponse);

    render(<Table projectId={mockProjectId} />);

    // Double-click to activate editing
    const aliceCell = screen.getByText("Alice");
    await act(async () => {
      await user.dblClick(aliceCell);
    });

    // Wait for input to appear and update it
    const input = await screen.findByRole("textbox");
    await act(async () => {
      await user.clear(input);
      await user.type(input, "Alice Updated");
    });

    // Press Enter to save
    await act(async () => {
      await user.keyboard("{Enter}");
    });

    // API should be called with correct parameters (col_index accounts for S.No. column offset)
    await waitFor(() => {
      expect(mockTransformProject).toHaveBeenCalledWith(
        mockProjectId,
        expect.objectContaining({
          operation_type: "changeCellValue",
          change_cell_value: {
            col_index: 0, // Name column is at cellIndex 1, but API gets 0 (minus S.No. offset)
            row_index: 0,
            fill_value: "Alice Updated",
          },
        }),
      );
    });
  });

  it("cancels cell edit on Escape key without API call", async () => {
    const user = userEvent.setup();
    render(<Table projectId={mockProjectId} />);

    // Double-click to activate editing
    const aliceCell = screen.getByText("Alice");
    await act(async () => {
      await user.dblClick(aliceCell);
    });

    // Type new value
    const input = await screen.findByRole("textbox");
    await act(async () => {
      await user.clear(input);
      await user.type(input, "New Value");
    });

    // Press Escape to cancel
    await act(async () => {
      await user.keyboard("{Escape}");
    });

    // API should NOT be called
    expect(mockTransformProject).not.toHaveBeenCalled();

    // Input should disappear
    await waitFor(() => {
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    // Original value should still be displayed
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("calls handleEditCell on blur when input loses focus", async () => {
    const user = userEvent.setup();
    const mockResponse = {
      columns: mockColumns,
      rows: mockRows,
    };
    mockTransformProject.mockResolvedValueOnce(mockResponse);

    render(<Table projectId={mockProjectId} />);

    // Double-click to activate editing
    const aliceCell = screen.getByText("Alice");
    await act(async () => {
      await user.dblClick(aliceCell);
    });

    // Type new value and blur
    const input = await screen.findByRole("textbox");
    await act(async () => {
      fireEvent.change(input, { target: { value: "Blurred Value" } });
      fireEvent.blur(input);
    });

    // API should be called (col_index accounts for S.No. column offset)
    await waitFor(() => {
      expect(mockTransformProject).toHaveBeenCalledWith(
        mockProjectId,
        expect.objectContaining({
          operation_type: "changeCellValue",
          change_cell_value: {
            col_index: 0, // Name column is at cellIndex 1, but API gets 0 (minus S.No. offset)
            row_index: 0,
            fill_value: "Blurred Value",
          },
        }),
      );
    });
  });

  it("updates table data when context provides new columns and rows", () => {
    const { rerender } = render(<Table projectId={mockProjectId} />);

    // Initial render shows first set of data
    expect(screen.getByText("Alice")).toBeInTheDocument();

    // Update the mock to return new data
    mockUseProjectContext.mockReturnValue({
      columns: ["NewCol1", "NewCol2"],
      rows: [
        ["Value1", "Value2"],
        ["Value3", "Value4"],
      ],
    });

    // Rerender with new context
    rerender(<Table projectId={mockProjectId} />);

    // Should show new headers
    expect(screen.getByText("NewCol1")).toBeInTheDocument();
    expect(screen.getByText("NewCol2")).toBeInTheDocument();

    // Should show new data
    expect(screen.getByText("Value1")).toBeInTheDocument();
    expect(screen.getByText("Value2")).toBeInTheDocument();
  });
});
