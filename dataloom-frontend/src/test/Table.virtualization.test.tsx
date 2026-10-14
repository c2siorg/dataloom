import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import Table, { COLUMN_WIDTH, VIRTUALIZE_COLUMN_THRESHOLD } from "../Components/Table";
import { transformProject } from "../api";
import { ToastProvider } from "../context/ToastContext";
import { PanelProvider } from "../context/PanelContext";

vi.mock("../api", () => ({
  transformProject: vi.fn(() => Promise.resolve({ columns: [], rows: [], dtypes: {} })),
}));

vi.mock("../api/profiling", () => ({
  getColumnProfiles: vi.fn(() =>
    Promise.resolve(
      Array.from({ length: 200 }, (_, i) => ({
        column: `c${i}`,
        dtype: "string",
        count: 2,
        null_count: 0,
        unique_count: 2,
        distribution: "uniform",
      })),
    ),
  ),
}));

const WIDE = 200;
const VIEWPORT_WIDTH = 800;
// The sticky S.No. column is 64px wide.
const MAX_SCROLL_LEFT = 64 + WIDE * COLUMN_WIDTH - VIEWPORT_WIDTH;

// Display position d shows backend column (d + 37) % n, so a display index and
// a backend index never line up by accident.
const ROTATION = 37;
const nameAt = (displayDataIndex: number, n = WIDE) => `c${(displayDataIndex + ROTATION) % n}`;

const buildContext = (n: number) => {
  const columns = Array.from({ length: n }, (_, i) => `c${i}`);
  return {
    columns,
    rows: [0, 1].map((r) => columns.map((column) => `${column}-r${r}`)),
    dtypes: Object.fromEntries(columns.map((column) => [column, "string"])),
    columnOrder: columns.map((_, i) => (i + ROTATION) % n),
    setColumnOrder: vi.fn(),
    updateData: vi.fn(),
    dataVersion: 0,
    totalRows: 2,
    totalPages: 1,
    page: 1,
    pageSize: 50,
    isPreviewMode: false,
    pendingTransform: null,
    setPaginationData: vi.fn(),
    updatePreviewPage: vi.fn(),
    refreshProject: vi.fn(),
    loading: false,
  };
};

let mockContext = buildContext(WIDE);

vi.mock("../context/ProjectContext", () => ({
  useProjectContext: () => mockContext,
}));

vi.mock("../context/HistoryRefreshContext", () => ({
  useHistoryRefresh: () => ({ refreshLogs: vi.fn(), refreshCheckpoints: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockContext = buildContext(WIDE);
});

const renderTable = (showColumnProfiles = false) =>
  render(
    <PanelProvider>
      <ToastProvider>
        <Table projectId="test-id" showColumnProfiles={showColumnProfiles} />
      </ToastProvider>
    </PanelProvider>,
  );

const table = () => screen.getByTestId("data-table");

/** Scroll the grid's container (jsdom has no layout) and wait out the throttle frame. */
const scrollGrid = async (scrollLeft: number) => {
  const container = table().parentElement!;
  Object.defineProperty(container, "clientWidth", { configurable: true, value: VIEWPORT_WIDTH });
  container.scrollLeft = scrollLeft;
  fireEvent.scroll(container);
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
};

const header = (name: string) => screen.queryByRole("columnheader", { name });
const spacers = () => table().querySelectorAll('th[aria-hidden="true"], td[aria-hidden="true"]');
const cellCounts = () =>
  Array.from(table().querySelectorAll("tr"), (row) => row.querySelectorAll("th, td").length);

describe("Table column virtualization", () => {
  it("renders a window of columns with S.No. always present", async () => {
    renderTable();
    await scrollGrid(0);

    // Two header rows (names, dtypes) of S.No. + 8 data columns; spacers are aria-hidden.
    expect(screen.getAllByRole("columnheader")).toHaveLength(2 * 9);
    expect(header("S.No.")).toBeInTheDocument();
    expect(header(nameAt(0))).toBeInTheDocument();
    expect(header(nameAt(7))).toBeInTheDocument();
    expect(header(nameAt(8))).toBeNull();
    expect(header(nameAt(WIDE - 1))).toBeNull();

    expect(table()).toHaveAttribute("aria-colcount", String(WIDE + 1));
    expect(header("S.No.")).toHaveAttribute("aria-colindex", "1");
    expect(header(nameAt(0))).toHaveAttribute("aria-colindex", "2");
    // A left and a right spacer in each of the 2 header rows and 2 body rows.
    expect(spacers()).toHaveLength(8);
  });

  it("shifts the window as the grid scrolls and keeps every row aligned", async () => {
    renderTable();
    await scrollGrid(0);

    // Data columns 10..14 are in view at 1600px; overscan 3 renders 7..17.
    await scrollGrid(10 * COLUMN_WIDTH);

    expect(header(nameAt(0))).toBeNull();
    expect(header(nameAt(6))).toBeNull();
    expect(header(nameAt(7))).toBeInTheDocument();
    expect(header(nameAt(17))).toBeInTheDocument();
    expect(header(nameAt(18))).toBeNull();
    expect(header(nameAt(12))).toHaveAttribute("aria-colindex", String(12 + 2));
    expect(screen.getAllByRole("columnheader")).toHaveLength(2 * 12);

    const leftSpacer = within(table()).getAllByRole("columnheader", { hidden: true })[1]!;
    expect(leftSpacer).toHaveAttribute("aria-hidden", "true");
    expect(leftSpacer.style.width).toBe(`${7 * COLUMN_WIDTH}px`);
    // S.No. + left spacer + 11 columns + right spacer in every row.
    expect(new Set(cellCounts())).toEqual(new Set([14]));
  });

  it("deletes a far-right column by its backend index", async () => {
    renderTable();
    expect(header(nameAt(WIDE - 1))).toBeNull();

    await scrollGrid(MAX_SCROLL_LEFT);
    const lastHeader = header(nameAt(WIDE - 1))!;
    expect(lastHeader).toHaveAttribute("aria-colindex", String(WIDE + 1));

    fireEvent.contextMenu(lastHeader);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Column" }));

    // Display column 199 holds backend column (199 + 37) % 200 = 36.
    expect(transformProject).toHaveBeenCalledWith(
      "test-id",
      expect.objectContaining({
        operation_type: "delCol",
        del_col_params: { index: 36 },
      }),
    );
  });

  it("keeps an in-progress cell edit mounted when its column scrolls out of view", async () => {
    renderTable();
    await scrollGrid(0);

    fireEvent.click(screen.getByText(`${nameAt(1)}-r0`));
    const input = screen.getByDisplayValue(`${nameAt(1)}-r0`);
    fireEvent.change(input, { target: { value: `${nameAt(1)}-r0!` } });

    await scrollGrid(MAX_SCROLL_LEFT);

    // Same element, not a remount: the typed value survives.
    expect(header(nameAt(WIDE - 1))).toBeInTheDocument();
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue(`${nameAt(1)}-r0!`);
    expect(transformProject).not.toHaveBeenCalled();

    // Ending the edit releases the pin.
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).not.toBeInTheDocument();
    expect(header(nameAt(1))).toBeNull();
  });

  it("keeps the dragged column mounted and drops it at the absolute target", async () => {
    renderTable();
    await scrollGrid(0);
    const dataTransfer = { effectAllowed: "", dropEffect: "", setData: vi.fn(), getData: vi.fn() };

    const source = screen.getByRole("button", { name: nameAt(1) });
    fireEvent.dragStart(source, { dataTransfer });
    await scrollGrid(MAX_SCROLL_LEFT);

    expect(source).toBeInTheDocument();
    const target = screen.getByRole("button", { name: nameAt(WIDE - 1) });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    // Display column 1 (backend 38) moves to the last display position.
    const newOrder = mockContext.setColumnOrder.mock.calls[0]![0] as number[];
    expect(newOrder).toHaveLength(WIDE);
    expect(newOrder[WIDE - 1]).toBe(38);
    expect(newOrder[0]).toBe(ROTATION);
  });

  it("windows the column profile row in step with the other rows", async () => {
    renderTable(true);
    await scrollGrid(0);

    expect(await screen.findAllByTestId("column-profile-card")).toHaveLength(8);
    expect(table().querySelectorAll("thead tr")).toHaveLength(3);
    // S.No. + 2 spacers + 8 columns in all 3 header rows and both body rows.
    expect(cellCounts()).toEqual([11, 11, 11, 11, 11]);
  });

  it("renders every column unchanged at the threshold", async () => {
    mockContext = buildContext(VIRTUALIZE_COLUMN_THRESHOLD);
    renderTable();
    await scrollGrid(0);

    expect(screen.getAllByRole("columnheader")).toHaveLength(2 * (VIRTUALIZE_COLUMN_THRESHOLD + 1));
    expect(spacers()).toHaveLength(0);
    expect(table()).not.toHaveAttribute("aria-colcount");
    expect(table()).not.toHaveAttribute("style");
    expect(table().querySelectorAll("[style], [aria-colindex], [title]")).toHaveLength(0);
  });

  it("starts virtualizing one column past the threshold", async () => {
    mockContext = buildContext(VIRTUALIZE_COLUMN_THRESHOLD + 1);
    renderTable();
    await scrollGrid(0);

    expect(table()).toHaveAttribute("aria-colcount", String(VIRTUALIZE_COLUMN_THRESHOLD + 2));
    expect(spacers()).toHaveLength(8);
  });
});
