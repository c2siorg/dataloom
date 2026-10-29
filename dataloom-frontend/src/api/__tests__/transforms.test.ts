import { beforeEach, describe, expect, it, vi } from "vitest";
import client from "../client";
import { transformProject } from "../transforms";

vi.mock("../client", () => ({
  default: { post: vi.fn() },
}));

const mockPost = vi.mocked(client.post);

describe("transformProject", () => {
  beforeEach(() => vi.resetAllMocks());

  it("sends the reviewed revision with a preview-derived commit", async () => {
    mockPost.mockResolvedValueOnce({ data: { working_copy_revision: 9 } } as never);

    await transformProject("project-1", { operation_type: "filter" }, { expectedRevision: 9 });

    expect(mockPost).toHaveBeenCalledWith(
      "/projects/project-1/transform",
      { operation_type: "filter" },
      { params: { expected_revision: 9 } },
    );
  });

  it("retains the revision in preview responses", async () => {
    const result = { data: { working_copy_revision: 12 } };
    mockPost.mockResolvedValueOnce(result as never);

    await expect(
      transformProject("project-1", { operation_type: "sort" }, { preview: true }),
    ).resolves.toEqual(result.data);
  });
});
