import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUndoState } from "../useUndoState";
import { getUndoState, type UndoState } from "../../api/transforms";
import { HistoryRefreshProvider, useHistoryRefresh } from "../../context/HistoryRefreshContext";

vi.mock("../../api/transforms", () => ({
  getUndoState: vi.fn(),
}));

const mockGet = vi.mocked(getUndoState);

/** The hook plus the refresh action that bumps its token, under a real provider. */
const renderUndoState = () =>
  renderHook(() => ({ undoState: useUndoState("p1"), history: useHistoryRefresh() }), {
    wrapper: HistoryRefreshProvider,
  });

beforeEach(() => {
  mockGet.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useUndoState", () => {
  it("is null until the first answer arrives, then reports it", async () => {
    mockGet.mockResolvedValue({ can_undo: true, can_redo: false });

    const { result } = renderUndoState();

    expect(result.current.undoState).toBeNull();
    await waitFor(() =>
      expect(result.current.undoState).toEqual({ can_undo: true, can_redo: false }),
    );
    expect(mockGet).toHaveBeenCalledWith("p1");
  });

  it("refetches when a mutation bumps the logs token", async () => {
    mockGet.mockResolvedValueOnce({ can_undo: true, can_redo: false });
    const { result } = renderUndoState();
    await waitFor(() => expect(result.current.undoState?.can_undo).toBe(true));

    mockGet.mockResolvedValueOnce({ can_undo: false, can_redo: true });
    act(() => result.current.history.refreshLogs());

    await waitFor(() =>
      expect(result.current.undoState).toEqual({ can_undo: false, can_redo: true }),
    );
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("ignores an answer that lands after a newer fetch started", async () => {
    let resolveStale: (state: UndoState) => void = () => {};
    mockGet.mockReturnValueOnce(new Promise((resolve) => (resolveStale = resolve)));
    const { result } = renderUndoState();

    mockGet.mockResolvedValueOnce({ can_undo: false, can_redo: true });
    act(() => result.current.history.refreshLogs());
    await waitFor(() => expect(result.current.undoState?.can_redo).toBe(true));

    await act(async () => resolveStale({ can_undo: true, can_redo: false }));

    expect(result.current.undoState).toEqual({ can_undo: false, can_redo: true });
  });

  it("falls back to unknown when the fetch fails", async () => {
    mockGet.mockResolvedValueOnce({ can_undo: false, can_redo: false });
    const { result } = renderUndoState();
    await waitFor(() => expect(result.current.undoState).not.toBeNull());

    mockGet.mockRejectedValueOnce(new Error("offline"));
    act(() => result.current.history.refreshLogs());

    await waitFor(() => expect(result.current.undoState).toBeNull());
  });
});
