import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StandardizeDatesForm from "../Components/forms/StandardizeDatesForm";
import { transformProject, type TransformResult } from "../api";
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
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <select aria-label="Column" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      <option value="created_at">Created At</option>
      <option value="shipped_at">Shipped At</option>
    </select>
  ),
}));

vi.mock("../Components/common/Select", () => ({
  default: ({
    value,
    onChange,
    options,
  }: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <select
      aria-label="Output Format"
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

const mockTransformProject = vi.mocked(transformProject);
const mockUseProjectContext = vi.mocked(useProjectContext);
const mockUsePreviewSave = vi.mocked(usePreviewSave);

const mockEnterPreviewMode = vi.fn();
const mockCancelPreview = vi.fn();
const mockHandleSave = vi.fn();

const PREVIEW_RESPONSE: TransformResult = {
  project_id: "project-123",
  operation_type: "standardizeDates",
  row_count: 2,
  columns: ["created_at"],
  rows: [["2026-05-20"], ["2026-03-26"]],
  dtypes: { created_at: "string" },
  total_rows: 2,
  total_pages: 1,
  page: 1,
  page_size: 50,
};

const renderForm = ({ isPreviewMode = false, onClose = vi.fn(), saving = false } = {}) => {
  mockUseProjectContext.mockReturnValue({
    isPreviewMode,
    enterPreviewMode: mockEnterPreviewMode,
    cancelPreview: mockCancelPreview,
    pageSize: 50,
    columns: ["created_at", "shipped_at"],
  } as unknown as ReturnType<typeof useProjectContext>);

  mockUsePreviewSave.mockReturnValue({
    saving,
    handleSave: mockHandleSave,
  } as unknown as ReturnType<typeof usePreviewSave>);

  return {
    onClose,
    ...render(<StandardizeDatesForm projectId="project-123" onClose={onClose} />),
  };
};

describe("StandardizeDatesForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockTransformProject.mockResolvedValue(PREVIEW_RESPONSE);
  });

  it("renders column and output format controls", () => {
    renderForm();

    expect(screen.getByLabelText("Column")).toBeInTheDocument();
    expect(screen.getByLabelText("Output Format")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("uses iso as the default output format", () => {
    renderForm();

    expect(screen.getByLabelText("Output Format")).toHaveValue("iso");
  });

  it("shows validation error when no column is selected", async () => {
    const user = userEvent.setup();

    renderForm();

    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText("Please select a column.")).toBeInTheDocument();
    expect(mockTransformProject).not.toHaveBeenCalled();
    expect(mockEnterPreviewMode).not.toHaveBeenCalled();
  });

  it("submits the selected column and output format for preview", async () => {
    const user = userEvent.setup();

    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "created_at");
    await user.selectOptions(screen.getByLabelText("Output Format"), "dmy");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(mockTransformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: "standardizeDates",
          standardize_dates_params: {
            column: "created_at",
            output_format: "dmy",
          },
        },
        {
          preview: true,
          page: 1,
          pageSize: 50,
        },
      );
    });
  });

  it("enters preview mode using the transformation response and pagination metadata", async () => {
    const user = userEvent.setup();

    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "created_at");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(mockEnterPreviewMode).toHaveBeenCalledWith(
        PREVIEW_RESPONSE.columns,
        PREVIEW_RESPONSE.rows,
        PREVIEW_RESPONSE.dtypes,
        {
          projectId: "project-123",
          payload: {
            operation_type: "standardizeDates",
            standardize_dates_params: {
              column: "created_at",
              output_format: "iso",
            },
          },
        },
        {
          total_rows: PREVIEW_RESPONSE.total_rows,
          total_pages: PREVIEW_RESPONSE.total_pages,
          page: PREVIEW_RESPONSE.page,
          page_size: PREVIEW_RESPONSE.page_size,
        },
      );
    });
  });

  it("shows applying state while the preview request is pending", async () => {
    const user = userEvent.setup();

    let resolveTransform: (value: TransformResult) => void = () => {};

    mockTransformProject.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTransform = resolve;
        }),
    );

    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "created_at");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByRole("button", { name: "Applying..." })).toBeDisabled();

    resolveTransform(PREVIEW_RESPONSE);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Apply" })).not.toBeDisabled();
    });
  });

  it("shows the backend error message when the column mixes date conventions", async () => {
    const user = userEvent.setup();

    mockTransformProject.mockRejectedValue({
      response: {
        data: {
          detail:
            "Cannot standardize dates in 'created_at': Column mixes day-first and month-first date conventions",
        },
      },
    });

    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "created_at");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(screen.getByText(/day-first and month-first/)).toBeInTheDocument();
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

  it("submits the form when Enter is pressed", async () => {
    const user = userEvent.setup();

    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "shipped_at");
    await user.selectOptions(screen.getByLabelText("Output Format"), "mdy");

    fireEvent.submit(screen.getByRole("button", { name: "Apply" }).closest("form")!);

    await waitFor(() => {
      expect(mockTransformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: "standardizeDates",
          standardize_dates_params: {
            column: "shipped_at",
            output_format: "mdy",
          },
        },
        {
          preview: true,
          page: 1,
          pageSize: 50,
        },
      );
    });
  });
});
