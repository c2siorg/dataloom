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
    await expect(page.getByTestId("workspace-tab-summary")).toBeVisible();
    await expect(table.getByTestId("column-profile-card").first()).toBeVisible();
  });

  test("project appears on the homescreen after creation", async ({
    page,
    projectId,
  }) => {
    await page.goto("/projects");
    const projectCard = page
      .locator('[data-testid="project-card"]', {
        hasText: /E2E/,
      })
      .first();
    await expect(projectCard).toBeVisible();
  });

  test("edit a project from the homescreen", async ({ page, projectId }) => {
    await page.goto("/projects");
    const projectCard = page.locator(
      `[data-testid="project-card"][data-project-id="${projectId}"]`,
    );
    await expect(projectCard).toBeVisible();

    await projectCard.locator('[data-testid="project-card-menu-button"]').click();
    await page.locator('[data-testid="edit-project-action"]').click();

    const editModal = page.locator('[data-testid="edit-project-modal"]');
    await expect(editModal).toBeVisible();

    const nameInput = page.locator('[data-testid="edit-project-name-input"]');
    await nameInput.fill("Updated E2E Project Name");

    await page.locator('[data-testid="save-edit-project"]').click();

    await expect(page.getByText("Project updated successfully")).toBeVisible();
    await expect(page.getByText("Updated E2E Project Name")).toBeVisible();
  });

  test("delete a project from the homescreen", async ({ page, projectId }) => {
    await page.goto("/projects");
    const projectCard = page.locator(
      `[data-testid="project-card"][data-project-id="${projectId}"]`,
    );
    await expect(projectCard).toBeVisible();

    await projectCard.locator('[data-testid="project-card-menu-button"]').click();
    await page.locator('[data-testid="delete-project-action"]').click();

    const dialog = page.getByRole("dialog", { name: "Confirm" });
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByText("Project deleted successfully")).toBeVisible();
    await expect(projectCard).toHaveCount(0);
  });
});
