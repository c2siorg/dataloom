/** Data columns drawn before the real schema is known. */
const FALLBACK_DATA_COLUMN_COUNT = 6;

interface TableSkeletonProps {
  /** Data-column count, excluding the leading S.No. column. */
  columnCount?: number;
  /** Placeholder rows to draw. */
  rowCount?: number;
  /** Draw the profile header row, matching the real grid's Columns toggle. */
  showColumnProfiles?: boolean;
}

const SkeletonBar = ({ className = "w-3/4" }: { className?: string }) => (
  <div className={`h-2 bg-surface-hover rounded ${className}`} />
);

/**
 * Placeholder grid shown while project data loads. Mirrors the row heights and
 * column count of the real table so the layout does not shift.
 */
export default function TableSkeleton({
  columnCount = 0,
  rowCount = 10,
  showColumnProfiles = false,
}: TableSkeletonProps) {
  const dataColumns = columnCount > 0 ? columnCount : FALLBACK_DATA_COLUMN_COUNT;
  const totalColumns = dataColumns + 1;
  const serialCell = "w-16 sticky left-0 z-10 bg-surface";

  return (
    <table
      data-testid="data-table-skeleton"
      aria-hidden="true"
      className="min-w-full bg-surface border-separate border-spacing-0 animate-pulse"
    >
      <thead className="sticky top-0 z-20 bg-surface">
        {showColumnProfiles && (
          <tr>
            {Array.from({ length: totalColumns }, (_, columnIndex) => (
              <th
                key={columnIndex}
                className={`align-top border-b border-r border-app-border ${
                  columnIndex === 0 ? serialCell : "bg-surface min-w-35"
                }`}
              >
                {columnIndex !== 0 && (
                  <div className="p-1.5 space-y-1">
                    <SkeletonBar className="w-full" />
                    <SkeletonBar />
                    <SkeletonBar className="w-1/2" />
                  </div>
                )}
              </th>
            ))}
          </tr>
        )}
        <tr>
          {Array.from({ length: totalColumns }, (_, columnIndex) => (
            <th
              key={columnIndex}
              className={`h-6 px-0.5 py-0 border-r border-app-border text-left ${
                columnIndex === 0 ? serialCell : "bg-surface"
              }`}
            >
              <SkeletonBar />
            </th>
          ))}
        </tr>
        <tr>
          {Array.from({ length: totalColumns }, (_, columnIndex) => (
            <th
              key={columnIndex}
              className={`h-5 px-0.5 py-0 border-b border-r border-app-border text-left ${
                columnIndex === 0 ? serialCell : "bg-surface"
              }`}
            >
              {columnIndex !== 0 && <SkeletonBar className="w-1/2" />}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowCount }, (_, rowIndex) => (
          <tr key={rowIndex}>
            {Array.from({ length: totalColumns }, (_, cellIndex) => (
              <td
                key={cellIndex}
                className={`h-6 px-0.5 py-0 border-b border-r border-app-border ${
                  cellIndex === 0 ? serialCell : ""
                }`}
              >
                <SkeletonBar className={cellIndex === 0 ? "w-1/2 mx-auto" : "w-3/4"} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
