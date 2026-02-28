import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { BrowserRouter } from "react-router-dom";
import HomeScreen from "../../Homescreen";

import { vi } from "vitest";

vi.mock("../../../context/ToastContext", () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

describe("HomeScreen", () => {
  it("closes the Create Project modal when Escape is pressed", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <HomeScreen />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole("button", { name: /new project/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
