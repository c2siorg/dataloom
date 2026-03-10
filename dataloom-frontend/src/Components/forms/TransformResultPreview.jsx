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
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-100">
          <tr>
            {columns.map((col, index) => (
              <th
                key={index}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
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
