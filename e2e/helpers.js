import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_CSV = path.join(__dirname, "fixtures", "sample.csv");
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4200";

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
export async function createProject(
  page,
  projectName,
  description = "E2E test project",
) {
  await page.goto("/projects");
  await page
    .locator('[data-testid="new-project-card"]')
    .waitFor({ state: "visible" });

  // Open the new project modal
  await page.locator('[data-testid="new-project-card"]').click();

  // Fill in project details
  await page.locator('[data-testid="project-name-input"]').fill(projectName);
  await page.locator('[data-testid="file-input"]').setInputFiles(SAMPLE_CSV);
  await page
    .locator('[data-testid="project-description-input"]')
    .fill(description);

  // Submit and wait for workspace to load
  await page.locator('[data-testid="submit-project"]').click();
  await page.waitForURL(/\/workspace\//, { timeout: 20_000 });
  await page
    .locator('[data-testid="data-table"]')
    .waitFor({ state: "visible", timeout: 15_000 });

  // Extract project ID from URL
  const url = new URL(page.url());
  const match = url.pathname.match(/\/workspace\/([^/]+)/);
  if (!match)
    throw new Error(`Could not extract project ID from URL: ${url.href}`);
  return match[1];
}

/**
 * Delete a project via the API for clean test teardown.
 * Ignores 404 (project already deleted by the test).
 * Logs and re-throws on other failures so CI issues are visible.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} projectId
 */
export async function deleteProjectApi(request, projectId) {
  const response = await request.delete(`${API_BASE}/projects/${projectId}`, {
    timeout: 10_000,
  });

  // Ignore "not found" — project may already be deleted by the test
  if (response.status() === 404) {
    return;
  }

  // For any other non-OK response, log details and throw so CI failures are diagnosable
  if (!response.ok()) {
    const body = await response.text().catch(() => "<unreadable>");
    const msg = `deleteProjectApi failed for ${projectId}: HTTP ${response.status()} — ${body}`;
    console.error(msg);
    throw new Error(msg);
  }
}
