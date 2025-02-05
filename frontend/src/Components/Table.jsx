import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { transformDataset } from "../api";
import proptypes from "prop-types";


const Table = ({ datasetId, data: externalData }) => {
  const location = useLocation();
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
    console.log("Location state:", location.state);
    if (location.state && location.state.apiData) {
      const { columns, rows } = location.state.apiData;

      // Verify the data 
      console.log("Columns from API data:", columns);
      console.log("Rows from API data:", rows);

     
      setColumns(["S.No.", ...columns]);

     
      const mappedRows = rows.map((row, index) => [index + 1, ...row]);
      console.log("Mapped Rows:", mappedRows);

     
      setData(mappedRows);
    }
  }, [location.state]);

  useEffect(() => {
    if (externalData) {
      const { columns, rows } = externalData;
      setColumns(["S.No.", ...columns]);
      setData(rows.map((row, index) => [index + 1, ...Object.values(row)]));
    }
  }, [externalData]);

  const handleAddRow = async (index) => {
    console.log("In Table -> in handleaddrow = Adding row at index:", index);
    try {
      const response = await transformDataset(datasetId, {
        operation_type: "addRow",
        row_params: { index },
      });
      console.log("Add row response:", response.data);
      updateTableData(response.data);
      const { columns, rows } = response.data;
      console.log("Columns from API data in handleadd:", columns);
      console.log("Rows from API data in handleadd:", rows);
      setColumns(["S.No.", ...columns]);
      setData(rows.map((row, index) => [index + 1, ...Object.values(row)]));
    } catch (error) {
      console.error("Error adding row:", error);
      alert("Failed to add row. Please try again.");
    }
  };

  const handleAddColumn = async (index) => {
    const newColumnName = prompt("Enter column name:");
    console.log("Adding column at index:", index, "with name:", newColumnName);
    if (newColumnName) {
      try {
        const response = await transformDataset(datasetId, {
          operation_type: "addCol",
          col_params: { index, name: newColumnName },
        });
        console.log("Add column response:", response.data);
        updateTableData(response.data);
        const { columns, rows } = response.data;
        console.log("Columns from API data in add col:", columns);
        console.log("Rows from API data in add col:", rows);
        setColumns(["S.No.", ...columns]);
        setData(rows.map((row, index) => [index + 1, ...Object.values(row)]));
      } catch (error) {
        console.error("Error adding column:", error);
        alert("Failed to add column. Please try again.");
      }
    }
  };

  const handleDeleteRow = async (index) => {
    console.log("Deleting row at index:", index);
    try {
      const response = await transformDataset(datasetId, {
        operation_type: "delRow",
        row_params: { index },
      });
      console.log("Delete row response:", response.data);
      updateTableData(response.data);
      const { columns, rows } = response.data;
      console.log("Columns from API data in del col:", columns);
      console.log("Rows from API data in del row:", rows);
      setColumns(["S.No.", ...columns]);
      setData(rows.map((row, index) => [index + 1, ...Object.values(row)]));
    } catch (error) {
      console.error("Error deleting row:", error);
      alert("Failed to delete row. Please try again.");
    }
  };

  const handleDeleteColumn = async (index) => {
    console.log("Deleting column at index:", index);
    if (index === 0) {
      alert("Cannot delete the S.No. column.");
      return;
    }

    // the table has 0 indexed columns, but the API expects 1 indexed columns
     index-=1;
     console.log("Index for API:", index);
    try {
      const response = await transformDataset(datasetId, {
        operation_type: "delCol",
        row_params: { index },
      });
      console.log("Delete column response:", response.data);
      updateTableData(response.data);
      const { columns, rows } = response.data;
      console.log("Columns from API data in del col:", columns);
      console.log("Rows from API data in del row:", rows);
      setColumns(["S.No.", ...columns]);
      setData(rows.map((row, index) => [index + 1, ...Object.values(row)]));
    } catch (error) {
      console.error("Error deleting column:", error);
      alert("Failed to delete column. Please try again.");
    }
  };

  const handleEditCell = async (rowIndex, cellIndex, newValue) => {
    console.log(
      `Editing cell at rowIndex: ${rowIndex}, cellIndex: ${cellIndex} with newValue: ${newValue}`
    );
    try {
      const response = await transformDataset(datasetId, {
        operation_type: "changeCellValue",
        change_cell_value: {
          col_index: cellIndex, // The column index that you want to fill
          row_index: rowIndex, // The column index that you want to fill
          fill_value: newValue, // The value you want to use to fill the NaNs
        },
      });
      console.log("Edit cell response:", response.data);
      updateTableData(response.data);
      setEditingCell(null);
      setEditValue("");
      const { columns, rows } = response.data;
      console.log("Columns from API data in add col:", columns);
      console.log("Rows from API data in add col:", rows);
      setColumns(["S.No.", ...columns]);
      setData(rows.map((row, index) => [index + 1, ...Object.values(row)]));
    } catch (error) {
      console.error("Error editing cell:", error);
      alert("Failed to edit cell. Please try again.");
    }
  };


  const handleCellClick = (rowIndex, cellIndex, cellValue) => {
    console.log(
      `Cell clicked at rowIndex: ${rowIndex}, cellIndex: ${cellIndex}, value: ${cellValue}`
    );
    if (cellIndex !== 0) {
      setEditingCell({ rowIndex, cellIndex });
      setEditValue(cellValue);
    }
  };

  const handleInputChange = (e) => {
    console.log("Input value changed:", e.target.value);
    setEditValue(e.target.value);
  };

  const handleInputKeyDown = (e, rowIndex, cellIndex) => {
    console.log("Key pressed in input:", e.key);
    if (e.key === "Enter") {
      handleEditCell(rowIndex, cellIndex, editValue);
    } else if (e.key === "Escape") {
      setEditingCell(null);
      setEditValue("");
    }
  };

  const handleRightClick = (
    event,
    rowIndex = null,
    columnIndex = null,
    type = null
  ) => {
    event.preventDefault();
    console.log(
      `Right-clicked on ${type} at rowIndex: ${rowIndex}, columnIndex: ${columnIndex}`
    );
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
    console.log("Closing context menu");
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
    console.log("Updating table data with:", newData);
    setColumns(newData.columns);
    setData(newData.rows);
  };

  return (
    <div className="container mx-auto p-4" onClick={handleCloseContextMenu}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-black">Data Table</h1>
      </div>

      <div className="max-h-[500px] overflow-x-scroll overflow-y-auto border border-gray-300 rounded-lg shadow">
        <table className="min-w-full bg-white">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              {columns.map((column, columnIndex) => (
                <th
                  key={columnIndex}
                  className="py-2 px-4 border-b border-gray-300 text-left text-sm font-semibold text-gray-700"
                  onContextMenu={(e) =>
                    handleRightClick(e, null, columnIndex, "column")
                  }
                >
                  <button
                    className="w-full text-left bg-blue-100 hover:bg-blue-200 text-blue-700 py-1 px-2 rounded transition duration-300"
                    onClick={() => console.log(`Column ${column} clicked`)}
                  >
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
                className="hover:bg-gray-50 transition duration-300"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="py-2 px-4 border-b border-gray-300 text-sm  text-black"
                    onContextMenu={(e) =>
                      handleRightClick(e, rowIndex, null, "row")
                    }
                  >
                    {editingCell &&
                    editingCell.rowIndex === rowIndex &&
                    editingCell.cellIndex === cellIndex ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={handleInputChange}
                        onBlur={() =>
                          handleEditCell(rowIndex, cellIndex, editValue)
                        }
                        onKeyDown={(e) =>
                          handleInputKeyDown(e, rowIndex, cellIndex)
                        }
                        // autoFocus
                        className="w-full p-1 border border-blue-300 rounded"
                      />
                    ) : (
                      <div
                        onClick={() =>
                          handleCellClick(rowIndex, cellIndex, cell)
                        }
                        className={
                          cellIndex !== 0
                            ? "cursor-pointer hover:bg-blue-100 p-1 rounded"
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

      {contextMenu.visible && contextMenu.type === "column" && (
        <div
          className="absolute bg-white border border-gray-300 rounded shadow-lg p-2"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="block w-full text-left text-sm text-blue-700 py-1 px-2 hover:bg-blue-100 rounded transition duration-300"
            onClick={() => handleAddColumn(contextMenu.columnIndex)}
          >
            Add Column
          </button>
          <button
            className="block w-full text-left text-sm text-blue-700 py-1 px-2 hover:bg-blue-100 rounded transition duration-300"
            onClick={() => handleDeleteColumn(contextMenu.columnIndex)}
          >
            Delete Column
          </button>
        </div>
      )}

      {contextMenu.visible && contextMenu.type === "row" && (
        <div
          className="absolute bg-white border border-gray-300 rounded shadow-lg p-2"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="block w-full text-left text-sm text-blue-700 py-1 px-2 hover:bg-blue-100 rounded transition duration-300"
            onClick={() => handleAddRow(contextMenu.rowIndex)}
          >
            Add Row
          </button>
          <button
            className="block w-full text-left text-sm text-blue-700 py-1 px-2 hover:bg-blue-100 rounded transition duration-300"
            onClick={() => handleDeleteRow(contextMenu.rowIndex)}
          >
            Delete Row
          </button>
        </div>
      )}
    </div>
  );
};

Table.propTypes = {
  datasetId: proptypes.string.isRequired,
  data: proptypes.shape({
    columns: proptypes.arrayOf(proptypes.string),
    rows: proptypes.arrayOf(proptypes.arrayOf(proptypes.string)),
  }),
};

export default Table;
