// @ts-check
import { test as base, expect } from "@playwright/test";

const test = base;
test.use({ storageState: { cookies: [], origins: [] } });

// Constants
const VALID_EMAIL = "testuser@example.com";
const VALID_TOKEN = "valid-reset-token-abc123";
const VALID_PASSWORD = "NewPassword1!";
const SHORT_PASSWORD = "abc";
const MISMATCH_PASSWORD = "DifferentPass1!";

// Helpers
/**
 * Navigate to /forgot-password and wait for the form to render.
 * @param {import("playwright-core").Page} page
 */
async function goToForgotPassword(page) {
  await page.goto("/forgot-password", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Forgot password" }),
  ).toBeVisible();
}

/**
 * Navigate to /reset-password with a token query param and wait for the form.
 * @param {import("playwright-core").Page} page
 */
async function goToResetPassword(page, token = VALID_TOKEN) {
  await page.goto(`/reset-password?token=${token}`, {
    waitUntil: "networkidle",
  });
  await expect(
    page.getByRole("heading", { name: "Reset password" }),
  ).toBeVisible();
}

/**
 * Click a button that may re-render during a React state update.
 * Avoids "element detached from DOM" flakes caused by React re-renders.
 * @param {import("playwright-core").Locator} locator
 */
async function stableClick(locator) {
  await locator.waitFor({ state: "visible" });
  await locator.click();
}

/**
 * Intercept all auth requests and stall until unblock() is called.
 * Uses a Promise to safely cross the Playwright callback boundary —
 * assigning to a `let` from inside a route handler is unreliable.
 * @param {import("playwright-core").Page} page
 * @param {{ status: number; contentType: string; body: string; }} finalResponse
 */
async function interceptAndStall(page, finalResponse) {
  let unblock;
  const gate = new Promise((resolve) => {
    unblock = resolve;
  });

  await page.route(
    "**/auth/**",
    async (/** @type {{ fulfill: (arg0: any) => any; }} */ route) => {
      await gate;
      await route.fulfill(finalResponse);
    },
  );

  return { unblock };
}

// Forgot Password Page
test.describe("ForgotPassword page", () => {
  test.beforeEach(async ({ page }) => {
    await goToForgotPassword(page);
  });

  // Rendering
  test("renders branding, heading, description and form", async ({ page }) => {
    await expect(page.getByText("DataLoom", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Forgot password" }),
    ).toBeVisible();
    await expect(
      page.getByText("Enter your email and we'll send you a reset link."),
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send reset link" }),
    ).toBeVisible();
  });

  test("renders Back to sign in link", async ({ page }) => {
    const link = page.getByRole("link", { name: "Back to sign in" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /signin/);
  });

  // HTML5 required validation
  test("submitting with empty email does not call the API", async ({
    page,
  }) => {
    /**
     * @type {any[]}
     */
    const requests = [];
    page.on("request", (req) => {
      if (req.url().includes("/auth/forgot-password")) {
        requests.push(req.url());
      }
    });

    await stableClick(page.getByRole("button", { name: "Send reset link" }));
    await page.waitForTimeout(300);
    expect(requests).toHaveLength(0);
  });

  // In-flight button state
  test("button is disabled and shows 'Sending…' while request is in flight", async ({
    page,
  }) => {
    const { unblock } = await interceptAndStall(page, {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "Reset email sent" }),
    });

    await page.getByLabel("Email").fill(VALID_EMAIL);
    await stableClick(page.getByRole("button", { name: "Send reset link" }));

    await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled();

    // @ts-ignore
    unblock();
  });

  // Success state
  test("shows confirmation screen after successful submission", async ({
    page,
  }) => {
    await page.route("**/auth/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Reset email sent" }),
      }),
    );

    await page.getByLabel("Email").fill(VALID_EMAIL);
    await stableClick(page.getByRole("button", { name: "Send reset link" }));

    await expect(
      page.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "If that email exists, we've sent a password reset link. Check your inbox.",
      ),
    ).toBeVisible();
  });

  test("confirmation screen hides the form and shows Back to sign in", async ({
    page,
  }) => {
    await page.route("**/auth/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Reset email sent" }),
      }),
    );

    await page.getByLabel("Email").fill(VALID_EMAIL);
    await stableClick(page.getByRole("button", { name: "Send reset link" }));

    await expect(
      page.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();
    // Form should no longer be present
    await expect(page.getByLabel("Email")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send reset link" }),
    ).not.toBeVisible();
    // Navigation back to sign in should be available
    const link = page.getByRole("link", { name: "Back to sign in" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /signin/);
  });

  // Error state
  test("shows error message when API call fails", async ({ page }) => {
    await page.route("**/auth/**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Internal server error" }),
      }),
    );

    await page.getByLabel("Email").fill(VALID_EMAIL);
    await stableClick(page.getByRole("button", { name: "Send reset link" }));

    await expect(
      page.getByText("Something went wrong. Please try again."),
    ).toBeVisible();
  });

  test("stays on the form (not confirmation) after an error", async ({
    page,
  }) => {
    await page.route("**/auth/**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Internal server error" }),
      }),
    );

    await page.getByLabel("Email").fill(VALID_EMAIL);
    await stableClick(page.getByRole("button", { name: "Send reset link" }));

    // Should still show the form, not the confirmation heading
    await expect(
      page.getByRole("heading", { name: "Check your email" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send reset link" }),
    ).toBeVisible();
  });

  test("clears error and allows resubmit after a failed attempt", async ({
    page,
  }) => {
    // First call fails
    await page.route("**/auth/**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Internal server error" }),
      }),
    );

    await page.getByLabel("Email").fill(VALID_EMAIL);
    await stableClick(page.getByRole("button", { name: "Send reset link" }));
    await expect(
      page.getByText("Something went wrong. Please try again."),
    ).toBeVisible();

    // Unregister the failing route and register a successful one
    await page.unroute("**/auth/**");
    await page.route("**/auth/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Reset email sent" }),
      }),
    );

    await stableClick(page.getByRole("button", { name: "Send reset link" }));

    // Error should be gone, confirmation should appear
    await expect(
      page.getByText("Something went wrong. Please try again."),
    ).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();
  });

  // Already authenticated
  test("authenticated user is redirected away from /forgot-password", async ({
    page,
  }) => {
    await page.route("**/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "user-1",
          email: "[test@example.com](mailto:test@example.com)",
        }),
      }),
    );

    await page.goto("/forgot-password", { waitUntil: "networkidle" });

    await expect(page).not.toHaveURL(/forgot-password/);
  });
});

// Reset Password Page
test.describe("ResetPassword page", () => {
  test.beforeEach(async ({ page }) => {
    await goToResetPassword(page);
  });

  // Rendering
  test("renders branding, heading, description and form", async ({ page }) => {
    await expect(page.getByText("DataLoom", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Reset password" }),
    ).toBeVisible();
    await expect(
      page.getByText("Enter your new password below."),
    ).toBeVisible();
    await expect(page.getByLabel("New password")).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reset password" }),
    ).toBeVisible();
  });

  test("renders Back to sign in link", async ({ page }) => {
    const link = page.getByRole("link", { name: "Back to sign in" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /signin/);
  });

  // Password visibility toggle
  test("both password fields are hidden by default", async ({ page }) => {
    await expect(page.getByLabel("New password")).toHaveAttribute(
      "type",
      "password",
    );
    await expect(page.getByLabel("Confirm password")).toHaveAttribute(
      "type",
      "password",
    );
  });

  test("Show toggle reveals both fields; Hide toggle re-hides them", async ({
    page,
  }) => {
    // Both fields share the showPassword state, so toggling once affects both
    await stableClick(page.getByRole("button", { name: "Show" }));
    await expect(page.getByLabel("New password")).toHaveAttribute(
      "type",
      "text",
    );
    await expect(page.getByLabel("Confirm password")).toHaveAttribute(
      "type",
      "text",
    );

    await stableClick(page.getByRole("button", { name: "Hide" }));
    await expect(page.getByLabel("New password")).toHaveAttribute(
      "type",
      "password",
    );
    await expect(page.getByLabel("Confirm password")).toHaveAttribute(
      "type",
      "password",
    );
  });

  // Client-side validation
  test("shows error when passwords do not match", async ({ page }) => {
    await page.getByLabel("New password").fill(VALID_PASSWORD);
    await page.getByLabel("Confirm password").fill(MISMATCH_PASSWORD);
    await stableClick(page.getByRole("button", { name: "Reset password" }));

    await expect(page.getByText("Passwords do not match")).toBeVisible();
  });

  test("shows error when password is too short (< 8 chars)", async ({
    page,
  }) => {
    await page.getByLabel("New password").fill(SHORT_PASSWORD);
    await page.getByLabel("Confirm password").fill(SHORT_PASSWORD);
    await stableClick(page.getByRole("button", { name: "Reset password" }));

    await expect(
      page.getByText("Password must be at least 8 characters"),
    ).toBeVisible();
  });

  test("mismatch is checked before length — mismatch error takes priority", async ({
    page,
  }) => {
    // Both are short AND mismatching — mismatch runs first in handleSubmit
    await page.getByLabel("New password").fill("abc");
    await page.getByLabel("Confirm password").fill("xyz");
    await stableClick(page.getByRole("button", { name: "Reset password" }));

    await expect(page.getByText("Passwords do not match")).toBeVisible();
    await expect(
      page.getByText("Password must be at least 8 characters"),
    ).not.toBeVisible();
  });

  test("does not call API when passwords do not match", async ({ page }) => {
    /**
     * @type {any[]}
     */
    const requests = [];
    page.on("request", (req) => {
      if (req.url().includes("/auth/reset-password")) {
        requests.push(req.url());
      }
    });

    await page.getByLabel("New password").fill(VALID_PASSWORD);
    await page.getByLabel("Confirm password").fill(MISMATCH_PASSWORD);
    await stableClick(page.getByRole("button", { name: "Reset password" }));

    await page.waitForTimeout(300);
    expect(requests).toHaveLength(0);
  });

  test("does not call API when password is too short", async ({ page }) => {
    /**
     * @type {any[]}
     */
    const requests = [];
    page.on("request", (req) => {
      if (req.url().includes("/auth/reset-password")) {
        requests.push(req.url());
      }
    });

    await page.getByLabel("New password").fill(SHORT_PASSWORD);
    await page.getByLabel("Confirm password").fill(SHORT_PASSWORD);
    await stableClick(page.getByRole("button", { name: "Reset password" }));

    await page.waitForTimeout(300);
    expect(requests).toHaveLength(0);
  });

  // Missing token
  test("shows error immediately when token is missing from the URL", async ({
    page,
  }) => {
    // Navigate without a token param — no beforeEach here so we go directly
    await page.goto("/reset-password", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "Reset password" }),
    ).toBeVisible();

    await page.getByLabel("New password").fill(VALID_PASSWORD);
    await page.getByLabel("Confirm password").fill(VALID_PASSWORD);
    await stableClick(page.getByRole("button", { name: "Reset password" }));

    await expect(
      page.getByText("Invalid reset link — please request a new one"),
    ).toBeVisible();
  });

  test("does not call API when token is missing", async ({ page }) => {
    /**
     * @type {any[]}
     */
    const requests = [];
    page.on("request", (req) => {
      if (req.url().includes("/auth/reset-password")) {
        requests.push(req.url());
      }
    });

    await page.goto("/reset-password", { waitUntil: "networkidle" });
    await page.getByLabel("New password").fill(VALID_PASSWORD);
    await page.getByLabel("Confirm password").fill(VALID_PASSWORD);
    await stableClick(page.getByRole("button", { name: "Reset password" }));

    await page.waitForTimeout(300);
    expect(requests).toHaveLength(0);
  });

  // In-flight button state
  test("button is disabled and shows 'Resetting…' while request is in flight", async ({
    page,
  }) => {
    const { unblock } = await interceptAndStall(page, {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "Password reset successful" }),
    });

    await page.getByLabel("New password").fill(VALID_PASSWORD);
    await page.getByLabel("Confirm password").fill(VALID_PASSWORD);
    await stableClick(page.getByRole("button", { name: "Reset password" }));

    await expect(
      page.getByRole("button", { name: "Resetting…" }),
    ).toBeDisabled();

    // @ts-ignore
    unblock();
  });

  // Successful reset
  test("redirects to /signin?reset=success on successful reset", async ({
    page,
  }) => {
    await page.route("**/auth/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Password reset successful" }),
      }),
    );

    await page.getByLabel("New password").fill(VALID_PASSWORD);
    await page.getByLabel("Confirm password").fill(VALID_PASSWORD);
    await stableClick(page.getByRole("button", { name: "Reset password" }));

    await expect(page).toHaveURL(/signin\?reset=success/, { timeout: 15_000 });
  });

  // API error
  test("shows error message when reset link is invalid or expired (API error)", async ({
    page,
  }) => {
    await page.route("**/auth/**", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Token expired" }),
      }),
    );

    await page.getByLabel("New password").fill(VALID_PASSWORD);
    await page.getByLabel("Confirm password").fill(VALID_PASSWORD);
    await stableClick(page.getByRole("button", { name: "Reset password" }));

    await expect(
      page.getByText(
        "Invalid or expired reset link. Please request a new one.",
      ),
    ).toBeVisible();
  });

  test("stays on the reset page after an API error", async ({ page }) => {
    await page.route("**/auth/**", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Token expired" }),
      }),
    );

    await page.getByLabel("New password").fill(VALID_PASSWORD);
    await page.getByLabel("Confirm password").fill(VALID_PASSWORD);
    await stableClick(page.getByRole("button", { name: "Reset password" }));

    await expect(page).toHaveURL(/reset-password/);
    await expect(
      page.getByRole("button", { name: "Reset password" }),
    ).toBeVisible();
  });

  test("clears previous validation error when a new submission starts", async ({
    page,
  }) => {
    // First trigger a mismatch error
    await page.getByLabel("New password").fill(VALID_PASSWORD);
    await page.getByLabel("Confirm password").fill(MISMATCH_PASSWORD);
    await stableClick(page.getByRole("button", { name: "Reset password" }));
    await expect(page.getByText("Passwords do not match")).toBeVisible();

    // Fix the confirm field and mock a successful API call
    await page.route("**/auth/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Password reset successful" }),
      }),
    );

    await page.getByLabel("Confirm password").fill(VALID_PASSWORD);
    await stableClick(page.getByRole("button", { name: "Reset password" }));

    // Error should be cleared before the API call is made (setError("") runs first)
    await expect(page.getByText("Passwords do not match")).not.toBeVisible();
    await expect(page).toHaveURL(/signin\?reset=success/, { timeout: 15_000 });
  });

  // Already authenticated
  test("authenticated user is redirected away from /reset-password", async ({
    page,
  }) => {
    await page.route("**/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "user-1",
          email: "[test@example.com](mailto:test@example.com)",
        }),
      }),
    );

    await page.goto(`/reset-password?token=${VALID_TOKEN}`, {
      waitUntil: "networkidle",
    });

    await expect(page).not.toHaveURL(/reset-password/);
  });
});
