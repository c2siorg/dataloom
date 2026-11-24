import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPipelines } from "../api/pipelines";
import SettingsPage from "../pages/settings/SettingsPage";
import SettingsPipelinesPage from "../pages/settings/SettingsPipelinesPage";

vi.mock("../api/pipelines", () => ({
  getPipelines: vi.fn(),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

describe("Saved Pipelines Settings navigation", () => {
  beforeEach(() => {
    vi.mocked(getPipelines).mockResolvedValue([]);
  });

  it("opens the Saved Pipelines child page from the Settings navigation", async () => {
    render(
      <MemoryRouter initialEntries={["/settings/pipelines"]}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />}>
            <Route path="pipelines" element={<SettingsPipelinesPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const navigationLink = screen.getByRole("link", { name: "Saved Pipelines" });
    expect(navigationLink).toHaveAttribute("href", "/settings/pipelines");
    expect(navigationLink).toHaveClass("bg-blue-50");
    expect(await screen.findByRole("heading", { name: "Saved Pipelines" })).toBeInTheDocument();
  });
});
