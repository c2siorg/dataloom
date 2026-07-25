import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GROUPBY } from "../constants/operationTypes";
import GroupByForm from "../Components/forms/GroupByForm";
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
      aria-label="Group By Columns"
      value={value}
      onChange={(event) =>
        onChange(Array.from(event.target.selectedOptions).map((option) => option.value))
      }
    >
      {(options || []).map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("../Components/common/ColumnSelect", () => ({
  default: ({ value, onChange, options }) => (
    <select
      aria-label="Aggregation Column"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Select column...</option>
      {(options || []).map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("../Components/common/Select", () => ({
  default: ({ value, onChange, options }) => (
    <select aria-label="Function" value={value} onChange={(event) => onChange(event.target.value)}>
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

const renderForm = ({
  isPreviewMode = false,
  onClose = vi.fn(),
  saving = false,
  columns = ["amount", "created_at", "region"],
  pageSize = 50,
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
    ...render(<GroupByForm projectId="project-123" onClose={onClose} />),
  };
};

describe("GroupByForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    transformProject.mockResolvedValue({
      columns: ["region", "amount"],
      rows: [["north", "100"]],
      dtypes: {
        region: "string",
        amount: "integer",
      },
      total_rows: 1,
      total_pages: 1,
      page: 1,
      page_size: 50,
    });
  });

  it("renders group by, aggregation column, and function controls", () => {
    renderForm();

    expect(screen.getByLabelText("Group By Columns")).toBeInTheDocument();

    expect(screen.getByLabelText("Aggregation Column")).toBeInTheDocument();

    expect(screen.getByLabelText("Function")).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Apply GroupBy",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Cancel",
      }),
    ).toBeInTheDocument();
  });

  it("uses sum as the default aggregation function", () => {
    renderForm();

    expect(screen.getByLabelText("Function")).toHaveValue("sum");
  });

  it("disables Apply GroupBy until group columns and an aggregation column are selected", async () => {
    const user = userEvent.setup();

    renderForm();

    expect(
      screen.getByRole("button", {
        name: "Apply GroupBy",
      }),
    ).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Group By Columns"), "region");

    expect(
      screen.getByRole("button", {
        name: "Apply GroupBy",
      }),
    ).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Aggregation Column"), "amount");

    expect(
      screen.getByRole("button", {
        name: "Apply GroupBy",
      }),
    ).not.toBeDisabled();
  });

  it("submits the group by, aggregation column, and function", async () => {
    const user = userEvent.setup();

    renderForm();

    await user.selectOptions(screen.getByLabelText("Group By Columns"), "region");

    await user.selectOptions(screen.getByLabelText("Aggregation Column"), "amount");

    await user.selectOptions(screen.getByLabelText("Function"), "mean");

    await user.click(
      screen.getByRole("button", {
        name: "Apply GroupBy",
      }),
    );

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: GROUPBY,
          groupby_params: {
            columns: ["region"],
            agg_column: "amount",
            agg_function: "mean",
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
      columns: ["region", "amount"],
      rows: [["north", 100]],
      dtypes: {
        region: "string",
        amount: "integer",
      },
      total_rows: 1,
      total_pages: 1,
      page: 1,
      page_size: 50,
    };

    transformProject.mockResolvedValue(response);

    renderForm();

    await user.selectOptions(screen.getByLabelText("Group By Columns"), "region");

    await user.selectOptions(screen.getByLabelText("Aggregation Column"), "amount");

    await user.click(
      screen.getByRole("button", {
        name: "Apply GroupBy",
      }),
    );

    await waitFor(() => {
      expect(mockEnterPreviewMode).toHaveBeenCalledWith(
        response.columns,
        response.rows,
        response.dtypes,
        {
          projectId: "project-123",
          payload: {
            operation_type: GROUPBY,
            groupby_params: {
              columns: ["region"],
              agg_column: "amount",
              agg_function: "sum",
            },
          },
        },
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

    await user.selectOptions(screen.getByLabelText("Group By Columns"), "region");

    await user.selectOptions(screen.getByLabelText("Aggregation Column"), "amount");

    await user.click(
      screen.getByRole("button", {
        name: "Apply GroupBy",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Applying...",
      }),
    ).toBeDisabled();

    resolveTransform({
      columns: [],
      rows: [],
      dtypes: {},
      total_rows: 0,
      total_pages: 0,
      page: 1,
      page_size: 50,
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Apply GroupBy",
        }),
      ).not.toBeDisabled();
    });
  });

  it("shows the backend error message when the group by request fails", async () => {
    const user = userEvent.setup();

    transformProject.mockRejectedValue({
      response: {
        data: {
          detail: "Unable to group dataset.",
        },
      },
    });

    renderForm();

    await user.selectOptions(screen.getByLabelText("Group By Columns"), "region");

    await user.selectOptions(screen.getByLabelText("Aggregation Column"), "amount");

    await user.click(
      screen.getByRole("button", {
        name: "Apply GroupBy",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Unable to group dataset.")).toBeInTheDocument();
    });

    expect(mockEnterPreviewMode).not.toHaveBeenCalled();
  });

  it("disables Apply GroupBy and displays Save Changes in preview mode", () => {
    renderForm({
      isPreviewMode: true,
    });

    expect(
      screen.getByRole("button", {
        name: "Apply GroupBy",
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Save Changes",
      }),
    ).toBeInTheDocument();
  });

  it("calls the preview save handler when Save Changes is clicked", async () => {
    const user = userEvent.setup();

    renderForm({
      isPreviewMode: true,
    });

    await user.click(
      screen.getByRole("button", {
        name: "Save Changes",
      }),
    );

    expect(mockHandleSave).toHaveBeenCalledTimes(1);
  });

  it("shows saving state while preview changes are being saved", () => {
    renderForm({
      isPreviewMode: true,
      saving: true,
    });

    expect(
      screen.getByRole("button", {
        name: "Saving...",
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Apply GroupBy",
      }),
    ).toBeDisabled();
  });

  it("cancels preview mode when Cancel is clicked during preview", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderForm({
      isPreviewMode: true,
      onClose,
    });

    await user.click(
      screen.getByRole("button", {
        name: "Cancel",
      }),
    );

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

    await user.click(
      screen.getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);

    expect(mockCancelPreview).not.toHaveBeenCalled();
  });

  it("does not call enterPreviewMode when user closes during loading", async () => {
    const user = userEvent.setup();

    let resolveTransform;

    transformProject.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTransform = resolve;
        }),
    );

    const { unmount } = renderForm();

    await user.selectOptions(screen.getByLabelText("Group By Columns"), "region");

    await user.selectOptions(screen.getByLabelText("Aggregation Column"), "amount");

    await user.click(
      screen.getByRole("button", {
        name: "Apply GroupBy",
      }),
    );

    unmount();

    resolveTransform({
      columns: [],
      rows: [],
      dtypes: {},
      total_rows: 0,
      total_pages: 0,
      page: 1,
      page_size: 50,
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

    await user.selectOptions(screen.getByLabelText("Group By Columns"), "region");

    await user.selectOptions(screen.getByLabelText("Aggregation Column"), "amount");

    await user.click(
      screen.getByRole("button", {
        name: "Apply GroupBy",
      }),
    );

    unmount();

    resolveTransform({
      columns: [],
      rows: [],
      dtypes: {},
      total_rows: 0,
      total_pages: 0,
      page: 1,
      page_size: 50,
    });

    transformProject.mockResolvedValue({
      columns: [],
      rows: [],
      dtypes: {},
      total_rows: 0,
      total_pages: 0,
      page: 1,
      page_size: 50,
    });

    renderForm();

    await user.selectOptions(screen.getByLabelText("Group By Columns"), "region");

    await user.selectOptions(screen.getByLabelText("Aggregation Column"), "amount");

    await user.click(
      screen.getByRole("button", {
        name: "Apply GroupBy",
      }),
    );

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledTimes(2);
    });
  });

  it("calls cancelPreview on unmount when in preview mode", () => {
    const { unmount } = renderForm({
      isPreviewMode: true,
    });

    unmount();

    expect(mockCancelPreview).toHaveBeenCalledTimes(1);
  });

  it("enters preview mode using the transformation response and pagination metadata", async () => {
    const user = userEvent.setup();

    const response = {
      columns: ["region", "amount"],
      rows: [["north", 100]],
      dtypes: {
        region: "string",
        amount: "integer",
      },
      total_rows: 38,
      total_pages: 4,
      page: 2,
      page_size: 10,
    };

    transformProject.mockResolvedValue(response);

    renderForm({
      pageSize: 10,
    });

    await user.selectOptions(screen.getByLabelText("Group By Columns"), "region");

    await user.selectOptions(screen.getByLabelText("Aggregation Column"), "amount");

    await user.click(
      screen.getByRole("button", {
        name: "Apply GroupBy",
      }),
    );

    await waitFor(() => {
      expect(mockEnterPreviewMode).toHaveBeenCalledWith(
        response.columns,
        response.rows,
        response.dtypes,
        expect.objectContaining({
          projectId: "project-123",
          payload: {
            operation_type: GROUPBY,
            groupby_params: {
              columns: ["region"],
              agg_column: "amount",
              agg_function: "sum",
            },
          },
        }),
        {
          total_rows: response.total_rows,
          total_pages: response.total_pages,
          page: response.page,
          page_size: response.page_size,
        },
      );
    });
  });
});
