import path from "path";
import { fileURLToPath } from "url";
import { test, expect } from "./fixtures.js";
import { selectColumn } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MULTI_PAGE_CSV = path.join(__dirname, "fixtures", "multi-page.csv");

// A real ~120k-row fixture (matching the dataset the bug was filed against)
// is impractical for this suite — it costs an upload/parse/write on every
// run for no extra coverage. 62 rows is the smallest size that still spans
// multiple pages at the default page size (50): page 1 full (50 rows), page
// 2 partial (12 rows) — a count that can't be confused with a full page or
// the whole dataset, which is what this test needs to catch a regression.
test.use({ projectCsv: MULTI_PAGE_CSV });

test.describe("Pagination — revert on a multi-page project", () => {
  test("revert from a high page number renders one page, not the full dataset", async ({
    page,
    projectId,
  }) => {
    const table = page.locator('[data-testid="data-table"]');
    await expect(table.locator("tbody tr")).toHaveCount(50); // page 1 of 2 at the default page size

    // Apply a transform and persist it (Apply -> preview -> Save Changes),
    // then save a checkpoint — mirrors transformations.spec.js + checkpoints.spec.js.
    await page.locator('[data-testid="tab-data"]').click();
    await page.locator('[data-testid="toolbar-sort"]').click();

    const sortForm = page.locator('[data-testid="sort-form"]');
    await sortForm.waitFor({ state: "visible" });
    await selectColumn(sortForm, "sort-column", "id");
    await sortForm.getByRole("button", { name: /Apply Sort/i }).click();

    const saveChangesButton = sortForm.getByRole("button", { name: "Save Changes" });
    await saveChangesButton.waitFor({ state: "visible", timeout: 30000 });
    await saveChangesButton.click();
    // The form closes once the transform is persisted (preview mode ends).
    await sortForm.waitFor({ state: "hidden", timeout: 30000 });

    await page.locator('[data-testid="tab-file"]').click();
    await page.locator('[data-testid="toolbar-save"]').click();
    const saveDialog = page.getByRole("dialog", { name: "Input Required" });
    await saveDialog.waitFor({ state: "visible" });
    await saveDialog.locator('input[type="text"]').fill("Sorted checkpoint");
    await saveDialog.getByRole("button", { name: "OK" }).click();
    await expect(page.getByText("Project saved successfully!")).toBeVisible();

    // Page to the last (partial) page before reverting.
    await page.getByRole("button", { name: "Last page" }).click();

    const pageInput = page.getByRole("spinbutton", { name: "Current page" });
    await expect(pageInput).toHaveValue("2");
    await expect(table.locator("tbody tr")).toHaveCount(12);
    // Ascending sort by id puts 51-62 on this page.
    await expect(table).toContainText("Row 62");
    await expect(table).not.toContainText("Row 1 ");

    // Revert while parked on page 2 of 2.
    await page.locator('[data-testid="toolbar-checkpoints"]').click();
    const panel = page.locator('[data-testid="checkpoints-panel"]');
    await panel.waitFor({ state: "visible" });
    await panel.getByRole("button", { name: "Revert" }).click();

    const confirmDialog = page.getByRole("dialog", { name: "Confirm" });
    await confirmDialog.waitFor({ state: "visible" });
    await confirmDialog.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Project reverted successfully!")).toBeVisible();

    // The Checkpoints tab hides the table; switch back to see it.
    await page.getByRole("tab", { name: "DataSet" }).click();

    // The checkpoint's row count (62) and sort order are unchanged, so page 2
    // of 50 is still valid. The bug this test guards against returned every
    // row with no pagination fields, which would render all 62 here instead
    // of this page's 12, while the pager kept claiming "Page 2 of 2".
    await expect(table.locator("tbody tr")).toHaveCount(12);
    await expect(pageInput).toHaveValue("2");
    await expect(page.getByText("of 2")).toBeVisible();
    await expect(table).toContainText("Row 62");
    await expect(table).not.toContainText("Row 1 ");
  });
});
