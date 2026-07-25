import { fireEvent, render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FilterForm from "../Components/forms/FilterForm";
import TrimWhitespaceForm from "../Components/forms/TrimWhitespaceForm";
import { transformProject } from "../api";

vi.mock("../api", () => ({
  transformProject: vi.fn(),
}));

const mockContext = {
  columns: ["City", "Amount", "Date"],
  dtypes: {
    City: "string",
    Amount: "float",
    Date: "date",
  },
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
  useHistoryRefresh: () => ({
    refreshLogs: vi.fn(),
    refreshCheckpoints: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.resetAllMocks();

  mockContext.columnOrder = [0, 1, 2];
  mockContext.isPreviewMode = false;
  mockContext.pendingTransform = null;
  mockContext.pageSize = 50;
});

describe("PreviewWorkflow — updateData propagation", () => {
  it("calls enterPreviewMode with dtypes and pagination metadata after successful transform", async () => {
    transformProject.mockResolvedValueOnce({
      columns: ["City", "Amount"],
      rows: [["Paris", "300"]],
      dtypes: {
        City: "string",
        Amount: "float",
      },
      total_rows: 1,
      total_pages: 1,
      page: 1,
      page_size: 50,
    });

    const { getByTestId, getByText } = render(<FilterForm projectId="proj-1" onClose={vi.fn()} />);

    fireEvent.click(getByTestId("filter-column"));
    fireEvent.click(getByText("City"));

    const valueInput = getByTestId("filter-value");

    fireEvent.change(valueInput, {
      target: {
        value: "Paris",
      },
    });

    fireEvent.click(getByText("Apply Filter"));

    await vi.waitFor(() => {
      expect(mockContext.enterPreviewMode).toHaveBeenCalledWith(
        ["City", "Amount"],
        [["Paris", "300"]],
        {
          City: "string",
          Amount: "float",
        },
        {
          payload: {
            operation_type: "filter",
            parameters: {
              column: "City",
              condition: "=",
              value: "Paris",
            },
          },
          projectId: "proj-1",
        },
        {
          total_rows: 1,
          total_pages: 1,
          page: 1,
          page_size: 50,
        },
      );
    });
  });

  it("does not call enterPreviewMode when transform fails", async () => {
    transformProject.mockRejectedValueOnce(new Error("Server error"));

    const { getByTestId, getByText } = render(<FilterForm projectId="proj-1" onClose={vi.fn()} />);

    const valueInput = getByTestId("filter-value");

    fireEvent.change(valueInput, {
      target: {
        value: "Paris",
      },
    });

    fireEvent.click(getByText("Apply Filter"));

    await vi.waitFor(() => {
      expect(mockContext.enterPreviewMode).not.toHaveBeenCalled();
    });
  });
});

describe("PreviewWorkflow — Newly migrated forms (TrimWhitespaceForm)", () => {
  it("calls enterPreviewMode with dtypes and pagination metadata on apply", async () => {
    transformProject.mockResolvedValueOnce({
      columns: ["City"],
      rows: [["Paris"]],
      dtypes: {
        City: "string",
      },
      total_rows: 1,
      total_pages: 1,
      page: 1,
      page_size: 50,
    });

    const { getByText } = render(<TrimWhitespaceForm projectId="proj-1" onClose={vi.fn()} />);

    fireEvent.click(getByText("Select column..."));
    fireEvent.click(getByText("City"));

    fireEvent.click(getByText("Apply"));

    await vi.waitFor(() => {
      expect(mockContext.enterPreviewMode).toHaveBeenCalledWith(
        ["City"],
        [["Paris"]],
        {
          City: "string",
        },
        {
          payload: {
            operation_type: "trimWhitespace",
            trim_whitespace_params: {
              column: "City",
            },
          },
          projectId: "proj-1",
        },
        {
          total_rows: 1,
          total_pages: 1,
          page: 1,
          page_size: 50,
        },
      );
    });
  });

  it("calls cancelPreview and stays open when cancelled in preview mode", async () => {
    mockContext.isPreviewMode = true;

    const onCloseMock = vi.fn();

    const { getByText } = render(<TrimWhitespaceForm projectId="proj-1" onClose={onCloseMock} />);

    fireEvent.click(getByText("Cancel"));

    expect(mockContext.cancelPreview).toHaveBeenCalled();

    expect(onCloseMock).not.toHaveBeenCalled();
  });
});
