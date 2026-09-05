import { describe, expect, it } from "vitest";
import { clampPageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "../pagination";

describe("clampPageSize", () => {
  it("passes an in-range value through unchanged", () => {
    expect(clampPageSize(50)).toBe(50);
  });

  it("clamps a value above the max down to the max", () => {
    expect(clampPageSize(121500)).toBe(MAX_PAGE_SIZE);
  });

  it("clamps a value below the min up to the min", () => {
    expect(clampPageSize(0)).toBe(MIN_PAGE_SIZE);
    expect(clampPageSize(-5)).toBe(MIN_PAGE_SIZE);
  });

  it("parses a numeric string and clamps it", () => {
    expect(clampPageSize("121500")).toBe(MAX_PAGE_SIZE);
    expect(clampPageSize("50")).toBe(50);
  });

  it("falls back to the default for a non-numeric value", () => {
    expect(clampPageSize("not-a-number")).toBe(DEFAULT_PAGE_SIZE);
  });

  it("falls back to the default for missing or empty values", () => {
    expect(clampPageSize(null)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize("")).toBe(DEFAULT_PAGE_SIZE);
  });

  it("falls back to the default for non-finite numbers", () => {
    expect(clampPageSize(NaN)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(Infinity)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("truncates a fractional value before clamping", () => {
    expect(clampPageSize(50.9)).toBe(50);
  });
});
