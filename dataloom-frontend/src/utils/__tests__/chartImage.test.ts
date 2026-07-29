import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadChartAsPng } from "../chartImage";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * jsdom ships no canvas, no object URLs and no image decoding, so the pieces the
 * export leans on are stubbed here and the drawing calls are recorded. That
 * keeps the sizing, legend packing, colour resolution and file naming under
 * test without pulling a headless browser into the suite.
 */
type DrawCall = { text: string; x: number; y: number };

const recorder = {
  fillRects: [] as { x: number; y: number; width: number; height: number; fillStyle: string }[],
  fillTexts: [] as DrawCall[],
  drawImages: [] as { x: number; y: number; width: number; height: number }[],
  scales: [] as { x: number; y: number }[],
};

/** Widths are proportional to the label so legend packing stays deterministic. */
const CHAR_WIDTH = 10;

function fakeContext() {
  return {
    font: "",
    fillStyle: "",
    textAlign: "",
    textBaseline: "",
    measureText: (text: string) => ({ width: text.length * CHAR_WIDTH }),
    scale: (x: number, y: number) => recorder.scales.push({ x, y }),
    fillRect(x: number, y: number, width: number, height: number) {
      recorder.fillRects.push({ x, y, width, height, fillStyle: this.fillStyle });
    },
    fillText(text: string, x: number, y: number) {
      recorder.fillTexts.push({ text, x, y });
    },
    drawImage(_image: unknown, x: number, y: number, width: number, height: number) {
      recorder.drawImages.push({ x, y, width, height });
    },
  };
}

let context: ReturnType<typeof fakeContext> | null;
let toBlobResult: Blob | null;
let imageLoads: boolean;
let serialized: string[];
let downloads: { filename: string }[];

beforeEach(() => {
  recorder.fillRects = [];
  recorder.fillTexts = [];
  recorder.drawImages = [];
  recorder.scales = [];
  context = fakeContext();
  toBlobResult = new Blob(["png"], { type: "image/png" });
  imageLoads = true;
  serialized = [];
  downloads = [];

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
    callback(toBlobResult),
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ filename: this.download });
  });
  vi.spyOn(XMLSerializer.prototype, "serializeToString").mockImplementation((node) => {
    const markup = (node as Element).outerHTML ?? "";
    serialized.push(markup);
    return markup;
  });

  // Sizes come from data-w / data-h so each fixture states its own layout.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const width = Number(this.getAttribute("data-w")) || 0;
    const height = Number(this.getAttribute("data-h")) || 0;
    return { width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height } as DOMRect;
  });

  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:stub"),
    revokeObjectURL: vi.fn(),
  });

  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => (imageLoads ? this.onload?.() : this.onerror?.()));
    }
  }
  vi.stubGlobal("Image", StubImage);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

/** A legend entry: bare label, or one whose swatch carries explicit paint. */
type LegendSpec = string | { label: string; fill?: string; stroke?: string };

/** A chart container holding a laid-out SVG, plus optional legend entries. */
function chartFixture({ width = 400, height = 300, legend = [] as LegendSpec[] } = {}): {
  container: HTMLElement;
  svg: SVGSVGElement;
} {
  const container = document.createElement("div");
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("data-w", String(width));
  svg.setAttribute("data-h", String(height));
  container.appendChild(svg);

  for (const spec of legend) {
    const entry = typeof spec === "string" ? { label: spec } : spec;
    const item = document.createElement("div");
    item.className = "recharts-legend-item";
    const swatch = document.createElementNS(SVG_NS, "path");
    const paint = [
      entry.fill ? `fill: ${entry.fill}` : "",
      entry.stroke ? `stroke: ${entry.stroke}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    if (paint) swatch.setAttribute("style", paint);
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(entry.label));
    container.appendChild(item);
  }

  document.body.appendChild(container);
  return { container, svg };
}

/** Element the export reads its background and text colour from. */
function styleSource(backgroundColor?: string): HTMLElement {
  const source = document.createElement("div");
  if (backgroundColor) source.style.backgroundColor = backgroundColor;
  document.body.appendChild(source);
  return source;
}

describe("downloadChartAsPng", () => {
  it("saves a PNG named after the chart title", async () => {
    const { container } = chartFixture();

    await downloadChartAsPng(container, "Count by Qty", styleSource());

    expect(downloads).toEqual([{ filename: "count-by-qty.png" }]);
  });

  it("falls back to a generic file name when the title has no usable characters", async () => {
    const { container } = chartFixture();

    await downloadChartAsPng(container, "!!! ---", styleSource());

    expect(downloads).toEqual([{ filename: "chart.png" }]);
  });

  it("sizes the canvas from the chart's on-screen box at 2x", async () => {
    const { container } = chartFixture({ width: 400, height: 300 });
    const canvases: HTMLCanvasElement[] = [];
    vi.spyOn(document, "createElement").mockImplementation(function (tag: string) {
      const element = Document.prototype.createElement.call(document, tag);
      if (tag === "canvas") canvases.push(element as HTMLCanvasElement);
      return element;
    } as typeof document.createElement);

    await downloadChartAsPng(container, "Count by Qty", styleSource());

    // width + padding*2, and height + title band + padding*2, each scaled 2x.
    const [canvas] = canvases;
    expect(canvas?.width).toBe((400 + 32) * 2);
    expect(canvas?.height).toBe((300 + 28 + 32) * 2);
    expect(recorder.scales).toEqual([{ x: 2, y: 2 }]);
    expect(recorder.drawImages).toEqual([{ x: 16, y: 44, width: 400, height: 300 }]);
  });

  it("falls back to the width/height attributes for a chart that was never laid out", async () => {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", "220");
    svg.setAttribute("height", "180");

    await downloadChartAsPng(svg, "Correlation matrix", styleSource());

    expect(recorder.drawImages).toEqual([{ x: 16, y: 44, width: 220, height: 180 }]);
  });

  it("gives the serialized clone explicit dimensions and an SVG namespace", async () => {
    const { container } = chartFixture({ width: 400, height: 300 });

    await downloadChartAsPng(container, "Count by Qty", styleSource());

    expect(serialized).toHaveLength(1);
    expect(serialized[0]).toContain('width="400"');
    expect(serialized[0]).toContain('height="300"');
    expect(serialized[0]).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("draws the title as a caption above the chart", async () => {
    const { container } = chartFixture();

    await downloadChartAsPng(container, "Count by Qty", styleSource());

    expect(recorder.fillTexts[0]).toEqual({ text: "Count by Qty", x: (400 + 32) / 2, y: 30 });
  });

  it("redraws the legend under the chart and grows the canvas to fit it", async () => {
    const { container } = chartFixture({ legend: ["revenue", "cost"] });

    await downloadChartAsPng(container, "Count by Qty", styleSource());

    const labels = recorder.fillTexts.map((call) => call.text);
    expect(labels).toEqual(["Count by Qty", "revenue", "cost"]);
    // One legend row: both entries share a baseline below the chart.
    expect(recorder.fillTexts[1]?.y).toBe(recorder.fillTexts[2]?.y);
  });

  it("colours each legend swatch from its fill, falling back to its stroke", async () => {
    // Recharts paints line-series swatches with a stroke and no fill.
    const { container } = chartFixture({
      legend: [
        { label: "revenue", fill: "rgb(1, 2, 3)" },
        { label: "cost", fill: "none", stroke: "rgb(4, 5, 6)" },
      ],
    });

    await downloadChartAsPng(container, "Count by Qty", styleSource());

    // The first fillRect is the canvas background; the swatches follow.
    const swatches = recorder.fillRects.slice(1).map((rect) => rect.fillStyle);
    expect(swatches).toEqual(["rgb(1, 2, 3)", "rgb(4, 5, 6)"]);
  });

  it("wraps a legend wider than the chart onto further rows", async () => {
    // Each label measures 30 * CHAR_WIDTH, so only one entry fits per 400px row.
    const { container } = chartFixture({
      legend: ["a".repeat(30), "b".repeat(30), "c".repeat(30)],
    });

    await downloadChartAsPng(container, "Count by Qty", styleSource());

    const legendRows = recorder.fillTexts.slice(1).map((call) => call.y);
    expect(new Set(legendRows).size).toBe(3);
    expect(Number(legendRows[0])).toBeLessThan(Number(legendRows[1]));
  });

  it("paints the background of the nearest non-transparent ancestor", async () => {
    const { container } = chartFixture();
    const themed = styleSource("rgb(24, 24, 27)");
    const nested = document.createElement("div");
    themed.appendChild(nested);

    await downloadChartAsPng(container, "Count by Qty", nested);

    expect(recorder.fillRects[0]).toMatchObject({ x: 0, y: 0, fillStyle: "rgb(24, 24, 27)" });
  });

  it("falls back to a white background when no ancestor sets one", async () => {
    const { container } = chartFixture();

    await downloadChartAsPng(container, "Count by Qty", styleSource());

    expect(recorder.fillRects[0]?.fillStyle).toBe("#ffffff");
  });

  it("rejects when the target holds no chart", async () => {
    const empty = document.createElement("div");

    await expect(downloadChartAsPng(empty, "Count by Qty", styleSource())).rejects.toThrow(
      "There is no chart to export.",
    );
    expect(downloads).toEqual([]);
  });

  it("rejects when the SVG cannot be rasterized", async () => {
    imageLoads = false;
    const { container } = chartFixture();

    await expect(downloadChartAsPng(container, "Count by Qty", styleSource())).rejects.toThrow(
      "The chart could not be rasterized.",
    );
    expect(downloads).toEqual([]);
  });

  it("rejects when no 2D canvas context is available", async () => {
    context = null;
    const { container } = chartFixture();

    await expect(downloadChartAsPng(container, "Count by Qty", styleSource())).rejects.toThrow(
      "The chart could not be rasterized.",
    );
  });

  it("rejects when the canvas yields no blob", async () => {
    toBlobResult = null;
    const { container } = chartFixture();

    await expect(downloadChartAsPng(container, "Count by Qty", styleSource())).rejects.toThrow(
      "The chart could not be rasterized.",
    );
    expect(downloads).toEqual([]);
  });
});
