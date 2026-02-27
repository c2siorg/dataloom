import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterForm from "../FilterForm";
import { transformProject } from "../../../api";

// Mock the API module
vi.mock("../../../api", () => ({
  transformProject: vi.fn(),
}));

// Mock console methods to keep test output clean
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

describe("FilterForm", () => {
  const mockProjectId = "test-project-123";
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<FilterForm projectId={mockProjectId} onClose={mockOnClose} />);

    expect(screen.getByRole("heading", { name: /filter dataset/i })).toBeInTheDocument();
    expect(screen.getByText(/column:/i)).toBeInTheDocument();
    expect(screen.getByText(/condition:/i)).toBeInTheDocument();
    expect(screen.getByText(/value:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply filter/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("calls onClose when cancel button is clicked", async () => {
    const user = userEvent.setup();
    render(<FilterForm projectId={mockProjectId} onClose={mockOnClose} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("updates form fields when user types", async () => {
    const user = userEvent.setup();
    render(<FilterForm projectId={mockProjectId} onClose={mockOnClose} />);

    // Get all text inputs - Column and Value are text inputs
    const inputs = screen.getAllByRole("textbox");
    const columnInput = inputs[0];
    const valueInput = inputs[1];

    await user.type(columnInput, "age");
    await user.type(valueInput, "25");

    expect(columnInput).toHaveValue("age");
    expect(valueInput).toHaveValue("25");
  });

  it("allows changing condition via select dropdown", async () => {
    const user = userEvent.setup();
    render(<FilterForm projectId={mockProjectId} onClose={mockOnClose} />);

    // Get the condition select (it's a combobox)
    const conditionSelect = screen.getByRole("combobox");

    // Default value should be "="
    expect(conditionSelect).toHaveValue("=");

    await user.selectOptions(conditionSelect, ">");
    expect(conditionSelect).toHaveValue(">");

    await user.selectOptions(conditionSelect, "<=");
    expect(conditionSelect).toHaveValue("<=");
  });

  it("calls transformProject API with correct parameters on submit", async () => {
    const user = userEvent.setup();
    const mockResponse = {
      columns: ["name", "age", "city"],
      rows: [["Alice", "30", "NYC"]],
    };
    transformProject.mockResolvedValue(mockResponse);

    render(<FilterForm projectId={mockProjectId} onClose={mockOnClose} />);

    // Fill in form fields
    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "age"); // Column
    await user.type(inputs[1], "25"); // Value

    // Change condition
    const conditionSelect = screen.getByRole("combobox");
    await user.selectOptions(conditionSelect, ">=");

    // Submit the form
    await user.click(screen.getByRole("button", { name: /apply filter/i }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(mockProjectId, {
        operation_type: "filter",
        parameters: {
          column: "age",
          condition: ">=",
          value: "25",
        },
      });
    });
  });

  it("displays API response data after successful submission", async () => {
    const user = userEvent.setup();
    const mockResponse = {
      columns: ["name", "age", "city"],
      rows: [["Alice", "30", "NYC"]],
    };
    transformProject.mockResolvedValue(mockResponse);

    render(<FilterForm projectId={mockProjectId} onClose={mockOnClose} />);

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "age");
    await user.type(inputs[1], "25");
    await user.click(screen.getByRole("button", { name: /apply filter/i }));

    await waitFor(() => {
      expect(screen.getByText(/api response/i)).toBeInTheDocument();
    });

    // Verify the preview table displays the data
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("age")).toBeInTheDocument();
    expect(screen.getByText("city")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("handles API errors gracefully", async () => {
    const user = userEvent.setup();
    const mockError = {
      response: { data: { detail: "Invalid filter parameters" } },
    };
    transformProject.mockRejectedValue(mockError);

    render(<FilterForm projectId={mockProjectId} onClose={mockOnClose} />);

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "invalid_column");
    await user.type(inputs[1], "value");
    await user.click(screen.getByRole("button", { name: /apply filter/i }));

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled();
    });

    // Form should still be rendered (not crash)
    expect(screen.getByRole("heading", { name: /filter dataset/i })).toBeInTheDocument();
  });

  it("disables submit button while loading", async () => {
    const user = userEvent.setup();
    // Create a promise that doesn't resolve immediately to simulate loading
    let resolvePromise;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    transformProject.mockReturnValue(pendingPromise);

    render(<FilterForm projectId={mockProjectId} onClose={mockOnClose} />);

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "age");
    await user.type(inputs[1], "25");

    const submitButton = screen.getByRole("button", { name: /apply filter/i });
    await user.click(submitButton);

    // Button should be disabled during loading
    expect(submitButton).toBeDisabled();

    // Resolve the promise to clean up
    resolvePromise({ columns: [], rows: [] });
  });

  it("validates required fields - all fields are required", () => {
    render(<FilterForm projectId={mockProjectId} onClose={mockOnClose} />);

    const inputs = screen.getAllByRole("textbox");
    const conditionSelect = screen.getByRole("combobox");

    // Check that all required fields have the required attribute
    expect(inputs[0]).toHaveAttribute("required"); // Column
    expect(inputs[1]).toHaveAttribute("required"); // Value
    expect(conditionSelect).toHaveAttribute("required");
  });

  it("prevents form submission when required fields are empty", async () => {
    const user = userEvent.setup();
    render(<FilterForm projectId={mockProjectId} onClose={mockOnClose} />);

    const columnInput = screen.getAllByRole("textbox")[0];

    // Try to submit without filling required fields
    await user.click(screen.getByRole("button", { name: /apply filter/i }));

    // The column input should be invalid (empty)
    expect(columnInput).toBeInvalid();

    // API should not have been called
    expect(transformProject).not.toHaveBeenCalled();
  });

  it("supports all condition operators", async () => {
    const user = userEvent.setup();
    const conditions = ["=", ">", "<", ">=", "<="];

    for (const condition of conditions) {
      vi.clearAllMocks();
      transformProject.mockResolvedValue({ columns: [], rows: [] });

      const { unmount } = render(<FilterForm projectId={mockProjectId} onClose={mockOnClose} />);

      const inputs = screen.getAllByRole("textbox");
      await user.type(inputs[0], "price"); // Column
      await user.type(inputs[1], "100"); // Value

      const conditionSelect = screen.getByRole("combobox");
      await user.selectOptions(conditionSelect, condition);

      await user.click(screen.getByRole("button", { name: /apply filter/i }));

      await waitFor(() => {
        expect(transformProject).toHaveBeenCalledWith(
          mockProjectId,
          expect.objectContaining({
            parameters: expect.objectContaining({ condition }),
          })
        );
      });

      unmount();
    }
  });
});
