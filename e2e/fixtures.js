import { test as base, expect } from "@playwright/test";
import { createProject, deleteProjectApi } from "./helpers.js";

/**
 * Custom Playwright fixture that automatically creates a project
 * before each test and cleans it up after.
 *
 * Usage in test files:
 *   import { test, expect } from "./fixtures.js";
 *   test("my test", async ({ page, projectId }) => { ... });
 */
export const test = base.extend({
  projectId: async ({ page, request }, use, testInfo) => {
    const name = `E2E ${testInfo.title.slice(0, 30)} ${Date.now()}`;
    const id = await createProject(page, name);

    await use(id);

    // Cleanup — silently ignores if already deleted by the test
    await deleteProjectApi(request, id);
  },
});

export { expect };
