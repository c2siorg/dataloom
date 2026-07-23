import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import QualityReportView from "../QualityReportView";
import type { QualityReport } from "../../../api/quality";

// QualityReportView calls usePanel → provide a minimal stub so the component
// renders without the full PanelContext tree.
vi.mock("../../../context/PanelContext", () => ({
  usePanel: () => ({ openPanel: vi.fn() }),
}));

const REPORT: QualityReport = {
  overall_score: 72,
  column_scores: { age: 95, name: 60 },
  issue_count: 2,
  issues: [
    {
      issue_type: "missing",
      column: "name",
      severity: "high",
      count: 15,
      detail: "15 empty values in name",
      sample_rows: [],
    },
    {
      issue_type: "outlier",
      column: "age",
      severity: "low",
      count: 3,
      detail: "3 outliers in age",
      sample_rows: [],
    },
  ],
  remediations: [
    {
      issue_type: "missing",
      suggestion: "Fill empty values in name",
      operation: "fillEmpty",
      column: "name",
    },
  ],
};

describe("QualityReportView – dark-mode theming", () => {
  it("renders score cards with theme-aware surface tokens", () => {
    render(<QualityReportView report={REPORT} history={[]} />);

    // The overall score value should be present
    expect(screen.getByTestId("overall-score")).toBeInTheDocument();
  });

  it("renders issue cards with bg-surface and border-app-border", () => {
    const { container } = render(<QualityReportView report={REPORT} history={[]} />);

    // Issue list items should use theme tokens instead of hardcoded bg-white
    const issueItems = container.querySelectorAll("li");
    expect(issueItems.length).toBeGreaterThan(0);
    const firstIssue = issueItems[0]!;
    expect(firstIssue.className).toContain("bg-surface");
    expect(firstIssue.className).toContain("border-app-border");
    expect(firstIssue.className).toContain("text-foreground");
  });

  it("renders section headings with text-muted-foreground", () => {
    const { container } = render(<QualityReportView report={REPORT} history={[]} />);

    const headings = container.querySelectorAll("h3");
    headings.forEach((heading) => {
      expect(heading.className).toContain("text-muted-foreground");
    });
  });
});
