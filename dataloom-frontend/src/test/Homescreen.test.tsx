import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import HomeScreen from "../Components/Homescreen";
import * as api from "../api";
import { ToastProvider } from "../context/ToastContext";
import { ProjectProvider } from "../context/ProjectContext";
import { ACCEPTED_EXTENSIONS } from "../utils/fileUtils";

vi.mock("../api", () => ({
  uploadProject: vi.fn(),
  getRecentProjects: vi.fn(),
  deleteProject: vi.fn(),
  searchProjects: vi.fn(),
  updateProject: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => mockNavigate,
}));

const mockProjects = [
  {
    project_id: "p1",
    name: "Time series test",
    description: "testing dataset for time-series feature",
    last_modified: "2026-07-29T10:00:00Z",
    upload_date: "2026-07-01T12:00:00Z",
    file_size_bytes: 2048,
    row_count: 1234,
    column_count: 5,
  },
  {
    project_id: "p2",
    name: "Coffee shop dataset",
    description: "sales data",
    last_modified: "2026-07-28T10:00:00Z",
    upload_date: null,
    file_size_bytes: null,
    row_count: null,
    column_count: null,
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

describe("HomeScreen - Project card metadata and layout", () => {
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

  const getCard = (projectId: string) =>
    screen.getAllByTestId("project-card").find((el) => el.dataset["projectId"] === projectId)!;

  it("renders rows, columns, file size and the upload date on the card", async () => {
    renderComponent();
    await screen.findByText("Time series test");

    const card = within(getCard("p1"));
    expect(card.getByTestId("project-card-stats")).toHaveTextContent(
      `${(1234).toLocaleString()} rows · 5 columns · 2.0 KB`,
    );
    const uploaded = new Date("2026-07-01T12:00:00Z").toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    expect(card.getByText(`Uploaded ${uploaded}`)).toBeInTheDocument();
    expect(card.getByText(/^Modified /)).toBeInTheDocument();
  });

  it("omits the metadata the backend could not compute", async () => {
    renderComponent();
    await screen.findByText("Coffee shop dataset");

    const card = within(getCard("p2"));
    expect(card.queryByTestId("project-card-stats")).not.toBeInTheDocument();
    expect(card.queryByText(/^Uploaded /)).not.toBeInTheDocument();
    expect(card.getByText(/^Modified /)).toBeInTheDocument();
  });

  it("exposes a single element for opening the project, separate from the menu button", async () => {
    renderComponent();
    await screen.findByText("Time series test");

    const cardElement = getCard("p1");
    const card = within(cardElement);
    const openButtons = card.getAllByTestId("project-card-open");
    expect(openButtons).toHaveLength(1);
    expect(openButtons[0]).toHaveAccessibleName("Time series test");
    expect(openButtons[0]).not.toContainElement(card.getByTestId("project-card-menu-button"));
    expect(cardElement.querySelector("button button")).toBeNull();

    fireEvent.click(card.getByTestId("project-card-menu-button"));
    expect(mockNavigate).not.toHaveBeenCalled();

    fireEvent.click(openButtons[0]!);
    expect(mockNavigate).toHaveBeenCalledWith("/workspace/p1");
  });

  it("names the accepted formats on the New Project tile", async () => {
    renderComponent();
    await screen.findByText("Time series test");

    expect(screen.getByTestId("new-project-card")).toHaveTextContent(
      ACCEPTED_EXTENSIONS.join(", "),
    );
  });
});

describe("HomeScreen - Upload flow", () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) so a mockResolvedValue/mockRejectedValue set by one
    // test cannot leak into the next.
    vi.resetAllMocks();
    vi.mocked(api.getRecentProjects).mockResolvedValue([]);
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

  const openModal = async () => {
    renderComponent();
    await screen.findByText("No projects yet");
    fireEvent.click(screen.getByTestId("new-project-card"));
    await screen.findByTestId("project-modal");
  };

  const selectFile = (name: string, bytes = 64) => {
    const file = new File([new Uint8Array(bytes)], name, { type: "text/csv" });
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
    return file;
  };

  const fillDetails = () => {
    fireEvent.change(screen.getByTestId("project-name-input"), {
      target: { value: "Sales Analysis Q1" },
    });
    fireEvent.change(screen.getByTestId("project-description-input"), {
      target: { value: "Quarterly sales figures" },
    });
  };

  it("offers a drop zone that names the accepted formats", async () => {
    await openModal();

    expect(screen.getByText("Drag & drop your dataset here")).toBeInTheDocument();
    expect(screen.getByText("Maximum file size: 10 MB")).toBeInTheDocument();
    expect(screen.getByTestId("file-input")).toHaveAttribute(
      "accept",
      ACCEPTED_EXTENSIONS.join(","),
    );
  });

  it("keeps the submit button disabled until a file, name and description are all present", async () => {
    await openModal();
    const submit = screen.getByTestId("submit-project");
    expect(submit).toBeDisabled();

    fillDetails();
    await waitFor(() => expect(screen.getByTestId("submit-project")).toBeDisabled());

    selectFile("sales.csv");
    await waitFor(() => expect(screen.getByTestId("submit-project")).toBeEnabled());
  });

  it("treats whitespace-only name or description as missing", async () => {
    await openModal();
    fireEvent.change(screen.getByTestId("project-name-input"), { target: { value: "   " } });
    fireEvent.change(screen.getByTestId("project-description-input"), {
      target: { value: "Quarterly sales figures" },
    });
    selectFile("sales.csv");

    expect(screen.getByTestId("submit-project")).toBeDisabled();

    fireEvent.change(screen.getByTestId("project-name-input"), {
      target: { value: "Sales Analysis Q1" },
    });

    await waitFor(() => expect(screen.getByTestId("submit-project")).toBeEnabled());
  });

  it("clears the selected file and re-disables submit when the file is removed", async () => {
    await openModal();
    fillDetails();
    selectFile("sales.csv");
    await waitFor(() => expect(screen.getByTestId("submit-project")).toBeEnabled());

    // The remove control is the only icon-only button in the modal (it has no accessible
    // name), so an empty-name query targets it uniquely and throws if that ever changes.
    fireEvent.click(screen.getByRole("button", { name: "" }));

    await waitFor(() => expect(screen.getByTestId("submit-project")).toBeDisabled());
    expect(screen.queryByText("sales.csv")).not.toBeInTheDocument();
    expect(screen.getByText("Drag & drop your dataset here")).toBeInTheDocument();
  });

  it("disables submit and shows a Creating state while the upload is in flight", async () => {
    let resolveUpload: (value: unknown) => void = () => {};
    vi.mocked(api.uploadProject).mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }) as never,
    );

    await openModal();
    fillDetails();
    selectFile("sales.csv");
    await waitFor(() => expect(screen.getByTestId("submit-project")).toBeEnabled());

    fireEvent.click(screen.getByTestId("submit-project"));

    await waitFor(() => expect(screen.getByTestId("submit-project")).toBeDisabled());
    expect(screen.getByTestId("submit-project")).toHaveTextContent("Creating...");

    resolveUpload({ project_id: "new-7" });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/workspace/new-7"));
  });

  it("shows the selected file name and size once a valid file is chosen", async () => {
    await openModal();
    selectFile("sales.csv", 2048);

    expect(await screen.findByText("sales.csv")).toBeInTheDocument();
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
    expect(screen.getByText(/CSV File/)).toBeInTheDocument();
  });

  it("rejects an unsupported extension, warns, and keeps the file unselected", async () => {
    await openModal();
    selectFile("notes.txt");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      `Unsupported file type. Allowed: ${ACCEPTED_EXTENSIONS.join(", ")}`,
    );
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
    expect(screen.getByText("Drag & drop your dataset here")).toBeInTheDocument();
  });

  it("discards a previously valid file when a later invalid file is chosen", async () => {
    await openModal();
    selectFile("sales.csv");
    expect(await screen.findByText("sales.csv")).toBeInTheDocument();

    selectFile("notes.txt");

    await screen.findByRole("alert");
    expect(screen.queryByText("sales.csv")).not.toBeInTheDocument();
    expect(screen.getByText("Drag & drop your dataset here")).toBeInTheDocument();
  });

  it("rejects a file over the 10 MB limit with a size-specific warning", async () => {
    await openModal();
    selectFile("huge.csv", 11 * 1024 * 1024);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("File too large (11.0 MB)");
    expect(alert).toHaveTextContent("Maximum allowed size is 10 MB.");
    expect(screen.queryByText("huge.csv")).not.toBeInTheDocument();
  });

  it("clears a rejected file so the same file can be re-selected", async () => {
    await openModal();
    selectFile("notes.txt");
    await screen.findByRole("alert");

    // jsdom puts a file input's `value` in filename value mode, so its getter always returns
    // "" and cannot observe the reset. Assert the reset behaviourally instead: re-selecting
    // the same file must re-run validation and raise a second warning.
    selectFile("notes.txt");

    expect(await screen.findAllByRole("alert")).toHaveLength(2);
  });

  it("accepts a file dropped onto the drop zone", async () => {
    await openModal();
    const dropZone = screen.getByText("Drag & drop your dataset here").closest("div.group")!;

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [new File([new Uint8Array(64)], "dropped.csv", { type: "text/csv" })],
      },
    });

    expect(await screen.findByText("dropped.csv")).toBeInTheDocument();
  });

  it("rejects a dropped file whose extension is not supported", async () => {
    await openModal();
    const dropZone = screen.getByText("Drag & drop your dataset here").closest("div.group")!;

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [
          new File([new Uint8Array(64)], "dropped.exe", { type: "application/octet-stream" }),
        ],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Unsupported file type");
    expect(screen.queryByText("dropped.exe")).not.toBeInTheDocument();
  });

  it("uploads the project and navigates to the new workspace on success", async () => {
    vi.mocked(api.uploadProject).mockResolvedValue({ project_id: "new-42" } as never);

    await openModal();
    fillDetails();
    const file = selectFile("sales.csv", 2048);
    await waitFor(() => expect(screen.getByTestId("submit-project")).toBeEnabled());

    fireEvent.click(screen.getByTestId("submit-project"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/workspace/new-42"));
    expect(api.uploadProject).toHaveBeenCalledWith(
      file,
      "Sales Analysis Q1",
      "Quarterly sales figures",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces the backend detail message and stays put when the upload fails", async () => {
    vi.mocked(api.uploadProject).mockRejectedValue({
      response: { data: { detail: "Unsupported file encoding" } },
    });

    await openModal();
    fillDetails();
    selectFile("sales.csv");
    await waitFor(() => expect(screen.getByTestId("submit-project")).toBeEnabled());

    fireEvent.click(screen.getByTestId("submit-project"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unsupported file encoding");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the failure carries no detail", async () => {
    vi.mocked(api.uploadProject).mockRejectedValue(new Error("network down"));

    await openModal();
    fillDetails();
    selectFile("sales.csv");
    await waitFor(() => expect(screen.getByTestId("submit-project")).toBeEnabled());

    fireEvent.click(screen.getByTestId("submit-project"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Error uploading file. Please try again.");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("treats a response without a project id as an error rather than navigating", async () => {
    vi.mocked(api.uploadProject).mockResolvedValue({} as never);

    await openModal();
    fillDetails();
    selectFile("sales.csv");
    await waitFor(() => expect(screen.getByTestId("submit-project")).toBeEnabled());

    fireEvent.click(screen.getByTestId("submit-project"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Error: Project ID is undefined.");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("clears the form when the modal is cancelled", async () => {
    await openModal();
    fillDetails();
    selectFile("sales.csv");
    await screen.findByText("sales.csv");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByTestId("project-modal")).not.toBeInTheDocument());
    expect(screen.queryByText("sales.csv")).not.toBeInTheDocument();
    expect(api.uploadProject).not.toHaveBeenCalled();
  });
});

describe("HomeScreen - Empty state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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

  it("shows the empty state and no project cards when there are no recent projects", async () => {
    vi.mocked(api.getRecentProjects).mockResolvedValue([]);
    renderComponent();

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(
      screen.getByText("Upload a dataset to get started. Your recent projects will appear here."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create your first project/i })).toBeInTheDocument();
    expect(screen.queryAllByTestId("project-card")).toHaveLength(0);
  });

  it("does not show the empty state when projects exist", async () => {
    vi.mocked(api.getRecentProjects).mockResolvedValue(mockProjects);
    renderComponent();

    await screen.findByText("Time series test");
    expect(screen.queryByText("No projects yet")).not.toBeInTheDocument();
  });

  it("opens the new project modal from the empty-state call to action", async () => {
    vi.mocked(api.getRecentProjects).mockResolvedValue([]);
    renderComponent();

    fireEvent.click(await screen.findByRole("button", { name: /Create your first project/i }));

    expect(await screen.findByTestId("project-modal")).toBeInTheDocument();
    expect(screen.getByText("New Project")).toBeInTheDocument();
  });
});
