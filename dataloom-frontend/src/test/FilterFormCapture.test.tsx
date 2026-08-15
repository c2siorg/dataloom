import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { FILTER } from "../constants/operationTypes";
import FilterForm from "../Components/forms/FilterForm";
import { transformProject } from "../api";
import { useProjectContext } from "../context/ProjectContext";
import usePreviewSave from "../hooks/usePreviewSave";

/** Props accepted by the column-picker doubles stubbed in below. */
interface StubColumnSelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  placeholder?: string;
  includeEmptyOption?: boolean;
  emptyLabel?: string;
  "data-testid"?: string;
}

/** Props accepted by the Select double, whose options carry labels. */
interface StubSelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: { value: string; label: string }[];
  placeholder?: string;
  includeEmptyOption?: boolean;
  emptyLabel?: string;
  "data-testid"?: string;
}

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
  default: ({ value, onChange, placeholder }: StubColumnSelectProps) => (
    <select aria-label="Column" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      <option value="amount">Amount</option>
    </select>
  ),
}));

vi.mock("../Components/common/Select", () => ({
  default: ({ value, onChange, options }: StubSelectProps) => (
    <select aria-label="Condition" value={value} onChange={(event) => onChange(event.target.value)}>
      {(options ?? []).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const mockUseProjectContext = useProjectContext as unknown as Mock;
const mockUsePreviewSave = usePreviewSave as unknown as Mock;

describe("FilterForm in capture mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectContext.mockReturnValue({
      pageSize: 50,
      isPreviewMode: false,
      enterPreviewMode: vi.fn(),
      cancelPreview: vi.fn(),
    });
    mockUsePreviewSave.mockReturnValue({ saving: false, handleSave: vi.fn() });
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
