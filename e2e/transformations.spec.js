import { test, expect } from "./fixtures.js";
import { selectColumn } from "./helpers.js";

test.describe("Transformations", () => {
  test("filter rows by city equals New York", async ({ page, projectId }) => {
    await page.locator('[data-testid="tab-data"]').click();
    await page.locator('[data-testid="toolbar-filter"]').click();

    const form = page.locator('[data-testid="filter-form"]');
    await form.waitFor({ state: "visible" });
    await selectColumn(form, "filter-column", "city");
    await form.locator('[data-testid="filter-value"]').fill("New York");
    await form.getByRole("button", { name: "Apply Filter" }).click();

    // FilterForm calls enterPreviewMode — main table updates and Save Changes button appears
    await page
      .getByText("Save Changes")
      .waitFor({ state: "visible", timeout: 30000 });

    const table = page.locator('[data-testid="data-table"]');
    const rows = table.locator("tbody tr");
    await rows.first().waitFor({ state: "visible", timeout: 30000 });
    await expect(rows).toHaveCount(2, { timeout: 30000 });
    await expect(table).toContainText("Alice");
    await expect(table).toContainText("Diana");
  });

  test("sort rows by age ascending", async ({ page, projectId }) => {
    await page.locator('[data-testid="tab-data"]').click();
    await page.locator('[data-testid="toolbar-sort"]').click();

    const form = page.locator('[data-testid="sort-form"]');
    await form.waitFor({ state: "visible" });
    await selectColumn(form, "sort-column", "age");
    await form.getByRole("button", { name: /Apply Sort/i }).click();

    // Sort applies via preview workflow, wait for Save Changes to appear
    await page
      .getByText("Save Changes")
      .waitFor({ state: "visible", timeout: 30000 });

    const firstRow = page
      .locator('[data-testid="data-table"] tbody tr')
      .first();
    await firstRow.waitFor({ state: "visible", timeout: 30000 });
    await expect(firstRow).toContainText("Bob", { timeout: 30000 });
    await expect(firstRow).toContainText("25", { timeout: 30000 });
  });
});
