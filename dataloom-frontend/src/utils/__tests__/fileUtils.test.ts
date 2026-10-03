import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_FILE_SIZE_BYTES,
  fileTooLargeMessage,
  formatSizeLimit,
  uploadLimitError,
  validateFile,
} from "../fileUtils";

const MB = 1024 * 1024;

/** A File whose reported size is `size` without allocating that many bytes. */
const fileOfSize = (size: number, name = "data.csv"): File => {
  const file = new File(["a,b\n1,2"], name, { type: "text/csv" });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

describe("formatSizeLimit", () => {
  it("shows whole megabytes without a decimal", () => {
    expect(formatSizeLimit(10 * MB)).toBe("10 MB");
    expect(formatSizeLimit(100 * MB)).toBe("100 MB");
  });

  it("shows one decimal for a fractional megabyte count", () => {
    expect(formatSizeLimit(10.5 * MB)).toBe("10.5 MB");
  });
});

describe("validateFile", () => {
  it("defaults to a 10 MB limit with the same message as before", () => {
    expect(DEFAULT_MAX_FILE_SIZE_BYTES).toBe(10 * MB);
    expect(validateFile(fileOfSize(10 * MB))).toEqual({ valid: true });
    expect(validateFile(fileOfSize(12.3 * MB))).toEqual({
      valid: false,
      error: "File too large (12.3 MB). Maximum allowed size is 10 MB.",
    });
  });

  it("enforces a custom limit and names it in the message", () => {
    const limit = 100 * MB;

    expect(validateFile(fileOfSize(60 * MB), limit)).toEqual({ valid: true });
    expect(validateFile(fileOfSize(limit), limit)).toEqual({ valid: true });
    expect(validateFile(fileOfSize(limit + 1), limit)).toEqual({
      valid: false,
      error: "File too large (100.0 MB). Maximum allowed size is 100 MB.",
    });
  });

  it("formats a fractional custom limit", () => {
    expect(validateFile(fileOfSize(11 * MB), 10.5 * MB).error).toBe(
      "File too large (11.0 MB). Maximum allowed size is 10.5 MB.",
    );
  });

  it("still checks the extension before the size", () => {
    expect(validateFile(fileOfSize(1, "notes.txt"), 10 * MB).error).toMatch(
      /^Unsupported file type/,
    );
  });
});

describe("uploadLimitError", () => {
  const limit = 10 * MB;

  it("uses the server's detail for a 413 when it sent one", () => {
    const err = { response: { status: 413, data: { detail: "File exceeds the limit." } } };

    expect(uploadLimitError(err, fileOfSize(1 * MB), limit)).toBe("File exceeds the limit.");
  });

  it("falls back to the limit message for a 413 without a detail", () => {
    const err = { response: { status: 413, data: "<html>413</html>" } };

    expect(uploadLimitError(err, fileOfSize(12 * MB), limit)).toBe(
      fileTooLargeMessage(12 * MB, limit),
    );
  });

  it("treats a failure with no response as the limit when the file is over it", () => {
    const networkError = new Error("Network Error");

    expect(uploadLimitError(networkError, fileOfSize(12 * MB), limit)).toBe(
      fileTooLargeMessage(12 * MB, limit),
    );
    expect(uploadLimitError(networkError, fileOfSize(1 * MB), limit)).toBeNull();
  });

  it("ignores other HTTP errors", () => {
    const err = { response: { status: 400, data: { detail: "Could not parse" } } };

    expect(uploadLimitError(err, fileOfSize(12 * MB), limit)).toBeNull();
  });
});
