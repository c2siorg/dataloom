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
    render(<DtypeBadge dtype="integer" />);
    expect(screen.getByText("integer")).toBeInTheDocument();
  });

  it("applies blue classes for integer", () => {
    render(<DtypeBadge dtype="integer" />);
    expect(screen.getByText("integer").className).toContain("bg-blue-100");
  });

  it("applies teal classes for float", () => {
    render(<DtypeBadge dtype="float" />);
    expect(screen.getByText("float").className).toContain("bg-teal-100");
  });

  it("applies green classes for string", () => {
    render(<DtypeBadge dtype="string" />);
    expect(screen.getByText("string").className).toContain("bg-green-100");
  });

  it("applies purple classes for date", () => {
    render(<DtypeBadge dtype="date" />);
    expect(screen.getByText("date").className).toContain("bg-purple-100");
  });

  it("applies orange classes for boolean", () => {
    render(<DtypeBadge dtype="boolean" />);
    expect(screen.getByText("boolean").className).toContain("bg-orange-100");
  });

  it("applies gray fallback for unknown dtype", () => {
    render(<DtypeBadge dtype="other" />);
    expect(screen.getByText("other").className).toContain("bg-gray-100");
  });
});
