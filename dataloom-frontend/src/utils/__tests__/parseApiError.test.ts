import { describe, it, expect } from "vitest";
import { parseApiErrorDetail } from "../parseApiError";

describe("parseApiErrorDetail", () => {
  it("returns a string detail as-is", () => {
    const err = { response: { data: { detail: "Email already registered" } } };
    expect(parseApiErrorDetail(err)).toBe("Email already registered");
  });

  it("falls back to the default message when detail is missing", () => {
    expect(parseApiErrorDetail({})).toBe("Something went wrong. Please try again.");
  });

  it("falls back to a custom message when provided", () => {
    expect(parseApiErrorDetail({}, "Could not sign in. Please try again.")).toBe(
      "Could not sign in. Please try again.",
    );
  });

  it("handles a null or undefined error without throwing", () => {
    expect(parseApiErrorDetail(null)).toBe("Something went wrong. Please try again.");
    expect(parseApiErrorDetail(undefined)).toBe("Something went wrong. Please try again.");
  });
});
