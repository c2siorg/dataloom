import PropTypes from "prop-types";

const TransformResultPreview = ({ columns, rows }) => {
  if (!rows || rows.length === 0) {
    return <p className="text-gray-500 mt-4">No data available</p>;
  }

  if (!columns || columns.length === 0) {
    return <p className="text-gray-500 mt-4">No columns available</p>;
  }

  const sNoColumnKey = "__row_number";
  const hasRowNumber = columns[0] === sNoColumnKey;
  const displayColumns = hasRowNumber ? columns.slice(1) : columns;
  const displayRows = hasRowNumber ? rows.map((row) => row.slice(1)) : rows;
  const sNoValues = hasRowNumber ? rows.map((row) => row[0]) : rows.map((_, index) => index + 1);

  return (
    <div className="p-4 mt-4 border border-gray-200 rounded-lg bg-gray-50">
      <h4 className="font-medium text-sm text-gray-700 mb-2">API Response:</h4>
      <div
        className="overflow-x-scroll overflow-y-auto border border-gray-200 rounded-lg shadow-sm"
        style={{ maxHeight: "calc(100vh - 140px)" }}
      >
        <table className="min-w-full bg-white">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              <th className="py-1.5 px-3 border-b border-gray-200 text-left text-xs font-medium text-gray-500">
                <button className="w-full text-left text-gray-500 hover:text-gray-700 hover:bg-gray-100 py-0.5 px-1.5 rounded-md transition-colors duration-150">
                  S.No.
                </button>
              </th>
              {displayColumns.map((col, index) => (
                <th
                  key={index}
                  className="py-1.5 px-3 border-b border-gray-200 text-left text-xs font-medium text-gray-500"
                >
                  <button className="w-full text-left text-gray-500 hover:text-gray-700 hover:bg-gray-100 py-0.5 px-1.5 rounded-md transition-colors duration-150">
                    {col}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150"
              >
                <td className="py-1 px-3 text-xs text-gray-700">
                  {sNoValues[rowIndex]}
                </td>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="py-1 px-3 text-xs text-gray-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

TransformResultPreview.propTypes = {
  columns: PropTypes.arrayOf(PropTypes.string).isRequired,
  rows: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.any)).isRequired,
};

export default TransformResultPreview;
