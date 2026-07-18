import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SORT } from "../constants/operationTypes";
import SortForm from "../Components/forms/SortForm";
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
  default: ({ value, onChange, placeholder, "data-testid": testId }) => (
    <select
      aria-label="Column"
      data-testid={testId}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      <option value="amount">Amount</option>
      <option value="created_at">Created At</option>
    </select>
  ),
}));

vi.mock("../Components/common/Select", () => ({
  default: ({ value, onChange, options }) => (
    <select aria-label="Order" value={value} onChange={(event) => onChange(event.target.value)}>
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
    ...render(<SortForm projectId="project-123" onClose={onClose} />),
  };
};

describe("SortForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    transformProject.mockResolvedValue({
      columns: ["amount"],
      rows: [["100"]],
      dtypes: { amount: "integer" },
    });
  });

  it("renders a single sort criterion by default, ascending", () => {
    renderForm();

    expect(screen.getByTestId("sort-column")).toBeInTheDocument();
    expect(screen.getByLabelText("Order")).toHaveValue("true");
    expect(screen.getByRole("button", { name: "Apply Sort" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("adds a new sort criterion row", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Add Sort Criterion" }));

    expect(screen.getAllByLabelText("Column")).toHaveLength(2);
  });

  it("clears the column instead of removing the row when it is the only criterion", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByTestId("sort-column"), "amount");
    await user.click(screen.getByTitle("Remove criterion"));

    expect(screen.getAllByLabelText("Column")).toHaveLength(1);
    expect(screen.getByTestId("sort-column")).toHaveValue("");
  });

  it("removes a criterion row when more than one exists", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Add Sort Criterion" }));
    expect(screen.getAllByLabelText("Column")).toHaveLength(2);

    await user.click(screen.getAllByTitle("Remove criterion")[1]);

    expect(screen.getAllByLabelText("Column")).toHaveLength(1);
  });

  it("reorders criteria when moved down", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByTestId("sort-column"), "amount");
    await user.click(screen.getByRole("button", { name: "Add Sort Criterion" }));
    await user.selectOptions(screen.getAllByLabelText("Column")[1], "created_at");

    await user.click(screen.getAllByTitle("Move down in priority")[0]);

    expect(screen.getByTestId("sort-column")).toHaveValue("created_at");
  });

  it("shows a validation error when any criterion has no column selected", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Apply Sort" }));

    await waitFor(() => {
      expect(screen.getByText("Please select a column for all sort criteria")).toBeInTheDocument();
    });
    expect(transformProject).not.toHaveBeenCalled();
  });

  it("submits the sort criteria with the selected order", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByTestId("sort-column"), "amount");
    await user.selectOptions(screen.getByLabelText("Order"), "false");
    await user.click(screen.getByRole("button", { name: "Apply Sort" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: SORT,
          sort_params: {
            criteria: [{ column: "amount", ascending: false }],
          },
        },
        { preview: true },
      );
    });
  });

  it("submits multiple sort criteria in priority order", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByTestId("sort-column"), "amount");
    await user.click(screen.getByRole("button", { name: "Add Sort Criterion" }));
    await user.selectOptions(screen.getAllByLabelText("Column")[1], "created_at");
    await user.click(screen.getByRole("button", { name: "Apply Sort" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: SORT,
          sort_params: {
            criteria: [
              { column: "amount", ascending: true },
              { column: "created_at", ascending: true },
            ],
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
    await user.selectOptions(screen.getByTestId("sort-column"), "amount");
    await user.click(screen.getByRole("button", { name: "Apply Sort" }));

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
    await user.selectOptions(screen.getByTestId("sort-column"), "amount");
    await user.click(screen.getByRole("button", { name: "Apply Sort" }));

    expect(screen.getByRole("button", { name: "Applying..." })).toBeDisabled();

    resolveTransform({ columns: [], rows: [], dtypes: {} });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Apply Sort" })).not.toBeDisabled();
    });
  });

  it("shows the backend error message when the sort request fails", async () => {
    const user = userEvent.setup();
    transformProject.mockRejectedValue({
      response: { data: { detail: "Unable to sort dataset." } },
    });

    renderForm();
    await user.selectOptions(screen.getByTestId("sort-column"), "amount");
    await user.click(screen.getByRole("button", { name: "Apply Sort" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to sort dataset.")).toBeInTheDocument();
    });
    expect(mockEnterPreviewMode).not.toHaveBeenCalled();
  });

  it("disables Apply Sort and displays Save Changes in preview mode", () => {
    renderForm({ isPreviewMode: true });

    expect(screen.getByRole("button", { name: "Apply Sort" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "Apply Sort" })).toBeDisabled();
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
