import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_CSV = path.join(__dirname, "fixtures", "sample.csv");
const API_BASE = "http://localhost:4200";

/**
 * Create a project via the Homescreen UI.
 * Navigates to /projects, fills the new project modal, and submits.
 * Waits until the workspace page loads with the data table visible.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} projectName
 * @param {string} [description="E2E test project"]
 * @returns {Promise<string>} The project ID extracted from the URL
 */
export async function createProject(page, projectName, description = "E2E test project") {
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");

  // Open the new project modal
  await page.locator('[data-testid="new-project-card"]').click();

  // Fill in project details
  await page.locator('[data-testid="project-name-input"]').fill(projectName);
  await page.locator('[data-testid="file-input"]').setInputFiles(SAMPLE_CSV);
  await page.locator('[data-testid="project-description-input"]').fill(description);

  // Submit and wait for workspace to load
  await page.locator('[data-testid="submit-project"]').click();
  await page.waitForURL(/\/workspace\//, { timeout: 20_000 });
  await page.locator('[data-testid="data-table"]').waitFor({ state: "visible", timeout: 15_000 });

  // Extract project ID from URL
  const url = page.url();
  return url.split("/workspace/")[1];
}

/**
 * Delete a project via the API for clean test teardown.
 * Silently ignores errors (project may already be deleted by the test).
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} projectId
 */
export async function deleteProjectApi(request, projectId) {
  try {
    await request.delete(`${API_BASE}/projects/${projectId}`, { timeout: 10_000 });
  } catch {
    // Ignore — project may already be deleted by the test
  }
}
