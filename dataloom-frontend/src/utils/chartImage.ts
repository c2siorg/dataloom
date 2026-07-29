/**
 * PNG export for the visualization surfaces. Kept dependency-free: the rendered
 * SVG is serialized, drawn onto a canvas and saved through an object URL, so no
 * screenshot library is pulled into the bundle.
 */

/** Drawn at 2x so the PNG stays crisp on high-DPI screens and when zoomed. */
const SCALE = 2;
/** Breathing room around the chart, and the caption band above it (CSS px). */
const PADDING = 16;
const TITLE_HEIGHT = 28;
const TITLE_FONT = "600 14px system-ui, sans-serif";
/** Legend swatch size, its gap to the label, and the spacing between entries. */
const SWATCH = 9;
const SWATCH_GAP = 5;
const ENTRY_GAP = 14;
const LEGEND_FONT = "12px system-ui, sans-serif";
const LEGEND_LINE_HEIGHT = 18;
const LEGEND_TOP_GAP = 10;
const FALLBACK_BACKGROUND = "#ffffff";
const FALLBACK_COLOR = "#18181b";

/** Fully transparent computed backgrounds, which never make a usable canvas fill. */
const TRANSPARENT = ["transparent", "rgba(0, 0, 0, 0)"];

interface LegendEntry {
  color: string;
  label: string;
}

/**
 * Theme colours for the export, read from the element the download control sits
 * in — the PNG then matches whatever theme the surface is rendered in. The
 * background walks up the tree because most wrappers are transparent.
 */
function exportColors(styleSource: Element): { background: string; color: string } {
  let background = FALLBACK_BACKGROUND;
  for (let node: Element | null = styleSource; node != null; node = node.parentElement) {
    const candidate = getComputedStyle(node).backgroundColor;
    if (candidate && !TRANSPARENT.includes(candidate)) {
      background = candidate;
      break;
    }
  }
  return { background, color: getComputedStyle(styleSource).color || FALLBACK_COLOR };
}

/**
 * The chart itself inside `target`. Recharts also renders a tiny SVG swatch for
 * every legend entry, so the largest one is the plot; a target that already is
 * an SVG (a chart built for export) is returned as-is.
 */
function chartSvg(target: Element): SVGSVGElement | null {
  if (target instanceof SVGSVGElement) return target;
  let largest: SVGSVGElement | null = null;
  let largestArea = 0;
  for (const svg of target.querySelectorAll("svg")) {
    const { width, height } = svg.getBoundingClientRect();
    if (width * height > largestArea) {
      largest = svg;
      largestArea = width * height;
    }
  }
  return largest;
}

/**
 * Legend entries to redraw on the canvas. Recharts renders the legend as HTML
 * beside the plot, so it is not part of the serialized SVG — without this the
 * exported pie or multi-series chart would lose its key.
 */
function legendOf(target: Element): LegendEntry[] {
  const entries: LegendEntry[] = [];
  for (const item of target.querySelectorAll(".recharts-legend-item")) {
    const swatch = item.querySelector("path, rect, line");
    const label = item.textContent?.trim();
    if (!swatch || !label) continue;
    const { fill, stroke } = getComputedStyle(swatch);
    entries.push({ color: fill && fill !== "none" ? fill : stroke, label });
  }
  return entries;
}

/** Greedily wrap the legend into rows no wider than `maxWidth`. */
function packLegend(
  context: CanvasRenderingContext2D,
  entries: LegendEntry[],
  maxWidth: number,
): LegendEntry[][] {
  const rows: LegendEntry[][] = [];
  let row: LegendEntry[] = [];
  let rowWidth = 0;
  for (const entry of entries) {
    const width = entryWidth(context, entry);
    if (row.length > 0 && rowWidth + width > maxWidth) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    row.push(entry);
    rowWidth += width;
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

function entryWidth(context: CanvasRenderingContext2D, entry: LegendEntry): number {
  return SWATCH + SWATCH_GAP + context.measureText(entry.label).width + ENTRY_GAP;
}

/** Draw the packed legend rows centred under the chart. */
function drawLegend(
  context: CanvasRenderingContext2D,
  rows: LegendEntry[][],
  canvasWidth: number,
  top: number,
  color: string,
): void {
  context.textAlign = "left";
  rows.forEach((row, index) => {
    const rowWidth =
      row.reduce((total, entry) => total + entryWidth(context, entry), 0) - ENTRY_GAP;
    const y = top + index * LEGEND_LINE_HEIGHT + LEGEND_LINE_HEIGHT / 2;
    let x = (canvasWidth - rowWidth) / 2;
    for (const entry of row) {
      context.fillStyle = entry.color;
      context.fillRect(x, y - SWATCH / 2, SWATCH, SWATCH);
      context.fillStyle = color;
      context.fillText(entry.label, x + SWATCH + SWATCH_GAP, y);
      x += entryWidth(context, entry);
    }
  });
}

/**
 * On-screen size of the chart. Charts rendered through ResponsiveContainer are
 * sized in percentages, which an <img> cannot resolve, so the export always
 * carries explicit pixel dimensions; a chart built for export only (never laid
 * out) falls back to its own width/height attributes.
 */
function sizeOf(svg: SVGSVGElement): { width: number; height: number } {
  const rect = svg.getBoundingClientRect();
  return {
    width: rect.width || Number(svg.getAttribute("width")) || 0,
    height: rect.height || Number(svg.getAttribute("height")) || 0,
  };
}

/** Load serialized SVG markup into an <img>, resolving once it can be drawn. */
function loadImage(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The chart could not be rasterized."));
    };
    image.src = url;
  });
}

/** File stem from the chart title: "Count by Qty" → "count-by-qty". */
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "chart";
}

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Download the chart in `target` — a rendered chart container or an SVG built
 * for export — as a PNG named after `title`, which is also drawn as a caption.
 * `styleSource` is the element the export takes its background and text colour
 * from (see exportColors).
 */
export async function downloadChartAsPng(
  target: Element,
  title: string,
  styleSource: Element,
): Promise<void> {
  const svg = chartSvg(target);
  if (!svg) throw new Error("There is no chart to export.");

  const { width, height } = sizeOf(svg);
  const { background, color } = exportColors(styleSource);

  // Standalone markup: the clone loses the document's font inheritance, and
  // Firefox refuses to render an <img> SVG without explicit dimensions.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.style.fontFamily = getComputedStyle(svg).fontFamily || "system-ui, sans-serif";

  const image = await loadImage(new XMLSerializer().serializeToString(clone));

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The chart could not be rasterized.");

  const canvasWidth = width + PADDING * 2;
  context.font = LEGEND_FONT;
  const legendRows = packLegend(context, legendOf(target), width);
  const legendHeight =
    legendRows.length > 0 ? LEGEND_TOP_GAP + legendRows.length * LEGEND_LINE_HEIGHT : 0;
  const canvasHeight = height + TITLE_HEIGHT + legendHeight + PADDING * 2;

  // Sizing the canvas resets its context, so all drawing state is set after.
  canvas.width = canvasWidth * SCALE;
  canvas.height = canvasHeight * SCALE;
  context.scale(SCALE, SCALE);
  context.fillStyle = background;
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  context.textBaseline = "middle";
  context.textAlign = "center";
  context.font = TITLE_FONT;
  context.fillStyle = color;
  context.fillText(title, canvasWidth / 2, PADDING + TITLE_HEIGHT / 2);

  const chartTop = PADDING + TITLE_HEIGHT;
  context.drawImage(image, PADDING, chartTop, width, height);

  context.font = LEGEND_FONT;
  drawLegend(context, legendRows, canvasWidth, chartTop + height + LEGEND_TOP_GAP, color);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The chart could not be rasterized.");
  save(blob, `${slugify(title)}.png`);
}
