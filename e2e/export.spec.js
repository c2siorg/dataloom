import { test, expect } from "./fixtures.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_CSV = path.join(__dirname, "fixtures", "sample.csv");
const EXPORT_FORMATS = ["csv", "tsv", "json", "xlsx", "parquet"];

function parseDelimitedLines(content) {
  return content
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim());
}

function normalizeDelimitedRow(row, delimiter) {
  return row.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

async function readDownloadBuffer(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function downloadExport(page, projectId, format) {
  const exportName = `export-${format}-${projectId}`;
  await page.locator('[data-testid="toolbar-export"]').click();
  await expect(page.locator('[data-testid="export-filename"]')).toBeVisible();
  await page.locator(`[data-testid="export-format-${format}"]`).click();
  await expect(
    page.locator(`[data-testid="export-format-${format}"]`),
  ).toHaveAttribute("aria-pressed", "true");

  await page.locator('[data-testid="export-filename"]').fill(exportName);
  const downloadPromise = page.waitForEvent("download");

  await page.locator('[data-testid="export-confirm"]').click();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${exportName}.${format}`);
  return readDownloadBuffer(download);
}

function expectDelimitedContent(buffer, delimiter) {
  const content = buffer.toString("utf-8");
  const exportedLines = parseDelimitedLines(content);

  const fixtureContent = readFileSync(SAMPLE_CSV, "utf-8");
  const fixtureLines = parseDelimitedLines(fixtureContent);

  const exportedHeader = normalizeDelimitedRow(exportedLines[0], delimiter);
  const expectedHeader = normalizeDelimitedRow(fixtureLines[0], ",");
  expect(exportedHeader).toEqual(expectedHeader);

  // Ensure export includes the same number of records as the uploaded fixture.
  expect(exportedLines.length).toBe(fixtureLines.length);

  // Sample a couple of fixture values to ensure row content is present.
  const firstFixtureRow = normalizeDelimitedRow(fixtureLines[1], ",");
  expect(content).toContain(firstFixtureRow[0]);
  expect(content).toContain(firstFixtureRow[1]);
}

function expectJsonContent(buffer) {
  const records = JSON.parse(buffer.toString("utf-8"));
  expect(records).toHaveLength(5);
  expect(records[0]).toMatchObject({
    name: "Alice",
    age: 30,
    city: "New York",
    score: 88.5,
  });
}

function expectXlsxContent(buffer) {
  expect(buffer.subarray(0, 2).toString("utf-8")).toBe("PK");
  expect(buffer.toString("utf-8")).toContain("[Content_Types].xml");
}

function expectParquetContent(buffer) {
  expect(buffer.subarray(0, 4).toString("utf-8")).toBe("PAR1");
  expect(buffer.subarray(-4).toString("utf-8")).toBe("PAR1");
}

test.describe("Export", () => {
  test("export downloads valid files for every supported format", async ({
    page,
    projectId,
  }) => {
    const downloads = {};
    for (const format of EXPORT_FORMATS) {
      downloads[format] = await downloadExport(page, projectId, format);
      expect(downloads[format].length).toBeGreaterThan(0);
    }

    expectDelimitedContent(downloads.csv, ",");
    expectDelimitedContent(downloads.tsv, "\t");
    expectJsonContent(downloads.json);
    expectXlsxContent(downloads.xlsx);
    expectParquetContent(downloads.parquet);
  });
});
