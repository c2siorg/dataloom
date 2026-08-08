import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportConfigPanel from "../ReportConfigPanel";

const view = {
  sections: ["profiles", "quality", "provenance"] as const,
  toggleSection: vi.fn(),
  generate: vi.fn(),
  download: vi.fn(),
  loading: false,
  stale: false,
  blob: new Blob(["%PDF"]) as Blob | null,
};

vi.mock("../../../context/ReportViewContext", () => ({
  useReportView: () => view,
}));

describe("ReportConfigPanel", () => {
  it("toggles the section the user unchecked", async () => {
    const user = userEvent.setup();
    render(<ReportConfigPanel />);

    await user.click(screen.getByRole("checkbox", { name: /Data quality/ }));

    expect(view.toggleSection).toHaveBeenCalledWith("quality");
  });

  it("disables download until a report exists", () => {
    const { rerender } = render(<ReportConfigPanel />);
    expect(screen.getByRole("button", { name: /Download PDF/ })).toBeEnabled();

    view.blob = null;
    rerender(<ReportConfigPanel />);
    expect(screen.getByRole("button", { name: /Download PDF/ })).toBeDisabled();
  });
});
