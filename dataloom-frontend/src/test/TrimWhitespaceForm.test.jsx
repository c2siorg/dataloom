import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRIM_WHITESPACE } from "../constants/operationTypes";
import TrimWhitespaceForm from "../Components/forms/TrimWhitespaceForm";
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
  default: ({ value, onChange, options }) => (
    <select aria-label="Column" value={value} onChange={(event) => onChange(event.target.value)}>
      {(options || []).map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  ),
}));

const mockEnterPreviewMode = vi.fn();
const mockCancelPreview = vi.fn();
const mockHandleSave = vi.fn();

const renderForm = ({
  isPreviewMode = false,
  onClose = vi.fn(),
  saving = false,
  pageSize = 50,
  columns = ["amount", "created_at"],
} = {}) => {
  useProjectContext.mockReturnValue({
    columns,
    pageSize,
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
    ...render(<TrimWhitespaceForm projectId="project-123" onClose={onClose} />),
  };
};

describe("TrimWhitespaceForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    transformProject.mockResolvedValue({
      columns: ["amount"],
      rows: [["100"]],
      dtypes: { amount: "integer" },
    });
  });

  it("renders the column control including the All string columns option", () => {
    renderForm();

    const select = screen.getByLabelText("Column");

    expect(select).toBeInTheDocument();
    expect(screen.getByText("All string columns")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows a validation error when no column is selected", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(screen.getByText("Please select a column.")).toBeInTheDocument();
    });

    expect(transformProject).not.toHaveBeenCalled();
  });

  it("submits the selected column for trimming", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: TRIM_WHITESPACE,
          trim_whitespace_params: {
            column: "amount",
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

  it("allows selecting All string columns", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "All string columns");

    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: TRIM_WHITESPACE,
          trim_whitespace_params: {
            column: "All string columns",
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

  it("enters preview mode using the transformation response", async () => {
    const user = userEvent.setup();

    const response = {
      columns: ["amount"],
      rows: [[100]],
      dtypes: { amount: "integer" },
      total_rows: 1,
      total_pages: 1,
      page: 1,
      page_size: 50,
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
        expect.objectContaining({
          projectId: "project-123",
          payload: {
            operation_type: TRIM_WHITESPACE,
            trim_whitespace_params: {
              column: "amount",
            },
          },
        }),
        {
          total_rows: 1,
          total_pages: 1,
          page: 1,
          page_size: 50,
        },
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
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByRole("button", { name: "Applying..." })).toBeDisabled();

    resolveTransform({
      columns: [],
      rows: [],
      dtypes: {},
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Apply" })).not.toBeDisabled();
    });
  });

  it("shows the backend error message when the request fails", async () => {
    const user = userEvent.setup();

    transformProject.mockRejectedValue({
      response: {
        data: {
          detail: "Unable to trim whitespace.",
        },
      },
    });

    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to trim whitespace.")).toBeInTheDocument();
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

  it("does not call enterPreviewMode when the component unmounts during loading", async () => {
    const user = userEvent.setup();

    let resolveTransform;

    transformProject.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTransform = resolve;
        }),
    );

    const { unmount } = renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    unmount();

    resolveTransform({
      columns: [],
      rows: [],
      dtypes: {},
    });

    await Promise.resolve();

    expect(mockEnterPreviewMode).not.toHaveBeenCalled();
  });

  it("allows re-submit after a cancelled in-flight request", async () => {
    const user = userEvent.setup();

    let resolveTransform;

    transformProject.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTransform = resolve;
        }),
    );

    const { unmount } = renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    unmount();

    resolveTransform({
      columns: [],
      rows: [],
      dtypes: {},
    });

    transformProject.mockResolvedValue({
      columns: [],
      rows: [],
      dtypes: {},
    });

    renderForm();

    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledTimes(2);
    });
  });
});
