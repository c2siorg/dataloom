import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_ROWS } from "../constants/operationTypes";
import SampleRowsForm from "../Components/forms/SampleRowsForm";
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
    ...render(<SampleRowsForm projectId="project-123" onClose={onClose} />),
  };
};

describe("SampleRowsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    transformProject.mockResolvedValue({
      columns: ["amount"],
      rows: [["100"]],
      dtypes: { amount: "integer" },
    });
  });

  it("renders sample size, random seed inputs and buttons", () => {
    renderForm();

    expect(screen.getByPlaceholderText("e.g., 100")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g., 42")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply Sample" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("disables Apply Sample when no sample size is entered", () => {
    renderForm();

    expect(screen.getByRole("button", { name: "Apply Sample" })).toBeDisabled();
  });

  it("shows an error for a non-positive sample size", async () => {
    const user = userEvent.setup();
    renderForm();

    const sampleSizeInput = screen.getByPlaceholderText("e.g., 100");

    await user.type(sampleSizeInput, "0");

    fireEvent.submit(sampleSizeInput.closest("form"));

    expect(await screen.findByText("Sample size must be a positive integer")).toBeInTheDocument();

    expect(transformProject).not.toHaveBeenCalled();
  });

  it("shows an error for a random seed outside the valid range", async () => {
    const user = userEvent.setup();
    renderForm();

    const sampleSizeInput = screen.getByPlaceholderText("e.g., 100");
    const randomSeedInput = screen.getByPlaceholderText("e.g., 42");

    await user.type(sampleSizeInput, "10");
    await user.type(randomSeedInput, "-1");

    fireEvent.submit(sampleSizeInput.closest("form"));

    expect(
      await screen.findByText("Random seed must be between 0 and 4294967295"),
    ).toBeInTheDocument();

    expect(transformProject).not.toHaveBeenCalled();
  });

  it("submits with an explicit random seed", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText("e.g., 100"), "10");
    await user.type(screen.getByPlaceholderText("e.g., 42"), "42");
    await user.click(screen.getByRole("button", { name: "Apply Sample" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: SAMPLE_ROWS,
          sample_params: { sample_size: 10, random_seed: 42 },
        },
        { preview: true },
      );
    });
  });

  it("auto-generates a random seed when none is provided", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText("e.g., 100"), "10");
    await user.click(screen.getByRole("button", { name: "Apply Sample" }));

    await waitFor(() => {
      expect(transformProject).toHaveBeenCalledWith(
        "project-123",
        {
          operation_type: SAMPLE_ROWS,
          sample_params: {
            sample_size: 10,
            random_seed: expect.any(Number),
          },
        },
        { preview: true },
      );
    });

    const [, payload] = transformProject.mock.calls[0];
    expect(payload.sample_params.random_seed).toBeGreaterThanOrEqual(0);
    expect(payload.sample_params.random_seed).toBeLessThanOrEqual(4294967295);
  });

  it("enters preview mode using the transformation response", async () => {
    const user = userEvent.setup();
    const response = { columns: ["amount"], rows: [[100]], dtypes: { amount: "integer" } };
    transformProject.mockResolvedValue(response);

    renderForm();
    await user.type(screen.getByPlaceholderText("e.g., 100"), "10");
    await user.click(screen.getByRole("button", { name: "Apply Sample" }));

    await waitFor(() => {
      expect(mockEnterPreviewMode).toHaveBeenCalledWith(
        response.columns,
        response.rows,
        response.dtypes,
        expect.objectContaining({ projectId: "project-123" }),
      );
    });
  });

  it("shows the backend error message when the request fails", async () => {
    const user = userEvent.setup();
    transformProject.mockRejectedValue({
      response: { data: { detail: "Sample size exceeds row count." } },
    });

    renderForm();
    await user.type(screen.getByPlaceholderText("e.g., 100"), "10");
    await user.click(screen.getByRole("button", { name: "Apply Sample" }));

    await waitFor(() => {
      expect(screen.getByText("Sample size exceeds row count.")).toBeInTheDocument();
    });
    expect(mockEnterPreviewMode).not.toHaveBeenCalled();
  });

  it("disables Apply Sample and displays Save Changes in preview mode", () => {
    renderForm({ isPreviewMode: true });

    expect(screen.getByRole("button", { name: "Apply Sample" })).toBeDisabled();
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
