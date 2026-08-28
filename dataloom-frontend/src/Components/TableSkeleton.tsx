/** Number of data columns (excluding S.No.) when the real schema is not yet known. */
const FALLBACK_DATA_COLUMN_COUNT = 5;

interface TableSkeletonProps {
  /** Real data-column count, not including the leading S.No. column. */
  columnCount?: number;
  rowCount?: number;
}

function SkeletonBar({ className }: { className?: string }) {
  return <div className={`h-3 bg-surface-hover rounded w-3/4 ${className ?? ""}`} />;
}

/**
 * Placeholder table that mirrors DataSet header/body cell sizes to limit layout shift.
 */
export default function TableSkeleton({ columnCount = 0, rowCount = 10 }: TableSkeletonProps) {
  const dataColumnCount = columnCount > 0 ? columnCount : FALLBACK_DATA_COLUMN_COUNT;
  const totalColumns = dataColumnCount + 1;

  return (
    <table
      data-testid="data-table-skeleton"
      className="min-w-full bg-surface border-separate border-spacing-0 animate-pulse"
    >
      <thead className="sticky top-0 z-20 bg-surface">
        <tr>
          {Array.from({ length: totalColumns }, (_, columnIndex) => {
            const isSerialNumber = columnIndex === 0;
            return (
              <th
                key={`name-${columnIndex}`}
                className={`h-6 px-0.5 py-0 border-r border-app-border text-left ${
                  isSerialNumber ? "w-16 sticky left-0 z-10 bg-surface" : "bg-surface"
                }`}
              >
                <SkeletonBar />
              </th>
            );
          })}
        </tr>
        <tr>
          {Array.from({ length: totalColumns }, (_, columnIndex) => {
            const isSerialNumber = columnIndex === 0;
            return (
              <th
                key={`dtype-${columnIndex}`}
                className={`h-5 px-0.5 py-0 border-b border-r border-app-border text-left ${
                  isSerialNumber ? "w-16 sticky left-0 z-10 bg-surface" : "bg-surface"
                }`}
              >
                {!isSerialNumber ? <SkeletonBar className="w-1/2" /> : null}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowCount }, (_, rowIndex) => (
          <tr key={rowIndex} className="hover:bg-surface-hover transition-colors duration-150">
            {Array.from({ length: totalColumns }, (_, cellIndex) => (
              <td
                key={cellIndex}
                className={`h-6 px-0.5 py-0 border-b border-r border-app-border ${
                  cellIndex === 0 ? "w-16 sticky left-0 z-10 bg-surface" : ""
                }`}
              >
                <SkeletonBar className={cellIndex === 0 ? "mx-auto w-1/2" : ""} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
