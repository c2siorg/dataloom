import { useEffect, useState } from "react";
import { transformProject } from "../api";
import { useProjectContext } from "../context/ProjectContext";
import InputDialog from "./common/InputDialog";
import Toast from "./common/Toast";
import proptypes from "prop-types";

const Table = ({ projectId, data: externalData }) => {
  const { columns: ctxColumns, rows: ctxRows } = useProjectContext();
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    rowIndex: null,
    columnIndex: null,
    type: null,
  });

  const [inputConfig, setInputConfig] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (ctxColumns.length > 0 && ctxRows.length > 0) {
      setColumns(["S.No.", ...ctxColumns]);
      setData(ctxRows.map((row, index) => [index + 1, ...row]));
    }
  }, [ctxColumns, ctxRows]);

  useEffect(() => {
    if (externalData) {
      const { columns, rows } = externalData;
      setColumns(["S.No.", ...columns]);
      setData(rows.map((row, index) => [index + 1, ...Object.values(row)]));
    }
  }, [externalData]);

  const updateTableData = (response) => {
    const { columns, rows } = response;
    setColumns(["S.No.", ...columns]);
    setData(rows.map((row, index) => [index + 1, ...Object.values(row)]));
  };

  const handleAddRow = async (index) => {
    try {
      const response = await transformProject(projectId, {
        operation_type: "addRow",
        row_params: { index },
      });
      updateTableData(response);
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
            operation_type: "addCol",
            col_params: { index, name: newColumnName },
          });
          updateTableData(response);
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
        operation_type: "delRow",
        row_params: { index },
      });
      updateTableData(response);
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
            operation_type: "renameCol",
            rename_col_params: { col_index: index - 1, new_name: newName },
          });
          updateTableData(response);
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
        operation_type: "delCol",
        col_params: { index: index - 1 },
      });
      updateTableData(response);
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
        operation_type: "changeCellValue",
        change_cell_value: {
          col_index: cellIndex,
          row_index: rowIndex,
          fill_value: newValue,
        },
      });
      updateTableData(response);
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

  const handleRightClick = (event, rowIndex = null, columnIndex = null, type = null) => {
    event.preventDefault();
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      rowIndex,
      columnIndex,
      type,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      rowIndex: null,
      columnIndex: null,
      type: null,
    });
  };

  return (
    <div className="px-8 pt-3" onClick={handleCloseContextMenu}>
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
                  onContextMenu={(e) => handleRightClick(e, null, columnIndex, "column")}
                >
                  <button className="w-full text-left text-gray-500 hover:text-gray-700 hover:bg-gray-100 py-0.5 px-1.5 rounded-md transition-colors duration-150">
                    {column}
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
                    onContextMenu={(e) => handleRightClick(e, rowIndex, null, "row")}
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

      {contextMenu.visible && contextMenu.type === "column" && (
        <div
          className="absolute bg-white border border-gray-200 rounded-lg shadow-lg p-1"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="block w-full text-left text-sm text-gray-700 px-3 py-1.5 hover:bg-gray-100 rounded-md transition-colors duration-150"
            onClick={() => handleAddColumn(contextMenu.columnIndex)}
          >
            Add Column
          </button>
          <button
            className="block w-full text-left text-sm text-gray-700 px-3 py-1.5 hover:bg-gray-100 rounded-md transition-colors duration-150"
            onClick={() => handleDeleteColumn(contextMenu.columnIndex)}
          >
            Delete Column
          </button>
          <button
            className="block w-full text-left text-sm text-gray-700 px-3 py-1.5 hover:bg-gray-100 rounded-md transition-colors duration-150"
            onClick={() => handleRenameColumn(contextMenu.columnIndex)}
          >
            Rename Column
          </button>
        </div>
      )}

      {contextMenu.visible && contextMenu.type === "row" && (
        <div
          className="absolute bg-white border border-gray-200 rounded-lg shadow-lg p-1"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="block w-full text-left text-sm text-gray-700 px-3 py-1.5 hover:bg-gray-100 rounded-md transition-colors duration-150"
            onClick={() => handleAddRow(contextMenu.rowIndex)}
          >
            Add Row
          </button>
          <button
            className="block w-full text-left text-sm text-gray-700 px-3 py-1.5 hover:bg-gray-100 rounded-md transition-colors duration-150"
            onClick={() => handleDeleteRow(contextMenu.rowIndex)}
          >
            Delete Row
          </button>
        </div>
      )}

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
  projectId: proptypes.string.isRequired,
  data: proptypes.shape({
    columns: proptypes.arrayOf(proptypes.string),
    rows: proptypes.arrayOf(
      proptypes.arrayOf(proptypes.oneOfType([proptypes.string, proptypes.number])),
    ),
  }),
};
export default Table;
