import { describe, it, expect } from "vitest";
import { getTabComponent } from "../Components/workspace/TabRegistry";
// Importing the feature modules for their registration side effects is what wires
// the tab types into the registry — the same imports DataScreen relies on.
import "../Components/workspace/features/dataset";
import "../Components/workspace/features/history";
import "../Components/workspace/features/profiling";

describe("TabRegistry", () => {
  it("registers every built-in tab type on import", () => {
    expect(getTabComponent("dataset")).toBeTypeOf("function");
    expect(getTabComponent("logs")).toBeTypeOf("function");
    expect(getTabComponent("checkpoints")).toBeTypeOf("function");
    expect(getTabComponent("summary")).toBeTypeOf("function");
  });

  it("returns undefined for an unregistered type", () => {
    expect(getTabComponent("nope")).toBeUndefined();
  });
});
