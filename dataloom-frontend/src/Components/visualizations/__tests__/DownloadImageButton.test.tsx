import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DownloadImageButton from "../DownloadImageButton";

// Rasterizing needs a real canvas, which jsdom does not provide; the export
// itself is mocked so these tests cover the button's own behaviour.
const downloadChartAsPng = vi.fn();
vi.mock("../../../utils/chartImage", () => ({
  downloadChartAsPng: (...args: unknown[]) => downloadChartAsPng(...args),
}));

/** Stands in for the rendered chart container handed to the export. */
const chart = document.createElement("div");

beforeEach(() => {
  downloadChartAsPng.mockReset();
  downloadChartAsPng.mockResolvedValue(undefined);
});

const button = () => screen.getByRole("button", { name: /download image/i });

describe("DownloadImageButton", () => {
  it("exports the resolved chart under its title", async () => {
    render(<DownloadImageButton getTarget={() => chart} title="Count by Qty" />);

    fireEvent.click(button());

    await waitFor(() => expect(downloadChartAsPng).toHaveBeenCalledOnce());
    const [exported, title] = downloadChartAsPng.mock.calls[0]!;
    expect(exported).toBe(chart);
    expect(title).toBe("Count by Qty");
  });

  it("reports failure on the button instead of throwing", async () => {
    downloadChartAsPng.mockRejectedValue(new Error("no canvas"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<DownloadImageButton getTarget={() => chart} title="Count by Qty" />);

    fireEvent.click(button());

    expect(await screen.findByRole("button", { name: /couldn’t save/i })).toBeInTheDocument();
  });

  it("reports failure when there is no chart to export", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<DownloadImageButton getTarget={() => null} title="Count by Qty" />);

    fireEvent.click(button());

    expect(await screen.findByRole("button", { name: /couldn’t save/i })).toBeInTheDocument();
    expect(downloadChartAsPng).not.toHaveBeenCalled();
    // An unresolved target leaves the same trace as a failed export.
    expect(consoleError).toHaveBeenCalledWith(
      "[DownloadImageButton]",
      "No chart to export yet",
      expect.objectContaining({ title: "Count by Qty", hasTarget: false }),
    );
  });
});
