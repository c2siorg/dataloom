import { useEffect, useState } from "react";
import { transformProject } from "../api";
import { useProjectContext } from "../context/ProjectContext";
import InputDialog from "./common/InputDialog";
import Toast from "./common/Toast";
import DtypeBadge from "./common/DtypeBadge";
import proptypes from "prop-types";

const Table = ({ projectId, data: externalData }) => {
  const { columns: ctxColumns, rows: ctxRows, dtypes, updateData } = useProjectContext();
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
    const { columns, rows, dtypes: newDtypes } = response;
    setColumns(["S.No.", ...columns]);
    setData(rows.map((row, index) => [index + 1, ...Object.values(row)]));
    updateData(columns, rows, newDtypes);
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
    <div className="flex-1 overflow-hidden p-4" onClick={handleCloseContextMenu}>
      <div className="h-full overflow-auto border border-slate-200 rounded-2xl shadow-premium glass bg-white/50">
        <table className="min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map((column, columnIndex) => (
                <th
                  key={columnIndex}
                  className="py-3 px-4 border-b border-slate-200 bg-slate-50/80 backdrop-blur-md text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider first:rounded-tl-2xl transition-all"
                  onContextMenu={(e) =>
                    handleRightClick(e, null, columnIndex, "column")
                  }
                >
                  <div className="flex items-center gap-2 group cursor-default">
                    {column}
                    {column !== "S.No." && <DtypeBadge dtype={dtypes[column]} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white/30">
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="group border-b border-slate-100 hover:bg-accent/[0.02] transition-colors duration-150"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="py-2.5 px-4 text-sm text-slate-600 border-r border-slate-51 last:border-r-0"
                    onContextMenu={(e) =>
                      handleRightClick(e, rowIndex, null, "row")
                    }
                  >
                    {editingCell &&
                      editingCell.rowIndex === rowIndex &&
                      editingCell.cellIndex === cellIndex ? (
                      <input
                        type="text"
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() =>
                          handleEditCell(rowIndex, cellIndex, editValue)
                        }
                        onKeyDown={(e) =>
                          handleInputKeyDown(e, rowIndex, cellIndex)
                        }
                        className="w-full px-2 py-1 text-sm bg-white border-2 border-accent rounded-lg shadow-lg outline-none"
                      />
                    ) : (
                      <div
                        onClick={() => handleCellClick(rowIndex, cellIndex, cell)}
                        className={
                          cellIndex !== 0
                            ? "cursor-pointer hover:text-accent transition-colors duration-150"
                            : "font-medium text-slate-400"
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

      {contextMenu.visible && (
        <div
          className="fixed z-[200] bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5 min-w-[160px] animate-in fade-in zoom-in duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.type === "column" ? (
            <>
              <button
                className="flex items-center gap-2 w-full text-left text-sm text-slate-700 px-3 py-2 hover:bg-accent/10 hover:text-accent rounded-lg transition-all duration-150 font-medium"
                onClick={() => handleAddColumn(contextMenu.columnIndex)}
              >
                Add Column
              </button>
              <button
                className="flex items-center gap-2 w-full text-left text-sm text-slate-700 px-3 py-2 hover:bg-accent/10 hover:text-accent rounded-lg transition-all duration-150 font-medium"
                onClick={() => handleRenameColumn(contextMenu.columnIndex)}
              >
                Rename Column
              </button>
              <div className="h-px bg-slate-100 my-1 mx-1" />
              <button
                className="flex items-center gap-2 w-full text-left text-sm text-red-600 px-3 py-2 hover:bg-red-50 rounded-lg transition-all duration-150 font-medium"
                onClick={() => handleDeleteColumn(contextMenu.columnIndex)}
              >
                Delete Column
              </button>
            </>
          ) : (
            <>
              <button
                className="flex items-center gap-2 w-full text-left text-sm text-slate-700 px-3 py-2 hover:bg-accent/10 hover:text-accent rounded-lg transition-all duration-150 font-medium"
                onClick={() => handleAddRow(contextMenu.rowIndex)}
              >
                Add Row
              </button>
              <div className="h-px bg-slate-100 my-1 mx-1" />
              <button
                className="flex items-center gap-2 w-full text-left text-sm text-red-600 px-3 py-2 hover:bg-red-50 rounded-lg transition-all duration-150 font-medium"
                onClick={() => handleDeleteRow(contextMenu.rowIndex)}
              >
                Delete Row
              </button>
            </>
          )}
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
