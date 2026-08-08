import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ReportTab } from "../ReportTab";

const view = {
  blob: new Blob(["%PDF"]) as Blob | null,
  filename: "orders_report.pdf" as string | null,
  loading: false,
  error: false,
  stale: false,
  generate: vi.fn(),
  download: vi.fn(),
};

vi.mock("../../../context/ReportViewContext", () => ({
  useReportView: () => view,
}));

const panel = {
  activePanel: "ReportConfig" as string | null,
  openPanel: vi.fn(),
  closePanel: vi.fn(),
  togglePanel: vi.fn(),
};

vi.mock("../../../context/PanelContext", () => ({
  usePanel: () => panel,
}));

// The real viewer needs a canvas and a pdf.js worker, neither of which jsdom
// has. The strip only cares that the viewer reports a page count.
let reportedPages = 3;
vi.mock("../../report/PdfDocumentView", async () => {
  const { useEffect } = await import("react");
  function PdfDocumentViewStub({ onLoad }: { onLoad?: (pages: number) => void }) {
    // The real component reports the count after parsing, never during render.
    useEffect(() => onLoad?.(reportedPages), [onLoad]);
    return <div data-testid="pdf-document-view" />;
  }
  return { default: PdfDocumentViewStub };
});

beforeEach(() => {
  vi.clearAllMocks();
  panel.activePanel = "ReportConfig";
  reportedPages = 3;
});

describe("ReportTab", () => {
  it("names the document and counts its pages", async () => {
    render(<ReportTab />);

    expect(screen.getByText("orders_report.pdf")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("3 pages")).toBeInTheDocument());
  });

  it("says page, not pages, for a one-page report", async () => {
    reportedPages = 1;
    render(<ReportTab />);

    await waitFor(() => expect(screen.getByText("1 page")).toBeInTheDocument());
  });

  it("opens its panel with the tab and closes it when the tab goes away", () => {
    const { unmount } = render(<ReportTab />);
    expect(panel.openPanel).toHaveBeenCalledWith("ReportConfig");

    unmount();
    expect(panel.closePanel).toHaveBeenCalled();
  });

  it("leaves a panel another feature has since opened alone", () => {
    const { unmount, rerender } = render(<ReportTab />);

    panel.activePanel = "FilterForm";
    rerender(<ReportTab />);
    unmount();

    expect(panel.closePanel).not.toHaveBeenCalled();
  });
});
