import { beforeEach, describe, expect, it, vi } from "vitest";
import client from "../client";
import { compareCheckpoint } from "../logs";

vi.mock("../client", () => ({
  default: {
    get: vi.fn(),
  },
}));

const get = vi.mocked(client.get);

describe("checkpoint comparison API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ data: { summary: {} } });
  });

  it("sends independent row and cell pages and the optional match column", async () => {
    const controller = new AbortController();
    await compareCheckpoint("project-1", "checkpoint-1", {
      rowPage: 3,
      cellPage: 2,
      pageSize: 25,
      matchColumn: "record_id",
      signal: controller.signal,
    });

    expect(client.get).toHaveBeenCalledWith("/logs/checkpoints/project-1/checkpoint-1/compare", {
      params: {
        row_page: 3,
        cell_page: 2,
        page_size: 25,
        match_column: "record_id",
      },
      signal: controller.signal,
    });
  });

  it("omits the match column for positional matching", async () => {
    await compareCheckpoint("project-1", "checkpoint-1", { rowPage: 2, cellPage: 1 });

    expect(client.get).toHaveBeenCalledWith("/logs/checkpoints/project-1/checkpoint-1/compare", {
      params: { row_page: 2, cell_page: 1, page_size: 50 },
      signal: undefined,
    });
  });
});
