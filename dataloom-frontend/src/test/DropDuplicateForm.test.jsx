import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DROP_DUPLICATE } from "../constants/operationTypes";
import DropDuplicateForm from "../Components/forms/DropDuplicateForm";
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

vi.mock("../Components/common/ColumnMultiSelect", () => ({
  default: ({ value, onChange, options }) => (
    <select
      multiple
      aria-label="Columns"
      value={value}
      onChange={(event) =>
        onChange(Array.from(event.target.selectedOptions).map((option) => option.value))
      }
    >
      {(options || ["amount", "created_at"]).map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("../Components/common/Select", () => ({
  default: ({ value, onChange, options }) => (
    <select aria-label="Keep" value={value} onChange={(event) => onChange(event.target.value)}>
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
    ...render(<DropDuplicateForm projectId="project-123" onClose={onClose} />),
  };
};

describe("DropDuplicateForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    transformProject.mockResolvedValue({
      columns: ["amount"],
      rows: [["100"]],
      dtypes: { amount: "integer" },
    });
  });

  it("renders columns and keep controls with buttons", () => {
    renderForm();

    expect(screen.getByLabelText("Columns")).toBeInTheDocument();
    expect(screen.getByLabelText("Keep")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("uses first as the default keep option", () => {
    renderForm();

    expect(screen.getByLabelText("Keep")).toHaveValue("first");
  });

  it("shows a validation error when no columns are selected", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByText("Please select at least one column.")).toBeInTheDocument();
    });
    expect(transformProject).not.toHaveBeenCalled();
  });

  it("submits the selected columns joined and keep strategy", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Columns"), ["amount", "created_at"]);
    await user.selectOptions(screen.getByLabelText("Keep"), "last");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: DROP_DUPLICATE,
          drop_duplicate: { columns: "amount,created_at", keep: "last" },
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
    await user.selectOptions(screen.getByLabelText("Columns"), ["amount"]);
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(mockEnterPreviewMode).toHaveBeenCalledWith(
        response.columns,
        response.rows,
        response.dtypes,
        {
          projectId: "project-123",
          payload: {
            operation_type: DROP_DUPLICATE,
            drop_duplicate: { columns: "amount", keep: "first" },
          },
        },
      );
    });
  });

  it("shows the backend error message when the request fails", async () => {
    const user = userEvent.setup();
    transformProject.mockRejectedValue({
      response: { data: { detail: "Unable to drop duplicates." } },
    });

    renderForm();
    await user.selectOptions(screen.getByLabelText("Columns"), ["amount"]);
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to drop duplicates.")).toBeInTheDocument();
    });
    expect(mockEnterPreviewMode).not.toHaveBeenCalled();
  });

  it("disables Submit and displays Save Changes in preview mode", () => {
    renderForm({ isPreviewMode: true });

    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
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
