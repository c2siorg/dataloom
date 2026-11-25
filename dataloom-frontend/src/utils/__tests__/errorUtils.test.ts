import { describe, it, expect } from "vitest";
import { getErrorMessage } from "../errorUtils";

describe("getErrorMessage", () => {
  it("returns a string detail directly", () => {
    const err = { response: { data: { detail: "Email already registered." } } };
    expect(getErrorMessage(err)).toBe("Email already registered.");
  });

  it("returns the fallback when the string detail is empty", () => {
    const err = { response: { data: { detail: "" } } };
    expect(getErrorMessage(err, "fallback")).toBe("fallback");
  });

  it("returns the fallback when the string detail is whitespace-only", () => {
    const err = { response: { data: { detail: "   " } } };
    expect(getErrorMessage(err, "fallback")).toBe("fallback");
  });

  it("extracts the msg field from a single-item 422 array detail", () => {
    const err = {
      response: {
        data: {
          detail: [
            {
              type: "value_error",
              loc: ["body", "password"],
              msg: "Password must contain at least 3 of the following: lowercase, uppercase, digit, and special character.",
              input: "12345678",
            },
          ],
        },
      },
    };
    expect(getErrorMessage(err)).toBe(
      "Password must contain at least 3 of the following: lowercase, uppercase, digit, and special character.",
    );
  });

  it("joins msg fields from a multi-item 422 array detail with a comma", () => {
    const err = {
      response: {
        data: {
          detail: [
            { loc: ["body", "email"], msg: "value is not a valid email address" },
            { loc: ["body", "password"], msg: "field required" },
          ],
        },
      },
    };
    expect(getErrorMessage(err)).toBe("value is not a valid email address, field required");
  });

  it("falls back to JSON.stringify when an array entry has no msg field", () => {
    const err = { response: { data: { detail: [{ loc: ["body", "x"] }] } } };
    const result = getErrorMessage(err, "fallback");
    // The entry has no msg so the helper stringifies it; the result should not
    // be the fallback and should contain the serialised object.
    expect(result).toContain("body");
  });

  it("returns the fallback when the array detail is empty", () => {
    const err = { response: { data: { detail: [] } } };
    expect(getErrorMessage(err, "fallback")).toBe("fallback");
  });

  it("returns the default fallback when err has no response", () => {
    expect(getErrorMessage(new Error("Network Error"))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("returns a custom fallback passed by the caller", () => {
    expect(
      getErrorMessage(new Error("Network Error"), "Could not sign in. Please try again."),
    ).toBe("Could not sign in. Please try again.");
  });

  it("returns the fallback when err is null", () => {
    expect(getErrorMessage(null, "fallback")).toBe("fallback");
  });

  it("returns the fallback when err is undefined", () => {
    expect(getErrorMessage(undefined, "fallback")).toBe("fallback");
  });

  it("returns the fallback when detail is a number", () => {
    const err = { response: { data: { detail: 422 } } };
    expect(getErrorMessage(err, "fallback")).toBe("fallback");
  });
});
