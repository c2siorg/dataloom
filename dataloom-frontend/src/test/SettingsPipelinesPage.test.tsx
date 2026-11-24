import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPipelinesPage from "../pages/settings/SettingsPipelinesPage";
import { deletePipeline, getPipelines } from "../api/pipelines";

const showToast = vi.fn();

vi.mock("../api/pipelines", () => ({
  getPipelines: vi.fn(),
  deletePipeline: vi.fn(),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({ showToast }),
}));

const savedPipeline = {
  id: "pipeline-1",
  name: "Clean up",
  description: "Standardize names and filter rows.",
  created_at: "2026-02-03T00:00:00Z",
  steps: [
    {
      step_order: 1,
      action_type: "sort",
      action_details: { sort_params: { column: "name", ascending: true } },
    },
    {
      step_order: 0,
      action_type: "filter",
      action_details: { parameters: { column: "age", condition: ">", value: 26 } },
    },
  ],
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <SettingsPipelinesPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPipelines).mockResolvedValue([savedPipeline]);
  vi.mocked(deletePipeline).mockResolvedValue({ success: true, message: "Pipeline deleted" });
});

describe("SettingsPipelinesPage", () => {
  it("shows pipeline details collapsed and reveals steps in run order on expansion", async () => {
    renderPage();

    expect(screen.getByText("Loading saved pipelines…")).toBeInTheDocument();
    expect(await screen.findByText("Clean up")).toBeInTheDocument();
    expect(screen.getByText("Standardize names and filter rows.")).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          `Created ${new Date(savedPipeline.created_at).toLocaleDateString()}`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("2 steps")).toBeInTheDocument();
    expect(screen.queryByText("Age > 26")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show 2 steps/i }));

    expect(screen.getByText("age > 26")).toBeInTheDocument();
    expect(screen.getByText("name ↑")).toBeInTheDocument();
    const stepItems = within(screen.getByRole("list", { name: "Clean up steps" })).getAllByRole(
      "listitem",
    );
    expect(stepItems[0]).toHaveTextContent("Filter");
    expect(stepItems[1]).toHaveTextContent("Sort");
  });

  it("renders an empty state after a successful empty response", async () => {
    vi.mocked(getPipelines).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/no saved pipelines yet/i)).toBeInTheDocument();
  });

  it("shows a retryable error when loading fails", async () => {
    vi.mocked(getPipelines).mockRejectedValueOnce(new Error("offline"));
    renderPage();

    expect(await screen.findByText(/could not load saved pipelines/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Clean up")).toBeInTheDocument();
    expect(getPipelines).toHaveBeenCalledTimes(2);
  });

  it("waits for confirmation and prevents duplicate deletes while deletion is pending", async () => {
    vi.mocked(getPipelines).mockResolvedValueOnce([savedPipeline]).mockResolvedValueOnce([]);
    let resolveDelete!: (value: { success: boolean; message: string }) => void;
    vi.mocked(deletePipeline).mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      }),
    );
    renderPage();
    await screen.findByText("Clean up");

    fireEvent.click(screen.getByRole("button", { name: /delete clean up/i }));
    expect(deletePipeline).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(deletePipeline).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /deleting/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /deleting/i }));
    expect(deletePipeline).toHaveBeenCalledTimes(1);

    resolveDelete({ success: true, message: "Pipeline deleted" });
    await waitFor(() => expect(getPipelines).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/no saved pipelines yet/i)).toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith('Pipeline "Clean up" deleted.', "success");
  });

  it("does not delete when confirmation is cancelled", async () => {
    renderPage();
    await screen.findByText("Clean up");

    fireEvent.click(screen.getByRole("button", { name: /delete clean up/i }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deletePipeline).not.toHaveBeenCalled();
    expect(screen.getByText("Clean up")).toBeInTheDocument();
  });

  it("preserves the pipeline and reports an error when deletion fails", async () => {
    vi.mocked(deletePipeline).mockRejectedValue(new Error("network issue"));
    renderPage();
    await screen.findByText("Clean up");

    fireEvent.click(screen.getByRole("button", { name: /delete clean up/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Clean up")).toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith("Failed to delete pipeline.", "error");
    expect(getPipelines).toHaveBeenCalledTimes(1);
  });
});
