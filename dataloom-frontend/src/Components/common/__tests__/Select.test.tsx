import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Select from "../Select";

const OPTIONS = [
  { value: "sum", label: "Sum" },
  { value: "mean", label: "Mean" },
  { value: "count", label: "Count" },
];

const renderSelect = (props = {}) =>
  render(<Select value="" onChange={vi.fn()} options={OPTIONS} {...props} />);

describe("Select", () => {
  it("shows the placeholder when no value matches", () => {
    renderSelect({ placeholder: "Pick one..." });
    expect(screen.getByText("Pick one...")).toBeInTheDocument();
  });

  it("shows the label of the selected value", () => {
    renderSelect({ value: "mean" });
    expect(screen.getByText("Mean")).toBeInTheDocument();
  });

  it("opens the popover and lists the options", () => {
    renderSelect();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("calls onChange with the value on selection", () => {
    const onChange = vi.fn();
    renderSelect({ onChange });
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Count"));
    expect(onChange).toHaveBeenCalledWith("count");
  });

  it("selects the highlighted option with the keyboard", () => {
    const onChange = vi.fn();
    renderSelect({ onChange });
    const button = screen.getByRole("button");
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "ArrowDown" });
    fireEvent.keyDown(button, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("mean");
  });

  it("closes the popover on Escape", () => {
    renderSelect();
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(button, { key: "Escape" });
    const panel = document.querySelector('[data-state="closed"]');
    expect(panel).not.toBeNull();
    fireEvent.animationEnd(panel as Element);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
