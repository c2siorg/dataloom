import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Table from "../Table";

// --- Mocks ---

vi.mock("../../context/ProjectContext", () => ({
  useProjectContext: vi.fn(),
}));

vi.mock("../../api", () => ({
  transformProject: vi.fn(),
}));

// React 18 + Vitest: concurrent mode can emit spurious act() warnings when
// userEvent's pointer sequence (click → bubble → handleCloseContextMenu)
// schedules a micro-task state update across two batching boundaries.
// The tests themselves are correct; suppress only this known false-positive.
let _origConsoleError;
beforeAll(() => {
  _origConsoleError = console.error.bind(console);
  console.error = (...args) => {
    if (typeof args[0] === "string" && args[0].includes("not wrapped in act")) return;
    _origConsoleError(...args);
  };
});
afterAll(() => {
  console.error = _origConsoleError;
});

import { useProjectContext } from "../../context/ProjectContext";
import { transformProject } from "../../api";

// --- Helpers ---

const COLUMNS = ["Name", "Score"];
const ROWS = [
  ["Alice", 90],
  ["Bob", 85],
];

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
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext();
  });

  afterEach(async () => {
    // Flush all pending React state updates / microtasks to avoid act() warnings
    await act(async () => {});
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
      await renderTable();
      // Each data row has a serial number cell
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
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
      const nameHeader = screen.getByText("Name").closest("th");
      fireEvent.contextMenu(nameHeader);

      expect(screen.getByText("Add Column")).toBeInTheDocument();
      expect(screen.getByText("Delete Column")).toBeInTheDocument();
      expect(screen.getByText("Rename Column")).toBeInTheDocument();
    });

    it("does not show row menu options when column header is right-clicked", async () => {
      await renderTable();
      const nameHeader = screen.getByText("Name").closest("th");
      fireEvent.contextMenu(nameHeader);

      expect(screen.queryByText("Add Row")).not.toBeInTheDocument();
      expect(screen.queryByText("Delete Row")).not.toBeInTheDocument();
    });
  });

  // ── Context Menu – Row ─────────────────────────────────────────────────────

  describe("row context menu", () => {
    it("opens with correct options on right-click of a row cell", async () => {
      await renderTable();
      const aliceCell = screen.getByText("Alice").closest("td");
      fireEvent.contextMenu(aliceCell);

      expect(screen.getByText("Add Row")).toBeInTheDocument();
      expect(screen.getByText("Delete Row")).toBeInTheDocument();
    });

    it("does not show column menu options when a row cell is right-clicked", async () => {
      await renderTable();
      const aliceCell = screen.getByText("Alice").closest("td");
      fireEvent.contextMenu(aliceCell);

      expect(screen.queryByText("Add Column")).not.toBeInTheDocument();
      expect(screen.queryByText("Delete Column")).not.toBeInTheDocument();
    });
  });

  // ── Context Menu – Dismiss ─────────────────────────────────────────────────

  describe("context menu dismissal", () => {
    it("closes the context menu when clicking outside", async () => {
      await renderTable();
      const nameHeader = screen.getByText("Name").closest("th");
      fireEvent.contextMenu(nameHeader);
      expect(screen.getByText("Add Column")).toBeInTheDocument();

      // Click the outer container div
      const container = screen.getByText("Name").closest(".px-8");
      fireEvent.click(container);

      expect(screen.queryByText("Add Column")).not.toBeInTheDocument();
    });
  });

  // ── Cell Editing ───────────────────────────────────────────────────────────

  describe("cell editing", () => {
    it("activates input mode when a data cell is clicked", async () => {
      await renderTable();
      const aliceCell = screen.getByText("Alice");
      await userEvent.click(aliceCell);

      const input = screen.getByRole("textbox");
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("Alice");
    });

    it("does not activate editing when the S.No. cell is clicked", async () => {
      await renderTable();
      const serialCell = screen.getByText("1");
      await userEvent.click(serialCell);

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("calls transformProject with correct params when Enter is pressed to save", async () => {
      transformProject.mockResolvedValue({
        columns: COLUMNS,
        rows: ROWS,
        dtypes: { Name: "str", Score: "int" },
      });

      await renderTable();
      await userEvent.click(screen.getByText("Alice"));

      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "Charlie");
      await userEvent.keyboard("{Enter}");

      await waitFor(() => {
        expect(transformProject).toHaveBeenCalledWith("test-project-id", {
          operation_type: "changeCellValue",
          change_cell_value: {
            col_index: 1, // first editable column (index 0 is S.No.)
            row_index: 0,
            fill_value: "Charlie",
          },
        });
      });
    });

    it("dismisses edit mode without calling the API when Escape is pressed", async () => {
      await renderTable();
      await userEvent.click(screen.getByText("Alice"));

      const input = screen.getByRole("textbox");
      expect(input).toBeInTheDocument();

      fireEvent.keyDown(input, { key: "Escape" });

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
      await userEvent.click(screen.getByText("Alice"));

      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "Dave");
      fireEvent.blur(input);

      await waitFor(() => {
        expect(transformProject).toHaveBeenCalledTimes(1);
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
      const aliceCell = screen.getByText("Alice").closest("td");
      fireEvent.contextMenu(aliceCell);

      await userEvent.click(screen.getByText("Delete Row"));

      await waitFor(() => {
        expect(transformProject).toHaveBeenCalledWith("test-project-id", {
          operation_type: "delRow",
          row_params: { index: 0 },
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
      const aliceCell = screen.getByText("Alice").closest("td");
      fireEvent.contextMenu(aliceCell);

      await userEvent.click(screen.getByText("Add Row"));

      await waitFor(() => {
        expect(transformProject).toHaveBeenCalledWith("test-project-id", {
          operation_type: "addRow",
          row_params: { index: 0 },
        });
      });
    });
  });
});
