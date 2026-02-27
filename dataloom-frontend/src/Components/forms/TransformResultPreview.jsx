import PropTypes from "prop-types";

const TransformResultPreview = ({ columns, rows }) => {
  if (!rows || rows.length === 0) {
    return <p className="text-gray-500 mt-4">No data available</p>;
  }

  if (!columns || columns.length === 0) {
    return <p className="text-gray-500 mt-4">No columns available</p>;
  }

  return (
    <div className="p-4 mt-4 border border-gray-200 rounded-lg bg-gray-50">
      <h4 className="font-medium text-sm text-gray-700 mb-2">API Response:</h4>
      <div
        className="overflow-x-scroll overflow-y-auto border border-gray-200 rounded-lg shadow-sm"
        style={{ maxHeight: "calc(100vh - 140px)" }}
      >
        <table className="min-w-full bg-white">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col, index) => (
                <th
                  key={index}
                  className="py-1.5 px-3 border-b border-gray-200 text-left text-sm font-medium text-gray-500 uppercase tracking-wider"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="py-1 px-3 text-sm text-gray-700"
                  >
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
  rows: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.string)).isRequired,
};

export default TransformResultPreview;
