import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FILTER } from "../constants/operationTypes";
import FilterForm from "../Components/forms/FilterForm";
import { transformProject } from "../api";
import { useProjectContext } from "../context/ProjectContext";
import usePreviewSave from "../hooks/usePreviewSave";

vi.mock("../api", () => ({
  transformProject: vi.fn(),
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
    <select aria-label="Condition" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

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
    ...render(<FilterForm projectId="project-123" onClose={onClose} />),
  };
};

describe("FilterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    transformProject.mockResolvedValue({
      columns: ["amount", "created_at"],
      rows: [["100", "2026-07-18"]],
      dtypes: { amount: "integer", created_at: "datetime" },
    });
  });

  it("renders column, condition, value controls and buttons", () => {
    renderForm();

    expect(screen.getByTestId("filter-form")).toBeInTheDocument();
    expect(screen.getByLabelText("Column")).toBeInTheDocument();
    expect(screen.getByLabelText("Condition")).toBeInTheDocument();
    expect(screen.getByTestId("filter-value")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply Filter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("uses = as the default condition", () => {
    renderForm();

    expect(screen.getByLabelText("Condition")).toHaveValue("=");
  });

  it("shows a validation error when no column is selected", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByTestId("filter-value"), "100");
    fireEvent.submit(screen.getByTestId("filter-form").querySelector("form"));

    await waitFor(() => {
      expect(screen.getByText("Please select a column.")).toBeInTheDocument();
    });
    expect(transformProject).not.toHaveBeenCalled();
    expect(mockEnterPreviewMode).not.toHaveBeenCalled();
  });

  it("submits the filter parameters for preview", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.selectOptions(screen.getByLabelText("Condition"), ">");
    await user.type(screen.getByTestId("filter-value"), "50");
    await user.click(screen.getByRole("button", { name: "Apply Filter" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: FILTER,
          parameters: { column: "amount", condition: ">", value: "50" },
        },
        { preview: true },
      );
    });
  });

  it("enters preview mode using the transformation response", async () => {
    const user = userEvent.setup();
    const response = { columns: ["amount"], rows: [[100]], dtypes: { amount: "integer" } };
    transformProject.mockResolvedValue(response);

    renderForm();
    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.type(screen.getByTestId("filter-value"), "50");
    await user.click(screen.getByRole("button", { name: "Apply Filter" }));

    await waitFor(() => {
      expect(mockEnterPreviewMode).toHaveBeenCalledWith(
        response.columns,
        response.rows,
        response.dtypes,
        {
          projectId: "project-123",
          payload: {
            operation_type: FILTER,
            parameters: { column: "amount", condition: "=", value: "50" },
          },
        },
      );
    });
  });

  it("disables the Apply Filter button while the request is pending", async () => {
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
    await user.type(screen.getByTestId("filter-value"), "50");
    await user.click(screen.getByRole("button", { name: "Apply Filter" }));

    expect(screen.getByRole("button", { name: "Apply Filter" })).toBeDisabled();

    resolveTransform({ columns: [], rows: [], dtypes: {} });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Apply Filter" })).not.toBeDisabled();
    });
  });

  it("shows the backend error message when the filter request fails", async () => {
    const user = userEvent.setup();
    transformProject.mockRejectedValue({
      response: { data: { detail: "Invalid filter expression." } },
    });

    renderForm();
    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.type(screen.getByTestId("filter-value"), "50");
    await user.click(screen.getByRole("button", { name: "Apply Filter" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid filter expression.")).toBeInTheDocument();
    });
    expect(mockEnterPreviewMode).not.toHaveBeenCalled();
  });

  it("disables Apply Filter and displays Save Changes in preview mode", () => {
    renderForm({ isPreviewMode: true });

    expect(screen.getByRole("button", { name: "Apply Filter" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
  });

  it("calls the preview save handler when Save Changes is clicked", async () => {
    const user = userEvent.setup();
    renderForm({ isPreviewMode: true });

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(mockHandleSave).toHaveBeenCalledTimes(1);
  });

  it("shows saving state while preview changes are being saved", () => {
    renderForm({ isPreviewMode: true, saving: true });

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply Filter" })).toBeDisabled();
  });

  it("cancels preview mode when Cancel is clicked during preview", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderForm({ isPreviewMode: true, onClose });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockCancelPreview).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes the form when Cancel is clicked outside preview mode", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderForm({ isPreviewMode: false, onClose });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockCancelPreview).not.toHaveBeenCalled();
  });
});
