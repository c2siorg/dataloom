import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MeltForm from "../Components/forms/MeltForm";
import { transformProject, getProjectDetails } from "../api";
import { useProjectContext } from "../context/ProjectContext";
import usePreviewSave from "../hooks/usePreviewSave";

vi.mock("../api", () => ({
  transformProject: vi.fn(),
  getProjectDetails: vi.fn(),
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

const mockEnterPreviewMode = vi.fn();
const mockCancelPreview = vi.fn();
const mockHandleSave = vi.fn();

const renderForm = async ({ isPreviewMode = false, onClose = vi.fn(), saving = false } = {}) => {
  useProjectContext.mockReturnValue({
    isPreviewMode,
    enterPreviewMode: mockEnterPreviewMode,
    cancelPreview: mockCancelPreview,
  });

  usePreviewSave.mockReturnValue({
    saving,
    handleSave: mockHandleSave,
  });

  const utils = render(<MeltForm projectId="project-123" onClose={onClose} />);

  await waitFor(() => {
    expect(getProjectDetails).toHaveBeenCalledWith("project-123");
  });

  return { onClose, ...utils };
};

describe("MeltForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useProjectContext.mockReturnValue({
      isPreviewMode: false,
      enterPreviewMode: mockEnterPreviewMode,
      cancelPreview: mockCancelPreview,
    });

    usePreviewSave.mockReturnValue({
      saving: false,
      handleSave: mockHandleSave,
    });

    getProjectDetails.mockResolvedValue({
      columns: ["amount", "created_at", "region"],
    });

    transformProject.mockResolvedValue({
      columns: ["variable", "value"],
      rows: [["amount", "100"]],
      dtypes: {
        variable: "string",
        value: "string",
      },
    });
  });

  it("loads dataset columns on mount and renders the multi-selects", async () => {
    await renderForm();

    const multiSelects = screen.getAllByRole("listbox");

    expect(multiSelects).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Apply Melt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows an error if fetching columns fails", async () => {
    getProjectDetails.mockRejectedValue(new Error("network down"));

    render(<MeltForm projectId="project-123" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load dataset columns. Please close and reopen the form."),
      ).toBeInTheDocument();
    });
  });

  it("requires at least one ID variable", async () => {
    const user = userEvent.setup();

    await renderForm();

    await user.click(screen.getByRole("button", { name: "Apply Melt" }));

    await waitFor(() => {
      expect(screen.getByText("Please select at least one ID variable.")).toBeInTheDocument();
    });

    expect(transformProject).not.toHaveBeenCalled();
  });

  it("shows an error when the same column is used as both ID and value variable", async () => {
    const user = userEvent.setup();

    await renderForm();

    const [idSelect, valueSelect] = screen.getAllByRole("listbox");

    await user.selectOptions(idSelect, "amount");
    await user.selectOptions(valueSelect, "amount");

    await user.click(screen.getByRole("button", { name: "Apply Melt" }));

    await waitFor(() => {
      expect(
        screen.getByText("Columns cannot be in both ID and Value variables: amount"),
      ).toBeInTheDocument();
    });

    expect(transformProject).not.toHaveBeenCalled();
  });

  it("defaults value variables to all non-ID columns when left empty", async () => {
    const user = userEvent.setup();

    await renderForm();

    const [idSelect] = screen.getAllByRole("listbox");

    await user.selectOptions(idSelect, "amount");

    await user.click(screen.getByRole("button", { name: "Apply Melt" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: "melt",
          melt_params: {
            id_vars: ["amount"],
            value_vars: ["created_at", "region"],
            var_name: "variable",
            value_name: "value",
          },
        },
        { preview: true },
      );
    });
  });

  it("submits custom variable and value names", async () => {
    const user = userEvent.setup();

    await renderForm();

    const [idSelect, valueSelect] = screen.getAllByRole("listbox");

    await user.selectOptions(idSelect, "amount");
    await user.selectOptions(valueSelect, "region");

    const variableNameInput = screen.getByPlaceholderText("default: variable");
    const valueNameInput = screen.getByPlaceholderText("default: value");

    await user.clear(variableNameInput);
    await user.type(variableNameInput, "metric");

    await user.clear(valueNameInput);
    await user.type(valueNameInput, "reading");

    await user.click(screen.getByRole("button", { name: "Apply Melt" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: "melt",
          melt_params: {
            id_vars: ["amount"],
            value_vars: ["region"],
            var_name: "metric",
            value_name: "reading",
          },
        },
        { preview: true },
      );
    });
  });

  it("enters preview mode using the transformation response", async () => {
    const user = userEvent.setup();

    const response = {
      columns: ["variable", "value"],
      rows: [["amount", "100"]],
      dtypes: {},
    };

    transformProject.mockResolvedValue(response);

    await renderForm();

    const [idSelect] = screen.getAllByRole("listbox");

    await user.selectOptions(idSelect, "amount");

    await user.click(screen.getByRole("button", { name: "Apply Melt" }));

    await waitFor(() => {
      expect(mockEnterPreviewMode).toHaveBeenCalledWith(
        response.columns,
        response.rows,
        response.dtypes,
        expect.objectContaining({
          projectId: "project-123",
        }),
      );
    });
  });

  it("shows a processing state while the request is pending", async () => {
    const user = userEvent.setup();
    let resolveTransform;

    transformProject.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTransform = resolve;
        }),
    );

    await renderForm();

    const [idSelect] = screen.getAllByRole("listbox");

    await user.selectOptions(idSelect, "amount");

    await user.click(screen.getByRole("button", { name: "Apply Melt" }));

    expect(
      screen.getByRole("button", {
        name: "Processing...",
      }),
    ).toBeDisabled();

    resolveTransform({
      columns: [],
      rows: [],
      dtypes: {},
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Apply Melt",
        }),
      ).not.toBeDisabled();
    });
  });

  it("shows the backend error message when the melt request fails", async () => {
    const user = userEvent.setup();

    transformProject.mockRejectedValue({
      response: {
        data: {
          detail: "Unable to melt dataset.",
        },
      },
    });

    await renderForm();

    const [idSelect] = screen.getAllByRole("listbox");

    await user.selectOptions(idSelect, "amount");

    await user.click(screen.getByRole("button", { name: "Apply Melt" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to melt dataset.")).toBeInTheDocument();
    });

    expect(mockEnterPreviewMode).not.toHaveBeenCalled();
  });

  it("disables Apply Melt and displays Save Changes in preview mode", async () => {
    await renderForm({
      isPreviewMode: true,
    });

    expect(
      screen.getByRole("button", {
        name: "Apply Melt",
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

    await renderForm({
      isPreviewMode: true,
    });

    await user.click(
      screen.getByRole("button", {
        name: "Save Changes",
      }),
    );

    expect(mockHandleSave).toHaveBeenCalledTimes(1);
  });

  it("cancels preview mode when Cancel is clicked during preview", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    await renderForm({
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

    await renderForm({
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
});
