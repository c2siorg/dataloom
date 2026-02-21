import { withSerialNumbers } from "../tableUtils";

describe("withSerialNumbers", () => {
  it("prepends 1-based serial numbers to each row", () => {
    const rows = [["a", "b"], ["c", "d"], ["e", "f"]];
    const result = withSerialNumbers(rows);
    expect(result).toEqual([
      [1, "a", "b"],
      [2, "c", "d"],
      [3, "e", "f"],
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(withSerialNumbers([])).toEqual([]);
  });

  it("handles single row", () => {
    const result = withSerialNumbers([["only"]]);
    expect(result).toEqual([[1, "only"]]);
  });

  it("does not mutate the original rows", () => {
    const rows = [["a"], ["b"]];
    const original = rows.map((r) => [...r]);
    withSerialNumbers(rows);
    expect(rows).toEqual(original);
  });

  it("handles rows with mixed types", () => {
    const rows = [[1, null, true, "text"]];
    const result = withSerialNumbers(rows);
    expect(result).toEqual([[1, 1, null, true, "text"]]);
  });
});
