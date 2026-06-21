import ContextMenu from "./ContextMenu";
import { useContextMenu } from "../hooks/useContextMenu";
import { useState, useEffect, useMemo, useRef } from "react";
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
import PropTypes from "prop-types";

const MenuButton = ({ children, onClick }) => (
  <button
    role="menuitem"
    className="block w-full text-left text-sm text-gray-700 px-3 py-1.5 hover:bg-gray-100 rounded-md transition-colors duration-150 whitespace-nowrap"
    onClick={onClick}
  >
    {children}
  </button>
);
MenuButton.propTypes = {
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func.isRequired,
};

const Table = ({ projectId, data: externalData }) => {
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
  } = useProjectContext();
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const { isOpen, position, contextData, open, close } = useContextMenu();

  const [inputConfig, setInputConfig] = useState(null);
  const [toast, setToast] = useState(null);

  const [draggedColIndex, setDraggedColIndex] = useState(null);
  const [hoveredTargetIndex, setHoveredTargetIndex] = useState(null);

  const safeOrder = useMemo(() => {
    return columnOrder.length === ctxColumns.length ? columnOrder : ctxColumns.map((_, i) => i);
  }, [columnOrder, ctxColumns]);

  useEffect(() => {
    if (ctxColumns.length > 0 && ctxRows.length > 0) {
      setColumns(["S.No.", ...safeOrder.map((i) => ctxColumns[i])]);
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

  const updateTableData = (response) => {
    const { columns, rows, dtypes: newDtypes } = response;
    setColumns(["S.No.", ...columns]);
    setData(rows.map((row, index) => [index + 1, ...Object.values(row)]));
    updateData(columns, rows, { dtypes: newDtypes });
  };

  const handleAddRow = async (index) => {
    try {
      const response = await transformProject(projectId, {
        operation_type: ADD_ROW,
        row_params: { index },
      });
      updateTableData(response);
      const normalizedRows = response.rows.map((row) =>
        Array.isArray(row) ? row : Object.values(row),
      );
      updateData(response.columns, normalizedRows, { resetColumnOrder: false });
      refreshProject(projectId, 1, pageSize);
    } catch {
      setToast({
        message: "Failed to add row. Please try again.",
        type: "error",
      });
    }
  };

  const handleAddColumn = (index) => {
    setInputConfig({
      message: "Enter column name:",
      defaultValue: "",
      onSubmit: async (newColumnName) => {
        if (!newColumnName) {
          setInputConfig(null);
          return;
        }

        try {
          let backendIndex; // Normalized index
          if (index === 0) {
            backendIndex = 0;
          } else {
            const displayDataIndex = index - 1;
            const baseIndex = columnOrder[displayDataIndex];
            backendIndex = baseIndex + 1;
          }
          const response = await transformProject(projectId, {
            operation_type: ADD_COLUMN,
            add_col_params: { index: backendIndex, name: newColumnName },
          });
          updateTableData(response);
          const normalizedRows = response.rows.map((row) =>
            Array.isArray(row) ? row : Object.values(row),
          );
          updateData(response.columns, normalizedRows, { resetColumnOrder: true });
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

  const handleDeleteRow = async (index) => {
    try {
      const response = await transformProject(projectId, {
        operation_type: DELETE_ROW,
        row_params: { index },
      });
      updateTableData(response);
      const normalizedRows = response.rows.map((row) =>
        Array.isArray(row) ? row : Object.values(row),
      );
      updateData(response.columns, normalizedRows, { resetColumnOrder: false });
      refreshProject(projectId, 1, pageSize);
    } catch {
      setToast({
        message: "Failed to delete row. Please try again.",
        type: "error",
      });
    }
  };

  const handleRenameColumn = (index) => {
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
          const backendIndex = columnOrder[displayDataIndex]; // Normalized index
          const response = await transformProject(projectId, {
            operation_type: RENAME_COLUMN,
            rename_col_params: { col_index: backendIndex, new_name: newName },
          });
          updateTableData(response);
          const normalizedRows = response.rows.map((row) =>
            Array.isArray(row) ? row : Object.values(row),
          );
          updateData(response.columns, normalizedRows, { resetColumnOrder: false });
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

  const handleDeleteColumn = async (index) => {
    if (index === 0) {
      setToast({
        message: "Cannot delete the S.No. column.",
        type: "error",
      });
      return;
    }

    try {
      const displayDataIndex = index - 1;
      const backendIndex = columnOrder[displayDataIndex]; // Normalized index
      const response = await transformProject(projectId, {
        operation_type: DELETE_COLUMN,
        del_col_params: { index: backendIndex },
      });
      updateTableData(response);
      const normalizedRows = response.rows.map((row) =>
        Array.isArray(row) ? row : Object.values(row),
      );
      updateData(response.columns, normalizedRows, { resetColumnOrder: true });
      refreshProject(projectId, 1, pageSize);
    } catch {
      setToast({
        message: "Failed to delete column. Please try again.",
        type: "error",
      });
    }
  };

  const handleEditCell = async (rowIndex, cellIndex, newValue) => {
    try {
      const backendColIndex =
        cellIndex === 0 ? 0 : columnOrder.length > 0 ? columnOrder[cellIndex - 1] + 1 : cellIndex;

      const response = await transformProject(projectId, {
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

  const handleInputKeyDown = (e, rowIndex, cellIndex) => {
    if (e.key === "Enter") {
      handleEditCell(rowIndex, cellIndex, editValue);
    } else if (e.key === "Escape") {
      setEditingCell(null);
      setEditValue("");
    }
  };

  const handleCellClick = (rowIndex, cellIndex, cellValue) => {
    if (cellIndex !== 0) {
      setEditingCell({ rowIndex, cellIndex });
      // Coerce null/undefined (missing cells now serialize to null) to "" so the
      // controlled input stays controlled and never renders the literal "null".
      setEditValue(cellValue ?? "");
    }
  };

  const handlePageChange = (newPage) => {
    setPaginationData({ page: newPage });
    refreshProject(projectId, newPage, pageSize);
  };

  const handlePageSizeChange = (newSize) => {
    setPaginationData({ page: 1, page_size: newSize });
    refreshProject(projectId, 1, newSize);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="min-h-0 m-4 overflow-auto border border-gray-200 rounded-lg shadow-sm">
        <table data-testid="data-table" className="min-w-full bg-white">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              {columns.map((column, columnIndex) => {
                const isSNo = columnIndex === 0;
                const isDragged = !isSNo && draggedColIndex === columnIndex - 1;
                const isDropTarget = !isSNo && hoveredTargetIndex === columnIndex - 1;
                return (
                  <th
                    key={columnIndex}
                    className={`py-1.5 px-3 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                      isDropTarget ? "ring-2 ring-blue-400" : ""
                    }`}
                    onContextMenu={(e) => open(e, { type: "column", columnIndex })}
                  >
                    <button
                      type="button"
                      className={`w-full text-left text-gray-500 hover:text-gray-700 hover:bg-gray-100 py-0.5 px-1.5 rounded-md transition-colors duration-150 ${
                        isSNo ? "" : "cursor-grab active:cursor-grabbing"
                      } ${isDragged ? "opacity-50" : ""}`}
                      draggable={!isSNo}
                      onDragStart={(event) => {
                        if (isSNo) return;
                        setDraggedColIndex(columnIndex - 1);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(event) => {
                        if (isSNo) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setHoveredTargetIndex(columnIndex - 1);
                      }}
                      onDrop={(event) => {
                        if (isSNo) return;
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
                        newOrder.splice(target, 0, moved);
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
                      {column !== "S.No." && <DtypeBadge dtype={dtypes[column]} />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="py-1 px-3 text-xs text-gray-700"
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
                          cellIndex !== 0 ? "cursor-pointer hover:bg-gray-50 p-1 rounded" : ""
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
        data-testid={contextData?.type ? `context-menu-${contextData.type}` : "context-menu"}
        actions={(data) => {
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

Table.propTypes = {
  projectId: PropTypes.string.isRequired,
  data: PropTypes.shape({
    columns: PropTypes.arrayOf(PropTypes.string),
    rows: PropTypes.arrayOf(
      PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])),
    ),
  }),
};

export default Table;

// TablePagination Component
export function TablePagination({
  totalRows,
  totalPages,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) {
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const [pageInput, setPageInput] = useState("");
  const pageInputRef = useRef(null);
  const pageSizeOptions = [10, 25, 50, 100];

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

  const goToInputPage = () => {
    const input = pageInputRef.current;

    if (input && !input.reportValidity()) {
      return;
    }

    const trimmed = pageInput.trim();
    if (!trimmed) return;

    const parsed = Number(trimmed);
    const clamped = Math.min(Math.max(parsed, 1), totalPages);
    onPageChange(clamped);
    setPageInput("");
  };

  const handlePageInputKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goToInputPage();
    }
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-3 bg-white sm:flex-row sm:items-center sm:justify-between sm:px-8">
      {/* Info section */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Total Rows:</span>
          <span className="text-gray-900">{totalRows}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Page:</span>
          <span className="text-gray-900">
            {page} of {totalPages}
          </span>
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

        <div className="flex items-center gap-1.5">
          <input
            ref={pageInputRef}
            type="number"
            min={1}
            max={totalPages}
            step={1}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={handlePageInputKeyDown}
            placeholder={String(page)}
            title={`Enter a page between 1 and ${totalPages}`}
            className="h-[34px] w-16 rounded-md border-2 border-gray-300 px-2 text-center text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label="Go to page"
          />
          <button
            onClick={goToInputPage}
            className="h-[34px] rounded-md border-2 border-gray-300 px-3 text-sm text-gray-700 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Go
          </button>
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

TablePagination.propTypes = {
  totalRows: PropTypes.number.isRequired,
  totalPages: PropTypes.number.isRequired,
  page: PropTypes.number.isRequired,
  pageSize: PropTypes.number.isRequired,
  onPageChange: PropTypes.func.isRequired,
};
