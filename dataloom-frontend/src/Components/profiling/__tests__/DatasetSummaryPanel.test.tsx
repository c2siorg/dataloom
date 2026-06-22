import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import DatasetSummaryPanel from "../DatasetSummaryPanel";

describe("DatasetSummaryPanel", () => {
  it("shows the loading state when no summary and no error", () => {
    render(<DatasetSummaryPanel summary={null} onClose={() => {}} />);
    expect(screen.getByText("Loading summary…")).toBeInTheDocument();
  });

  it("shows an error message with a retry button when the fetch failed", () => {
    const onRetry = vi.fn();
    render(<DatasetSummaryPanel summary={null} error onRetry={onRetry} onClose={() => {}} />);

    expect(screen.queryByText("Loading summary…")).not.toBeInTheDocument();
    expect(screen.getByText(/Couldn’t load the dataset summary/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
