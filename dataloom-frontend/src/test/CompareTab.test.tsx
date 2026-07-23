import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CompareTab } from "../Components/workspace/CompareTab";
import { getProjects, getProjectDetails } from "../api/projects";
import { getChart } from "../api/visualizations";
import { useProjectContext } from "../context/ProjectContext";
import useDatasetSummary from "../hooks/useDatasetSummary";
import useColumnProfiles from "../hooks/useColumnProfiles";

vi.mock("../api/projects", () => ({
  getProjects: vi.fn(),
  getProjectDetails: vi.fn(),
}));

vi.mock("../api/visualizations", () => ({
  getChart: vi.fn(),
}));

vi.mock("../context/ProjectContext", () => ({
  useProjectContext: vi.fn(),
}));

vi.mock("../hooks/useDatasetSummary", () => ({
  default: vi.fn(() => ({ summary: null, error: false, refetch: vi.fn() })),
}));

vi.mock("../hooks/useColumnProfiles", () => ({
  default: vi.fn(() => ({ profiles: {}, loading: false })),
}));

const mockGetProjects = vi.mocked(getProjects);
const mockGetProjectDetails = vi.mocked(getProjectDetails);
const mockGetChart = vi.mocked(getChart);
const mockUseProjectContext = vi.mocked(useProjectContext);
const mockUseDatasetSummary = vi.mocked(useDatasetSummary);
const mockUseColumnProfiles = vi.mocked(useColumnProfiles);

// GET /projects returns a plain array of LastResponse objects, not
// { projects: [...] } — see app/api/endpoints/projects.py:list_projects.
const PROJECTS = [
  { project_id: "b", name: "dataset-b.csv" },
  { project_id: "c", name: "dataset-c.csv" },
];

beforeEach(() => {
  mockGetProjects.mockReset();
  mockGetProjectDetails.mockReset();
  mockGetChart.mockReset();
  mockUseDatasetSummary.mockReset();
  mockUseDatasetSummary.mockReturnValue({ summary: null, error: false, refetch: vi.fn() });
  mockUseColumnProfiles.mockReset();
  mockUseColumnProfiles.mockReturnValue({ profiles: {}, loading: false });
  vi.spyOn(console, "error").mockImplementation(() => {});

  mockUseProjectContext.mockReturnValue({
    columns: ["col1"],
    rows: [["v1"]],
    dtypes: { col1: "object" },
    projectId: "a",
    dataVersion: 0,
  } as never);

  mockGetProjects.mockResolvedValue(PROJECTS as never);
});

describe("CompareTab", () => {
  it("lists the other projects returned by getProjects as compare options", async () => {
    render(<CompareTab projectId="a" />);

    const select = (await screen.findAllByRole("combobox"))[0]!;
    await waitFor(() => expect(select.children.length).toBe(3)); // placeholder + b + c

    expect(screen.getByRole("option", { name: "dataset-b.csv" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "dataset-c.csv" })).toBeInTheDocument();
  });

  it("only applies the response for the currently selected dataset when requests resolve out of order", async () => {
    const user = userEvent.setup();

    let resolveB: (value: unknown) => void = () => {};
    const bPromise = new Promise((resolve) => {
      resolveB = resolve;
    });
    mockGetProjectDetails.mockImplementation((projectId: string) => {
      if (projectId === "b") return bPromise as never;
      if (projectId === "c")
        return Promise.resolve({ columns: ["colC"], rows: [["fromC"]], dtypes: {} }) as never;
      throw new Error(`unexpected projectId ${projectId}`);
    });

    render(<CompareTab projectId="a" />);

    const select = (await screen.findAllByRole("combobox"))[0]!;

    await user.selectOptions(select, "b");
    await user.selectOptions(select, "c");

    await waitFor(() => expect(screen.getByText("fromC")).toBeInTheDocument());

    // The slow "b" response resolves after "c" was already selected and
    // rendered — it must not overwrite the c preview with stale b data.
    resolveB({ columns: ["colB"], rows: [["fromB"]], dtypes: {} });

    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText("fromB")).not.toBeInTheDocument();
    expect(screen.getByText("fromC")).toBeInTheDocument();
  });

  it("shows an error message when the preview fetch fails, instead of a silent blank pane", async () => {
    const user = userEvent.setup();
    mockGetProjectDetails.mockRejectedValue(new Error("network error"));

    render(<CompareTab projectId="a" />);

    const select = (await screen.findAllByRole("combobox"))[0]!;
    await user.selectOptions(select, "b");

    await waitFor(() =>
      expect(screen.getByText(/failed to load dataset preview/i)).toBeInTheDocument(),
    );
  });

  it("shows an error message when loading the comparable project list fails", async () => {
    mockGetProjects.mockReset();
    mockGetProjects.mockRejectedValue(new Error("network error"));

    render(<CompareTab projectId="a" />);

    await waitFor(() => expect(screen.getByText(/failed to load projects/i)).toBeInTheDocument());
  });

  describe("compared-project profiling cache version", () => {
    // The compared project has no live ProjectContext/dataVersion of its own —
    // passing a hardcoded version (e.g. 0) would let the module-level
    // profiling cache (utils/profilingCache.ts, keyed by projectId + version)
    // return another session's stale entry for the same project. Regression
    // test for that: the version passed for the right pane must never be the
    // literal 0, and must change on every fresh selection.
    const lastRightVersion = (
      mockFn: typeof mockUseDatasetSummary | typeof mockUseColumnProfiles,
    ) => {
      const rightCalls = mockFn.mock.calls.filter(([id]) => id === "b");
      return rightCalls.at(-1)?.[2];
    };

    beforeEach(() => {
      mockGetProjectDetails.mockResolvedValue({ columns: [], rows: [], dtypes: {} } as never);
    });

    it("never passes the literal 0 as the compared project's cache version", async () => {
      const user = userEvent.setup();
      render(<CompareTab projectId="a" />);

      const [datasetSelect] = await screen.findAllByRole("combobox");
      await user.selectOptions(datasetSelect!, "b");
      await user.click(screen.getByTitle("Summary"));

      await waitFor(() => expect(lastRightVersion(mockUseDatasetSummary)).not.toBeUndefined());
      expect(lastRightVersion(mockUseDatasetSummary)).not.toBe(0);
    });

    it("uses a different cache version each time the same project is re-selected", async () => {
      const user = userEvent.setup();
      render(<CompareTab projectId="a" />);

      const [datasetSelect] = await screen.findAllByRole("combobox");
      await user.click(screen.getByTitle("Columns"));

      await user.selectOptions(datasetSelect!, "b");
      await waitFor(() => expect(lastRightVersion(mockUseColumnProfiles)).not.toBeUndefined());
      const firstVersion = lastRightVersion(mockUseColumnProfiles);

      // Deselect and re-select the same project — simulates leaving and
      // returning to the same comparison later in the session.
      await user.selectOptions(datasetSelect!, "");
      await user.selectOptions(datasetSelect!, "b");
      await waitFor(() => expect(lastRightVersion(mockUseColumnProfiles)).not.toBe(firstVersion));
    });
  });

  describe("chart config panel", () => {
    beforeEach(() => {
      mockUseProjectContext.mockReturnValue({
        columns: ["item", "qty"],
        rows: [["a", 1]],
        dtypes: { item: "str", qty: "int" },
        projectId: "a",
        dataVersion: 0,
      } as never);
      mockGetProjectDetails.mockResolvedValue({
        columns: ["item", "qty"],
        rows: [["b", 2]],
        dtypes: { item: "str", qty: "int" },
      } as never);
    });

    it("offers all six chart types, matching the standalone Charts tab", async () => {
      const user = userEvent.setup();
      render(<CompareTab projectId="a" />);

      const [datasetSelect] = await screen.findAllByRole("combobox");
      await user.selectOptions(datasetSelect!, "b");
      await user.click(screen.getByTitle("Charts"));

      const typeSelect = screen.getByDisplayValue("Histogram");
      const optionLabels = Array.from(typeSelect.querySelectorAll("option")).map(
        (o) => o.textContent,
      );
      expect(optionLabels).toEqual(["Histogram", "Bar", "Line", "Area", "Scatter", "Pie"]);
    });

    it("sends category (not x) when rendering a bar chart, matching the ChartParams contract", async () => {
      const user = userEvent.setup();
      mockGetChart.mockResolvedValue({
        chart_type: "bar",
        title: "t",
        x_label: "x",
        y_label: "y",
        series: [],
      } as never);

      render(<CompareTab projectId="a" />);

      const [datasetSelect] = await screen.findAllByRole("combobox");
      await user.selectOptions(datasetSelect!, "b");
      await user.click(screen.getByTitle("Charts"));

      await user.selectOptions(screen.getByDisplayValue("Histogram"), "bar");
      await user.selectOptions(screen.getByRole("combobox", { name: /category/i }), "item");
      // agg defaults to "sum": Value stays required until chosen.
      await user.selectOptions(screen.getByRole("combobox", { name: /aggregation/i }), "count");

      await user.click(screen.getByRole("button", { name: /render charts/i }));

      await waitFor(() => expect(mockGetChart).toHaveBeenCalled());
      const params = mockGetChart.mock.calls[0]![1];
      expect(params).toMatchObject({ chart_type: "bar", category: "item", agg: "count" });
      expect(params).not.toHaveProperty("x");
    });
  });
});
