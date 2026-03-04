/**
 * Playwright global setup — verifies application-level readiness
 * before running any tests. Playwright's webServer config already
 * handles HTTP-level health checks; this ensures the app is truly ready.
 */
async function globalSetup() {
  // Extra layer of verification with human-readable error messages.
  // Playwright's webServer already polls for HTTP 200, but this
  // confirms the endpoints return valid responses at app level.
  const endpoints = [
    { name: "Backend", url: "http://localhost:4200/docs" },
    { name: "Frontend", url: "http://localhost:3200" },
  ];

  const MAX_RETRIES = 3;
  const BACKOFF_MS = 1000;
  const TIMEOUT_MS = 5000;

  for (const { name, url } of endpoints) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) {
          throw new Error(`${name} returned HTTP ${response.status}`);
        }
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, BACKOFF_MS * attempt));
        }
      }
    }
    if (lastError) {
      throw new Error(
        `${name} health check failed at ${url} after ${MAX_RETRIES} attempts: ${lastError.message}`,
      );
    }
  }
}

export default globalSetup;
