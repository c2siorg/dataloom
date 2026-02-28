import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useToast } from "../../hooks/useToast";

// Mock the hooks and API before importing the component
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

vi.mock("../../hooks/useToast", () => ({
  useToast: vi.fn(),
}));

vi.mock("../../api", () => ({
  uploadProject: vi.fn(),
  getRecentProjects: vi.fn(),
  deleteProject: vi.fn(),
}));

import * as api from "../../api";

// Mock the ConfirmDialog component
vi.mock("../common/ConfirmDialog", () => ({
  default: ({ isOpen, message, onConfirm, onCancel }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="confirm-dialog" role="dialog">
        <p>{message}</p>
        <button onClick={onConfirm} data-testid="confirm-delete">
          Confirm
        </button>
        <button onClick={onCancel} data-testid="cancel-delete">
          Cancel
        </button>
      </div>
    );
  },
}));

// Import component after mocks
import HomeScreen from "../Homescreen";

const renderWithRouter = (component) => {
  return render(<MemoryRouter>{component}</MemoryRouter>);
};

describe("HomeScreen", () => {
  const mockNavigate = vi.fn();
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useNavigate.mockReturnValue(mockNavigate);
    useToast.mockReturnValue({ showToast: mockShowToast });
  });

  it("renders the upload area with welcome message", async () => {
    api.getRecentProjects.mockResolvedValue([]);

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    expect(screen.getByText(/Welcome to/i)).toBeInTheDocument();
    expect(screen.getByText("DataLoom")).toBeInTheDocument();
    expect(screen.getByText(/your one-stop for/i)).toBeInTheDocument();
    expect(screen.getByText("Dataset Transformations")).toBeInTheDocument();
  });

  it("renders the new project button", async () => {
    api.getRecentProjects.mockResolvedValue([]);

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    expect(screen.getByText("New Project")).toBeInTheDocument();
  });

  it("opens the upload modal when clicking new project button", async () => {
    api.getRecentProjects.mockResolvedValue([]);
    const user = userEvent.setup();

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await user.click(screen.getByText("New Project"));

    expect(screen.getByText("Project Name")).toBeInTheDocument();
    expect(screen.getByText("Upload Dataset")).toBeInTheDocument();
    expect(screen.getByText("Project Description")).toBeInTheDocument();
  });

  it("displays a list of recent projects", async () => {
    const mockProjects = [
      {
        project_id: "proj-1",
        name: "Sales Data 2024",
        description: "Annual sales report data",
        last_modified: "2024-01-15T10:30:00Z",
      },
      {
        project_id: "proj-2",
        name: "Customer Analytics",
        description: "Customer behavior analysis",
        last_modified: "2024-01-14T08:45:00Z",
      },
    ];
    api.getRecentProjects.mockResolvedValue(mockProjects);

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await waitFor(() => {
      expect(screen.getByText("Sales Data 2024")).toBeInTheDocument();
    });

    expect(screen.getByText("Customer Analytics")).toBeInTheDocument();
    expect(screen.getByText("Annual sales report data")).toBeInTheDocument();
  });

  it("shows empty state when no projects exist", async () => {
    api.getRecentProjects.mockResolvedValue([]);

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await waitFor(() => {
      expect(api.getRecentProjects).toHaveBeenCalledTimes(1);
    });

    // Only New Project button should be visible
    expect(screen.getByText("New Project")).toBeInTheDocument();
    expect(screen.queryByText("Sales Data 2024")).not.toBeInTheDocument();
  });

  it("handles file upload and calls the API", async () => {
    api.getRecentProjects.mockResolvedValue([]);
    api.uploadProject.mockResolvedValue({ project_id: "new-proj-123" });
    const user = userEvent.setup();

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await user.click(screen.getByText("New Project"));

    // Fill in project name
    const nameInput = screen.getAllByRole("textbox")[0];
    await user.type(nameInput, "Test Project");

    // Fill in description
    const descInput = screen.getAllByRole("textbox")[1];
    await user.type(descInput, "Test Description");

    // Upload a file - find by the title heading and then the input after it
    const file = new File(["test content"], "test.csv", { type: "text/csv" });
    // The file input follows the "Upload Dataset" heading
    const uploadHeading = screen.getByText("Upload Dataset");
    const fileInput = uploadHeading.nextElementSibling;
    await user.upload(fileInput, file);

    // Submit the form
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(api.uploadProject).toHaveBeenCalledWith(
        expect.any(File),
        "Test Project",
        "Test Description",
      );
    });
  });

  it("navigates to workspace after successful upload", async () => {
    api.getRecentProjects.mockResolvedValue([]);
    api.uploadProject.mockResolvedValue({ project_id: "new-proj-123" });
    const user = userEvent.setup();

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await user.click(screen.getByText("New Project"));

    // Fill in project name
    const nameInput = screen.getAllByRole("textbox")[0];
    await user.type(nameInput, "Test Project");

    // Fill in description
    const descInput = screen.getAllByRole("textbox")[1];
    await user.type(descInput, "Test Description");

    // Upload a file
    const file = new File(["test content"], "test.csv", { type: "text/csv" });
    const uploadHeading = screen.getByText("Upload Dataset");
    const fileInput = uploadHeading.nextElementSibling;
    await user.upload(fileInput, file);

    // Submit the form
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/workspace/new-proj-123");
    });
  });

  it("shows warning toast when file is not selected", async () => {
    api.getRecentProjects.mockResolvedValue([]);
    const user = userEvent.setup();

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await user.click(screen.getByText("New Project"));

    // Fill in project name
    const nameInput = screen.getAllByRole("textbox")[0];
    await user.type(nameInput, "Test Project");

    // Fill in description
    const descInput = screen.getAllByRole("textbox")[1];
    await user.type(descInput, "Test Description");

    // Submit without file
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(mockShowToast).toHaveBeenCalledWith("Please select a file to upload", "warning");
  });

  it("shows warning toast when project name is empty", async () => {
    api.getRecentProjects.mockResolvedValue([]);
    const user = userEvent.setup();

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await user.click(screen.getByText("New Project"));

    // Fill in description only
    const descInput = screen.getAllByRole("textbox")[1];
    await user.type(descInput, "Test Description");

    // Upload a file
    const file = new File(["test content"], "test.csv", { type: "text/csv" });
    const uploadHeading = screen.getByText("Upload Dataset");
    const fileInput = uploadHeading.nextElementSibling;
    await user.upload(fileInput, file);

    // Submit without project name
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(mockShowToast).toHaveBeenCalledWith("Project Name cannot be empty", "warning");
  });

  it("navigates to existing project when project card is clicked", async () => {
    const mockProjects = [
      {
        project_id: "proj-1",
        name: "Sales Data 2024",
        description: "Annual sales report data",
        last_modified: "2024-01-15T10:30:00Z",
      },
    ];
    api.getRecentProjects.mockResolvedValue(mockProjects);
    const user = userEvent.setup();

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await waitFor(() => {
      expect(screen.getByText("Sales Data 2024")).toBeInTheDocument();
    });

    // Find the project card button and click it (the main card, not the delete button)
    const projectCard = screen.getByText("Sales Data 2024").closest("button");
    await user.click(projectCard);

    expect(mockNavigate).toHaveBeenCalledWith("/workspace/proj-1");
  });

  it("opens delete confirmation dialog when delete button is clicked", async () => {
    const mockProjects = [
      {
        project_id: "proj-1",
        name: "Sales Data 2024",
        description: "Annual sales report data",
        last_modified: "2024-01-15T10:30:00Z",
      },
    ];
    api.getRecentProjects.mockResolvedValue(mockProjects);
    const user = userEvent.setup();

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await waitFor(() => {
      expect(screen.getByText("Sales Data 2024")).toBeInTheDocument();
    });

    // Click the delete button (the trash icon is in an aria-label button)
    const deleteButton = screen.getByLabelText("Delete project");
    await user.click(deleteButton);

    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete this project/i)).toBeInTheDocument();
  });

  it("deletes project when confirming delete", async () => {
    const mockProjects = [
      {
        project_id: "proj-1",
        name: "Sales Data 2024",
        description: "Annual sales report data",
        last_modified: "2024-01-15T10:30:00Z",
      },
    ];
    api.getRecentProjects.mockResolvedValue(mockProjects);
    api.deleteProject.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await waitFor(() => {
      expect(screen.getByText("Sales Data 2024")).toBeInTheDocument();
    });

    // Click the delete button
    const deleteButton = screen.getByLabelText("Delete project");
    await user.click(deleteButton);

    // Confirm delete
    await user.click(screen.getByTestId("confirm-delete"));

    await waitFor(() => {
      expect(api.deleteProject).toHaveBeenCalledWith("proj-1");
    });

    expect(mockShowToast).toHaveBeenCalledWith("Project deleted successfully", "success");
  });

  it("closes modal when clicking close button", async () => {
    api.getRecentProjects.mockResolvedValue([]);
    const user = userEvent.setup();

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await user.click(screen.getByText("New Project"));
    expect(screen.getByText("Project Name")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(screen.queryByText("Project Name")).not.toBeInTheDocument();
  });

  it("handles API error during project fetch gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    api.getRecentProjects.mockRejectedValue(new Error("Network error"));

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith("Error fetching recent projects:", expect.any(Error));
    });

    // Component should still render
    expect(screen.getByText(/Welcome to/i)).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it("handles API error during upload gracefully", async () => {
    api.getRecentProjects.mockResolvedValue([]);
    api.uploadProject.mockRejectedValue(new Error("Upload failed"));
    const user = userEvent.setup();

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await user.click(screen.getByText("New Project"));

    // Fill in project name
    const nameInput = screen.getAllByRole("textbox")[0];
    await user.type(nameInput, "Test Project");

    // Fill in description
    const descInput = screen.getAllByRole("textbox")[1];
    await user.type(descInput, "Test Description");

    // Upload a file
    const file = new File(["test content"], "test.csv", { type: "text/csv" });
    const uploadHeading = screen.getByText("Upload Dataset");
    const fileInput = uploadHeading.nextElementSibling;
    await user.upload(fileInput, file);

    // Submit the form
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        "Error uploading file. Please try again.",
        "error",
      );
    });
  });

  it("cancels delete operation when cancel button is clicked", async () => {
    const mockProjects = [
      {
        project_id: "proj-1",
        name: "Sales Data 2024",
        description: "Annual sales report data",
        last_modified: "2024-01-15T10:30:00Z",
      },
    ];
    api.getRecentProjects.mockResolvedValue(mockProjects);
    const user = userEvent.setup();

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await waitFor(() => {
      expect(screen.getByText("Sales Data 2024")).toBeInTheDocument();
    });

    // Click the delete button
    const deleteButton = screen.getByLabelText("Delete project");
    await user.click(deleteButton);

    // Cancel delete
    await user.click(screen.getByTestId("cancel-delete"));

    // Dialog should close
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();

    // deleteProject should not be called
    expect(api.deleteProject).not.toHaveBeenCalled();
  });

  it("formats the last modified date correctly", async () => {
    const mockProjects = [
      {
        project_id: "proj-1",
        name: "Test Project",
        description: "Test description",
        last_modified: "2024-06-15T10:30:00Z",
      },
    ];
    api.getRecentProjects.mockResolvedValue(mockProjects);

    await act(async () => {
      renderWithRouter(<HomeScreen />);
    });

    await waitFor(() => {
      expect(screen.getByText("Test Project")).toBeInTheDocument();
    });

    // Check that the date is formatted and displayed
    // The date format should be like "Jun 15, 2024" or similar
    const dateRegex = /[A-Z][a-z]{2} \d{1,2}, \d{4}/;
    expect(screen.getByText(dateRegex)).toBeInTheDocument();
  });
});
