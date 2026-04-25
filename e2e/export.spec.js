import { test, expect } from "./fixtures.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_CSV = path.join(__dirname, "fixtures", "sample.csv");

function parseCsvLines(content) {
  return content
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim());
}

function normalizeCsvRow(row) {
  return row
    .split(",")
    .map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

test.describe("Export", () => {
  test("export downloads a valid CSV file", async ({ page, projectId }) => {
    const downloadPromise = page.waitForEvent("download");

    await page.locator('[data-testid="toolbar-export"]').click();

    const download = await downloadPromise;
    expect(download.suggestedFilename().toLowerCase()).toMatch(/\.csv$/);

    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks).toString("utf-8");
    const exportedLines = parseCsvLines(content);

    const fixtureContent = readFileSync(SAMPLE_CSV, "utf-8");
    const fixtureLines = parseCsvLines(fixtureContent);

    const exportedHeader = normalizeCsvRow(exportedLines[0]);
    const expectedHeader = normalizeCsvRow(fixtureLines[0]);
    expect(exportedHeader).toEqual(expectedHeader);

    // Ensure export includes the same number of records as the uploaded fixture.
    expect(exportedLines.length).toBe(fixtureLines.length);

    // Sample a couple of fixture values to ensure row content is present.
    const firstFixtureRow = normalizeCsvRow(fixtureLines[1]);
    expect(content).toContain(firstFixtureRow[0]);
    expect(content).toContain(firstFixtureRow[1]);
  });
});
