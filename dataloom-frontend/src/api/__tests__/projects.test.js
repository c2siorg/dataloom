import { exportProject } from "../projects";
import client from "../client";

vi.mock("../client", () => ({
  default: {
    get: vi.fn(),
  },
}));

describe("project API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.get.mockResolvedValue({
      data: new Blob(["a,b\n1,2"]),
      headers: { "content-disposition": 'attachment; filename="export.csv"' },
    });
  });

  describe("exportProject", () => {
    it("keeps the legacy format argument shape", async () => {
      await exportProject("project-1", "csv");

      expect(client.get).toHaveBeenCalledWith("/projects/project-1/export", {
        params: { format: "csv" },
        responseType: "blob",
      });
    });

    it("passes delimiter, header, and encoding options as backend query params", async () => {
      await exportProject("project-1", {
        format: "csv",
        delimiter: "semicolon",
        includeHeader: false,
        encoding: "latin-1",
      });

      expect(client.get).toHaveBeenCalledWith("/projects/project-1/export", {
        params: {
          format: "csv",
          delimiter: "semicolon",
          include_header: false,
          encoding: "latin-1",
        },
        responseType: "blob",
      });
    });

    it("returns the blob and server-provided filename", async () => {
      const result = await exportProject("project-1", { format: "csv" });

      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.filename).toBe("export.csv");
    });
  });
});
