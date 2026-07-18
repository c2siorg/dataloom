import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STRING_REPLACE } from "../constants/operationTypes";
import StringReplaceForm from "../Components/forms/StringReplaceForm";
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
  default: ({ value, onChange }) => (
    <select aria-label="Column" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select column</option>
      <option value="amount">Amount</option>
      <option value="created_at">Created At</option>
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
    ...render(<StringReplaceForm projectId="project-123" onClose={onClose} />),
  };
};

describe("StringReplaceForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    transformProject.mockResolvedValue({
      columns: ["amount"],
      rows: [["100"]],
      dtypes: { amount: "integer" },
    });
  });

  it("renders column, find, and replace controls", () => {
    renderForm();

    expect(screen.getByLabelText("Column")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Text to find")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Replacement text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
  });

  it("shows a validation error when no column is selected", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText("Text to find"), "foo");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(screen.getByText("Please select a column.")).toBeInTheDocument();
    });
    expect(transformProject).not.toHaveBeenCalled();
  });

  it("submits column, find value, and replace value", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.type(screen.getByPlaceholderText("Text to find"), "foo");
    await user.type(screen.getByPlaceholderText("Replacement text"), "bar");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: STRING_REPLACE,
          string_replace_params: {
            column: "amount",
            find_value: "foo",
            replace_value: "bar",
          },
        },
        { preview: true },
      );
    });
  });

  it("allows an empty replace value", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.type(screen.getByPlaceholderText("Text to find"), "foo");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: STRING_REPLACE,
          string_replace_params: {
            column: "amount",
            find_value: "foo",
            replace_value: "",
          },
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
    await user.type(screen.getByPlaceholderText("Text to find"), "foo");
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

  it("shows applying state while the request is pending", async () => {
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
    await user.type(screen.getByPlaceholderText("Text to find"), "foo");
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
      response: { data: { detail: "Unable to replace text." } },
    });

    renderForm();
    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.type(screen.getByPlaceholderText("Text to find"), "foo");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to replace text.")).toBeInTheDocument();
    });
    expect(mockEnterPreviewMode).not.toHaveBeenCalled();
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
