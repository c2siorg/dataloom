import ContextMenu from "./ContextMenu";
import { useContextMenu } from "../hooks/useContextMenu";
import { useState, useEffect, useMemo, useRef, type ReactNode, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { transformProject } from "../api";
import { useProjectContext } from "../context/ProjectContext";
import { useHistoryRefresh } from "../context/HistoryRefreshContext";
import {
  ADD_COLUMN,
  ADD_ROW,
  CHANGE_CELL_VALUE,
  DELETE_COLUMN,
  DELETE_ROW,
  RENAME_COLUMN,
} from "../constants/operationTypes";
import InputDialog from "./common/InputDialog";
import Toast from "./common/Toast";
import DtypeBadge from "./common/DtypeBadge";
import ColumnProfileCard from "./profiling/ColumnProfileCard";
import useColumnProfiles from "../hooks/useColumnProfiles";
import { useToast } from "../context/ToastContext";

/** A single table cell value. `undefined` arises from sparse index access. */
type Cell = string | number | null | undefined;

/** Backend transform response: rows may be arrays or column-keyed objects. */
interface TransformResponse {
  columns: string[];
  rows: Array<Cell[] | Record<string, Cell>>;
  dtypes?: Record<string, string>;
}

type ToastType = "success" | "error" | "info" | "warning";

interface ToastState {
  message: string;
  type: ToastType;
}

interface InputConfig {
  message: string;
  defaultValue: string;
  onSubmit: (value: string) => void | Promise<void>;
}

interface EditingCell {
  rowIndex: number;
  cellIndex: number;
}

/** Subset of ProjectContext consumed here; the context itself is still JS. */
interface ProjectContextValue {
  columns: string[];
  rows: Cell[][];
  dtypes: Record<string, string>;
  updateData: (
    columns: string[],
    rows: Cell[][],
    options?: { dtypes?: Record<string, string>; resetColumnOrder?: boolean },
  ) => void;
  columnOrder: number[];
  setColumnOrder: (order: number[]) => void;
  dataVersion: number;
  totalRows: number;
  totalPages: number;
  page: number;
  pageSize: number;
  setPaginationData: (info: {
    page?: number;
    page_size?: number;
    total_rows?: number;
    total_pages?: number;
  }) => void;
  refreshProject: (id: string, page: number, pageSize: number) => void;
}

/** Context payload carried by the right-click context menu. */
type ContextData = { type: "column"; columnIndex: number } | { type: "row"; rowIndex: number };

interface MenuButtonProps {
  children: ReactNode;
  onClick: () => void;
}

const MenuButton = ({ children, onClick }: MenuButtonProps) => (
  <button
    role="menuitem"
    className="block w-full text-left text-sm text-foreground px-3 py-1.5 hover:bg-surface rounded-md transition-colors duration-150 whitespace-nowrap"
    onClick={onClick}
  >
    {children}
  </button>
);

/** Normalize backend rows (arrays or column-keyed objects) to value arrays. */
function normalizeRows(rows: Array<Cell[] | Record<string, Cell>>): Cell[][] {
  return rows.map((row) => (Array.isArray(row) ? row : Object.values(row)));
}

interface TableProps {
  projectId: string;
  showColumnProfiles?: boolean;
}

const Table = ({ projectId, showColumnProfiles = false }: TableProps) => {
  const {
    columns: ctxColumns,
    rows: ctxRows,
    dtypes,
    updateData,
    columnOrder,
    setColumnOrder,
    dataVersion,
    totalRows,
    totalPages,
    page,
    pageSize,
    setPaginationData,
    refreshProject,
  } = useProjectContext() as unknown as ProjectContextValue;
  const { refreshLogs } = useHistoryRefresh();
  const [data, setData] = useState<Cell[][]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const { isOpen, position, contextData, open, close } = useContextMenu();

  const [inputConfig, setInputConfig] = useState<InputConfig | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [draggedColIndex, setDraggedColIndex] = useState<number | null>(null);
  const [hoveredTargetIndex, setHoveredTargetIndex] = useState<number | null>(null);

  // Per-column profiles for the "Columns" toggle. dataVersion is the change
  // signal (bumped on any content edit), so cached profiles refresh after a
  // transform or cell edit but survive pagination.
  const { profiles, loading: profilesLoading } = useColumnProfiles(
    projectId,
    showColumnProfiles,
    dataVersion,
  );

  // transformProject is JS-typed as Promise<Object>; narrow it here.
  const applyTransform = (input: Record<string, unknown>) =>
    transformProject(projectId, input) as unknown as Promise<TransformResponse>;

  const safeOrder = useMemo(() => {
    return columnOrder.length === ctxColumns.length ? columnOrder : ctxColumns.map((_, i) => i);
  }, [columnOrder, ctxColumns]);

  useEffect(() => {
    if (ctxColumns.length > 0 && ctxRows.length > 0) {
      setColumns(["S.No.", ...safeOrder.map((i) => ctxColumns[i] as string)]);
      setData(
        ctxRows.map((row, index) => [
          (page - 1) * pageSize + index + 1,
          ...safeOrder.map((i) => row[i]),
        ]),
      );
    }
  }, [ctxColumns, ctxRows, page, pageSize, columnOrder, safeOrder]);

  const updateTableData = (response: TransformResponse) => {
    const { columns, rows, dtypes: newDtypes } = response;
    setColumns(["S.No.", ...columns]);
    setData(normalizeRows(rows).map((row, index) => [index + 1, ...row]));
    // updateData resets the saved column order when the column count changes,
    // which covers add/delete column; rename and row ops keep the order.
    updateData(columns, normalizeRows(rows), { dtypes: newDtypes });
    // Every Table transform is persisted, so refresh any open Logs tab.
    refreshLogs();
  };

  const handleAddRow = async (index: number) => {
    try {
      const globalIndex = (page - 1) * pageSize + index;
      const response = await applyTransform({
        operation_type: ADD_ROW,
        row_params: { index: globalIndex },
      });
      updateTableData(response);
      refreshProject(projectId, 1, pageSize);
    } catch {
      setToast({
        message: "Failed to add row. Please try again.",
        type: "error",
      });
    }
  };

  const handleAddColumn = (index: number) => {
    setInputConfig({
      message: "Enter column name:",
      defaultValue: "",
      onSubmit: async (newColumnName) => {
        if (!newColumnName) {
          setInputConfig(null);
          return;
        }

        try {
          let backendIndex: number; // Normalized index
          if (index === 0) {
            backendIndex = 0;
          } else {
            const displayDataIndex = index - 1;
            const baseIndex = columnOrder[displayDataIndex] as number;
            backendIndex = baseIndex + 1;
          }
          const response = await applyTransform({
            operation_type: ADD_COLUMN,
            add_col_params: { index: backendIndex, name: newColumnName },
          });
          updateTableData(response);
          refreshProject(projectId, 1, pageSize);
        } catch {
          setToast({
            message: "Failed to add column. Please try again.",
            type: "error",
          });
        }

        setInputConfig(null);
      },
    });
  };

  const handleDeleteRow = async (index: number) => {
    try {
      const globalIndex = (page - 1) * pageSize + index;
      const response = await applyTransform({
        operation_type: DELETE_ROW,
        row_params: { index: globalIndex },
      });
      updateTableData(response);
      refreshProject(projectId, 1, pageSize);
    } catch {
      setToast({
        message: "Failed to delete row. Please try again.",
        type: "error",
      });
    }
  };

  const handleRenameColumn = (index: number) => {
    if (index === 0) {
      setToast({
        message: "Cannot rename the S.No. column.",
        type: "error",
      });
      return;
    }

    setInputConfig({
      message: "Enter new column name:",
      defaultValue: "",
      onSubmit: async (newName) => {
        if (!newName) {
          setInputConfig(null);
          return;
        }

        try {
          const displayDataIndex = index - 1;
          const backendIndex = columnOrder[displayDataIndex] as number; // Normalized index
          const response = await applyTransform({
            operation_type: RENAME_COLUMN,
            rename_col_params: { col_index: backendIndex, new_name: newName },
          });
          updateTableData(response);
          refreshProject(projectId, 1, pageSize);
        } catch {
          setToast({
            message: "Failed to rename column. Please try again.",
            type: "error",
          });
        }

        setInputConfig(null);
      },
    });
  };

  const handleDeleteColumn = async (index: number) => {
    if (index === 0) {
      setToast({
        message: "Cannot delete the S.No. column.",
        type: "error",
      });
      return;
    }

    try {
      const displayDataIndex = index - 1;
      const backendIndex = columnOrder[displayDataIndex] as number; // Normalized index
      const response = await applyTransform({
        operation_type: DELETE_COLUMN,
        del_col_params: { index: backendIndex },
      });
      updateTableData(response);
      refreshProject(projectId, 1, pageSize);
    } catch {
      setToast({
        message: "Failed to delete column. Please try again.",
        type: "error",
      });
    }
  };

  const stopEditing = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const handleEditCell = async (rowIndex: number, cellIndex: number, newValue: string) => {
    const currentValue = data[rowIndex]?.[cellIndex];
    const normalizedCurrentValue = currentValue == null ? "" : String(currentValue);

    // Do not send a transformation request when the value was not changed.
    if (newValue === normalizedCurrentValue) {
      stopEditing();
      return;
    }

    try {
      const backendColIndex =
        cellIndex === 0
          ? 0
          : columnOrder.length > 0
            ? (columnOrder[cellIndex - 1] as number) + 1
            : cellIndex;

      const globalRowIndex = (page - 1) * pageSize + rowIndex;
      const response = await applyTransform({
        operation_type: CHANGE_CELL_VALUE,
        change_cell_value: {
          col_index: backendColIndex,
          row_index: globalRowIndex,
          fill_value: newValue,
        },
      });

      updateTableData(response);
      refreshProject(projectId, 1, pageSize);
      stopEditing();
    } catch {
      setToast({
        message: "Failed to edit cell. Please try again.",
        type: "error",
      });
    }
  };

  const handleInputKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    cellIndex: number,
  ) => {
    if (e.key === "Enter") {
      handleEditCell(rowIndex, cellIndex, editValue);
    } else if (e.key === "Escape") {
      setEditingCell(null);
      setEditValue("");
      stopEditing();
    }
  };

  const handleCellClick = (rowIndex: number, cellIndex: number, cellValue: Cell) => {
    if (cellIndex !== 0) {
      setEditingCell({ rowIndex, cellIndex });
      // Coerce null/undefined (missing cells now serialize to null) to "" so the
      // controlled input stays controlled and never renders the literal "null".
      setEditValue(cellValue == null ? "" : String(cellValue));
    }
  };

  const handlePageChange = (newPage: number) => {
    setPaginationData({ page: newPage });
    refreshProject(projectId, newPage, pageSize);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPaginationData({ page: 1, page_size: newSize });
    refreshProject(projectId, 1, newSize);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 overflow-hidden border-x border-b border-app-border shadow-sm">
        <div className="h-full overflow-auto">
          <table
            data-testid="data-table"
            className="min-w-full bg-surface border-separate border-spacing-0"
          >
            <thead className="sticky top-0 z-20 bg-surface">
              {showColumnProfiles && (
                <tr>
                  {columns.map((column, columnIndex) => {
                    const isSerialNumber = columnIndex === 0;
                    return (
                      <th
                        key={columnIndex}
                        className={`align-top border-b border-r border-app-border ${
                          isSerialNumber
                            ? "w-16 sticky left-0 z-10 bg-surface"
                            : "bg-surface min-w-35"
                        }`}
                      >
                        {!isSerialNumber && (
                          <ColumnProfileCard
                            profile={profiles[column] ?? null}
                            loading={profilesLoading && !profiles[column]}
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
              )}
              <tr>
                {columns.map((column, columnIndex) => {
                  const isSerialNumber = columnIndex === 0;
                  const isDragged = !isSerialNumber && draggedColIndex === columnIndex - 1;
                  const isDropTarget = !isSerialNumber && hoveredTargetIndex === columnIndex - 1;
                  return (
                    <th
                      key={columnIndex}
                      className={`h-6 px-0.5 py-0 border-r border-app-border text-left text-xs font-medium text-muted-foreground uppercase tracking-wider ${
                        isDropTarget ? "ring-2 ring-blue-400" : ""
                      } ${isSerialNumber ? "w-16 sticky left-0 z-10 bg-surface" : "bg-surface"}`}
                      onContextMenu={(e) => open(e, { type: "column", columnIndex })}
                    >
                      <button
                        type="button"
                        className={`w-full text-left text-muted-foreground hover:text-foreground hover:bg-surface-hover rounded-md transition-colors duration-150 ${
                          isSerialNumber ? "" : "cursor-grab active:cursor-grabbing"
                        } ${isDragged ? "opacity-50" : ""}`}
                        draggable={!isSerialNumber}
                        onDragStart={(event) => {
                          if (isSerialNumber) return;
                          setDraggedColIndex(columnIndex - 1);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(event) => {
                          if (isSerialNumber) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setHoveredTargetIndex(columnIndex - 1);
                        }}
                        onDrop={(event) => {
                          if (isSerialNumber) return;
                          event.preventDefault();
                          if (draggedColIndex === null) return;
                          const source = draggedColIndex;
                          const target = columnIndex - 1;
                          if (source === target) {
                            setHoveredTargetIndex(null);
                            return;
                          }
                          const newOrder = [...safeOrder];
                          const [moved] = newOrder.splice(source, 1);
                          newOrder.splice(target, 0, moved as number);
                          setColumnOrder(newOrder);
                          setDraggedColIndex(null);
                          setHoveredTargetIndex(null);
                        }}
                        onDragEnd={() => {
                          setDraggedColIndex(null);
                          setHoveredTargetIndex(null);
                        }}
                      >
                        {column}
                      </button>
                    </th>
                  );
                })}
              </tr>
              <tr>
                {columns.map((column, columnIndex) => {
                  const isSerialNumber = columnIndex === 0;
                  const isDropTarget = !isSerialNumber && hoveredTargetIndex === columnIndex - 1;
                  return (
                    <th
                      key={columnIndex}
                      className={`h-5 px-0.5 py-0 border-b border-r border-app-border text-left text-[10px] leading-none ${
                        isDropTarget ? "ring-2 ring-blue-400" : ""
                      } ${isSerialNumber ? "w-16 sticky left-0 z-10 bg-surface" : "bg-surface"}`}
                      onContextMenu={(e) => open(e, { type: "column", columnIndex })}
                    >
                      {!isSerialNumber && dtypes[column] ? (
                        // empty className strips DtypeBadge's default ml-1.5 so the
                        // badge fills the dtype row flush; undefined would re-add it
                        <DtypeBadge dtype={dtypes[column]} className="" />
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {data.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="hover:bg-surface-hover transition-colors duration-150"
                >
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={`h-6 px-0.5 py-0 text-xs border-b border-r border-app-border ${
                        cellIndex === 0
                          ? "w-16 sticky left-0 z-10 bg-surface text-center font-medium text-muted-foreground"
                          : "text-foreground"
                      }`}
                      onContextMenu={(e) => open(e, { type: "row", rowIndex })}
                    >
                      {editingCell &&
                      editingCell.rowIndex === rowIndex &&
                      editingCell.cellIndex === cellIndex ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleEditCell(rowIndex, cellIndex, editValue)}
                          className="w-full p-1 border border-app-border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                          onKeyDown={(e) => handleInputKeyDown(e, rowIndex, cellIndex)}
                        />
                      ) : (
                        <div
                          onClick={() => handleCellClick(rowIndex, cellIndex, cell)}
                          className={
                            cellIndex !== 0
                              ? "cursor-pointer hover:bg-elevated px-1 py-0.5 rounded"
                              : ""
                          }
                        >
                          {cell}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-auto bg-surface border-t border-app-border z-10">
        <TablePagination
          totalRows={totalRows}
          totalPages={totalPages}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      <ContextMenu
        isOpen={isOpen}
        position={position}
        contextData={contextData}
        onClose={close}
        data-testid={
          (contextData as ContextData | null)?.type
            ? `context-menu-${(contextData as ContextData).type}`
            : "context-menu"
        }
        actions={(data: ContextData | null) => {
          if (!data) return null;
          if (data.type === "column")
            return (
              <>
                <MenuButton onClick={() => handleAddColumn(data.columnIndex)}>
                  Add Column
                </MenuButton>
                <MenuButton onClick={() => handleDeleteColumn(data.columnIndex)}>
                  Delete Column
                </MenuButton>
                <MenuButton onClick={() => handleRenameColumn(data.columnIndex)}>
                  Rename Column
                </MenuButton>
              </>
            );
          if (data.type === "row")
            return (
              <>
                <MenuButton onClick={() => handleAddRow(data.rowIndex)}>Add Row</MenuButton>
                <MenuButton onClick={() => handleDeleteRow(data.rowIndex)}>Delete Row</MenuButton>
              </>
            );
          return null;
        }}
      />

      {inputConfig && (
        <InputDialog
          isOpen={true}
          message={inputConfig.message}
          defaultValue={inputConfig.defaultValue}
          onSubmit={inputConfig.onSubmit}
          onCancel={() => setInputConfig(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  );
};

export default Table;

interface TablePaginationProps {
  totalRows: number;
  totalPages: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function TablePagination({
  totalRows,
  totalPages,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const [pageInput, setPageInput] = useState(String(page));
  const pageInputRef = useRef<HTMLInputElement>(null);
  const pageSizeOptions = [10, 25, 50, 100];
  const { showToast } = useToast();

  const prevPageRef = useRef(page);
  if (prevPageRef.current !== page) {
    prevPageRef.current = page;
    setPageInput(String(page));
  }

  const handleFirst = () => {
    if (page !== 1) onPageChange(1);
  };
  const handlePrevious = () => {
    if (page > 1) onPageChange(page - 1);
  };
  const handleNext = () => {
    if (page < totalPages) onPageChange(page + 1);
  };
  const handleLast = () => {
    if (page !== totalPages) onPageChange(totalPages);
  };

  const commitPageInput = () => {
    const input = pageInputRef.current;
    if (input && !input.reportValidity()) {
      showToast("Invalid page number", "error");
      setPageInput(String(page));
      return;
    }
    const parsed = Number(pageInput);
    if (parsed !== page) onPageChange(parsed);
  };

  const handlePageInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitPageInput();
    }
    if (e.key === "Escape") {
      setPageInput(String(page));
    }
  };

  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 px-4 bg-surface text-xs sm:px-6">
      {/* Left: Total Rows + Page Size */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Total Rows:</span>
          <span className="text-foreground">{totalRows}</span>
        </div>
        <div className="relative flex items-center gap-1.5">
          <span className="text-muted-foreground">Page Size:</span>
          <div className="relative inline-block">
            <button
              onClick={() => setPageSizeOpen(!pageSizeOpen)}
              className="min-w-8.5 rounded border border-app-border px-2 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {pageSize}
            </button>
            {pageSizeOpen && (
              <div className="absolute bottom-full z-10 mb-1 min-w-13 rounded-md border border-app-border bg-surface shadow-md">
                {pageSizeOptions.map((size) => (
                  <div
                    key={size}
                    onClick={() => {
                      onPageSizeChange(size);
                      setPageSizeOpen(false);
                    }}
                    className="cursor-pointer rounded px-3 py-1 hover:bg-surface-hover hover:text-blue-700"
                  >
                    {size}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: nav buttons + Page X of Y */}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          onClick={handleFirst}
          disabled={page === 1}
          className="rounded border border-app-border p-1 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="First page"
        >
          <ChevronsLeft className="h-3.5 w-3.5 text-foreground" />
        </button>
        <button
          onClick={handlePrevious}
          disabled={page === 1}
          className="rounded border border-app-border p-1 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5 text-foreground" />
        </button>

        {/* Page X of Y — X always editable */}
        <div className="flex items-center gap-1 text-muted-foreground select-none">
          <span className="text-muted-foreground">Page</span>
          <input
            ref={pageInputRef}
            type="number"
            min={1}
            max={totalPages}
            step={1}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={handlePageInputKeyDown}
            onBlur={commitPageInput}
            title={`Enter a page between 1 and ${totalPages}`}
            className="h-6 w-11 rounded border border-app-border px-1 text-center text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label="Current page"
          />
          <span className="text-muted-foreground">of {totalPages}</span>
        </div>

        <button
          onClick={handleNext}
          disabled={page === totalPages}
          className="rounded border border-app-border p-1 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5 text-foreground" />
        </button>
        <button
          onClick={handleLast}
          disabled={page === totalPages}
          className="rounded border border-app-border p-1 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Last page"
        >
          <ChevronsRight className="h-3.5 w-3.5 text-foreground" />
        </button>
      </div>
    </div>
  );
}
