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
    <div className="px-8 pt-3">
      <div
        className="overflow-x-scroll overflow-y-auto border border-gray-200 rounded-lg shadow-sm"
        style={{ maxHeight: "calc(100vh - 140px)" }}
      >
        <table className="min-w-full bg-white">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              {columns.map((column, columnIndex) => (
                <th
                  key={columnIndex}
                  className="py-1.5 px-3 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  onContextMenu={(e) => open(e, { type: "column", columnIndex })}
                >
                  <button className="w-full text-left text-gray-500 hover:text-gray-700 hover:bg-gray-100 py-0.5 px-1.5 rounded-md transition-colors duration-150">
                    {column}
                    {column !== "S.No." && <DtypeBadge dtype={dtypes[column]} />}
                  </button>
                </th>
              ))}
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

      <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg border-t border-gray-200 z-10">
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
  const pageSizeOptions = [10, 25, 50, 100];

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
          <span className="text-gray-500">Total Rows:</span>
          <span className="text-gray-900">{totalRows}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Page:</span>
          <span className="text-gray-900">
            {page} of {totalPages}
          </span>
        </div>
        <div className="flex items-center gap-2 relative">
          <span className="text-gray-500">Page Size:</span>
          <div className="relative inline-block">
            <button
              onClick={() => setPageSizeOpen(!pageSizeOpen)}
              className="border-2 border-gray-300 rounded-md px-4 py-1 text-sm min-w-[40px] text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {pageSize}
            </button>

            {pageSizeOpen && (
              <div className="absolute bottom-full mb-1 min-w-[60px] bg-white border-2 border-gray-300 rounded-lg shadow-lg z-10">
                {pageSizeOptions.map((size) => (
                  <div
                    key={size}
                    onClick={() => {
                      onPageSizeChange(size);
                      setPageSizeOpen(false);
                    }}
                    className="px-4 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 cursor-pointer rounded-md"
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
          className="p-1.5 border-2 border-gray-300 rounded-md hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <button
          onClick={handleNext}
          disabled={page === totalPages}
          className="p-1.5 border-2 border-gray-300 rounded-md hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
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
