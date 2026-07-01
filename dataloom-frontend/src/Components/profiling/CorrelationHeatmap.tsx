import { useMemo, useState } from "react";
import type { Correlation } from "../../api/profiling";

interface CorrelationHeatmapProps {
  correlation: Correlation | null;
  /** True when the correlation fetch failed; takes precedence over loading. */
  error?: boolean;
  onRetry?: () => void;
}

const NEGATIVE: [number, number, number] = [37, 99, 235]; // blue-600
const POSITIVE: [number, number, number] = [220, 38, 38]; // red-600

/**
 * Diverging Pearson scale: −1 → blue, 0 → white, +1 → red. The mix factor is
 * |value|, so the colour saturates toward the extremes and washes out near zero.
 */
function cellColor(value: number): string {
  const magnitude = Math.min(Math.abs(value), 1);
  const [r, g, b] = value < 0 ? NEGATIVE : POSITIVE;
  const mix = (channel: number) => Math.round(255 + (channel - 255) * magnitude);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** Strong cells need light text to stay legible against the saturated fill. */
function textColor(value: number): string {
  return Math.abs(value) > 0.55 ? "#ffffff" : "#374151"; // gray-700
}

/** Colour the bare value text by magnitude so near-zero numbers read as muted. */
function valueTextColor(value: number): string {
  if (Math.abs(value) < 0.2) return "#6b7280"; // gray-500
  return value < 0 ? "#2563eb" : "#dc2626";
}

/** Round to 2 decimals and drop trailing zeros; null → "—". */
function fmt(value: number | null): string {
  if (value == null) return "—";
  return Number(value.toFixed(2)).toString();
}

/** Plain-language strength + direction for a correlation coefficient. */
function describe(value: number): string {
  const magnitude = Math.abs(value);
  const direction = value > 0 ? "positive" : "negative";
  if (magnitude >= 0.7) return `strong ${direction}`;
  if (magnitude >= 0.4) return `moderate ${direction}`;
  if (magnitude >= 0.2) return `weak ${direction}`;
  return "negligible";
}

interface Pair {
  a: string;
  b: string;
  r: number;
}

/**
 * Reduce the raw correlation payload to the parts worth showing: the columns
 * that actually have variance (a constant/all-null numeric column correlates to
 * NaN with everything, including itself), the sub-matrix over them, and the
 * pairwise list ranked by |r|. Dead columns are surfaced separately rather than
 * filling the grid with em dashes.
 */
function useDerived(correlation: Correlation | null) {
  return useMemo(() => {
    const columns = correlation?.columns ?? [];
    const matrix = correlation?.matrix ?? [];

    const activeColumns: string[] = [];
    const activeIdx: number[] = [];
    const excludedColumns: string[] = [];
    columns.forEach((col, i) => {
      // A self-correlation only exists when the column has variance.
      if (matrix[i]?.[i] != null) {
        activeColumns.push(col);
        activeIdx.push(i);
      } else {
        excludedColumns.push(col);
      }
    });

    const subMatrix: (number | null)[][] = activeIdx.map((i) =>
      activeIdx.map((j) => matrix[i]?.[j] ?? null),
    );

    const pairs: Pair[] = [];
    for (let i = 0; i < activeColumns.length; i++) {
      const row = subMatrix[i];
      const a = activeColumns[i];
      if (!row || a === undefined) continue;
      for (let j = 0; j < i; j++) {
        const r = row[j];
        const b = activeColumns[j];
        if (r != null && b !== undefined) pairs.push({ a, b, r });
      }
    }
    pairs.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));

    return { activeColumns, excludedColumns, subMatrix, pairs };
  }, [correlation]);
}

function ExcludedNote({ columns }: { columns: string[] }) {
  if (columns.length === 0) return null;
  const noun = columns.length === 1 ? "column" : "columns";
  return (
    <p data-testid="excluded-note" className="mb-3 text-xs text-gray-400">
      {columns.length} numeric {noun} excluded (no variance): {columns.join(", ")}
    </p>
  );
}

/** Ranked list of the strongest pairwise relationships — the insight-first view. */
function HighlightsView({ pairs }: { pairs: Pair[] }) {
  if (pairs.length === 0) {
    return <p className="py-4 text-center text-sm text-gray-500">No correlations to rank.</p>;
  }

  const strongest = pairs[0];
  const negligible = strongest != null && Math.abs(strongest.r) < 0.2;

  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">
        Strongest linear relationships between numeric columns (Pearson, −1 to +1).
        {negligible && " No strong correlations in this dataset — the strongest are shown below."}
      </p>
      <ul data-testid="highlights-list" className="divide-y divide-gray-100">
        {pairs.slice(0, 10).map(({ a, b, r }) => (
          <li key={`${a}|${b}`} className="flex items-center gap-3 py-2">
            <span
              className="h-4 w-4 shrink-0 rounded border border-gray-200"
              style={{ background: cellColor(r) }}
            />
            <span className="truncate text-sm text-gray-700">
              <span className="font-medium">{a}</span>
              <span className="mx-1.5 text-gray-400">↔</span>
              <span className="font-medium">{b}</span>
            </span>
            <span
              className="ml-auto tabular-nums text-sm font-semibold"
              style={{ color: valueTextColor(r) }}
            >
              {fmt(r)}
            </span>
            <span className="w-28 text-right text-xs text-gray-400">{describe(r)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Cleaned-up grid: lower triangle only (the matrix is symmetric), a muted
 * identity diagonal instead of a screaming red one, a colour legend, and a
 * crosshair that names the hovered pair in a readable caption.
 */
function MatrixView({ columns, subMatrix }: { columns: string[]; subMatrix: (number | null)[][] }) {
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null);
  const hoveredValue = hovered != null ? (subMatrix[hovered.row]?.[hovered.col] ?? null) : null;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
        <span>−1</span>
        <span
          className="h-2 w-32 rounded"
          style={{
            background: `linear-gradient(to right, rgb(${NEGATIVE.join(",")}), #ffffff, rgb(${POSITIVE.join(",")}))`,
          }}
        />
        <span>+1</span>
        <span className="ml-1">blue = negative, red = positive</span>
      </div>

      <div className="mb-1 h-5 text-xs text-gray-600" data-testid="matrix-caption">
        {hovered != null && hoveredValue != null && (
          <>
            <span className="font-medium">{columns[hovered.row]}</span>
            <span className="mx-1 text-gray-400">↔</span>
            <span className="font-medium">{columns[hovered.col]}</span>
            {": "}
            <span className="font-semibold">{fmt(hoveredValue)}</span>{" "}
            <span className="text-gray-400">({describe(hoveredValue)})</span>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table
          className="border-collapse text-xs"
          data-testid="correlation-table"
          onMouseLeave={() => setHovered(null)}
        >
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white" />
              {columns.map((col, j) => (
                <th
                  key={col}
                  className={`px-2 py-1 align-bottom font-medium ${
                    hovered?.col === j ? "text-gray-900" : "text-gray-500"
                  }`}
                  title={col}
                >
                  <span className="block max-w-[5rem] truncate">{col}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columns.map((rowCol, i) => {
              const row = subMatrix[i] ?? [];
              return (
                <tr key={rowCol}>
                  <th
                    className={`sticky left-0 z-10 bg-white py-1 pr-2 text-right font-medium whitespace-nowrap ${
                      hovered?.row === i ? "text-gray-900" : "text-gray-500"
                    }`}
                    title={rowCol}
                  >
                    <span className="block max-w-[8rem] truncate">{rowCol}</span>
                  </th>
                  {columns.map((colCol, j) => {
                    // Upper triangle is the mirror image — leave it blank.
                    if (j > i) {
                      return <td key={colCol} className="border border-white" />;
                    }
                    // Identity diagonal: present but deliberately muted.
                    if (j === i) {
                      return (
                        <td
                          key={colCol}
                          className="border border-white bg-gray-50 px-2 py-1 text-center text-gray-300"
                        >
                          1
                        </td>
                      );
                    }
                    const value = row[j] ?? null;
                    const isHover = hovered?.row === i && hovered?.col === j;
                    return (
                      <td
                        key={colCol}
                        onMouseEnter={() => setHovered({ row: i, col: j })}
                        className={`cursor-default border border-white px-2 py-1 text-center tabular-nums ${
                          isHover ? "ring-2 ring-inset ring-gray-900/50" : ""
                        }`}
                        style={
                          value == null
                            ? { background: "#f3f4f6", color: "#9ca3af" }
                            : { background: cellColor(value), color: textColor(value) }
                        }
                        title={`${rowCol} × ${colCol}: ${fmt(value)}`}
                      >
                        {fmt(value)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "highlights" | "matrix";
  onChange: (view: "highlights" | "matrix") => void;
}) {
  const base = "px-3 py-1 text-xs font-medium rounded-md transition-colors";
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
      <button
        type="button"
        onClick={() => onChange("highlights")}
        className={`${base} ${view === "highlights" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
      >
        Highlights
      </button>
      <button
        type="button"
        onClick={() => onChange("matrix")}
        className={`${base} ${view === "matrix" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
      >
        Matrix
      </button>
    </div>
  );
}

/**
 * Pairwise Pearson correlation over the dataset's numeric columns. Embedded in
 * the Charts tab as one of the visualizations. Defaults to the full
 * lower-triangular heatmap grid (what "heatmap" implies); a "Highlights" toggle
 * shows a ranked list of the strongest pairs for a quick read.
 */
export default function CorrelationHeatmap({
  correlation,
  error = false,
  onRetry,
}: CorrelationHeatmapProps) {
  const [view, setView] = useState<"highlights" | "matrix">("matrix");
  const { activeColumns, excludedColumns, subMatrix, pairs } = useDerived(correlation);

  const ready = !error && correlation != null && activeColumns.length >= 2;

  return (
    <div data-testid="correlation-heatmap-panel" className="relative">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-gray-700">Correlation</h4>
        {ready && <ViewToggle view={view} onChange={setView} />}
      </div>

      {error ? (
        <div className="py-4 text-center text-sm text-gray-500">
          <p>Couldn’t load the correlation matrix.</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 font-medium text-blue-600 hover:text-blue-800"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
            >
              Retry
            </button>
          )}
        </div>
      ) : !correlation ? (
        <div className="py-4 text-center text-sm text-gray-500">Loading correlation…</div>
      ) : activeColumns.length < 2 ? (
        <>
          <ExcludedNote columns={excludedColumns} />
          <div className="py-4 text-center text-sm text-gray-500">
            Correlation needs at least two numeric columns with variance.
          </div>
        </>
      ) : (
        <>
          <ExcludedNote columns={excludedColumns} />
          {view === "highlights" ? (
            <HighlightsView pairs={pairs} />
          ) : (
            <MatrixView columns={activeColumns} subMatrix={subMatrix} />
          )}
        </>
      )}
    </div>
  );
}
