import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SettingsProjectPage from "../pages/settings/SettingsProjectPage";
import * as projectsApi from "../api/projects";

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock("../api/projects", () => ({
  getProjectMeta: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock("../api", () => ({
  deleteProject: vi.fn(),
}));

const mockProject = {
  project_id: "proj-1",
  name: "Test Project",
  description: "Test description",
  last_modified: "2026-01-01T00:00:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectsApi.getProjectMeta).mockResolvedValue(mockProject);
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/settings/projects/proj-1"]}>
      <Routes>
        <Route path="/settings/projects/:projectId" element={<SettingsProjectPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("SettingsProjectPage", () => {
  it("renders project name and description from API", async () => {
    renderPage();

    expect(await screen.findByDisplayValue("Test Project")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test description")).toBeInTheDocument();
  });

  it("calls updateProject with only name on save name", async () => {
    vi.mocked(projectsApi.updateProject).mockResolvedValue({});

    renderPage();

    const nameInput = await screen.findByPlaceholderText("Project name");

    fireEvent.change(nameInput, {
      target: { value: "New Name" },
    });

    expect(nameInput).toHaveValue("New Name");

    fireEvent.click(screen.getByRole("button", { name: /save name/i }));

    expect(projectsApi.updateProject).toHaveBeenCalledWith("proj-1", {
      name: "New Name",
    });
  });
  it("calls updateProject with only description on save description", async () => {
    vi.mocked(projectsApi.updateProject).mockResolvedValue({});

    renderPage();

    const descriptionInput = await screen.findByPlaceholderText(
      "Brief description of this dataset",
    );

    fireEvent.change(descriptionInput, {
      target: { value: "New desc" },
    });

    expect(descriptionInput).toHaveValue("New desc");

    fireEvent.click(screen.getByRole("button", { name: /save description/i }));

    expect(projectsApi.updateProject).toHaveBeenCalledWith("proj-1", {
      description: "New desc",
    });
  });
});
