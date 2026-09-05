import { test as base, expect } from "@playwright/test";
import { createProject, deleteProjectApi } from "./helpers.js";

/**
 * Custom Playwright fixture that automatically creates a project
 * before each test and cleans it up after.
 *
 * Usage in test files:
 *   import { test, expect } from "./fixtures.js";
 *   test("my test", async ({ page, projectId }) => { ... });
 *
 * A spec that needs a differently-shaped dataset (e.g. enough rows to span
 * several pages) can override the CSV without duplicating the create/cleanup
 * logic:
 *   test.use({ projectCsv: path.join(__dirname, "fixtures", "big.csv") });
 */
export const test = base.extend({
  // Option fixture — undefined lets createProject() fall back to its own
  // default (the 5-row sample.csv every other spec relies on).
  projectCsv: [undefined, { option: true }],

  projectId: async ({ page, request, projectCsv }, use, testInfo) => {
    const name = `E2E ${testInfo.title.slice(0, 30)} ${Date.now()}`;
    let id;

    try {
      id = await createProject(page, name, undefined, projectCsv);

      // Log project ID for easier debugging in CI
      testInfo.annotations.push({ type: "project-id", description: id });

      await use(id);
    } finally {
      // Cleanup — silently ignores if already deleted by the test.
      // Guard against setup failures before a project ID is available.
      if (id) {
        await deleteProjectApi(request, id);
      }
    }
  },
});

export { expect };
