import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import JobProgress from "../JobProgress";

describe("JobProgress", () => {
  it("reports determinate progress through aria values", () => {
    render(
      <JobProgress
        label="Running pipeline"
        progress={{ current: 12, total: 45, message: "Step 12 of 45 · Sort" }}
      />,
    );

    const bar = screen.getByRole("progressbar", { name: "Running pipeline" });
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuenow", "27");
    expect(bar).toHaveAttribute("aria-valuetext", "Step 12 of 45 · Sort");
    expect(screen.getByText(/Step 12 of 45 · Sort/)).toBeInTheDocument();
  });

  it("is indeterminate while the total is unknown", () => {
    render(
      <JobProgress
        label="Reverting"
        progress={{ current: 0, total: null, message: "Reading project data" }}
      />,
    );

    const bar = screen.getByRole("progressbar", { name: "Reverting" });
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(bar).toHaveAttribute("aria-valuetext", "Reading project data");
  });

  it("offers Cancel only when asked, and disables it while cancelling", () => {
    const onCancel = vi.fn();
    const progress = { current: 1, total: 2, message: "Step 1 of 2 · Sort" };
    const { rerender } = render(<JobProgress label="Running pipeline" progress={progress} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(<JobProgress label="Running pipeline" progress={progress} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(
      <JobProgress label="Running pipeline" progress={progress} onCancel={onCancel} cancelling />,
    );
    expect(screen.getByRole("button", { name: "Cancelling…" })).toBeDisabled();
  });
});
