import { useEffect, useState } from "react";
import { transformProject } from "../api";
import { useProjectContext } from "../context/ProjectContext";
import InputDialog from "./common/InputDialog";
import Toast from "./common/Toast";
import proptypes from "prop-types";

const Table = ({ projectId, data: externalData }) => {
  const {
    projectId: ctxProjectId,
    columns: ctxColumns,
    rows: ctxRows,
    columnOrder,
    setColumnOrder,
    updateData,
  } = useProjectContext();
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
  const [draggedColIndex, setDraggedColIndex] = useState(null);
  const [hoveredTargetIndex, setHoveredTargetIndex] = useState(null);

  const [inputConfig, setInputConfig] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    // Avoid using stale columns/rows from a different project while
    // the context is still loading the current route's project data.
    if (!ctxProjectId || ctxProjectId !== projectId) {
      return;
    }

    if (ctxColumns.length > 0 && ctxRows.length > 0) {
      let safeOrder = columnOrder;
      if (columnOrder.length !== ctxColumns.length) {
        safeOrder = ctxColumns.map((_, index) => index);
        setColumnOrder(safeOrder);
      }
      const orderedColumns = safeOrder.map((index) => ctxColumns[index]);
      setColumns(["S.No.", ...orderedColumns]);
      setData(
        ctxRows.map((row, rowIndex) => [
          rowIndex + 1,
          ...safeOrder.map((index) => row[index]),
        ])
      );
    }
  }, [ctxColumns, ctxRows, columnOrder, projectId, ctxProjectId, setColumnOrder]);

  useEffect(() => {
    if (externalData) {
      const { columns: extColumns, rows: extRows } = externalData;
      const normalizedRows = extRows.map((row) =>
        Array.isArray(row) ? row : Object.values(row)
      );
      updateData(extColumns, normalizedRows, { resetColumnOrder: false });
    }
  }, [externalData, updateData]);

  const handleAddRow = async (index) => {
    try {
      const response = await transformProject(projectId, {
        operation_type: "addRow",
        row_params: { index },
      });
      const normalizedRows = response.rows.map((row) =>
        Array.isArray(row) ? row : Object.values(row)
      );
      updateData(response.columns, normalizedRows, { resetColumnOrder: false });
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
          let backendIndex;
          if (index === 0) {
            backendIndex = 0;
          } else {
            const displayDataIndex = index - 1;
            const baseIndex = columnOrder[displayDataIndex];
            backendIndex = baseIndex + 1;
          }
          const response = await transformProject(projectId, {
            operation_type: "addCol",
            col_params: { index: backendIndex, name: newColumnName },
          });
          const normalizedRows = response.rows.map((row) =>
            Array.isArray(row) ? row : Object.values(row)
          );
          updateData(response.columns, normalizedRows, { resetColumnOrder: true });
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
      const normalizedRows = response.rows.map((row) =>
        Array.isArray(row) ? row : Object.values(row)
      );
      updateData(response.columns, normalizedRows, { resetColumnOrder: false });
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
          const backendIndex = columnOrder[displayDataIndex];
          const response = await transformProject(projectId, {
            operation_type: "renameCol",
            rename_col_params: { col_index: backendIndex, new_name: newName },
          });
          const normalizedRows = response.rows.map((row) =>
            Array.isArray(row) ? row : Object.values(row)
          );
          updateData(response.columns, normalizedRows, { resetColumnOrder: false });
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

    const displayDataIndex = index - 1;
    const backendIndex = columnOrder[displayDataIndex];
    try {
      const response = await transformProject(projectId, {
        operation_type: "delCol",
        col_params: { index: backendIndex },
      });
      const normalizedRows = response.rows.map((row) =>
        Array.isArray(row) ? row : Object.values(row)
      );
      updateData(response.columns, normalizedRows, { resetColumnOrder: true });
    } catch {
      setToast({
        message: "Failed to delete column. Please try again.",
        type: "error",
      });
    }
  };

  const handleEditCell = async (rowIndex, cellIndex, newValue) => {
    if (cellIndex === 0) {
      return;
    }
    try {
      const displayDataIndex = cellIndex - 1;
      const backendColIndex = columnOrder[displayDataIndex];
      const response = await transformProject(projectId, {
        operation_type: "changeCellValue",
        change_cell_value: {
          col_index: backendColIndex + 1,
          row_index: rowIndex,
          fill_value: newValue,
        },
      });
      setEditingCell(null);
      setEditValue("");
      const normalizedRows = response.rows.map((row) =>
        Array.isArray(row) ? row : Object.values(row)
      );
      updateData(response.columns, normalizedRows, { resetColumnOrder: false });
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
              {columns.map((column, columnIndex) => {
                const isSNo = columnIndex === 0;
                const isDragged =
                  !isSNo && draggedColIndex === columnIndex - 1;
                const isDropTarget =
                  !isSNo && hoveredTargetIndex === columnIndex - 1;
                return (
                  <th
                    key={columnIndex}
                    className={`py-1.5 px-3 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                      isDropTarget ? "ring-2 ring-blue-400" : ""
                    }`}
                    onContextMenu={(e) =>
                      handleRightClick(e, null, columnIndex, "column")
                    }
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
                        const currentOrder =
                          columnOrder.length === ctxColumns.length
                            ? columnOrder
                            : ctxColumns.map((_, index) => index);
                        const newOrder = [...currentOrder];
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