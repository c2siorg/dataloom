import { test as base, expect } from "@playwright/test";

const test = base;

test.use({
  storageState: { cookies: [], origins: [] },
});

// Constants
const VALID_EMAIL = "testuser@example.com";
const VALID_PASSWORD = "Password123!";
const SHORT_PASSWORD = "abc";
const LONG_PASSWORD = "a".repeat(73);

// Shared mock responses
const SUCCESS_AUTH_HEADERS = {
  "Set-Cookie": "access_token=fake-jwt; Path=/; HttpOnly; SameSite=Lax",
};

const VALIDATION_422_RESPONSE = {
  status: 422,
  contentType: "application/json",
  body: JSON.stringify({
    detail: [{ msg: "field required", type: "missing" }],
  }),
};

// Helpers

/**
 * Navigate to a route and wait for the heading.
 * @param {import("playwright-core").Page} page
 * @param {string} route
 * @param {string} heading
 */
async function goToPage(page, route, heading) {
  await page.goto(route, { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

/**
 * Fill auth form.
 * @param {import("playwright-core").Page} page
 * @param {string} email
 * @param {string} password
 */
async function fillAuthForm(page, email, password) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
}

/**
 * Stable click helper.
 * @param {import("playwright-core").Locator} locator
 */
async function stableClick(locator) {
  await locator.waitFor({ state: "visible" });
  await locator.click();
}

/**
 * Track auth requests.
 * @param {import("playwright-core").Page} page
 */
function trackAuthRequests(page) {
  const requests = [];

  page.on("request", (req) => {
    if (req.url().includes("/auth")) {
      requests.push(req.url());
    }
  });

  return requests;
}

/**
 * Mock auth response.
 * @param {import("playwright-core").Page} page
 * @param {object} response
 */
async function mockAuthResponse(page, response) {
  await page.route("**/auth/**", (route) => route.fulfill(response));
}

/**
 * Mock successful auth.
 * @param {import("playwright-core").Page} page
 * @param {string} message
 */
async function mockSuccessfulAuth(page, message) {
  await mockAuthResponse(page, {
    status: 200,
    contentType: "application/json",
    headers: SUCCESS_AUTH_HEADERS,
    body: JSON.stringify({ message }),
  });
}

/**
 * Mock generic 422 validation response.
 * @param {import("playwright-core").Page} page
 */
async function mockValidation422(page) {
  await mockAuthResponse(page, VALIDATION_422_RESPONSE);
}

/**
 * Intercept and stall auth request.
 * @param {import("playwright-core").Page} page
 * @param {string} urlPattern
 * @param {object} finalResponse
 */
async function interceptAndStall(page, urlPattern, finalResponse) {
  let unblock;

  const gate = new Promise((resolve) => {
    unblock = resolve;
  });

  await page.route(urlPattern, async (route) => {
    await gate;
    await route.fulfill(finalResponse);
  });

  return { unblock };
}

/**
 * Shared password visibility tests.
 */
function passwordVisibilityTests() {
  test("password field is hidden by default", async ({ page }) => {
    await expect(page.getByLabel("Password")).toHaveAttribute(
      "type",
      "password",
    );
  });

  test("Show button reveals password; Hide button re-hides it", async ({
    page,
  }) => {
    const input = page.getByLabel("Password");

    await stableClick(page.getByRole("button", { name: "Show" }));

    await expect(input).toHaveAttribute("type", "text");

    await stableClick(page.getByRole("button", { name: "Hide" }));

    await expect(input).toHaveAttribute("type", "password");
  });
}

// Sign-In Page

test.describe("SignIn page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPage(page, "/signin", "Welcome back");
  });

  // Rendering

  test("renders branding, heading and form elements", async ({ page }) => {
    await expect(page.getByText("DataLoom", { exact: true })).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();

    await expect(page.getByText("Continue to your workspace.")).toBeVisible();

    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();

    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });

  test("renders Create account link pointing to signup route", async ({
    page,
  }) => {
    const link = page.getByRole("link", {
      name: "Create account",
    });

    await expect(link).toBeVisible();

    await expect(link).toHaveAttribute("href", /signup/);
  });

  passwordVisibilityTests();

  // HTML5 validation

  test("submitting empty form does not call the API", async ({ page }) => {
    const requests = trackAuthRequests(page);

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await page.waitForTimeout(300);

    expect(requests).toHaveLength(0);
  });

  test("submitting email only does not call the API", async ({ page }) => {
    const requests = trackAuthRequests(page);

    await page.getByLabel("Email").fill(VALID_EMAIL);

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await page.waitForTimeout(300);

    expect(requests).toHaveLength(0);
  });

  // Error handling

  test("shows error toast on invalid credentials (401)", async ({ page }) => {
    await mockAuthResponse(page, {
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "Invalid email or password.",
      }),
    });

    await fillAuthForm(page, "wrong@example.com", "wrongpassword");

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  });

  test("shows generic toast when API returns a non-string detail (FastAPI 422)", async ({
    page,
  }) => {
    await mockValidation422(page);

    await fillAuthForm(page, VALID_EMAIL, VALID_PASSWORD);

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await expect(
      page.getByText("Could not sign in. Please try again."),
    ).toBeVisible();
  });

  // Loading state

  test("button is disabled and shows 'Signing in…' while request is in flight", async ({
    page,
  }) => {
    const { unblock } = await interceptAndStall(page, "**/auth/**", {
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "Invalid email or password.",
      }),
    });

    await fillAuthForm(page, VALID_EMAIL, VALID_PASSWORD);

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await expect(
      page.getByRole("button", { name: "Signing in…" }),
    ).toBeDisabled();

    unblock();
  });

  // Redirects

  test("redirects away from /signin on successful sign-in", async ({
    page,
  }) => {
    await mockSuccessfulAuth(page, "Login successful");

    await fillAuthForm(page, VALID_EMAIL, VALID_PASSWORD);

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await expect(page).not.toHaveURL(/signin/, {
      timeout: 15_000,
    });
  });

  test("redirects to the ?next= param after successful sign-in", async ({
    page,
  }) => {
    await page.goto("/signin?next=%2Fprojects", {
      waitUntil: "networkidle",
    });

    await mockSuccessfulAuth(page, "Login successful");

    await fillAuthForm(page, VALID_EMAIL, VALID_PASSWORD);

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await expect(page).toHaveURL(/\/projects/, {
      timeout: 15_000,
    });
  });

  // Misc

  test("does not show the reset-success banner on a plain /signin visit", async ({
    page,
  }) => {
    await expect(
      page.getByText("Password reset successfully"),
    ).not.toBeVisible();
  });

  test("Create account link preserves the ?next param", async ({ page }) => {
    await page.goto("/signin?next=%2Fprojects", {
      waitUntil: "networkidle",
    });

    const link = page.getByRole("link", {
      name: "Create account",
    });

    await expect(link).toHaveAttribute("href", /signup\?next=%2Fprojects/);
  });
});

// Sign-Up Page

test.describe("SignUp page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPage(page, "/signup", "Create your account");
  });

  // Rendering

  test("renders branding, heading and form elements", async ({ page }) => {
    await expect(page.getByText("DataLoom", { exact: true })).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: "Create your account",
      }),
    ).toBeVisible();

    await expect(
      page.getByText("Start transforming your CSV data with DataLoom."),
    ).toBeVisible();

    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();

    await expect(page.getByText("At least 8 characters.")).toBeVisible();

    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });

  test("renders Sign in link pointing to signin route", async ({ page }) => {
    const link = page.getByRole("link", {
      name: "Sign in",
    });

    await expect(link).toBeVisible();

    await expect(link).toHaveAttribute("href", /signin/);
  });

  passwordVisibilityTests();

  // Password validation

  test("shows toast and does not call API when password is too short (< 8 chars)", async ({
    page,
  }) => {
    const requests = trackAuthRequests(page);

    await fillAuthForm(page, VALID_EMAIL, SHORT_PASSWORD);

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await expect(
      page.getByText("Password must be at least 8 characters."),
    ).toBeVisible();

    expect(requests).toHaveLength(0);
  });

  test("shows toast and does not call API when password exceeds 72 characters", async ({
    page,
  }) => {
    const requests = trackAuthRequests(page);

    await fillAuthForm(page, VALID_EMAIL, LONG_PASSWORD);

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await expect(
      page.getByText("Password is too long (max 72 characters)."),
    ).toBeVisible();

    expect(requests).toHaveLength(0);
  });

  test("accepts a password exactly 8 characters long (lower boundary)", async ({
    page,
  }) => {
    await mockSuccessfulAuth(page, "Signup successful");

    await fillAuthForm(page, VALID_EMAIL, "Abcdef1!");

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await expect(page).not.toHaveURL(/signup/, {
      timeout: 15_000,
    });
  });

  test("accepts a password exactly 72 characters long (upper boundary)", async ({
    page,
  }) => {
    await mockSuccessfulAuth(page, "Signup successful");

    await fillAuthForm(page, VALID_EMAIL, "a".repeat(72));

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await expect(page).not.toHaveURL(/signup/, {
      timeout: 15_000,
    });
  });

  // Error handling

  test("shows API error toast on duplicate email (400)", async ({ page }) => {
    await mockAuthResponse(page, {
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "An account with this email already exists.",
      }),
    });

    await fillAuthForm(page, VALID_EMAIL, VALID_PASSWORD);

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await expect(
      page.getByText("An account with this email already exists."),
    ).toBeVisible();
  });

  test("shows generic toast when API returns a non-string detail (FastAPI 422)", async ({
    page,
  }) => {
    await mockValidation422(page);

    await fillAuthForm(page, VALID_EMAIL, VALID_PASSWORD);

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await expect(
      page.getByText("Could not create your account. Please try again."),
    ).toBeVisible();
  });

  // Loading state

  test("button is disabled and shows 'Creating account…' while request is in flight", async ({
    page,
  }) => {
    const { unblock } = await interceptAndStall(page, "**/auth/**", {
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "An account with this email already exists.",
      }),
    });

    await fillAuthForm(page, VALID_EMAIL, VALID_PASSWORD);

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await expect(
      page.getByRole("button", {
        name: "Creating account…",
      }),
    ).toBeDisabled();

    unblock();
  });

  // Redirects

  test("redirects away from /signup on successful account creation", async ({
    page,
  }) => {
    await mockSuccessfulAuth(page, "Signup successful");

    await fillAuthForm(page, VALID_EMAIL, VALID_PASSWORD);

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await expect(page).not.toHaveURL(/signup/, {
      timeout: 15_000,
    });
  });

  test("redirects to the ?next= param after successful account creation", async ({
    page,
  }) => {
    await page.goto("/signup?next=%2Fprojects", {
      waitUntil: "networkidle",
    });

    await mockSuccessfulAuth(page, "Signup successful");

    await fillAuthForm(page, VALID_EMAIL, VALID_PASSWORD);

    await stableClick(page.getByRole("button", { name: "Continue" }));

    await expect(page).toHaveURL(/\/projects/, {
      timeout: 15_000,
    });
  });

  // Misc
  test("Sign in link preserves the ?next param", async ({ page }) => {
    await page.goto("/signup?next=%2Fprojects", {
      waitUntil: "networkidle",
    });

    const link = page.getByRole("link", {
      name: "Sign in",
    });

    await expect(link).toHaveAttribute("href", /signin\?next=%2Fprojects/);
  });
});
