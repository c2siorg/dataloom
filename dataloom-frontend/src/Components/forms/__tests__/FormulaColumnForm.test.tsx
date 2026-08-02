import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FormulaColumnForm from "../FormulaColumnForm";

const transformProject = vi.fn();
const enterPreviewMode = vi.fn();
const showToast = vi.fn();

vi.mock("../../../api", () => ({
  transformProject: (...args: unknown[]) => transformProject(...args),
}));
vi.mock("../../../context/ProjectContext", () => ({
  useProjectContext: () => ({
    columns: ["price", "quantity"],
    pageSize: 50,
    isPreviewMode: false,
    enterPreviewMode,
    cancelPreview: vi.fn(),
  }),
}));
vi.mock("../../../context/ToastContext", () => ({
  useToast: () => ({ showToast }),
}));
vi.mock("../../../hooks/usePreviewSave", () => ({
  default: () => ({ saving: false, handleSave: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const renderForm = () => render(<FormulaColumnForm projectId="p1" onClose={vi.fn()} />);

const formulaInput = () => screen.getByPlaceholderText("e.g. price * quantity") as HTMLInputElement;
const applyButton = () => screen.getByRole("button", { name: /apply/i });

describe("FormulaColumnForm", () => {
  it("disables Apply until both name and formula are filled", () => {
    renderForm();
    expect(applyButton()).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("e.g. total"), { target: { value: "total" } });
    expect(applyButton()).toBeDisabled();

    fireEvent.change(formulaInput(), { target: { value: "price * 2" } });
    expect(applyButton()).not.toBeDisabled();
  });

  it("inserts a clicked column into the formula with spacing", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "price" }));
    expect(formulaInput().value).toBe("price");

    fireEvent.click(screen.getByRole("button", { name: "quantity" }));
    expect(formulaInput().value).toBe("price quantity");
  });

  it("submits the addFormulaCol payload as a preview", async () => {
    transformProject.mockResolvedValue({
      columns: [],
      rows: [],
      dtypes: {},
      total_rows: 120,
      total_pages: 3,
      page: 1,
      page_size: 50,
    });
    renderForm();

    fireEvent.change(screen.getByPlaceholderText("e.g. total"), { target: { value: " total " } });
    fireEvent.change(formulaInput(), { target: { value: "price * quantity" } });
    fireEvent.click(applyButton());

    expect(transformProject).toHaveBeenCalledWith(
      "p1",
      {
        operation_type: "addFormulaCol",
        formula_col_params: { column_name: "total", expression: "price * quantity" },
      },
      { preview: true, page: 1, pageSize: 50 },
    );
    await vi.waitFor(() => expect(enterPreviewMode).toHaveBeenCalled());
    expect(enterPreviewMode).toHaveBeenCalledWith([], [], {}, expect.anything(), {
      total_rows: 120,
      total_pages: 3,
      page: 1,
      page_size: 50,
    });
  });
});
