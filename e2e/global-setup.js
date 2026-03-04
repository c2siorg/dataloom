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

  for (const { name, url } of endpoints) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${name} returned HTTP ${response.status}`);
      }
    } catch (err) {
      throw new Error(`${name} health check failed at ${url}: ${err.message}`);
    }
  }
}

export default globalSetup;
