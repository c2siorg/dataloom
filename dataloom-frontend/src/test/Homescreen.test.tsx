import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import HomeScreen from "../Components/Homescreen";
import * as api from "../api";
import { ToastProvider } from "../context/ToastContext";
import { ProjectProvider } from "../context/ProjectContext";

vi.mock("../api", () => ({
  uploadProject: vi.fn(),
  getRecentProjects: vi.fn(),
  deleteProject: vi.fn(),
  searchProjects: vi.fn(),
  updateProject: vi.fn(),
}));

const mockProjects = [
  {
    project_id: "p1",
    name: "Time series test",
    description: "testing dataset for time-series feature",
    last_modified: "2026-07-29T10:00:00Z",
  },
  {
    project_id: "p2",
    name: "Coffee shop dataset",
    description: "sales data",
    last_modified: "2026-07-28T10:00:00Z",
  },
];

describe("HomeScreen - Dataset Card Menu & Edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getRecentProjects).mockResolvedValue(mockProjects);
  });

  const renderComponent = () =>
    render(
      <MemoryRouter>
        <ToastProvider>
          <ProjectProvider>
            <HomeScreen />
          </ProjectProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

  it("renders menu button on each project card", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Time series test")).toBeInTheDocument();
    });

    const menuButtons = screen.getAllByTestId("project-card-menu-button");
    expect(menuButtons.length).toBe(2);
  });

  it("opens menu dropdown with Edit and Delete actions on menu button click", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Time series test")).toBeInTheDocument();
    });

    const menuButtons = screen.getAllByTestId("project-card-menu-button");
    fireEvent.click(menuButtons[0]!);

    expect(screen.getByTestId("edit-project-action")).toBeInTheDocument();
    expect(screen.getByTestId("delete-project-action")).toBeInTheDocument();
  });

  it("only allows one project menu dropdown to be open at a time", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Time series test")).toBeInTheDocument();
    });

    const menuButtons = screen.getAllByTestId("project-card-menu-button");

    // Open first card's menu
    fireEvent.click(menuButtons[0]!);
    expect(screen.getAllByTestId("project-card-menu").length).toBe(1);

    // Open second card's menu -> first card's menu should close automatically
    fireEvent.click(menuButtons[1]!);
    expect(screen.getAllByTestId("project-card-menu").length).toBe(1);
  });

  it("opens edit project modal with pre-filled details when Edit option is clicked", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Time series test")).toBeInTheDocument();
    });

    const menuButtons = screen.getAllByTestId("project-card-menu-button");
    fireEvent.click(menuButtons[0]!);

    const editOption = screen.getByTestId("edit-project-action");
    fireEvent.click(editOption);

    expect(screen.getByTestId("edit-project-modal")).toBeInTheDocument();
    expect(screen.getByTestId("edit-project-name-input")).toHaveValue("Time series test");
    expect(screen.getByTestId("edit-project-description-input")).toHaveValue(
      "testing dataset for time-series feature",
    );
  });

  it("calls updateProject API when saving changes in edit modal", async () => {
    vi.mocked(api.updateProject).mockResolvedValue({
      project_id: "p1",
      filename: "Updated Time Series",
      description: "updated description",
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Time series test")).toBeInTheDocument();
    });

    const menuButtons = screen.getAllByTestId("project-card-menu-button");
    fireEvent.click(menuButtons[0]!);
    fireEvent.click(screen.getByTestId("edit-project-action"));

    const nameInput = screen.getByTestId("edit-project-name-input");
    const descInput = screen.getByTestId("edit-project-description-input");

    fireEvent.change(nameInput, { target: { value: "Updated Time Series" } });
    fireEvent.change(descInput, { target: { value: "updated description" } });

    const saveButton = screen.getByTestId("save-edit-project");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.updateProject).toHaveBeenCalledWith("p1", {
        name: "Updated Time Series",
        description: "updated description",
      });
    });
  });

  it("closes the menu dropdown when clicking outside the card", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Time series test")).toBeInTheDocument();
    });

    const menuButtons = screen.getAllByTestId("project-card-menu-button");
    fireEvent.click(menuButtons[0]!);
    expect(screen.getByTestId("project-card-menu")).toBeInTheDocument();

    fireEvent.click(document.body);

    expect(screen.queryByTestId("project-card-menu")).not.toBeInTheDocument();
  });

  it("closes the menu dropdown when Escape is pressed", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Time series test")).toBeInTheDocument();
    });

    const menuButtons = screen.getAllByTestId("project-card-menu-button");
    fireEvent.click(menuButtons[0]!);

    const toggle = menuButtons[0];
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("project-card-menu")).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("caps edit inputs at the lengths accepted by the backend", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Time series test")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTestId("project-card-menu-button")[0]!);
    fireEvent.click(screen.getByTestId("edit-project-action"));

    expect(screen.getByTestId("edit-project-name-input")).toHaveAttribute("maxLength", "255");
    expect(screen.getByTestId("edit-project-description-input")).toHaveAttribute(
      "maxLength",
      "1000",
    );
  });

  it("shows a readable toast when updateProject fails with an array-shaped detail", async () => {
    vi.mocked(api.updateProject).mockRejectedValue({
      response: {
        data: {
          detail: [
            {
              type: "string_too_long",
              loc: ["body", "name"],
              msg: "String should have at most 255 characters",
            },
          ],
        },
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Time series test")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTestId("project-card-menu-button")[0]!);
    fireEvent.click(screen.getByTestId("edit-project-action"));
    fireEvent.click(screen.getByTestId("save-edit-project"));

    expect(
      await screen.findByText("String should have at most 255 characters"),
    ).toBeInTheDocument();
  });

  it("falls back to a generic toast when updateProject fails without a detail", async () => {
    vi.mocked(api.updateProject).mockRejectedValue(new Error("Network Error"));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Time series test")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTestId("project-card-menu-button")[0]!);
    fireEvent.click(screen.getByTestId("edit-project-action"));
    fireEvent.click(screen.getByTestId("save-edit-project"));

    expect(await screen.findByText("Failed to update project")).toBeInTheDocument();
  });

  it("closes edit modal when cancel button is clicked", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Time series test")).toBeInTheDocument();
    });

    const menuButtons = screen.getAllByTestId("project-card-menu-button");
    fireEvent.click(menuButtons[0]!);
    fireEvent.click(screen.getByTestId("edit-project-action"));

    expect(screen.getByTestId("edit-project-modal")).toBeInTheDocument();

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(screen.queryByTestId("edit-project-modal")).not.toBeInTheDocument();
  });
});
