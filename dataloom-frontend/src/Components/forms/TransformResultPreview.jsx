import PropTypes from "prop-types";

const TransformResultPreview = ({ columns, rows }) => {
  if (!rows || rows.length === 0) {
    return <p className="text-white">No data available</p>;
  }

  if (!columns || columns.length === 0) {
    return <p className="text-white">No columns available</p>;
  }

  return (
    <div className="p-4 mt-4 border border-blue-500 rounded bg-gray-800">
      <h4 className="font-bold mb-2">API Response:</h4>
      <table className="min-w-full divide-y divide-gray-700">
        <thead className="bg-gray-600">
          <tr>
            {columns.map((col, index) => (
              <th
                key={index}
                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-gray-800 divide-y divide-gray-700">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-300"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

TransformResultPreview.propTypes = {
  columns: PropTypes.arrayOf(PropTypes.string).isRequired,
  rows: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.string)).isRequired,
};

export default TransformResultPreview;
