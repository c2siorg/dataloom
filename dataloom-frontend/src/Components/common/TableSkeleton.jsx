/**
 * Skeleton loader for tables with pulse animation.
 * Provides visual placeholder for loading table data.
 * @param {Object} props
 * @param {number} [props.rows=5] - Number of skeleton rows to display
 * @param {number} [props.columns=5] - Number of skeleton columns to display
 */
export default function TableSkeleton({ rows = 5, columns = 5 }) {
    return (
        <div className="px-8 pt-3">
            <div
                className="overflow-x-scroll overflow-y-auto border border-gray-200 rounded-lg shadow-sm"
                style={{ maxHeight: "calc(100vh - 140px)" }}
            >
                <table className="min-w-full bg-white">
                    <thead className="sticky top-0 bg-gray-50">
                        <tr>
                            {Array(columns)
                                .fill(0)
                                .map((_, idx) => (
                                    <th
                                        key={idx}
                                        className="py-1.5 px-3 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                    >
                                        <div className="h-4 bg-gray-200 rounded animate-pulse" />
                                    </th>
                                ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Array(rows)
                            .fill(0)
                            .map((_, rowIdx) => (
                                <tr
                                    key={rowIdx}
                                    className="border-b border-gray-100"
                                >
                                    {Array(columns)
                                        .fill(0)
                                        .map((_, colIdx) => (
                                            <td
                                                key={colIdx}
                                                className="py-1 px-3"
                                            >
                                                <div className="h-4 bg-gray-100 rounded animate-pulse" />
                                            </td>
                                        ))}
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
