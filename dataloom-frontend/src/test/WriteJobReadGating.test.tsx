import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ProjectLoader } from "../Components/DataScreen";
import Table from "../Components/Table";
import { ActiveJobProvider, useProjectReadsOnHold } from "../context/ActiveJobContext";
import { ToastProvider } from "../context/ToastContext";
import { PanelProvider } from "../context/PanelContext";
import { getJob, listProjectJobs } from "../api/jobs";
import { getColumnProfiles } from "../api/profiling";
import { getProjectMeta } from "../api/projects";
import { clearProfilingCache } from "../utils/profilingCache";
import { advance, makeJob } from "./jobFixtures";

vi.mock("../api/jobs", async () => {
  const actual = await vi.importActual<typeof import("../api/jobs")>("../api/jobs");
  return { ...actual, getJob: vi.fn(), listProjectJobs: vi.fn(), submitJob: vi.fn() };
});

vi.mock("../api/profiling", () => ({ getColumnProfiles: vi.fn(() => Promise.resolve([])) }));

vi.mock("../api/projects", async () => {
  const actual = await vi.importActual<typeof import("../api/projects")>("../api/projects");
  return { ...actual, getProjectMeta: vi.fn(() => Promise.resolve({ name: "Sales 2026" })) };
});

const project = {
  projectId: "proj-1",
  columns: ["City"],
  rows: [["Pune"]],
  dtypes: { City: "string" },
  columnOrder: [0],
  setColumnOrder: vi.fn(),
  updateData: vi.fn(),
  dataVersion: 0,
  totalRows: 150,
  totalPages: 3,
  page: 1,
  pageSize: 50,
  setPaginationData: vi.fn(),
  refreshProject: vi.fn(() => Promise.resolve()),
  markDataChanged: vi.fn(),
  setProjectInfo: vi.fn(),
  isPreviewMode: false,
};

vi.mock("../context/ProjectContext", () => ({ useProjectContext: () => project }));
vi.mock("../context/HistoryRefreshContext", () => ({
  useHistoryRefresh: () => ({ refreshLogs: vi.fn(), refreshCheckpoints: vi.fn() }),
}));

const mockGet = getJob as unknown as Mock;
const mockList = listProjectJobs as unknown as Mock;
const mockProfiles = getColumnProfiles as unknown as Mock;

const running = makeJob({ status: "running", progress: { current: 1, total: 4, message: "" } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  // A cached profile would make "no fetch" pass for the wrong reason.
  clearProfilingCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ProjectLoader", () => {
  it("loads the table once the check for a running job comes back empty", async () => {
    mockList.mockResolvedValue([]);

    render(
      <ToastProvider>
        <ActiveJobProvider projectId="proj-1">
          <ProjectLoader projectId="proj-1" />
        </ActiveJobProvider>
      </ToastProvider>,
    );
    expect(project.refreshProject).not.toHaveBeenCalled(); // waits for the check
    await advance(0);

    expect(project.setProjectInfo).toHaveBeenCalledWith("proj-1");
    expect(project.refreshProject).toHaveBeenCalledWith("proj-1");
  });

  it("does not read the project while a write job runs; the job's end reloads it once", async () => {
    mockList.mockResolvedValue([running]);
    mockGet.mockResolvedValueOnce(running).mockResolvedValue(makeJob({ status: "succeeded" }));

    render(
      <ToastProvider>
        <ActiveJobProvider projectId="proj-1">
          <ProjectLoader projectId="proj-1" />
        </ActiveJobProvider>
      </ToastProvider>,
    );
    await advance(0);
    // The name comes from metadata, which the job's lock does not hold up.
    expect(getProjectMeta).toHaveBeenCalledWith("proj-1");
    expect(project.setProjectInfo).toHaveBeenCalledWith("proj-1", "Sales 2026");
    await advance(1000);
    expect(project.refreshProject).not.toHaveBeenCalled();

    await advance(1000);
    expect(project.refreshProject).toHaveBeenCalledTimes(1);
    expect(project.refreshProject).toHaveBeenCalledWith("proj-1", 1, 50);
  });
});

describe("Table while a write job runs", () => {
  function Probe() {
    return useProjectReadsOnHold() ? <span>reads on hold</span> : null;
  }

  const renderTable = async (jobs: unknown[]) => {
    mockList.mockResolvedValue(jobs);
    mockGet.mockResolvedValue(running);
    render(
      <PanelProvider>
        <ToastProvider>
          <ActiveJobProvider projectId="proj-1">
            <Probe />
            <Table projectId="proj-1" showColumnProfiles />
          </ActiveJobProvider>
        </ToastProvider>
      </PanelProvider>,
    );
    await advance(0);
  };

  it("pages and profiles normally without a job", async () => {
    await renderTable([]);

    expect(screen.queryByText("reads on hold")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
    expect(mockProfiles).toHaveBeenCalledWith("proj-1");
  });

  it("says why an unloaded table is empty while a job runs", async () => {
    const rows = project.rows;
    project.rows = [];
    try {
      await renderTable([running]);
      expect(screen.getByTestId("table-held-by-job")).toHaveTextContent(
        "The table loads when the running job finishes.",
      );
    } finally {
      project.rows = rows;
    }
  });

  it("holds paging and profile reads until the job ends", async () => {
    await renderTable([running]);

    expect(screen.getByText("reads on hold")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(mockProfiles).not.toHaveBeenCalled();
  });

  it("renders outside a workspace, with nothing to wait for", () => {
    render(
      <PanelProvider>
        <ToastProvider>
          <Table projectId="proj-1" />
        </ToastProvider>
      </PanelProvider>,
    );

    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });
});
