import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PipelineCard } from "../PipelineCard";
import JobBanner from "../../workspace/JobBanner";
import { ToastProvider } from "../../../context/ToastContext";
import {
  ActiveJobProvider,
  ALREADY_RUNNING_MESSAGE,
  CANCELLED_MESSAGE,
  TOO_LATE_MESSAGE,
} from "../../../context/ActiveJobContext";
import { cancelJob, getJob, listProjectJobs, submitJob } from "../../../api/jobs";
import type { Pipeline } from "../../../api/pipelines";
import { advance, makeJob } from "../../../test/jobFixtures";

vi.mock("../../../api/jobs", async () => {
  const actual = await vi.importActual<typeof import("../../../api/jobs")>("../../../api/jobs");
  return {
    ...actual,
    submitJob: vi.fn(),
    getJob: vi.fn(),
    listProjectJobs: vi.fn(),
    cancelJob: vi.fn(),
  };
});

vi.mock("../../../api/pipelines", () => ({
  checkPipeline: vi.fn(),
  deletePipeline: vi.fn(),
}));

const refreshProject = vi.fn(() => Promise.resolve());
const markDataChanged = vi.fn();
vi.mock("../../../context/ProjectContext", () => ({
  useProjectContext: () => ({ refreshProject, markDataChanged, page: 3, pageSize: 50 }),
}));

const refreshLogs = vi.fn();
vi.mock("../../../context/HistoryRefreshContext", () => ({
  useHistoryRefresh: () => ({ refreshLogs, refreshCheckpoints: vi.fn() }),
}));

const mockSubmit = submitJob as unknown as Mock;
const mockGet = getJob as unknown as Mock;
const mockList = listProjectJobs as unknown as Mock;
const mockCancel = cancelJob as unknown as Mock;

const pipeline: Pipeline = {
  id: "pipe-1",
  name: "Clean up",
  description: null,
  created_at: "2026-09-30T00:00:00Z",
  steps: [
    { step_order: 0, action_type: "filter", action_details: {} },
    { step_order: 1, action_type: "sort", action_details: {} },
  ],
};

const run = (overrides = {}) =>
  makeJob({ kind: "pipelineRun", params: { pipeline_id: "pipe-1" }, ...overrides });

const renderCard = async () => {
  render(
    <ToastProvider>
      <ActiveJobProvider projectId="proj-1">
        <JobBanner />
        <PipelineCard pipeline={pipeline} projectId="proj-1" onDeleted={vi.fn()} />
      </ActiveJobProvider>
    </ToastProvider>,
  );
  await advance(0); // settle the resume check
};

const applyButton = () => screen.getByRole("button", { name: /Apply to this project|Running…/ });
const bar = () => screen.getByRole("progressbar", { name: "Running pipeline" });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockList.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PipelineCard running as a job", () => {
  it("submits a pipelineRun job and shows its progress", async () => {
    mockSubmit.mockResolvedValue(run());
    mockGet.mockResolvedValue(
      run({
        status: "running",
        progress: { current: 1, total: 2, message: "Step 1 of 2 · Filter" },
      }),
    );
    await renderCard();

    fireEvent.click(applyButton());
    await advance(0);

    expect(mockSubmit).toHaveBeenCalledWith("proj-1", {
      kind: "pipelineRun",
      pipeline_id: "pipe-1",
    });
    expect(applyButton()).toHaveTextContent("Running…");
    expect(applyButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();

    await advance(1000);
    expect(bar()).toHaveAttribute("aria-valuenow", "50");
    expect(bar()).toHaveAttribute("aria-valuetext", "Step 1 of 2 · Filter");
  });

  it("on success reloads the page it is on, the logs, and says so", async () => {
    mockSubmit.mockResolvedValue(run());
    mockGet.mockResolvedValue(run({ status: "succeeded" }));
    await renderCard();

    fireEvent.click(applyButton());
    await advance(0);
    await advance(1000);

    expect(refreshProject).toHaveBeenCalledWith("proj-1", 3, 50);
    expect(markDataChanged).toHaveBeenCalledTimes(1);
    expect(refreshLogs).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Pipeline "Clean up" applied.')).toBeInTheDocument();
    expect(screen.queryByTestId("job-banner")).not.toBeInTheDocument();
    expect(applyButton()).toHaveTextContent("Apply to this project");
    expect(applyButton()).toBeEnabled();
  });

  it("on failure shows the job's error and changes nothing", async () => {
    mockSubmit.mockResolvedValue(run());
    mockGet.mockResolvedValue(
      run({ status: "failed", error: "Pipeline step 0 (filter) failed: Column 'x' not found" }),
    );
    await renderCard();

    fireEvent.click(applyButton());
    await advance(0);
    await advance(1000);

    expect(
      screen.getByText("Pipeline step 0 (filter) failed: Column 'x' not found"),
    ).toBeInTheDocument();
    expect(refreshProject).not.toHaveBeenCalled();
    expect(applyButton()).toBeEnabled();
  });

  it("cancels from the banner", async () => {
    mockSubmit.mockResolvedValue(run({ status: "running" }));
    mockCancel.mockResolvedValue(run({ status: "running", cancel_requested: true }));
    mockGet.mockResolvedValue(run({ status: "cancelled", cancel_requested: true }));
    await renderCard();

    fireEvent.click(applyButton());
    await advance(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await advance(0);

    expect(mockCancel).toHaveBeenCalledWith("job-1");
    expect(screen.getByRole("button", { name: "Cancelling…" })).toBeDisabled();

    await advance(1000);
    expect(screen.getByText(CANCELLED_MESSAGE)).toBeInTheDocument();
    expect(refreshProject).not.toHaveBeenCalled();
    expect(screen.queryByTestId("job-banner")).not.toBeInTheDocument();
  });

  it("says so when the cancel arrived too late, and still reloads", async () => {
    mockSubmit.mockResolvedValue(run({ status: "running" }));
    mockCancel.mockResolvedValue(run({ status: "running", cancel_requested: true }));
    mockGet.mockResolvedValue(run({ status: "succeeded", cancel_requested: true }));
    await renderCard();

    fireEvent.click(applyButton());
    await advance(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await advance(1000);

    expect(screen.getByText(TOO_LATE_MESSAGE)).toBeInTheDocument();
    expect(refreshProject).toHaveBeenCalledWith("proj-1", 3, 50);
  });

  it("resumes a job that was running before a reload", async () => {
    mockList.mockResolvedValue([
      run({
        status: "running",
        progress: { current: 7, total: 10, message: "Step 7 of 10 · Sort" },
      }),
    ]);
    mockGet.mockResolvedValue(run({ status: "succeeded" }));
    await renderCard();

    expect(mockList).toHaveBeenCalledWith("proj-1", { active: true });
    expect(bar()).toHaveAttribute("aria-valuenow", "70");
    expect(applyButton()).toBeDisabled();

    await advance(1000);
    // Started before the reload, so the default message stands in for the card's.
    expect(screen.getByText("Pipeline applied.")).toBeInTheDocument();
    expect(refreshProject).toHaveBeenCalledWith("proj-1", 3, 50);
  });

  it("follows a job already running elsewhere instead of failing", async () => {
    mockSubmit.mockRejectedValue({
      response: {
        status: 409,
        data: { detail: ALREADY_RUNNING_MESSAGE, active_job_id: "job-other" },
      },
    });
    mockGet.mockResolvedValue(makeJob({ id: "job-other", kind: "revert", status: "running" }));
    await renderCard();

    fireEvent.click(applyButton());
    await advance(0);

    expect(mockGet).toHaveBeenCalledWith("job-other");
    expect(screen.getByText(ALREADY_RUNNING_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Reverting" })).toBeInTheDocument();
    expect(applyButton()).toBeDisabled();
  });

  it("shows why a submit was refused", async () => {
    mockSubmit.mockRejectedValue({
      response: { status: 429, data: { detail: "You have too many jobs running." } },
    });
    await renderCard();

    fireEvent.click(applyButton());
    await advance(0);

    expect(screen.getByText("You have too many jobs running.")).toBeInTheDocument();
    expect(screen.queryByTestId("job-banner")).not.toBeInTheDocument();
    expect(applyButton()).toBeEnabled();
  });
});
