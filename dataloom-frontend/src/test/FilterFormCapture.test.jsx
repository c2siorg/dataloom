import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FILTER } from "../constants/operationTypes";
import FilterForm from "../Components/forms/FilterForm";
import { transformProject } from "../api";
import { useProjectContext } from "../context/ProjectContext";
import usePreviewSave from "../hooks/usePreviewSave";

vi.mock("../api", () => ({
  transformProject: vi.fn(),
}));

vi.mock("../context/ProjectContext", () => ({
  useProjectContext: vi.fn(),
}));

vi.mock("../hooks/usePreviewSave", () => ({
  default: vi.fn(),
}));

vi.mock("../Components/common/ColumnSelect", () => ({
  default: ({ value, onChange, placeholder }) => (
    <select aria-label="Column" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      <option value="amount">Amount</option>
    </select>
  ),
}));

vi.mock("../Components/common/Select", () => ({
  default: ({ value, onChange, options }) => (
    <select aria-label="Condition" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

describe("FilterForm in capture mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectContext.mockReturnValue({
      pageSize: 50,
      isPreviewMode: false,
      enterPreviewMode: vi.fn(),
      cancelPreview: vi.fn(),
    });
    usePreviewSave.mockReturnValue({ saving: false, handleSave: vi.fn() });
  });

  it("hands the built step to onCapture instead of previewing", async () => {
    const user = userEvent.setup();
    const onCapture = vi.fn();

    render(<FilterForm projectId="p1" onClose={vi.fn()} onCapture={onCapture} />);

    await user.selectOptions(screen.getByLabelText("Column"), "amount");
    await user.selectOptions(screen.getByLabelText("Condition"), ">");
    await user.type(screen.getByTestId("filter-value"), "50");
    await user.click(screen.getByRole("button", { name: "Apply Filter" }));

    await waitFor(() => {
      expect(onCapture).toHaveBeenCalledWith({
        action_type: FILTER,
        action_details: {
          operation_type: FILTER,
          parameters: { column: "amount", condition: ">", value: "50" },
        },
      });
    });

    // Capture mode must not touch the preview/apply path.
    expect(transformProject).not.toHaveBeenCalled();
  });
});
