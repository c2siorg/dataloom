import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportViewProvider, useReportView } from "../ReportViewContext";

const getProjectReport = vi.fn();
vi.mock("../../api/reports", () => ({
  getProjectReport: (...args: unknown[]) => getProjectReport(...args),
}));

let dataVersion = 1;
vi.mock("../ProjectContext", () => ({
  useProjectContext: () => ({ projectId: "p1", dataVersion }),
}));

beforeEach(() => {
  dataVersion = 1;
  getProjectReport
    .mockReset()
    .mockResolvedValue({ blob: new Blob(["%PDF"]), filename: "p_report.pdf" });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function Probe() {
  const { sections, toggleSection, generate, stale, filename } = useReportView();
  return (
    <div>
      <span data-testid="sections">{[...sections].sort().join(",")}</span>
      <span data-testid="stale">{String(stale)}</span>
      <span data-testid="filename">{filename ?? "none"}</span>
      <button onClick={() => toggleSection("quality")}>toggle quality</button>
      <button onClick={() => toggleSection("provenance")}>toggle provenance</button>
      <button onClick={generate}>generate</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <ReportViewProvider>
      <Probe />
    </ReportViewProvider>,
  );
}

describe("ReportViewContext", () => {
  it("requests only the chosen sections", async () => {
    const user = userEvent.setup();
    renderProbe();

    await act(async () => {
      await user.click(screen.getByText("toggle quality"));
    });
    await act(async () => {
      await user.click(screen.getByText("generate"));
    });

    await waitFor(() => expect(getProjectReport).toHaveBeenCalled());
    const [, sections] = getProjectReport.mock.calls[0]!;
    expect([...(sections as string[])].sort()).toEqual(["profiles", "provenance"]);
  });

  it("rebuilds once after a run of section changes settles", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderProbe();

    await act(async () => {
      await user.click(screen.getByText("generate"));
    });
    expect(getProjectReport).toHaveBeenCalledTimes(1);

    await act(async () => {
      await user.click(screen.getByText("toggle quality"));
      await user.click(screen.getByText("toggle provenance"));
    });
    expect(getProjectReport).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(getProjectReport).toHaveBeenCalledTimes(2);

    // A section change rebuilds, so it must not also leave the preview stale.
    expect(screen.getByTestId("stale")).toHaveTextContent("false");
  });

  it("marks the preview stale when the data changes after a build", async () => {
    const user = userEvent.setup();
    const { rerender } = renderProbe();

    await act(async () => {
      await user.click(screen.getByText("generate"));
    });
    await waitFor(() => expect(screen.getByTestId("stale")).toHaveTextContent("false"));

    dataVersion = 2;
    act(() => {
      rerender(
        <ReportViewProvider>
          <Probe />
        </ReportViewProvider>,
      );
    });

    expect(screen.getByTestId("stale")).toHaveTextContent("true");
  });
});
