import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { CheckpointsTab } from "../Components/workspace/HistoryTabs";
import JobBanner from "../Components/workspace/JobBanner";
import { ToastProvider } from "../context/ToastContext";
import { ActiveJobProvider } from "../context/ActiveJobContext";
import { getCheckpoints } from "../api/logs";
import { getJob, listProjectJobs, submitJob } from "../api/jobs";
import { advance, makeJob } from "./jobFixtures";

vi.mock("../api/logs", () => ({
  getCheckpoints: vi.fn(),
}));

vi.mock("../api/jobs", async () => {
  const actual = await vi.importActual<typeof import("../api/jobs")>("../api/jobs");
  return {
    ...actual,
    submitJob: vi.fn(),
    getJob: vi.fn(),
    listProjectJobs: vi.fn(),
    cancelJob: vi.fn(),
  };
});

const mockGetCheckpoints = getCheckpoints as unknown as Mock;
const mockSubmit = submitJob as unknown as Mock;
const mockGet = getJob as unknown as Mock;
const mockList = listProjectJobs as unknown as Mock;

const mockRefreshProject = vi.fn(() => Promise.resolve());
const mockMarkDataChanged = vi.fn();

vi.mock("../context/ProjectContext", () => ({
  useProjectContext: () => ({
    projectId: "proj-1",
    page: 3,
    pageSize: 50,
    refreshProject: mockRefreshProject,
    markDataChanged: mockMarkDataChanged,
  }),
}));

const mockRefreshLogs = vi.fn();
vi.mock("../context/HistoryRefreshContext", () => ({
  useHistoryRefresh: () => ({ refreshLogs: mockRefreshLogs, refreshCheckpoints: vi.fn() }),
  useHistoryRefreshTokens: () => ({ logsToken: 0, checkpointsToken: 0 }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ projectId: "proj-1" }),
  };
});

// Mock ResizeObserver
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const revertJob = (overrides = {}) =>
  makeJob({ kind: "revert", params: { checkpoint_id: "checkpoint-1" }, ...overrides });

const renderComponent = async () => {
  render(
    <ToastProvider>
      <ActiveJobProvider projectId="proj-1">
        <JobBanner />
        <CheckpointsTab />
      </ActiveJobProvider>
    </ToastProvider>,
  );
  await advance(0); // checkpoints and the resume check
};

const confirmRevert = async () => {
  fireEvent.click(screen.getAllByRole("button", { name: "Revert" })[0]!);
  fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
  await advance(0);
};

describe("CheckpointsTab - revert as a job", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockList.mockResolvedValue([]);
    mockGetCheckpoints.mockResolvedValue([
      { id: "checkpoint-1", created_at: new Date().toISOString(), message: "Initial commit" },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submits a revert job and reloads the current page when it finishes", async () => {
    mockSubmit.mockResolvedValue(revertJob());
    mockGet.mockResolvedValue(revertJob({ status: "succeeded" }));
    await renderComponent();
    expect(screen.getByText("Initial commit")).toBeInTheDocument();

    await confirmRevert();

    expect(mockSubmit).toHaveBeenCalledWith("proj-1", {
      kind: "revert",
      checkpoint_id: "checkpoint-1",
    });
    expect(screen.getByRole("progressbar", { name: "Reverting" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revert" })).toBeDisabled();

    await advance(1000);

    // The page the user was on (3 of size 50) is what gets reloaded.
    expect(mockRefreshProject).toHaveBeenCalledWith("proj-1", 3, 50);
    expect(mockMarkDataChanged).toHaveBeenCalledTimes(1);
    expect(mockRefreshLogs).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Project reverted successfully!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revert" })).toBeEnabled();
  });

  it("shows the job's error when the revert fails", async () => {
    mockSubmit.mockResolvedValue(revertJob());
    mockGet.mockResolvedValue(revertJob({ status: "failed", error: "File not found" }));
    await renderComponent();

    await confirmRevert();
    await advance(1000);

    expect(screen.getByText("File not found")).toBeInTheDocument();
    expect(mockRefreshProject).not.toHaveBeenCalled();
  });

  it("keeps Revert disabled while a job resumed after a reload is running", async () => {
    mockList.mockResolvedValue([makeJob({ status: "running" })]);
    mockGet.mockResolvedValue(makeJob({ status: "running" }));
    await renderComponent();

    expect(screen.getByRole("button", { name: "Revert" })).toBeDisabled();
    expect(screen.getByTestId("job-banner")).toBeInTheDocument();
  });
});
