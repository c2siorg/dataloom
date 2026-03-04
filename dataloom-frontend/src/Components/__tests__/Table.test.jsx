import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Table from "../Table";
import { useProjectContext } from "../../context/ProjectContext";
import { transformProject } from "../../api";

// --- Mocks ---
// vi.mock() calls are hoisted to the top of the file by Vitest at compile time,
// so mocks take effect before any imports are evaluated regardless of source order.

vi.mock("../../context/ProjectContext", () => ({
  useProjectContext: vi.fn(),
}));

vi.mock("../../api", () => ({
  transformProject: vi.fn(),
}));

// --- Helpers ---

// Object.freeze prevents accidental mutation of shared test fixtures that
// would cause hard-to-debug cross-test pollution.
const COLUMNS = Object.freeze(["Name", "Score"]);
const ROWS = Object.freeze([Object.freeze(["Alice", 90]), Object.freeze(["Bob", 85])]);

const mockContext = (overrides = {}) => {
  useProjectContext.mockReturnValue({
    columns: COLUMNS,
    rows: ROWS,
    dtypes: { Name: "str", Score: "int" },
    updateData: vi.fn(),
    ...overrides,
  });
};

const renderTable = async (props = {}) => {
  let result;
  await act(async () => {
    result = render(<Table projectId="test-project-id" {...props} />);
  });
  return result;
};

// --- Tests ---

describe("Table", () => {
  let user;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext();
    // userEvent.setup() wraps every interaction in act() automatically,
    // which properly flushes React state updates and avoids act() warnings.
    user = userEvent.setup();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  describe("rendering", () => {
    it("renders S.No. column header", async () => {
      await renderTable();
      expect(screen.getByText("S.No.")).toBeInTheDocument();
    });

    it("renders all column headers from context", async () => {
      await renderTable();
      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Score")).toBeInTheDocument();
    });

    it("renders the correct number of data rows", async () => {
      const { container } = await renderTable();
      // Query the DOM structure directly: avoids false positives from any other
      // element containing the text "1" or "2" (e.g., data cells or pagination).
      const dataRows = container.querySelectorAll("tbody tr");
      expect(dataRows).toHaveLength(ROWS.length);
    });

    it("renders correct cell values from context", async () => {
      await renderTable();
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("90")).toBeInTheDocument();
      expect(screen.getByText("85")).toBeInTheDocument();
    });

    it("renders data from externalData prop, overriding context", async () => {
      const externalData = {
        columns: ["City"],
        rows: [["London"]],
        dtypes: {},
      };
      await renderTable({ data: externalData });
      expect(screen.getByText("City")).toBeInTheDocument();
      expect(screen.getByText("London")).toBeInTheDocument();
      // context data should not be present
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    });

    it("renders an empty table body when context has no rows", async () => {
      mockContext({ columns: [], rows: [] });
      const { container } = await renderTable();
      const rows = container.querySelectorAll("tbody tr");
      expect(rows).toHaveLength(0);
    });
  });

  // ── Context Menu – Column ──────────────────────────────────────────────────

  describe("column context menu", () => {
    it("opens with correct options on right-click of a column header", async () => {
      await renderTable();
      await act(async () => {
        await user.pointer({
          target: screen.getByText("Name").closest("th"),
          keys: "[MouseRight]",
        });
      });

      expect(screen.getByText("Add Column")).toBeInTheDocument();
      expect(screen.getByText("Delete Column")).toBeInTheDocument();
      expect(screen.getByText("Rename Column")).toBeInTheDocument();
    });

    it("does not show row menu options when column header is right-clicked", async () => {
      await renderTable();
      await act(async () => {
        await user.pointer({
          target: screen.getByText("Name").closest("th"),
          keys: "[MouseRight]",
        });
      });

      expect(screen.queryByText("Add Row")).not.toBeInTheDocument();
      expect(screen.queryByText("Delete Row")).not.toBeInTheDocument();
    });
  });

  // ── Context Menu – Row ─────────────────────────────────────────────────────

  describe("row context menu", () => {
    it("opens with correct options on right-click of a row cell", async () => {
      await renderTable();
      await act(async () => {
        await user.pointer({
          target: screen.getByText("Alice").closest("td"),
          keys: "[MouseRight]",
        });
      });

      expect(screen.getByText("Add Row")).toBeInTheDocument();
      expect(screen.getByText("Delete Row")).toBeInTheDocument();
    });

    it("does not show column menu options when a row cell is right-clicked", async () => {
      await renderTable();
      await act(async () => {
        await user.pointer({
          target: screen.getByText("Alice").closest("td"),
          keys: "[MouseRight]",
        });
      });

      expect(screen.queryByText("Add Column")).not.toBeInTheDocument();
      expect(screen.queryByText("Delete Column")).not.toBeInTheDocument();
    });
  });

  // ── Context Menu – Dismiss ─────────────────────────────────────────────────

  describe("context menu dismissal", () => {
    it("closes the context menu when clicking outside", async () => {
      await renderTable();
      await act(async () => {
        await user.pointer({
          target: screen.getByText("Name").closest("th"),
          keys: "[MouseRight]",
        });
      });
      expect(screen.getByText("Add Column")).toBeInTheDocument();

      // Use data-testid (set on the outer container in Table.jsx) instead of
      // a Tailwind class selector, which would break on routine styling changes.
      await act(async () => {
        await user.click(screen.getByTestId("table-container"));
      });

      expect(screen.queryByText("Add Column")).not.toBeInTheDocument();
    });
  });

  // ── Cell Editing ───────────────────────────────────────────────────────────

  describe("cell editing", () => {
    it("activates input mode when a data cell is clicked", async () => {
      await renderTable();
      await act(async () => {
        await user.click(screen.getByText("Alice"));
      });

      const input = screen.getByRole("textbox");
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("Alice");
    });

    it("does not activate editing when the S.No. cell is clicked", async () => {
      await renderTable();
      await act(async () => {
        await user.click(screen.getByText("1"));
      });

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("calls transformProject with correct params when Enter is pressed to save", async () => {
      transformProject.mockResolvedValue({
        columns: COLUMNS,
        rows: ROWS,
        dtypes: { Name: "str", Score: "int" },
      });

      await renderTable();
      // Open the cell for editing first, then grab the input from the DOM
      // before starting the type+save interaction in a separate act() scope.
      await act(async () => {
        await user.click(screen.getByText("Alice"));
      });

      const input = screen.getByRole("textbox");

      // Type, press Enter, and wait for the API call all inside one act() so
      // every onChange (setEditValue) and handleEditCell's async resolution
      // (updateTableData + setEditingCell + setEditValue) are fully tracked.
      await act(async () => {
        await user.clear(input);
        await user.type(input, "Charlie");
        await user.keyboard("{Enter}");
        await waitFor(() => {
          expect(transformProject).toHaveBeenCalledWith("test-project-id", {
            operation_type: "changeCellValue",
            change_cell_value: {
              // col_index is the raw display-column index from the data row
              // array (which prepends S.No. at index 0). So "Name" → 1, "Score" → 2.
              // Note: column operations (delCol/renameCol) subtract 1 to get a
              // 0-based data index — cell editing does not; it sends the display index.
              col_index: 1,
              row_index: 0,
              fill_value: "Charlie",
            },
          });
        });
      });
    });

    it("uses display-column index (including S.No.) when saving a second-column cell edit", async () => {
      // Verifies that col_index sent to the API is the display index (not a
      // 0-based data index). Clicking "Score" (display index 2) should produce
      // col_index: 2, confirming the Name test's col_index: 1 is correct.
      transformProject.mockResolvedValue({
        columns: COLUMNS,
        rows: ROWS,
        dtypes: { Name: "str", Score: "int" },
      });

      await renderTable();
      await act(async () => {
        await user.click(screen.getByText("90")); // Score cell of Alice
      });

      const input = screen.getByRole("textbox");
      await act(async () => {
        await user.clear(input);
        await user.type(input, "95");
        await user.keyboard("{Enter}");
        await waitFor(() => {
          expect(transformProject).toHaveBeenCalledWith("test-project-id", {
            operation_type: "changeCellValue",
            change_cell_value: {
              col_index: 2, // Score is at display index 2 (S.No.=0, Name=1, Score=2)
              row_index: 0,
              fill_value: "95",
            },
          });
        });
      });
    });

    it("dismisses edit mode without calling the API when Escape is pressed", async () => {
      await renderTable();
      await act(async () => {
        await user.click(screen.getByText("Alice"));
      });

      const input = screen.getByRole("textbox");
      expect(input).toBeInTheDocument();

      // The edit input has no autoFocus, so we click it to ensure it has
      // keyboard focus before sending the Escape key.
      await act(async () => {
        await user.click(input);
        await user.keyboard("{Escape}");
      });

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(transformProject).not.toHaveBeenCalled();
    });

    it("saves the edit on input blur", async () => {
      transformProject.mockResolvedValue({
        columns: COLUMNS,
        rows: ROWS,
        dtypes: { Name: "str", Score: "int" },
      });

      await renderTable();
      await act(async () => {
        await user.click(screen.getByText("Alice"));
      });

      const input = screen.getByRole("textbox");
      await act(async () => {
        await user.clear(input);
        await user.type(input, "Dave");
      });

      // Clicking the non-editable S.No. cell moves focus away, triggering
      // blur → handleEditCell (async). Wrapping in act() with waitFor() keeps
      // all async state updates inside React's act() boundary.
      await act(async () => {
        await user.click(screen.getByText("2")); // S.No. of Bob — non-editable
        await waitFor(() => {
          expect(transformProject).toHaveBeenCalledTimes(1);
        });
      });
    });
  });

  // ── Context Menu Actions ───────────────────────────────────────────────────

  describe("context menu actions", () => {
    it("calls transformProject when Delete Row is clicked", async () => {
      transformProject.mockResolvedValue({
        columns: COLUMNS,
        rows: [["Bob", 85]],
        dtypes: { Name: "str", Score: "int" },
      });

      await renderTable();
      await act(async () => {
        await user.pointer({
          target: screen.getByText("Alice").closest("td"),
          keys: "[MouseRight]",
        });
      });

      await act(async () => {
        await user.click(screen.getByText("Delete Row"));
        await waitFor(() => {
          expect(transformProject).toHaveBeenCalledWith("test-project-id", {
            operation_type: "delRow",
            row_params: { index: 0 },
          });
        });
      });
    });

    it("calls transformProject when Add Row is clicked", async () => {
      transformProject.mockResolvedValue({
        columns: COLUMNS,
        rows: [...ROWS, ["", ""]],
        dtypes: {},
      });

      await renderTable();
      await act(async () => {
        await user.pointer({
          target: screen.getByText("Alice").closest("td"),
          keys: "[MouseRight]",
        });
      });

      await act(async () => {
        await user.click(screen.getByText("Add Row"));
        await waitFor(() => {
          expect(transformProject).toHaveBeenCalledWith("test-project-id", {
            operation_type: "addRow",
            row_params: { index: 0 },
          });
        });
      });
    });

    it("calls transformProject when Delete Column is clicked", async () => {
      transformProject.mockResolvedValue({
        columns: ["Score"],
        rows: [[90], [85]],
        dtypes: { Score: "int" },
      });

      await renderTable();
      // Right-click on the "Name" header (display index 1); the handler strips
      // the S.No. offset so the API receives col_params.index = 1 - 1 = 0.
      await act(async () => {
        await user.pointer({
          target: screen.getByText("Name").closest("th"),
          keys: "[MouseRight]",
        });
      });

      await act(async () => {
        await user.click(screen.getByText("Delete Column"));
        await waitFor(() => {
          expect(transformProject).toHaveBeenCalledWith("test-project-id", {
            operation_type: "delCol",
            col_params: { index: 0 },
          });
        });
      });
    });

    it("calls transformProject when Rename Column is confirmed", async () => {
      transformProject.mockResolvedValue({
        columns: ["FullName", "Score"],
        rows: ROWS,
        dtypes: { FullName: "str", Score: "int" },
      });

      await renderTable();
      await act(async () => {
        await user.pointer({
          target: screen.getByText("Name").closest("th"),
          keys: "[MouseRight]",
        });
      });

      // Click "Rename Column" → InputDialog opens
      await act(async () => {
        await user.click(screen.getByText("Rename Column"));
      });

      // Type the new name and submit
      const dialogInput = screen.getByRole("textbox");
      await act(async () => {
        await user.type(dialogInput, "FullName");
        await user.click(screen.getByRole("button", { name: /ok/i }));
        await waitFor(() => {
          expect(transformProject).toHaveBeenCalledWith("test-project-id", {
            operation_type: "renameCol",
            rename_col_params: { col_index: 0, new_name: "FullName" },
          });
        });
      });
    });

    it("calls transformProject when Add Column is confirmed", async () => {
      transformProject.mockResolvedValue({
        columns: [...COLUMNS, "City"],
        rows: [
          ["Alice", 90, ""],
          ["Bob", 85, ""],
        ],
        dtypes: { Name: "str", Score: "int", City: "str" },
      });

      await renderTable();
      await act(async () => {
        await user.pointer({
          target: screen.getByText("Name").closest("th"),
          keys: "[MouseRight]",
        });
      });

      // Click "Add Column" → InputDialog opens
      await act(async () => {
        await user.click(screen.getByText("Add Column"));
      });

      // Type the new column name and submit
      const dialogInput = screen.getByRole("textbox");
      await act(async () => {
        await user.type(dialogInput, "City");
        await user.click(screen.getByRole("button", { name: /ok/i }));
        await waitFor(() => {
          expect(transformProject).toHaveBeenCalledWith("test-project-id", {
            operation_type: "addCol",
            col_params: { index: 1, name: "City" },
          });
        });
      });
    });
  });

  // ── API Error Handling ─────────────────────────────────────────────────────

  describe("API error handling", () => {
    it("shows an error toast when the cell-edit API call fails", async () => {
      transformProject.mockRejectedValue(new Error("Network error"));

      await renderTable();
      await act(async () => {
        await user.click(screen.getByText("Alice"));
      });

      const input = screen.getByRole("textbox");
      await act(async () => {
        await user.clear(input);
        await user.type(input, "Charlie");
        await user.keyboard("{Enter}");
      });
      // handleEditCell is fire-and-forget from handleInputKeyDown, so its
      // catch block (setToast) fires after the above act() exits.
      await act(async () => {
        await waitFor(() => {
          expect(screen.getByRole("alert")).toBeInTheDocument();
          expect(screen.getByText("Failed to edit cell. Please try again.")).toBeInTheDocument();
        });
      });
    });

    it("shows an error toast when the Delete Row API call fails", async () => {
      transformProject.mockRejectedValue(new Error("Network error"));

      await renderTable();
      await act(async () => {
        await user.pointer({
          target: screen.getByText("Alice").closest("td"),
          keys: "[MouseRight]",
        });
      });

      await act(async () => {
        await user.click(screen.getByText("Delete Row"));
      });
      // handleDeleteRow is fire-and-forget async; its catch block (setToast)
      // fires after the above act() exits.
      await act(async () => {
        await waitFor(() => {
          expect(screen.getByRole("alert")).toBeInTheDocument();
          expect(screen.getByText("Failed to delete row. Please try again.")).toBeInTheDocument();
        });
      });
    });
  });
});
