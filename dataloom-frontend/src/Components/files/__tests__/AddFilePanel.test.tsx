import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AddFilePanel from "../AddFilePanel";
import type { AppendPreview, ProjectFileEntry } from "../../../api/projectFiles";

const previewAddFile = vi.fn();
const addFileToProject = vi.fn();
const getProjectFiles = vi.fn();
const reappendProjectFile = vi.fn();
const refreshProject = vi.fn();
const refreshLogs = vi.fn();
const showToast = vi.fn();

vi.mock("../../../api/projectFiles", () => ({
  previewAddFile: (...args: unknown[]) => previewAddFile(...args),
  addFileToProject: (...args: unknown[]) => addFileToProject(...args),
  getProjectFiles: (...args: unknown[]) => getProjectFiles(...args),
  reappendProjectFile: (...args: unknown[]) => reappendProjectFile(...args),
}));
vi.mock("../../../context/ProjectContext", () => ({
  useProjectContext: () => ({ refreshProject, pageSize: 50 }),
}));
vi.mock("../../../context/HistoryRefreshContext", () => ({
  useHistoryRefresh: () => ({ refreshLogs }),
}));
vi.mock("../../../context/ToastContext", () => ({
  useToast: () => ({ showToast }),
}));

const PREVIEW: AppendPreview = {
  matched_columns: ["name"],
  new_columns: ["city"],
  missing_columns: ["age"],
  dtype_clashes: [{ column: "id", existing_dtype: "int", incoming_dtype: "str" }],
  current_row_count: 3,
  incoming_row_count: 2,
};

const INVENTORY: ProjectFileEntry[] = [
  { id: "f1", original_filename: "feb.csv", uploaded_at: "2026-07-05T00:00:00" },
];

beforeEach(() => {
  vi.clearAllMocks();
  getProjectFiles.mockResolvedValue([]);
});

function renderPanel() {
  render(<AddFilePanel projectId="p1" onClose={vi.fn()} />);
}

const appendButton = () => screen.getByRole("button", { name: /^append/i });

const chooseFile = () => {
  const file = new File(["name,city\nDana,Paris"], "feb.csv", { type: "text/csv" });
  fireEvent.change(screen.getByTestId("add-file-input"), { target: { files: [file] } });
  return file;
};

describe("AddFilePanel", () => {
  it("keeps Append disabled until a preview has loaded, then shows the alignment report", async () => {
    previewAddFile.mockResolvedValue(PREVIEW);
    renderPanel();

    expect(appendButton()).toBeDisabled();

    const file = chooseFile();
    await waitFor(() => expect(appendButton()).toBeEnabled());

    expect(previewAddFile).toHaveBeenCalledWith("p1", file);
    expect(screen.getByText(/2 row\(s\) will be appended to 3/)).toBeInTheDocument();
    expect(screen.getByText(/New column\(s\): city/)).toBeInTheDocument();
    expect(screen.getByText(/Not in this file: age/)).toBeInTheDocument();
    expect(screen.getByText(/"id" type differs: int vs\s+str/)).toBeInTheDocument();
  });

  it("appends on confirm and refreshes project data, logs, and inventory", async () => {
    previewAddFile.mockResolvedValue(PREVIEW);
    addFileToProject.mockResolvedValue({ total_rows: 5, columns: ["name", "age", "city"] });
    renderPanel();

    chooseFile();
    await waitFor(() => expect(appendButton()).toBeEnabled());
    fireEvent.click(appendButton());

    await waitFor(() => expect(addFileToProject).toHaveBeenCalledWith("p1", expect.any(File)));
    expect(refreshProject).toHaveBeenCalledWith("p1", 1, 50);
    expect(refreshLogs).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/Appended 2 row/), "success");
    // Selection resets so the same flow can be repeated for another file.
    expect(appendButton()).toBeDisabled();
  });

  it("resets the selection when the preview fails", async () => {
    previewAddFile.mockRejectedValue({ response: { data: { detail: "Could not parse" } } });
    renderPanel();

    chooseFile();

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Could not parse", "error"));
    expect(appendButton()).toBeDisabled();
  });

  it("warns when the selected filename is already in the inventory", async () => {
    getProjectFiles.mockResolvedValue(INVENTORY);
    previewAddFile.mockResolvedValue(PREVIEW);
    renderPanel();
    await screen.findByRole("button", { name: /re-append/i });

    chooseFile(); // fixture file is named feb.csv, same as the inventory entry

    await waitFor(() => expect(appendButton()).toBeEnabled());
    expect(screen.getByText(/"feb.csv" was already added/)).toBeInTheDocument();
  });

  it("lists the inventory and re-appends from it", async () => {
    getProjectFiles.mockResolvedValue(INVENTORY);
    reappendProjectFile.mockResolvedValue({ total_rows: 5, columns: ["name"] });
    renderPanel();

    const reappend = await screen.findByRole("button", { name: /re-append/i });
    fireEvent.click(reappend);

    await waitFor(() => expect(reappendProjectFile).toHaveBeenCalledWith("p1", "f1"));
    expect(refreshProject).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Re-appended "feb.csv".', "success");
  });
});
