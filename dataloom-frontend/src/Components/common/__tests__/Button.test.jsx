import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Button from "../Button";

describe("Button", () => {
  it("renders children text", () => {
    render(<Button>Click me</Button>);

    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });

  it("applies primary variant classes by default", () => {
    render(<Button>Primary</Button>);

    const button = screen.getByRole("button");

    expect(button.className).toContain("bg-accent");
    expect(button.className).toContain("hover:bg-accent-hover");
  });

  it("applies secondary variant classes", () => {
    render(<Button variant="secondary">Secondary</Button>);

    const button = screen.getByRole("button");

    expect(button.className).toContain("border-app-border");
    expect(button.className).toContain("bg-surface");
    expect(button.className).toContain("text-foreground");
  });

  it("applies danger variant classes", () => {
    render(<Button variant="danger">Danger</Button>);

    const button = screen.getByRole("button");

    expect(button.className).toContain("bg-red-500");
    expect(button.className).toContain("focus:ring-danger");
  });

  it("applies ghost variant classes", () => {
    render(<Button variant="ghost">Ghost</Button>);

    const button = screen.getByRole("button");

    expect(button.className).toContain("bg-transparent");
    expect(button.className).toContain("text-muted-foreground");
    expect(button.className).toContain("hover:bg-surface-hover");
  });

  it("applies success variant classes", () => {
    render(<Button variant="success">Success</Button>);

    const button = screen.getByRole("button");

    expect(button.className).toContain("bg-success");
    expect(button.className).toContain("hover:bg-success-hover");
  });

  it("falls back to primary for unknown variant", () => {
    render(<Button variant="unknown">Fallback</Button>);

    const button = screen.getByRole("button");

    expect(button.className).toContain("bg-accent");
    expect(button.className).toContain("hover:bg-accent-hover");
  });

  it("applies the default medium size", () => {
    render(<Button>Medium</Button>);

    const button = screen.getByRole("button");

    expect(button.className).toContain("px-4");
    expect(button.className).toContain("py-2");
  });

  it("applies the small size", () => {
    render(<Button size="sm">Small</Button>);

    const button = screen.getByRole("button");

    expect(button.className).toContain("px-3");
    expect(button.className).toContain("py-1.5");
    expect(button.className).toContain("text-sm");
  });

  it("falls back to medium for an unknown size", () => {
    render(<Button size="unknown">Fallback size</Button>);

    const button = screen.getByRole("button");

    expect(button.className).toContain("px-4");
    expect(button.className).toContain("py-2");
  });

  it("merges additional className", () => {
    render(<Button className="mt-4">Styled</Button>);

    expect(screen.getByRole("button").className).toContain("mt-4");
  });

  it("forwards extra props like aria-label", () => {
    render(<Button aria-label="save">Save</Button>);

    expect(screen.getByLabelText("save")).toBeInTheDocument();
  });

  it("calls onClick handler when clicked", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<Button onClick={handleClick}>Click</Button>);

    await user.click(screen.getByRole("button"));

    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("supports disabled state", () => {
    render(<Button disabled>Disabled</Button>);

    expect(screen.getByRole("button")).toBeDisabled();
  });
});
