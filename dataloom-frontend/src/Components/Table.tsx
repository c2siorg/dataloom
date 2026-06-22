import ContextMenu from "./ContextMenu";
import { useContextMenu } from "../hooks/useContextMenu";
import { useState, useEffect, useMemo, useRef, type ReactNode, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { transformProject } from "../api";
import { useProjectContext } from "../context/ProjectContext";
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

/** Project data passed in directly, bypassing ProjectContext. */
interface ExternalData {
  columns: string[];
  rows: Array<Record<string, Cell>>;
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
    className="block w-full text-left text-sm text-gray-700 px-3 py-1.5 hover:bg-gray-100 rounded-md transition-colors duration-150 whitespace-nowrap"
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
  data?: ExternalData;
  showColumnProfiles?: boolean;
}

const Table = ({ projectId, data: externalData, showColumnProfiles = false }: TableProps) => {
  const {
    columns: ctxColumns,
    rows: ctxRows,
    dtypes,
    updateData,
    columnOrder,
    setColumnOrder,
    totalRows,
    totalPages,
    page,
    pageSize,
    setPaginationData,
    refreshProject,
  } = useProjectContext() as unknown as ProjectContextValue;
  const [data, setData] = useState<Cell[][]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const { isOpen, position, contextData, open, close } = useContextMenu();

  const [inputConfig, setInputConfig] = useState<InputConfig | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [draggedColIndex, setDraggedColIndex] = useState<number | null>(null);
  const [hoveredTargetIndex, setHoveredTargetIndex] = useState<number | null>(null);

  // Per-column profiles for the "Columns" toggle. totalRows is the change signal
  // so profiles refresh after a row-count-changing transform.
  const { profiles, loading: profilesLoading } = useColumnProfiles(
    projectId,
    ctxColumns,
    showColumnProfiles,
    totalRows,
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

  useEffect(() => {
    if (externalData) {
      const { columns, rows } = externalData;
      setColumns(["S.No.", ...columns]);
      setData(rows.map((row, index) => [index + 1, ...Object.values(row)]));
    }
  }, [externalData]);

  const updateTableData = (response: TransformResponse) => {
    const { columns, rows, dtypes: newDtypes } = response;
    setColumns(["S.No.", ...columns]);
    setData(normalizeRows(rows).map((row, index) => [index + 1, ...row]));
    // updateData resets the saved column order when the column count changes,
    // which covers add/delete column; rename and row ops keep the order.
    updateData(columns, normalizeRows(rows), { dtypes: newDtypes });
  };

  const handleAddRow = async (index: number) => {
    try {
      const response = await applyTransform({
        operation_type: ADD_ROW,
        row_params: { index },
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
      const response = await applyTransform({
        operation_type: DELETE_ROW,
        row_params: { index },
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

  const handleEditCell = async (rowIndex: number, cellIndex: number, newValue: string) => {
    try {
      const backendColIndex =
        cellIndex === 0
          ? 0
          : columnOrder.length > 0
            ? (columnOrder[cellIndex - 1] as number) + 1
            : cellIndex;

      const response = await applyTransform({
        operation_type: CHANGE_CELL_VALUE,
        change_cell_value: {
          col_index: backendColIndex,
          row_index: rowIndex,
          fill_value: newValue,
        },
      });
      updateTableData(response);
      refreshProject(projectId, 1, pageSize);
      setEditingCell(null);
      setEditValue("");
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
      <div className="flex-1 min-h-0 overflow-hidden border-x border-b border-gray-200 shadow-sm">
        <div className="h-full overflow-auto">
          <table
            data-testid="data-table"
            className="min-w-full bg-white border-separate border-spacing-0"
          >
            <thead className="sticky top-0 z-20 bg-gray-50">
              {showColumnProfiles && (
                <tr>
                  {columns.map((column, columnIndex) => {
                    const isSerialNumber = columnIndex === 0;
                    return (
                      <th
                        key={columnIndex}
                        className={`align-top border-b border-r border-gray-200 ${
                          isSerialNumber
                            ? "w-16 sticky left-0 z-10 bg-gray-50"
                            : "bg-white min-w-[140px]"
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
                      className={`h-6 px-0.5 py-0 border-r border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                        isDropTarget ? "ring-2 ring-blue-400" : ""
                      } ${isSerialNumber ? "w-16 sticky left-0 z-10 bg-gray-50" : "bg-gray-50"}`}
                      onContextMenu={(e) => open(e, { type: "column", columnIndex })}
                    >
                      <button
                        type="button"
                        className={`w-full text-left text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors duration-150 ${
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
                      className={`h-5 px-0.5 py-0 border-b border-r border-gray-200 text-left text-[10px] leading-none ${
                        isDropTarget ? "ring-2 ring-blue-400" : ""
                      } ${isSerialNumber ? "w-16 sticky left-0 z-10 bg-gray-50" : "bg-gray-50"}`}
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
                <tr key={rowIndex} className="hover:bg-gray-50 transition-colors duration-150">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={`h-6 px-0.5 py-0 text-xs border-b border-r border-gray-200 ${
                        cellIndex === 0
                          ? "w-16 sticky left-0 z-10 bg-gray-50 text-center font-medium text-gray-500"
                          : "text-gray-700"
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
                          className="w-full p-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                          onKeyDown={(e) => handleInputKeyDown(e, rowIndex, cellIndex)}
                        />
                      ) : (
                        <div
                          onClick={() => handleCellClick(rowIndex, cellIndex, cell)}
                          className={
                            cellIndex !== 0
                              ? "cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded"
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

      <div className="mt-auto bg-white shadow-lg border-t border-gray-200 z-10">
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
    <div className="flex flex-col gap-3 px-4 py-3 bg-white sm:flex-row sm:items-center sm:justify-between sm:px-8">
      {/* Left: Total Rows + Page Size */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Total Rows:</span>
          <span className="text-gray-900">{totalRows}</span>
        </div>
        <div className="relative flex items-center gap-2">
          <span className="text-gray-500">Page Size:</span>
          <div className="relative inline-block">
            <button
              onClick={() => setPageSizeOpen(!pageSizeOpen)}
              className="min-w-[40px] rounded-md border-2 border-gray-300 px-4 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {pageSize}
            </button>
            {pageSizeOpen && (
              <div className="absolute bottom-full z-10 mb-1 min-w-[60px] rounded-lg border-2 border-gray-300 bg-white shadow-lg">
                {pageSizeOptions.map((size) => (
                  <div
                    key={size}
                    onClick={() => {
                      onPageSizeChange(size);
                      setPageSizeOpen(false);
                    }}
                    className="cursor-pointer rounded-md px-4 py-2 text-sm hover:bg-blue-50 hover:text-blue-700"
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
      <div className="flex flex-wrap items-center justify-center gap-2 sm:flex-nowrap sm:justify-end">
        <button
          onClick={handleFirst}
          disabled={page === 1}
          className="rounded-md border-2 border-gray-300 p-1.5 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="First page"
        >
          <ChevronsLeft className="h-5 w-5 text-gray-700" />
        </button>
        <button
          onClick={handlePrevious}
          disabled={page === 1}
          className="rounded-md border-2 border-gray-300 p-1.5 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-5 w-5 text-gray-700" />
        </button>

        {/* Page X of Y — X always editable */}
        <div className="flex items-center gap-1.5 text-sm text-gray-600 select-none">
          <span className="text-gray-500">Page</span>
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
            className="h-7 w-14 rounded-md border-2 border-gray-300 px-1.5 text-center text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label="Current page"
          />
          <span className="text-gray-500">of {totalPages}</span>
        </div>

        <button
          onClick={handleNext}
          disabled={page === totalPages}
          className="rounded-md border-2 border-gray-300 p-1.5 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-5 w-5 text-gray-700" />
        </button>
        <button
          onClick={handleLast}
          disabled={page === totalPages}
          className="rounded-md border-2 border-gray-300 p-1.5 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Last page"
        >
          <ChevronsRight className="h-5 w-5 text-gray-700" />
        </button>
      </div>
    </div>
  );
}
