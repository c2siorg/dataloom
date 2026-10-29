import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { transformProject } from "../../api";
import { useProjectContext } from "../../context/ProjectContext";
import type { PendingTransform } from "../../context/ProjectContext";
import { useHistoryRefresh } from "../../context/HistoryRefreshContext";
import { STALE_PREVIEW_MESSAGE } from "../../utils/errorUtils";
import usePreviewSave from "../usePreviewSave";

vi.mock("../../api", () => ({ transformProject: vi.fn() }));
vi.mock("../../context/ProjectContext", () => ({ useProjectContext: vi.fn() }));
vi.mock("../../context/HistoryRefreshContext", () => ({ useHistoryRefresh: vi.fn() }));

const mockTransform = vi.mocked(transformProject);
const mockContext = {
  confirmPreview: vi.fn(),
  cancelPreview: vi.fn(),
  refreshProject: vi.fn().mockResolvedValue(undefined),
  pageSize: 50,
  pendingTransform: {
    projectId: "project-1",
    payload: { operation_type: "filter" },
    revision: 8,
  } as PendingTransform | null,
};
const refreshLogs = vi.fn();
const clearError = vi.fn();
const handleError = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  mockContext.refreshProject.mockResolvedValue(undefined);
  vi.mocked(useProjectContext).mockReturnValue(mockContext as never);
  vi.mocked(useHistoryRefresh).mockReturnValue({ refreshLogs } as never);
});

describe("usePreviewSave", () => {
  it("commits the reviewed revision and completes the existing save flow", async () => {
    mockTransform.mockResolvedValueOnce({} as never);
    const { result } = renderHook(() => usePreviewSave({ clearError, handleError, onClose }));

    await act(async () => result.current.handleSave());

    expect(mockTransform).toHaveBeenCalledWith(
      "project-1",
      { operation_type: "filter" },
      {
        preview: false,
        expectedRevision: 8,
      },
    );
    expect(mockContext.confirmPreview).toHaveBeenCalledOnce();
    expect(mockContext.refreshProject).toHaveBeenCalledWith("project-1", 1, 50);
    expect(refreshLogs).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("discards a stale preview and reports that it must be refreshed", async () => {
    mockTransform.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { detail: { code: "stale_dataset_revision", message: "stale" } },
      },
    });
    const { result } = renderHook(() => usePreviewSave({ clearError, handleError, onClose }));

    await act(async () => result.current.handleSave());

    expect(mockContext.cancelPreview).toHaveBeenCalledOnce();
    expect(handleError).toHaveBeenCalledWith(new Error(STALE_PREVIEW_MESSAGE));
    expect(mockContext.confirmPreview).not.toHaveBeenCalled();
    expect(mockContext.refreshProject).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not send a commit if the pending preview has no revision", async () => {
    mockContext.pendingTransform = {
      projectId: "project-1",
      payload: { operation_type: "filter" },
    };
    const { result } = renderHook(() => usePreviewSave({ clearError, handleError, onClose }));

    await act(async () => result.current.handleSave());

    expect(mockTransform).not.toHaveBeenCalled();
    expect(mockContext.cancelPreview).toHaveBeenCalledOnce();
    expect(handleError).toHaveBeenCalledOnce();
  });
});
