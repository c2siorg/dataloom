import PropTypes from "prop-types";

const TransformResultPreview = ({ columns, rows }) => {
  if (!rows || rows.length === 0) {
    return <p className="text-gray-500 mt-4 text-xs font-medium">No data available</p>;
  }

  if (!columns || columns.length === 0) {
    return <p className="text-gray-500 mt-4 text-xs font-medium">No columns available</p>;
  }

  const displayColumns = ["S.No.", ...columns];
  const displayRows = rows.map((row, index) => [index + 1, ...row]);

  return (
    <div className="mt-2 border border-gray-200 rounded-lg shadow-sm overflow-hidden bg-white">
      <div className="overflow-x-auto overflow-y-auto max-h-72">
        <table className="min-w-full bg-white border-collapse">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr>
              {displayColumns.map((col, index) => (
                <th
                  key={index}
                  className="py-1.5 px-3 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  <button className="w-full text-left text-gray-500 hover:text-gray-700 hover:bg-gray-100 py-0.5 px-1.5 rounded-md transition-colors duration-150">
                    {col}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {displayRows.map((row, rowIndex) => (
              <tr 
                key={rowIndex} 
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="py-1 px-3 text-xs text-gray-700 whitespace-nowrap"
                  >
                    {String(cell)}
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
  rows: PropTypes.arrayOf(PropTypes.array).isRequired,
};

export default TransformResultPreview;
