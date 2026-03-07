import { render, screen } from "@testing-library/react";
import DtypeBadge from "../DtypeBadge";

describe("DtypeBadge", () => {
  it("renders nothing when dtype is null", () => {
    const { container } = render(<DtypeBadge dtype={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when dtype is undefined", () => {
    const { container } = render(<DtypeBadge />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the dtype label", () => {
    render(<DtypeBadge dtype="int" />);
    expect(screen.getByText("int")).toBeInTheDocument();
  });

  it("applies blue classes for int", () => {
    render(<DtypeBadge dtype="int" />);
    expect(screen.getByText("int").className).toContain("bg-blue-100");
  });

  it("applies teal classes for float", () => {
    render(<DtypeBadge dtype="float" />);
    expect(screen.getByText("float").className).toContain("bg-teal-100");
  });

  it("applies green classes for str", () => {
    render(<DtypeBadge dtype="str" />);
    expect(screen.getByText("str").className).toContain("bg-green-100");
  });

  it("applies purple classes for datetime", () => {
    render(<DtypeBadge dtype="datetime" />);
    expect(screen.getByText("datetime").className).toContain("bg-purple-100");
  });

  it("applies orange classes for bool", () => {
    render(<DtypeBadge dtype="bool" />);
    expect(screen.getByText("bool").className).toContain("bg-orange-100");
  });

  it("applies gray fallback for unknown dtype", () => {
    render(<DtypeBadge dtype="other" />);
    expect(screen.getByText("other").className).toContain("bg-gray-100");
  });
});
