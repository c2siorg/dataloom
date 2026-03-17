import { render, screen, fireEvent } from "@testing-library/react";
import { vi, beforeEach, expect, describe, test } from "vitest";
import ColumnSelect from "../ColumnSelect";

describe("ColumnSelect", () => {
  const defaultProps = {
    id: "test-select",
    label: "Test Label",
    value: "",
    onChange: vi.fn(),
    columns: ["col1", "col2", "col3"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders placeholder and disabled select when columns is empty array", () => {
    render(<ColumnSelect {...defaultProps} columns={[]} />);

    expect(screen.getByText("No columns available — load a dataset first")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  test("renders all column names as options when columns provided", () => {
    render(<ColumnSelect {...defaultProps} />);

    expect(screen.getByText("Select column…")).toBeInTheDocument();
    expect(screen.getByText("col1")).toBeInTheDocument();
    expect(screen.getByText("col2")).toBeInTheDocument();
    expect(screen.getByText("col3")).toBeInTheDocument();
  });

  test("select is disabled when columns is null", () => {
    render(<ColumnSelect {...defaultProps} columns={null} />);

    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  test("calls onChange when option selected", () => {
    const mockOnChange = vi.fn();
    render(<ColumnSelect {...defaultProps} onChange={mockOnChange} />);

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "col2" } });

    expect(mockOnChange).toHaveBeenCalledTimes(1);
  });

  test("required prop is forwarded to select element", () => {
    render(<ColumnSelect {...defaultProps} required={true} />);

    expect(screen.getByRole("combobox")).toBeRequired();
  });

  test("uses default name when not provided", () => {
    const { container } = render(<ColumnSelect {...defaultProps} />);

    expect(container.querySelector("select")).toHaveAttribute("name", "column");
  });

  test("uses custom name when provided", () => {
    const { container } = render(<ColumnSelect {...defaultProps} name="custom-name" />);

    expect(container.querySelector("select")).toHaveAttribute("name", "custom-name");
  });
});
