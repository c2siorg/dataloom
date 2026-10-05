import { useState } from "react";
import {
  compareCheckpoint,
  deleteCheckpoint,
  type Checkpoint,
  type DatasetComparison,
} from "../../api";
import Modal from "../common/Modal";
import { useToast } from "../../context/ToastContext";
import Button from "../common/Button";
import EmptyState from "../common/EmptyState";

interface CheckpointsPanelProps {
  projectId: string;
  checkpoints?: Checkpoint[] | null;
  onRevert: (checkpointId: string) => void;
  onCheckpointDeleted: () => Promise<void> | void;
}

const PAGE_SIZE = 50;

const CheckpointsPanel = ({
  projectId,
  checkpoints,
  onRevert,
  onCheckpointDeleted,
}: CheckpointsPanelProps) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<DatasetComparison | null>(null);
  const [comparisonCheckpointId, setComparisonCheckpointId] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  const { showToast } = useToast();

  const hasCheckpoints = Array.isArray(checkpoints) && checkpoints.length > 0;

  const handleDeleteConfirm = async () => {
    try {
      if (!confirmDeleteId) return;

      await deleteCheckpoint(projectId, confirmDeleteId);
      showToast("Checkpoint deleted successfully", "success");
      await onCheckpointDeleted();
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handleCompare = async (checkpointId: string, page = 1) => {
    setCompareLoading(true);
    setCompareError(null);
    setComparisonCheckpointId(checkpointId);

    try {
      const result = await compareCheckpoint(projectId, checkpointId, page, PAGE_SIZE);

      setComparison(result);
    } catch (err) {
      console.error(err);
      setComparison(null);
      setCompareError("Unable to compare this checkpoint with the current dataset.");
    } finally {
      setCompareLoading(false);
    }
  };

  const closeComparison = () => {
    if (compareLoading) return;

    setComparison(null);
    setComparisonCheckpointId(null);
    setCompareError(null);
  };

  const handleComparisonPageChange = async (page: number) => {
    if (!comparisonCheckpointId || compareLoading) return;

    await handleCompare(comparisonCheckpointId, page);
  };

  const renderValue = (value: unknown) => {
    if (value === null || value === undefined) {
      return "—";
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  };

  return (
    <div data-testid="checkpoints-panel">
      <div className="overflow-x-auto">
        <table className="min-w-full bg-surface rounded-lg overflow-hidden">
          <thead className="bg-surface border-b border-app-border sticky top-0">
            <tr>
              <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Message
              </th>
              <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Created At
              </th>
              <th className="py-3 px-4 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {hasCheckpoints ? (
              checkpoints.map((checkpoint) => (
                <tr
                  key={checkpoint.id}
                  className="border-b border-app-border hover:bg-surface-hover transition-colors duration-150"
                >
                  <td className="py-3 px-4 text-sm text-foreground">{checkpoint.message}</td>

                  <td className="py-3 px-4 text-sm text-muted-foreground">
                    {new Date(checkpoint.created_at).toLocaleString()}
                  </td>

                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Button size="sm" onClick={() => handleCompare(checkpoint.id)}>
                        Compare
                      </Button>

                      <Button size="sm" onClick={() => onRevert(checkpoint.id)}>
                        Revert
                      </Button>

                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setConfirmDeleteId(checkpoint.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3}>
                  <EmptyState variant="inline" title="No checkpoints available" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete Checkpoint"
      >
        <p className="text-foreground text-sm mb-6">
          Are you sure you want to delete this checkpoint? This action cannot be undone.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>
            Cancel
          </Button>

          <Button variant="danger" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={!!comparison || compareLoading || !!compareError}
        onClose={closeComparison}
        title="Dataset Comparison"
      >
        {compareLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Comparing checkpoint with the current dataset...
          </div>
        ) : compareError ? (
          <div className="py-6">
            <p className="text-sm text-destructive">{compareError}</p>

            <div className="flex justify-end mt-6">
              <Button variant="secondary" onClick={closeComparison}>
                Close
              </Button>
            </div>
          </div>
        ) : comparison ? (
          <div className="space-y-6">
            <div className="rounded-lg border border-app-border p-4">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Comparison Summary</h3>

                  <p className="text-xs text-muted-foreground mt-1">
                    Matching strategy: {comparison.matching_strategy}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-md bg-surface-hover p-3">
                  <p className="text-xs text-muted-foreground">Checkpoint Rows</p>
                  <p className="text-lg font-semibold text-foreground">
                    {comparison.summary.checkpoint_rows}
                  </p>
                </div>

                <div className="rounded-md bg-surface-hover p-3">
                  <p className="text-xs text-muted-foreground">Current Rows</p>
                  <p className="text-lg font-semibold text-foreground">
                    {comparison.summary.current_rows}
                  </p>
                </div>

                <div className="rounded-md bg-surface-hover p-3">
                  <p className="text-xs text-muted-foreground">Added Rows</p>
                  <p className="text-lg font-semibold text-foreground">
                    {comparison.summary.added_rows}
                  </p>
                </div>

                <div className="rounded-md bg-surface-hover p-3">
                  <p className="text-xs text-muted-foreground">Removed Rows</p>
                  <p className="text-lg font-semibold text-foreground">
                    {comparison.summary.removed_rows}
                  </p>
                </div>

                <div className="rounded-md bg-surface-hover p-3">
                  <p className="text-xs text-muted-foreground">Changed Cells</p>
                  <p className="text-lg font-semibold text-foreground">
                    {comparison.summary.changed_cells}
                  </p>
                </div>

                <div className="rounded-md bg-surface-hover p-3">
                  <p className="text-xs text-muted-foreground">Affected Rows</p>
                  <p className="text-lg font-semibold text-foreground">
                    {comparison.summary.affected_rows}
                  </p>
                </div>

                <div className="rounded-md bg-surface-hover p-3">
                  <p className="text-xs text-muted-foreground">Affected Columns</p>
                  <p className="text-lg font-semibold text-foreground">
                    {comparison.summary.affected_columns}
                  </p>
                </div>

                <div className="rounded-md bg-surface-hover p-3">
                  <p className="text-xs text-muted-foreground">Columns</p>
                  <p className="text-lg font-semibold text-foreground">
                    {comparison.summary.current_columns}
                  </p>
                </div>
              </div>
            </div>

            {comparison.matching_strategy === "positional" && (
              <div className="rounded-lg border border-app-border p-4">
                <p className="text-sm font-medium text-foreground">Positional row matching</p>

                <p className="text-xs text-muted-foreground mt-1">
                  Rows are matched by their position because no identifier column was selected.
                  Reordered rows may therefore appear as changed cells.
                </p>
              </div>
            )}

            {(comparison.columns.added.length > 0 ||
              comparison.columns.removed.length > 0 ||
              comparison.columns.dtype_changed.length > 0) && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Column Changes</h3>

                <div className="overflow-x-auto border border-app-border rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-surface-hover">
                      <tr>
                        <th className="py-2 px-3 text-left">Change</th>
                        <th className="py-2 px-3 text-left">Column</th>
                        <th className="py-2 px-3 text-left">Before</th>
                        <th className="py-2 px-3 text-left">After</th>
                      </tr>
                    </thead>

                    <tbody>
                      {comparison.columns.added.map((column) => (
                        <tr key={`added-${column}`} className="border-t border-app-border">
                          <td className="py-2 px-3 text-foreground">Added</td>
                          <td className="py-2 px-3 text-foreground">{column}</td>
                          <td className="py-2 px-3 text-muted-foreground">—</td>
                          <td className="py-2 px-3 text-foreground">—</td>
                        </tr>
                      ))}

                      {comparison.columns.removed.map((column) => (
                        <tr key={`removed-${column}`} className="border-t border-app-border">
                          <td className="py-2 px-3 text-foreground">Removed</td>
                          <td className="py-2 px-3 text-foreground">{column}</td>
                          <td className="py-2 px-3 text-foreground">—</td>
                          <td className="py-2 px-3 text-muted-foreground">—</td>
                        </tr>
                      ))}

                      {comparison.columns.dtype_changed.map((change) => (
                        <tr key={`dtype-${change.name}`} className="border-t border-app-border">
                          <td className="py-2 px-3 text-foreground">Type changed</td>
                          <td className="py-2 px-3 text-foreground">{change.name}</td>
                          <td className="py-2 px-3 text-foreground">{change.before}</td>
                          <td className="py-2 px-3 text-foreground">{change.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {comparison.rows.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Row Changes</h3>

                <div className="overflow-x-auto border border-app-border rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-surface-hover">
                      <tr>
                        <th className="py-2 px-3 text-left">Change</th>
                        <th className="py-2 px-3 text-left">Row</th>
                        <th className="py-2 px-3 text-left">Checkpoint Index</th>
                        <th className="py-2 px-3 text-left">Current Index</th>
                      </tr>
                    </thead>

                    <tbody>
                      {comparison.rows.map((row, index) => (
                        <tr
                          key={`${row.type}-${row.checkpoint_index}-${row.current_index}-${index}`}
                          className="border-t border-app-border"
                        >
                          <td className="py-2 px-3 text-foreground">{row.type}</td>
                          <td className="py-2 px-3 text-foreground">{renderValue(row.row)}</td>
                          <td className="py-2 px-3 text-foreground">
                            {renderValue(row.checkpoint_index)}
                          </td>
                          <td className="py-2 px-3 text-foreground">
                            {renderValue(row.current_index)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {comparison.cells.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Changed Cells</h3>

                <div className="overflow-x-auto border border-app-border rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-surface-hover">
                      <tr>
                        <th className="py-2 px-3 text-left">Row</th>
                        <th className="py-2 px-3 text-left">Column</th>
                        <th className="py-2 px-3 text-left">Checkpoint</th>
                        <th className="py-2 px-3 text-left">Current</th>
                      </tr>
                    </thead>

                    <tbody>
                      {comparison.cells.map((cell, index) => (
                        <tr
                          key={`${renderValue(cell.row)}-${cell.column}-${index}`}
                          className="border-t border-app-border"
                        >
                          <td className="py-2 px-3 text-foreground">{renderValue(cell.row)}</td>
                          <td className="py-2 px-3 text-foreground">{cell.column}</td>
                          <td className="py-2 px-3 text-foreground">
                            {renderValue(cell.checkpoint_value)}
                          </td>
                          <td className="py-2 px-3 text-foreground">
                            {renderValue(cell.current_value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              comparison.rows.length === 0 &&
              comparison.columns.added.length === 0 &&
              comparison.columns.removed.length === 0 &&
              comparison.columns.dtype_changed.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-foreground">No differences found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The current dataset matches this checkpoint.
                  </p>
                </div>
              )
            )}

            {comparison.total_pages > 1 && (
              <div className="flex items-center justify-between border-t border-app-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Page {comparison.page} of {comparison.total_pages}
                </p>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={comparison.page <= 1 || compareLoading}
                    onClick={() => handleComparisonPageChange(comparison.page - 1)}
                  >
                    Previous
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={comparison.page >= comparison.total_pages || compareLoading}
                    onClick={() => handleComparisonPageChange(comparison.page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="secondary" onClick={closeComparison}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default CheckpointsPanel;
