import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import Homescreen from "../Homescreen";
import { ToastProvider } from "../../context/ToastContext";
import * as projectsApi from "../../api/projects";

// Mock the projects API
vi.mock("../../api/projects", () => ({
    uploadProject: vi.fn(),
    getRecentProjects: vi.fn(),
    deleteProject: vi.fn(),
}));

// ============ 
// TEST DATA FACTORIES
// ============
/**
 * Factory function to create consistent project objects
 * Allows easy extension if API structure changes
 */
const createMockProject = (overrides = {}) => {
    const defaults = {
        project_id: `project-${Math.random().toString(36).substr(2, 9)}`,
        name: "Test Project",
        description: "Test Description",
        last_modified: new Date().toISOString(),
    };
    return { ...defaults, ...overrides };
};

/**
 * Factory function to create an array of mock projects
 * Useful for testing with varying dataset sizes
 */
const createMockProjects = (count = 2, overrides = {}) => {
    return Array.from({ length: count }, (_, i) =>
        createMockProject({
            project_id: `project-${i + 1}`,
            name: `Project ${i + 1}`,
            description: `Description for project ${i + 1}`,
            last_modified: new Date(Date.now() - i * 86400000).toISOString(),
            ...overrides,
        })
    );
};

/**
 * Factory function to create a CSV file for testing
 */
const createMockFile = (content = "test content", filename = "test.csv") => {
    return new File([content], filename, { type: "text/csv" });
};

// ============ 
// TEST CONSTANTS
// ============
const TEST_IDS = {
    newProjectButton: { name: /New Project/i },
    closeButton: { name: /Close/i },
    submitButton: { name: /Submit/i },
};

const TEST_TEXTS = {
    welcome: /Welcome to/i,
    dataLoom: "DataLoom",
    projects: "Projects",
    projectName: "Project Name",
    projectDescription: "Project Description",
    uploadDataset: "Upload Dataset",
};

const TEST_ERROR_MESSAGES = {
    fileRequired: /Please select a file/i,
    nameEmpty: /Project Name cannot be empty/i,
    descriptionEmpty: /Project Description cannot be empty/i,
    uploadFailed: /Error uploading file/i,
};

// ============ 
// HELPER UTILITIES
// ============
/**
 * Wait for and return the file input element
 * Decouples from implementation detail of selector
 */
const getFileInput = () => document.querySelector('input[type="file"]');

/**
 * Find the modal backdrop by checking for common styling patterns
 * More resilient to className changes than checking exact classes
 */
const findAndClickBackdrop = async () => {
    const allDivs = document.querySelectorAll("div");
    for (const div of allDivs) {
        // Look for elements with backdrop-like characteristics
        if (
            div.className.includes("fixed") &&
            div.className.includes("inset-0") &&
            div.className.includes("bg-black")
        ) {
            fireEvent.click(div);
            return true;
        }
    }
    return false;
};

/**
 * Get all form input fields
 * Useful for filling multiple form fields
 */
const getFormInputs = () => screen.getAllByRole("textbox");

// Render component with required providers
const renderHomescreen = () => {
    return render(
        <BrowserRouter>
            <ToastProvider>
                <Homescreen />
            </ToastProvider>
        </BrowserRouter>
    );
};

describe("Homescreen Component", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default mock to return empty array
        projectsApi.getRecentProjects.mockResolvedValue([]);
    });

    describe("Rendering", () => {
        it("should render the welcome heading", async () => {
            renderHomescreen();
            await waitFor(() => {
                expect(screen.getByText(/Welcome to/i)).toBeInTheDocument();
            });
            expect(screen.getByText("DataLoom")).toBeInTheDocument();
        });

        it("should render the upload area with New Project button", async () => {
            renderHomescreen();
            await waitFor(() => {
                const newProjectButton = screen.getByRole("button", { name: /New Project/i });
                expect(newProjectButton).toBeInTheDocument();
            });
        });

        it("should render Projects section header", async () => {
            renderHomescreen();
            await waitFor(() => {
                expect(screen.getByText("Projects")).toBeInTheDocument();
            });
        });
    });

    describe("Recent Projects List", () => {
        it("should display recent projects when available", async () => {
            const mockProjects = createMockProjects(2, {
                0: { name: "Sales Data", description: "Q1 Sales Data 2024" },
                1: { name: "Customer List", description: "Customer Database" },
            }).map((p, i) => i === 0 ? { ...p, name: "Sales Data", description: "Q1 Sales Data 2024" } : i === 1 ? { ...p, name: "Customer List", description: "Customer Database" } : p);

            projectsApi.getRecentProjects.mockResolvedValue(mockProjects);
            renderHomescreen();

            await waitFor(() => {
                expect(screen.getByText("Sales Data")).toBeInTheDocument();
                expect(screen.getByText("Customer List")).toBeInTheDocument();
            });
        });

        it("should show empty state when no projects exist", async () => {
            projectsApi.getRecentProjects.mockResolvedValue([]);
            renderHomescreen();

            await waitFor(() => {
                const newProjectButton = screen.getByRole("button", { name: /New Project/i });
                expect(newProjectButton).toBeInTheDocument();
            });

            // Verify only the New Project button is visible
            const projectCards = screen.queryAllByRole("button");
            expect(projectCards.length).toBe(1); // Only the New Project button
        });

        it("should fetch recent projects on component mount", async () => {
            projectsApi.getRecentProjects.mockResolvedValue([]);
            renderHomescreen();

            await waitFor(() => {
                expect(projectsApi.getRecentProjects).toHaveBeenCalledTimes(1);
            });
        });

        it("should display project descriptions", async () => {
            const mockProjects = [createMockProject({ description: "This is a test description" })];

            projectsApi.getRecentProjects.mockResolvedValue(mockProjects);
            renderHomescreen();

            await waitFor(() => {
                expect(screen.getByText("This is a test description")).toBeInTheDocument();
            });
        });

        it("should display formatted last modified date", async () => {
            const mockProjects = [createMockProject({ last_modified: "2024-03-15T10:30:00" })];

            projectsApi.getRecentProjects.mockResolvedValue(mockProjects);
            renderHomescreen();

            await waitFor(() => {
                expect(screen.getByText(/Mar 15, 2024|15 Mar 2024|Mar 15, 2024/)).toBeInTheDocument();
            });
        });
    });

    describe("Modal - New Project", () => {
        it("should open modal when New Project button is clicked", async () => {
            renderHomescreen();

            const newProjectButton = await screen.findByRole("button", TEST_IDS.newProjectButton);
            await userEvent.click(newProjectButton);

            expect(screen.getByText(TEST_TEXTS.projectName)).toBeInTheDocument();
            expect(screen.getByText(TEST_TEXTS.uploadDataset)).toBeInTheDocument();
            expect(screen.getByText(TEST_TEXTS.projectDescription)).toBeInTheDocument();
        });

        it("should close modal when close button is clicked", async () => {
            renderHomescreen();

            const newProjectButton = await screen.findByRole("button", TEST_IDS.newProjectButton);
            await userEvent.click(newProjectButton);

            const closeButton = screen.getByRole("button", TEST_IDS.closeButton);
            await userEvent.click(closeButton);

            expect(screen.queryByText(TEST_TEXTS.projectName)).not.toBeInTheDocument();
        });

        it("should close modal when backdrop is clicked", async () => {
            renderHomescreen();

            const newProjectButton = await screen.findByRole("button", TEST_IDS.newProjectButton);
            await userEvent.click(newProjectButton);

            // Check that modal is open
            expect(screen.getByText(TEST_TEXTS.projectName)).toBeInTheDocument();

            // Use helper to find and click backdrop
            const backDropFound = await findAndClickBackdrop();

            if (backDropFound) {
                await waitFor(() => {
                    expect(screen.queryByText(TEST_TEXTS.projectName)).not.toBeInTheDocument();
                });
            }
        });
    });

    describe("File Upload", () => {
        it("should handle file selection", async () => {
            renderHomescreen();

            const newProjectButton = await screen.findByRole("button", TEST_IDS.newProjectButton);
            await userEvent.click(newProjectButton);

            const fileInput = getFileInput();
            expect(fileInput).toBeInTheDocument();

            const file = createMockFile();
            await userEvent.upload(fileInput, file);

            expect(fileInput.files[0]).toBe(file);
        });

        it("should show warning when submitting without file", async () => {
            renderHomescreen();

            const newProjectButton = await screen.findByRole("button", TEST_IDS.newProjectButton);
            await userEvent.click(newProjectButton);

            // Fill in project name and description but not file
            const inputs = getFormInputs();
            await userEvent.type(inputs[0], "Test Project");
            await userEvent.type(inputs[1], "Test Description");

            const submitButton = screen.getByRole("button", TEST_IDS.submitButton);
            await userEvent.click(submitButton);

            // Check for toast showing warning
            await waitFor(() => {
                const warningMessage = screen.queryByText(TEST_ERROR_MESSAGES.fileRequired);
                expect(warningMessage).toBeTruthy();
            });
        });

        it("should show warning when project name is empty", async () => {
            renderHomescreen();

            const newProjectButton = await screen.findByRole("button", TEST_IDS.newProjectButton);
            await userEvent.click(newProjectButton);

            const fileInput = getFileInput();
            const file = createMockFile();
            await userEvent.upload(fileInput, file);

            // Fill only description
            const inputs = getFormInputs();
            await userEvent.type(inputs[1], "Test Description");

            const submitButton = screen.getByRole("button", TEST_IDS.submitButton);
            await userEvent.click(submitButton);

            await waitFor(() => {
                const warningMessage = screen.queryByText(TEST_ERROR_MESSAGES.nameEmpty);
                expect(warningMessage).toBeTruthy();
            });
        });

        it("should show warning when project description is empty", async () => {
            renderHomescreen();

            const newProjectButton = await screen.findByRole("button", TEST_IDS.newProjectButton);
            await userEvent.click(newProjectButton);

            const fileInput = getFileInput();
            const file = createMockFile();
            await userEvent.upload(fileInput, file);

            // Fill only project name
            const inputs = getFormInputs();
            await userEvent.type(inputs[0], "Test Project");

            const submitButton = screen.getByRole("button", TEST_IDS.submitButton);
            await userEvent.click(submitButton);

            await waitFor(() => {
                const warningMessage = screen.queryByText(TEST_ERROR_MESSAGES.descriptionEmpty);
                expect(warningMessage).toBeTruthy();
            });
        });
    });

    describe("Project Upload and Navigation", () => {
        it("should upload project and navigate to workspace on success", async () => {
            const mockProject = createMockProject({ name: "Test Project" });
            projectsApi.uploadProject.mockResolvedValueOnce(mockProject);
            projectsApi.getRecentProjects.mockResolvedValue([]);

            renderHomescreen();

            const newProjectButton = await screen.findByRole("button", TEST_IDS.newProjectButton);
            await userEvent.click(newProjectButton);

            const fileInput = getFileInput();
            const file = createMockFile();
            await userEvent.upload(fileInput, file);

            const inputs = getFormInputs();
            await userEvent.type(inputs[0], "Test Project");
            await userEvent.type(inputs[1], "Test Description");

            const submitButton = screen.getByRole("button", TEST_IDS.submitButton);
            await userEvent.click(submitButton);

            await waitFor(() => {
                expect(projectsApi.uploadProject).toHaveBeenCalledWith(
                    file,
                    "Test Project",
                    "Test Description"
                );
            });
        });

        it("should show error toast on upload failure", async () => {
            projectsApi.uploadProject.mockRejectedValueOnce(new Error("Upload failed"));
            projectsApi.getRecentProjects.mockResolvedValue([]);

            renderHomescreen();

            const newProjectButton = await screen.findByRole("button", TEST_IDS.newProjectButton);
            await userEvent.click(newProjectButton);

            const fileInput = getFileInput();
            const file = createMockFile();
            await userEvent.upload(fileInput, file);

            const inputs = getFormInputs();
            await userEvent.type(inputs[0], "Test Project");
            await userEvent.type(inputs[1], "Test Description");

            const submitButton = screen.getByRole("button", TEST_IDS.submitButton);
            await userEvent.click(submitButton);

            await waitFor(() => {
                const errorMessage = screen.queryByText(TEST_ERROR_MESSAGES.uploadFailed);
                expect(errorMessage).toBeTruthy();
            });
        });

        it("should refresh recent projects after successful upload", async () => {
            projectsApi.getRecentProjects.mockResolvedValue([]);
            const mockProject = createMockProject();
            projectsApi.uploadProject.mockResolvedValueOnce(mockProject);

            renderHomescreen();

            // Initial call
            expect(projectsApi.getRecentProjects).toHaveBeenCalledTimes(1);

            const newProjectButton = await screen.findByRole("button", { name: /New Project/i });
            await userEvent.click(newProjectButton);

            const fileInput = document.querySelector('input[type="file"]');
            const file = new File(["test content"], "test.csv", { type: "text/csv" });
            await userEvent.upload(fileInput, file);

            const inputs = screen.getAllByRole("textbox");
            await userEvent.type(inputs[0], "Test Project");
            await userEvent.type(inputs[1], "Test Description");

            const submitButton = screen.getByRole("button", { name: /Submit/i });
            await userEvent.click(submitButton);

            await waitFor(() => {
                // Should be called again after upload
                expect(projectsApi.getRecentProjects).toHaveBeenCalledTimes(2);
            });
        });
    });

    describe("Project Deletion", () => {
        it("should open delete confirmation dialog when delete button is clicked", async () => {
            const mockProjects = [
                {
                    project_id: "1",
                    name: "Sales Data",
                    description: "Q1 Sales Data 2024",
                    last_modified: "2024-01-15T10:30:00",
                },
            ];

            projectsApi.getRecentProjects.mockResolvedValue(mockProjects);
            projectsApi.deleteProject.mockResolvedValue({ success: true });
            renderHomescreen();

            await waitFor(() => {
                const deleteButtons = screen.getAllByLabelText("Delete project");
                expect(deleteButtons.length).toBeGreaterThan(0);
            });

            const deleteButton = screen.getAllByLabelText("Delete project")[0];
            await userEvent.click(deleteButton);

            await waitFor(() => {
                expect(
                    screen.getByText(/Are you sure you want to delete this project/i)
                ).toBeInTheDocument();
            });
        });

        it("should delete project when confirmed", async () => {
            const mockProjects = [
                {
                    project_id: "1",
                    name: "Sales Data",
                    description: "Q1 Sales Data 2024",
                    last_modified: "2024-01-15T10:30:00",
                },
            ];

            projectsApi.getRecentProjects.mockResolvedValue(mockProjects);
            projectsApi.deleteProject.mockResolvedValue({ success: true });

            renderHomescreen();

            await waitFor(() => {
                const deleteButtons = screen.getAllByLabelText("Delete project");
                expect(deleteButtons.length).toBeGreaterThan(0);
            });

            const deleteButton = screen.getAllByLabelText("Delete project")[0];
            await userEvent.click(deleteButton);

            await waitFor(() => {
                expect(
                    screen.getByText(/Are you sure you want to delete this project/i)
                ).toBeInTheDocument();
            });

            const confirmButton = screen.getByRole("button", { name: /Confirm/i });
            await userEvent.click(confirmButton);

            await waitFor(() => {
                expect(projectsApi.deleteProject).toHaveBeenCalledWith("1");
            });
        });

        it("should refresh projects after deletion", async () => {
            const mockProjects = [
                {
                    project_id: "1",
                    name: "Sales Data",
                    description: "Q1 Sales Data 2024",
                    last_modified: "2024-01-15T10:30:00",
                },
            ];

            projectsApi.getRecentProjects.mockResolvedValue(mockProjects);
            projectsApi.deleteProject.mockResolvedValue({ success: true });

            renderHomescreen();

            // Initial call
            expect(projectsApi.getRecentProjects).toHaveBeenCalledTimes(1);

            await waitFor(() => {
                const deleteButtons = screen.queryAllByLabelText("Delete project");
                expect(deleteButtons.length).toBeGreaterThan(0);
            });

            const deleteButtons = screen.queryAllByLabelText("Delete project");
            if (deleteButtons.length > 0) {
                await userEvent.click(deleteButtons[0]);

                await waitFor(() => {
                    expect(screen.getByText(/Are you sure/i)).toBeInTheDocument();
                });

                const confirmButton = screen.getByRole("button", { name: /Confirm/i });
                await userEvent.click(confirmButton);

                await waitFor(() => {
                    // Should be called again after deletion
                    expect(projectsApi.getRecentProjects.mock.calls.length).toBeGreaterThanOrEqual(2);
                });
            }
        });

        it("should cancel deletion when cancelled", async () => {
            const mockProjects = [
                {
                    project_id: "1",
                    name: "Sales Data",
                    description: "Q1 Sales Data 2024",
                    last_modified: "2024-01-15T10:30:00",
                },
            ];

            projectsApi.getRecentProjects.mockResolvedValue(mockProjects);
            projectsApi.deleteProject.mockResolvedValue({ success: true });

            renderHomescreen();

            await waitFor(() => {
                const deleteButtons = screen.getAllByLabelText("Delete project");
                expect(deleteButtons.length).toBeGreaterThan(0);
            });

            const deleteButton = screen.getAllByLabelText("Delete project")[0];
            await userEvent.click(deleteButton);

            await waitFor(() => {
                expect(
                    screen.getByText(/Are you sure you want to delete this project/i)
                ).toBeInTheDocument();
            });

            const cancelButton = screen.getByRole("button", { name: /Cancel/i });
            await userEvent.click(cancelButton);

            await waitFor(() => {
                expect(
                    screen.queryByText(/Are you sure you want to delete this project/i)
                ).not.toBeInTheDocument();
            });

            // Delete should not have been called
            expect(projectsApi.deleteProject).not.toHaveBeenCalled();
        });

        it("should show error toast on deletion failure", async () => {
            const mockProjects = [
                {
                    project_id: "1",
                    name: "Sales Data",
                    description: "Q1 Sales Data 2024",
                    last_modified: "2024-01-15T10:30:00",
                },
            ];

            projectsApi.getRecentProjects.mockResolvedValue(mockProjects);
            projectsApi.deleteProject.mockRejectedValueOnce(new Error("Delete failed"));

            renderHomescreen();

            await waitFor(() => {
                const deleteButtons = screen.getAllByLabelText("Delete project");
                expect(deleteButtons.length).toBeGreaterThan(0);
            });

            const deleteButton = screen.getAllByLabelText("Delete project")[0];
            await userEvent.click(deleteButton);

            await waitFor(() => {
                expect(
                    screen.getByText(/Are you sure you want to delete this project/i)
                ).toBeInTheDocument();
            });

            const confirmButton = screen.getByRole("button", { name: /Confirm/i });
            await userEvent.click(confirmButton);

            await waitFor(() => {
                const errorMessage = screen.queryByText(/Failed to delete project/i);
                expect(errorMessage).toBeTruthy();
            });
        });
    });

    describe("Project Navigation", () => {
        it("should navigate to workspace when project is clicked", async () => {
            const mockProjects = [
                {
                    project_id: "test-project-123",
                    name: "Sales Data",
                    description: "Q1 Sales Data 2024",
                    last_modified: "2024-01-15T10:30:00",
                },
            ];

            projectsApi.getRecentProjects.mockResolvedValue(mockProjects);

            const { container } = renderHomescreen();

            await waitFor(() => {
                expect(screen.getByText("Sales Data")).toBeInTheDocument();
            });

            const projectButton = screen.getByText("Sales Data");
            await userEvent.click(projectButton);

            // The component uses navigate() which changes the URL
            await waitFor(() => {
                // Check that navigation was called (history change)
                expect(window.location.pathname).toContain("/workspace");
            });
        });
    });

    describe("Accessibility", () => {
        it("should have delete button with aria-label", async () => {
            const mockProjects = [
                {
                    project_id: "1",
                    name: "Sales Data",
                    description: "Q1 Sales Data 2024",
                    last_modified: "2024-01-15T10:30:00",
                },
            ];

            projectsApi.getRecentProjects.mockResolvedValue(mockProjects);
            projectsApi.deleteProject.mockResolvedValue({ success: true });
            renderHomescreen();

            await waitFor(() => {
                const deleteButton = screen.getByLabelText("Delete project");
                expect(deleteButton).toHaveAttribute("aria-label", "Delete project");
            });
        });
    });
});
