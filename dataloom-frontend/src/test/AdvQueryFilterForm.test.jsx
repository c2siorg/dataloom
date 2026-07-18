import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADV_QUERY_FILTER } from "../constants/operationTypes";
import AdvQueryFilterForm from "../Components/forms/AdvQueryFilterForm";
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
    ...render(<AdvQueryFilterForm projectId="project-123" onClose={onClose} />),
  };
};

describe("AdvQueryFilterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    transformProject.mockResolvedValue({
      columns: ["amount"],
      rows: [["100"]],
      dtypes: { amount: "integer" },
    });
  });

  it("renders the query input and buttons", () => {
    renderForm();

    expect(screen.getByPlaceholderText("e.g., col1 > 10 and col2 < 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("requires a query to be entered", () => {
    renderForm();

    expect(screen.getByPlaceholderText("e.g., col1 > 10 and col2 < 5")).toBeRequired();
  });

  it("submits the query for preview", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText("e.g., col1 > 10 and col2 < 5"), "amount > 10");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: ADV_QUERY_FILTER,
          adv_query: { query: "amount > 10" },
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
    await user.type(screen.getByPlaceholderText("e.g., col1 > 10 and col2 < 5"), "amount > 10");
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

  it("disables Submit while the request is pending", async () => {
    const user = userEvent.setup();
    let resolveTransform;
    transformProject.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTransform = resolve;
        }),
    );

    renderForm();
    await user.type(screen.getByPlaceholderText("e.g., col1 > 10 and col2 < 5"), "amount > 10");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();

    resolveTransform({ columns: [], rows: [], dtypes: {} });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Submit" })).not.toBeDisabled();
    });
  });

  it("shows the backend error message when the query request fails", async () => {
    const user = userEvent.setup();
    transformProject.mockRejectedValue({
      response: { data: { detail: "Invalid query syntax." } },
    });

    renderForm();
    await user.type(screen.getByPlaceholderText("e.g., col1 > 10 and col2 < 5"), "amount >>");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid query syntax.")).toBeInTheDocument();
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
