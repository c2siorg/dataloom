import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ColumnSelect from "../ColumnSelect";

vi.mock("../../../context/ProjectContext", () => ({
  useProjectContext: () => ({
    columns: ["City", "Amount", "Date"],
    dtypes: { City: "str", Amount: "float", Date: "datetime" },
  }),
}));

const renderSelect = (props = {}) =>
  render(<ColumnSelect value="" onChange={vi.fn()} {...props} />);

describe("ColumnSelect", () => {
  it("shows the placeholder when no value is selected", () => {
    renderSelect({ placeholder: "Pick one..." });
    expect(screen.getByText("Pick one...")).toBeInTheDocument();
  });

  it("opens the popover and lists columns with dtype badges", () => {
    renderSelect();
    fireEvent.click(screen.getByRole("button"));
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(screen.getByText("float")).toBeInTheDocument();
  });

  it("filters the list by search text", () => {
    renderSelect();
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByPlaceholderText("Search columns..."), {
      target: { value: "am" },
    });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Amount");
  });

  it("calls onChange with the column name on selection", () => {
    const onChange = vi.fn();
    renderSelect({ onChange });
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Date"));
    expect(onChange).toHaveBeenCalledWith("Date");
  });

  it("renders an empty option that maps to an empty string", () => {
    const onChange = vi.fn();
    renderSelect({ onChange, includeEmptyOption: true, emptyLabel: "All columns" });
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("All columns"));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("closes the popover on Escape", () => {
    renderSelect();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByPlaceholderText("Search columns...")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByPlaceholderText("Search columns..."), { key: "Escape" });
    // Panel stays mounted for the close animation, then unmounts on animationend.
    const panel = document.querySelector('[data-state="closed"]');
    expect(panel).not.toBeNull();
    fireEvent.animationEnd(panel as Element);
    expect(screen.queryByPlaceholderText("Search columns...")).not.toBeInTheDocument();
  });

  it("selects the highlighted option with ArrowDown then Enter", () => {
    const onChange = vi.fn();
    renderSelect({ onChange });
    fireEvent.click(screen.getByRole("button"));
    const search = screen.getByPlaceholderText("Search columns...");
    // Highlight starts at index 0 (City); ArrowDown twice moves to Date.
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("Date");
  });

  it("clamps ArrowUp at the first option", () => {
    const onChange = vi.fn();
    renderSelect({ onChange });
    fireEvent.click(screen.getByRole("button"));
    const search = screen.getByPlaceholderText("Search columns...");
    // Already at the top; ArrowUp should keep the first option highlighted.
    fireEvent.keyDown(search, { key: "ArrowUp" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("City");
  });
});
