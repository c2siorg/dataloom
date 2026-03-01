import { test, expect } from "@playwright/test";
import { createProject, deleteProjectApi } from "./helpers.js";

test.describe("Project CRUD", () => {
  let projectId;

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await deleteProjectApi(request, projectId);
      projectId = null;
    }
  });

  test("create a project via CSV upload and land on workspace", async ({ page }) => {
    projectId = await createProject(page, "CRUD Test Project");

    expect(page.url()).toContain("/workspace/");

    const table = page.locator('[data-testid="data-table"]');
    await expect(table).toBeVisible();
    await expect(table.locator("thead")).toContainText("name");
    await expect(table.locator("thead")).toContainText("age");
    await expect(table.locator("thead")).toContainText("city");
    await expect(table.locator("thead")).toContainText("score");
    await expect(table.locator("tbody tr")).toHaveCount(5);
  });

  test("project appears on the homescreen after creation", async ({ page }) => {
    projectId = await createProject(page, "Homescreen Visible");

    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Homescreen Visible")).toBeVisible();
  });

  test("delete a project from the homescreen", async ({ page }) => {
    projectId = await createProject(page, "Delete Me Project");

    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const projectCard = page.locator('[data-testid="project-card"]', {
      hasText: "Delete Me Project",
    });
    await projectCard.locator('[aria-label="Delete project"]').click();

    const dialog = page.getByRole("dialog", { name: "Confirm" });
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByText("Project deleted successfully")).toBeVisible();
    await expect(page.getByText("Delete Me Project")).not.toBeVisible();

    projectId = null;
  });
});
