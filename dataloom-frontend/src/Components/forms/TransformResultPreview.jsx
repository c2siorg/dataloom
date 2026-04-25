import PropTypes from "prop-types";

const TransformResultPreview = ({ columns, rows, embedded = false }) => {
  if (!rows || rows.length === 0) {
    return <p className="text-gray-500 mt-4 text-xs font-medium">No data available</p>;
  }

  if (!columns || columns.length === 0) {
    return <p className="text-gray-500 mt-4 text-xs font-medium">No columns available</p>;
  }

  const displayColumns = ["S.No.", ...columns];
  const displayRows = rows.map((row, index) => [index + 1, ...row]);
  const containerClassName = embedded
    ? "overflow-hidden border-t border-slate-200 bg-white mb-6"
    : "mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm mb-4";

  return (
    <div className={containerClassName}>
      <div className="overflow-x-auto overflow-y-auto max-h-72">
        <table className="min-w-full bg-white border-collapse">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr>
              {displayColumns.map((col, index) => (
                <th
                  key={index}
                  className={`py-2.5 border-b border-gray-200 text-sm font-semibold text-gray-600 uppercase tracking-tight whitespace-nowrap bg-gray-50 ${index === 0 ? "pl-4 pr-2 text-left" : "px-4 text-left"}`}
                >
                  <button
                    type="button"
                    className={`flex items-center gap-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 py-1 px-2 rounded-md transition-colors duration-150 ${index === 0 ? "text-left" : ""}`}
                    title={`Sort by ${col}`}
                  >
                    {col}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {displayRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-slate-50 transition-colors duration-150">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={`py-2 text-sm text-gray-700 whitespace-nowrap ${cellIndex === 0 ? "pl-4 pr-2 text-left" : "px-4 text-left"}`}
                  >
                    <div
                      className={
                        cellIndex !== 0
                          ? "p-1.5"
                          : "p-1.5 text-gray-400 font-mono text-xs text-left"
                      }
                    >
                      {String(cell)}
                    </div>
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
  embedded: PropTypes.bool,
  rows: PropTypes.arrayOf(
    PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.bool])),
  ).isRequired,
};

export default TransformResultPreview;
