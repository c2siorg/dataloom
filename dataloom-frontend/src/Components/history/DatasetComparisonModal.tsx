import { useEffect, useRef, useState } from "react";
import { compareCheckpoint, type DatasetComparison } from "../../api";
import Button from "../common/Button";
import Modal from "../common/Modal";

interface DatasetComparisonModalProps {
  projectId: string;
  checkpointId: string | null;
  currentColumns: string[];
  onClose: () => void;
}

const PAGE_SIZE = 50;

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function DatasetComparisonModal({
  projectId,
  checkpointId,
  currentColumns = [],
  onClose,
}: DatasetComparisonModalProps) {
  const [comparison, setComparison] = useState<DatasetComparison | null>(null);
  const [rowPage, setRowPage] = useState(1);
  const [cellPage, setCellPage] = useState(1);
  const [matchColumn, setMatchColumn] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!checkpointId) {
      requestId.current += 1;
      setComparison(null);
      setRowPage(1);
      setCellPage(1);
      setMatchColumn("");
      setLoading(false);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const loadComparison = async () => {
      try {
        const result = await compareCheckpoint(projectId, checkpointId, {
          rowPage,
          cellPage,
          pageSize: PAGE_SIZE,
          matchColumn: matchColumn || undefined,
          signal: controller.signal,
        });
        if (requestId.current === id) setComparison(result);
      } catch (err: unknown) {
        if (requestId.current !== id || controller.signal.aborted) return;
        const apiError = err as { response?: { data?: { detail?: string } }; message?: string };
        setError(
          apiError.response?.data?.detail ||
            "Unable to compare this checkpoint with the current dataset.",
        );
      } finally {
        if (requestId.current === id) setLoading(false);
      }
    };

    void loadComparison();

    return () => controller.abort();
  }, [projectId, checkpointId, rowPage, cellPage, matchColumn]);

  const commonColumns = comparison
    ? currentColumns.filter((column) => !comparison.columns.added.includes(column))
    : [];

  const changeMatchColumn = (value: string) => {
    setMatchColumn(value);
    setRowPage(1);
    setCellPage(1);
  };

  const pageControls = (
    kind: "row" | "cell",
    page: number,
    totalPages: number,
    setPage: (page: number) => void,
  ) =>
    totalPages > 1 && (
      <nav
        aria-label={`${kind === "row" ? "Row changes" : "Cell changes"} pagination`}
        className="flex items-center justify-between border-t border-app-border pt-3"
      >
        <p className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={page <= 1 || loading}
            onClick={() => setPage(Math.max(1, page - 1))}
            aria-label={`Previous ${kind} changes page`}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= totalPages || loading}
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            aria-label={`Next ${kind} changes page`}
          >
            Next
          </Button>
        </div>
      </nav>
    );

  return (
    <Modal
      isOpen={!!checkpointId}
      onClose={onClose}
      title="Dataset Comparison"
      className="max-w-5xl"
    >
      <div className="space-y-5">
        <label className="flex flex-col gap-2 text-sm text-foreground">
          Match rows by
          <select
            aria-label="Match rows by"
            className="rounded-md border border-app-border bg-surface px-3 py-2"
            value={matchColumn}
            onChange={(event) => changeMatchColumn(event.target.value)}
            disabled={loading && !comparison}
          >
            <option value="">Position (default)</option>
            {commonColumns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </label>

        {loading && (
          <p role="status" className="py-6 text-center text-sm text-muted-foreground">
            Comparing checkpoint with the current dataset...
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {comparison && !error && (
          <div className={`space-y-5 ${loading ? "opacity-60" : ""}`}>
            <section
              aria-labelledby="comparison-summary"
              className="rounded-lg border border-app-border p-4"
            >
              <h3 id="comparison-summary" className="text-sm font-semibold text-foreground">
                Comparison Summary
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Matching strategy: {comparison.matching_strategy}
              </p>
              <p className="mt-2 text-sm text-foreground">
                {comparison.total_rows} row changes · {comparison.total_cells} changed cells
              </p>
            </section>

            {(comparison.columns.added.length > 0 ||
              comparison.columns.removed.length > 0 ||
              comparison.columns.dtype_changed.length > 0) && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Column Changes</h3>
                <ul className="space-y-1 text-sm text-foreground">
                  {comparison.columns.added.map((column) => (
                    <li key={`added-${column}`}>Added: {column}</li>
                  ))}
                  {comparison.columns.removed.map((column) => (
                    <li key={`removed-${column}`}>Removed: {column}</li>
                  ))}
                  {comparison.columns.dtype_changed.map((change) => (
                    <li key={`dtype-${change.name}`}>
                      {change.name}: {change.before} → {change.after}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="row-changes-heading" className="space-y-3">
              <h3 id="row-changes-heading" className="text-sm font-semibold text-foreground">
                Row Changes ({comparison.total_rows})
              </h3>
              {comparison.rows.length ? (
                <ul className="space-y-1 text-sm text-foreground">
                  {comparison.rows.map((row, index) => (
                    <li key={`${row.type}-${row.checkpoint_index}-${row.current_index}-${index}`}>
                      {row.type} row {renderValue(row.row)} (checkpoint index{" "}
                      {renderValue(row.checkpoint_index)}, current index{" "}
                      {renderValue(row.current_index)})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No row changes on this page.</p>
              )}
              {pageControls("row", comparison.row_page, comparison.total_row_pages, setRowPage)}
            </section>

            <section aria-labelledby="cell-changes-heading" className="space-y-3">
              <h3 id="cell-changes-heading" className="text-sm font-semibold text-foreground">
                Cell Changes ({comparison.total_cells})
              </h3>
              {comparison.cells.length ? (
                <div className="overflow-x-auto rounded-lg border border-app-border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-surface-hover">
                      <tr>
                        <th className="px-3 py-2 text-left">Row</th>
                        <th className="px-3 py-2 text-left">Column</th>
                        <th className="px-3 py-2 text-left">Checkpoint</th>
                        <th className="px-3 py-2 text-left">Current</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.cells.map((cell, index) => (
                        <tr
                          key={`${renderValue(cell.row)}-${cell.column}-${index}`}
                          className="border-t border-app-border"
                        >
                          <td className="px-3 py-2">{renderValue(cell.row)}</td>
                          <td className="px-3 py-2">{cell.column}</td>
                          <td className="px-3 py-2">{renderValue(cell.checkpoint_value)}</td>
                          <td className="px-3 py-2">{renderValue(cell.current_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No cell changes on this page.</p>
              )}
              {pageControls("cell", comparison.cell_page, comparison.total_cell_pages, setCellPage)}
            </section>

            {comparison.total_rows === 0 &&
              comparison.total_cells === 0 &&
              comparison.columns.added.length === 0 &&
              comparison.columns.removed.length === 0 &&
              comparison.columns.dtype_changed.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No differences found.
                </p>
              )}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close comparison
          </Button>
        </div>
      </div>
    </Modal>
  );
}
