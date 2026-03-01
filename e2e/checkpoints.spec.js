import { test, expect } from "./fixtures.js";

test.describe("Checkpoints", () => {
  test("save a checkpoint and verify it appears", async ({ page, projectId }) => {
    await page.locator('[data-testid="toolbar-save"]').click();

    const dialog = page.getByRole("dialog", { name: "Input Required" });
    await dialog.waitFor({ state: "visible" });
    await dialog.locator('input[type="text"]').fill("Initial checkpoint");
    await dialog.getByRole("button", { name: "OK" }).click();

    await expect(page.getByText("Project saved successfully!")).toBeVisible();

    await page.locator('[data-testid="toolbar-checkpoints"]').click();
    const panel = page.locator('[data-testid="checkpoints-panel"]');
    await panel.waitFor({ state: "visible" });

    await expect(panel).toContainText("Initial checkpoint");
    await expect(panel.getByRole("button", { name: "Revert" })).toBeVisible();
  });

  test("revert to checkpoint restores data", async ({ page, projectId }) => {
    // Save checkpoint
    await page.locator('[data-testid="toolbar-save"]').click();
    const saveDialog = page.getByRole("dialog", { name: "Input Required" });
    await saveDialog.waitFor({ state: "visible" });
    await saveDialog.locator('input[type="text"]').fill("Before edit");
    await saveDialog.getByRole("button", { name: "OK" }).click();
    await expect(page.getByText("Project saved successfully!")).toBeVisible();

    // Edit a cell
    const table = page.locator('[data-testid="data-table"]');
    const firstDataCell = table.locator("tbody tr").first().locator("td").nth(1).locator("div");
    await firstDataCell.click();

    const cellInput = table.locator("tbody tr").first().locator("td").nth(1).locator("input");
    await cellInput.fill("MODIFIED");
    await cellInput.press("Enter");
    await expect(table).toContainText("MODIFIED");

    // Revert
    await page.locator('[data-testid="toolbar-checkpoints"]').click();
    const panel = page.locator('[data-testid="checkpoints-panel"]');
    await panel.waitFor({ state: "visible" });
    await panel.getByRole("button", { name: "Revert" }).click();

    const confirmDialog = page.getByRole("dialog", { name: "Confirm" });
    await confirmDialog.waitFor({ state: "visible" });
    await confirmDialog.getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByText("Project reverted successfully!")).toBeVisible();
    await expect(table).not.toContainText("MODIFIED");
  });
});
