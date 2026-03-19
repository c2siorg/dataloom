import { test, expect } from "./fixtures.js";

test.describe("Project CRUD", () => {
  test("create a project via CSV upload and land on workspace", async ({
    page,
    projectId,
  }) => {
    expect(page.url()).toContain("/workspace/");

    const table = page.locator('[data-testid="data-table"]');
    await expect(table).toBeVisible();
    await expect(table.locator("thead")).toContainText("name");
    await expect(table.locator("thead")).toContainText("age");
    await expect(table.locator("thead")).toContainText("city");
    await expect(table.locator("thead")).toContainText("score");
    await expect(table.locator("tbody tr")).toHaveCount(5);
  });

  test("project appears on the homescreen after creation", async ({
    page,
    projectId,
  }) => {
    await page.goto("/projects");
    await page
      .locator('[data-testid="project-card"]')
      .first()
      .waitFor({ state: "visible" });

    await expect(page.getByText(/E2E/).first()).toBeVisible();
  });

  test("delete a project from the homescreen", async ({ page, projectId }) => {
    await page.goto("/projects");
    await page
      .locator('[data-testid="project-card"]')
      .first()
      .waitFor({ state: "visible" });

    const projectCard = page.locator('[data-testid="project-card"]', {
      hasText: /E2E/,
    }).first();
    await projectCard.locator('[aria-label="Delete project"]').click();

    const dialog = page.getByRole("dialog", { name: "Confirm" });
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByText("Project deleted successfully")).toBeVisible();
  });
});
