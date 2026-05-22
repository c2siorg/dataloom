import { request } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE_PATH = path.join(__dirname, ".auth", "storage-state.json");

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4200";

/**
 * Sign up a fresh test user and persist the auth cookie to storage state.
 *
 * All tests then inherit this cookie via playwright.config.js's
 * `use.storageState`, so the browser context AND the per-test API
 * `request` fixture come pre-authenticated.
 *
 * A new email is minted per run (timestamp-based) so reruns against a
 * persistent DB don't 409 on an existing user.
 */
export default async function globalSetup() {
  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });

  const ctx = await request.newContext({ baseURL: API_BASE });
  // Pydantic's EmailStr (via email-validator) rejects RFC 2606 reserved TLDs
  // like .test / .example, so use a real `.com` to match the backend tests.
  const email = `e2e+${Date.now()}@dataloom-e2e.com`;
  const password = "e2e-test-password";

  const resp = await ctx.post("/auth/signup", { data: { email, password } });
  if (!resp.ok()) {
    const body = await resp.text().catch(() => "<unreadable>");
    throw new Error(
      `globalSetup: /auth/signup failed (${resp.status()}) — ${body}`,
    );
  }

  // The `access_token` cookie was set for domain=localhost, which the
  // browser sends to both :4200 (backend) and :3200 (frontend) since
  // cookie matching ignores port. Save the storage state as-is.
  await ctx.storageState({ path: STORAGE_STATE_PATH });
  await ctx.dispose();
}
