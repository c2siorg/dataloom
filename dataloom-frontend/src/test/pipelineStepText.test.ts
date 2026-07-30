import { describe, it, expect } from "vitest";
import { stepLabel, stepSummary } from "../Components/pipelines/pipelineStepText";

describe("stepLabel", () => {
  it("maps known operations to friendly names", () => {
    expect(stepLabel("dropDuplicate")).toBe("Drop duplicates");
    expect(stepLabel("advQueryFilter")).toBe("Advanced query");
  });

  it("falls back to the raw action type when unknown", () => {
    expect(stepLabel("somethingNew")).toBe("somethingNew");
  });
});

describe("stepSummary", () => {
  it("summarizes a filter as `column condition value`", () => {
    const details = {
      operation_type: "filter",
      parameters: { column: "age", condition: ">", value: "26" },
    };
    expect(stepSummary("filter", details)).toBe("age > 26");
  });

  it("summarizes multi-key sorts with direction arrows", () => {
    const details = {
      operation_type: "sort",
      sort_params: {
        criteria: [
          { column: "name", ascending: true },
          { column: "age", ascending: false },
        ],
      },
    };
    expect(stepSummary("sort", details)).toBe("name ↑, age ↓");
  });

  it("summarizes a cast as `column → type`", () => {
    const details = {
      operation_type: "castDataType",
      cast_data_type_params: { column: "price", target_type: "float" },
    };
    expect(stepSummary("castDataType", details)).toBe("price → float");
  });

  it("returns an empty string when there is nothing legible", () => {
    expect(stepSummary("renameCol", { operation_type: "renameCol" })).toBe("");
    expect(stepSummary("filter", { operation_type: "filter" })).toBe("");
  });
});
