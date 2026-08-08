import { describe, expect, it, vi, beforeEach } from "vitest";
import { getProjectReport } from "../reports";
import client from "../client";

vi.mock("../client", () => ({
  default: { get: vi.fn() },
}));

const get = vi.mocked(client.get);

beforeEach(() => {
  get.mockReset().mockResolvedValue({
    data: new Blob(["%PDF"]),
    headers: { "content-disposition": 'attachment; filename="sales_report.pdf"' },
  });
});

describe("getProjectReport", () => {
  it("sends the chosen sections", async () => {
    await getProjectReport("p1", ["profiles", "quality"]);
    expect(get.mock.calls[0]?.[1]?.params).toEqual({ section: ["profiles", "quality"] });
  });

  it("asks for the overview alone when no section is chosen", async () => {
    // The endpoint defaults to every section when the request names none, so an
    // empty choice must say "overview" or clearing the checkboxes would return
    // the full report.
    await getProjectReport("p1", []);
    expect(get.mock.calls[0]?.[1]?.params).toEqual({ section: ["overview"] });
  });

  it("omits the parameter entirely when sections are unspecified", async () => {
    await getProjectReport("p1");
    expect(get.mock.calls[0]?.[1]?.params).toBeUndefined();
  });

  it("takes the filename from the content-disposition header", async () => {
    const { filename } = await getProjectReport("p1");
    expect(filename).toBe("sales_report.pdf");
  });

  it("falls back to a default filename when the header is missing", async () => {
    get.mockResolvedValue({ data: new Blob(["%PDF"]), headers: {} });
    const { filename } = await getProjectReport("p1");
    expect(filename).toBe("report.pdf");
  });
});
