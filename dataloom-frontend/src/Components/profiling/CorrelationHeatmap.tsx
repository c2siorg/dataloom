import { useMemo, useRef, useState } from "react";
import type { Correlation } from "../../api/profiling";
import DownloadImageButton from "../visualizations/DownloadImageButton";

interface CorrelationHeatmapProps {
  correlation: Correlation | null;
  /** True when the correlation fetch failed; takes precedence over loading. */
  error?: boolean;
  onRetry?: () => void;
}

const NEGATIVE: [number, number, number] = [37, 99, 235]; // blue-600
const POSITIVE: [number, number, number] = [220, 38, 38]; // red-600
// Theme tokens from index.css. The `.dark` block redefines them, so the grid
// follows a theme toggle without a rerender.
const SURFACE = "var(--app-surface)";
const FOREGROUND = "var(--app-foreground)";

/**
 * Diverging Pearson scale: −1 → blue, 0 → the panel surface, +1 → red. The mix
 * factor is |value|, so the colour saturates toward the extremes and fades
 * into the panel near zero. `base` is the surface token on screen; the export
 * passes the resolved colour, since a standalone SVG cannot read `var()`.
 */
function cellColor(value: number, base: string = SURFACE): string {
  const magnitude = Math.min(Math.abs(value), 1);
  const [r, g, b] = value < 0 ? NEGATIVE : POSITIVE;
  return `color-mix(in srgb, rgb(${r} ${g} ${b}) ${(magnitude * 100).toFixed(1)}%, ${base})`;
}

/**
 * Strong cells need light text to stay legible against the saturated fill;
 * weaker fills sit close to the panel, so their text follows the theme.
 */
function textColor(value: number, foreground: string = FOREGROUND): string {
  return Math.abs(value) > 0.55 ? "#ffffff" : foreground;
}

/** Colour the bare value text by magnitude so near-zero numbers read as muted. */
function valueTextClass(value: number): string {
  if (Math.abs(value) < 0.2) return "text-muted-foreground";
  return value < 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400";
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
    <p data-testid="excluded-note" className="mb-3 text-xs text-muted-foreground">
      {columns.length} numeric {noun} excluded (no variance): {columns.join(", ")}
    </p>
  );
}

/** Ranked list of the strongest pairwise relationships — the insight-first view. */
function HighlightsView({ pairs }: { pairs: Pair[] }) {
  if (pairs.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">No correlations to rank.</p>
    );
  }

  const strongest = pairs[0];
  const negligible = strongest != null && Math.abs(strongest.r) < 0.2;

  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        Strongest linear relationships between numeric columns (Pearson, −1 to +1).
        {negligible && " No strong correlations in this dataset — the strongest are shown below."}
      </p>
      <ul data-testid="highlights-list" className="divide-y divide-app-border">
        {pairs.slice(0, 10).map(({ a, b, r }) => (
          <li key={`${a}|${b}`} className="flex items-center gap-3 py-2">
            <span
              className="h-4 w-4 shrink-0 rounded border border-app-border"
              style={{ background: cellColor(r) }}
            />
            <span className="truncate text-sm text-foreground">
              <span className="font-medium">{a}</span>
              <span className="mx-1.5 text-muted-foreground">↔</span>
              <span className="font-medium">{b}</span>
            </span>
            <span className={`ml-auto tabular-nums text-sm font-semibold ${valueTextClass(r)}`}>
              {fmt(r)}
            </span>
            <span className="w-28 text-right text-xs text-muted-foreground">{describe(r)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Geometry of the exported grid image, in CSS px. */
const EXPORT_LABEL_WIDTH = 132;
const EXPORT_HEADER_HEIGHT = 24;
const EXPORT_CELL_WIDTH = 72;
const EXPORT_CELL_HEIGHT = 26;
const EXPORT_FONT = 11;

/** Theme colours the exported grid needs, resolved from the tokens. */
interface ExportPalette {
  label: string;
  surface: string;
  empty: string;
  grid: string;
  foreground: string;
  muted: string;
  disabled: string;
}

/**
 * Read the current theme for the export: the label colour off `root`, the
 * tokens off the document element that `applyTheme` switches. The standalone
 * SVG is rasterized outside the document, where `var()` has nothing to resolve
 * against, so the token values are baked in at click time instead.
 */
function exportPalette(root: HTMLElement): ExportPalette {
  const tokens = getComputedStyle(document.documentElement);
  const token = (name: string) => tokens.getPropertyValue(name).trim();
  return {
    label: getComputedStyle(root).color,
    surface: token("--app-surface"),
    empty: token("--app-surface-hover"),
    grid: token("--app-border"),
    foreground: token("--app-foreground"),
    muted: token("--app-muted-foreground"),
    disabled: token("--app-disabled-foreground"),
  };
}

/** Escape the characters that would otherwise break the generated markup. */
function escapeXml(text: string): string {
  return text.replace(/[<>&"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Shorten a label to `max` characters so it stays inside its cell. */
function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Build a standalone SVG of the grid for PNG export. The on-screen grid is a
 * styled <table>, which cannot be rasterized, so the same colour and formatting
 * helpers are laid out here instead, against the `palette` resolved from the
 * current theme.
 */
function buildMatrixSvg(
  columns: string[],
  subMatrix: (number | null)[][],
  palette: ExportPalette,
): SVGSVGElement {
  const width = EXPORT_LABEL_WIDTH + columns.length * EXPORT_CELL_WIDTH;
  const height = EXPORT_HEADER_HEIGHT + columns.length * EXPORT_CELL_HEIGHT;
  const parts: string[] = [];

  const label = (x: number, y: number, anchor: string, color: string, text: string) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${EXPORT_FONT}" fill="${color}">${escapeXml(text)}</text>`;

  columns.forEach((column, j) => {
    const x = EXPORT_LABEL_WIDTH + j * EXPORT_CELL_WIDTH + EXPORT_CELL_WIDTH / 2;
    parts.push(label(x, EXPORT_HEADER_HEIGHT - 8, "middle", palette.label, clip(column, 11)));
  });

  columns.forEach((rowColumn, i) => {
    const y = EXPORT_HEADER_HEIGHT + i * EXPORT_CELL_HEIGHT;
    const baseline = y + EXPORT_CELL_HEIGHT / 2 + EXPORT_FONT * 0.35;
    parts.push(label(EXPORT_LABEL_WIDTH - 8, baseline, "end", palette.label, clip(rowColumn, 20)));

    // Lower triangle only — the upper half mirrors it, as in the table.
    for (let j = 0; j <= i; j++) {
      const x = EXPORT_LABEL_WIDTH + j * EXPORT_CELL_WIDTH;
      const value = i === j ? null : (subMatrix[i]?.[j] ?? null);
      const fill =
        i === j
          ? palette.surface
          : value == null
            ? palette.empty
            : cellColor(value, palette.surface);
      const text = i === j ? "1" : fmt(value);
      const color =
        i === j
          ? palette.muted
          : value == null
            ? palette.disabled
            : textColor(value, palette.foreground);
      parts.push(
        `<rect x="${x}" y="${y}" width="${EXPORT_CELL_WIDTH}" height="${EXPORT_CELL_HEIGHT}" fill="${fill}" stroke="${palette.grid}" />`,
        label(x + EXPORT_CELL_WIDTH / 2, baseline, "middle", color, text),
      );
    }
  });

  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">${parts.join("")}</svg>`;
  return new DOMParser().parseFromString(markup, "image/svg+xml")
    .documentElement as unknown as SVGSVGElement;
}

/**
 * Cleaned-up grid: lower triangle only (the matrix is symmetric), a muted
 * identity diagonal instead of a screaming red one, a colour legend, and a
 * crosshair that names the hovered pair in a readable caption.
 */
function MatrixView({ columns, subMatrix }: { columns: string[]; subMatrix: (number | null)[][] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null);
  const hoveredValue = hovered != null ? (subMatrix[hovered.row]?.[hovered.col] ?? null) : null;

  return (
    <div ref={rootRef}>
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span>−1</span>
        <span
          className="h-2 w-32 rounded"
          style={{
            background: `linear-gradient(to right, rgb(${NEGATIVE.join(",")}), ${SURFACE}, rgb(${POSITIVE.join(",")}))`,
          }}
        />
        <span>+1</span>
        <span className="ml-1">blue = negative, red = positive</span>
      </div>

      <div className="mb-1 h-5 text-xs text-muted-foreground" data-testid="matrix-caption">
        {hovered != null && hoveredValue != null && (
          <>
            <span className="font-medium">{columns[hovered.row]}</span>
            <span className="mx-1 text-muted-foreground">↔</span>
            <span className="font-medium">{columns[hovered.col]}</span>
            {": "}
            <span className="font-semibold">{fmt(hoveredValue)}</span>{" "}
            <span className="text-muted-foreground">({describe(hoveredValue)})</span>
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
              <th className="sticky left-0 z-10 bg-surface" />
              {columns.map((col, j) => (
                <th
                  key={col}
                  className={`px-2 py-1 align-bottom font-medium ${
                    hovered?.col === j ? "text-foreground" : "text-muted-foreground"
                  }`}
                  title={col}
                >
                  <span className="block max-w-20 truncate">{col}</span>
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
                    className={`sticky left-0 z-10 bg-surface py-1 pr-2 text-right font-medium whitespace-nowrap ${
                      hovered?.row === i ? "text-foreground" : "text-muted-foreground"
                    }`}
                    title={rowCol}
                  >
                    <span className="block max-w-32 truncate">{rowCol}</span>
                  </th>
                  {columns.map((colCol, j) => {
                    // Upper triangle is the mirror image — leave it blank.
                    if (j > i) {
                      return <td key={colCol} className="border border-app-border" />;
                    }
                    // Identity diagonal: present but deliberately muted.
                    if (j === i) {
                      return (
                        <td
                          key={colCol}
                          className="border border-app-border bg-surface px-2 py-1 text-center text-muted-foreground"
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
                        className={`cursor-default border border-app-border px-2 py-1 text-center tabular-nums ${
                          value == null ? "bg-surface-hover text-disabled-foreground" : ""
                        } ${isHover ? "ring-2 ring-inset ring-foreground/50" : ""}`}
                        style={
                          value == null
                            ? undefined
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

      <DownloadImageButton
        getTarget={() =>
          rootRef.current
            ? buildMatrixSvg(columns, subMatrix, exportPalette(rootRef.current))
            : null
        }
        title="Correlation"
      />
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
    <div className="inline-flex rounded-lg bg-surface p-0.5">
      <button
        type="button"
        onClick={() => onChange("highlights")}
        className={`${base} ${view === "highlights" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
      >
        Highlights
      </button>
      <button
        type="button"
        onClick={() => onChange("matrix")}
        className={`${base} ${view === "matrix" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
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
        <h4 className="text-sm font-medium text-foreground">Correlation</h4>
        {ready && <ViewToggle view={view} onChange={setView} />}
      </div>

      {error ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
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
        <div className="py-4 text-center text-sm text-muted-foreground">Loading correlation…</div>
      ) : activeColumns.length < 2 ? (
        <>
          <ExcludedNote columns={excludedColumns} />
          <div className="py-4 text-center text-sm text-muted-foreground">
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
