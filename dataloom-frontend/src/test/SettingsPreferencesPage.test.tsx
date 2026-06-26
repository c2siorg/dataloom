import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SettingsPreferencesPage from "../pages/settings/SettingsPreferencesPage";

const updatePageSizePreference = vi.fn();
const showToast = vi.fn();

vi.mock("../context/ProjectContext", () => ({
  useProjectContext: () => ({
    pageSize: Number(localStorage.getItem("pageSize")) || 10,
    updatePageSizePreference,
  }),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({
    showToast,
  }),
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("SettingsPreferencesPage", () => {
  it("renders page size and export format selects", () => {
    render(<SettingsPreferencesPage />);

    expect(screen.getByText("Default page size")).toBeInTheDocument();
    expect(screen.getByText("Default export format")).toBeInTheDocument();
  });

  it("saves page size preference on save", () => {
    render(<SettingsPreferencesPage />);

    fireEvent.change(screen.getAllByRole("combobox")[0]!, {
      target: { value: "25" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));

    expect(updatePageSizePreference).toHaveBeenCalledWith(25);
    expect(showToast).toHaveBeenCalledWith("Preferences saved.", "success");
  });

  it("saves export format to localStorage on save", () => {
    render(<SettingsPreferencesPage />);

    fireEvent.change(screen.getAllByRole("combobox")[1]!, {
      target: { value: "json" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));

    expect(localStorage.getItem("defaultExportFormat")).toBe("json");
    expect(showToast).toHaveBeenCalledWith("Preferences saved.", "success");
  });

  it("reads existing pageSize from context on mount", () => {
    localStorage.setItem("pageSize", "100");

    render(<SettingsPreferencesPage />);

    expect(screen.getAllByRole("combobox")[0]).toHaveValue("100");
  });

  it("reads existing export format from localStorage on mount", () => {
    localStorage.setItem("defaultExportFormat", "xlsx");

    render(<SettingsPreferencesPage />);

    expect(screen.getAllByRole("combobox")[1]).toHaveValue("xlsx");
  });
});
