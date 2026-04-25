import ContextMenu from "./ContextMenu";
import { useContextMenu } from "../hooks/useContextMenu";
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

  useEffect(() => {
    if (ctxColumns.length > 0 && ctxRows.length > 0) {
      setColumns(["S.No.", ...ctxColumns]);
      setData(ctxRows.map((row, index) => [(page - 1) * pageSize + index + 1, ...row]));
    }
  }, [ctxColumns, ctxRows, page, pageSize]);

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
    updateData(columns, rows, newDtypes);
  };

  const handleAddRow = async (index) => {
    try {
      const response = await transformProject(projectId, {
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
          const response = await transformProject(projectId, {
            operation_type: ADD_COLUMN,
            col_params: { index, name: newColumnName },
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

  const handleDeleteRow = async (index) => {
    try {
      const response = await transformProject(projectId, {
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
          const response = await transformProject(projectId, {
            operation_type: RENAME_COLUMN,
            rename_col_params: { col_index: index - 1, new_name: newName },
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

  const handleDeleteColumn = async (index) => {
    if (index === 0) {
      setToast({
        message: "Cannot delete the S.No. column.",
        type: "error",
      });
      return;
    }

    try {
      const response = await transformProject(projectId, {
        operation_type: DELETE_COLUMN,
        col_params: { index: index - 1 },
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

  const handleEditCell = async (rowIndex, cellIndex, newValue) => {
    try {
      const response = await transformProject(projectId, {
        operation_type: CHANGE_CELL_VALUE,
        change_cell_value: {
          col_index: cellIndex,
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
      setEditValue(cellValue);
    }
  };

  const handlePageChange = (newPage) => {
    setPaginationData({ page: newPage });
    refreshProject(projectId, newPage, pageSize);
  };

  const handlePageSizeChange = (newSize) => {
    setPaginationData({ page: 1, pageSize: newSize });
    refreshProject(projectId, 1, newSize);
  };

  return (
    <div className="px-8 pt-6 pb-8">
      <div className="flex flex-col border border-gray-200 rounded-lg shadow-sm bg-white overflow-hidden">
        {/* Header Bar */}
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-slate-800">Original dataset</span>
              <span className="text-slate-300">/</span>
              <span className="font-medium text-slate-700">{totalRows} rows</span>
              <span className="text-slate-300">/</span>
              <span className="font-medium text-slate-700">{ctxColumns.length} columns</span>
              <span className="text-xs text-slate-500">
                Primary workspace. All modifications are automatically tracked.
              </span>
            </div>
          </div>
        </div>

        {/* Table Container */}
        <div
          className="overflow-x-auto overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 240px)" }}
        >
          <table className="min-w-full bg-white divide-y divide-gray-200">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr>
                {columns.map((column, columnIndex) => (
                  <th
                    key={columnIndex}
                    className={`py-3 border-b border-gray-200 text-sm font-semibold text-gray-600 uppercase tracking-tight whitespace-nowrap bg-gray-50 ${columnIndex === 0 ? "pl-4 pr-2 text-left" : "px-4 text-left"}`}
                    onContextMenu={(e) => open(e, { type: "column", columnIndex })}
                  >
                    <button
                      className={`flex items-center gap-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 py-1 px-2 rounded-lg transition-colors duration-150 ${columnIndex === 0 ? "text-left" : ""}`}
                    >
                      {column}
                      {column !== "S.No." && <DtypeBadge dtype={dtypes[column]} />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {data.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-slate-50 transition-colors duration-150">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={`py-2.5 text-sm text-gray-700 border-r border-gray-50 last:border-r-0 ${cellIndex === 0 ? "pl-4 pr-2 text-left" : "px-4 text-left"}`}
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
                          autoFocus
                          className="w-full p-1.5 border border-blue-400 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none bg-blue-50/50 text-sm"
                          onKeyDown={(e) => handleInputKeyDown(e, rowIndex, cellIndex)}
                        />
                      ) : (
                        <div
                          onClick={() => handleCellClick(rowIndex, cellIndex, cell)}
                          className={
                            cellIndex !== 0
                              ? "cursor-pointer hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-gray-200 p-1.5 rounded transition-all truncate"
                              : "p-1.5 text-gray-400 font-mono text-xs text-left"
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

        {/* Pagination Bar - Now part of the card */}
        <div className="border-t border-gray-200 bg-white">
          <TablePagination
            totalRows={totalRows}
            totalPages={totalPages}
            page={page}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      </div>

      <ContextMenu
        isOpen={isOpen}
        position={position}
        contextData={contextData}
        onClose={close}
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
  const pageSizeOptions = [10, 25, 50, 100, "All"];

  const handlePrevious = () => {
    if (page > 1) {
      onPageChange(page - 1);
    }
  };

  const handleNext = () => {
    if (page < totalPages) {
      onPageChange(page + 1);
    }
  };

  return (
    <div className="flex items-center justify-between px-8 py-3 bg-white">
      <div className="flex items-center gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 font-medium">Total Rows:</span>
          <span className="text-gray-900 font-semibold">{totalRows}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 font-medium">Page:</span>
          <span className="text-gray-900 font-semibold">
            {page} of {totalPages}
          </span>
        </div>
        <div className="flex items-center gap-2 relative">
          <span className="text-gray-500 font-medium">Page Size:</span>
          <div className="relative inline-block">
            <button
              onClick={() => setPageSizeOpen(!pageSizeOpen)}
              className="border-2 border-gray-100 rounded-lg px-3 py-1 text-sm min-w-[60px] text-center font-medium hover:border-blue-400 hover:text-blue-600 transition-all focus:outline-none focus:ring-2 focus:ring-blue-100 bg-gray-50/50"
            >
              {pageSize === totalRows && totalRows > 0 ? "All" : pageSize}
            </button>

            {pageSizeOpen && (
              <div className="absolute bottom-full mb-2 min-w-[80px] bg-white border border-gray-200 rounded-lg shadow-xl z-20 py-1.5 overflow-hidden">
                {pageSizeOptions.map((size) => (
                  <div
                    key={size}
                    onClick={() => {
                      const actualSize = size === "All" ? totalRows : size;
                      onPageSizeChange(actualSize);
                      setPageSizeOpen(false);
                    }}
                    className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                      (size === "All" && pageSize === totalRows) || size === pageSize
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "text-gray-600 hover:bg-slate-50 hover:text-blue-600"
                    }`}
                  >
                    {size}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handlePrevious}
          disabled={page === 1}
          className="p-1.5 border-2 border-gray-300 rounded-lg hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <button
          onClick={handleNext}
          disabled={page === totalPages}
          className="p-1.5 border-2 border-gray-300 rounded-lg hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Next page"
        >
          <ChevronRight className="w-5 h-5 text-gray-700" />
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
