import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Navbar from "../Navbar";

vi.mock("../../context/ProjectContext", () => ({
  useProjectContext: () => ({
    projectId: "p1",
    projectName: "Sample Dataset",
    setProjectInfo: vi.fn(),
  }),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { name: "Test User" },
    logout: vi.fn(),
  }),
}));

vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock("../../context/ThemeContext", () => ({
  useTheme: () => ({
    isDarkMode: true,
    toggleTheme: vi.fn(),
  }),
}));

describe("Navbar", () => {
  it("renders logo and theme toggle button with accessibility attributes", () => {
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    );

    expect(screen.getByText("DataLoom")).toBeInTheDocument();
    const themeButton = screen.getByRole("switch");
    expect(themeButton).toBeInTheDocument();
    expect(themeButton).toHaveAttribute("title", "Switch to light mode");
    expect(themeButton).toHaveAttribute("aria-label", "Switch to light mode");
  });
});
