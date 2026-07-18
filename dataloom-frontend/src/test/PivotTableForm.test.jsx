import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PIVOT_TABLES } from "../constants/operationTypes";
import PivotTableForm from "../Components/forms/PivotTableForm";
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
  default: ({ value, onChange }) => (
    <select
      multiple
      aria-label="Index"
      value={value}
      onChange={(event) =>
        onChange(Array.from(event.target.selectedOptions).map((option) => option.value))
      }
    >
      <option value="region">Region</option>
      <option value="amount">Amount</option>
    </select>
  ),
}));

// PivotTableForm renders two ColumnSelect instances (Column, Value) without a
// distinguishing prop, so the mock tags them in render order for test lookup.
let columnSelectRenderCount = 0;
vi.mock("../Components/common/ColumnSelect", () => ({
  default: ({ value, onChange, placeholder }) => {
    const testId = `pivot-column-select-${columnSelectRenderCount % 2}`;
    columnSelectRenderCount += 1;
    return (
      <select data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        <option value="amount">Amount</option>
        <option value="created_at">Created At</option>
      </select>
    );
  },
}));

vi.mock("../Components/common/Select", () => ({
  default: ({ value, onChange, options }) => (
    <select
      aria-label="Aggregation Function"
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
    ...render(<PivotTableForm projectId="project-123" onClose={onClose} />),
  };
};

const getColumnSelects = () => [
  screen.getByTestId("pivot-column-select-0"),
  screen.getByTestId("pivot-column-select-1"),
];

describe("PivotTableForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    transformProject.mockResolvedValue({
      columns: ["region", "amount"],
      rows: [["north", "100"]],
      dtypes: { region: "string", amount: "integer" },
    });
  });

  it("renders index, column, value, and aggregation controls", () => {
    renderForm();

    expect(screen.getByLabelText("Index")).toBeInTheDocument();
    expect(screen.getByLabelText("Aggregation Function")).toBeInTheDocument();
    expect(screen.getByText("Column:")).toBeInTheDocument();
    expect(screen.getByText("Value:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });

  it("uses sum as the default aggregation function", () => {
    renderForm();

    expect(screen.getByLabelText("Aggregation Function")).toHaveValue("sum");
  });

  it("shows a validation error when no index column is selected", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByText("Please select at least one index column.")).toBeInTheDocument();
    });
    expect(transformProject).not.toHaveBeenCalled();
  });

  it("shows a validation error when column or value is missing", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Index"), "region");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByText("Please select a column and a value.")).toBeInTheDocument();
    });
    expect(transformProject).not.toHaveBeenCalled();
  });

  it("submits index, column, value, and aggregation function", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Index"), "region");
    const [columnSelect, valueSelect] = getColumnSelects();
    await user.selectOptions(columnSelect, "created_at");
    await user.selectOptions(valueSelect, "amount");
    await user.selectOptions(screen.getByLabelText("Aggregation Function"), "mean");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: PIVOT_TABLES,
          pivot_query: {
            index: "region",
            column: "created_at",
            value: "amount",
            aggfun: "mean",
          },
        },
        { preview: true },
      );
    });
  });

  it("enters preview mode using the transformation response", async () => {
    const user = userEvent.setup();
    const response = {
      columns: ["region", "amount"],
      rows: [["north", 100]],
      dtypes: { region: "string", amount: "integer" },
    };
    transformProject.mockResolvedValue(response);

    renderForm();
    await user.selectOptions(screen.getByLabelText("Index"), "region");
    const [columnSelect, valueSelect] = getColumnSelects();
    await user.selectOptions(columnSelect, "created_at");
    await user.selectOptions(valueSelect, "amount");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(mockEnterPreviewMode).toHaveBeenCalledWith(
        response.columns,
        response.rows,
        response.dtypes,
        expect.objectContaining({ projectId: "project-123" }),
      );
    });
  });

  it("shows the backend error message when the pivot request fails", async () => {
    const user = userEvent.setup();
    transformProject.mockRejectedValue({
      response: { data: { detail: "Unable to build pivot table." } },
    });

    renderForm();
    await user.selectOptions(screen.getByLabelText("Index"), "region");
    const [columnSelect, valueSelect] = getColumnSelects();
    await user.selectOptions(columnSelect, "created_at");
    await user.selectOptions(valueSelect, "amount");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to build pivot table.")).toBeInTheDocument();
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
