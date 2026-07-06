import { render, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import GroupByForm from "../Components/forms/GroupByForm";
import { transformProject } from "../api";

vi.mock("../api", () => ({
  transformProject: vi.fn(),
}));

const mockContext = {
  columns: ["City", "Amount", "Date"],
  dtypes: { City: "string", Amount: "float", Date: "date" },
  columnOrder: [0, 1, 2],
  updateData: vi.fn(),
  enterPreviewMode: vi.fn(),
  cancelPreview: vi.fn(),
  confirmPreview: vi.fn(),
  refreshProject: vi.fn(),
  pageSize: 50,
  pendingTransform: null,
  isPreviewMode: false,
};

vi.mock("../context/ProjectContext", () => ({
  useProjectContext: () => mockContext,
}));

vi.mock("../context/HistoryRefreshContext", () => ({
  useHistoryRefresh: () => ({ refreshLogs: vi.fn(), refreshCheckpoints: vi.fn() }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockContext.isPreviewMode = false;
  mockContext.pendingTransform = null;
});

describe("GroupByForm", () => {
  it("calls enterPreviewMode after successful apply", async () => {
    transformProject.mockResolvedValueOnce({
      columns: ["City", "Amount"],
      rows: [["Paris", "300"]],
      dtypes: { City: "string", Amount: "float" },
    });

    const { getByText, getByTestId, getByRole } = render(
      <GroupByForm projectId="proj-1" onClose={vi.fn()} />,
    );
    const { fireEvent } = await import("@testing-library/react");

    fireEvent.click(getByText("City"));
    fireEvent.click(getByTestId("groupby-agg-column"));
    fireEvent.click(within(getByRole("listbox")).getByText("Amount"));
    fireEvent.click(getByText("Apply GroupBy"));

    await vi.waitFor(() => {
      expect(mockContext.enterPreviewMode).toHaveBeenCalledWith(
        ["City", "Amount"],
        [["Paris", "300"]],
        { City: "string", Amount: "float" },
        {
          payload: {
            operation_type: "groupby",
            groupby_params: {
              columns: ["City"],
              agg_column: "Amount",
              agg_function: "sum",
            },
          },
          projectId: "proj-1",
        },
      );
    });
  });

  it("does not call enterPreviewMode when transform fails", async () => {
    transformProject.mockRejectedValueOnce(new Error("Server error"));

    const { getByText, getByTestId, getByRole } = render(
      <GroupByForm projectId="proj-1" onClose={vi.fn()} />,
    );
    const { fireEvent } = await import("@testing-library/react");

    fireEvent.click(getByText("City"));
    fireEvent.click(getByTestId("groupby-agg-column"));
    fireEvent.click(within(getByRole("listbox")).getByText("Amount"));
    fireEvent.click(getByText("Apply GroupBy"));

    await vi.waitFor(() => {
      expect(mockContext.enterPreviewMode).not.toHaveBeenCalled();
    });
  });

  it("does not call enterPreviewMode when user closes during loading", async () => {
    let resolveTransform;
    transformProject.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTransform = resolve;
        }),
    );

    const { getByText, getByTestId, getByRole, unmount } = render(
      <GroupByForm projectId="proj-1" onClose={vi.fn()} />,
    );
    const { fireEvent } = await import("@testing-library/react");

    fireEvent.click(getByText("City"));
    fireEvent.click(getByTestId("groupby-agg-column"));
    fireEvent.click(within(getByRole("listbox")).getByText("Amount"));
    fireEvent.click(getByText("Apply GroupBy"));
    unmount();

    resolveTransform({
      columns: ["City", "Amount"],
      rows: [["Paris", "300"]],
      dtypes: { City: "string", Amount: "float" },
    });

    await vi.waitFor(() => {
      expect(mockContext.enterPreviewMode).not.toHaveBeenCalled();
    });
  });

  it("allows re-submit after a cancelled in-flight request", async () => {
    let resolveFirst;
    transformProject.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const { getByText, getByTestId, getByRole, unmount } = render(
      <GroupByForm projectId="proj-1" onClose={vi.fn()} />,
    );
    const { fireEvent } = await import("@testing-library/react");

    fireEvent.click(getByText("City"));
    fireEvent.click(getByTestId("groupby-agg-column"));
    fireEvent.click(within(getByRole("listbox")).getByText("Amount"));
    fireEvent.click(getByText("Apply GroupBy"));
    unmount();
    resolveFirst({ columns: [], rows: [], dtypes: {} });

    transformProject.mockResolvedValueOnce({
      columns: ["City", "Amount"],
      rows: [["Paris", "300"]],
      dtypes: { City: "string", Amount: "float" },
    });

    const {
      getByText: getByText2,
      getByTestId: getByTestId2,
      getByRole: getByRole2,
    } = render(<GroupByForm projectId="proj-1" onClose={vi.fn()} />);
    fireEvent.click(getByText2("City"));
    fireEvent.click(getByTestId2("groupby-agg-column"));
    fireEvent.click(within(getByRole2("listbox")).getByText("Amount"));
    fireEvent.click(getByText2("Apply GroupBy"));

    await vi.waitFor(() => {
      expect(mockContext.enterPreviewMode).toHaveBeenCalledTimes(1);
    });
  });

  it("calls cancelPreview when Cancel clicked in preview mode", async () => {
    mockContext.isPreviewMode = true;

    const { getByText } = render(<GroupByForm projectId="proj-1" onClose={vi.fn()} />);
    const { fireEvent } = await import("@testing-library/react");

    fireEvent.click(getByText("Cancel"));

    expect(mockContext.cancelPreview).toHaveBeenCalled();
  });

  it("calls onClose when Cancel clicked outside preview mode", async () => {
    const onClose = vi.fn();

    const { getByText } = render(<GroupByForm projectId="proj-1" onClose={onClose} />);
    const { fireEvent } = await import("@testing-library/react");

    fireEvent.click(getByText("Cancel"));

    expect(onClose).toHaveBeenCalled();
  });

  it("calls cancelPreview on unmount when in preview mode", async () => {
    mockContext.isPreviewMode = true;

    const { unmount } = render(<GroupByForm projectId="proj-1" onClose={vi.fn()} />);
    unmount();

    expect(mockContext.cancelPreview).toHaveBeenCalled();
  });
});
