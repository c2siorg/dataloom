import { useEffect, useState } from "react";
import { transformProject } from "../api";
import { useProjectContext } from "../hooks/useProjectContext";
import proptypes from "prop-types";

const Table = ({ projectId, data: externalData }) => {
  const {
    columns: ctxColumns,
    rows: ctxRows,
    page,
    pageSize,
    totalPages,
    totalRows,
    goToPreviousPage,
    goToNextPage,
    refreshProject,
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

  useEffect(() => {
    if (ctxColumns.length > 0 && ctxRows.length > 0) {
      setColumns(["S.No.", ...ctxColumns]);
      // Calculate serial numbers based on current page and page size
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

  const handleAddRow = async (index) => {
    try {
      // Reset to page 1 since row indices changed
      const response = await transformProject(
        projectId,
        {
          operation_type: "addRow",
          row_params: { index },
        },
        1,
      );
      updateTableDataWithPagination(response);
      await refreshProject(null, 1);
    } catch (error) {
      alert("Failed to add row. Please try again.");
    }
  };

  const handleAddColumn = async (index) => {
    const newColumnName = prompt("Enter column name:");
    if (newColumnName) {
      try {
        // Use current page since adding column doesn't change row indices
        const response = await transformProject(projectId, {
          operation_type: "addCol",
          col_params: { index, name: newColumnName },
        });
        updateTableDataWithPagination(response);
      } catch (error) {
        alert("Failed to add column. Please try again.");
      }
    }
  };

  const handleDeleteRow = async (index) => {
    try {
      // Use current page, backend will reset to page 1 if needed
      const response = await transformProject(projectId, {
        operation_type: "delRow",
        row_params: { index },
      });
      updateTableDataWithPagination(response);
      // Refresh to get updated pagination state
      await refreshProject(null, response.page);
    } catch (error) {
      alert("Failed to delete row. Please try again.");
    }
  };

  const handleRenameColumn = async (index) => {
    if (index === 0) {
      alert("Cannot rename the S.No. column.");
      return;
    }

    const newName = prompt("Enter new column name:");
    if (newName) {
      try {
        const response = await transformProject(projectId, {
          operation_type: "renameCol",
          rename_col_params: { col_index: index - 1, new_name: newName },
        });
        updateTableDataWithPagination(response);
      } catch (error) {
        alert("Failed to rename column. Please try again.");
      }
    }
  };

  const handleDeleteColumn = async (index) => {
    if (index === 0) {
      alert("Cannot delete the S.No. column.");
      return;
    }

    // the table has 0 indexed columns, but the API expects 1 indexed columns
    index -= 1;
    try {
      const response = await transformProject(projectId, {
        operation_type: "delCol",
        col_params: { index },
      });
      updateTableDataWithPagination(response);
    } catch (error) {
      alert("Failed to delete column. Please try again.");
    }
  };

  const handleEditCell = async (rowIndex, cellIndex, newValue) => {
    // cellIndex includes S.No. column at index 0, so subtract 1 for API
    const dataColIndex = cellIndex - 1;
    try {
      const response = await transformProject(projectId, {
        operation_type: "changeCellValue",
        change_cell_value: {
          col_index: dataColIndex,
          row_index: rowIndex,
          fill_value: newValue,
        },
      });
      updateTableDataWithPagination(response);
      setEditingCell(null);
      setEditValue("");
    } catch (error) {
      alert("Failed to edit cell. Please try again.");
    }
  };

  const handleCellClick = (rowIndex, cellIndex, cellValue) => {
    if (cellIndex !== 0) {
      setEditingCell({ rowIndex, cellIndex });
      setEditValue(cellValue);
    }
  };

  const handleInputChange = (e) => {
    setEditValue(e.target.value);
  };

  const handleInputKeyDown = (e, rowIndex, cellIndex) => {
    if (e.key === "Enter") {
      handleEditCell(rowIndex, cellIndex, editValue);
    } else if (e.key === "Escape") {
      setEditingCell(null);
      setEditValue("");
    }
  };

  const handleRightClick = (event, rowIndex = null, columnIndex = null, type = null) => {
    event.preventDefault();
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      rowIndex: rowIndex,
      columnIndex: columnIndex,
      type: type,
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

  const updateTableData = (newData) => {
    setColumns(newData.columns);
    setData(newData.rows);
  };

  // Helper to update table data with pagination info from response
  const updateTableDataWithPagination = (response) => {
    const { columns, rows, page: responsePage, total_pages, total_rows, page_size } = response;
    const currentPageSize = page_size || pageSize || 50;
    setColumns(["S.No.", ...columns]);
    setData(rows.map((row, index) => [(responsePage - 1) * currentPageSize + index + 1, ...Object.values(row)]));
    updateData(columns, rows, { page: responsePage, total_pages, total_rows });
  };

  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages || totalPages === 0;
  const hasNoData = totalPages === 0;

  return (
    <div className="px-8 pt-3" onClick={handleCloseContextMenu}>
      <div
        className="overflow-x-scroll overflow-y-auto border border-gray-200 rounded-lg shadow-sm"
        style={{ maxHeight: "calc(100vh - 180px)" }}
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
                        onChange={handleInputChange}
                        onBlur={() => handleEditCell(rowIndex, cellIndex, editValue)}
                        onKeyDown={(e) => handleInputKeyDown(e, rowIndex, cellIndex)}
                        className="w-full p-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
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

      {/* Pagination Controls */}
      <div className="flex items-center justify-between px-4 py-3 mt-2 bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="text-sm text-gray-600">
          {hasNoData ? (
            <span>No data</span>
          ) : (
            <span>
              Showing {totalRows > 0 ? (page - 1) * pageSize + 1 : 0} -
              {Math.min(page * pageSize, totalRows)} of {totalRows} rows
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={goToPreviousPage}
            disabled={isFirstPage || hasNoData}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 ${
              isFirstPage || hasNoData
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            {hasNoData ? (
              <span className="px-2">Page 0 of 0</span>
            ) : (
              <span className="px-2">
                Page {page} of {totalPages}
              </span>
            )}
          </span>
          <button
            onClick={goToNextPage}
            disabled={isLastPage || hasNoData}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 ${
              isLastPage || hasNoData
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

Table.propTypes = {
  projectId: proptypes.string.isRequired,
  data: proptypes.shape({
    columns: proptypes.arrayOf(proptypes.string),
    rows: proptypes.arrayOf(proptypes.arrayOf(proptypes.string)),
  }),
};

export default Table;
