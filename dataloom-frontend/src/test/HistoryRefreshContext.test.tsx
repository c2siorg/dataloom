import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  HistoryRefreshProvider,
  useHistoryRefresh,
  useHistoryRefreshTokens,
} from "../context/HistoryRefreshContext";

// Read actions and tokens together so a single renderHook exercises both contexts.
const useBoth = () => ({ ...useHistoryRefresh(), ...useHistoryRefreshTokens() });

describe("HistoryRefreshContext", () => {
  it("starts with zeroed tokens", () => {
    const { result } = renderHook(useBoth, { wrapper: HistoryRefreshProvider });
    expect(result.current.logsToken).toBe(0);
    expect(result.current.checkpointsToken).toBe(0);
  });

  it("refreshLogs bumps only the logs token", () => {
    const { result } = renderHook(useBoth, { wrapper: HistoryRefreshProvider });
    act(() => result.current.refreshLogs());
    expect(result.current.logsToken).toBe(1);
    expect(result.current.checkpointsToken).toBe(0);
  });

  it("refreshCheckpoints bumps only the checkpoints token", () => {
    const { result } = renderHook(useBoth, { wrapper: HistoryRefreshProvider });
    act(() => result.current.refreshCheckpoints());
    expect(result.current.checkpointsToken).toBe(1);
    expect(result.current.logsToken).toBe(0);
  });
});
