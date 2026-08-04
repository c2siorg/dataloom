import { describe, it, expect, vi } from "vitest";
import { captureStep } from "../Components/forms/transformFormProps";

describe("captureStep", () => {
  const payload = {
    operation_type: "filter",
    parameters: { column: "age", condition: ">", value: "26" },
  };

  it("hands the payload to the pipeline builder and tells the form to stop", () => {
    const onCapture = vi.fn();

    expect(captureStep(onCapture, payload)).toBe(true);
    expect(onCapture).toHaveBeenCalledWith({
      action_type: "filter",
      action_details: payload,
    });
  });

  it("does nothing in apply-on-submit mode, so the form previews as usual", () => {
    expect(captureStep(undefined, payload)).toBe(false);
  });
});
