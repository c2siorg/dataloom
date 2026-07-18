import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FillEmptyForm from "../Components/forms/FillEmptyForm";
import { transformProject } from "../api";
import { useProjectContext } from "../context/ProjectContext";
import { useToast } from "../context/ToastContext";
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
  default: ({ value, onChange, includeEmptyOption, emptyLabel }) => (
    <select aria-label="Column" value={value} onChange={(event) => onChange(event.target.value)}>
      {includeEmptyOption && <option value="">{emptyLabel || "Select column"}</option>}
      <option value="amount">Amount</option>
      <option value="created_at">Created At</option>
    </select>
  ),
}));

vi.mock("../Components/common/Select", () => ({
  default: ({ value, onChange, options }) => (
    <select aria-label="Strategy" value={value} onChange={(event) => onChange(event.target.value)}>
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

const renderForm = ({
  isPreviewMode = false,
  onClose = vi.fn(),
  saving = false,
  columns = ["amount", "created_at"],
} = {}) => {
  useProjectContext.mockReturnValue({
    columns,
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
    ...render(<FillEmptyForm projectId="project-123" onClose={onClose} />),
  };
};

describe("FillEmptyForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useToast.mockReturnValue({
      showToast: mockShowToast,
    });

    transformProject.mockResolvedValue({
      columns: ["amount", "created_at"],
      rows: [["100", "2026-07-18"]],
      dtypes: { amount: "integer", created_at: "datetime" },
    });
  });

  it("renders column, strategy, and fill value controls by default", () => {
    renderForm();

    expect(screen.getByLabelText("Column")).toBeInTheDocument();
    expect(screen.getByLabelText("Strategy")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter value")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("uses custom as the default strategy", () => {
    renderForm();

    expect(screen.getByLabelText("Strategy")).toHaveValue("custom");
  });

  it("hides the fill value input when strategy requires a column", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Strategy"), "mean");

    expect(screen.queryByPlaceholderText("Enter value")).not.toBeInTheDocument();
  });

  it("disables Apply when a column-requiring strategy has no column selected", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Strategy"), "median");

    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("shows a toast error when submitted without a required column", async () => {
    renderForm();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Strategy"), "mode");

    const form = screen.getByRole("button", { name: "Apply" }).closest("form");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        "Please select a column to use mean, median, or mode.",
        "error",
      );
    });
    expect(transformProject).not.toHaveBeenCalled();
  });

  it("submits with a custom fill value and null column index", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText("Enter value"), "N/A");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: "fillEmpty",
          fill_empty_params: {
            index: null,
            strategy: "custom",
            fill_value: "N/A",
          },
        },
        { preview: true },
      );
    });
  });

  it("submits the column index and null fill value for mean strategy", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Strategy"), "mean");
    await user.selectOptions(screen.getByLabelText("Column"), "created_at");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: "fillEmpty",
          fill_empty_params: {
            index: 1,
            strategy: "mean",
            fill_value: null,
          },
        },
        { preview: true },
      );
    });
  });

  it("enters preview mode using the transformation response", async () => {
    const user = userEvent.setup();
    const response = { columns: ["amount"], rows: [[1]], dtypes: { amount: "integer" } };
    transformProject.mockResolvedValue(response);

    renderForm();
    await user.type(screen.getByPlaceholderText("Enter value"), "0");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(mockEnterPreviewMode).toHaveBeenCalledWith(
        response.columns,
        response.rows,
        response.dtypes,
        expect.objectContaining({ projectId: "project-123" }),
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
    await user.type(screen.getByPlaceholderText("Enter value"), "0");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByRole("button", { name: "Applying..." })).toBeDisabled();

    resolveTransform({ columns: [], rows: [], dtypes: {} });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Apply" })).not.toBeDisabled();
    });
  });

  it("shows the backend error message when the request fails", async () => {
    const user = userEvent.setup();
    transformProject.mockRejectedValue({
      response: { data: { detail: "Unable to fill empty cells." } },
    });

    renderForm();
    await user.type(screen.getByPlaceholderText("Enter value"), "0");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to fill empty cells.")).toBeInTheDocument();
    });
    expect(mockShowToast).toHaveBeenCalledWith("Unable to fill empty cells.", "error");
    expect(mockEnterPreviewMode).not.toHaveBeenCalled();
  });

  it("shows a fallback toast message when the request fails without backend detail", async () => {
    const user = userEvent.setup();
    transformProject.mockRejectedValue(new Error("Network error"));

    renderForm();
    await user.type(screen.getByPlaceholderText("Enter value"), "0");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith("Failed to fill empty cells.", "error");
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
    renderForm({ isPreviewMode: true, saving: true });

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
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
