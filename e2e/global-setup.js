/**
 * Playwright global setup — verifies backend and frontend are healthy
 * before running any tests. Retries with backoff.
 */
async function globalSetup() {
  const endpoints = [
    { name: "Backend", url: "http://localhost:4200/docs" },
    { name: "Frontend", url: "http://localhost:3200" },
  ];

  for (const { name, url } of endpoints) {
    let lastError;
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        const response = await fetch(url);
        if (response.ok) break;
        lastError = new Error(`${name} returned ${response.status}`);
      } catch (err) {
        lastError = err;
      }
      if (attempt === 10) {
        throw new Error(`${name} health check failed after 10 attempts: ${lastError.message}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

export default globalSetup;
