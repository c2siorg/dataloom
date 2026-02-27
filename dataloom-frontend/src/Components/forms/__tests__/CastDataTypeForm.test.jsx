import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CastDataTypeForm from "../CastDataTypeForm";
import { transformProject } from "../../../api";
import { useProjectContext } from "../../../hooks/useProjectContext";

// Mock the API module
vi.mock("../../../api", () => ({
  transformProject: vi.fn(),
}));

// Mock the useProjectContext hook
vi.mock("../../../hooks/useProjectContext", () => ({
  useProjectContext: vi.fn(),
}));

// Mock console methods and alert to keep test output clean
vi.spyOn(console, "error").mockImplementation(() => {});
const mockAlert = vi.fn();
window.alert = mockAlert;

describe("CastDataTypeForm", () => {
  const mockProjectId = "test-project-789";
  const mockOnClose = vi.fn();
  const mockOnTransform = vi.fn();
  const mockColumns = ["id", "name", "age", "salary", "is_active", "created_at"];

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for useProjectContext
    useProjectContext.mockReturnValue({
      columns: mockColumns,
    });
  });

  it("renders without crashing", () => {
    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    expect(screen.getByRole("heading", { name: /cast data type/i })).toBeInTheDocument();
    expect(screen.getByText(/column:/i)).toBeInTheDocument();
    expect(screen.getByText(/target type:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("renders all columns from project context in the dropdown", () => {
    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    // Get all comboboxes - first one is column, second is target type
    const columnSelect = screen.getAllByRole("combobox")[0];

    // Check that all columns are rendered as options
    for (const column of mockColumns) {
      expect(screen.getByRole("option", { name: column })).toBeInTheDocument();
    }

    // Check the default placeholder option
    expect(screen.getByRole("option", { name: /select column/i })).toBeInTheDocument();
  });

  it("renders all target type options", () => {
    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    const expectedTypes = ["String", "Integer", "Float", "Boolean", "DateTime"];

    for (const type of expectedTypes) {
      expect(screen.getByRole("option", { name: type })).toBeInTheDocument();
    }
  });

  it("calls onClose when cancel button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("allows selecting a column from the dropdown", async () => {
    const user = userEvent.setup();
    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    const columnSelect = screen.getAllByRole("combobox")[0];

    // Default should be empty
    expect(columnSelect).toHaveValue("");

    await user.selectOptions(columnSelect, "age");
    expect(columnSelect).toHaveValue("age");

    await user.selectOptions(columnSelect, "salary");
    expect(columnSelect).toHaveValue("salary");
  });

  it("allows selecting a target type from the dropdown", async () => {
    const user = userEvent.setup();
    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    // Second combobox is target type
    const typeSelect = screen.getAllByRole("combobox")[1];

    // Default should be "string"
    expect(typeSelect).toHaveValue("string");

    await user.selectOptions(typeSelect, "integer");
    expect(typeSelect).toHaveValue("integer");

    await user.selectOptions(typeSelect, "float");
    expect(typeSelect).toHaveValue("float");

    await user.selectOptions(typeSelect, "boolean");
    expect(typeSelect).toHaveValue("boolean");

    await user.selectOptions(typeSelect, "datetime");
    expect(typeSelect).toHaveValue("datetime");
  });

  it("calls transformProject API with correct parameters on submit", async () => {
    const user = userEvent.setup();
    const mockResponse = {
      columns: ["id", "name", "age"],
      rows: [["1", "Alice", "25"]],
    };
    transformProject.mockResolvedValue(mockResponse);

    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    // Get the two comboboxes
    const selects = screen.getAllByRole("combobox");
    const columnSelect = selects[0];
    const typeSelect = selects[1];

    // Select column and target type
    await user.selectOptions(columnSelect, "age");
    await user.selectOptions(typeSelect, "integer");

    // Submit the form
    await user.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(mockProjectId, {
        operation_type: "castDataType",
        cast_data_type_params: {
          column: "age",
          target_type: "integer",
        },
      });
    });
  });

  it("calls onTransform and onClose after successful API call", async () => {
    const user = userEvent.setup();
    const mockResponse = {
      columns: ["id", "name", "salary"],
      rows: [["1", "Alice", "50000"]],
    };
    transformProject.mockResolvedValue(mockResponse);

    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "salary");
    await user.selectOptions(selects[1], "float");
    await user.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(mockOnTransform).toHaveBeenCalledWith(mockResponse);
      expect(mockOnClose).toHaveBeenCalledOnce();
    });
  });

  it("handles API errors by showing alert and closing", async () => {
    const user = userEvent.setup();
    const mockError = {
      response: { data: { detail: "Cannot cast 'name' to integer" } },
    };
    transformProject.mockRejectedValue(mockError);

    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "name");
    await user.selectOptions(selects[1], "integer");
    await user.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled();
      expect(mockAlert).toHaveBeenCalledWith("Cannot cast 'name' to integer");
      expect(mockOnClose).toHaveBeenCalledOnce();
    });

    // onTransform should not have been called on error
    expect(mockOnTransform).not.toHaveBeenCalled();
  });

  it("handles generic errors when response has no detail", async () => {
    const user = userEvent.setup();
    const mockError = new Error("Network Error");
    transformProject.mockRejectedValue(mockError);

    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "name");
    await user.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith("Failed to cast data type.");
    });
  });

  it("validates that column selection is required", () => {
    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    const columnSelect = screen.getAllByRole("combobox")[0];
    expect(columnSelect).toHaveAttribute("required");
  });

  it("prevents form submission when no column is selected", async () => {
    const user = userEvent.setup();
    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    const columnSelect = screen.getAllByRole("combobox")[0];

    // Try to submit without selecting a column
    await user.click(screen.getByRole("button", { name: /apply/i }));

    // The column select should be invalid (no selection)
    expect(columnSelect).toBeInvalid();

    // API should not have been called
    expect(transformProject).not.toHaveBeenCalled();
  });

  it("works with empty columns array from context", () => {
    useProjectContext.mockReturnValue({
      columns: [],
    });

    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    // Should still render the form
    expect(screen.getByRole("heading", { name: /cast data type/i })).toBeInTheDocument();

    // Should only have the placeholder option in column select
    const columnSelect = screen.getAllByRole("combobox")[0];
    const options = columnSelect.querySelectorAll("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent(/select column/i);
  });

  it("supports all target data types", async () => {
    const user = userEvent.setup();
    const targetTypes = [
      { value: "string", label: "String" },
      { value: "integer", label: "Integer" },
      { value: "float", label: "Float" },
      { value: "boolean", label: "Boolean" },
      { value: "datetime", label: "DateTime" },
    ];

    for (const { value, label } of targetTypes) {
      vi.clearAllMocks();
      transformProject.mockResolvedValue({ columns: [], rows: [] });

      const { unmount } = render(
        <CastDataTypeForm
          projectId={mockProjectId}
          onClose={mockOnClose}
          onTransform={mockOnTransform}
        />
      );

      const selects = screen.getAllByRole("combobox");
      await user.selectOptions(selects[0], "id");
      await user.selectOptions(selects[1], value);
      await user.click(screen.getByRole("button", { name: /apply/i }));

      await waitFor(() => {
        expect(transformProject).toHaveBeenCalledWith(
          mockProjectId,
          expect.objectContaining({
            cast_data_type_params: expect.objectContaining({
              target_type: value,
            }),
          })
        );
      });

      unmount();
    }
  });

  it("handles column names with special characters", () => {
    const specialColumns = ["user_name", "first-name", "col.with.dots", "col with spaces"];
    useProjectContext.mockReturnValue({
      columns: specialColumns,
    });

    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    for (const column of specialColumns) {
      expect(screen.getByRole("option", { name: column })).toBeInTheDocument();
    }
  });

  it("closes modal even when API call fails", async () => {
    const user = userEvent.setup();
    const mockError = new Error("Network Error");
    transformProject.mockRejectedValue(mockError);

    render(
      <CastDataTypeForm
        projectId={mockProjectId}
        onClose={mockOnClose}
        onTransform={mockOnTransform}
      />
    );

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "age");
    await user.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledOnce();
    });
  });
});
