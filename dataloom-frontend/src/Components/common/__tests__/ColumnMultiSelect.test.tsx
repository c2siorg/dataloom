import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ColumnMultiSelect from "../ColumnMultiSelect";

vi.mock("../../../context/ProjectContext", () => ({
  useProjectContext: () => ({
    columns: ["City", "Amount", "Date"],
    dtypes: { City: "str", Amount: "float", Date: "datetime" },
  }),
}));

describe("ColumnMultiSelect", () => {
  it("lists all columns with dtype badges", () => {
    render(<ColumnMultiSelect value={[]} onChange={vi.fn()} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByText("float")).toBeInTheDocument();
  });

  it("filters the checkbox list by search text", () => {
    render(<ColumnMultiSelect value={[]} onChange={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search columns..."), {
      target: { value: "dat" },
    });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByText("Date")).toBeInTheDocument();
  });

  it("adds a column to the array when its checkbox is toggled on", () => {
    const onChange = vi.fn();
    render(<ColumnMultiSelect value={["City"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Amount/ }));
    expect(onChange).toHaveBeenCalledWith(["City", "Amount"]);
  });

  it("removes a column from the array when its checkbox is toggled off", () => {
    const onChange = vi.fn();
    render(<ColumnMultiSelect value={["City", "Amount"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /City/ }));
    expect(onChange).toHaveBeenCalledWith(["Amount"]);
  });
});
