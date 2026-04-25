import { test, expect } from "./fixtures.js";

test.describe("Table Operations", () => {
  test("inline cell editing", async ({ page, projectId }) => {
    const table = page.locator('[data-testid="data-table"]');

    const cell = table
      .locator("tbody tr")
      .first()
      .locator("td")
      .nth(1)
      .locator("div");
    await cell.click();

    const cellInput = table
      .locator("tbody tr")
      .first()
      .locator("td")
      .nth(1)
      .locator("input");
    await cellInput.fill("Updated Value");
    await cellInput.press("Enter");

    await expect(table).toContainText("Updated Value");
  });

  test("add and delete a row via context menu", async ({ page, projectId }) => {
    const table = page.locator('[data-testid="data-table"]');
    await expect(table.locator("tbody tr")).toHaveCount(5);

    // Add a row
    await table
      .locator("tbody tr")
      .first()
      .locator("td")
      .first()
      .click({ button: "right" });
    const contextMenu = page.locator('[data-testid="context-menu-row"]');
    await contextMenu.waitFor({ state: "visible" });
    await contextMenu.getByText("Add Row").click();
    await expect(table.locator("tbody tr")).toHaveCount(6);

    // Delete the last row (the newly added empty row)
    const lastRow = table.locator("tbody tr").last();
    await lastRow.locator("td").first().click({ button: "right" });
    const deleteMenu = page.locator('[data-testid="context-menu-row"]');
    await deleteMenu.waitFor({ state: "visible" });
    await deleteMenu.getByText("Delete Row").click();
    await expect(table.locator("tbody tr")).toHaveCount(5);

    // Verify original data is intact
    await expect(table).toContainText("Alice");
  });

  test("rename a column via context menu", async ({ page, projectId }) => {
    const table = page.locator('[data-testid="data-table"]');

    await table.locator("thead th").nth(1).click({ button: "right" });
    const contextMenu = page.locator('[data-testid="context-menu-column"]');
    await contextMenu.waitFor({ state: "visible" });
    await contextMenu.getByText("Rename Column").click();

    const dialog = page.getByRole("dialog", { name: "Input Required" });
    await dialog.waitFor({ state: "visible" });
    await dialog.locator('input[type="text"]').fill("full_name");
    await dialog.getByRole("button", { name: "OK" }).click();

    const renamedHeader = table.locator("thead th").nth(1);
    await expect(renamedHeader).toContainText("full_name");
    await expect(renamedHeader.getByText("name", { exact: true })).toHaveCount(
      0,
    );
  });
});
