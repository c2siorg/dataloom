import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportProject, uploadProject } from "../projects";
import client from "../client";
import { UPLOAD_TIMEOUT_MS } from "../../config/apiConfig";

vi.mock("../client", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const get = vi.mocked(client.get);
const post = vi.mocked(client.post);

describe("project API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({
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

  describe("uploadProject", () => {
    const file = new File(["a,b\n1,2"], "data.csv", { type: "text/csv" });

    beforeEach(() => {
      post.mockResolvedValue({ data: { project_id: "p1" } });
    });

    it("passes the upload timeout, progress callback, and abort signal to Axios", async () => {
      const onProgress = vi.fn();
      const controller = new AbortController();

      await uploadProject(file, "Sales", "Q1 data", { onProgress, signal: controller.signal });

      const [url, body, config] = post.mock.calls[0]!;
      expect(url).toBe("/projects/upload");
      expect(body).toBeInstanceOf(FormData);
      expect(config).toMatchObject({ timeout: UPLOAD_TIMEOUT_MS, signal: controller.signal });

      config!.onUploadProgress!({ loaded: 25, total: 100 } as never);
      expect(onProgress).toHaveBeenCalledWith(0.25);
    });

    it("skips progress events without a total", async () => {
      const onProgress = vi.fn();

      await uploadProject(file, "Sales", "Q1 data", { onProgress });

      post.mock.calls[0]![2]!.onUploadProgress!({ loaded: 25 } as never);
      expect(onProgress).not.toHaveBeenCalled();
    });

    it("uses the upload timeout even without options", async () => {
      await uploadProject(file, "Sales", "Q1 data");

      expect(post.mock.calls[0]![2]).toMatchObject({
        timeout: UPLOAD_TIMEOUT_MS,
        onUploadProgress: undefined,
      });
    });
  });
});
