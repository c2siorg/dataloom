import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PasswordStrengthMeter from "../PasswordStrengthMeter";

describe("PasswordStrengthMeter", () => {
  it("shows a weak label for short passwords", () => {
    render(<PasswordStrengthMeter password="abc" />);

    expect(screen.getByText("Weak", { selector: "span.text-foreground" })).toBeInTheDocument();
  });

  it("shows a strong label for stronger passwords", () => {
    render(<PasswordStrengthMeter password="StrongPass123!" />);

    expect(screen.getByText("Strong", { selector: "span.text-foreground" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Password strength: Strong");
  });
});
