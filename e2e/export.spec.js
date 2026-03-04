import { test, expect } from "./fixtures.js";

test.describe("Export", () => {
  test("export downloads a valid CSV file", async ({ page, projectId }) => {
    const downloadPromise = page.waitForEvent("download");

    await page.locator('[data-testid="toolbar-export"]').click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("export.csv");

    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks).toString("utf-8");

    expect(content).toContain("name,age,city,score");
    expect(content).toContain("Alice");
    expect(content).toContain("Bob");
  });
});
