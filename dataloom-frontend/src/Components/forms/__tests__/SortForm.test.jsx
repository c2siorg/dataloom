import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SortForm from "../SortForm";
import { transformProject } from "../../../api";

// Mock the API module
vi.mock("../../../api", () => ({
  transformProject: vi.fn(),
}));

// Mock console methods to keep test output clean
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

describe("SortForm", () => {
  const mockProjectId = "test-project-456";
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    expect(screen.getByRole("heading", { name: /sort dataset/i })).toBeInTheDocument();
    expect(screen.getByText(/column:/i)).toBeInTheDocument();
    expect(screen.getByText(/order:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("calls onClose when cancel button is clicked", async () => {
    const user = userEvent.setup();
    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("updates column field when user types", async () => {
    const user = userEvent.setup();
    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    // Find the textbox for Column (first text input)
    const inputs = screen.getAllByRole("textbox");
    const columnInput = inputs[0]; // Column is the first text input
    await user.type(columnInput, "name");

    expect(columnInput).toHaveValue("name");
  });

  it("toggles sort order between ascending and descending", async () => {
    const user = userEvent.setup();
    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    const orderSelect = screen.getByRole("combobox");

    // Default should be Ascending (true)
    expect(orderSelect).toHaveValue("true");

    // Change to Descending
    await user.selectOptions(orderSelect, "false");
    expect(orderSelect).toHaveValue("false");

    // Change back to Ascending
    await user.selectOptions(orderSelect, "true");
    expect(orderSelect).toHaveValue("true");
  });

  it("calls transformProject API with correct parameters on submit (ascending)", async () => {
    const user = userEvent.setup();
    const mockResponse = {
      columns: ["name", "age", "salary"],
      rows: [
        ["Alice", "25", "50000"],
        ["Bob", "30", "60000"],
      ],
    };
    transformProject.mockResolvedValue(mockResponse);

    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    // Find and fill in the column field
    const columnInput = screen.getAllByRole("textbox")[0];
    await user.type(columnInput, "name");

    // Submit the form
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(mockProjectId, {
        operation_type: "sort",
        sort_params: {
          column: "name",
          ascending: true,
        },
      });
    });
  });

  it("calls transformProject API with correct parameters on submit (descending)", async () => {
    const user = userEvent.setup();
    const mockResponse = {
      columns: ["name", "age", "salary"],
      rows: [
        ["Bob", "30", "60000"],
        ["Alice", "25", "50000"],
      ],
    };
    transformProject.mockResolvedValue(mockResponse);

    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    // Find and fill in form fields
    const columnInput = screen.getAllByRole("textbox")[0];
    await user.type(columnInput, "salary");

    const orderSelect = screen.getByRole("combobox");
    await user.selectOptions(orderSelect, "false");

    // Submit the form
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(mockProjectId, {
        operation_type: "sort",
        sort_params: {
          column: "salary",
          ascending: false,
        },
      });
    });
  });

  it("displays API response data after successful submission", async () => {
    const user = userEvent.setup();
    const mockResponse = {
      columns: ["name", "age", "city"],
      rows: [
        ["Alice", "30", "NYC"],
        ["Bob", "25", "LA"],
        ["Charlie", "35", "Chicago"],
      ],
    };
    transformProject.mockResolvedValue(mockResponse);

    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    const columnInput = screen.getAllByRole("textbox")[0];
    await user.type(columnInput, "age");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/api response/i)).toBeInTheDocument();
    });

    // Verify the preview table displays the data
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("age")).toBeInTheDocument();
    expect(screen.getByText("city")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("handles API errors gracefully", async () => {
    const user = userEvent.setup();
    const mockError = {
      response: { data: { detail: "Column not found" } },
      message: "Request failed",
    };
    transformProject.mockRejectedValue(mockError);

    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    const columnInput = screen.getAllByRole("textbox")[0];
    await user.type(columnInput, "nonexistent_column");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled();
    });

    // Form should still be rendered (not crash)
    expect(screen.getByRole("heading", { name: /sort dataset/i })).toBeInTheDocument();
  });

  it("disables submit button while loading", async () => {
    const user = userEvent.setup();
    // Create a promise that doesn't resolve immediately to simulate loading
    let resolvePromise;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    transformProject.mockReturnValue(pendingPromise);

    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    const columnInput = screen.getAllByRole("textbox")[0];
    await user.type(columnInput, "name");

    const submitButton = screen.getByRole("button", { name: /submit/i });
    await user.click(submitButton);

    // Button should be disabled during loading
    expect(submitButton).toBeDisabled();

    // Resolve the promise to clean up
    resolvePromise({ columns: [], rows: [] });
  });

  it("validates that column field is required", () => {
    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    const columnInput = screen.getAllByRole("textbox")[0];
    expect(columnInput).toHaveAttribute("required");
  });

  it("prevents form submission when column field is empty", async () => {
    const user = userEvent.setup();
    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    const columnInput = screen.getAllByRole("textbox")[0];

    // Try to submit without filling the column field
    await user.click(screen.getByRole("button", { name: /submit/i }));

    // The column input should be invalid (empty)
    expect(columnInput).toBeInvalid();

    // API should not have been called
    expect(transformProject).not.toHaveBeenCalled();
  });

  it("supports sorting with numeric column names", async () => {
    const user = userEvent.setup();
    const mockResponse = {
      columns: ["col1", "col2"],
      rows: [["data1", "data2"]],
    };
    transformProject.mockResolvedValue(mockResponse);

    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    const columnInput = screen.getAllByRole("textbox")[0];
    await user.type(columnInput, "price");

    const orderSelect = screen.getByRole("combobox");
    await user.selectOptions(orderSelect, "false");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        mockProjectId,
        expect.objectContaining({
          sort_params: expect.objectContaining({
            column: "price",
            ascending: false,
          }),
        })
      );
    });
  });

  it("handles sorting with special characters in column names", async () => {
    const user = userEvent.setup();
    const mockResponse = {
      columns: ["col_name"],
      rows: [["data"]],
    };
    transformProject.mockResolvedValue(mockResponse);

    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    const columnInput = screen.getAllByRole("textbox")[0];
    await user.type(columnInput, "user_name");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        mockProjectId,
        expect.objectContaining({
          sort_params: expect.objectContaining({
            column: "user_name",
          }),
        })
      );
    });
  });

  it("correctly converts string 'true'/'false' to boolean for ascending", async () => {
    const user = userEvent.setup();
    const mockResponse = { columns: [], rows: [] };
    transformProject.mockResolvedValue(mockResponse);

    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    const columnInput = screen.getAllByRole("textbox")[0];
    await user.type(columnInput, "date");

    // Select "false" which should convert to boolean false
    const orderSelect = screen.getByRole("combobox");
    await user.selectOptions(orderSelect, "false");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      const callArgs = transformProject.mock.calls[0][1];
      expect(callArgs.sort_params.ascending).toBe(false);
      expect(typeof callArgs.sort_params.ascending).toBe("boolean");
    });
  });

  it("correctly converts string 'true' to boolean true for ascending", async () => {
    const user = userEvent.setup();
    const mockResponse = { columns: [], rows: [] };
    transformProject.mockResolvedValue(mockResponse);

    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    const columnInput = screen.getAllByRole("textbox")[0];
    await user.type(columnInput, "date");
    // Default is "true" which should convert to boolean true
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      const callArgs = transformProject.mock.calls[0][1];
      expect(callArgs.sort_params.ascending).toBe(true);
      expect(typeof callArgs.sort_params.ascending).toBe("boolean");
    });
  });

  it("handles network errors without crashing", async () => {
    const user = userEvent.setup();
    const networkError = new Error("Network Error");
    transformProject.mockRejectedValue(networkError);

    render(<SortForm projectId={mockProjectId} onClose={mockOnClose} />);

    const columnInput = screen.getAllByRole("textbox")[0];
    await user.type(columnInput, "age");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled();
    });

    // Form should still be functional after error
    expect(columnInput).toHaveValue("age");
    expect(screen.getByRole("button", { name: /submit/i })).not.toBeDisabled();
  });
});
