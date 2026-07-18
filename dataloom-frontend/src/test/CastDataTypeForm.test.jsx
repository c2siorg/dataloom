import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAST_DATA_TYPE } from "../constants/operationTypes";
import CastDataTypeForm from "../Components/forms/CastDataTypeForm";
import { transformProject } from "../api";
import { useToast } from "../context/ToastContext";
import { useProjectContext } from "../context/ProjectContext";
import usePreviewSave from "../hooks/usePreviewSave";

vi.mock("../api", () => ({
  transformProject: vi.fn(),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: vi.fn(),
}));

vi.mock("../context/ProjectContext", () => ({
  useProjectContext: vi.fn(),
}));

vi.mock("../hooks/usePreviewSave", () => ({
  default: vi.fn(),
}));

vi.mock("../Components/common/ColumnSelect", () => ({
  default: ({ value, onChange, placeholder }) => (
    <select aria-label="Column" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      <option value="amount">Amount</option>
      <option value="created_at">Created At</option>
    </select>
  ),
}));

vi.mock("../Components/common/Select", () => ({
  default: ({ value, onChange, options }) => (
    <select
      aria-label="Target Type"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const mockShowToast = vi.fn();
const mockEnterPreviewMode = vi.fn();
const mockCancelPreview = vi.fn();
const mockHandleSave = vi.fn();

const renderForm = ({ isPreviewMode = false, onClose = vi.fn(), saving = false } = {}) => {
  useProjectContext.mockReturnValue({
    isPreviewMode,
    enterPreviewMode: mockEnterPreviewMode,
    cancelPreview: mockCancelPreview,
  });

  usePreviewSave.mockReturnValue({
    saving,
    handleSave: mockHandleSave,
  });

  return {
    onClose,
    ...render(<CastDataTypeForm projectId="project-123" onClose={onClose} />),
  };
};

describe("CastDataTypeForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useToast.mockReturnValue({
      showToast: mockShowToast,
    });

    transformProject.mockResolvedValue({
      columns: ["amount", "created_at"],
      rows: [
        ["100", "2026-07-18"],
        ["200", "2026-07-19"],
      ],
      dtypes: {
        amount: "integer",
        created_at: "datetime",
      },
    });
  });

  it("renders column and target type controls", () => {
    renderForm();

    expect(screen.getByLabelText("Column")).toBeInTheDocument();
    expect(screen.getByLabelText("Target Type")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("uses string as the default target type", () => {
    renderForm();

    expect(screen.getByLabelText("Target Type")).toHaveValue("string");
  });

  it("shows validation error when no column is selected", async () => {
    const user = userEvent.setup();

    renderForm();

    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText("Please select a column.")).toBeInTheDocument();
    expect(transformProject).not.toHaveBeenCalled();
    expect(mockEnterPreviewMode).not.toHaveBeenCalled();
  });

  it("submits the selected column and target type for preview", async () => {
    const user = userEvent.setup();

    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.selectOptions(screen.getByLabelText("Target Type"), "float");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: CAST_DATA_TYPE,
          cast_data_type_params: {
            column: "amount",
            target_type: "float",
          },
        },
        {
          preview: true,
        },
      );
    });
  });

  it("enters preview mode using the transformation response", async () => {
    const user = userEvent.setup();

    const response = {
      columns: ["amount"],
      rows: [[100], [200]],
      dtypes: {
        amount: "integer",
      },
    };

    transformProject.mockResolvedValue(response);

    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(mockEnterPreviewMode).toHaveBeenCalledWith(
        response.columns,
        response.rows,
        response.dtypes,
        {
          projectId: "project-123",
          payload: {
            operation_type: CAST_DATA_TYPE,
            cast_data_type_params: {
              column: "amount",
              target_type: "string",
            },
          },
        },
      );
    });
  });

  it("shows applying state while the preview request is pending", async () => {
    const user = userEvent.setup();

    let resolveTransform;
    transformProject.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTransform = resolve;
        }),
    );

    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByRole("button", { name: "Applying..." })).toBeDisabled();

    resolveTransform({
      columns: ["amount"],
      rows: [[100]],
      dtypes: { amount: "integer" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Apply" })).not.toBeDisabled();
    });
  });

  it("shows the backend error message when preview fails", async () => {
    const user = userEvent.setup();

    transformProject.mockRejectedValue({
      response: {
        data: {
          detail: "Unable to cast column to integer.",
        },
      },
    });

    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.selectOptions(screen.getByLabelText("Target Type"), "integer");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith("Unable to cast column to integer.", "error");
    });

    expect(mockEnterPreviewMode).not.toHaveBeenCalled();
  });

  it("shows a fallback message when preview fails without backend detail", async () => {
    const user = userEvent.setup();

    transformProject.mockRejectedValue(new Error("Network error"));

    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith("Failed to cast data type.", "error");
    });
  });

  it("disables Apply and displays Save Changes in preview mode", () => {
    renderForm({ isPreviewMode: true });

    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
  });

  it("calls the preview save handler when Save Changes is clicked", async () => {
    const user = userEvent.setup();

    renderForm({ isPreviewMode: true });

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(mockHandleSave).toHaveBeenCalledTimes(1);
  });

  it("shows saving state while preview changes are being saved", () => {
    renderForm({
      isPreviewMode: true,
      saving: true,
    });

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("cancels preview mode when Cancel is clicked during preview", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderForm({
      isPreviewMode: true,
      onClose,
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockCancelPreview).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes the form when Cancel is clicked outside preview mode", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderForm({
      isPreviewMode: false,
      onClose,
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockCancelPreview).not.toHaveBeenCalled();
  });

  it("submits the form when Enter is pressed", async () => {
    const user = userEvent.setup();

    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "created_at");
    await user.selectOptions(screen.getByLabelText("Target Type"), "datetime");

    fireEvent.submit(screen.getByRole("button", { name: "Apply" }).closest("form"));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: CAST_DATA_TYPE,
          cast_data_type_params: {
            column: "created_at",
            target_type: "datetime",
          },
        },
        {
          preview: true,
        },
      );
    });
  });
});
