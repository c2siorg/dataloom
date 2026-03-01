import { test, expect } from "./fixtures.js";

test.describe("Table Operations", () => {
  test("inline cell editing", async ({ page, projectId }) => {
    const table = page.locator('[data-testid="data-table"]');

    const cell = table.locator("tbody tr").first().locator("td").nth(1).locator("div");
    await cell.click();

    const cellInput = table.locator("tbody tr").first().locator("td").nth(1).locator("input");
    await cellInput.fill("Updated Value");
    await cellInput.press("Enter");

    await expect(table).toContainText("Updated Value");
  });

  test("add and delete a row via context menu", async ({ page, projectId }) => {
    const table = page.locator('[data-testid="data-table"]');
    await expect(table.locator("tbody tr")).toHaveCount(5);

    // Add a row
    await table.locator("tbody tr").first().locator("td").first().click({ button: "right" });
    const contextMenu = page.locator('[data-testid="context-menu"]');
    await contextMenu.waitFor({ state: "visible" });
    await contextMenu.getByText("Add Row").click();
    await expect(table.locator("tbody tr")).toHaveCount(6);

    // Delete the row
    await table.locator("tbody tr").first().locator("td").first().click({ button: "right" });
    const contextMenu2 = page.locator('[data-testid="context-menu"]');
    await contextMenu2.waitFor({ state: "visible" });
    await contextMenu2.getByText("Delete Row").click();
    await expect(table.locator("tbody tr")).toHaveCount(5);
  });

  test("rename a column via context menu", async ({ page, projectId }) => {
    const table = page.locator('[data-testid="data-table"]');

    await table.locator("thead th").nth(1).click({ button: "right" });
    const contextMenu = page.locator('[data-testid="context-menu"]');
    await contextMenu.waitFor({ state: "visible" });
    await contextMenu.getByText("Rename Column").click();

    const dialog = page.getByRole("dialog", { name: "Input Required" });
    await dialog.waitFor({ state: "visible" });
    await dialog.locator('input[type="text"]').fill("full_name");
    await dialog.getByRole("button", { name: "OK" }).click();

    await expect(table.locator("thead")).toContainText("full_name");
    await expect(table.locator("thead")).not.toContainText(/\bname\b/);
  });
});
