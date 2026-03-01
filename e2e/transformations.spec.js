import { test, expect } from "./fixtures.js";

test.describe("Transformations", () => {
  test("filter rows by city equals New York", async ({ page, projectId }) => {
    await page.locator('[data-testid="tab-data"]').click();
    await page.locator('[data-testid="toolbar-filter"]').click();

    const form = page.locator('[data-testid="filter-form"]');
    await form.waitFor({ state: "visible" });
    await form.locator('input[name="column"]').fill("city");
    await form.locator('input[name="value"]').fill("New York");
    await form.getByRole("button", { name: "Apply Filter" }).click();

    const preview = page.locator('[data-testid="transform-preview"]');
    await preview.waitFor({ state: "visible" });

    await expect(page.locator('[data-testid="preview-table"] tbody tr')).toHaveCount(2);
    await expect(preview).toContainText("Alice");
    await expect(preview).toContainText("Diana");
  });

  test("sort rows by age ascending", async ({ page, projectId }) => {
    await page.locator('[data-testid="tab-data"]').click();
    await page.locator('[data-testid="toolbar-sort"]').click();

    const form = page.locator('[data-testid="sort-form"]');
    await form.waitFor({ state: "visible" });
    await form.locator('input[type="text"]').fill("age");
    await form.getByRole("button", { name: "Submit" }).click();

    const preview = page.locator('[data-testid="transform-preview"]');
    await preview.waitFor({ state: "visible" });

    const firstRow = page.locator('[data-testid="preview-table"] tbody tr').first();
    await expect(firstRow).toContainText("Bob");
    await expect(firstRow).toContainText("25");
  });
});
