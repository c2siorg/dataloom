import { test, expect } from "./fixtures.js";

test.describe("Undo and Redo", () => {
  test("undo then redo a cell edit", async ({ page, projectId }) => {
    const undo = page.locator('[data-testid="toolbar-undo"]');
    const redo = page.locator('[data-testid="toolbar-redo"]');
    const table = page.locator('[data-testid="data-table"]');
    const targetCell = table.locator("tbody tr").first().locator("td").nth(1);

    // A fresh project has nothing to undo or redo.
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();
    await expect(targetCell).toContainText("Alice");

    await targetCell.locator("div").first().click();
    const cellInput = targetCell.locator("input");
    await cellInput.fill("MODIFIED");
    await cellInput.press("Enter");
    await expect(table).toContainText("MODIFIED");
    await expect(undo).toBeEnabled();
    await expect(redo).toBeDisabled();

    await undo.click();
    await expect(page.getByText("Last transformation undone!")).toBeVisible();
    await expect(targetCell).toContainText("Alice");
    await expect(undo).toBeDisabled();
    await expect(redo).toBeEnabled();

    await redo.click();
    await expect(page.getByText("Last transformation redone!")).toBeVisible();
    await expect(targetCell).toContainText("MODIFIED");
    await expect(undo).toBeEnabled();
    await expect(redo).toBeDisabled();
  });
});
